/**
 * The ground (`docs/SPEC.md`, "The change record"; the register's rows of
 * 2026-10-22 on the ground and the identity): where a change's commits go
 * and who made them. The record's `ground` line states it, `branch` for a
 * branch the change works on in place, the current one or one of its own,
 * or `worktree: <path>` for a checkout of its own; its `agent` line names
 * the harness and the model as the harness states it, `<harness>/<model>`,
 * which every commit carries as its `Greenline-Agent` trailer. The
 * manifest's `ground` is the owner's standing preference, stated at the
 * proposal instead of asked. One reader turns the lines into the line the
 * status mirror and `greenline status` print, so the two never disagree.
 * The module is pure: git's facts reach it from the shell.
 */
import { z } from "zod";
import { parseJson, type JsonValue } from "./contract.ts";

/** The ground a record states: in place on a branch, or a worktree at a path. */
export type Ground =
  | { readonly kind: "branch" }
  | { readonly kind: "worktree"; readonly path: string };

/** The manifest's standing preference, the two grounds the proposal offers. */
export type GroundSetting = "branch" | "worktree";

/** The two values the manifest's `ground` takes. */
export const GROUND_SETTINGS: readonly GroundSetting[] = ["branch", "worktree"];

/** The record's agent line: the harness's name and the model as the harness states it. */
export interface AgentLine {
  readonly harness: string;
  readonly model: string;
}

const WORKTREE = /^worktree: (\S(?:.*\S)?)$/;
const AGENT = /^([a-z][a-z0-9-]*)\/(\S(?:.*\S)?)$/;

/**
 * Parse the record's `ground` line.
 * @param text the line's text
 * @returns the ground, or undefined when it is neither `branch` nor `worktree: <path>`
 */
export function parseGround(text: string): Ground | undefined {
  if (text === "branch") return { kind: "branch" };
  const path = WORKTREE.exec(text)?.[1];
  return path === undefined ? undefined : { kind: "worktree", path };
}

/**
 * The `ground` line's text for a ground, as the record writes it.
 * @param ground the ground
 * @returns `branch` or `worktree: <path>`
 */
export function groundText(ground: Ground): string {
  return ground.kind === "branch" ? "branch" : `worktree: ${ground.path}`;
}

/**
 * Parse the record's `agent` line.
 * @param text the line's text
 * @returns the harness and the model, or undefined when it is not `<harness>/<model>`
 */
export function parseAgent(text: string): AgentLine | undefined {
  const match = AGENT.exec(text);
  const harness = match?.[1];
  const model = match?.[2];
  return harness === undefined || model === undefined ? undefined : { harness, model };
}

/** What the ground line reads: the branch HEAD names, the record's two lines as it states them, and the harness that fires the hook. */
export interface GroundFacts {
  /** The branch HEAD names; undefined at a detached HEAD. */
  readonly branch: string | undefined;
  /** The record's `ground` line as written; undefined where it states none. */
  readonly ground: string | undefined;
  /** The record's `agent` line as written; undefined where it states none. */
  readonly agent: string | undefined;
  /** The harness the running adapter names, when one does. */
  readonly harness?: string | undefined;
  /** The model the harness reports for the session, from its hook payload or its transcript, when it reports one (J-143 S2). */
  readonly model?: string | undefined;
}

function whereText(facts: GroundFacts): string {
  const on = facts.branch === undefined ? "a detached HEAD" : facts.branch;
  const stated = facts.ground === undefined ? undefined : parseGround(facts.ground);
  if (stated === undefined)
    return facts.ground === undefined
      ? `not stated, on ${on}`
      : `'${facts.ground}' is neither branch nor worktree: <path>, on ${on}`;
  return stated.kind === "branch" ? `branch ${on}` : `worktree ${stated.path} on ${on}`;
}

