/**
 * `greenline status` lists the discussions beside the changes (J-118 S2),
 * on real repositories: each open and parked discussion with its state and
 * its idea in the text, every one in the JSON, the settled ones counted, a
 * record that does not read failing status with GL0480; and a change
 * promoted from a discussion whose research report its folder lacks raising
 * GL0481 as a notice (J-118 S3).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const TALK = "2026-10-21-offline-mode";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Repository {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
}

function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "status-discussions-"));
  cleanup.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const rec = new RecordingWriter();
  if (
    runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    }) !== 0
  )
    throw new Error(`init failed: ${rec.err}`);
  return { root, write };
}

function talk(idea: string, lines: readonly string[], body = ""): string {
  return ["---", `idea: "${idea}"`, ...lines, "---", "", body].join("\n");
}

interface Status {
  readonly code: number;
  readonly out: string;
  readonly envelope: {
    readonly diagnostics: readonly { code: string; severity: string; message: string }[];
    readonly discussions?: {
      readonly discussions: readonly { id: string; state: string; idea: string }[];
      readonly unreadable: readonly { id: string }[];
    };
  };
}

function status(root: string): Status {
  const run = (json: boolean) => {
    const rec = new RecordingWriter();
    const code = runCli(["status", ...(json ? ["--json"] : [])], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    });
    return { code, out: rec.out };
  };
  const json = run(true);
  const text = run(false);
  // SAFETY: the envelope's JSON is the CLI's own output, read for its fields.
  const envelope = JSON.parse(json.out) as Status["envelope"];
  return { code: json.code, out: text.out, envelope };
}

describe("J-118 S2 status lists the discussions beside the changes", () => {
  it("prints each open and parked discussion with its state and idea, counts the settled, and carries every one in the JSON", () => {
    const repo = repository();
    repo.write(
      `.greenline/ledger/discussions/${TALK}.md`,
      talk("Let the app work on a train", ["state: open"]),
    );
    repo.write(
      ".greenline/ledger/discussions/2026-10-23-plugins.md",
      talk("A plugin system", ['revisit: "after the release"', "state: parked", 'words: "later"']),
    );
    repo.write(
      ".greenline/ledger/discussions/2026-10-19-rust.md",
      talk("Rewrite the CLI in Rust", ['reason: "TypeScript"', "state: declined", 'words: "no"']),
    );
    const found = status(repo.root);
    expect(found.code).toBe(0);
    expect(found.out).toContain(
      [
        "discussions",
        `  ${TALK}: open; "Let the app work on a train"`,
        '  2026-10-23-plugins: parked until after the release; "A plugin system"',
        "  settled: 1 declined",
      ].join("\n"),
    );
    expect(found.out.indexOf("discussions\n")).toBeGreaterThan(found.out.indexOf("changes"));
    expect(found.envelope.discussions?.discussions.map((row) => [row.id, row.state])).toEqual([
      ["2026-10-19-rust", "declined"],
      [TALK, "open"],
      ["2026-10-23-plugins", "parked"],
    ]);
  });

  it("prints no discussions block while the ledger holds none", () => {
    const found = status(repository().root);
    expect(found.out).not.toContain("discussions");
    expect(found.envelope.discussions).toEqual({ discussions: [], unreadable: [] });
  });

  it("fails status with GL0480 on a discussion record that does not read", () => {
    const repo = repository();
    repo.write(`.greenline/ledger/discussions/${TALK}.md`, "---\nidea: x\n---\n");
    const found = status(repo.root);
    expect(found.code).not.toBe(0);
    expect(found.envelope.diagnostics).toContainEqual(
      expect.objectContaining({ code: "GL0480", severity: "error" }),
    );
    expect(found.out).toContain(`  ${TALK}: does not read`);
  });
});

describe("J-118 S3 a discussion promotes two changes that start from it", () => {
  const changeRecord = (from: string): string =>
    [
      "---",
      "mode: quick",
      "choice: accepted",
      'why: "w"',
      "state: open",
      `from: ${from}`,
      "---",
      "",
      "## frame",
      "",
      "From the discussion's decisions: Q1 yes, reading and queued writes.",
      "",
    ].join("\n");

  function promoted(): Repository {
    const repo = repository();
    repo.write(
      `.greenline/ledger/discussions/${TALK}.md`,
      talk("Let the app work on a train", [
        "state: promoted",
        'words: "make the cache headers and the service worker two changes"',
        "changes: [2026-10-24-cache-headers, 2026-10-25-service-worker]",
      ]),
    );
    repo.write(`.greenline/ledger/discussions/${TALK}/frame-research-1.md`, "the cache limits\n");
    for (const change of ["2026-10-24-cache-headers", "2026-10-25-service-worker"]) {
      repo.write(`.greenline/ledger/${change}.md`, changeRecord(TALK));
      repo.write(
        `.greenline/ledger/${change}/discussions/${TALK}/frame-research-1.md`,
        "the cache limits\n",
      );
    }
    return repo;
  }

  it("reads both changes' from lines and the research copied into each folder, with no notice", () => {
    const found = status(promoted().root);
    expect(found.envelope.diagnostics.filter((note) => note.code === "GL0481")).toEqual([]);
    expect(found.envelope.discussions?.discussions).toEqual([
      expect.objectContaining({
        id: TALK,
        state: "promoted",
        changes: ["2026-10-24-cache-headers", "2026-10-25-service-worker"],
      }),
    ]);
    expect(found.out).toContain("  settled: 1 promoted");
  });

  it("names a promoted change whose folder lacks the discussion's report as GL0481, a notice that fails nothing", () => {
    const repo = promoted();
    rmSync(
      join(
        repo.root,
        `.greenline/ledger/2026-10-25-service-worker/discussions/${TALK}/frame-research-1.md`,
      ),
    );
    const found = status(repo.root);
    const notes = found.envelope.diagnostics.filter((note) => note.code === "GL0481");
    expect(notes).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: `copy the research report frame-research-1.md into .greenline/ledger/2026-10-25-service-worker/discussions/${TALK}/ and cite the copy: change 2026-10-25-service-worker was promoted from the discussion ${TALK}, and its folder lacks the report`,
      }),
    ]);
  });
});

describe("J-226 S1 a record whose discussion does not name it (j217t-discussions finding 4)", () => {
  const EXPORTS = "2026-11-10-finance-loan-exports";
  const PLAN = "2026-11-10-finance-export-plan";
  const record = (from: string, state = "done"): string =>
    [
      "---",
      "mode: regular",
      "choice: owner",
      'why: "Plan CSV and JSON loan exports for the finance office."',
      `state: ${state}`,
      `from: ${from}`,
      "---",
      "",
      "## frame",
      "",
      "These decisions come from the promoted discussion.",
      "",
    ].join("\n");

  /** The run's ledger: the discussion promoted to the CSV and the JSON changes, and the planning record that names it too. */
  function exports(): Repository {
    const repo = repository();
    repo.write(
      `.greenline/ledger/discussions/${EXPORTS}.md`,
      talk("Export loans for finance in CSV and JSON", [
        "state: promoted",
        'words: "No, the desk app keeps no history. Promote the export idea to two changes, one for the CSV and one for the JSON."',
        "changes: [2026-11-10-finance-csv, 2026-11-10-finance-json]",
      ]),
    );
    for (const change of ["2026-11-10-finance-csv", "2026-11-10-finance-json"])
      repo.write(`.greenline/ledger/${change}.md`, record(`[${EXPORTS}]`));
    repo.write(`.greenline/ledger/${PLAN}.md`, record(`[${EXPORTS}]`));
    return repo;
  }

  const unnamed = (found: Status) =>
    found.envelope.diagnostics.filter((note) => note.code === "GL0482");

  it("warns with GL0482 on the planning record the discussion does not name, and on neither record it names", () => {
    expect(unnamed(status(exports().root))).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: `say which line is wrong, change ${PLAN}'s from line or the discussion ${EXPORTS}'s changes line, and correct it: the record names the discussion as its origin, and the discussion's changes line does not name the record`,
      }),
    ]);
  });

  it("raises no GL0482 for a from line naming a discussion the workspace does not hold", () => {
    const repo = repository();
    repo.write(`.greenline/ledger/${PLAN}.md`, record("[2026-11-09-elsewhere]", "open"));
    expect(unnamed(status(repo.root))).toEqual([]);
  });
});
