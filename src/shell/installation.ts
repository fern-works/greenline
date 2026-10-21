import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "../commons/result.ts";
import { contractFailure, type ContractParseFailed } from "../core/contract.ts";
import { buildInstallation, parseInstallation, type Installation } from "../core/installation.ts";
import { parseModes } from "../core/modes.ts";
import { loadCorpus, loadCorpusIntents, loadLedgerGuide, loadSourcePins } from "./corpus.ts";

/** Compile only governed skill compositions and shared runtime instructions. */
export function compileInstallation(root: string): Result<Installation, ContractParseFailed> {
  // The roster's activation follows the kinds, so the definition is read and
  // refused first, each issue a field path inside the file.
  const modesPath = join(root, "runtime/modes.json");
  let modesText: string;
  try {
    modesText = readFileSync(modesPath, "utf8");
  } catch {
    return contractFailure(root, [
      { path: "runtime", message: "Runtime instructions are unavailable." },
    ]);
  }
  const modes = parseModes(modesText, modesPath);
  if (modes._tag === "err") return modes;
  const skills = loadCorpus(root),
    intents = loadCorpusIntents(root),
    ledger = loadLedgerGuide(root),
    sources = loadSourcePins(root);
  for (const result of [skills, intents, ledger, sources])
    if (result._tag === "err")
      return contractFailure(root, [{ path: "installation", message: result.error.message }]);
  if (
    skills._tag === "err" ||
    intents._tag === "err" ||
    ledger._tag === "err" ||
    sources._tag === "err"
  )
    return contractFailure(root, [
      { path: "installation", message: "Installation inputs are unavailable." },
    ]);
  try {
    return buildInstallation({
      skills: skills.value,
      intents: intents.value,
      modes: modes.value,
      sources: sources.value,
      ledgerGuide: ledger.value,
      agentGuide: readFileSync(join(root, "runtime/agent.md"), "utf8"),
      workGuide: readFileSync(join(root, "runtime/work.md"), "utf8"),
      notices: readFileSync(join(root, "../THIRD_PARTY_NOTICES.md"), "utf8"),
    });
  } catch {
    return contractFailure(root, [
      { path: "runtime", message: "Runtime instructions are unavailable." },
    ]);
  }
}

/** Read the package's sole installation asset; nothing is copied into a user cache. */
export function loadInstallation(directory: string): Result<Installation, ContractParseFailed> {
  const path = join(directory, "installation.json");
  try {
    return parseInstallation(readFileSync(path, "utf8"), path);
  } catch {
    return contractFailure(path, [
      {
        path: "installation",
        message: "Reinstall the CLI: its installation asset is unavailable.",
      },
    ]);
  }
}
