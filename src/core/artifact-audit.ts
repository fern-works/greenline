import type { Artifact, InitiativeArtifact, TicketArtifact } from "./artifact.ts";

/**
 * Cross-artifact checks (`docs/SPEC.md` §7 "Doctor checks"): id
 * uniqueness, reference resolution, staleness, exclusive ticket claims,
 * acyclic dependencies, and the evidence table. Pure over a parsed work
 * tree; `doctor` maps these findings to diagnostics, `status` ignores
 * them. Findings are deterministic: sorted by kind, then path, then
 * message.
 */

/** One parsed artifact file, as collected from `.greenline/work/`. */
export interface AuditedArtifact {
  /** Path relative to `.greenline/work/`, forward slashes. */
  readonly path: string;
  readonly artifact: Artifact;
}

/** A single audit finding; `kind` maps one-to-one onto doctor codes. */
export interface ArtifactFinding {
  readonly kind:
    | "id-duplicate"
    | "reference-unresolved"
    | "consumption-stale"
    | "consumption-ahead"
    | "claim-conflict"
    | "dependency-cycle"
    | "evidence-missing"
    | "complete-unproven";
  readonly path: string;
  readonly message: string;
}

function byKindPathMessage(a: ArtifactFinding, b: ArtifactFinding): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

/** `INIT-001/TKT-002` → `INIT-001`; `INIT-001` → `INIT-001`. */
function initiativeIdOf(artifactId: string): string {
  const cut = artifactId.indexOf("/");
  return cut === -1 ? artifactId : artifactId.slice(0, cut);
}

function isTicket(artifact: Artifact): artifact is TicketArtifact {
  return artifact.type === "ticket";
}

function isInitiative(artifact: Artifact): artifact is InitiativeArtifact {
  return artifact.type === "initiative";
}

/** Index ids; duplicate claims become findings, first file wins the slot. */
function indexIds(
  tree: readonly AuditedArtifact[],
  findings: ArtifactFinding[],
): ReadonlyMap<string, AuditedArtifact> {
  const byId = new Map<string, AuditedArtifact>();
  for (const entry of tree) {
    const existing = byId.get(entry.artifact.id);
    if (existing !== undefined) {
      findings.push({
        kind: "id-duplicate",
        path: entry.path,
        message: `id '${entry.artifact.id}' is claimed by both '${existing.path}' and '${entry.path}'`,
      });
      continue;
    }
    byId.set(entry.artifact.id, entry);
  }
  return byId;
}

function checkConsumptions(
  tree: readonly AuditedArtifact[],
  byId: ReadonlyMap<string, AuditedArtifact>,
  findings: ArtifactFinding[],
): void {
  for (const { path, artifact } of tree) {
    for (const consumed of artifact.consumes) {
      const target = byId.get(consumed.id);
      if (target === undefined) {
        findings.push({
          kind: "reference-unresolved",
          path,
          message: `'${artifact.id}' consumes '${consumed.id}', which no artifact declares`,
        });
        continue;
      }
      if (consumed.revision < target.artifact.revision) {
        findings.push({
          kind: "consumption-stale",
          path,
          message: `'${artifact.id}' consumes revision ${consumed.revision} of '${consumed.id}', which is at revision ${target.artifact.revision}`,
        });
      } else if (consumed.revision > target.artifact.revision) {
        findings.push({
          kind: "consumption-ahead",
          path,
          message: `'${artifact.id}' consumes revision ${consumed.revision} of '${consumed.id}', which is at revision ${target.artifact.revision}`,
        });
      }
    }
    if (artifact.type === "review" && byId.get(artifact.ticket)?.artifact.type !== "ticket") {
      findings.push({
        kind: "reference-unresolved",
        path,
        message: `'${artifact.id}' reviews '${artifact.ticket}', which no artifact declares`,
      });
    }
    if (artifact.type === "initiative") {
      for (const id of artifact.tickets)
        if (byId.get(id)?.artifact.type !== "ticket")
          findings.push({
            kind: "reference-unresolved",
            path,
            message: `initiative '${artifact.id}' names unavailable ticket '${id}'`,
          });
    }
    if (!isTicket(artifact)) continue;
    for (const dep of artifact.dependsOn) {
      if (byId.get(dep)?.artifact.type !== "ticket") {
        findings.push({
          kind: "reference-unresolved",
          path,
          message: `'${artifact.id}' depends on '${dep}', which no artifact declares`,
        });
      }
    }
  }
}

