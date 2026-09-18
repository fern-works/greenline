import type { Artifact, TicketArtifact } from "./artifact.ts";

/**
 * The status view (`docs/SPEC.md` §7): a factual projection of the
 * parsed work tree. One row per initiative with its lifecycle state,
 * its tickets, the frontier (ready tickets whose dependencies are all
 * complete), blocked tickets, and pending reviews. Facts only: the
 * artifact files are the authority, and the view can always be
 * rebuilt by scanning them.
 */

/** One ticket as the view reports it. */
export interface TicketView {
  readonly id: string;
  readonly status: string;
  readonly blocked: boolean;
}

/** One initiative as the view reports it. */
export interface InitiativeView {
  readonly id: string;
  /** The initiative directory name (`001-user-auth`). */
  readonly directory: string;
  /** The initiative's lifecycle state; null when initiative.md is absent. */
  readonly status: string | null;
  readonly tickets: readonly TicketView[];
  /** Tickets at status complete. */
  readonly ticketsComplete: number;
  /** All tickets in the initiative. */
  readonly ticketsTotal: number;
  /** Ready tickets whose depends_on entries are all complete. */
  readonly frontier: readonly string[];
  /** Tickets carrying the blocked flag, in id order. */
  readonly blocked: readonly string[];
  /** Review artifacts that are not complete yet. */
  readonly pendingReviews: readonly string[];
}

/** One parsed artifact with its work-relative path. */
export interface StatusArtifact {
  readonly path: string;
  readonly artifact: Artifact;
}

function isTicket(artifact: Artifact): artifact is TicketArtifact {
  return artifact.type === "ticket";
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** All tickets have one global identity; initiatives reference a subset for their intent arc. */
export interface ProjectView {
  readonly initiatives: readonly InitiativeView[];
  readonly tickets: readonly TicketView[];
  readonly frontier: readonly string[];
  readonly blocked: readonly string[];
  readonly pendingReviews: readonly string[];
}

/** Build a factual view without inventing an initiative for compact work. */
export function buildStatusView(tree: readonly StatusArtifact[]): ProjectView {
  const ticketArtifacts = tree
    .flatMap((entry) => (isTicket(entry.artifact) ? [entry.artifact] : []))
    .sort(byId);
  const tickets = ticketArtifacts.map((ticket) => ({
    id: ticket.id,
    status: ticket.status,
    blocked: ticket.blocked,
  }));
  const status = new Map(ticketArtifacts.map((ticket) => [ticket.id, ticket.status]));
  const frontier = ticketArtifacts
    .filter(
      (ticket) =>
        ticket.status === "ready" &&
        !ticket.blocked &&
        ticket.dependsOn.every((id) => status.get(id) === "complete"),
    )
    .map((ticket) => ticket.id);
  const initiatives = tree
    .flatMap((entry): InitiativeView[] => {
      const initiative = entry.artifact;
      if (initiative.type !== "initiative") return [];
      const members = tickets.filter((ticket) => initiative.tickets.includes(ticket.id));
      return [
        {
          id: initiative.id,
          directory: entry.path.split("/")[0] ?? "",
          status: initiative.status,
          tickets: members,
          ticketsComplete: members.filter((ticket) => ticket.status === "complete").length,
          ticketsTotal: members.length,
          frontier: frontier.filter((id) => initiative.tickets.includes(id)),
          blocked: members.filter((ticket) => ticket.blocked).map((ticket) => ticket.id),
          pendingReviews: tree
            .flatMap(({ artifact }) =>
              artifact.type === "review" &&
              artifact.status !== "complete" &&
              initiative.tickets.includes(artifact.ticket)
                ? [artifact.id]
                : [],
            )
            .sort(),
        },
      ];
    })
    .sort(byId);
  return {
    initiatives,
    tickets,
    frontier,
    blocked: tickets.filter((ticket) => ticket.blocked).map((ticket) => ticket.id),
    pendingReviews: tree
      .flatMap(({ artifact }) =>
        artifact.type === "review" && artifact.status !== "complete" ? [artifact.id] : [],
      )
      .sort(),
  };
}

/**
 * The House rulings as status prints them (ADR 0028's amendment): the
 * stanza's dash lines, listed as facts, or the plain absence.
 */
export function renderHouseRulingsText(rulings: readonly string[]): string {
  if (rulings.length === 0) return "house rulings: none\n";
  const lines = [`house rulings (AGENTS.md): ${rulings.length}`];
  for (const ruling of rulings) lines.push(`  - ${ruling}`);
  lines.push("");
  return lines.join("\n");
}

/** Render the view as deterministic human text; facts only. */
export function renderStatusText(view: ProjectView): string {
  if (view.initiatives.length === 0 && view.tickets.length === 0) return "no recorded work\n";
  const lines: string[] = [];
  for (const initiative of view.initiatives)
    lines.push(
      `${initiative.id} ${initiative.directory} ${initiative.status ?? "-"} tickets ${initiative.ticketsComplete}/${initiative.ticketsTotal}`,
    );
  for (const ticket of view.tickets)
    lines.push(`ticket ${ticket.id} ${ticket.status}${ticket.blocked ? " blocked" : ""}`);
  if (view.frontier.length > 0) lines.push(`frontier: ${view.frontier.join(", ")}`);
  if (view.pendingReviews.length > 0)
    lines.push(`reviews pending: ${view.pendingReviews.join(", ")}`);
  return lines.join("\n") + "\n";
}
