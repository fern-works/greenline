import { isAbsolute, relative, sep } from "node:path";
import { isRepositoryPath } from "../../commons/repository-path.ts";
import type { ConnectorStatus } from "../../core/connectors/registry.ts";
import { diagnostic, type Diagnostic, type EffectJson, type TidyJson } from "./output.ts";
import type { Situation } from "../../core/situation.ts";
import type { ChangesReport } from "../../core/status.ts";
import type { HooksReport } from "../../core/adapters.ts";

/** The factual result returned by a workspace command. */
export interface CommandOutcome {
  readonly ok: boolean;
  readonly effects: readonly EffectJson[];
  readonly diagnostics: readonly Diagnostic[];
  /** Rendered human view; set only by commands that print a view. */
  readonly text?: string;
  /** The House rulings stanza's dash lines; set only by status. */
  readonly houseRulings?: readonly string[];
  /** The changes view; set only by status. */
  readonly changes?: ChangesReport;
  /** The connectors' registered and installed state; set by the `connectors` group and status. */
  readonly connectors?: readonly ConnectorStatus[];
  /** The situation the repository is in; set only by status's default view. */
  readonly situation?: Situation;
  /** What tidy removed and kept; set only by tidy. */
  readonly tidy?: TidyJson;
  /** The git hooks, the declared checks and the adapters; set by init, sync and status. */
  readonly hooks?: HooksReport;
}

function isClean(diagnostics: readonly Diagnostic[]): boolean {
  return !diagnostics.some((item) => item.severity === "error");
}

/** Build an outcome whose success follows its diagnostics. */
export function succeed(
  effects: readonly EffectJson[],
  diagnostics: readonly Diagnostic[] = [],
): CommandOutcome {
  return { ok: isClean(diagnostics), effects, diagnostics };
}

/** Build a refused command outcome while retaining planned effects. */
export function fail(
  diagnostics: readonly Diagnostic[],
  effects: readonly EffectJson[] = [],
): CommandOutcome {
  return { ok: false, effects, diagnostics };
}

/** Locate contract parser issues in the CLI diagnostic envelope. */
export function contractDiagnostics(
  code: string,
  issues: readonly { path: string; message: string }[],
  source?: string,
): readonly Diagnostic[] {
  return issues.map((issue) =>
    diagnostic(
      code,
      "error",
      source === undefined ? issue.message : `${issue.path || "document"}: ${issue.message}`,
      source ?? issue.path,
    ),
  );
}

/** Project filesystem locations into repository-relative CLI fields; invalid input stays in messages. */
export function repositoryOutcome(root: string, outcome: CommandOutcome): CommandOutcome {
  const pathFromRoot = (path: string): string =>
    (isAbsolute(path) ? relative(root, path) : path).split(sep).join("/");
  return {
    ...outcome,
    effects: outcome.effects.map((effect) => ({ ...effect, path: pathFromRoot(effect.path) })),
    diagnostics: outcome.diagnostics.map((item) => {
      if (item.path === undefined) return item;
      const { path, ...detail } = item;
      const located = pathFromRoot(path);
      return isRepositoryPath(located) ? { ...detail, path: located } : detail;
    }),
  };
}
