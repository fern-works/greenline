import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  type ContractParseFailed,
  type InvalidField,
} from "./contract.ts";
import {
  bodyLines,
  fieldData,
  parseFieldLines,
  parseFrontMatter,
  type Fields,
} from "./front-matter.ts";
import type { ModeName, ModesDefinition } from "./modes.ts";

/**
 * The plan documents (`workshop/components/artifact-system.md`): the files
 * of a plan directory, each marked draft or complete and carrying no
 * revision, and the tickets file, one short entry per ticket with its own
 * mode. A ticket's progress is never written: it is derived from the
 * tickets file and the change records that name its entries.
 */

/** A plan document's mark. */
/** The marks a plan document's front matter may hold, in order. */
export const DOCUMENT_STATUSES = ["draft", "complete"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** A plan document: its mark and its text. */
export interface PlanDocument {
  readonly status: DocumentStatus;
  readonly body: string;
}

/** A ticket's id within its tickets file. */
export type TicketId = string & z.$brand<"TicketId">;

/** One entry of a tickets file. */
export interface Ticket {
  readonly id: TicketId;
  readonly intent: string;
  readonly scope: readonly string[];
  readonly acceptance: readonly string[];
  /** The entries this one comes after. */
  readonly after: readonly TicketId[];
  readonly mode: ModeName;
}

/** A tickets file: its mark and its entries, in the order written. */
export interface TicketsFile {
  readonly status: DocumentStatus;
  readonly tickets: readonly Ticket[];
}

const TICKET_ID = /^[A-Za-z][A-Za-z0-9-]*$/;
const text = z.string().min(1);
const mark = z.object({ status: z.enum(DOCUMENT_STATUSES) }).strict();
const ticketFields = z
  .object({
    intent: text,
    scope: z.array(text).min(1),
    acceptance: z.array(text).min(1),
    after: z.array(z.string().regex(TICKET_ID)).optional(),
    mode: text,
  })
  .strict();

function located(prefix: string, issues: readonly InvalidField[]): readonly InvalidField[] {
  return issues.map((issue) => ({
    path: issue.path === "" ? prefix : `${prefix}.${issue.path}`,
    message: issue.message,
  }));
}

function documentOf(
  source: string,
  input: string,
): Result<
  {
    readonly status: DocumentStatus;
    readonly fields: Fields;
    readonly body: string;
    readonly bodyLine: number;
  },
  ContractParseFailed
> {
  const document = parseFrontMatter(input, "a plan document");
  if (document._tag === "err") return contractFailure(source, document.error.issues);
  const parsed = mark.safeParse(fieldData(document.value.fields));
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk({ status: parsed.data.status, ...document.value });
}

/**
 * Parse a plan document: its front matter holds its mark and nothing else.
 * @param source the document's path, for the refusal
 * @param input the document's text
 * @returns the mark and the text, or every issue found
 */
export function parsePlanDocument(
  source: string,
  input: string,
): Result<PlanDocument, ContractParseFailed> {
  const document = documentOf(source, input);
  return document._tag === "err"
    ? document
    : contractOk({ status: document.value.status, body: document.value.body });
}

/** One entry's `## <id>` block: the heading's line, and its field lines with the line they start on. */
interface EntryBlock {
  readonly id: string;
  readonly heading: number;
  readonly line: number;
  readonly lines: readonly string[];
}

/** The entries' blocks, each trimmed of the blank lines around its fields. */
function blocksOf(body: string, firstLine: number): readonly EntryBlock[] {
  const blocks: { id: string; heading: number; lines: string[] }[] = [];
  for (const [index, line] of bodyLines(body).entries()) {
    const heading = line.fenced ? null : /^## (.*)$/.exec(line.text);
    if (heading !== null)
      blocks.push({ id: (heading[1] ?? "").trim(), heading: firstLine + index, lines: [] });
    else blocks.at(-1)?.lines.push(line.text);
  }
  return blocks.map((block) => {
    const start = block.lines.findIndex((line) => line.trim().length > 0);
    const end = block.lines.findLastIndex((line) => line.trim().length > 0);
    return {
      id: block.id,
      heading: block.heading,
      line: block.heading + 1 + Math.max(start, 0),
      lines: start === -1 ? [] : block.lines.slice(start, end + 1),
    };
  });
}

/** The ids that come after themselves, through any chain of `after`. */
function cycleMembers(after: ReadonlyMap<string, readonly string[]>): readonly string[] {
  return [...after.keys()].filter((id) => {
    const seen = new Set<string>();
    const queue = [...(after.get(id) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift() ?? "";
      if (next === id) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(after.get(next) ?? []));
    }
    return false;
  });
}

/**
 * Parse a tickets file given the loaded modes. It refuses an unknown key, a
 * duplicate id, an entry that comes after an unknown entry or itself, a
 * cycle of entries, and a mode the definition does not hold.
 * @param definition the loaded modes definition
 * @param source the file's path, for the refusal
 * @param input the file's text
 * @returns the mark and the entries, or every issue found
 */
export function parseTicketsFile(
  definition: ModesDefinition,
  source: string,
  input: string,
): Result<TicketsFile, ContractParseFailed> {
  const document = documentOf(source, input);
  if (document._tag === "err") return document;
  const issues: InvalidField[] = [];
  const parsed: { id: string; value: z.infer<typeof ticketFields> }[] = [];
  for (const block of blocksOf(document.value.body, document.value.bodyLine)) {
    if (!TICKET_ID.test(block.id)) {
      issues.push({
        path: "",
        message: `line ${block.heading}: '${block.id}' is not a ticket id`,
      });
      continue;
    }
    if (parsed.some((ticket) => ticket.id === block.id)) {
      issues.push({ path: block.id, message: `duplicate ticket '${block.id}'` });
      continue;
    }
    const fields = parseFieldLines(block.lines, block.line);
    if (fields._tag === "err") {
      issues.push(...located(block.id, fields.error.issues));
      continue;
    }
    const value = ticketFields.safeParse(fieldData(fields.value));
    if (!value.success) {
      issues.push(...located(block.id, issuesFrom(value.error.issues)));
      continue;
    }
    parsed.push({ id: block.id, value: value.data });
  }
  const ids = new Set(parsed.map((ticket) => ticket.id));
  const tickets: Ticket[] = [];
  for (const { id, value } of parsed) {
    const mode = definition.modes.find((entry) => entry.name === value.mode);
    if (mode === undefined)
      issues.push({ path: `${id}.mode`, message: `'${value.mode}' is not a mode` });
    else
      tickets.push({
        // SAFETY: the id matched the ticket-id pattern and is unique in its file.
        id: id as TicketId,
        intent: value.intent,
        scope: value.scope,
        acceptance: value.acceptance,
        // SAFETY: every entry of `after` is checked below to name another entry
        // of this file, and the file is refused otherwise.
        after: (value.after ?? []) as TicketId[],
        mode: mode.name,
      });
    for (const other of value.after ?? []) {
      if (other === id) issues.push({ path: `${id}.after`, message: `'${id}' comes after itself` });
      else if (!ids.has(other))
        issues.push({ path: `${id}.after`, message: `'${other}' is not an entry` });
    }
  }
  if (issues.length > 0) return contractFailure(source, issues);
  const cycle = cycleMembers(new Map(parsed.map(({ id, value }) => [id, value.after ?? []])));
  if (cycle.length > 0)
    return contractFailure(source, [
      {
        path: "after",
        message: `these entries come after one another in a cycle: ${cycle.join(", ")}`,
      },
    ]);
  return contractOk({ status: document.value.status, tickets });
}

/** A ticket's progress, derived and never written. */
export type TicketProgress = "not started" | "in progress" | "done";

/** What progress reads from a change record: the ticket it names and where it stands. */
export interface TicketRecord {
  readonly ticket: string;
  readonly state: "open" | "stopped" | "done" | "dropped";
}

/**
 * Each ticket's progress from the records that name it: done when one of
 * them is done, in progress when one is open or stopped, and otherwise not
 * started, a dropped record counting for nothing.
 * @param file the tickets file
 * @param records the change records of the file's plan
 * @returns one progress per entry, in file order
 */
export function ticketProgress(
  file: TicketsFile,
  records: readonly TicketRecord[],
): readonly { readonly ticket: TicketId; readonly progress: TicketProgress }[] {
  return file.tickets.map((ticket) => {
    const states = new Set(
      records.filter((record) => record.ticket === ticket.id).map((record) => record.state),
    );
    const progress: TicketProgress = states.has("done")
      ? "done"
      : states.has("open") || states.has("stopped")
        ? "in progress"
        : "not started";
    return { ticket: ticket.id, progress };
  });
}

/**
 * The ready frontier: the tickets not started whose every earlier entry is
 * done. A tickets file marked draft has no ready ticket: marking it complete
 * records the owner's approval of the ticket list, the plan's second wait.
 * @param file the tickets file
 * @param records the change records of the file's plan
 * @returns the ready tickets' ids, in file order
 */
export function readyFrontier(
  file: TicketsFile,
  records: readonly TicketRecord[],
): readonly TicketId[] {
  if (file.status === "draft") return [];
  const progress = new Map(
    ticketProgress(file, records).map((entry) => [entry.ticket, entry.progress]),
  );
  return file.tickets
    .filter(
      (ticket) =>
        progress.get(ticket.id) === "not started" &&
        ticket.after.every((other) => progress.get(other) === "done"),
    )
    .map((ticket) => ticket.id);
}
