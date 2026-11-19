import { z } from "zod";
import type { Harness } from "./adapters.ts";
import type { JsonValue } from "./contract.ts";

/**
 * The agents a method starts (J-134 S2; the ledger guide, "Fix passes and
 * the cost"): an agent the line's depths start, a reviewer, a verifier or
 * anticipate's agent, counts against the mode's limit, and one a method
 * starts, such as diagram-design's picture agent, a research agent or
 * wayfinder's reader, is named in the section it serves and counted
 * nowhere. The hook tells them apart by the prompt the harness's agent tool
 * was given: a brief `greenline brief` wrote, or a step skill's page, names
 * a step's agent; the page of an installed skill whose own pages name a
 * fresh agent it starts names the method that started it. A prompt that is
 * one file's path is read for the file's text. The pairing of a start with
 * its launch is by order, so an agent tool call that never starts, or two
 * hook processes reading the log at once, may shift a method onto the next
 * start, a limit the SPEC names.
 * A start whose prompt the hook cannot read, or that names neither, is
 * counted, so nothing leaves the count by a guess. Pure: the shell reads the
 * payload, the brief file and the installed roster.
 */

/** The agent tools whose prompt the hook reads, by the harness's own names; none for a harness whose agent tool it does not read. */
function agentToolsOf(harness: Harness): readonly string[] {
  switch (harness) {
    case "claude-code":
      return ["Agent", "Task"];
    default:
      return [];
  }
}

const agentPayload = z
  .object({
    tool_name: z.string().optional().catch(undefined),
    tool_input: z
      .object({ prompt: z.string().optional().catch(undefined) })
      .optional()
      .catch(undefined),
  })
  .catch({});

/**
 * The prompt an agent tool was given before it ran, or undefined for any
 * other tool and for a harness whose agent tool the hook does not read.
 * @param harness the harness the adapter names
 * @param payload the before-tool event's payload
 * @returns the prompt, or undefined
 */
export function agentPromptOf(harness: Harness, payload: JsonValue): string | undefined {
  const tools = agentToolsOf(harness);
  const read = agentPayload.parse(payload);
  if (read.tool_name === undefined || !tools.includes(read.tool_name)) return undefined;
  return read.tool_input?.prompt ?? "";
}

