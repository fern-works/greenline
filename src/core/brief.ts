import { sha256Hex } from "../commons/hash.ts";
import type { ChangeRecord } from "./change.ts";
import { depthOf, type Mode, type ModesDefinition, type StepName } from "./modes.ts";
import type { TicketsFile } from "./plan-documents.ts";

/**
 * The brief a fresh agent of the review or the verify step is started with,
 * written by `greenline brief` and never by the builder
 * (`workshop/components/cli-contracts.md`, "The brief command"): the one
 * brief the ledger guide states, composed from the change record, its
 * acceptance and the step's template, with the command's mark on its first
 * line. The mark names the command that wrote the file and the digest of
 * every byte after it, so `status` can tell a brief the command wrote from
 * one written, copied or edited by hand. Everything here is pure; the shell
 * reads the record and the tickets file and writes the file.
 */

/** The steps whose fresh agents the command briefs; anticipate's brief stays the builder's. */
export const BRIEF_STEPS = ["review", "verify"] as const;
export type BriefStep = (typeof BRIEF_STEPS)[number];

/** The review's two axes, where two agents review one after another. */
export const AXES = ["standards", "spec"] as const;
export type Axis = (typeof AXES)[number];

/** What the builder asks for. */
export interface BriefRequest {
  readonly change: string;
  readonly step: BriefStep;
  /** The agent's number at the independent depth, the round's at the looped depth. */
  readonly round: number;
  readonly axis: Axis | undefined;
  /** Review's extra: the builder's one paragraph of intent. */
  readonly intent: string | undefined;
}

/** What the brief is composed from. */
export interface BriefSources {
  readonly definition: ModesDefinition;
  readonly record: ChangeRecord;
  /** The record's text, whose front matter the brief carries as it stands. */
  readonly recordText: string;
  /** The plan's tickets file, read when the record names a ticket; undefined when it is absent or does not parse. */
  readonly tickets: TicketsFile | undefined;
  /** The installed paths of the page the agent reads whole, from the repository root; none when no harness tree holds it. */
  readonly skillPages: readonly string[];
  /** The agent's own scratch folder, `.greenline/tmp/<id>/<step>-<n>/`, by its absolute path, as `greenline check --round` sets `TMPDIR` to it. */
  readonly scratch: string;
}

/** The brief to write, or why the command refuses it. */
export type BriefOutcome =
  | { readonly _tag: "brief"; readonly file: string; readonly text: string }
  | { readonly _tag: "refused"; readonly message: string };

/** How `status` reads one brief file of a change's folder. */
export type BriefReading =
  | { readonly kind: "written"; readonly step: BriefStep; readonly round: number }
  | { readonly kind: "unmarked" }
  | { readonly kind: "altered" };

const LEDGER = ".greenline/ledger";
const INTENT_PLACE = '<the paragraph under "Intent">';
const MARK_TAIL =
  "written by the command: the builder never opens, copies, diffs, edits or derives this file";
const MARK =
  /^<!-- (greenline brief --change (\S+) --step (review|verify) --round ([1-9]\d*)(?: --axis (standards|spec))?(?: --intent <the paragraph under "Intent">)?) sha256:([0-9a-f]{64}); .* -->$/;
/** A brief file's name: a top-level file of the folder named for a step and a number, or any `brief-*.md` written by hand. */
const BRIEF_FILE = /^brief-[^/]*\.md$/;

/**
 * The brief's file name in the change's folder.
 * @param step the step its agent serves
 * @param round the agent's or the round's number
 * @returns `brief-<step>-<n>.md`
 */
export function briefFileName(step: string, round: number): string {
  return `brief-${step}-${String(round)}.md`;
}

/**
 * Whether a file of a change's folder is a brief file, which `status` reads.
 * @param file the file's path relative to the folder
 * @returns true for a top-level `brief-*.md`
 */
export function isBriefFile(file: string): boolean {
  return BRIEF_FILE.test(file);
}

/** The command's words as the builder gave them and the mark names them, the intent's paragraph named by its place. */
function commandWords(request: BriefRequest): string {
  return [
    `greenline brief --change ${request.change} --step ${request.step} --round ${String(request.round)}`,
    request.axis === undefined ? "" : ` --axis ${request.axis}`,
    request.intent === undefined ? "" : ` --intent ${INTENT_PLACE}`,
  ].join("");
}

/** The record's front matter as it stands, between its two `---` lines. */
function frontMatterOf(text: string): string {
  const lines = text.split(/\r?\n/);
  const end = lines.indexOf("---", 1);
  return lines.slice(1, end === -1 ? 1 : end).join("\n");
}

