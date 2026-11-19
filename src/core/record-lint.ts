import { z } from "zod";
import { isHarness, runningSurface } from "./adapters.ts";
import { issuesLine, parseRecordForm, type RecordForm } from "./change.ts";
import { parseAgent } from "./ground.ts";
import {
  agentFamilyAlone,
  CAREFUL_MODE,
  FLOORS_CURE,
  isPlaceholder,
  joined,
  marksClause,
  OUTCOME_CAP,
  recordLack,
  yesLackClause,
  yesNotHeld,
  type OwnerJournal,
  type ReportedModel,
} from "./record-lines.ts";
import { parseDiscussionRecord } from "./discussion.ts";
import { frameMapOf, researchTopicsOf, SUBJECT_NODES } from "./frame-map.ts";
import { heldText, type PageHeld } from "./habits-owed.ts";
import { fieldData, parseFrontMatter } from "./front-matter.ts";
import {
  agentsAtMost,
  roundsAtMost,
  stepApplies,
  type Depth,
  type ModesDefinition,
} from "./modes.ts";
import { COMPONENTS, isOnList } from "./interface-facets.ts";
import { namedFloors } from "./record-interface.ts";

/**
 * The record lint (J-149 S1; the ledger guide, "The sections", "Planned
 * work"): the forms of a change record the agent writes from memory, read
 * where a fact can read them, so done is refused on a breach and status
 * names one while the record is open. Five readings, each naming its
 * breach in one sentence with its remedy:
 *
 * - a section at the independent or looped depth cites its own step's
 *   reports alone, `<id>/<step>-<n>.md` in the change's folder, as many as
 *   the depth starts agents (an independent depth's agents, a looped
 *   depth's rounds); a planning change counts its tickets' reports;
 * - every question of a written frame's list form holds its answer and who
 *   decided, owner or agent, or `answer: open` where the owner left it open;
 * - a done record states every line its mode owes, the agent's words in
 *   each, and no line or section still holds the skeleton's placeholder
 *   (J-176 S1), nor a start section the word none, which the skeleton
 *   leaves out (J-202 S1);
 * - a done change loaded each skill its trigger rows owed it, a habit or a
 *   start, part or whole, or the record names the owner's waiver (J-176 S1);
 * - each research topic the owner accepted at frame is answered by its
 *   report, which `greenline research report` filed and the frame section
 *   links (J-176 S1);
 * - a plan the change extended holds no edit left uncommitted at its close;
 * - the close section's `marks:` line is the line `greenline status` prints
 *   from the marks files, copied as it stands, and stands wherever a mark
 *   is open (J-148 S3);
 * - every floor finding the record's `## Interface` section names carries
 *   the owner's ruling, `fixed` or `waived, "<their words>"` (J-148 S3);
 * - an accepted record's `yes` line quotes the owner's words, and where the
 *   hooks journaled the owner's messages, one of them holds those words and
 *   reads as a yes (J-151 S2, J-176 S1);
 * - a done record states its `outcome` line, and the line holds at most
 *   two hundred characters wherever it stands (J-168 S1);
 * - an `overrun` line, the owner's words accepting a cost past the mode's
 *   count, stands only beside a cost past it (J-174);
 * - at careful, read by the record's mode line, the frame section covers
 *   every subject node, asked or closed with a reason, and holds its
 *   restatement, and a done record holds the owner's `confirmed` line
 *   (J-223 S1).
 *
 * Pure: the shell reads the record, the facts and the plan's state. The
 * readers module exports it, so the QA apparatus reads records by the
 * product's own lint.
 */

/** What a breach is of, by the form it reads. */
export type RecordLintRule =
  | "reports"
  | "frame"
  | "lines"
  | "owed"
  | "research"
  | "plan"
  | "discussion"
  | "marks"
  | "floor"
  | "yes"
  | "outcome"
  | "visuals"
  | "check-report"
  | "components"
  | "overrun"
  | "agent"
  | "careful";

/** One breach: the form it reads, and the sentence naming it with its remedy. */
export interface RecordBreach {
  readonly rule: RecordLintRule;
  readonly message: string;
}

/** What the lint reads of one record. */
export interface RecordLintInput {
  /** The change's id, its record's file name without `.md`. */
  readonly id: string;
  /** The record's text. */
  readonly text: string;
  /** The modes definition the record is judged under; undefined reads no depth, so no section's reports are counted. */
  readonly definition?: ModesDefinition | undefined;
  /** The skills the change's facts loaded, by name; undefined where the facts were not read, so the owed skills are not read. */
  readonly loaded?: readonly string[] | undefined;
  /**
   * The skills the change owed by its trigger rows, each a habit or a start
   * with the trigger that owed it (J-176 S1); undefined where they were not
   * computed, so no owed load is read.
   */
  readonly owed?: readonly OwedAtDone[] | undefined;
  /** The plan files the change left with edits outside the commit at hand, from the root; undefined where git was not read. */
  readonly planEdits?: readonly string[] | undefined;
  /**
   * The `marks:` line `greenline status` prints now, read from the marks
   * files, its `line` undefined while no mark is open; undefined where the
   * marks were not read, so the close's line is not read (J-148 S3).
   */
  readonly marks?: { readonly line: string | undefined } | undefined;
  /**
   * The owner's messages the hooks journaled, which an accepted record's
   * `yes` line quotes; undefined where they were not read, so the yes is
   * not read (J-151 S2, J-176 S1).
   */
  readonly journal?: OwnerJournal | undefined;
  /**
   * The change's folder as it stands: its files, relative to it, and how
   * many visuals its links file lists, none where it stands nowhere;
   * undefined where the folder was not read, so its links are not read
   * (J-173 S1).
   */
  readonly folder?: { readonly files: readonly string[]; readonly visuals: number } | undefined;
  /**
   * The harness and the model it reports for the session, as the hooks
   * noted it; undefined where it reports none, so the agent line is
   * admitted as it stands (J-192 S1).
   */
  readonly reported?: ReportedModel | undefined;
}