function agentText(facts: GroundFacts): string {
  const reported =
    facts.harness === undefined || facts.model === undefined
      ? undefined
      : `${facts.harness}/${facts.model}`;
  if (facts.agent !== undefined) {
    const stated = parseAgent(facts.agent);
    if (stated === undefined) return `'${facts.agent}' is not <harness>/<model>`;
    // A model the harness reports otherwise is the line to write, never a family name alone (J-143 S2).
    return reported === undefined ||
      stated.harness !== facts.harness ||
      stated.model === facts.model
      ? facts.agent
      : `${facts.agent}, and the harness reports the model ${facts.model ?? ""}; write ${reported} in the record's agent line`;
  }
  if (facts.harness === undefined) return "not stated";
  return reported === undefined
    ? `not stated; write ${facts.harness}/<the model, as the harness states it>`
    : `not stated; write ${reported}, the model the harness reports`;
}

/** A model's name as a harness's payload or transcript gives it: a name, or an object's `id`; one word, never blank. */
const MODEL_NAME = z
  .union([z.string(), z.object({ id: z.string() }).transform((value) => value.id)])
  .transform((name) => name.trim())
  .refine((name) => name !== "" && !/\s/.test(name));

/** What names a model: a payload or a message with a `model` field. */
const NAMES_MODEL = z.object({ model: MODEL_NAME });

/**
 * The model a hook's payload names for the session, its `model` field, a
 * name or an object with an `id` (J-143 S2); undefined where it names none.
 * @param payload the hook's payload as parsed
 * @returns the model's name, as the harness gives it
 */
export function payloadModel(payload: JsonValue | undefined): string | undefined {
  const read = NAMES_MODEL.safeParse(payload);
  return read.success ? read.data.model : undefined;
}

/** What a transcript's line is read for: its type, and the payload or the message that names a model. */
const TRANSCRIPT_LINE = z.object({
  type: z.string(),
  payload: NAMES_MODEL.optional().catch(undefined),
  message: NAMES_MODEL.optional().catch(undefined),
});

/**
 * The model a session's transcript last names (J-143 S2): a Codex rollout's
 * `turn_context` line, whose payload names the turn's model, or a Claude
 * Code transcript's assistant message, which names the model that wrote it.
 * Read from the last line back, so the latest turn's model wins.
 * @param lines the transcript's lines, JSON each
 * @returns the model's name, or undefined where no line names one
 */
export function transcriptModel(lines: readonly string[]): string | undefined {
  for (const text of [...lines].reverse()) {
    if (!text.includes('"model"')) continue;
    const read = TRANSCRIPT_LINE.safeParse(parseJson(text));
    if (!read.success) continue;
    const line = read.data;
    const found =
      line.type === "turn_context"
        ? line.payload?.model
        : line.type === "assistant"
          ? line.message?.model
          : undefined;
    if (found !== undefined && found !== "<synthetic>") return found;
  }
  return undefined;
}

/**
 * The ground line the mirror and `greenline status` print for the open
 * change: `ground: branch greenline/<id>; agent: claude-code/opus`, or
 * `ground: worktree <path> on <branch>; ...`.
 * @param facts the branch, the record's lines and the harness
 * @returns the line, unindented
 */
export function groundLine(facts: GroundFacts): string {
  return `ground: ${whereText(facts)}; agent: ${agentText(facts)}`;
}

/** The local facts that give a change's ground before one opens: the branch HEAD names, and whether the proposal offers the two grounds. */
export interface LocalGround {
  /** The branch HEAD names; undefined at a detached HEAD. */
  readonly branch: string | undefined;
  /** True where the repository has a remote and HEAD names its default branch, so the proposal offers a branch of its own or a worktree. */
  readonly offered: boolean;
}

/**
 * The ground line while no change is open: the manifest's standing
 * preference, which the proposal states instead of asking; the offer of a
 * branch of its own or a worktree, where the repository has a remote and
 * HEAD names its default branch; and elsewhere the branch the local facts
 * give, so a request that names its mode, where no proposal waits, states
 * the ground this line names before the first edit (J-143 S1).
 * @param setting the manifest's `ground`, undefined where it sets none
 * @param local the branch HEAD names and whether the proposal offers the two grounds, undefined where unread
 * @returns the line, unindented
 */