/** Where the acceptance comes from and its text, or the refusal when the record lacks it. */
function acceptanceOf(
  sources: BriefSources,
  mode: Mode,
): { readonly from: string; readonly text: string } | { readonly refused: string } {
  const { record } = sources;
  const ticket = record.belongs?.ticket;
  if (record.belongs !== undefined && ticket !== undefined) {
    const where = `.greenline/plans/${record.belongs.plan}/tickets.md`;
    const entry = sources.tickets?.tickets.find((candidate) => candidate.id === ticket);
    if (entry === undefined)
      return {
        refused: `the record names the ticket '${ticket}', and ${where} holds no entry of that id that parses; correct the tickets file or the record`,
      };
    return {
      from: `the acceptance of the ticket \`${ticket}\`, its entry in \`${where}\``,
      text: entry.acceptance.map((line) => `- ${line}`).join("\n"),
    };
  }
  // SAFETY: "plan" is a step of every definition the parse accepts.
  const step = depthOf(mode, "plan" as StepName).depth === "none" ? "frame" : "plan";
  const section = record.sections.find((candidate) => candidate.step === step);
  if (section === undefined || section.text === "")
    return {
      refused:
        step === "plan"
          ? `the record's plan section, which holds the acceptance, is not written yet; write it before the step starts its agent`
          : "the record's frame section, which holds the acceptance where the mode skips the plan, is not written yet; write it first",
    };
  return {
    from:
      step === "plan"
        ? "the record's plan section, whole"
        : "the record's frame section, whole, since the mode skips the plan",
    text: section.text,
  };
}

/** The axis this agent reads, or the refusal of the one asked for. */
function axisOf(
  request: BriefRequest,
  agents: number | undefined,
): { readonly axis: Axis | undefined } | { readonly refused: string } {
  if (request.step !== "review" || agents !== 2) {
    if (request.axis === undefined) return { axis: undefined };
    return {
      refused:
        request.step === "review"
          ? "--axis names the one axis an agent reads where two review one after another; here one agent reads both"
          : "--axis is review's; verify adds nothing to the brief",
    };
  }
  const derived: Axis = request.round === 1 ? "standards" : "spec";
  if (request.axis !== undefined && request.axis !== derived)
    return {
      refused: `review ${String(request.round)} of two reads the ${derived} axis, the first reading standards and the second spec; give --axis ${derived} or none`,
    };
  return { axis: derived };
}

/**
 * Compose the brief for one fresh agent of the review or the verify step.
 * It refuses a record that is not open, a step the record's mode runs below
 * the independent depth, a number past the agents or rounds the depth gives,
 * a review without its intent and the extras out of place, and a record
 * whose acceptance is not written.
 * @param request what the builder asked for
 * @param sources the record, its acceptance's sources and the installed skill page
 * @returns the file's path from the repository root and its text, or the refusal
 */
