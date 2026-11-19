import { bodyLines } from "./front-matter.ts";

/**
 * The frame map (J-117 S1; `docs/SPEC.md`, "The frame map"): the change
 * record's frame section read in its question list form, each question with
 * its node, its round, the answer proposed, the answer given and who
 * decided, each node open, closed with its reason or untouched, the research
 * reports the section cites with the questions that drew on them, and the
 * rest of the section as the restatement. The CLI writes it beside the record
 * as `frame-map.json` (`GENERATED_FILES` in `./inspector/contract.ts`) and
 * the inspector draws it on the change page.
 *
 * The list form, as the ledger guide gives it:
 *
 * ```text
 * ### Round 1
 *
 * - Q1 [scope] Does it include archived rows?
 *   - proposed: no, live rows only
 *   - answer: no, live rows only
 *   - decided: owner
 *   - research: [the encodings](<id>/frame-research-1.md)
 * - closed [security]: the rows hold no personal data
 * - closed [performance, operations]: a few hundred rows, run locally
 * ```
 *
 * A closed line may name several nodes that share one reason, each read
 * closed with it (J-223 S1).
 */

/** The nodes frame thinks a request through, in their order. */
export const FRAME_NODES = [
  "purpose",
  "scope",
  "adjacent",
  "journey",
  "surface",
  "data",
  "behaviour",
  "security",
  "performance",
  "operations",
  "verification",
  "constraints",
  "generic",
] as const;

/** One of the nodes frame thinks a request through. */
export type FrameNode = (typeof FRAME_NODES)[number];

/**
 * The subject nodes a careful frame owes (J-223 S1): every node but
 * `generic`, the catch-all, which no request owes; each asked by a question
 * that names it or closed by a line that names it with a reason.
 */
export const SUBJECT_NODES: readonly FrameNode[] = FRAME_NODES.filter((node) => node !== "generic");

/** Who settled a question: the owner by an answer, or the agent inside the scope the owner accepted. */
export type FrameDecider = "owner" | "agent";

/** One question of the frame's list form. */
export interface FrameQuestion {
  /** Its number as written, `Q1`. */
  readonly id: string;
  /** The round it was asked in, from the `### Round <n>` heading above it; 1 with none. */
  readonly round: number;
  /** The node it names, as written. */
  readonly node: string;
  readonly question: string;
  readonly proposed: string | null;
  readonly answer: string | null;
  readonly decided: FrameDecider | null;
  /** The research reports it drew on, by file name, `frame-research-<n>.md`. */
  readonly research: readonly string[];
}

/** One node as the map draws it. */
export interface FrameNodeView {
  readonly node: FrameNode;
  /** Open when a question names it, closed when the section closes it, untouched otherwise. */
  readonly state: "open" | "closed" | "untouched";
  /** Why it was left closed, for a closed node. */
  readonly reason: string | null;
  /** The ids of the questions that name it. */
  readonly questions: readonly string[];
}

/** One research report the section cites, with the questions that drew on it. */
export interface FrameResearch {
  readonly file: string;
  readonly questions: readonly string[];
}

/** The frame section read whole. */
export interface FrameMap {
  readonly nodes: readonly FrameNodeView[];
  readonly questions: readonly FrameQuestion[];
  readonly research: readonly FrameResearch[];
  /** The section's text outside the list form: the restatement, its out-of-scope line, the terms and the floors. */
  readonly restatement: string;
  /** Each line of the list form the map could not read, in words. */
  readonly issues: readonly string[];
}

/** The frame map's file name in the change's folder. */
export const FRAME_MAP_FILE = "frame-map.json";

/** The commands that write a change's frame map. */
export type FrameMapWriter = "greenline event";

