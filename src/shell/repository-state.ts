import { z } from "zod";
import { lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import type { Result } from "../commons/result.ts";
import { contractFailure, type ContractParseFailed } from "../core/contract.ts";
import { parseLedgerRecord, type LedgerRecord } from "../core/execution-ledger.ts";
import { parseManifest, type Manifest } from "../core/manifest.ts";
import { parseDecisionDocument, type DecisionDocument } from "../core/root-statements.ts";
import type { FileIo } from "./fs/io.ts";

/** Confined repository policy read; absence is explicit and never a guessed configuration. */
function read(
  root: string,
  path: string,
  io: FileIo,
  absent: string | undefined,
): Result<string, ContractParseFailed> {
  const full = join(root, path);
  try {
    if (!lstatSync(full).isFile() || !realpathSync(full).startsWith(realpathSync(root) + sep))
      return contractFailure(path, [
        { path: "", message: "Policy must be an ordinary file inside the repository." },
      ]);
  } catch (error) {
    const missing = z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
    return missing && absent !== undefined
      ? { _tag: "ok", value: absent }
      : contractFailure(path, [{ path: "", message: "Policy is unavailable." }]);
  }
  const content = io.read(full);
  return content._tag === "err"
    ? contractFailure(path, [{ path: "", message: content.error.message }])
    : content;
}
/** Installed choices, without derived engineering decisions. */
export function readRepositoryManifest(
  root: string,
  io: FileIo,
  skillNames?: readonly string[],
): Result<Manifest, ContractParseFailed> {
  const result = read(root, ".greenline/manifest.json", io, undefined);
  return result._tag === "err"
    ? result
    : parseManifest(result.value, ".greenline/manifest.json", skillNames);
}
/** One execution account by id; a record that fails its schema or names another id is not that account. */
export function readRepositoryAccount(
  root: string,
  io: FileIo,
  id: string,
): Result<LedgerRecord, ContractParseFailed> {
  const path = `.greenline/ledger/records/${id}.json`;
  if (!/^[a-z][a-z0-9-]*$/.test(id))
    return contractFailure(path, [{ path: "", message: "An account id is kebab-case." }]);
  const result = read(root, path, io, undefined);
  if (result._tag === "err") return result;
  const parsed = parseLedgerRecord(result.value, path);
  return parsed._tag === "ok" && parsed.value.id !== id
    ? contractFailure(path, [{ path: "id", message: "The account names another id." }])
    : parsed;
}
/** Read ordinary decisions; an absent decision book makes no engineering choice. */
export function readRepositoryDecisions(
  root: string,
  io: FileIo,
): Result<DecisionDocument, ContractParseFailed> {
  const result = read(root, ".greenline/DECISIONS.md", io, "");
  return result._tag === "err"
    ? result
    : parseDecisionDocument(result.value, ".greenline/DECISIONS.md");
}