export function composeBrief(request: BriefRequest, sources: BriefSources): BriefOutcome {
  const refused = (message: string): BriefOutcome => ({ _tag: "refused", message });
  const { record, definition } = sources;
  if (record.position.state !== "open")
    return refused(
      `the change '${request.change}' is ${record.position.state}; a brief is written only for an open change, so set a stopped one open first`,
    );
  const mode = definition.modes.find((candidate) => candidate.name === record.mode);
  if (mode === undefined) return refused(`the record's mode '${record.mode}' is not a mode`);
  // SAFETY: both brief steps are steps of every definition the parse accepts.
  const depth = depthOf(mode, request.step as StepName);
  if (depth.depth !== "independent" && depth.depth !== "looped")
    return refused(
      `the ${request.step} step runs at the ${depth.depth} depth under ${mode.name}, where no fresh agent is started, so no brief is written`,
    );
  const most = depth.depth === "independent" ? depth.agents : depth.rounds;
  if (request.round > most)
    return refused(
      `${request.step} under ${mode.name} gives ${String(most)} ${depth.depth === "independent" ? (most === 1 ? "agent" : "agents") : most === 1 ? "round" : "rounds"}, so --round is 1 to ${String(most)}`,
    );
  if (request.step === "review" && (request.intent === undefined || request.intent.trim() === ""))
    return refused(
      "review's brief carries the builder's paragraph of intent: give it with --intent",
    );
  if (request.step === "verify" && request.intent !== undefined)
    return refused("--intent is review's; verify adds nothing to the brief");
  const axis = axisOf(request, depth.depth === "independent" ? depth.agents : undefined);
  if ("refused" in axis) return refused(axis.refused);
  const acceptance = acceptanceOf(sources, mode);
  if ("refused" in acceptance) return refused(acceptance.refused);

  const id = request.change;
  const report = `${LEDGER}/${id}/${request.step}-${String(request.round)}.md`;
  const pages =
    sources.skillPages.length === 0
      ? `the installed ${request.step} skill's ${request.step === "review" ? "`references/brief.md`" : "`SKILL.md`"}`
      : sources.skillPages.map((page) => `\`${page}\``).join(" or ");
  const skill =
    request.step === "review"
      ? `Read the reviewer's brief whole, ${pages}, the review skill's page for its reviewer, with the reference files it names, and review the change's commits by it.`
      : // Since J-93 S2 verify's recorder and its paths stand on its references page, not its front.
        `Read the verify skill whole, ${pages}, with its references page, \`references/greenline.md\` beside it, and verify every item of the acceptance by them.`;
  const extras =
    request.step === "review"
      ? [
          "## Review's extras",
          "",
          "### Intent",
          "",
          (request.intent ?? "").trim(),
          "",
          "### The axis",
          "",
          axis.axis === undefined
            ? "You read both axes, Standards and Spec, in one pass, each under its own heading."
            : `You read the ${axis.axis === "standards" ? "Standards" : "Spec"} axis alone; another agent reads the other.`,
        ]
      : ["## The step's extras", "", "Verify adds nothing to this brief."];
  const body = [
    "",
    `# The brief for ${request.step} ${String(request.round)} of ${id}`,
    "",
    "This is the one brief every fresh agent gets (`.greenline/ledger/README.md`, \"The brief and the relay note\"), written from the change record by `greenline brief`. Nothing else comes with it: never the builder's other sections, its diagnosis or another agent's findings, which are the builder's claims.",
    "",
    "## The change",
    "",
    `The change's id is \`${id}\`. Its record's front matter:`,
    "",
    "```text",
    frontMatterOf(sources.recordText),
    "```",
    "",
    "## The acceptance",
    "",
    `From ${acceptance.from}:`,
    "",
    acceptance.text,
    "",
    "## Your report",
    "",
    `Write your report to \`${report}\`, and only there.`,
    "",
    "## Your scratch folder",
    "",
    [
      `Your scratch folder is \`${sources.scratch}\`.`,
      `Every file you write on the way that is not your report, a probe, a scratch script or a before-and-after copy, goes in it, or where the skill you work by names under the change's working folder, \`.greenline/tmp/${id}/\`.`,
      "The host's temporary directory is never used, and a working file there is a finding.",
      `Run each check of the change's code as \`greenline check --change ${id} --step ${request.step} --round ${String(request.round)} -- <command>\`, which sets \`TMPDIR\` to your scratch folder for the command it records.`,
    ].join(" "),
    "",
    "## The skill you work by",
    "",
    skill,
    "",
    ...extras,
    "",
    "## No agent of your own",
    "",
    "Do your whole step yourself: start no agent of your own.",
    "",
  ]
    .join("\n")
    // A carriage return the intent brought is written as `readBrief` reads it, so the digest holds.
    .replace(/\r\n/g, "\n");
  const words = commandWords(request);
  const mark = `<!-- ${words} sha256:${digestOf(words, body)}; ${MARK_TAIL} -->`;
  return {
    _tag: "brief",
    file: `${LEDGER}/${id}/${briefFileName(request.step, request.round)}`,
    text: `${mark}\n${body}`,
  };
}

/** The digest the mark names: the command's words and every byte after the mark's line, so neither can change alone. */
function digestOf(words: string, body: string): string {
  return sha256Hex(`${words}\n${body}`);
}

/**
 * Read one brief file of a change's folder: written by the command when its
 * first line is the command's mark naming this change, this step and this
 * number, and the mark's words with every byte after its line are the ones
 * its digest names; altered when it carries a mark that does not hold;
 * unmarked otherwise. Line endings are read as a checkout may have turned
 * them, a carriage return before each newline taken as none.
 * @param change the change whose folder holds the file
 * @param file the file's name in the folder
 * @param given the file's text
 * @returns how status reads it
 */
export function readBrief(change: string, file: string, given: string): BriefReading {
  const text = given.replace(/\r\n/g, "\n");
  const newline = text.indexOf("\n");
  const first = newline === -1 ? text : text.slice(0, newline);
  if (!first.startsWith("<!-- greenline brief ")) return { kind: "unmarked" };
  const mark = MARK.exec(first);
  if (mark === null) return { kind: "altered" };
  const [, words, named, step, round, , digest] = mark;
  const rest = newline === -1 ? "" : text.slice(newline + 1);
  if (
    words === undefined ||
    named !== change ||
    (step !== "review" && step !== "verify") ||
    file !== briefFileName(step, Number(round)) ||
    digestOf(words, rest) !== digest
  )
    return { kind: "altered" };
  return { kind: "written", step, round: Number(round) };
}
