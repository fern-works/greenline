import { stateWord } from "./ledger-html.ts";
import { changeHref, planHref, repositoryResolver } from "./links.ts";
import { escapeHtml as e, renderDocument } from "./markdown.ts";
import type {
  PlanDetail,
  PlanDocumentView,
  PlanListEntry,
  PlanRecord,
  PlansList,
  TicketView,
} from "./plans.ts";

/*
 * The plans view's components, one per shape of a plan directory: a plan's
 * row with its tickets' progress, the ready frontier, a ticket's entry with
 * its fields and the change records that name it, and a plan document with
 * its mark. Each renders to HTML on the server, escaped by construction.
 */

/** The mark of a tickets file or a plan document, in the owner's words. */
function markWord(mark: string | null, of: "list" | "document"): string {
  if (mark === null) return "";
  const words =
    of === "list" ? (mark === "complete" ? "list approved" : "list waits for the owner") : mark;
  return `<span class="mark" data-mark="${e(mark)}">${e(words)}</span>`;
}

/** The share of tickets in each progress, as one bar with its words beside it. */
function progressBar(counts: PlanListEntry["counts"], ready: readonly string[]): string {
  if (counts.total === 0) return "";
  const segment = (kind: string, count: number): string =>
    count === 0
      ? ""
      : `<span class="segment" data-progress="${kind}" style="flex-grow:${count}"></span>`;
  const words = [
    `${counts.done} of ${counts.total} done`,
    counts.inProgress === 0 ? "" : `${counts.inProgress} in progress`,
    ready.length === 0 ? "" : `ready: ${ready.map(e).join(", ")}`,
  ].filter((part) => part !== "");
  return (
    `<span class="progress" role="img" aria-label="${e(words.join(", "))}">` +
    segment("done", counts.done) +
    segment("in-progress", counts.inProgress) +
    segment("not-started", counts.notStarted) +
    `</span><span class="progress-words">${words.join(" · ")}</span>`
  );
}

function planRow(plan: PlanListEntry): string {
  const planning = plan.planning[0];
  const title = planning?.why ?? null;
  return (
    `<li class="plan-row"${plan.ready.length === 0 ? "" : ` data-ready="${e(plan.ready.join(" "))}"`}><a href="${e(planHref(plan.name))}">` +
    `<span class="row-top"><span class="mono plan-name">${e(plan.name)}</span>${markWord(plan.tickets, "list")}</span>` +
    `<span class="row-why">${title === null ? `<span class="unset">No planning record names this plan</span>` : e(title)}</span>` +
    (plan.problem === null ? "" : `<span class="row-problem">${e(plan.problem)}</span>`) +
    (plan.counts.total === 0
      ? ""
      : `<span class="row-progress">${progressBar(plan.counts, plan.ready)}</span>`) +
    `<span class="row-meta">${plan.documents.map((document) => `<span class="mono">${e(document.file)}</span>`).join("")}${
      planning === undefined
        ? ""
        : `<span>planning change ${e(planning.state ?? "unreadable")}</span>`
    }</span>` +
    `</a></li>`
  );
}

/**
 * The list of plans.
 * @param list the plans
 * @returns the view's HTML
 */
export function plansListHtml(list: PlansList): string {
  if (list.unavailable !== null)
    return `<p class="callout bad">The plans cannot be read: ${e(list.unavailable)}</p>`;
  if (list.plans.length === 0)
    return `<div class="empty"><p>No plan yet.</p><p class="secondary">A plan directory exists only when a change's plan step splits the work into tickets: <span class="mono">.greenline/plans/&lt;NNN-name&gt;/</span>, listed here with each ticket's progress.</p></div>`;
  return `<ul class="plan-list">${list.plans.map(planRow).join("")}</ul>`;
}

/** A change record that names the plan, as one linked line; its reason left out where the page's title already gives it. */
function recordLink(record: PlanRecord, why = true): string {
  return (
    `<a class="record-link" href="${e(changeHref(record.id))}">${stateWord(record.state)}` +
    (why
      ? `<span class="record-why">${record.why === null ? `<span class="unset">the record does not parse</span>` : e(record.why)}</span>`
      : "") +
    `<span class="record-meta"><span class="mono">${e(record.id)}</span>${record.mode === null ? "" : `<span class="mode-word">${e(record.mode)}</span>`}</span></a>`
  );
}

