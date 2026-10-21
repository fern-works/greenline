import { expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (the gate-outcome precedent)
import { WORKSPACE_HOME } from "../../scripts/lib/workspace-homes.mjs";

/** One home regex for every checker that validates a `.greenline/` path (the map's mismatch 12). */
it("accepts the homes the product defines and refuses anything else under .greenline", () => {
  for (const home of [
    ".greenline/ledger/receipts/x.json",
    ".greenline/ledger/2026-10-08-retry/review-1.md",
    ".greenline/plans/003-login/tickets.md",
    ".greenline/diagrams/auth/a.svg",
    ".greenline/map/GLOSSARY-MAP.md",
    ".greenline/tmp/skill/scratch.txt",
    ".greenline/manifest.json",
    ".greenline/lock.json",
    ".greenline/WORK.md",
    ".greenline/THIRD_PARTY_NOTICES.md",
    ".greenline/DECISIONS.md",
    ".greenline/policy-changes.json",
  ])
    expect(WORKSPACE_HOME.test(home), home).toBe(true);
  for (const other of [
    ".greenline/notes.md",
    ".greenline/evidence/x",
    ".greenline/manifest.json.bak",
  ])
    expect(WORKSPACE_HOME.test(other), other).toBe(false);
});

it("S20 the plan directory is a workspace home, and the earlier artifacts' home is not", () => {
  expect(WORKSPACE_HOME.test(".greenline/plans/001-auth/tickets.md")).toBe(true);
  expect(WORKSPACE_HOME.test(".greenline/ledger/2026-10-04-fix-login.md")).toBe(true);
  expect(WORKSPACE_HOME.test(".greenline/work/tickets/TKT-001.md")).toBe(false);
});
