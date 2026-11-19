import type { ContractParseFailed } from "../../core/contract.ts";
import type { ParsedFile, PlanView } from "../../core/status.ts";
import { changeRef, planRef, ticketRef } from "./refs.ts";
import { waitingOn } from "./waiting.ts";
import type { PlanDocument, TicketProgress, TicketsFile } from "../../core/plan-documents.ts";
import { readChangesOnDisk } from "../changes.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import type {
  PlanDetail,
  PlanDocumentView,
  PlanListEntry,
  PlanRecord,
  PlansList,
} from "../../core/inspector/documents.ts";
import { formOf, listedStatus } from "./ledger.ts";
import { planHref, repositoryResolver } from "./links.ts";
import { renderDocument } from "./markdown.ts";
import { readShownFile, resolvesOutside } from "./repository-read.ts";

/*
 * The plans view's data: each plan directory under `.greenline/plans/` as
 * `readChangesOnDisk` reads it (the tickets file parsed against the modes,
 * the other plan documents with their mark), each ticket's progress and the
 * ready frontier exactly as `greenline status` derives them, and the change
 * records that name the plan. A plan directory, a tickets file or a plan
 * document that resolves outside the repository is refused, so a link in a
 * cloned repository never carries another directory's text into the page.
 * Nothing here writes, and nothing is stored: a ticket's progress is never
 * written, only derived.
 */

const PLANS = ".greenline/plans";
const TICKETS = "tickets.md";
const OUTSIDE = "it resolves outside the repository";
/** The plan documents the work guide names, in the order a reader takes them; any other follows by name. */
const DOCUMENT_ORDER = ["spec.md", "decisions.md", "map.md"];

/** A plan directory as the page may show it: what resolves inside the repository, and why the rest is refused. */
interface ContainedPlan {
  readonly name: string;
  readonly path: string;
  /** Why the directory cannot be shown; null when it can. */
  readonly problem: string | null;
  readonly tickets: ParsedFile<TicketsFile> | undefined;
  /** Why the tickets file is refused although present; null otherwise. */
  readonly ticketsRefused: string | null;
  readonly documents: readonly (ParsedFile<PlanDocument> & { readonly refused: boolean })[];
}

function issuesText(error: ContractParseFailed): string {
  return error.issues
    .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
    .join("; ");
}