function ticketHtml(plan: PlanDetail, ticket: TicketView): string {
  // Progress status could not derive is unknown, never shown as "not started".
  const progress = !plan.derived ? "unknown" : ticket.ready ? "ready" : ticket.progress;
  const after =
    ticket.after.length === 0
      ? ""
      : `<p class="ticket-after"><span class="label">After</span>${ticket.after
          .map((id) => {
            const other = plan.tickets.find((entry) => entry.id === id);
            return `<span class="tag" data-progress="${e(other?.progress ?? "")}">${e(id)}${other === undefined ? "" : ` · ${e(other.progress)}`}</span>`;
          })
          .join("")}</p>`;
  const records =
    ticket.records.length === 0
      ? `<p class="ticket-records none">No record yet: a ticket nobody started has none.</p>`
      : `<ul class="ticket-records">${ticket.records
          .map((record) => {
            // Status holds the mode a ticket opened under against its entry, a later raise apart.
            const notes = [
              record.opened !== null && record.opened !== ticket.mode
                ? `opened under ${e(record.opened)}${record.owner ? ", the owner's choice" : ""}; the entry gives ${e(ticket.mode)}`
                : "",
              record.mode !== null && record.opened !== null && record.mode !== record.opened
                ? `raised to ${e(record.mode)}`
                : "",
            ].filter((note) => note !== "");
            const override =
              notes.length === 0 ? "" : `<span class="override">${notes.join("; ")}</span>`;
            return `<li>${recordLink(record)}${override}</li>`;
          })
          .join("")}</ul>`;
  return (
    `<li class="ticket" data-ticket="${e(ticket.id)}" data-anchor="${e(ticket.id)}" data-progress="${e(progress)}">` +
    `<div class="ticket-head"><span class="ticket-id mono">${e(ticket.id)}</span>` +
    `<span class="progress-word" data-progress="${e(progress)}">${progress === "ready" ? "ready to start" : progress === "unknown" ? "progress unknown" : e(progress)}</span>` +
    `<span class="mode-word">${e(ticket.mode)}</span></div>` +
    `<p class="ticket-intent">${e(ticket.intent)}</p>` +
    after +
    `<div class="ticket-fields"><div><h4>Scope</h4><ul class="scope">${ticket.scope.map((path) => `<li class="mono">${e(path)}</li>`).join("")}</ul></div>` +
    `<div><h4>Acceptance</h4><ul class="acceptance">${ticket.acceptance.map((line) => `<li>${e(line)}</li>`).join("")}</ul></div></div>` +
    records +
    `</li>`
  );
}

function documentHtml(plan: PlanDetail, document: PlanDocumentView): string {
  const rendered =
    document.body === null
      ? null
      : renderDocument(
          document.body,
          repositoryResolver(plan.path.slice(0, -1)),
          planHref(plan.name, document.file),
        );
  const title = rendered?.title ?? document.file;
  return (
    `<details class="file plan-document" open data-file="${e(document.file)}" data-anchor="${e(document.file)}">` +
    `<summary><span class="file-title">${e(title)}</span><span class="mono file-name">${e(document.file)}</span>${markWord(document.status, "document")}</summary>` +
    (document.problem === null ? "" : `<p class="callout bad">${e(document.problem)}</p>`) +
    (rendered === null
      ? `<p class="unset">It cannot be shown.</p>`
      : `<div class="md document-body">${rendered.html}</div>`) +
    `</details>`
  );
}

/**
 * One plan's page: its planning change, the ready frontier, each ticket in
 * the order the tickets file gives, and the plan documents.
 * @param plan the plan
 * @returns the page's HTML
 */
