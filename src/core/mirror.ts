import { NO_CHECKS_LINE, gitHooksLine, type HooksReport } from "./adapters.ts";
import { checkWhere, isRunOf, type DeclaredCheck } from "./checks.ts";
import type { CheckFacts, HookRun } from "./facts.ts";
import type { RecordFacts } from "./git-hooks.ts";

/**
 * The status mirror (N-56 item 5; `docs/SPEC.md` §4, `greenline event`):
 * the few lines `greenline event` prints into the harness's context at a
 * session's and a turn's start, and the nudges `status` shows beside a
 * change. It states the open change, its mode and its "next" line, each
 * declared check's latest run, the fresh agents the events counted beside
 * the record's cost, and git hooks that are absent. Every line is a fact and
 * a nudge, never a refusal, and it reads no installation, so it stays fast.
 */

/** One declared check's latest run, from `check`'s facts or a hook's record, the newer of the two. */
export interface CheckStanding {
  readonly check: DeclaredCheck;
  readonly latest:
    | {
        readonly by: "check";
        readonly outcome: "passed" | "failed" | "started";
        readonly at: string;
      }
    | {
        readonly by: "hook";
        readonly outcome: "ok" | "failed" | "unknown";
        readonly harness: string;
        readonly at: string;
      }
    | undefined;
}

function checkOutcome(facts: CheckFacts): "passed" | "failed" | "started" {
  if (facts.state === "started") return "started";
  return facts.outcome.kind === "exited" && facts.outcome.code === 0 ? "passed" : "failed";
}

/**
 * Each declared check with its latest run: the newest `check` fact that is
 * its run, read by its name, its command and its directory, or the newest
 * run a hook recorded of it, whichever started later; a probe is no run.
 * @param checks the declared checks
 * @param facts the change's check facts
 * @param hookRuns the change's hook-recorded runs
 * @returns one standing per declared check, in the manifest's order
 */
export function checkStandings(
  checks: readonly DeclaredCheck[],
  facts: readonly CheckFacts[],
  hookRuns: readonly HookRun[],
): readonly CheckStanding[] {
  return checks.map((check) => {
    const byCheck = facts
      .filter((fact) => fact.probe !== true && isRunOf(check, fact))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    const byHook = hookRuns
      .filter((run) => run.check === check.name)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    if (byCheck === undefined && byHook === undefined) return { check, latest: undefined };
    if (byHook === undefined || (byCheck !== undefined && byCheck.startedAt >= byHook.startedAt))
      return byCheck === undefined
        ? { check, latest: undefined }
        : {
            check,
            latest: { by: "check", outcome: checkOutcome(byCheck), at: byCheck.startedAt },
          };
    return {
      check,
      latest: {
        by: "hook",
        outcome: byHook.outcome.kind,
        harness: byHook.harness,
        at: byHook.startedAt,
      },
    };
  });
}

/**
 * The fresh agents the change's events counted: the starts the harness
 * reported, or its stops where it reports no start, as Droid does.
 * @param kinds the kinds of the change's raw events, in order
 * @returns the count
 */
export function agentsCounted(kinds: readonly string[]): number {
  const starts = kinds.filter((kind) => kind === "agent-start").length;
  const stops = kinds.filter((kind) => kind === "agent-stop").length;
  return Math.max(starts, stops);
}

/**
 * The nudge a record's cost earns beside the agents the events counted: at
 * close, a record whose `agents` is not the builder and the counted agents.
 * @param record the record's lines
 * @param counted the fresh agents counted
 * @returns the nudge, or undefined
 */
function agentsNudge(record: RecordFacts, counted: number): string | undefined {
  if (record.state !== "done" || counted === 0) return undefined;
  if (record.agents === counted + 1) return undefined;
  return `the events counted ${String(counted)} fresh agent${counted === 1 ? "" : "s"} and the record states agents: ${record.agents === undefined ? "none" : String(record.agents)}; the cost counts the builder and each fresh agent`;
}

/**
 * The nudge a record owes when its close is written and it is not finished:
 * the close with no done the turn's end leaves for the next turn's start.
 * @param record the record's lines
 * @returns the nudge, or undefined
 */
function closeNudge(record: RecordFacts): string | undefined {
  if (record.closeWritten !== true || record.state === "done" || record.state === "dropped")
    return undefined;
  return "its close section is written and its state is not done: set done once its checks are green, or say in the record why it stays open.";
}

/**
 * One declared check's standing as a line of text.
 * @param standing the check and its latest run
 * @returns the line, indented two spaces
 */
export function standingLine(standing: CheckStanding): string {
  const { check, latest } = standing;
  if (latest === undefined) return `  ${check.name} (${checkWhere(check)}): no recorded run`;
  if (latest.by === "check")
    return `  ${check.name} (${checkWhere(check)}): ${latest.outcome}, recorded by greenline check`;
  return `  ${check.name} (${checkWhere(check)}): ${latest.outcome === "ok" ? "ran green" : latest.outcome === "failed" ? "ran red" : "ran, its outcome unknown"} by the ${latest.harness} hook; only a run through greenline check counts for the close`;
}

/** What the mirror shows. */
export interface MirrorInput {
  /** The open change, or undefined when none is. */
  readonly change: { readonly id: string; readonly record: RecordFacts | undefined } | undefined;
  readonly checks: readonly CheckStanding[];
  readonly declared: number;
  readonly agents: number;
  readonly git: HooksReport["git"];
}

/**
 * The mirror's text.
 * @param input what it shows
 * @returns the lines, ending with a newline
 */
export function mirrorText(input: MirrorInput): string {
  const lines: string[] = [];
  const { change } = input;
  if (change === undefined)
    lines.push(
      "greenline: no open change. A request for a change is proposed and waits for the owner's yes; 'greenline status' lists the changes.",
    );
  else {
    const record = change.record;
    lines.push(
      record === undefined
        ? `greenline: change ${change.id} has no record yet: no write outside .greenline/ledger/ and .greenline/tmp/${change.id}/, and no commit, before the owner's yes.`
        : `greenline: change ${change.id}, ${record.mode ?? "no mode"}, ${record.state ?? "no state"}${record.next === undefined ? "" : `; next: ${record.next}`}.`,
    );
    if (record !== undefined && record.choice === undefined)
      lines.push("  its record carries no choice line: the owner has not said yes.");
    const close = record === undefined ? undefined : closeNudge(record);
    if (close !== undefined) lines.push(`  ${close}`);
    lines.push(
      `  ${String(input.agents)} fresh agent${input.agents === 1 ? "" : "s"} counted in its events; 'greenline status --change ${change.id}' shows its checks and commits.`,
    );
    const nudge = record === undefined ? undefined : agentsNudge(record, input.agents);
    if (nudge !== undefined) lines.push(`  ${nudge}`);
  }
  if (input.declared === 0) lines.push(NO_CHECKS_LINE);
  else if (change !== undefined)
    lines.push("checks declared, the latest run of each:", ...input.checks.map(standingLine));
  if (input.git.state === "absent") lines.push(gitHooksLine(input.git));
  return `${lines.join("\n")}\n`;
}
