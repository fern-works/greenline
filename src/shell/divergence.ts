import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../commons/hash.ts";
import { err, ok, type Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  type ContractParseFailed,
  type InvalidField,
} from "../core/contract.ts";
import { isVendored } from "../core/corpus.ts";
import { hunksBetween, splitLines, type TextHunk } from "../core/diff.ts";
import type { DivergenceSource } from "../core/divergence.ts";
import { GENERATED_PROVENANCE_PAGE, loadCorpusManifest } from "./corpus.ts";
import { listFilesRecursive } from "./fs/walk.ts";

/**
 * The frozen authority witnesses, under the corpus root: an entry's
 * `authority.path` is read there, at the recorded path, and never at the
 * live path. An entry is hashed whole into its successor, so the path
 * inside it never changes; the file is frozen here when the entry is
 * written (the workshop's ruling of 2026-09-14).
 */
export const WITNESSES = "ledger/witnesses";

/** The frozen witness could not be read at its path under the witness tree; `cause` is the filesystem error. */
class AuthorityWitnessReadFailed extends Error {
  readonly _tag = "AuthorityWitnessReadFailed" as const;
  readonly recorded: string;
  readonly path: string;
  constructor(recorded: string, path: string, cause: unknown) {
    super(`authority witness '${recorded}' could not be read at '${path}': ${String(cause)}`, {
      cause,
    });
    this.recorded = recorded;
    this.path = path;
  }
}

/** The bytes of one authority witness, read under the witness tree at its recorded path. */
export function readAuthorityWitness(
  corpusRoot: string,
  recorded: string,
): Result<Buffer, AuthorityWitnessReadFailed> {
  const path = join(corpusRoot, WITNESSES, recorded);
  try {
    return ok(readFileSync(path));
  } catch (cause) {
    return err(new AuthorityWitnessReadFailed(recorded, path, cause));
  }
}

/** A record's identity and the changes whose authority is witnessed; a full record satisfies it. */
export interface WitnessedRecord {
  readonly id: string;
  readonly changes: readonly {
    readonly skill: string;
    readonly authority?: { readonly path: string; readonly revision: string } | undefined;
  }[];
}

/**
 * The witness verification: every change with an authority has its witness
 * frozen at the recorded path with the recorded digest. An unreadable
 * witness names its cause; a changed one names the record.
 */
export function authorityWitnessIssues(
  corpusRoot: string,
  records: readonly WitnessedRecord[],
): InvalidField[] {
  const issues: InvalidField[] = [];
  for (const record of records)
    for (const change of record.changes) {
      const authority = change.authority;
      if (authority === undefined) continue;
      const witness = readAuthorityWitness(corpusRoot, authority.path);
      if (witness._tag === "err")
        issues.push({
          path: change.skill,
          message: `${record.id}: authority witness is unavailable: ${witness.error.message}`,
        });
      else if (sha256Hex(witness.value) !== authority.revision)
        issues.push({ path: change.skill, message: `${record.id}: authority witness changed` });
    }
  return issues;
}

/** One vendored skill measured against its frozen upstream tree. */
export interface MeasuredSkill {
  readonly skill: string;
  readonly record: { readonly id: string; readonly revision: string } | undefined;
  readonly source: DivergenceSource;
  /** The family's licence as the manifest states it; a version-3 copy entry repeats it. */
  readonly license: "MIT";
  readonly result: string;
  readonly hunks: readonly TextHunk[];
  readonly upstreamLines: number;
}

interface TextTree {
  readonly files: ReadonlyMap<string, string>;
  readonly revision: string;
}

function readTree(root: string, skip: ReadonlySet<string>): TextTree {
  const files = new Map<string, string>();
  const digests: { readonly path: string; readonly revision: string }[] = [];
  for (const path of [...listFilesRecursive(root)].sort()) {
    if (skip.has(path)) continue;
    const bytes = readFileSync(join(root, path));
    files.set(path, new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
    digests.push({ path, revision: sha256Hex(bytes) });
  }
  return { files, revision: sha256Hex(JSON.stringify(digests)) };
}

const NO_SKIP: ReadonlySet<string> = new Set();
const COPY_SKIP: ReadonlySet<string> = new Set([GENERATED_PROVENANCE_PAGE]);

/** Measure every vendored copy: source tree, result tree and the hunks between them. */
export function measureDivergence(
  corpusRoot: string,
): Result<readonly MeasuredSkill[], ContractParseFailed> {
  const manifest = loadCorpusManifest(corpusRoot);
  if (manifest._tag === "err")
    return contractFailure(corpusRoot, [{ path: "manifest", message: manifest.error.message }]);
  const result: MeasuredSkill[] = [];
  for (const entry of manifest.value.skills) {
    if (!isVendored(entry)) continue;
    const family = manifest.value.upstreams.find(
      (candidate) => candidate.name === entry.upstream.family,
    );
    if (family === undefined)
      return contractFailure(corpusRoot, [{ path: entry.name, message: "family is not pinned" }]);
    let source: TextTree;
    let copy: TextTree;
    try {
      source = readTree(join(corpusRoot, family.snapshot, entry.upstream.name), NO_SKIP);
      copy = readTree(join(corpusRoot, "skills", entry.name), COPY_SKIP);
    } catch (cause) {
      return contractFailure(corpusRoot, [
        { path: entry.name, message: `could not read the trees: ${String(cause)}` },
      ]);
    }
    const paths = [...new Set([...source.files.keys(), ...copy.files.keys()])].sort();
    const hunks = paths.flatMap((path) =>
      hunksBetween(path, source.files.get(path), copy.files.get(path)),
    );
    const upstreamLines = [...source.files.values()].reduce(
      (sum, content) => sum + splitLines(content).length,
      0,
    );
    result.push({
      skill: entry.name,
      record: entry.ledger,
      source: {
        repo: family.repo,
        commit: family.commit,
        path: entry.upstream.path,
        revision: source.revision,
      },
      license: family.license,
      result: copy.revision,
      hunks,
      upstreamLines,
    });
  }
  return contractOk(result);
}