/** A brief file a step's agent is started with: `greenline brief`'s or anticipate's. */
const STEP_BRIEF = /(?:^|[\\/\s"'`])brief-(?:review|verify|anticipate)-\d+\.md\b/;

/** A skill's page named in a prompt, under either root, by its folder. */
const SKILL_PAGE = /(?:^|[\\/\s"'`(])\.(?:claude|agents)\/skills\/([a-z0-9][a-z0-9-]*)\//g;

/** What an agent's prompt names: a step's agent, a method's, or neither. */
export type AgentStarter =
  | { readonly by: "step" }
  | { readonly by: "method"; readonly method: string }
  | { readonly by: "unknown" };

/**
 * Who started an agent, read from its prompt: a step's brief or a step
 * skill's page names a step's agent; else the first page it names of a
 * skill whose pages name a fresh agent it starts is the method that started
 * it; else unknown, which is counted.
 * @param prompt the prompt, and the text of the brief file it names where it is one path
 * @param installed the installed roster's skill names
 * @param steps the line's steps, whose skills start the counted agents
 * @param methods the installed skills whose own pages name a fresh agent they start
 * @returns the starter
 */
export function agentStarter(
  prompt: string,
  installed: ReadonlySet<string>,
  steps: ReadonlySet<string>,
  methods: ReadonlySet<string>,
): AgentStarter {
  if (STEP_BRIEF.test(prompt)) return { by: "step" };
  const named = [...prompt.matchAll(SKILL_PAGE)].flatMap((match) =>
    match[1] !== undefined && installed.has(match[1]) ? [match[1]] : [],
  );
  if (named.some((skill) => steps.has(skill))) return { by: "step" };
  const method = named.find((skill) => methods.has(skill));
  return method === undefined ? { by: "unknown" } : { by: "method", method };
}

/** A brief file named in a prompt, by the step its name carries: `greenline brief`'s `brief-review-1.md`. */
const BRIEF_STEP = /(?:^|[\\/\s"'`])brief-([a-z][a-z-]*?)-\d+\.md\b/g;

/**
 * The step a step's agent serves, read from its prompt (J-207 S1; the run
 * j196c-roster-usec, whose reviewer's loads were noted at build while its
 * checks named review): the step a brief file it names carries in its
 * name, else the first step whose skill's page it names; undefined for
 * any other prompt.
 * @param prompt the prompt, and the text of the brief file it names where it is one path
 * @param steps the line's steps
 * @returns the step, or undefined
 */
export function servedStep(prompt: string, steps: ReadonlySet<string>): string | undefined {
  const briefed = [...prompt.matchAll(BRIEF_STEP)]
    .map((match) => match[1])
    .find((step) => step !== undefined && steps.has(step));
  if (briefed !== undefined) return briefed;
  return [...prompt.matchAll(SKILL_PAGE)]
    .map((match) => match[1])
    .find((skill) => skill !== undefined && steps.has(skill));
}

/** One raw log line as the count reads it: its kind, and the method an agent's start or launch names. */
export interface AgentLine {
  readonly kind: string;
  /** On an agent tool's before-tool line, the method its prompt names or null; absent on any other line. */
  readonly launch?: string | null | undefined;
  /** On an agent-start line, the method that started it, or null for one the count holds. */
  readonly method?: string | null | undefined;
  /** On an agent's start or stop, the id the harness gives it, so a resumed agent counts once (J-144 S4); absent or null where the harness gives none. */
  readonly agent?: string | null | undefined;
  /** On an agent tool's launch and the start it pairs with, the step its brief names, null for none (J-207 S1). */
  readonly served?: string | null | undefined;
}

/**
 * The starts or stops of distinct agents: each id once, as a reviewer
 * resumed for a recheck starts again under its own id, and each line with
 * no id as one agent (J-144 S4).
 * @param lines the change's raw log
 * @param kind `agent-start` or `agent-stop`
 * @returns the first line of each agent, in order
 */
export function firstOfEach(
  lines: readonly AgentLine[],
  kind: "agent-start" | "agent-stop",
): readonly AgentLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (line.kind !== kind) return false;
    const id = line.agent;
    if (id === undefined || id === null || id === "") return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * The method a new agent start pairs with: the launches the raw log holds,
 * in order, each taken by one fresh agent's first start, the next start the
 * next launch's; a start under an id already started, a resumed agent, is
 * its first start's method and takes no launch (J-144 S4).
 * @param lines the change's raw log so far
 * @param agent the id the harness gives the starting agent, where it gives one
 * @returns the method of the launch this start pairs with, or null
 */
export function methodOfStart(lines: readonly AgentLine[], agent?: string | null): string | null {
  const starts = firstOfEach(lines, "agent-start");
  if (agent !== undefined && agent !== null && agent !== "") {
    const resumed = starts.find((line) => line.agent === agent);
    if (resumed !== undefined) return resumed.method ?? null;
  }
  const launches = lines.filter((line) => line.kind === "before-tool" && line.launch !== undefined);
  return launches[starts.length]?.launch ?? null;
}

/**
 * The step a new agent start serves (J-207 S1), paired with its launch as
 * {@link methodOfStart} pairs the method: a resumed agent keeps its first
 * start's step.
 * @param lines the change's raw log so far
 * @param agent the id the harness gives the starting agent, where it gives one
 * @returns the step of the launch this start pairs with, or null
 */
export function servedOfStart(lines: readonly AgentLine[], agent?: string | null): string | null {
  const starts = firstOfEach(lines, "agent-start");
  if (agent !== undefined && agent !== null && agent !== "") {
    const resumed = starts.find((line) => line.agent === agent);
    if (resumed !== undefined) return resumed.served ?? null;
  }
  const launches = lines.filter((line) => line.kind === "before-tool" && line.launch !== undefined);
  return launches[starts.length]?.served ?? null;
}

/** The agents a method started, by the method, in the order first started. */
export interface MethodAgents {
  readonly method: string;
  readonly count: number;
}

/**
 * The agents each method started, read from the starts the raw log marks.
 * @param lines the change's raw log
 * @returns one entry per method, none where no start names one
 */
export function methodAgents(lines: readonly AgentLine[]): readonly MethodAgents[] {
  const counts = new Map<string, number>();
  for (const line of firstOfEach(lines, "agent-start"))
    if (line.method !== undefined && line.method !== null)
      counts.set(line.method, (counts.get(line.method) ?? 0) + 1);
  return [...counts.entries()].map(([method, count]) => ({ method, count }));
}

/**
 * Where a method's agents stand (J-134 S2, J-208 S1; the ledger guide,
 * "Fix passes and the cost"): outside the mode's count and outside the
 * record, so the notice that names them invites none into `starts`, the
 * starts of the line's steps alone, or into `agents` (the run
 * j196t-conduct-emptyc, whose done record listed two picture helpers).
 */
export const METHOD_AGENTS_NOWHERE =
  "counted nowhere and listed nowhere, neither in the record's starts nor in its agents count";

/**
 * The cost's rule as the nudge on a count that differs states it (J-208
 * S1): the builder and each fresh agent a step started, a method's agents
 * standing nowhere, since a harness whose agent prompts the hook cannot
 * read counts them among the events' fresh agents.
 */
export const COST_COUNTS: string = `the cost counts the builder and each fresh agent a step started, and an agent a method started, a picture's helper among them, is ${METHOD_AGENTS_NOWHERE}`;

/**
 * The methods' agents as words: `2 by diagram-design`, joined with "and".
 * @param methods the agents each method started
 * @returns the words, empty for none
 */
export function methodAgentsWords(methods: readonly MethodAgents[]): string {
  const parts = methods.map((entry) => `${String(entry.count)} by ${entry.method}`);
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}

/*
 * Fresh or forked (J-176 S1; the register's row of 2026-11-05, "The seven
 * cuts"): each harness's native delegation is accepted as it ran and its
 * helper recorded fresh or forked where the harness shows the spawn's
 * parent. Claude Code's agent tool names a fork by its `subagent_type`,
 * `fork`, which carries the builder's conversation; Codex's `spawn_agent`
 * call in the session's rollout starts a fresh agent only with `fork_turns`
 * `none`, and inherits the builder's turns otherwise. A forked helper is a
 * recorded fact, never a breach; the record's agents line stays the agent's.
 */

/** Whether a helper started with the builder's context or without it. */
export type Provenance = "fresh" | "forked";

/** One helper's start as the hooks saw it: its id, fresh or forked, and where the fact was read. */
export interface HelperStart {
  readonly agent: string;
  readonly provenance: Provenance;
  readonly via: "agent-tool" | "rollout";
}

const subagentType = z
  .object({
    tool_input: z
      .object({ subagent_type: z.string().optional().catch(undefined) })
      .optional()
      .catch(undefined),
  })
  .catch({});

/**
 * Whether an agent tool's launch starts its helper fresh or forked, read
 * from the before-tool payload: Claude Code's `subagent_type` of `fork`
 * carries the conversation; every other type starts fresh. Undefined for a
 * harness whose agent tool the hook does not read.
 * @param harness the harness the adapter names
 * @param payload the before-tool event's payload
 * @returns the provenance, or undefined
 */
export function launchProvenance(harness: Harness, payload: JsonValue): Provenance | undefined {
  if (agentPromptOf(harness, payload) === undefined) return undefined;
  return subagentType.parse(payload).tool_input?.subagent_type === "fork" ? "forked" : "fresh";
}

const rolloutCall = z.object({
  type: z.literal("response_item"),
  payload: z.object({
    type: z.literal("function_call"),
    name: z.literal("spawn_agent"),
    arguments: z.string(),
    call_id: z.string().min(1),
  }),
});

const spawnArguments = z
  .object({ fork_turns: z.union([z.string(), z.number()]).optional().catch(undefined) })
  .catch({});

/**
 * The helpers a Codex session's rollout shows it spawned (J-176 S1): each
 * `spawn_agent` call by its id, fresh where its arguments say `fork_turns`
 * `none` and forked otherwise, since an omitted `fork_turns` inherits the
 * builder's whole history.
 * @param lines the rollout's lines, each one JSON object
 * @returns the helpers, in the order spawned
 */
export function rolloutSpawns(lines: readonly string[]): readonly HelperStart[] {
  return lines.flatMap((line) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return [];
    }
    const read = rolloutCall.safeParse(parsed);
    if (!read.success) return [];
    let turns: string | number | undefined;
    try {
      turns = spawnArguments.parse(JSON.parse(read.data.payload.arguments)).fork_turns;
    } catch {
      turns = undefined;
    }
    return [
      {
        agent: read.data.payload.call_id,
        provenance: turns === "none" || turns === 0 ? "fresh" : "forked",
        via: "rollout",
      },
    ];
  });
}

/**
 * The helpers line the mirror and status print as a hint (J-176 S1):
 * `helpers: 2 started, 1 fresh and 1 forked`, undefined while none started.
 * @param starts the helpers the hooks saw start, each once
 * @returns the line, unindented
 */
export function helpersLine(starts: readonly HelperStart[]): string | undefined {
  if (starts.length === 0) return undefined;
  const fresh = starts.filter((start) => start.provenance === "fresh").length;
  const forked = starts.length - fresh;
  const parts = [
    ...(fresh === 0 ? [] : [`${String(fresh)} fresh`]),
    ...(forked === 0 ? [] : [`${String(forked)} forked from the builder`]),
  ];
  return `helpers: ${String(starts.length)} started, ${parts.join(" and ")}, as the hooks saw them; the agents line is yours to write`;
}
