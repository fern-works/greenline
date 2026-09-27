import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { isRepositoryPath } from "../commons/repository-path.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  type ContractParseFailed,
  type InvalidField,
} from "../core/contract.ts";
import type { LedgerEntry } from "../core/ledger.ts";

/**
 * The digest registry (workshop/components/ledger.md, "The code"; the
 * ruling D6): one row per research digest and rulings file, live in the
 * tree with the id and the pin its header block states, or held in git at
 * the commit the archive names and pinned by the blob's digest. A native
 * entry's digest origin names a row by id and pin, and the `ledger` row
 * resolves it; the rows the prefix's unit sources named stay as the prefix
 * left them.
 */
/** The registry's path under the corpus root. */
const REGISTRY = "ledger/digests.json";
/** The research notes' directory under the repository root; every Markdown file under it but the index is a note. */
const RESEARCH = "docs/research";
/** The header block's four fields, each owed by a live note. */
const HEADER_FIELDS = ["id", "identity", "pin", "posture"] as const;

/** One registry row: a digest or a rulings file, live (`at` null) or in history, pinned. */
export interface DigestRow {
  readonly id: string;
  readonly kind: "digest" | "ruling";
  readonly path: string;
  readonly at: string | null;
  readonly pin: string;
}

/** The registry as read: the history commit and the rows. */
export interface DigestRegistry {
  readonly history: string;
  readonly rows: readonly DigestRow[];
}

const commit = z.string().regex(/^[0-9a-f]{7,40}$/);
const row = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["digest", "ruling"]),
    path: z
      .string()
      .min(1)
      .refine(isRepositoryPath, "a relative repository path without traversal"),
    at: commit.nullable(),
    pin: z.string().min(1),
  })
  .strict();
const registrySchema = z
  .object({ schemaVersion: z.literal(1), history: commit, rows: z.array(row) })
  .strict();

/** The registry, or the failure to read or parse it: every path is a refined repository path. */
export function readDigestRegistry(
  corpusRoot: string,
): Result<DigestRegistry, ContractParseFailed> {
  const path = join(corpusRoot, REGISTRY);
  try {
    const parsed = registrySchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success)
      return contractFailure(
        path,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    return contractOk({ history: parsed.data.history, rows: parsed.data.rows });
  } catch (cause) {
    return contractFailure(path, [
      { path: "", message: `the digest registry could not be read: ${String(cause)}` },
    ]);
  }
}

/** Every live research note as a repository path: the Markdown files under the research directory but the index. */
export function liveNotes(repositoryRoot: string): readonly string[] {
  const notes: string[] = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, item.name);
      if (item.isDirectory()) walk(path);
      else if (item.name.endsWith(".md") && item.name !== "README.md")
        notes.push(relative(repositoryRoot, path).split(sep).join("/"));
    }
  };
  walk(join(repositoryRoot, RESEARCH));
  return notes;
}

/** A field of a digest's header block, or undefined when the block or the field is absent. */
export function headerField(text: string, field: string): string | undefined {
  const block = /^---\n([\s\S]*?)\n---/.exec(text);
  if (block === null) return undefined;
  const line = new RegExp(`^${field}: (.+)$`, "m").exec(block[1] ?? "");
  return line?.[1]?.trim();
}

/** The header block's id, the name a ref resolves to. */
export const headerId = (text: string): string | undefined => headerField(text, "id");

/** A live note's header against its row: the four fields present, the id and the pin the row's. */
function headerIssues(path: string, text: string, expected: DigestRow): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  for (const field of HEADER_FIELDS)
    if (headerField(text, field) === undefined)
      issues.push({ path, message: `the header block carries no ${field}` });
  if (headerId(text) !== expected.id)
    issues.push({ path, message: `the digest's header names no id ${expected.id}` });
  if (headerField(text, "pin") !== expected.pin)
    issues.push({ path, message: "the digest's header pin differs from the registry" });
  return issues;
}

/** Every live row's file stands at its path, readable, with the header its row names; every live note has its row. */
export function liveIssues(
  repositoryRoot: string,
  rows: readonly DigestRow[],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  const byPath = new Map(rows.filter((item) => item.at === null).map((item) => [item.path, item]));
  for (const note of liveNotes(repositoryRoot))
    if (!byPath.has(note))
      issues.push({ path: note, message: "the live note has no registry row" });
  for (const [path, item] of byPath) {
    let text: string;
    try {
      text = readFileSync(join(repositoryRoot, path), "utf8");
    } catch (cause) {
      issues.push({
        path,
        message: `the live digest ${item.id} could not be read: ${String(cause)}`,
      });
      continue;
    }
    issues.push(...headerIssues(path, text, item));
  }
  return issues;
}

/** Every historical row's blob at its commit has the row's digest; a missing blob or another digest is refused. */
export function historicalIssues(
  repositoryRoot: string,
  rows: readonly DigestRow[],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  for (const item of rows) {
    if (item.at === null) continue;
    let blob: Buffer;
    try {
      blob = execFileSync("git", ["show", `${item.at}:${item.path}`], {
        cwd: repositoryRoot,
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      issues.push({ path: item.path, message: `no blob at ${item.at} for the row ${item.id}` });
      continue;
    }
    if (sha256Hex(blob) !== item.pin)
      issues.push({
        path: item.path,
        message: `the blob at ${item.at} has another digest than the row ${item.id}`,
      });
  }
  return issues;
}

/** Every version-3 native or unit change with a digest origin names a registry row by its id, at that row's pin. */
export function originIssues(
  chain: readonly LedgerEntry[],
  rows: readonly DigestRow[],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  const digests = new Map(
    rows.filter((item) => item.kind === "digest").map((item) => [item.id, item]),
  );
  for (const entry of chain) {
    if (entry.version !== 3) continue;
    const raw = entry.raw;
    if (raw.kind !== "native" && raw.kind !== "unit") continue;
    for (const change of raw.changes) {
      if (!("digest" in change.origin)) continue;
      const known = digests.get(change.origin.digest);
      if (known === undefined)
        issues.push({
          path: entry.id,
          message: `the origin names no digest ${change.origin.digest} in the registry`,
        });
      else if (known.pin !== change.origin.pin)
        issues.push({
          path: entry.id,
          message: `the origin's pin differs from the registry's for ${change.origin.digest}`,
        });
    }
  }
  return issues;
}

/**
 * The digests' audit: the registry parses; every live note has its row and
 * its header; every historical row's blob has its digest.
 */
export function digestIssues(repositoryRoot: string, corpusRoot: string): readonly InvalidField[] {
  const registry = readDigestRegistry(corpusRoot);
  if (registry._tag === "err") return registry.error.issues;
  return [
    ...liveIssues(repositoryRoot, registry.value.rows),
    ...historicalIssues(repositoryRoot, registry.value.rows),
  ];
}
