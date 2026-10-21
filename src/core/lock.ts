import { z } from "zod";
import { isRepositoryPath } from "../commons/repository-path.ts";
import type { Result } from "../commons/result.ts";
import {
  checkContractVersion,
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";

/**
 * `.greenline/lock.json` — generated ownership and content-hash record.
 * Schema 5 records the installed method/runtime identity, the pinned sources
 * and exact owned-file hashes.
 */
export const LOCK_SCHEMA_VERSION = 5 as const;

/**
 * What an earlier lock schema is told (`docs/SPEC.md` §5): there is no
 * converter, and sync rebuilds a missing lock.
 */
const LOCK_REMEDY = "delete .greenline/lock.json and run 'greenline sync' to rebuild it";

/** One pinned source the lock records. */
export interface LockSource {
  readonly name: string;
  readonly repo: string;
  readonly commit: string | null;
}

/** The normalized lockfile: installation identity, pinned source identities and managed-file map. */
export interface LockFile {
  readonly schemaVersion: typeof LOCK_SCHEMA_VERSION;
  readonly cliVersion: string;
  /** The installed method/runtime content identity. */
  readonly installationRevision: string;
  readonly sources: readonly LockSource[];
  readonly files: ReadonlyMap<string, string>;
}

const sha256Pattern = /^[0-9a-f]{64}$/;

const lockSchema = z
  .object({
    schemaVersion: z.literal(LOCK_SCHEMA_VERSION),
    cliVersion: z.string().min(1),
    installationRevision: z.string().regex(sha256Pattern),
    sources: z.array(
      z.object({
        name: z.string().min(1),
        repo: z.string().min(1),
        commit: z.string().nullable(),
      }),
    ),
    files: z.record(
      z.string().refine(isRepositoryPath, "a portable repository-relative path"),
      z.string().regex(sha256Pattern),
    ),
  })
  .strict();

/**
 * Parse and validate lockfile text into the normalized model. The files
 * record maps managed paths to SHA-256 digests of their owned regions.
 */
export function parseLock(input: string, source: string): Result<LockFile, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined) {
    return contractFailure(source, [{ path: "", message: "lock is not valid JSON" }]);
  }
  const versionIssue = checkContractVersion(raw, "lock", LOCK_SCHEMA_VERSION);
  if (versionIssue !== undefined)
    return contractFailure(source, [
      { ...versionIssue, message: `${versionIssue.message}; ${LOCK_REMEDY}` },
    ]);
  const parsed = lockSchema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk({
    schemaVersion: parsed.data.schemaVersion,
    cliVersion: parsed.data.cliVersion,
    installationRevision: parsed.data.installationRevision,
    sources: parsed.data.sources,
    files: new Map(Object.entries(parsed.data.files)),
  });
}

/** Deterministic serialization: fixed field order, sorted files, LF. */
export function serializeLock(lock: LockFile): string {
  const files = Object.fromEntries(
    [...lock.files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return (
    JSON.stringify(
      {
        schemaVersion: lock.schemaVersion,
        cliVersion: lock.cliVersion,
        installationRevision: lock.installationRevision,
        sources: lock.sources.map((entry) => ({
          name: entry.name,
          repo: entry.repo,
          commit: entry.commit,
        })),
        files,
      },
      null,
      2,
    ) + "\n"
  );
}