const QUESTION = /^- (Q[1-9]\d*) \[([^\]]*)\] (.+)$/;
const CLOSED = /^- closed \[([^\]]*)\]: (.+)$/;
const FIELD = /^ {2,}- ([A-Za-z][A-Za-z-]*):(?:\s+(.*))?$/;
/** An indented item under a question, read as one of its lines. */
const SUBITEM = /^ {2,}- /;
/** A line that opens like a question or a closed node but does not take the form. */
const NEAR = /^- (?:Q[1-9]\d*\b|closed\b)/;
const ROUND = /^### Round ([1-9]\d*)\s*$/;
const REPORT = /frame-research-[1-9]\d*\.md/g;
const FIELDS = ["proposed", "answer", "decided", "research"] as const;

type QuestionDraft = {
  -readonly [K in keyof FrameQuestion]: FrameQuestion[K] extends readonly string[]
    ? string[]
    : FrameQuestion[K];
};

function isNode(name: string): name is FrameNode {
  return FRAME_NODES.some((node) => node === name);
}

function reportsIn(text: string): string[] {
  return [...new Set(text.match(REPORT) ?? [])];
}

/** One field line of a question, read into its draft, or the issue it raises. */
function readField(draft: QuestionDraft, key: string, value: string): string | undefined {
  const text = value.trim();
  switch (key) {
    case "proposed":
      draft.proposed = text === "" ? null : text;
      return undefined;
    case "answer":
      draft.answer = text === "" ? null : text;
      return undefined;
    case "decided":
      if (text === "owner" || text === "agent") {
        draft.decided = text;
        return undefined;
      }
      return `${draft.id}'s decided is '${text}', where owner or agent is read`;
    case "research":
      draft.research.push(...reportsIn(text).filter((file) => !draft.research.includes(file)));
      return undefined;
    default:
      return `${draft.id} holds '${key}', where ${FIELDS.slice(0, -1).join(", ")} or ${FIELDS.at(-1) ?? ""} is read`;
  }
}

/**
 * The frame section's map.
 * @param section the frame section's text, its heading left out
 * @returns the nodes, the questions, the research, the restatement and the issues
 */
export function frameMapOf(section: string): FrameMap {
  const questions: QuestionDraft[] = [];
  const closed = new Map<string, string>();
  const issues: string[] = [];
  const prose: string[] = [];
  let round = 1;
  let open: QuestionDraft | undefined;
  for (const line of bodyLines(section)) {
    const text = line.text;
    const roundHeading = line.fenced ? null : ROUND.exec(text);
    const question = line.fenced ? null : QUESTION.exec(text);
    const shut = line.fenced ? null : CLOSED.exec(text);
    const field = line.fenced || open === undefined ? null : FIELD.exec(text);
    if (roundHeading !== null) {
      round = Number(roundHeading[1]);
      open = undefined;
    } else if (question !== null) {
      const [, id = "", node = "", asked = ""] = question;
      open = {
        id,
        round,
        node: node.trim(),
        question: asked.trim(),
        proposed: null,
        answer: null,
        decided: null,
        research: [],
      };
      questions.push(open);
      if (!isNode(open.node)) issues.push(`${id} names '${open.node}', no node of the thirteen`);
    } else if (shut !== null) {
      const [, names = "", reason = ""] = shut;
      open = undefined;
      // One line may close several nodes that share its reason (J-223 S1).
      const named = names
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
      for (const node of named.length === 0 ? [names.trim()] : named) {
        if (isNode(node)) closed.set(node, reason.trim());
        else issues.push(`a closed line names '${node}', no node of the thirteen`);
      }
    } else if (field !== null && open !== undefined) {
      const issue = readField(open, field[1] ?? "", field[2] ?? "");
      if (issue !== undefined) issues.push(issue);
    } else if (!line.fenced && open !== undefined && SUBITEM.test(text)) {
      issues.push(`${open.id} holds a line the form does not read: '${text.trim()}'`);
    } else if (!line.fenced && open !== undefined && text.trim() === "") {
      // A blank line inside a question's lines keeps the question open, as a loose list does.
      prose.push(text);
    } else {
      if (!line.fenced && NEAR.test(text))
        issues.push(`a line the form does not read: '${text.trim()}'`);
      open = undefined;
      prose.push(text);
    }
  }
  const nodes = FRAME_NODES.map((node): FrameNodeView => {
    const asked = questions.filter((question) => question.node === node).map((q) => q.id);
    const reason = closed.get(node);
    if (reason !== undefined && asked.length > 0)
      issues.push(`the node '${node}' is closed and has a question`);
    return {
      node,
      state: asked.length > 0 ? "open" : reason !== undefined ? "closed" : "untouched",
      reason: asked.length === 0 && reason !== undefined ? reason : null,
      questions: asked,
    };
  });
  const restatement = prose
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cited = [...questions.flatMap((question) => question.research), ...reportsIn(restatement)];
  const research = [...new Set(cited)]
    .sort((a, b) => reportNumber(a) - reportNumber(b))
    .map((file): FrameResearch => ({
      file,
      questions: questions.filter((q) => q.research.includes(file)).map((q) => q.id),
    }));
  return { nodes, questions, research, restatement, issues };
}

