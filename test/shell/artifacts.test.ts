import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectArtifacts } from "../../src/shell/artifacts.ts";

/**
 * The work-tree collector (`docs/SPEC.md` §7): real filesystem in a
 * temp directory, because the product IS a file tool. Expected values
 * are the fixture files' own declared ids.
 */

const root = mkdtempSync(join(tmpdir(), "greenline-artifacts-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

const INITIATIVE = `---
id: INIT-001
type: initiative
status: executing
revision: 1
---

# One
`;

const TICKET = `---
id: TKT-001
type: ticket
intent: fixture-change
scope: [src]
status: ready
revision: 1
depends_on:
  - TKT-000
---

## TKT-001
`;

describe("collectArtifacts", () => {
  it("parses every markdown file under work/ and reports failures per file", () => {
    write("work/001-one/initiative.md", INITIATIVE);
    write("work/tickets/TKT-001.md", TICKET);
    write(
      "work/001-one/notes.md",
      "---\nid: INIT-001\ntype: spec\nstatus: draft\nrevision: 1\n---\n",
    );
    write("work/002-two/scratch.txt", "not an artifact");

    const collected = collectArtifacts(join(root, "work"));
    expect(collected._tag).toBe("ok");
    if (collected._tag !== "ok") return;
    expect(collected.value.parsed.map((entry) => entry.artifact.id)).toEqual([
      "INIT-001",
      "TKT-001",
    ]);
    expect(collected.value.failures).toEqual([
      {
        path: "001-one/notes.md",
        issues: [
          {
            path: "",
            message:
              "'notes.md' is not an initiative-root artifact (expected initiative.md, decisions.md, spec.md, or map.md)",
          },
        ],
      },
      {
        path: "002-two/scratch.txt",
        issues: [
          {
            path: "",
            message:
              "only Markdown artifacts live under work/ — raw evidence (traces, measurements, instruments) lives under work/evidence/<TKT-NNN>/, output beside the instrument that produced it",
          },
        ],
      },
    ]);
  });

  // ADR 0015: raw ticket evidence (traces, measurements, screenshots)
  // lives under <initiative>/evidence/, exempt from Markdown-only —
  // run 041's speed-bar traces were evicted from the workspace and the
  // ticket then bounced on evidence reproducibility.
  it("exempts the evidence/ subtree from Markdown-only and from parsing", () => {
    write("work/003-three/initiative.md", INITIATIVE.replace("INIT-001", "INIT-003"));
    write("work/evidence/TKT-001/scroll-trace.json", "{}");
    write("work/evidence/TKT-001/measure.js", "// instrument");
    write("work/evidence/TKT-001/notes.md", "not frontmattered, still evidence");

    const collected = collectArtifacts(join(root, "work"));
    expect(collected._tag).toBe("ok");
    if (collected._tag !== "ok") return;
    const three = collected.value.failures.filter((f) => f.path.startsWith("evidence/"));
    expect(three).toEqual([]);
    expect(collected.value.parsed.some((e) => e.path.startsWith("evidence/"))).toBe(false);
  });

  it("teaches the evidence home when a non-Markdown file lands elsewhere", () => {
    write("work/004-four/traces/dump.json", "{}");
    const collected = collectArtifacts(join(root, "work"));
    expect(collected._tag).toBe("ok");
    if (collected._tag !== "ok") return;
    const failure = collected.value.failures.find((f) => f.path === "004-four/traces/dump.json");
    expect(failure?.issues[0]?.message).toBe(
      "only Markdown artifacts live under work/ — raw evidence (traces, measurements, instruments) lives under work/evidence/<TKT-NNN>/, output beside the instrument that produced it",
    );
  });

  it("collects nothing when work/ does not exist yet", () => {
    const collected = collectArtifacts(join(root, "missing-work"));
    expect(collected._tag).toBe("ok");
    if (collected._tag !== "ok") return;
    expect(collected.value.parsed).toEqual([]);
    expect(collected.value.failures).toEqual([]);
  });
});
