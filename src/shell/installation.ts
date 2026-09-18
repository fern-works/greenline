import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "../commons/result.ts";
import { contractFailure, type ContractParseFailed } from "../core/contract.ts";
import { buildInstallation, parseInstallation, type Installation } from "../core/installation.ts";
import { loadCorpus, loadCorpusIntents, loadLedgerGuide, loadUpstreamPins } from "./corpus.ts";
import { verifyLedgerOrViews } from "./ledger.ts";

/** Compile only governed skill compositions and shared runtime instructions. */
export function compileInstallation(root: string): Result<Installation, ContractParseFailed> {
  const skills = loadCorpus(root),
    intents = loadCorpusIntents(root),
    ledger = loadLedgerGuide(root),
    upstreams = loadUpstreamPins(root);
  for (const result of [skills, intents, ledger, upstreams])
    if (result._tag === "err")
      return contractFailure(root, [{ path: "installation", message: result.error.message }]);
  if (
    skills._tag === "err" ||
    intents._tag === "err" ||
    ledger._tag === "err" ||
    upstreams._tag === "err"
  )
    return contractFailure(root, [
      { path: "installation", message: "Installation inputs are unavailable." },
    ]);
  const provenance = verifyLedgerOrViews(root);
  if (provenance._tag === "err") return provenance;
  try {
    return buildInstallation({
      skills: skills.value,
      intents: intents.value,
      upstreams: upstreams.value,
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
