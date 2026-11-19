import { z } from "zod";
import type { Result } from "../commons/result.ts";
import { isChangeId } from "./change.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  type ContractParseFailed,
  type InvalidField,
} from "./contract.ts";
import { frameMapOf } from "./frame-map.ts";
import { bodyLines, fieldData, parseFrontMatter } from "./front-matter.ts";

/**
 * The discussion record (J-118; the register's rows of 2026-10-23 on the
 * discussion and on its promotion): an idea explored with
 * frame's engine at the written depth before it is work, beside a change or
 * instead of one, with no mode, no ground, no branch and no checks. It is
 * one Markdown record, `.greenline/ledger/discussions/<id>.md`, with a
 * folder of the same name for the research reports it cites; its id is a
 * real date and a slug, as a change's is, and never one a change holds. Its
 * front matter holds the idea in one line and the state the owner's word
 * set, open, parked, declined, promoted or merged, with that word quoted;
 * its body holds the frame in the question list form, the research and the
 * open questions. A commit whose paths lie only under the folder is the
 * discussion's, with its own trailer (`./git-hooks.ts`), and a promoted
 * change names it with `from` (`./change.ts`). The ledger guide owns the
 * form (`corpus/runtime/ledger.md`, "Discussions").
 */

/** The discussions' folder from the repository root. */
export const DISCUSSIONS_FOLDER = ".greenline/ledger/discussions";

/** The ledger guide's section every refusal of the form cites. */
const GUIDE = '.greenline/ledger/README.md, "Discussions"';

/** A discussion's states, each set on the owner's word. */
export const DISCUSSION_STATES = ["open", "parked", "declined", "promoted", "merged"] as const;

/** One of a discussion's states. */
export type DiscussionState = (typeof DISCUSSION_STATES)[number];

/** The sections a discussion's body holds, each at most once. */
const DISCUSSION_SECTIONS = ["frame", "research", "open questions"] as const;

/** One of a discussion's sections. */
export type DiscussionSection = (typeof DISCUSSION_SECTIONS)[number];

/** One parsed discussion record. */
export interface DiscussionRecord {
  readonly id: string;
  /** The idea, in one line. */
  readonly idea: string;
  readonly state: DiscussionState;
  /** When to come back to a parked discussion. */
  readonly revisit?: string;
  /** Why the owner declined it, kept once it is declined. */
  readonly reason?: string;
  /** The discussion a merged one joined. */
  readonly into?: string;
  /** The owner's words that set the state. */
  readonly words?: string;
  /** The changes it promoted, by id. */
  readonly changes: readonly string[];
  /** The discussions it relates to, by id. */
  readonly related: readonly string[];
  /** Its body's sections, in the order the record holds them; no text stands before the first. */
  readonly sections: readonly { readonly heading: DiscussionSection; readonly text: string }[];
}

type RecordDraft = { -readonly [K in keyof DiscussionRecord]: DiscussionRecord[K] };

const text = z.string().min(1);

const declared = z
  .object({
    idea: text,
    state: z.enum(DISCUSSION_STATES),
    revisit: text.optional(),
    reason: text.optional(),
    into: text.optional(),
    words: text.optional(),
    changes: z.array(text).optional(),
    related: z.array(text).optional(),
  })
  .strict();

type Declared = z.infer<typeof declared>;

/**
 * A discussion record's path from the repository root.
 * @param id the discussion's id
 * @returns `.greenline/ledger/discussions/<id>.md`
 */
export function discussionPath(id: string): string {
  return `${DISCUSSIONS_FOLDER}/${id}.md`;
}

/**
 * The discussion a repository path belongs to: its record, or a file of its folder.
 * @param path a path from the repository root, `/`-separated
 * @returns the discussion's id, or undefined for any other path
 */
export function discussionOfPath(path: string): string | undefined {
  const prefix = `${DISCUSSIONS_FOLDER}/`;
  if (!path.startsWith(prefix)) return undefined;
  const rest = path.slice(prefix.length);
  const slash = rest.indexOf("/");
  const name =
    slash === -1 ? (rest.endsWith(".md") ? rest.slice(0, -3) : "") : rest.slice(0, slash);
  return isChangeId(name) ? name : undefined;
}