/** The line the close writes while no mark is open. */
const NO_MARKS_LINE = "marks: none open";

/** A section's lines in a record's text, its heading matched exactly; none where it holds none. */
function sectionLines(text: string, heading: string): readonly string[] {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);
  if (at === -1) return [];
  const after = lines.slice(at + 1);
  const next = after.findIndex((line) => line.startsWith("## "));
  return next === -1 ? after : after.slice(0, next);
}

/**
 * The close's marks line against the marks files (J-148 S3): the close
 * copies the line `greenline status` prints, so a mark the owner closed is
 * never said waiting and an open one is never left out.
 * @param text the record's text
 * @param status the line status prints now, undefined while none is open
 * @returns the breach, none where the close agrees with the files
 */
function marksBreaches(text: string, status: string | undefined): readonly RecordBreach[] {
  // The marks line on a line of its own, or a clause read to its line's end, as a quick close's one line carries it (J-226 S1).
  const said = sectionLines(text, "close")
    .map(marksClause)
    .find((clause) => clause !== undefined);
  const expected = status ?? NO_MARKS_LINE;
  if (said === undefined)
    return status === undefined
      ? []
      : [
          {
            rule: "marks",
            message: `the close section names no marks line while the marks files hold open marks: copy the line greenline status prints, "${status}"`,
          },
        ];
  return said.trim() === expected
    ? []
    : [
        {
          rule: "marks",
          message: `the close section's marks line says "${said.trim()}", and the marks files say "${expected}": copy the marks line greenline status prints as it stands, never from memory`,
        },
      ];
}

/**
 * The floor findings the record's `## Interface` section names with no
 * owner's ruling (J-148 S3): each waits for the owner's answer on a card,
 * written `fixed` or `waived, "<their words>"`.
 * @param text the record's text
 * @returns one breach per finding with no ruling
 */
function floorBreaches(text: string): readonly RecordBreach[] {
  return namedFloors(text)
    .filter((floor) => floor.ruling.kind === "none")
    .map((floor) => ({
      rule: "floor",
      message: `the floor finding ${floor.rule}${floor.where === "" ? "" : ` at ${floor.where}`} has no ruling of the owner's: put it to the owner on a card, then write their answer in the ## Interface section, \`- floor ${floor.rule}: fixed\` once fixed or \`- floor ${floor.rule}: waived, "<their words>"\``,
    }));
}

/** A change id at the head of a link into a change's folder. */
const FOLDER_LINK = /^(?:\.\/)?(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\/(.+)$/;

/** A Markdown link's target. */
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;

/** The links file the record links once, never a report. */
const LINKS_FILE = "visuals.json";

/** A section's line that is no writing: the skeleton's placeholder, or a depth's none line. */
const UNWRITTEN = /^(?:<[^>]*>|none at [a-z][a-z0-9-]*|none, no interface)$/;

/**
 * Whether a section holds anything written beyond its skeleton.
 * @param text the section's text
 * @returns true where one line is written
 */
function written(text: string): boolean {
  return text
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line !== "" && !UNWRITTEN.test(line));
}

/**
 * The links a section makes into a change's folder: its own, or any change's
 * where the record is a planning change counting its tickets' reports; the
 * record's links file left out.
 * @param text the section's text
 * @param id the change's id
 * @param anyChange whether a link into another change's folder counts
 * @returns each link as written, with the folder's change and the file in it
 */