function reportNumber(file: string): number {
  return Number(/(\d+)\.md$/.exec(file)?.[1] ?? 0);
}

/**
 * A change's frame map file, `.greenline/ledger/<id>/frame-map.json`, opening
 * with its `generatedBy` key as every generated JSON file beside a record does.
 * @param change the change's id
 * @param map its frame map
 * @param writer the command that writes it
 * @returns the file's text
 */
export function frameMapText(change: string, map: FrameMap, writer: FrameMapWriter): string {
  return `${JSON.stringify({ generatedBy: writer, change, ...map }, null, 2)}\n`;
}

/** One research topic the frame section proposes (J-151 S2): its id, node and topic, its lines, and the owner's acceptance. */
export interface ResearchTopic {
  readonly id: string;
  readonly node: string;
  readonly topic: string;
  readonly source: string | null;
  readonly question: string | null;
  readonly changes: string | null;
  /** The owner's words that accepted it, null while they have not. */
  readonly accepted: string | null;
}

/** A research topic's line: `- R<n> [<node>] <topic>`. */
const TOPIC = /^- (R[1-9]\d*) \[([^\]]*)\] (.+)$/;

/** A topic's line beneath it: `  - <field>: <value>`. */
const TOPIC_FIELD = /^ {2,}- (source|question|changes|accepted):\s*(.*)$/;

/**
 * The research topics a frame section proposes, beside its questions: each
 * `- R<n> [<node>] <topic>` with its `source:`, `question:`, `changes:` and,
 * once the owner accepts it, `accepted: "<their words>"`.
 * @param section the frame section's text, its heading left out
 * @returns the topics, in order
 */
export function researchTopicsOf(section: string): readonly ResearchTopic[] {
  const topics: { -readonly [K in keyof ResearchTopic]: ResearchTopic[K] }[] = [];
  let open: (typeof topics)[number] | undefined;
  for (const line of bodyLines(section)) {
    if (line.fenced) {
      open = undefined;
      continue;
    }
    const topic = TOPIC.exec(line.text);
    if (topic !== null) {
      open = {
        id: topic[1] ?? "",
        node: (topic[2] ?? "").trim(),
        topic: (topic[3] ?? "").trim(),
        source: null,
        question: null,
        changes: null,
        accepted: null,
      };
      topics.push(open);
      continue;
    }
    const field = open === undefined ? null : TOPIC_FIELD.exec(line.text);
    if (open !== undefined && field !== null) {
      const read = (field[2] ?? "")
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim();
      const value = read === "" ? null : read;
      if (field[1] === "source") open.source = value;
      else if (field[1] === "question") open.question = value;
      else if (field[1] === "changes") open.changes = value;
      else open.accepted = value;
    } else if (!/^ {2,}- /.test(line.text) && line.text.trim() !== "") open = undefined;
  }
  return topics;
}