export function planHtml(plan: PlanDetail): string {
  const planning = plan.planning[0];
  const title = planning?.why ?? plan.name;
  const head =
    `<nav class="crumb"><a href="#plans">&larr; All plans</a></nav>` +
    `<header class="plan-head"><p class="eyebrow"><span class="mono">${e(plan.path)}</span>${markWord(plan.mark, "list")}</p>` +
    `<h1>${e(title)}</h1>` +
    (plan.planning.length === 0
      ? `<p class="secondary">No planning record names this plan.</p>`
      : `<div class="planning"><span class="label">Planning change</span>${plan.planning.map((record, index) => recordLink(record, index > 0)).join("")}</div>`) +
    `</header>`;
  if (plan.problem !== null)
    return `<article class="plan">${head}<p class="callout bad">The plan directory cannot be read: ${e(plan.problem)}</p></article>`;
  const underived =
    !plan.derived && plan.tickets.length > 0
      ? `<p class="callout warn"><span class="mono">greenline status</span> could not derive the tickets' progress here, so it is shown as unknown; reload once status reads the workspace.</p>`
      : "";
  const waits =
    plan.mark === "draft"
      ? `<div class="next-callout" data-state="stopped" role="note"><span class="next-label">The ticket list waits for the owner's approval.</span><p class="next-action">No ticket is ready until <span class="mono">tickets.md</span> is marked complete.</p></div>`
      : "";
  const frontier =
    plan.mark === "complete" && plan.derived
      ? `<section class="frontier" aria-labelledby="frontier-title"><h2 id="frontier-title">Ready to start <span class="count">${plan.frontier.length}</span></h2>${
          plan.frontier.length === 0
            ? `<p class="secondary">No ticket is ready: each waits on an earlier entry, or every ticket has started.</p>`
            : `<ul class="ready">${plan.frontier
                .map((id) => {
                  const ticket = plan.tickets.find((entry) => entry.id === id);
                  return `<li><a href="${e(planHref(plan.name, id))}"><span class="mono">${e(id)}</span><span>${e(ticket?.intent ?? "")}</span><span class="mode-word">${e(ticket?.mode ?? "")}</span></a></li>`;
                })
                .join("")}</ul>`
        }</section>`
      : "";
  const tickets = !plan.hasTickets
    ? `<section class="tickets"><h2>Tickets</h2><p class="secondary">The plan holds no <span class="mono">tickets.md</span> yet.</p></section>`
    : plan.ticketsProblem !== null
      ? `<section class="tickets"><h2>Tickets</h2><p class="callout bad"><span class="mono">tickets.md</span> ${plan.ticketsRefused ? "is not shown" : "does not parse"}: ${e(plan.ticketsProblem)}</p></section>`
      : `<section class="tickets" aria-labelledby="tickets-title"><h2 id="tickets-title">Tickets <span class="count">${plan.tickets.length}</span></h2><ol class="ticket-list">${plan.tickets
          .map((ticket) => ticketHtml(plan, ticket))
          .join("")}</ol></section>`;
  const strays =
    plan.strays.length === 0
      ? ""
      : `<section class="strays"><h2>Records naming no ticket of this list</h2><ul class="ticket-records">${plan.strays
          .map(
            (record) =>
              `<li>${recordLink(record)}<span class="override">names ${e(record.ticket ?? "")}</span></li>`,
          )
          .join("")}</ul></section>`;
  const documents =
    plan.documents.length === 0
      ? ""
      : `<section class="documents" aria-labelledby="documents-title"><h2 id="documents-title">Plan documents <span class="count">${plan.documents.length}</span></h2>${plan.documents
          .map((document) => documentHtml(plan, document))
          .join("")}</section>`;
  const notes =
    plan.notes.length === 0
      ? ""
      : `<ul class="problems">${plan.notes
          .map(
            (note) =>
              `<li class="callout ${note.severity === "error" ? "bad" : "warn"}"><span class="mono">${e(note.code)}</span> ${e(note.message)}</li>`,
          )
          .join("")}</ul>`;
  return `<article class="plan" data-plan="${e(plan.name)}">${head}${underived}${waits}${notes}${frontier}${tickets}${strays}${documents}</article>`;
}