/**
 * The discussions a commit is made for: when every path it stages lies under
 * a discussion's record or folder, the discussions it touches; a commit
 * that stages any other path, or none, is no discussion's.
 * @param paths the staged paths from the repository root
 * @returns the discussions' ids, sorted, or undefined
 */
export function discussionCommit(paths: readonly string[]): readonly string[] | undefined {
  if (paths.length === 0) return undefined;
  const ids = paths.map(discussionOfPath);
  if (ids.some((id) => id === undefined)) return undefined;
  return [...new Set(ids.flatMap((id) => (id === undefined ? [] : [id])))].sort();
}

/** The ids a list names, each checked to be a discussion's or a change's id. */
function idsOf(
  field: "changes" | "related",
  items: readonly string[] | undefined,
  own: string,
  issues: InvalidField[],
): readonly string[] {
  const what = field === "changes" ? "a change's" : "a discussion's";
  const ids: string[] = [];
  for (const [index, item] of (items ?? []).entries()) {
    const path = `${field}[${String(index)}]`;
    if (!isChangeId(item))
      issues.push({ path, message: `'${item}' is not ${what} id, a real date and a slug` });
    else if (field === "related" && item === own)
      issues.push({ path, message: "a discussion is not related to itself" });
    else ids.push(item);
  }
  return ids;
}

/** What the form requires of the state: the owner's words, and the line each state carries. */
function stateIssues(id: string, value: Declared, issues: InvalidField[]): void {
  if (value.state !== "open" && value.words === undefined)
    issues.push({
      path: "words",
      message:
        "a discussion's state other than open is set on the owner's word: quote it in the words line",
    });
  if (value.state === "parked" && value.revisit === undefined)
    issues.push({ path: "revisit", message: "a parked discussion names when to come back to it" });
  if (value.state !== "parked" && value.revisit !== undefined)
    issues.push({
      path: "revisit",
      message: "only a parked discussion names when to come back to it",
    });
  if (value.state === "declined" && value.reason === undefined)
    issues.push({ path: "reason", message: "a declined discussion keeps its reason" });
  if (value.state === "promoted" && (value.changes ?? []).length === 0)
    issues.push({
      path: "changes",
      message: "a promoted discussion names the changes it promoted",
    });
  if (value.state === "merged" && value.into === undefined)
    issues.push({ path: "into", message: "a merged discussion names the discussion it joined" });
  if (value.state !== "merged" && value.into !== undefined)
    issues.push({
      path: "into",
      message: "only a merged discussion names the discussion it joined",
    });
  if (value.into !== undefined && value.into === id)
    issues.push({ path: "into", message: "a discussion is not merged into itself" });
  else if (value.into !== undefined && !isChangeId(value.into))
    issues.push({
      path: "into",
      message: `'${value.into}' is not a discussion's id, a real date and a slug`,
    });
}

/** The body's sections, refusing a heading that is none of a discussion's or is repeated. */
function sectionsOf(
  body: string,
  firstLine: number,
  issues: InvalidField[],
): DiscussionRecord["sections"] {
  const sections: { heading: DiscussionSection; lines: string[] }[] = [];
  let current: { heading: DiscussionSection; lines: string[] } | undefined;
  let headed = false;
  for (const [index, line] of bodyLines(body).entries()) {
    const heading = line.fenced ? null : /^## (.*)$/.exec(line.text);
    if (heading === null) {
      if (current !== undefined) current.lines.push(line.text);
      // The body holds the three sections and nothing else: text before the first heading is refused.
      else if (!headed && line.text.trim() !== "" && !issues.some((issue) => issue.path === "body"))
        issues.push({
          path: "body",
          message: `line ${String(firstLine + index)}: text stands before the first section; the body holds frame, research and open questions and nothing else (${GUIDE})`,
        });
      continue;
    }
    headed = true;
    const title = (heading[1] ?? "").trim();
    const at = `line ${String(firstLine + index)}`;
    const known = DISCUSSION_SECTIONS.find((name) => name === title);
    current = undefined;
    if (known === undefined)
      issues.push({
        path: "",
        message: `${at}: the heading '${title}' is not a section of a discussion; its sections are frame, research and open questions (${GUIDE})`,
      });
    else if (sections.some((section) => section.heading === known))
      issues.push({ path: "", message: `${at}: the heading '${title}' has a section already` });
    else {
      current = { heading: known, lines: [] };
      sections.push(current);
    }
  }
  return sections.map((section) => ({
    heading: section.heading,
    text: section.lines.join("\n").trim(),
  }));
}