export function groundSettingLine(setting: GroundSetting | undefined, local?: LocalGround): string {
  if (setting !== undefined)
    return `ground: no change open; the manifest's standing choice is ${setting}, stated at the proposal`;
  if (local === undefined || local.branch === undefined)
    return "ground: no change open; the proposal offers it";
  return local.offered
    ? "ground: no change open; the proposal offers a branch of its own, greenline/<id>, or a worktree"
    : `ground: no change open; the local facts give branch ${local.branch}, stated before the first edit`;
}

/** One checkout `git worktree list --porcelain` names. */
export interface WorktreeEntry {
  readonly path: string;
  /** The branch it has checked out, its short name; undefined at a detached HEAD. */
  readonly branch: string | undefined;
  /** True for the repository's main checkout, the list's first entry. */
  readonly main: boolean;
}

/**
 * The checkouts `git worktree list --porcelain` prints: a `worktree <path>`
 * line opening each, a `branch refs/heads/<name>` line where one is checked
 * out, an empty line between them; a bare entry is left out.
 * @param output git's output
 * @returns the entries, the main checkout first
 */
export function parseWorktreeList(output: string): readonly WorktreeEntry[] {
  const blocks = output
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter((line) => line !== ""))
    .filter((lines) => lines.length > 0);
  return blocks.flatMap((lines, index): WorktreeEntry[] => {
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (path === undefined || lines.includes("bare")) return [];
    const ref = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length);
    const branch =
      ref?.startsWith("refs/heads/") === true ? ref.slice("refs/heads/".length) : undefined;
    return [{ path, branch, main: index === 0 }];
  });
}

/**
 * The line a branch that predates the practice gets (J-193 S1, the run
 * j109t-wait-proceed-1d, where a branch cut before the install held no
 * manifest and the agent read its instructions as withdrawn): the branch
 * holds no manifest where the default branch holds one, so nothing of the
 * practice stands there, and the way back. `greenline status` fails with it
 * and the harness's hooks print it at a session's and a turn's start; the
 * install stays the default branch's, never written by a hook.
 * @param branch the branch HEAD names, or `HEAD` when it is detached
 * @param base the default branch, which holds the manifest
 * @returns the line, unindented
 */
export function predatesLine(branch: string, base: string): string {
  return `${predatesWayBack(branch, base)}, and the practice stands again`;
}

/** The branch's fact and the way back, which both readers of a branch cut before the install print. */
function predatesWayBack(branch: string, base: string): string {
  return `this branch predates the practice: ${branch} holds no .greenline/manifest.json where ${base} holds one, so greenline's instructions and hooks hold nothing here; switch to ${base} or merge it into ${branch}, \`git switch ${base}\` or \`git merge ${base}\``;
}

/**
 * The line `greenline status` prints on a branch that predates the
 * practice (J-206 S1, the run j196t-wait-proceed-1b, whose session ran on
 * the old branch with no hook loaded, merged the base as the line asked
 * and then edited the code with no record, nothing refusing it): the
 * branch's fact and the way back, then that a switch or a merge brings the
 * practice's files to the tree and not to the running session, since a
 * harness loads its hooks at a session's start, so the owner starts a new
 * session once it is done and nothing is edited until then. The hooks
 * print `predatesLine` instead: a hook that prints runs in the session.
 * @param branch the branch HEAD names, or `HEAD` when it is detached
 * @param base the default branch, which holds the manifest
 * @returns the line, unindented
 */
export function predatesStatusLine(branch: string, base: string): string {
  return `${predatesWayBack(branch, base)}; either brings the practice's files to the tree but not to the running session, since a harness loads its hooks at a session's start, so once it is done the owner starts a new session, where the practice stands again, and nothing is edited until then`;
}
