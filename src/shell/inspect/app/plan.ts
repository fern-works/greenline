import { h, type ComponentChild } from "preact";
import type {
  PlanDetail,
  PlanDocumentView,
  PlanListEntry,
  PlanRecord,
  TicketView,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import {
  ArtefactFold,
  Callout,
  Empty,
  PartFailed,
  Prose,
  RecordLink,
  StateWord,
  Tag,
} from "./ui.ts";

/*
 * The plan's components: a plan's row with its tickets' progress, a
 * ticket's card with its fields and the change records that name it, a
 * plan document with its mark, and the plan page. Progress and the ready
 * tickets are status's derivations, never written.
 */

const planPath = (name: string, part: string | null = null): string =>
  pathOf({ page: "plan", name, part });

/** The mark of a tickets file or a plan document, in the owner's words. */
function markWord(mark: string | null, of: "list" | "document"): ComponentChild {
  if (mark === null) return null;
  const words =
    of === "list" ? (mark === "complete" ? "list approved" : "list waits for the owner") : mark;
  return h(Tag, null, words);
}

/** The share of tickets in each progress, as one bar with its words beside it. */
function Progress(props: {
  readonly counts: PlanListEntry["counts"];
  readonly ready: readonly string[];
}): ComponentChild {
  const counts = props.counts;
  if (counts.total === 0) return null;
  const words = [
    `${counts.done} of ${counts.total} done`,
    counts.inProgress === 0 ? "" : `${counts.inProgress} in progress`,
    props.ready.length === 0 ? "" : `ready: ${props.ready.join(", ")}`,
  ].filter((part) => part !== "");
  const segment = (kind: string, count: number): ComponentChild =>
    count === 0 ? null : h("span", { "data-progress": kind, style: `flex-grow:${count}` });
  return h(
    "div",
    { class: "row-top" },
    h(
      "span",
      { class: "progress", role: "img", "aria-label": words.join(", ") },
      segment("done", counts.done),
      segment("in progress", counts.inProgress),
      segment("not started", counts.notStarted),
    ),
    h("span", { class: "meta" }, words.join(" · ")),
  );
}

/** One plan in the list: its name, its planning change's reason, its tickets' progress and its documents. */
export function PlanRow(props: { readonly plan: PlanListEntry }): ComponentChild {
  const plan = props.plan;
  const planning = plan.planning[0];
  return h(
    "li",
    { "data-component": "PlanRow" },
    h(
      "div",
      { class: "row-top" },
      h(
        "a",
        { class: "title", href: planPath(plan.name), "data-item": "" },
        h(RecordLink, {
          kind: "plan",
          id: plan.name,
          href: planPath(plan.name),
          plain: true,
          named: plan.ref,
        }),
      ),
      markWord(plan.tickets, "list"),
    ),
    h(
      "p",
      { class: "next-line" },
      planning?.why ?? h("span", { class: "unset" }, "No planning record names this plan"),
    ),
    plan.problem === null ? null : h(Callout, null, plan.problem),
    h(Progress, { counts: plan.counts, ready: plan.ready }),
    h(
      "div",
      { class: "row-meta" },
      plan.documents.map((document) => h("span", { class: "mono" }, document.file)),
      planning === undefined
        ? null
        : h("span", null, `planning change ${planning.state ?? "unreadable"}`),
    ),
  );
}

/** The plans list's empty and refused states. */
export function PlansEmpty(props: { readonly unavailable: string | null }): ComponentChild {
  return props.unavailable === null
    ? h(
        Empty,
        { title: "No plan yet." },
        h(
          "p",
          null,
          "A plan directory exists only when a change's plan step splits the work into tickets, under .greenline/plans/, listed here with each ticket's progress.",
        ),
      )
    : h(PartFailed, { reads: "the plans", reason: props.unavailable });
}

/** A change record that names the plan, as one linked line. */
function PlanRecordLine(props: {
  readonly record: PlanRecord;
  readonly why?: boolean;
}): ComponentChild {
  const record = props.record;
  const href = pathOf({ page: "change", id: record.id, part: null });
  return h(
    "span",
    { class: "row-top" },
    h(StateWord, { word: record.state }),
    props.why === false
      ? h(RecordLink, { kind: "change", id: record.id, href, named: record.ref })
      : h("a", { href }, record.why ?? "the record does not parse"),
    props.why === false
      ? null
      : h(
          "span",
          { class: "meta" },
          h(RecordLink, { kind: "change", id: record.id, href, plain: true, named: record.ref }),
        ),
    record.mode === null ? null : h("span", { class: "meta" }, record.mode),
  );
}

/** One ticket: its intent, the entries it comes after, its scope and acceptance, and the records naming it. */
export function TicketCard(props: {
  readonly plan: PlanDetail;
  readonly ticket: TicketView;
}): ComponentChild {
  const { plan, ticket } = props;
  // Progress status could not derive is unknown, never shown as "not started".
  const progress = !plan.derived
    ? "progress unknown"
    : ticket.ready
      ? "ready to start"
      : ticket.progress;
  return h(
    "section",
    { class: "ticket", "data-anchor": ticket.id, "data-component": "TicketCard" },
    h(
      "div",
      { class: "row-top" },
      h("span", { class: "mono title" }, ticket.id),
      h(StateWord, { word: progress }),
      h("span", { class: "meta" }, ticket.mode),
    ),
    h("p", null, ticket.intent),
    ticket.after.length === 0
      ? null
      : h(
          "p",
          { class: "meta" },
          "After: ",
          ticket.after.map((id) => {
            const other = plan.tickets.find((entry) => entry.id === id);
            return h(Tag, null, other === undefined ? id : `${id} · ${other.progress}`);
          }),
        ),
    h(
      "div",
      { class: "ticket-fields" },
      h(
        "div",
        null,
        h("h3", null, "Scope"),
        h(
          "ul",
          null,
          ticket.scope.map((path) => h("li", { class: "mono" }, path)),
        ),
      ),
      h(
        "div",
        null,
        h("h3", null, "Acceptance"),
        h(
          "ul",
          null,
          ticket.acceptance.map((line) => h("li", null, line)),
        ),
      ),
    ),
    ticket.records.length === 0
      ? h("p", { class: "meta" }, "No record yet: a ticket nobody started has none.")
      : h(
          "ul",
          { class: "plain" },
          ticket.records.map((record) => {
            // Status holds the mode a ticket opened under against its entry, a later raise apart.
            const notes = [
              record.opened !== null && record.opened !== ticket.mode
                ? `opened under ${record.opened}${record.owner ? ", the owner's choice" : ""}; the entry gives ${ticket.mode}`
                : "",
              record.mode !== null && record.opened !== null && record.mode !== record.opened
                ? `raised to ${record.mode}`
                : "",
            ].filter((note) => note !== "");
            return h(
              "li",
              null,
              h(PlanRecordLine, { record }),
              notes.length === 0 ? null : h("span", { class: "meta" }, notes.join("; ")),
            );
          }),
        ),
  );
}

/** One plan document with its mark, rendered. */
export function PlanDocumentCard(props: {
  readonly document: PlanDocumentView;
  readonly open: boolean;
  /** The plan that holds it, whose page's address follows the document once it opens. */
  readonly plan?: string;
}): ComponentChild {
  const document = props.document;
  return h(ArtefactFold, {
    id: document.file,
    kind: "plan document",
    component: "PlanDocumentCard",
    open: props.open,
    address: props.plan === undefined ? null : planPath(props.plan, document.file),
    closed: props.plan === undefined ? null : planPath(props.plan),
    head: [
      h("span", { class: "title" }, document.title),
      h("span", { class: "mono meta" }, document.file),
      markWord(document.status, "document"),
    ],
    held: {
      read: () => [
        document.problem === null ? null : h(Callout, null, document.problem),
        document.html === null
          ? h("p", { class: "unset" }, "It cannot be shown.")
          : h(Prose, { html: document.html }),
      ],
      source: null,
      json: { text: JSON.stringify(document, null, 2), address: null },
    },
  });
}

/** The plan page: its planning change, the ready tickets, each ticket in order, the strays, the documents. */
export function PlanPage(props: {
  readonly plan: PlanDetail;
  readonly part: string | null;
}): ComponentChild {
  const plan = props.plan;
  const planning = plan.planning[0];
  const head = [
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "plans" }) }, "Plans"),
      " / ",
      h(RecordLink, {
        kind: "plan",
        id: plan.name,
        href: planPath(plan.name),
        plain: true,
        named: plan.ref,
      }),
    ),
    h(
      "h1",
      null,
      planning?.why ??
        h(RecordLink, {
          kind: "plan",
          id: plan.name,
          href: planPath(plan.name),
          plain: true,
          named: plan.ref,
        }),
    ),
    h(
      "p",
      { class: "meta" },
      h("span", { class: "mono" }, plan.path),
      " ",
      markWord(plan.mark, "list"),
    ),
    plan.planning.length === 0
      ? h("p", { class: "meta" }, "No planning record names this plan.")
      : h(
          "div",
          { class: "row-top" },
          h("span", { class: "meta" }, "Planning change"),
          plan.planning.map((record, index) => h(PlanRecordLine, { record, why: index > 0 })),
        ),
  ];
  if (plan.problem !== null)
    return h(
      "article",
      { "data-component": "PlanPage" },
      head,
      h(Callout, null, `The plan directory cannot be read: ${plan.problem}`),
    );
  return h(
    "article",
    { "data-component": "PlanPage", "data-plan": plan.name },
    head,
    !plan.derived && plan.tickets.length > 0
      ? h(
          Callout,
          null,
          "greenline status could not derive the tickets' progress here, so it is shown as unknown; reload once status reads the workspace.",
        )
      : null,
    plan.mark === "draft"
      ? h(
          Callout,
          null,
          "The ticket list waits for the owner's approval: no ticket is ready until tickets.md is marked complete.",
        )
      : null,
    plan.notes.map((note) => h(Callout, null, `${note.code} ${note.message}`)),
    plan.mark === "complete" && plan.derived
      ? h(
          "section",
          null,
          h(
            "h2",
            null,
            "Ready to start",
            h("span", { class: "count" }, String(plan.frontier.length)),
          ),
          plan.frontier.length === 0
            ? h(
                "p",
                { class: "meta" },
                "No ticket is ready: each waits on an earlier entry, or every ticket has started.",
              )
            : h(
                "ul",
                { class: "rows" },
                plan.frontier.map((id) => {
                  const ticket = plan.tickets.find((entry) => entry.id === id);
                  return h(
                    "li",
                    null,
                    h(
                      "div",
                      { class: "row-top" },
                      h("a", { class: "mono", href: planPath(plan.name, id), "data-item": "" }, id),
                      h("span", null, ticket?.intent ?? ""),
                      h("span", { class: "meta" }, ticket?.mode ?? ""),
                    ),
                  );
                }),
              ),
        )
      : null,
    h(
      "section",
      null,
      h(
        "h2",
        null,
        "Tickets",
        plan.hasTickets ? h("span", { class: "count" }, String(plan.tickets.length)) : null,
      ),
      !plan.hasTickets
        ? h("p", { class: "meta" }, "The plan holds no tickets.md yet.")
        : plan.ticketsProblem !== null
          ? h(
              Callout,
              null,
              `tickets.md ${plan.ticketsRefused ? "is not shown" : "does not parse"}: ${plan.ticketsProblem}`,
            )
          : plan.tickets.map((ticket) => h(TicketCard, { plan, ticket })),
    ),
    plan.strays.length === 0
      ? null
      : h(
          "section",
          null,
          h("h2", null, "Records naming no ticket of this list"),
          h(
            "ul",
            { class: "plain" },
            plan.strays.map((record) =>
              h(
                "li",
                null,
                h(PlanRecordLine, { record }),
                h("span", { class: "meta" }, ` names ${record.ticket ?? ""}`),
              ),
            ),
          ),
        ),
    plan.documents.length === 0
      ? null
      : h(
          "section",
          null,
          h(
            "h2",
            null,
            "Plan documents",
            h("span", { class: "count" }, String(plan.documents.length)),
          ),
          plan.documents.map((document) =>
            h(PlanDocumentCard, {
              document,
              open: props.part === null || props.part === document.file,
              plan: plan.name,
            }),
          ),
        ),
  );
}
