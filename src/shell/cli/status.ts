import { join } from "node:path";
import { buildStatusView, renderHouseRulingsText, renderStatusText } from "../../core/status.ts";
import { findGitRoot } from "../git.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { collectArtifacts } from "../artifacts.ts";
import { GL, diagnostic } from "./output.ts";
import type { ProjectView } from "../../core/status.ts";
import { parseHouseRulings } from "../../core/house-rulings.ts";
import { type RepositoryEnvironment, envRead } from "./command-environment.ts";
import { type CommandOutcome, fail } from "./command-outcome.ts";
import { runDoctor } from "./doctor.ts";

/** Read durable repository state without selecting or advancing work. */
export function runStatus(env: RepositoryEnvironment): CommandOutcome {
  const root = findGitRoot(env.cwd);
  if (root === undefined) {
    return fail([
      diagnostic(GL.notGitRepository, "error", "status requires a Git repository root"),
    ]);
  }
  const io: FileIo = createNodeFileIo();
  if (envRead(io, join(root, ".greenline", "manifest.json")) === undefined) {
    return fail([
      diagnostic(
        GL.manifestMissing,
        "error",
        "not a greenline workspace; run 'greenline init' first",
        ".greenline/manifest.json",
      ),
    ]);
  }
  const collected = collectArtifacts(join(root, ".greenline", "work"));
  if (collected._tag === "err") {
    return fail([diagnostic(GL.ioFailure, "error", collected.error.message)]);
  }
  const view: ProjectView = buildStatusView(collected.value.parsed);
  // The stanza is the user's text; status lists it and never writes it.
  const houseRulings = parseHouseRulings(envRead(io, join(root, "AGENTS.md")) ?? "");
  const doctor = runDoctor(env);
  // The connectors' lines, when the manifest could be read, follow the work view.
  const text: string =
    renderStatusText(view) + renderHouseRulingsText(houseRulings) + (doctor.text ?? "");
  return {
    ...doctor,
    text,
    view,
    houseRulings,
  };
}