/**
 * Parse one discussion record. It refuses a file name that is no real date
 * and a slug, a front matter that does not read, an unknown field or value,
 * a state other than open with no owner's words, a parked one with no
 * `revisit`, a declined one with no `reason`, a promoted one with no
 * `changes`, a merged one with no `into` or merged into itself, a
 * `revisit` or an `into` outside its state, an id in `changes` or `related`
 * that is no real date and a slug, a discussion related to itself, and a
 * heading that is none of frame, research and open questions or is
 * repeated.
 * @param fileName the record's file name, `<date>-<slug>.md`
 * @param input the record's text
 * @returns the record, or every issue found
 */
export function parseDiscussionRecord(
  fileName: string,
  input: string,
): Result<DiscussionRecord, ContractParseFailed> {
  const id = fileName.endsWith(".md") ? fileName.slice(0, -3) : "";
  if (!isChangeId(id))
    return contractFailure(fileName, [
      { path: "", message: "a discussion record's file name is '<real date>-<slug>.md'" },
    ]);
  const document = parseFrontMatter(input, "a discussion record");
  if (document._tag === "err") return contractFailure(fileName, document.error.issues);
  const read = declared.safeParse(fieldData(document.value.fields));
  if (!read.success) return contractFailure(fileName, issuesFrom(read.error.issues));
  const value = read.data;
  const issues: InvalidField[] = [];
  stateIssues(id, value, issues);
  const changes = idsOf("changes", value.changes, id, issues);
  const related = idsOf("related", value.related, id, issues);
  const sections = sectionsOf(document.value.body, document.value.bodyLine, issues);
  // Who decided a question is the owner or the agent, never a sentence (J-149 S1).
  const frame = sections.find((section) => section.heading === "frame")?.text ?? "";
  for (const issue of frameMapOf(frame).issues)
    if (/^Q[1-9]\d*'s decided is /.test(issue))
      issues.push({
        path: "frame",
        message: `${issue}: why the owner chose stands in its answer (${GUIDE})`,
      });
  if (issues.length > 0) return contractFailure(fileName, issues);
  const record: RecordDraft = {
    id,
    idea: value.idea,
    state: value.state,
    changes,
    related,
    sections,
  };
  if (value.revisit !== undefined) record.revisit = value.revisit;
  if (value.reason !== undefined) record.reason = value.reason;
  if (value.into !== undefined) record.into = value.into;
  if (value.words !== undefined) record.words = value.words;
  return contractOk(record);
}

/**
 * The discussion's frame section, the nodes in the question list form; empty where it has none.
 * @param record the discussion
 * @returns the section's text
 */
export function frameSectionOf(record: DiscussionRecord): string {
  return record.sections.find((section) => section.heading === "frame")?.text ?? "";
}

/**
 * The discussion's decisions: each question of its frame the owner or the
 * agent answered, as one line with its id, the question and the answer, the
 * decisions a promoted change's frame starts from.
 * @param record the discussion
 * @returns the lines, in the frame's order
 */
export function decisionLines(record: DiscussionRecord): readonly string[] {
  return frameMapOf(frameSectionOf(record)).questions.flatMap((question) =>
    question.answer === null ? [] : [`${question.id} ${question.question} ${question.answer}`],
  );
}

/** One discussion as the disk holds it: its record, or why it does not read. */
export type DiscussionEntry =
  | { readonly id: string; readonly path: string; readonly record: DiscussionRecord }
  | { readonly id: string; readonly path: string; readonly problem: string };

/**
 * One discussion record file read: parsed, or with why it does not read.
 * @param fileName the file's name under the discussions folder
 * @param text its text, or undefined when it cannot be read
 * @returns the entry
 */
export function readDiscussionEntry(fileName: string, text: string | undefined): DiscussionEntry {
  const id = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
  const path = `${DISCUSSIONS_FOLDER}/${fileName}`;
  if (text === undefined) return { id, path, problem: "it cannot be read" };
  const read = parseDiscussionRecord(fileName, text);
  return read._tag === "ok"
    ? { id, path, record: read.value }
    : {
        id,
        path,
        problem: read.error.issues
          .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
          .join("; "),
      };
}

/** One discussion as `greenline status` lists it. */
export interface DiscussionRow {
  readonly id: string;
  readonly path: string;
  readonly idea: string;
  readonly state: DiscussionState;
  readonly revisit: string | null;
  readonly reason: string | null;
  readonly into: string | null;
  readonly changes: readonly string[];
}

/** The discussions as `greenline status` reports them: the ones that read, and the ones that do not with why. */
export interface DiscussionsReport {
  readonly discussions: readonly DiscussionRow[];
  readonly unreadable: readonly {
    readonly id: string;
    readonly path: string;
    readonly problem: string;
  }[];
}

/**
 * The discussions report from the entries on disk.
 * @param entries the discussion records read
 * @returns the report, each list in the entries' order
 */
export function discussionsReport(entries: readonly DiscussionEntry[]): DiscussionsReport {
  return {
    discussions: entries.flatMap((entry) =>
      "record" in entry
        ? [
            {
              id: entry.id,
              path: entry.path,
              idea: entry.record.idea,
              state: entry.record.state,
              revisit: entry.record.revisit ?? null,
              reason: entry.record.reason ?? null,
              into: entry.record.into ?? null,
              changes: entry.record.changes,
            },
          ]
        : [],
    ),
    unreadable: entries.flatMap((entry) =>
      "problem" in entry ? [{ id: entry.id, path: entry.path, problem: entry.problem }] : [],
    ),
  };
}

/** Whether a discussion is still at hand: open, or parked to come back to. */
function atHand(row: DiscussionRow): boolean {
  return row.state === "open" || row.state === "parked";
}

/**
 * The line the status mirror prints while a discussion is open or parked,
 * `discussions: 1 open (<id>), 1 parked`; undefined while none is.
 * @param report the discussions
 * @returns the line, unindented, or undefined
 */
export function discussionsLine(report: DiscussionsReport): string | undefined {
  const open = report.discussions.filter((row) => row.state === "open");
  const parked = report.discussions.filter((row) => row.state === "parked");
  if (open.length === 0 && parked.length === 0) return undefined;
  const parts = [
    ...(open.length === 0
      ? []
      : [`${String(open.length)} open (${open.map((row) => row.id).join(", ")})`]),
    ...(parked.length === 0 ? [] : [`${String(parked.length)} parked`]),
  ];
  return `discussions: ${parts.join(", ")}`;
}

/** One discussion's line in the status view: its id, its state and its idea. */
function rowLine(row: DiscussionRow): string {
  const state =
    row.state === "parked" && row.revisit !== null ? `parked until ${row.revisit}` : row.state;
  return `  ${row.id}: ${state}; "${row.idea}"`;
}

/**
 * The discussions block of `greenline status`, beside the changes: each
 * open and parked discussion with its state and its idea, the settled ones
 * counted, and the records that do not read named; nothing while the
 * ledger holds no discussion.
 * @param report the discussions
 * @returns the lines, ending with a newline, or empty
 */
export function renderDiscussionsText(report: DiscussionsReport): string {
  if (report.discussions.length === 0 && report.unreadable.length === 0) return "";
  const lines = ["discussions"];
  const current = report.discussions.filter(atHand);
  lines.push(...(current.length === 0 ? ["  open and parked: none"] : current.map(rowLine)));
  const settled = DISCUSSION_STATES.filter(
    (state) => state !== "open" && state !== "parked",
  ).flatMap((state) => {
    const count = report.discussions.filter((row) => row.state === state).length;
    return count === 0 ? [] : [`${String(count)} ${state}`];
  });
  if (settled.length > 0) lines.push(`  settled: ${settled.join(", ")}`);
  lines.push(...report.unreadable.map((entry) => `  ${entry.id}: does not read`));
  return `${lines.join("\n")}\n`;
}

/** A change promoted from a discussion whose research report its own folder lacks. */
export interface UncopiedReport {
  readonly change: string;
  readonly discussion: string;
  readonly report: string;
}

/** A research report's name in a folder, `frame-research-<n>.md`, its number captured. */
const RESEARCH_REPORT = /^frame-research-([1-9]\d*)\.md$/;

/**
 * Research reports' names in their numbers' order, `frame-research-2.md`
 * before `frame-research-10.md`; any other name is left out.
 * @param names file names
 * @returns the reports, by number
 */
export function researchReports(names: readonly string[]): readonly string[] {
  const number = (name: string): number => Number(RESEARCH_REPORT.exec(name)?.[1] ?? "0");
  return names.filter((name) => RESEARCH_REPORT.test(name)).sort((a, b) => number(a) - number(b));
}

/**
 * Where a promoted change's folder holds the copies of a discussion's
 * reports: `discussions/<id>/` inside it, so two discussions' reports of one
 * number never meet, and the change's own reports keep their numbers.
 * @param change the change's id
 * @param discussion the discussion's id
 * @returns the folder from the repository root
 */
export function copiedResearchFolder(change: string, discussion: string): string {
  return `.greenline/ledger/${change}/discussions/${discussion}`;
}

/**
 * The research reports a promoted change has not copied (J-118 S3): for
 * each change whose `from` line names a discussion, each report the
 * discussion's folder holds that the change's copies of that discussion,
 * `discussions/<id>/` in its folder, do not, by name. A discussion whose
 * folder cannot be read names none.
 * @param changes each open or stopped change with the discussions it names
 * @param reportsOf the file names a discussion's folder holds, or undefined when it stands nowhere
 * @param copiesOf the file names a change's copies of one discussion hold
 * @returns each report not copied, in the changes' order and the reports' numbers
 */
export function uncopiedResearch(
  changes: readonly { readonly id: string; readonly from: readonly string[] }[],
  reportsOf: (discussion: string) => readonly string[] | undefined,
  copiesOf: (change: string, discussion: string) => readonly string[],
): readonly UncopiedReport[] {
  return changes.flatMap((change) =>
    change.from.flatMap((discussion) => {
      const held = new Set(copiesOf(change.id, discussion));
      return researchReports(reportsOf(discussion) ?? [])
        .filter((name) => !held.has(name))
        .map((report) => ({ change: change.id, discussion, report }));
    }),
  );
}

/** A record whose `from` line names a discussion whose `changes` line does not name the record (J-226 S1). */
export interface UnnamedOrigin {
  readonly change: string;
  readonly discussion: string;
}

/**
 * The origins a discussion does not confirm (J-226 S1; j217t-discussions
 * finding 4): each discussion a record's `from` line names that the
 * workspace holds, readable, and whose `changes` line does not name the
 * record. A discussion the workspace does not hold, or that does not read,
 * names none here: which of the two lines is wrong is the agent's to say.
 * @param changes each record with the discussions its from line names
 * @param discussions the workspace's discussions, as read
 * @returns each origin the discussion does not name, in the records' order
 */
export function unnamedOrigins(
  changes: readonly { readonly id: string; readonly from: readonly string[] }[],
  discussions: readonly DiscussionEntry[],
): readonly UnnamedOrigin[] {
  const named = new Map(
    discussions.flatMap((entry) =>
      "record" in entry ? [[entry.id, new Set(entry.record.changes)] as const] : [],
    ),
  );
  return changes.flatMap((change) =>
    change.from.flatMap((discussion) => {
      const names = named.get(discussion);
      return names === undefined || names.has(change.id) ? [] : [{ change: change.id, discussion }];
    }),
  );
}