function folderLinks(
  text: string,
  id: string,
  anyChange: boolean,
): readonly { readonly link: string; readonly change: string; readonly file: string }[] {
  return [...text.matchAll(LINK)].flatMap((match) => {
    const link = match[1] ?? "";
    const found = FOLDER_LINK.exec(link);
    const change = found?.[1];
    // A link to a heading in a report is a link to the report.
    const file = found?.[2]?.replace(/#.*$/, "");
    if (change === undefined || file === undefined) return [];
    if (change !== id && !anyChange) return [];
    if (change === id && file === LINKS_FILE) return [];
    return [{ link, change, file }];
  });
}

/** The `starts` line's items as text; an item of another shape leaves the line unread. */
const STARTS = z.array(z.string());

/**
 * The steps the record's `starts` names a fresh agent of, `"<step> <n>"`
 * with or without `restarted`; none where it names none or does not read.
 * @param text the record's text
 * @returns the steps
 */
function startedSteps(text: string): ReadonlySet<string> {
  const document = parseFrontMatter(text, "a change record");
  if (document._tag === "err") return new Set();
  const starts = STARTS.safeParse(fieldData(document.value.fields)["starts"]);
  if (!starts.success) return new Set();
  return new Set(starts.data.map((start) => /^([a-z][a-z0-9-]*) /.exec(start)?.[1] ?? ""));
}

/** A depth's agents, or its rounds where it loops; none for any other depth. */
function citedBy(depth: Depth): "independent" | "looped" | undefined {
  return depth.depth === "independent" || depth.depth === "looped" ? depth.depth : undefined;
}

/** The reports' readings: each step section at a depth that starts fresh agents cites its own reports, as many as it starts. */
function reportBreaches(
  form: RecordForm,
  definition: ModesDefinition | undefined,
  started: ReadonlySet<string>,
): readonly RecordBreach[] {
  const mode = definition?.modes.find((entry) => entry.name === form.mode);
  if (definition === undefined || mode === undefined) return [];
  // Where the harness has no delegation, a depth that needs a fresh agent runs without one, the
  // section naming the limit (the block's step 4): where the agent line names a harness the
  // adapters' table lists without delegation `yes`, a step the record's `starts` names no agent
  // of owes no report. A record whose agent line names no harness of the table owes them all.
  const harness = form.agent === undefined ? undefined : parseAgent(form.agent)?.harness;
  const delegates =
    harness === undefined || !isHarness(harness) || runningSurface(harness).delegation === "yes";
  const planning = form.belongs !== undefined && form.belongs.ticket === undefined;
  const touches = form.interface?.touches === true;
  const breaches: RecordBreach[] = [];
  for (const section of form.sections) {
    const step = definition.steps.find((entry) => entry.name === section.heading);
    const depth = step === undefined ? undefined : mode.steps[step.name];
    if (step === undefined || depth === undefined) continue;
    const by = citedBy(depth);
    // A step that runs only on an interface change is held at its depth where the record says yes.
    if (by === undefined || !stepApplies(step, { interface: touches }) || !written(section.text))
      continue;
    // A review the record says ran below its depth, inline as the fallback runs it, owes no report.
    if (
      step.name === "review" &&
      (form.reviewed === "none" || form.reviewed === "inline" || form.reviewed === "written")
    )
      continue;
    if (!delegates && !started.has(step.name)) continue;
    const report = new RegExp(`^${step.name}-[1-9]\\d*\\.md$`);
    const links = folderLinks(section.text, form.id, planning);
    const reports = new Set<string>();
    // The verify section links the interface check's runs beside its reports, the check's evidence and never a report (J-199 S1).
    const verifying = step.name === "verify";
    const beside = verifying && touches ? " and the interface check's runs" : "";
    for (const { link, change, file } of links) {
      if (report.test(file)) reports.add(`${change}/${file}`);
      else if (verifying && change === form.id && CHECK_LINK.test(file)) continue;
      else
        breaches.push({
          rule: "reports",
          message: `the ${step.name} section cites ${link}, not a report named ${form.id}/${step.name}-<n>.md: at the ${by} depth it cites its fresh agents' reports${beside} alone, and each report cites its own evidence`,
        });
    }
    const asked = depth.depth === "independent" ? depth.agents : section.rounds;
    const linked = verifying && touches ? ", beside the link to the interface check's runs" : "";
    if (reports.size < asked)
      breaches.push({
        rule: "reports",
        message:
          depth.depth === "independent"
            ? `the independent ${step.name} section cites ${String(reports.size)} report${reports.size === 1 ? "" : "s"}, where its depth starts ${String(asked)}: cite each fresh agent's report by its path, ${form.id}/${step.name}-<n>.md${linked}`
            : `the looped ${step.name} section's ${String(asked)} round${asked === 1 ? "" : "s"} cite ${String(reports.size)} report${reports.size === 1 ? "" : "s"}: each round cites its report, ${form.id}/${step.name}-<n>.md${linked}`,
      });
  }
  return breaches;
}

/** The frame's reading: each question of its list form answered with who decided, or marked open. */
function frameBreaches(form: RecordForm): readonly RecordBreach[] {
  const section = form.sections.find((entry) => entry.heading === "frame");
  if (section === undefined) return [];
  const map = frameMapOf(section.text);
  // A line the list form does not read, or a node none of the thirteen, is the form's breach too.
  // A node closed and asked later is the interview reopening it, which the form allows.
  const breaches: RecordBreach[] = map.issues
    .filter(
      (issue) =>
        !/^Q[1-9]\d*'s decided is /.test(issue) && !/ is closed and has a question$/.test(issue),
    )
    .map((issue) => ({ rule: "frame", message: `frame: ${issue}` }));
  for (const question of map.questions) {
    const named = map.issues.find((issue) => issue.startsWith(`${question.id}'s decided is `));
    if (question.answer === null)
      breaches.push({
        rule: "frame",
        message: `frame question ${question.id} holds no answer: write the answer taken and who decided, or answer: open with decided: owner where the owner left it open`,
      });
    if (named !== undefined) breaches.push({ rule: "frame", message: `frame question ${named}` });
    else if (question.decided === null && question.answer !== null)
      breaches.push({
        rule: "frame",
        message: `frame question ${question.id} has an answer and no decided line: write decided: owner for the owner's answer, or decided: agent for a choice inside the accepted scope`,
      });
  }
  return breaches;
}

/** A research topic's line and the lines beneath it, which cover no node and restate nothing (J-223 S1). */
const TOPIC_LINE = /^- R[1-9]\d* \[/;
const TOPIC_ITEM = /^ {2,}- /;

/** Whether a frame map's restatement holds words of the agent's own: no placeholder, no research topic, no blank line alone. */
function restated(restatement: string): boolean {
  let topic = false;
  return restatement.split("\n").some((line) => {
    if (TOPIC_LINE.test(line)) {
      topic = true;
      return false;
    }
    if (topic && TOPIC_ITEM.test(line)) return false;
    topic = false;
    const text = line.trim();
    return text !== "" && !isPlaceholder(text);
  });
}

/**
 * The careful frame's reading (J-223 S1; frame's references page, the
 * careful depth): where the record's mode line says careful, its frame
 * section covers every subject node, by a question that names it or a
 * closed line that names it with a reason, a research topic covering none,
 * and holds the restatement put to the owner; read whenever the section
 * stands, so status names a gap while the record is open and done is
 * refused over one. That a reason is right stays judgment.
 * @param form the record's form
 * @param done whether the done door reads it, which owes the confirmed line too
 * @returns the breaches, none where the frame is whole or the mode is another
 */
function carefulBreaches(
  form: RecordForm,
  done = form.position.state === "done",
): readonly RecordBreach[] {
  if (form.mode !== CAREFUL_MODE) return [];
  // A ticket's frame is its planning change's, the plan page's ticket opening with no further wait (J-223 S1, after the falsifier's reading).
  if (form.belongs?.ticket !== undefined)
    return form.confirmed === undefined || isPlaceholder(form.confirmed)
      ? []
      : [
          {
            rule: "careful",
            message:
              "a ticket's record holds no confirmed line: its frame is its planning change's, so the owner's confirming words stand in the confirmed line of the planning change's record; take the line out here",
          },
        ];
  const section = form.sections.find((entry) => entry.heading === "frame");
  const breaches: RecordBreach[] = [];
  if (section !== undefined) {
    const map = frameMapOf(section.text);
    const uncovered = SUBJECT_NODES.filter(
      (node) => map.nodes.find((each) => each.node === node)?.state === "untouched",
    );
    if (uncovered.length > 0)
      breaches.push({
        rule: "careful",
        message: `the careful frame leaves ${String(uncovered.length)} of the ${String(SUBJECT_NODES.length)} subject nodes neither asked nor closed, ${joined(uncovered)}: ask each in the list form, - Q<n> [<node>] <the question>, or close it with its reason, - closed [<node>]: <why>, one line naming several nodes that share a reason`,
      });
    if (!restated(map.restatement))
      breaches.push({
        rule: "careful",
        message:
          "the careful frame holds no restatement: write what you now understand the owner wants, its out-of-scope list among it, outside the list form, and put it to the owner to confirm",
      });
  }
  if (done && (form.confirmed === undefined || isPlaceholder(form.confirmed)))
    breaches.push({
      rule: "careful",
      message:
        "the done careful record holds no confirmed line: quote the owner's words that confirmed the frame's restatement, said after it was put to them, in confirmed: \"<their words>\"",
    });
  return breaches;
}

/** The record's mode line as its front matter reads, leniently, where its form does not parse. */
function modeLine(text: string): string | undefined {
  const document = parseFrontMatter(text, "a change record");
  if (document._tag === "err") return undefined;
  const mode = z.string().safeParse(fieldData(document.value.fields)["mode"]);
  return mode.success ? mode.data : undefined;
}

/**
 * The gaps of a careful record's frame the doors name (J-223 S1): the
 * frame's breaches of its list form and of the careful reading, or the
 * missing section, read from the record as it stands; none where the frame
 * is whole, the state in which the CLI notes the restatement put to the
 * owner and the doors wait on their confirmation alone. A record whose mode
 * line reads careful and whose form does not parse is a frame not whole, the
 * parser's words named. A ticket's record holds no frame of its own: its
 * frame and its confirmation are its planning change's, which the doors read
 * in its place, so it owes none here.
 * @param id the change's id
 * @param text the record's text
 * @returns the gaps, none where the frame is whole, or undefined where the record is not careful or does not parse
 */
export function carefulFrameGaps(id: string, text: string): readonly RecordBreach[] | undefined {
  const read = parseRecordForm(`${id}.md`, text);
  // A record whose mode line reads careful and whose form does not parse holds the doors, in the parser's words (J-223 S1).
  if (read._tag === "err")
    return modeLine(text) === CAREFUL_MODE
      ? [
          {
            rule: "careful",
            message: `the careful record does not parse, so its frame cannot be read: ${issuesLine(read.error)}; correct .greenline/ledger/${id}.md`,
          },
        ]
      : undefined;
  if (read.value.mode !== CAREFUL_MODE) return undefined;
  const form = read.value;
  // A ticket's frame is its planning change's, which the doors read in its place.
  if (form.belongs?.ticket !== undefined) return [];
  if (!form.sections.some((entry) => entry.heading === "frame"))
    return [
      {
        rule: "careful",
        message:
          "the careful record holds no frame section: write ## frame with the interview's questions in the list form, the closed nodes with their reasons and the restatement",
      },
    ];
  // The confirmation's own line is the doors' to read, never a gap of the frame.
  return [...frameBreaches(form), ...carefulBreaches(form, false)];
}

/**
 * The skills line against the skills the hooks saw loaded (J-176 S1): a
 * hint the agent reconciles, never a refusal, since a harness without hooks
 * has no such fact. Its words name what each side holds.
 * @param stated the record's skills line, undefined where it states none
 * @param loaded the skills the hooks noted loaded, by name
 * @returns the notice's words, or undefined where the two agree
 */
export function skillsHintNotice(
  stated: readonly string[] | undefined,
  loaded: readonly string[],
): string | undefined {
  if (stated === undefined) return undefined;
  const facts = [...new Set(loaded)];
  const never = stated.filter((skill) => !facts.includes(skill));
  const left = facts.filter((skill) => !stated.includes(skill));
  if (never.length === 0 && left.length === 0) return undefined;
  const said = [
    ...(never.length === 0 ? [] : [`names ${joined(never)}, which the hooks saw no load of`]),
    ...(left.length === 0 ? [] : [`leaves out ${joined(left)}, which the hooks saw loaded`]),
  ];
  return `the skills line ${said.join(" and ")}: reconcile it with what the change used, in your own words`;
}

/**
 * The lines a done record owes (J-176 S1): each line its mode owes,
 * stated, and no placeholder of the skeleton left in a line or a section.
 * @param text the record's text
 * @param definition the modes definition
 * @returns the breaches, one per lacking line and one per placeholder left
 */
function linesBreaches(text: string, definition: ModesDefinition): readonly RecordBreach[] {
  const lack = recordLack(definition, text);
  if (lack === undefined) return [];
  const lacking = [...lack.open, ...lack.close];
  // The floors line's cure is its own words: none or the list, added by hand to a record opened before it was owed (J-226 S1);
  // the yes is the owner's words, named in the clause the record lacks line uses (J-229 S1).
  const missing = lacking.filter((field) => field !== "floors" && field !== "yes");
  // The confirmed line's placeholder is the careful reading's to name, in the owner's terms (J-223 S1).
  const placeholders = lack.placeholders.filter(
    (field) => !lacking.includes(field) && field !== "confirmed",
  );
  return [
    ...(lacking.includes("floors")
      ? [
          {
            rule: "lines" as const,
            message: `the done record lacks its floors line: ${FLOORS_CURE}; a record opened before this version adds the line by hand`,
          },
        ]
      : []),
    ...(lacking.includes("yes")
      ? [
          {
            rule: "lines" as const,
            message: `the done record lacks its yes line, ${yesLackClause()}`,
          },
        ]
      : []),
    ...(missing.length === 0
      ? []
      : [
          {
            rule: "lines" as const,
            message: `the done record lacks its ${joined(missing)} line${missing.length === 1 ? "" : "s"}: write each in your own words for its meaning, as the ledger guide's front matter gives it`,
          },
        ]),
    ...placeholders.map((field) => ({
      rule: "lines" as const,
      message: `the ${field} line still holds the skeleton's placeholder: write it in your own words, or take an optional line out`,
    })),
    ...lack.sections.map((heading) => {
      const standIn = lack.standIns.find((entry) => entry.heading === heading);
      return {
        rule: "lines" as const,
        message:
          standIn === undefined
            ? `the ${heading} section still holds the skeleton's placeholder: write the section, or the one line its depth gives a step that did not run`
            : `the ${heading} section still holds "${standIn.line}", a stand-in for the template's text: write the section in your own words, or the one line its depth gives a step that did not run`,
      };
    }),
    // A start section that says no start ran, in a listed form, which the skeleton leaves out, says as little as a placeholder (J-202 S1, J-226 S1).
    ...(lack.noneStart
      ? [
          {
            rule: "lines" as const,
            message:
              "the start section says no start ran, and the skeleton leaves the section out: a start section names a start loaded and followed in this change's session, so take the section out where none was",
          },
        ]
      : []),
  ];
}

/**
 * The agent line against the model the harness reports (J-192 S1): a line
 * naming a model family alone, where the harness reports the model, is the
 * breach, read wherever the record stands, so the first commit and the done
 * commit refuse it; a harness that reports none leaves the line as written.
 * @param agent the record's agent line, undefined where it states none
 * @param reported the harness and the model it reports, undefined where none
 * @returns the breach, none where the line names the model or no family
 */
export function agentBreaches(
  agent: string | undefined,
  reported: ReportedModel | undefined,
): readonly RecordBreach[] {
  if (agent === undefined || reported === undefined) return [];
  const line = agentFamilyAlone(agent, reported);
  return line === undefined
    ? []
    : [
        {
          rule: "agent",
          message: `the agent line names ${agent}, a model family alone, where the harness reports the model ${reported.model}: write agent: ${line}, the model as the harness states it, which every commit's trailer carries`,
        },
      ];
}

/**
 * A skill a done change owed (J-176 S1), with the trigger that owed it and,
 * for a whole read the loads began, each page they have not shown whole
 * (J-203 S1).
 */
export interface OwedAtDone {
  readonly skill: string;
  readonly why: string;
  readonly held?: readonly PageHeld[] | undefined;
}

/** The owner's waiver of an owed skill in the record: `waived: <skill>: <reason>; the owner's yes: "<words>"`. */
const WAIVED = /^waived: ([a-z0-9]+(?:-[a-z0-9]+)*): .+?; the owner's yes: ".+"$/gm;

/**
 * The skills a done change owed and never loaded (J-176 S1): each habit or
 * start its trigger rows owed it, with no load of it in the change's facts,
 * no mention of it in the agent's own `skills` line and no waiver of the
 * owner's in the record. Nothing leans on one harness's hooks (the slice's
 * third amendment): where the hooks recorded no load at all, a harness
 * without them or a load no hook saw, the owed line stays a hint and no
 * breach is read, and a skills line that names the skill the facts are
 * silent on is the hints' notice, never a breach. A skill owed whole whose
 * loads the hooks recorded is held to them (J-203 S1): while its front or
 * a page its whole read includes stands unread or read in part, cut by the
 * harness or read with another page among them, the breach names each
 * page, the skills line naming the skill or not.
 * @param text the record's text
 * @param owed the skills owed, each with its trigger and the pages still held
 * @param loaded the skills the change loaded, as the hooks recorded them
 * @param named the skills the record's own skills line names
 * @returns one breach per skill owed, recorded loads standing, that neither a load nor the line names
 */
function owedBreaches(
  text: string,
  owed: readonly OwedAtDone[],
  loaded: readonly string[],
  named: readonly string[],
): readonly RecordBreach[] {
  if (loaded.length === 0) return [];
  const waived = waivedSkills(text);
  const seen = new Set<string>();
  return owed.flatMap((entry) => {
    if (waived.has(entry.skill) || seen.has(entry.skill)) return [];
    const held = entry.held ?? [];
    if (held.length > 0 && loaded.includes(entry.skill)) {
      seen.add(entry.skill);
      return [
        {
          rule: "owed" as const,
          message: `the change owed ${entry.skill} whole (${entry.why}), and the loads the hooks recorded show ${heldText(held)}: read each page alone and whole where it applies, or write the owner's waiver, waived: ${entry.skill}: <reason>; the owner's yes: "<their words>"`,
        },
      ];
    }
    if (
      loaded.includes(entry.skill) ||
      named.includes(entry.skill) ||
      waived.has(entry.skill) ||
      seen.has(entry.skill)
    )
      return [];
    seen.add(entry.skill);
    return [
      {
        rule: "owed" as const,
        message: `the change owed ${entry.skill} (${entry.why}), and neither the loads the hooks recorded nor the skills line name it: read it where it applies and name it in the skills line, or write the owner's waiver, waived: ${entry.skill}: <reason>; the owner's yes: "<their words>"`,
      },
    ];
  });
}

/**
 * The skills the owner's waivers in a record name.
 * @param text the record's text
 * @returns the skills waived
 */
export function waivedSkills(text: string): ReadonlySet<string> {
  return new Set([...text.matchAll(WAIVED)].map((match) => match[1] ?? ""));
}

/**
 * The owed skills a record meets in its own words (J-189 S1): each its
 * skills line names or the owner's waiver names, read as the done door
 * reads them, so the owes line drops what done would take.
 * @param id the change, its record's file name without `.md`
 * @param text the record's text, empty where it stands nowhere
 * @param skills the skills owed
 * @returns the skills the record meets
 */
export function metSkills(id: string, text: string, skills: readonly string[]): readonly string[] {
  const read = parseRecordForm(`${id}.md`, text);
  const named = read._tag === "ok" ? (read.value.skills ?? []) : [];
  const waived = waivedSkills(text);
  return skills.filter((skill) => named.includes(skill) || waived.has(skill));
}

/**
 * The research the owner accepted at frame, each answered by its report
 * (J-176 S1): a topic `- R<n>` with an `accepted` line whose report,
 * `frame-research-<n>.md` in the change's folder, the frame section does
 * not link.
 * @param form the record's form
 * @returns one breach per accepted topic with no report linked
 */
function researchBreaches(form: RecordForm): readonly RecordBreach[] {
  const frame = form.sections.find((section) => section.heading === "frame");
  if (frame === undefined) return [];
  const links = linkTargets(frame.text);
  return researchTopicsOf(frame.text).flatMap((topic) => {
    if (topic.accepted === null) return [];
    const report = `${form.id}/frame-research-${topic.id.slice(1)}.md`;
    return links.has(report)
      ? []
      : [
          {
            rule: "research" as const,
            message: `the owner accepted the research ${topic.id}, ${topic.topic}, and the frame section links no report of it: file the report with greenline research report <file> --change ${form.id} --topic ${topic.id}, and link [${topic.id}](${report}) where it informs a question`,
          },
        ];
  });
}

/**
 * The breaches of a change record's forms, in the order the rules read
 * them: the reports, the frame, the skills line and the plan.
 * @param input the record, its id, the definition, the facts' loads and the plan's edits
 * @returns the breaches; none for a record that does not parse, which its parse names
 */
export function recordBreaches(input: RecordLintInput): readonly RecordBreach[] {
  const read = parseRecordForm(`${input.id}.md`, input.text);
  if (read._tag === "err") return [];
  const form = read.value;
  const plan =
    input.planEdits === undefined || input.planEdits.length === 0
      ? []
      : [
          {
            rule: "plan" as const,
            message: `the plan's files ${input.planEdits.join(", ")} hold edits left uncommitted: a plan extended during a change is committed at its close, with its planning change's record, on that change's branch`,
          },
        ];
  return [
    ...reportBreaches(form, input.definition, startedSteps(input.text)),
    ...frameBreaches(form),
    ...carefulBreaches(form),
    ...(form.position.state !== "done" || input.definition === undefined
      ? []
      : linesBreaches(input.text, input.definition)),
    ...(form.position.state !== "done" || input.owed === undefined || input.loaded === undefined
      ? []
      : owedBreaches(input.text, input.owed, input.loaded, form.skills ?? [])),
    ...(form.position.state === "done" ? researchBreaches(form) : []),
    ...plan,
    ...(input.marks === undefined ? [] : marksBreaches(input.text, input.marks.line)),
    ...floorBreaches(input.text),
    ...(input.journal === undefined ? [] : yesBreaches(form, input.journal)),
    ...outcomeBreaches(form),
    ...(input.folder === undefined || form.position.state !== "done"
      ? []
      : linkBreaches(input.id, input.text, input.folder, verifyReported(form, input.definition))),
    ...componentsBreaches(form),
    ...overrunBreaches(form, input.definition),
    ...agentBreaches(form.agent, input.reported),
  ];
}

/** Whether the record's mode runs verify at a depth that starts fresh agents, whose reports its section cites. */
function verifyReported(form: RecordForm, definition: ModesDefinition | undefined): boolean {
  const mode = definition?.modes.find((entry) => entry.name === form.mode);
  const depth = Object.entries(mode?.steps ?? {}).find(([name]) => name === "verify")?.[1];
  return depth !== undefined && citedBy(depth) !== undefined;
}

/** A count and its noun, singular for one. */
function counted(amount: number, noun: string): string {
  return `${String(amount)} ${noun}${amount === 1 ? "" : "s"}`;
}

/**
 * The owner's accepted overrun (J-174; the ledger guide, "Fix passes and the
 * cost"): the `overrun` line quotes the owner's words accepting a cost past
 * the mode's count, which status then reads as accepted; beside a cost
 * within the count it accepts nothing, and the line goes.
 * @param form the record's form
 * @param definition the modes definition, undefined where none is read
 * @returns the breach, none where the line stands beside a cost past the count
 */
function overrunBreaches(
  form: RecordForm,
  definition: ModesDefinition | undefined,
): readonly RecordBreach[] {
  const cost = form.cost;
  if (cost?.overrun === undefined || definition === undefined) return [];
  const mode = definition.modes.find((entry) => entry.name === form.mode);
  if (mode === undefined) return [];
  const agents = agentsAtMost(definition, mode);
  const rounds = roundsAtMost(definition, mode);
  if (cost.agents > agents || cost.rounds > rounds) return [];
  return [
    {
      rule: "overrun",
      message: `the overrun line accepts a cost of ${counted(cost.agents, "agent")} and ${counted(cost.rounds, "round")}, within ${mode.name}'s ${counted(agents, "agent")} and ${counted(rounds, "round")}: take the line out, since the owner's words accept nothing here`,
    },
  ];
}

/** The links a record's text makes, each target as written with its heading dropped. */
function linkTargets(text: string): ReadonlySet<string> {
  return new Set(
    [...text.matchAll(LINK)].map((match) =>
      (match[1] ?? "").replace(/#.*$/, "").replace(/^\.\//, ""),
    ),
  );
}

/** The interface check's run files a folder holds, each under `interface/`. */
const CHECK_RUN = /^interface\/[^/]+\.json$/;

/** A link to the interface check's runs: the folder's, or one run's. */
const CHECK_LINK = /^interface(?:\/(?:[^/]+\.json)?)?$/;

/**
 * A done record's links to what its folder keeps (J-173 S1): the links file
 * once, as `[visuals](<id>/visuals.json)`, where it lists a visual, and
 * each run of the interface check under `interface/`, by its path or all
 * at once by the folder's, beside the verify section's reports where its
 * depth starts fresh agents (J-199 S1).
 * @param id the change's id
 * @param text the record's text
 * @param folder the folder's files and its links file's count
 * @param reported whether the mode's verify depth starts fresh agents, whose reports the section cites
 * @returns the breaches, none where the record links them
 */
function linkBreaches(
  id: string,
  text: string,
  folder: { readonly files: readonly string[]; readonly visuals: number },
  reported = false,
): readonly RecordBreach[] {
  const links = linkTargets(text);
  const breaches: RecordBreach[] = [];
  if (folder.visuals > 0 && !links.has(`${id}/${LINKS_FILE}`))
    breaches.push({
      rule: "visuals",
      message: `the done record does not link its visuals: its folder's ${LINKS_FILE} lists ${String(folder.visuals)} under .greenline/visuals/${id}/; link them once, as [visuals](${id}/${LINKS_FILE}), in the close section`,
    });
  const runs = folder.files
    .filter((file) => CHECK_RUN.test(file))
    .toSorted()
    .toReversed();
  const whole = links.has(`${id}/interface/`) || links.has(`${id}/interface`);
  const unlinked = whole ? [] : runs.filter((file) => !links.has(`${id}/${file}`));
  if (unlinked.length > 0)
    breaches.push({
      rule: "check-report",
      message: `the done record links ${String(runs.length - unlinked.length)} of the ${String(runs.length)} runs of the interface check under its folder, ${id}/${unlinked[0] ?? ""} among them: link the runs from the verify section${reported ? " beside its fresh agents' reports" : ""}, each by its path or all at once as [interface check](${id}/interface/)`,
    });
  return breaches;
}

/** The `components:` mark, as the interface fact reads it: to a semicolon or the line's end. */
const COMPONENTS_LINE = /(?:^|\s)components: ([^;\n]+)/m;

/**
 * A done interface change's components line (J-173 S1; design's page, "The
 * section"): its design section names the components it builds on a
 * `components:` line, each a name of the closed list, so the check and the
 * mirror read them; a line that runs into prose, or none at all, is the
 * breach.
 * @param form the record's form
 * @returns the breach, none where the line holds names of the list alone
 */
function componentsBreaches(form: RecordForm): readonly RecordBreach[] {
  if (form.position.state !== "done" || form.interface?.touches !== true) return [];
  const design = form.sections.find((section) => section.heading === "design");
  if (design === undefined || !written(design.text)) return [];
  const line = COMPONENTS_LINE.exec(design.text)?.[1];
  if (line === undefined)
    return [
      {
        rule: "components",
        message:
          "the design section of an interface change names no components line: write components: with the names from the closed list it builds, comma-separated, such as components: form, table",
      },
    ];
  const off = line
    .trim()
    .split(/,\s*|\s+and\s+/)
    .map((name) => name.trim())
    .filter((name) => name !== "" && !isOnList(COMPONENTS, name));
  return off.length === 0
    ? []
    : [
        {
          rule: "components",
          message: `the design section's components line names ${off.map((name) => `"${name}"`).join(", ")}, which the closed list does not hold: write components: with names from the list alone, comma-separated, such as components: form, table, and put the rest of the section on lines of its own`,
        },
      ];
}

/**
 * The close's outcome line (J-168 S1): a done record says what landed in
 * one sentence of the agent's own words, which the change page opens on,
 * and the line stays under the cap wherever it stands. Its words are the
 * agent's; only its presence and its length are read here.
 * @param form the record's form
 * @returns the breach, none where the line stands within the cap
 */
function outcomeBreaches(form: RecordForm): readonly RecordBreach[] {
  const said = form.outcome;
  if (said === undefined)
    return form.position.state === "done"
      ? [
          {
            rule: "outcome",
            message: `the done record states no outcome line: write outcome: "<what landed>" in its front matter, one sentence in your own words under ${String(OUTCOME_CAP)} characters, never the why repeated`,
          },
        ]
      : [];
  return said.length <= OUTCOME_CAP
    ? []
    : [
        {
          rule: "outcome",
          message: `the outcome line runs to ${String(said.length)} characters: say what landed in one sentence under ${String(OUTCOME_CAP)} characters, never the why repeated`,
        },
      ];
}

/**
 * The owner's yes against their journaled messages (J-151 S2, J-176 S1): an
 * accepted record quotes the owner's words in its `yes` line, and where the
 * hooks journaled their messages, one holds the words and reads as a yes.
 * @param form the record's form
 * @param journal the owner's journaled messages
 * @returns the breach, none where the yes stands quoted
 */
function yesBreaches(form: RecordForm, journal: OwnerJournal): readonly RecordBreach[] {
  const unheld = yesNotHeld(form.choice.by, form.yes, journal);
  return unheld === undefined ? [] : [{ rule: "yes", message: unheld }];
}

/**
 * The breaches of a discussion record's form (J-149 S1; the ledger guide,
 * "Discussions"): each issue its parse names, a question's `decided` that
 * is not the owner or the agent among them.
 * @param id the discussion's id, its record's file name without `.md`
 * @param text the record's text
 * @returns the breaches, none for a record that reads as the form
 */
export function discussionBreaches(id: string, text: string): readonly RecordBreach[] {
  const read = parseDiscussionRecord(`${id}.md`, text);
  if (read._tag === "ok") return [];
  return read.error.issues.map((issue) => ({
    rule: issue.path === "frame" ? "frame" : "discussion",
    message: issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`,
  }));
}

/**
 * The breaches named in one line: the first sentence whole, then how many
 * more stand, which the status names each.
 * @param id the change's id
 * @param breaches the breaches, at least one
 * @returns the line
 */
export function breachesLine(id: string, breaches: readonly RecordBreach[]): string {
  const first = breaches[0]?.message ?? "";
  const more = breaches.length - 1;
  return more === 0
    ? first
    : `${first}; and ${String(more)} more, each named by greenline status --change ${id}`;
}