function documentOrder(a: string, b: string): number {
  const rank = (file: string): number => {
    const index = DOCUMENT_ORDER.indexOf(file);
    return index === -1 ? DOCUMENT_ORDER.length : index;
  };
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** The plans, contained, the records naming them and the status derivations, read once for a request. */
function readPlans(root: string, env: CliEnvironment) {
  if (resolvesOutside(root, PLANS)) return { error: `the plans folder: ${OUTSIDE}` };
  const disk = readChangesOnDisk(root, env.installation.modes);
  if (disk._tag === "err") return { error: issuesText(disk.error) };
  const plans = disk.value.plans.map((plan): ContainedPlan => {
    const path = `${PLANS}/${plan.name}/`;
    const empty = {
      name: plan.name,
      path,
      tickets: undefined,
      ticketsRefused: null,
      documents: [],
    };
    if (resolvesOutside(root, path)) return { ...empty, problem: `the plan directory: ${OUTSIDE}` };
    if (plan.contents._tag === "err") return { ...empty, problem: issuesText(plan.contents.error) };
    const contents = plan.contents.value;
    const ticketsOutside = contents.tickets !== undefined && resolvesOutside(root, path + TICKETS);
    return {
      ...empty,
      problem: null,
      tickets: ticketsOutside ? undefined : contents.tickets,
      ticketsRefused: ticketsOutside ? `${TICKETS}: ${OUTSIDE}` : null,
      documents: contents.documents.map((document) => ({
        ...document,
        refused: resolvesOutside(root, path + document.file),
      })),
    };
  });
  // The ticket's progress and the ready frontier are status's own derivation, read through it.
  const status = listedStatus(root, env);
  const listed =
    status.changes?.view === "list" ? [...status.changes.current, ...status.changes.finished] : [];
  const steps = new Map(listed.map((view) => [view.id, view.step]));
  const records = disk.value.changes.flatMap((entry) => {
    const { form } = formOf(entry);
    if (form?.belongs === undefined) return [];
    const position = form.position;
    const waiting =
      position.state === "open" &&
      waitingOn(root, {
        id: entry.id,
        state: position.state,
        next: position.next,
        step: steps.get(entry.id) ?? null,
        touchesInterface: form.interface?.touches === true,
      }) !== null;
    // The plan it names stays beside the record, so the record served carries only its own fields.
    const record: PlanRecord = {
      id: entry.id,
      ref: changeRef(entry.id),
      state: position.state === "open" ? (waiting ? "waiting" : "in-progress") : position.state,
      mode: form.mode,
      opened: form.raises[0]?.from ?? form.mode,
      why: form.why,
      ticket: form.belongs.ticket ?? null,
      proposed: form.choice.by === "owner" ? (form.choice.proposed ?? null) : null,
      owner: form.choice.by === "owner",
    };
    return [{ plan: form.belongs.plan, record }];
  });
  const derived = status.changes?.view === "list";
  const views: readonly PlanView[] = status.changes?.view === "list" ? status.changes.plans : [];
  // A plan whose directory or tickets file is refused shows nothing derived from what it holds.
  const viewOf = (plan: ContainedPlan): PlanView | undefined =>
    plan.problem !== null || plan.ticketsRefused !== null
      ? undefined
      : views.find((candidate) => candidate.name === plan.name);
  return { plans, records, viewOf, derived, diagnostics: status.diagnostics };
}

const newest = (a: PlanRecord, b: PlanRecord): number => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Every plan directory for the list, in the order of their names.
 * @param root the repository root
 * @param env the CLI environment, for the installation's modes and the status derivations
 * @returns the list, or why the plans cannot be read
 */
export function plansList(root: string, env: CliEnvironment): PlansList {
  const read = readPlans(root, env);
  if ("error" in read) return { plans: [], unavailable: read.error, derived: false };
  return {
    plans: read.plans.map((plan): PlanListEntry => {
      const view = read.viewOf(plan);
      const tickets = plan.tickets?.parsed;
      const progress = view?.progress ?? [];
      const count = (state: TicketProgress): number =>
        progress.filter((entry) => entry.progress === state).length;
      return {
        name: plan.name,
        ref: planRef(plan.name),
        path: plan.path,
        tickets: view?.tickets ?? null,
        counts: {
          total: progress.length,
          done: count("done"),
          inProgress: count("in progress"),
          notStarted: count("not started"),
        },
        ready: view?.frontier ?? [],
        documents: plan.documents
          .map((document) => ({
            file: document.file,
            status:
              !document.refused && document.parsed._tag === "ok"
                ? document.parsed.value.status
                : null,
          }))
          .sort((a, b) => documentOrder(a.file, b.file)),
        planning: read.records
          .filter((named) => named.plan === plan.name && named.record.ticket === null)
          .map((named) => named.record)
          .sort(newest),
        problem:
          plan.problem ??
          plan.ticketsRefused ??
          (tickets?._tag === "err"
            ? `${TICKETS} does not parse: ${issuesText(tickets.error)}`
            : null),
      };
    }),
    unavailable: null,
    derived: read.derived,
  };
}

/** The text of the first-level heading that opens a document, or its file name. */
function titleOf(file: string, body: string | null): string {
  return (body === null ? undefined : /^ {0,3}#\s+(.+?)\s*#*\s*$/m.exec(body)?.[1]) ?? file;
}

/** A plan document's body rendered, its opening heading taken out as the title. */
function rendered(plan: ContainedPlan, file: string, body: string): string {
  return renderDocument(body, repositoryResolver(plan.path.slice(0, -1)), planHref(plan.name, file))
    .html;
}

function documentView(
  root: string,
  plan: ContainedPlan,
  document: ContainedPlan["documents"][number],
): PlanDocumentView {
  if (document.refused)
    return {
      file: document.file,
      title: document.file,
      status: null,
      body: null,
      html: null,
      problem: OUTSIDE,
    };
  if (document.parsed._tag === "ok")
    return {
      file: document.file,
      title: titleOf(document.file, document.parsed.value.body),
      status: document.parsed.value.status,
      body: document.parsed.value.body,
      html: rendered(plan, document.file, document.parsed.value.body),
      problem: null,
    };
  // A document that does not parse is shown as written, with why.
  const shown = readShownFile(root, `${plan.path}${document.file}`);
  return {
    file: document.file,
    title: titleOf(document.file, shown.text),
    status: null,
    body: shown.text,
    html: shown.text === null ? null : rendered(plan, document.file, shown.text),
    problem: `it does not parse: ${issuesText(document.parsed.error)}`,
  };
}

/**
 * One plan for its page, or undefined when no plan directory of that name is on disk.
 * @param root the repository root
 * @param env the CLI environment, for the installation's modes and the status derivations
 * @param name the plan directory's name
 * @returns the plan, or undefined
 */
export function planDetail(
  root: string,
  env: CliEnvironment,
  name: string,
): PlanDetail | undefined {
  const read = readPlans(root, env);
  if ("error" in read) return undefined;
  // Only a name read from the plans folder is looked up, so no request names a path of its own.
  const plan = read.plans.find((candidate) => candidate.name === name);
  if (plan === undefined) return undefined;
  const view = read.viewOf(plan);
  const mine = read.records
    .filter((named) => named.plan === plan.name)
    .map((named) => named.record);
  // The plan's own notes: its directory or a file in it, never a sibling whose name it prefixes.
  const directory = plan.path.slice(0, -1);
  const notes = read.diagnostics
    .filter((note) => note.path === directory || note.path?.startsWith(plan.path) === true)
    .map((note) => ({ code: note.code, severity: note.severity, message: note.message }));
  const planning = mine.filter((record) => record.ticket === null).sort(newest);
  const parsed = plan.tickets?.parsed;
  const file = parsed?._tag === "ok" ? parsed.value : undefined;
  const progress = new Map((view?.progress ?? []).map((entry) => [entry.ticket, entry.progress]));
  const frontier = view?.frontier ?? [];
  const ids = new Set<string>(file?.tickets.map((ticket) => ticket.id) ?? []);
  return {
    name: plan.name,
    ref: planRef(plan.name),
    path: plan.path,
    mark: file?.status ?? null,
    hasTickets: parsed !== undefined || plan.ticketsRefused !== null,
    ticketsProblem:
      plan.ticketsRefused !== null
        ? OUTSIDE
        : parsed?._tag === "err"
          ? issuesText(parsed.error)
          : null,
    ticketsRefused: plan.ticketsRefused !== null,
    tickets: (file?.tickets ?? []).map((ticket) => ({
      id: ticket.id,
      ref: ticketRef(plan.name, ticket.id, ticket.intent),
      intent: ticket.intent,
      scope: ticket.scope,
      acceptance: ticket.acceptance,
      after: ticket.after,
      mode: ticket.mode,
      progress: progress.get(ticket.id) ?? "not started",
      ready: frontier.includes(ticket.id),
      records: mine.filter((record) => record.ticket === ticket.id).sort(newest),
    })),
    frontier,
    derived: read.derived && view !== undefined,
    documents: plan.documents
      .map((document) => documentView(root, plan, document))
      .sort((a, b) => documentOrder(a.file, b.file)),
    planning,
    strays: mine.filter((record) => record.ticket !== null && !ids.has(record.ticket)).sort(newest),
    notes,
    problem: plan.problem,
  };
}
