import { readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "../commons/result.ts";
import { listFilesRecursive } from "./fs/walk.ts";
import { parseArtifact } from "../core/artifact.ts";
import type { InvalidField } from "../core/contract.ts";
import type { AuditedArtifact } from "../core/artifact-audit.ts";

/**
 * The work-tree collector (`docs/SPEC.md` §7): walks
 * `.greenline/work/`, reads every file, and hands each to the core
 * parser. Parse and placement failures are collected per file — the
 * tree is scanned fully even when some files are bad, so one run
 * reports every fixable issue. All I/O lives here in the shell.
 */

/** A file that could not become an artifact, with its actionable issues. */
export interface ArtifactFileFailure {
  readonly path: string;
  readonly issues: readonly InvalidField[];
}

export interface CollectedArtifacts {
  readonly parsed: readonly AuditedArtifact[];
  readonly failures: readonly ArtifactFileFailure[];
}

class ArtifactScanFailed extends Error {
  readonly _tag = "ArtifactScanFailed" as const;
  constructor(message: string) {
    super(`scanning work tree failed: ${message}`);
  }
}

/**
 * Collect and parse every file under a work root. A missing directory
 * is a valid empty tree, not an error; unreadable entries fail closed.
 */
export function collectArtifacts(workRoot: string): Result<CollectedArtifacts, ArtifactScanFailed> {
  let paths: readonly string[];
  try {
    paths = listFilesRecursive(workRoot);
  } catch (error) {
    // SAFETY: Node filesystem failures are ErrnoException (Error plus a
    // code string); a non-Error throw lands in the String(error) report.
    const errno = error instanceof Error ? (error as NodeJS.ErrnoException) : undefined;
    const code = errno?.code;
    if (code === "ENOENT") return ok({ parsed: [], failures: [] });
    if (code === "ENOTDIR") {
      return err(new ArtifactScanFailed(`'${workRoot}' is not a directory`));
    }
    return err(new ArtifactScanFailed(String(error)));
  }
  const parsed: AuditedArtifact[] = [];
  const failures: ArtifactFileFailure[] = [];
  for (const rel of paths) {
    // ADR 0015: <initiative>/evidence/ holds raw ticket evidence of any
    // file type — instrument and output together, pointed at from the
    // ticket — and is neither parsed nor policed for Markdown.
    if (rel.split("/")[0] === "evidence") continue;
    if (!rel.endsWith(".md")) {
      failures.push({
        path: rel,
        issues: [
          {
            path: "",
            message:
              "only Markdown artifacts live under work/ — raw evidence (traces, measurements, instruments) lives under work/evidence/<TKT-NNN>/, output beside the instrument that produced it",
          },
        ],
      });
      continue;
    }
    let text: string;
    try {
      text = readFileSync(join(workRoot, rel), "utf8");
    } catch (error) {
      return err(new ArtifactScanFailed(`cannot read '${rel}': ${String(error)}`));
    }
    const result = parseArtifact(rel, text);
    if (result._tag === "ok") parsed.push({ path: rel, artifact: result.value });
    else failures.push({ path: rel, issues: result.error.issues });
  }
  return ok({ parsed, failures });
}