function checkClaims(tree: readonly AuditedArtifact[], findings: ArtifactFinding[]): void {
  // Exclusivity is WIP-1 for the building window only (ADR 0014): outside
  // `claimed`/`implementing` the held claim is the recorded builder and the
  // review bounce's return address, never an active build.
  const ACTIVE_BUILD = new Set(["claimed", "implementing"]);
  const claims = new Map<string, string>();
  for (const { path, artifact } of tree) {
    if (!isTicket(artifact) || artifact.claimedBy === null) continue;
    if (!ACTIVE_BUILD.has(artifact.status)) continue;
    const firstId = claims.get(artifact.claimedBy);
    if (firstId !== undefined) {
      findings.push({
        kind: "claim-conflict",
        path,
        message: `'${artifact.claimedBy}' claims both '${firstId}' and '${artifact.id}'`,
      });
      continue;
    }
    claims.set(artifact.claimedBy, artifact.id);
  }
}

/**
 * Find every dependency cycle through a depth-first search with a
 * three-color marking; each member of a cycle gets its own finding
 * naming the full walk.
 */
function checkCycles(
  tickets: readonly { path: string; ticket: TicketArtifact }[],
  findings: ArtifactFinding[],
): void {
  const graph = new Map<string, { path: string; deps: readonly string[] }>();
  for (const { path, ticket } of tickets) {
    graph.set(ticket.id, { path, deps: ticket.dependsOn });
  }
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const walk = (id: string): void => {
    state.set(id, "visiting");
    stack.push(id);
    const node = graph.get(id);
    for (const dep of node?.deps ?? []) {
      if (!graph.has(dep)) continue; // unresolved: reported as a reference
      if (state.get(dep) === undefined) {
        walk(dep);
        continue;
      }
      if (state.get(dep) === "done") continue;
      const start = stack.indexOf(dep);
      const cycle = [...stack.slice(start), dep];
      for (const [index, member] of cycle.slice(0, -1).entries()) {
        const memberPath = graph.get(member)?.path;
        if (memberPath === undefined) continue;
        const walkFromMember = [...cycle.slice(index), ...cycle.slice(1, index + 1)];
        findings.push({
          kind: "dependency-cycle",
          path: memberPath,
          message: `dependency cycle: ${walkFromMember.join(" -> ")}`,
        });
      }
    }
    stack.pop();
    state.set(id, "done");
  };

  for (const id of [...graph.keys()].sort()) {
    if (state.get(id) === undefined) walk(id);
  }
}

function checkTicketEvidence(tree: readonly AuditedArtifact[], findings: ArtifactFinding[]): void {
  const reviews = tree.flatMap(({ artifact }) => (artifact.type === "review" ? [artifact] : []));
  for (const { path, artifact } of tree) {
    if (!isTicket(artifact)) continue;
    if (artifact.status === "claimed" && artifact.claimedBy === null) {
      findings.push({
        kind: "evidence-missing",
        path,
        message: `ticket '${artifact.id}' is claimed but records no claimed_by`,
      });
    }
    if (artifact.status === "implemented" && artifact.resultCommit === null) {
      findings.push({
        kind: "evidence-missing",
        path,
        message: `ticket '${artifact.id}' is implemented but records no result_commit`,
      });
    }
    if (
      (artifact.status === "reviewing" ||
        artifact.status === "verifying" ||
        artifact.status === "complete") &&
      !reviews.some(
        (review) =>
          review.ticket === artifact.id &&
          review.range.split("..")[1] === artifact.resultCommit &&
          (artifact.status === "reviewing" || review.status === "complete"),
      )
    ) {
      // `verifying` claims a review happened (041 build-7 advanced past
      // review and only self-correction caught it); the evidence bar is
      // the same one `reviewing` already carries.
      findings.push({
        kind: "evidence-missing",
        path,
        message: `ticket '${artifact.id}' is ${artifact.status} but has no ${artifact.status === "reviewing" ? "review" : "completed review"} of this exact ticket and result_commit`,
      });
    }
    if (
      artifact.status !== "draft" &&
      artifact.status !== "complete" &&
      artifact.acceptance.length === 0
    )
      findings.push({
        kind: "evidence-missing",
        path,
        message: `ticket '${artifact.id}' is ${artifact.status} but has no acceptance criteria`,
      });
    if (artifact.status === "complete") {
      if (artifact.resultCommit === null) {
        findings.push({
          kind: "complete-unproven",
          path,
          message: `ticket '${artifact.id}' is complete but records no result_commit`,
        });
      }
      if (artifact.acceptance.length === 0 || artifact.acceptance.some((item) => !item.done)) {
        findings.push({
          kind: "complete-unproven",
          path,
          message: `ticket '${artifact.id}' is complete but has unchecked acceptance items`,
        });
      }
    }
  }
}

