/** `greenline brief` (J-89 S1): the brief written from a real record, its path printed, and every refusal writing nothing. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ok } from "../../src/commons/result.ts";
import { readBrief } from "../../src/core/brief.ts";
import { runBriefCli } from "../../src/shell/cli/brief.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const installation = fixtureInstallation();
const cleanup: string[] = [];
const ID = "2026-10-04-fix";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function record(front: readonly string[], body: readonly string[]): string {
  return ["---", ...front, "---", "", ...body, ""].join("\n");
}

const HIGH = record(
  ["mode: careful", "choice: accepted", 'why: "retry the deadline"', "state: open"],
  [
    "## frame",
    "x",
    "## plan",
    "- The retry stops at the deadline.",
    "## build",
    "Diagnosis: the timer.",
  ],
);

function workspace(records: Readonly<Record<string, string>> = { [ID]: HIGH }): string {
  const root = mkdtempSync(join(tmpdir(), "brief-"));
  cleanup.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "review", "references"), { recursive: true });
  writeFileSync(join(root, ".claude", "skills", "review", "references", "brief.md"), "# brief\n");
  for (const [id, text] of Object.entries(records))
    writeFileSync(join(root, ".greenline", "ledger", `${id}.md`), text);
  return root;
}

function brief(root: string, argv: readonly string[]) {
  const writer = new RecordingWriter();
  const code = runBriefCli(argv, writer.writer, {
    cwd: root,
    installation: () => ok(installation),
  });
  return { code, out: writer.out, err: writer.err };
}

const REVIEW = [
  "--change",
  ID,
  "--step",
  "review",
  "--round",
  "1",
  "--intent",
  "Stop at the deadline.",
];

describe("J-89 S1 greenline brief", () => {
  it("writes the reviewer's brief from the record into the change's folder and prints its path alone", () => {
    const root = workspace();
    const result = brief(root, REVIEW);
    expect(result.code).toBe(0);
    const path = `.greenline/ledger/${ID}/brief-review-1.md`;
    expect(result.out).toBe(`${path}\n`);
    expect(result.err).toContain("start the agent with this path and nothing else");
    const text = readFileSync(join(root, path), "utf8");
    expect(readBrief(ID, "brief-review-1.md", text)).toEqual({
      kind: "written",
      step: "review",
      round: 1,
    });
    expect(text).toContain("- The retry stops at the deadline.");
    expect(text).toContain("Stop at the deadline.");
    expect(text).toContain("`.claude/skills/review/references/brief.md`");
    expect(text).not.toContain("Diagnosis: the timer.");
  });

  it("J-89 S3 names the agent's scratch folder by its absolute path in the brief, and makes the folder", () => {
    const root = workspace();
    expect(brief(root, REVIEW).code).toBe(0);
    const scratch = join(root, ".greenline", "tmp", ID, "review-1");
    const text = readFileSync(join(root, ".greenline", "ledger", ID, "brief-review-1.md"), "utf8");
    expect(text).toContain(`Your scratch folder is \`${scratch}\`.`);
    expect(text).toContain(`--step review --round 1 -- <command>`);
    expect(existsSync(scratch)).toBe(true);
  });

  it("writes the verifier's brief the same way", () => {
    const root = workspace();
    const result = brief(root, ["--change", ID, "--step", "verify", "--round", "1"]);
    expect(result.code).toBe(0);
    expect(result.out).toBe(`.greenline/ledger/${ID}/brief-verify-1.md\n`);
  });

  it("never writes over a brief that stands, and writes nothing on any refusal", () => {
    const root = workspace();
    expect(brief(root, REVIEW).code).toBe(0);
    const path = join(root, ".greenline", "ledger", ID, "brief-review-1.md");
    const first = readFileSync(path, "utf8");
    const again = brief(root, [...REVIEW.slice(0, -1), "Another intent."]);
    expect(again.code).toBe(2);
    expect(again.err).toContain("already stands");
    expect(readFileSync(path, "utf8")).toBe(first);
    const refusals: readonly (readonly string[])[] = [
      [],
      ["--change", ID, "--step", "review", "--round", "1"],
      ["--change", ID, "--step", "build", "--round", "1"],
      ["--change", ID, "--step", "verify", "--round", "0"],
      ["--change", ID, "--step", "verify", "--round", "two"],
      ["--change", "2026-10-05-none", "--step", "verify", "--round", "1"],
      ["--change", ID, "--step", "verify", "--round", "1", "--axis", "spec"],
      ["--change", ID, "--step", "verify", "--round", "1", "--surprise"],
      ["--change", ID, "--change", ID, "--step", "verify", "--round", "1"],
      ["--change", ID, "--step", "review", "--round", "1", "--axis", "both", "--intent", "x"],
    ];
    for (const argv of refusals) {
      const result = brief(root, argv);
      expect(result.code, argv.join(" ")).toBe(2);
      expect(result.out).toBe("");
    }
    expect(existsSync(join(root, ".greenline", "ledger", ID, "brief-verify-1.md"))).toBe(false);
  });

  it("refuses outside a repository and for a change that is not open", () => {
    const outside = mkdtempSync(join(tmpdir(), "brief-outside-"));
    cleanup.push(outside);
    expect(brief(outside, REVIEW).err).toContain("inside a Git repository");
    const done = record(
      ["mode: careful", "choice: accepted", 'why: "w"', "state: done", "agents: 3", "rounds: 1"],
      ["## frame", "x", "## plan", "y"],
    );
    const root = workspace({ [ID]: done });
    const result = brief(root, REVIEW);
    expect(result.code).toBe(2);
    expect(result.err).toContain("open");
  });

  it("prints its usage on --help", () => {
    const result = brief(workspace(), ["--help"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "Usage: greenline brief --change <id> --step review|verify --round <n>",
    );
  });
});
