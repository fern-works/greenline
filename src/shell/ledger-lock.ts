import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";

/**
 * The ledger's one writer lock (workshop/components/ledger.md, "The
 * command"): every recording holds it, so two writers never extend the
 * chain at once. It is a private directory in the Git common directory,
 * owned by the process that made it and released by that owner; a killed
 * writer's lock is released only through its exact recorded process
 * identity. The directory keeps the name it had when a publication
 * reservation shared it, so a lock an earlier build left is still found.
 */

/** Why the writer lock could not be taken, read or released. */
export class LedgerLockError extends Error {
  readonly _tag = "LedgerLockError" as const;
  readonly kind: "conflict" | "invalid" | "unavailable";
  readonly input: string;
  constructor(kind: LedgerLockError["kind"], input: string) {
    super(`ledger writer lock ${kind}: ${input}`);
    this.kind = kind;
    this.input = input;
  }
}

export interface LedgerWriterOwner {
  readonly pid: number;
  readonly processIdentity: string;
  readonly nonce: string;
}

const ownerSchema = z
  .object({
    pid: z.number().int().positive(),
    processIdentity: z.string().min(1),
    nonce: z.uuid(),
  })
  .strict();

export type Synchronous<T> = T extends PromiseLike<unknown> ? never : T;

function commonDirectory(repository: string): Result<string, LedgerLockError> {
  try {
    const value = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!value) return err(new LedgerLockError("invalid", "Git common directory"));
    return ok(isAbsolute(value) ? value : resolve(repository, value));
  } catch {
    return err(new LedgerLockError("unavailable", "Git common directory"));
  }
}

/** The writer lock's private home in the Git common directory, and the lock directory in it. */
function ledgerWriterPaths(
  repository: string,
): Result<{ readonly home: string; readonly lock: string }, LedgerLockError> {
  const common = commonDirectory(repository);
  if (common._tag === "err") return common;
  const home = join(common.value, "greenline-publication");
  return ok({ home, lock: join(home, "writer.lock") });
}

function ensurePrivateDirectory(path: string): Result<void, LedgerLockError> {
  try {
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      return err(new LedgerLockError("invalid", "writer lock directory"));
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
    return ok(undefined);
  } catch {
    return err(new LedgerLockError("unavailable", "writer lock directory"));
  }
}

function processIdentity(pid: number): Result<string | null, LedgerLockError> {
  try {
    const value = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return ok(value || null);
  } catch {
    try {
      process.kill(pid, 0);
      return err(new LedgerLockError("unavailable", "writer process identity"));
    } catch (cause) {
      const missing = z.object({ code: z.literal("ESRCH") }).safeParse(cause);
      return missing.success
        ? ok(null)
        : err(new LedgerLockError("unavailable", "writer process identity"));
    }
  }
}

/** Hold the ledger's writer lock for one synchronous write. */
export function withLedgerLock<T>(
  repository: string,
  write: () => Synchronous<T>,
): Result<T, LedgerLockError> {
  const located = ledgerWriterPaths(repository);
  if (located._tag === "err") return located;
  const secured = ensurePrivateDirectory(located.value.home);
  if (secured._tag === "err") return secured;
  const ownerIdentity = processIdentity(process.pid);
  if (ownerIdentity._tag === "err" || ownerIdentity.value === null)
    return err(new LedgerLockError("unavailable", "writer process identity"));
  const owner: LedgerWriterOwner = {
    pid: process.pid,
    processIdentity: ownerIdentity.value,
    nonce: randomUUID(),
  };
  const temporary = join(located.value.home, `.writer-${owner.nonce}`);
  try {
    mkdirSync(temporary, { mode: 0o700 });
    writeFileSync(join(temporary, owner.nonce), `${JSON.stringify(owner)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, located.value.lock);
  } catch {
    rmSync(temporary, { recursive: true, force: true });
    return err(new LedgerLockError("conflict", "ledger writer lock"));
  }
  let outcome: Result<T, LedgerLockError>;
  try {
    outcome = ok(write());
  } catch (cause) {
    outcome =
      cause instanceof LedgerLockError
        ? err(cause)
        : err(new LedgerLockError("unavailable", "ledger write"));
  }
  const released = releaseWriterDirectory(located.value.lock, owner.nonce);
  return released._tag === "err" ? released : outcome;
}

/** Read the process identity captured by a writer lock, if one remains. */
export function inspectLedgerWriterLock(
  repository: string,
): Result<LedgerWriterOwner | null, LedgerLockError> {
  const located = ledgerWriterPaths(repository);
  if (located._tag === "err") return located;
  if (!existsSync(located.value.lock)) return ok(null);
  try {
    if (!lstatSync(located.value.lock).isDirectory())
      return err(new LedgerLockError("invalid", "ledger writer lock"));
    const names = readdirSync(located.value.lock);
    if (names.length === 0) return ok(null);
    if (names.length !== 1) return err(new LedgerLockError("invalid", "ledger writer lock"));
    const parsed = ownerSchema.safeParse(
      JSON.parse(readFileSync(join(located.value.lock, names[0]!), "utf8")),
    );
    if (parsed.success && parsed.data.nonce !== names[0])
      return err(new LedgerLockError("invalid", "ledger writer lock"));
    return parsed.success
      ? ok(parsed.data)
      : err(new LedgerLockError("invalid", "ledger writer lock"));
  } catch {
    return err(new LedgerLockError("unavailable", "ledger writer lock"));
  }
}

function releaseWriterDirectory(lock: string, nonce: string): Result<void, LedgerLockError> {
  try {
    unlinkSync(join(lock, nonce));
  } catch (cause) {
    const missing = z.object({ code: z.literal("ENOENT") }).safeParse(cause);
    if (!missing.success)
      return err(new LedgerLockError("unavailable", "ledger writer owner cleanup"));
  }
  try {
    rmdirSync(lock);
  } catch (cause) {
    const benign = z.object({ code: z.enum(["ENOENT", "ENOTEMPTY", "EEXIST"]) }).safeParse(cause);
    if (!benign.success)
      return err(new LedgerLockError("unavailable", "ledger writer lock cleanup"));
  }
  return ok(undefined);
}

/** Remove a killed writer's exact lock; a live or changed owner is never displaced. */
export function releaseStaleLedgerWriterLock(
  repository: string,
  expected: LedgerWriterOwner,
): Result<void, LedgerLockError> {
  const located = ledgerWriterPaths(repository);
  if (located._tag === "err") return located;
  const inspected = inspectLedgerWriterLock(repository);
  if (inspected._tag === "err") return inspected;
  if (inspected.value === null) return ok(undefined);
  if (
    inspected.value.pid !== expected.pid ||
    inspected.value.processIdentity !== expected.processIdentity ||
    inspected.value.nonce !== expected.nonce
  )
    return err(new LedgerLockError("conflict", "ledger writer lock owner"));
  const live = processIdentity(expected.pid);
  if (live._tag === "err") return live;
  if (live.value === expected.processIdentity)
    return err(new LedgerLockError("conflict", "live ledger writer"));
  return releaseWriterDirectory(located.value.lock, expected.nonce);
}
