import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import { initiativeMd, reviewMd, ticketMd } from "../fixtures/artifacts.ts";

/**
 * The status command (`docs/SPEC.md` §4, §7): factual view over the
 * work tree, `--json` for agents, fail-closed on unparseable artifacts.
 */

const VERSION: string = "0.1.0";
const tempDirs: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-status-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  const rec = new RecordingWriter();
  const code = runCli(["init", "--yes"], rec.writer, VERSION, {
    cwd: dir,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  if (code !== 0) throw new Error(`init failed in fixture: ${rec.err}`);
  return dir;
}

function write(root: string, rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function run(root: string, args: readonly string[]): Run {
  const rec = new RecordingWriter();
  const code = runCli([...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  return { code, out: rec.out, err: rec.err };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("greenline status", () => {
  it("prints frontier and pending reviews while refusing unsupported completion", () => {
    const root = makeWorkspace();
    write(
      join(root, ".greenline/work/001-user-auth"),
      "initiative.md",
      initiativeMd("001", "user-auth", "executing", 1, ["TKT-001", "TKT-002"]),
    );
    write(
      join(root, ".greenline/work/tickets"),
      "TKT-001.md",
      ticketMd("001", {
        status: "complete",
        resultCommit: "a1b2c3d",
        acceptance: [{ text: "green", done: true }],
      }),
    );
    write(
      join(root, ".greenline/work/tickets"),
      "TKT-002.md",
      ticketMd("002", { dependsOn: ["TKT-001"] }),
    );
    write(join(root, ".greenline/work/reviews"), "REV-001.md", reviewMd("001", "001"));

    const result = run(root, ["status"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0301");
    expect(result.out).toContain("INIT-001 001-user-auth executing");
    expect(result.out).toContain("frontier: TKT-002");
    expect(result.out).toContain("reviews pending: REV-001");
  });

  it("emits the versioned envelope with a structured view for --json", () => {
    const root = makeWorkspace();
    write(
      join(root, ".greenline/work/001-user-auth"),
      "initiative.md",
      initiativeMd("001", "user-auth", "planned", 1, ["TKT-001"]),
    );
    write(
      join(root, ".greenline/work/tickets"),
      "TKT-001.md",
      ticketMd("001", { status: "ready" }),
    );

    const result = run(root, ["status", "--json"]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out);
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      command: "status",
      ok: true,
      effects: [],
      diagnostics: [],
    });
    expect(parsed.view).toEqual({
      initiatives: [
        {
          id: "INIT-001",
          directory: "001-user-auth",
          status: "planned",
          tickets: [{ id: "TKT-001", status: "ready", blocked: false }],
          ticketsComplete: 0,
          ticketsTotal: 1,
          frontier: ["TKT-001"],
          blocked: [],
          pendingReviews: [],
        },
      ],
      tickets: [{ id: "TKT-001", status: "ready", blocked: false }],
      frontier: ["TKT-001"],
      blocked: [],
      pendingReviews: [],
    });
  });

  it("lists the House rulings stanza's dash lines from AGENTS.md, as text and in the envelope", () => {
    const root = makeWorkspace();
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    writeFileSync(
      join(root, "AGENTS.md"),
      `# demo\n\n## House rulings\n\n- Errors are thrown, never returned.\n- No default exports.\n\n${agents}`,
    );
    const human = run(root, ["status"]);
    expect(human.code).toBe(0);
    expect(human.out).toContain("house rulings (AGENTS.md): 2");
    expect(human.out).toContain("  - No default exports.");
    const json = run(root, ["status", "--json"]);
    expect(JSON.parse(json.out).houseRulings).toEqual([
      "Errors are thrown, never returned.",
      "No default exports.",
    ]);
    const bare = run(makeWorkspace(), ["status"]);
    expect(bare.out).toContain("house rulings: none");
  });

  it("reports an empty workspace with zero initiatives and exit 0", () => {
    const root = makeWorkspace();
    const result = run(root, ["status"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("no recorded work");
  });

  it("exits 1 with GL0201 when an artifact fails to parse, keeping the healthy view", () => {
    const root = makeWorkspace();
    write(
      join(root, ".greenline/work/001-user-auth"),
      "initiative.md",
      initiativeMd("001", "user-auth", "executing"),
    );
    write(
      join(root, ".greenline/work/tickets"),
      "TKT-00X.md",
      "---\nid: TKT-00X\ntype: ticket\nintent: fixture-change\nscope: [src]\nstatus: ready\nrevision: 1\n---\n",
    );

    const result = run(root, ["status", "--json"]);
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.out);
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]).toMatchObject({
      code: "GL0201",
      path: ".greenline/work/tickets/TKT-00X.md",
    });
    expect(parsed.view.initiatives).toEqual([
      {
        id: "INIT-001",
        directory: "001-user-auth",
        status: "executing",
        tickets: [],
        ticketsComplete: 0,
        ticketsTotal: 0,
        frontier: [],
        blocked: [],
        pendingReviews: [],
      },
    ]);
  });

  it("fails closed with GL0101 outside an initialized workspace", () => {
    const root = makeWorkspace();
    rmSync(join(root, ".greenline"), { recursive: true, force: true });
    const result = run(root, ["status"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0101");
  });
});
