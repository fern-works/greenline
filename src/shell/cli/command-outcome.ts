import { isAbsolute, relative, sep } from "node:path";
import { isRepositoryPath } from "../../commons/repository-path.ts";
import { type LedgerSummary } from "../../core/ledger-audit.ts";
import { diagnostic, type Diagnostic, type EffectJson } from "./output.ts";
import type { ProjectView } from "../../core/status.ts";

/** The factual result returned by a workspace command. */
export interface CommandOutcome {
  readonly ok: boolean;
  readonly effects: readonly EffectJson[];
  readonly diagnostics: readonly Diagnostic[];
  /** Rendered human view; set only by commands that print a view. */
  readonly text?: string;
  /** Structured view for the JSON envelope; set only by status. */
  readonly view?: ProjectView;
  /** The House rulings stanza's dash lines; set only by status. */
  readonly houseRulings?: readonly string[];
  readonly ledger?: LedgerSummary;
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
  return issues.map((issue) => {
    const message = `${issue.message}${fieldHint(issue.path)}`;
    return diagnostic(
      code,
      "error",
      source === undefined ? message : `${issue.path || "document"}: ${message}`,
      source ?? issue.path,
    );
  });
}

/**
 * A ledger entry's `decision` is one of the four words; the sentence an
 * author reaches for belongs in its sibling `reason`. The field name invites
 * the prose reading, so the refusal names where the prose goes.
 */
function fieldHint(path: string): string {
  return /(^|\.)decision$/.test(path) ? " The prose belongs in the sibling 'reason' field." : "";
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