function checkInitiativeEvidence(
  tree: readonly AuditedArtifact[],
  findings: ArtifactFinding[],
): void {
  const byInitiative = new Map<string, AuditedArtifact[]>();
  for (const entry of tree) {
    const key = initiativeIdOf(entry.artifact.id);
    const bucket = byInitiative.get(key);
    if (bucket === undefined) byInitiative.set(key, [entry]);
    else bucket.push(entry);
  }
  for (const [initiativeId, entries] of byInitiative) {
    const initiative = entries.map((e) => e.artifact).find(isInitiative);
    if (initiative === undefined) continue;
    const hasComplete = (type: "decisions" | "spec"): boolean =>
      entries.some((e) => e.artifact.type === type && e.artifact.status === "complete");
    const tickets = tree.filter(
      (entry) => initiative.tickets.includes(entry.artifact.id) && isTicket(entry.artifact),
    );
    const path = entries.find((e) => e.artifact === initiative)?.path ?? "";

    if (initiative.status === "decided" && !hasComplete("decisions")) {
      findings.push({
        kind: "evidence-missing",
        path,
        message: `initiative '${initiativeId}' is decided but has no completed decisions.md`,
      });
    }
    if (initiative.status === "specified" && !hasComplete("spec")) {
      findings.push({
        kind: "evidence-missing",
        path,
        message: `initiative '${initiativeId}' is specified but has no completed spec.md`,
      });
    }
    if (initiative.status === "planned") {
      if (tickets.length === 0) {
        findings.push({
          kind: "evidence-missing",
          path,
          message: `initiative '${initiativeId}' is planned but has no tickets`,
        });
      } else {
        // Only the depends_on graph is planned's evidence. Judge it from
        // the tickets themselves: an unresolved consumes is reported on
        // its own by checkConsumptions and must not dirty the graph.
        const ticketIds = new Set(
          tree.filter((entry) => isTicket(entry.artifact)).map((entry) => entry.artifact.id),
        );
        const dirtyKinds = new Set<string>();
        if (
          tickets.some(
            (ticket) =>
              isTicket(ticket.artifact) &&
              ticket.artifact.dependsOn.some((dep) => !ticketIds.has(dep)),
          )
        ) {
          dirtyKinds.add("reference-unresolved");
        }
        const ticketPaths = new Set(tickets.map((ticket) => ticket.path));
        if (
          findings.some(
            (finding) => finding.kind === "dependency-cycle" && ticketPaths.has(finding.path),
          )
        ) {
          dirtyKinds.add("dependency-cycle");
        }
        if (dirtyKinds.size > 0) {
          findings.push({
            kind: "evidence-missing",
            path,
            message: `initiative '${initiativeId}' is planned but its ticket graph is not clean (see ${[...dirtyKinds].sort().join(", ")} findings)`,
          });
        }
      }
    }
    if (initiative.status === "reviewing") {
      const hasReview = tree.some(
        (entry) =>
          entry.artifact.type === "review" && initiative.tickets.includes(entry.artifact.ticket),
      );
      if (!hasReview) {
        findings.push({
          kind: "evidence-missing",
          path,
          message: `initiative '${initiativeId}' is reviewing but has no review artifact`,
        });
      }
    }
    if (initiative.status === "complete") {
      for (const ticket of tickets) {
        const status = ticket.artifact.status;
        if (isTicket(ticket.artifact) && status !== "complete") {
          findings.push({
            kind: "evidence-missing",
            path,
            message: `initiative '${initiativeId}' is complete but ticket '${ticket.artifact.id}' is still ${status}`,
          });
        }
      }
    }
  }
}

/**
 * Run every cross-artifact check over a parsed work tree. Id
 * duplicates, stale or impossible consumptions, double claims, cycles,
 * and missing evidence are collected in one pass; nothing is mutated.
 */
export function auditArtifacts(tree: readonly AuditedArtifact[]): readonly ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];
  const byId = indexIds(tree, findings);
  checkConsumptions(tree, byId, findings);
  const membership = new Map<string, string>();
  for (const { path, artifact } of tree) {
    if (artifact.type !== "initiative") continue;
    for (const id of artifact.tickets) {
      const previous = membership.get(id);
      if (previous !== undefined)
        findings.push({
          kind: "claim-conflict",
          path,
          message: `ticket '${id}' belongs to both '${previous}' and '${artifact.id}'`,
        });
      else membership.set(id, artifact.id);
    }
  }

  checkClaims(tree, findings);
  checkCycles(
    tree.flatMap((entry) =>
      isTicket(entry.artifact) ? [{ path: entry.path, ticket: entry.artifact }] : [],
    ),
    findings,
  );
  checkTicketEvidence(tree, findings);
  checkInitiativeEvidence(tree, findings);
  return [...findings].sort(byKindPathMessage);
}
