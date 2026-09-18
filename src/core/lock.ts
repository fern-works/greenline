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
 * Schema 4 records the installed method/runtime identity and exact owned-file hashes.
 */
export const LOCK_SCHEMA_VERSION = 4 as const;

/** One pinned upstream family the lock records. */
export interface LockUpstream {
  readonly name: string;
  readonly repo: string;
  readonly commit: string | null;
}

/** The normalized lockfile: installation identity, upstream source identities and managed-file map. */
export interface LockFile {
  readonly schemaVersion: 4;
  readonly cliVersion: string;
  /** The installed method/runtime content identity. */
  readonly installationRevision: string;
  readonly upstreams: readonly LockUpstream[];
  readonly files: ReadonlyMap<string, string>;
}

const sha256Pattern = /^[0-9a-f]{64}$/;

const lockSchema = z
  .object({
    schemaVersion: z.literal(LOCK_SCHEMA_VERSION),
    cliVersion: z.string().min(1),
    installationRevision: z.string().regex(sha256Pattern),
    upstreams: z.array(
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
  if (versionIssue !== undefined) return contractFailure(source, [versionIssue]);
  const parsed = lockSchema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk({
    schemaVersion: parsed.data.schemaVersion,
    cliVersion: parsed.data.cliVersion,
    installationRevision: parsed.data.installationRevision,
    upstreams: parsed.data.upstreams,
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
        upstreams: lock.upstreams.map((upstream) => ({
          name: upstream.name,
          repo: upstream.repo,
          commit: upstream.commit,
        })),
        files,
      },
      null,
      2,
    ) + "\n"
  );
}
