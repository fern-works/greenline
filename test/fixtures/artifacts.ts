/**
 * Artifact text builders shared by the status and command tests.
 * Fields mirror `docs/SPEC.md` §7; each builder emits exactly the
 * frontmatter its named artifact needs.
 */

export function initiativeMd(
  number: string,
  name: string,
  status = "executing",
  revision = 1,
  tickets: readonly string[] = [],
): string {
  return `---
id: INIT-${number}
type: initiative
status: ${status}
revision: ${revision}
tickets: [${tickets.join(", ")}]
---

# Initiative ${number}: ${name}
`;
}

export function specMd(number: string, status = "complete", revision = 1): string {
  return `---
id: INIT-${number}/SPEC
type: spec
status: ${status}
revision: ${revision}
---

# Spec ${number}
`;
}

export interface TicketOptions {
  readonly status?: string;
  readonly revision?: number;
  readonly dependsOn?: readonly string[];
  readonly claimedBy?: string | null;
  readonly resultCommit?: string | null;
  readonly acceptance?: readonly { readonly text: string; readonly done: boolean }[];
  readonly blocked?: boolean;
}

export function ticketMd(ticket: string, options: TicketOptions = {}): string {
  const {
    status = "ready",
    revision = 1,
    dependsOn = [],
    claimedBy,
    resultCommit,
    acceptance = [{ text: "Fixture behavior is demonstrated.", done: false }],
    blocked = false,
  } = options;
  const lines = [
    `id: TKT-${ticket}`,
    `type: ticket`,
    `intent: fixture-change`,
    `scope: [src]`,
    `status: ${status}`,
    `revision: ${revision}`,
  ];
  if (blocked) lines.push(`blocked: true`);
  if (dependsOn.length > 0) {
    lines.push(`depends_on:`);
    for (const dep of dependsOn) lines.push(`  - ${dep}`);
  }
  if (claimedBy !== undefined) lines.push(`claimed_by: ${claimedBy ?? "null"}`);
  if (resultCommit !== undefined) lines.push(`result_commit: ${resultCommit ?? "null"}`);
  if (acceptance.length > 0) {
    lines.push(`acceptance:`);
    for (const item of acceptance) lines.push(`  - [${item.done ? "x" : " "}] ${item.text}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n## TKT-${ticket}\n`;
}

export function reviewMd(
  ticket: string,
  review: string,
  status = "draft",
  range = "abc1234..def5678",
): string {
  return `---
id: REV-${review}
ticket: TKT-${ticket}
implementation_account: fixture-tkt-${ticket}-implementation
type: review
status: ${status}
revision: 1
range: ${range}
---

# Review ${review}
`;
}
