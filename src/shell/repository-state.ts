import { z } from "zod";
import { lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import type { Result } from "../commons/result.ts";
import { contractFailure, type ContractParseFailed } from "../core/contract.ts";
import type { Installation } from "../core/installation.ts";
import {
  parseManifest,
  trialSkillNames,
  type Manifest,
  type ManifestRoster,
} from "../core/manifest.ts";
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
/**
 * What a manifest is checked against when the installation is loaded.
 * @param installation the installation, or undefined when it is unavailable
 * @returns its skills' names, its trial skills and its modes, or undefined
 */
export function rosterOf(installation: Installation | undefined): ManifestRoster | undefined {
  return installation === undefined
    ? undefined
    : {
        skills: installation.skills.map((skill) => skill.name),
        trials: trialSkillNames(installation.modes, installation.skills),
        modes: installation.modes,
      };
}
/** Installed choices, without derived engineering decisions; checked against the installation when one is given. */
export function readRepositoryManifest(
  root: string,
  io: FileIo,
  roster?: ManifestRoster,
): Result<Manifest, ContractParseFailed> {
  const result = read(root, ".greenline/manifest.json", io, undefined);
  return result._tag === "err"
    ? result
    : parseManifest(result.value, ".greenline/manifest.json", roster);
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
