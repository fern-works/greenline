import { expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (the gate-outcome precedent)
import { WORKSPACE_HOME } from "../../scripts/lib/workspace-homes.mjs";

/** One home regex for every checker that validates a `.greenline/` path (the map's mismatch 12). */
it("accepts the homes the product defines and refuses anything else under .greenline", () => {
  for (const home of [
    ".greenline/work/tickets/TKT-001.md",
    ".greenline/ledger/records/x.json",
    ".greenline/diagrams/TKT-001/a.svg",
    ".greenline/map/CONTEXT-MAP.md",
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
