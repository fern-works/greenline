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

  it("J-133 S1 carries the design section and design's critique page to review, its capture page to verify, on an interface change", () => {
    const INTERFACE = record(
      [
        "mode: careful",
        "choice: accepted",
        'why: "the members page"',
        "state: open",
        'interface: "yes, app"',
      ],
      [
        "## frame",
        "x",
        "## design",
        "components: table",
        "The owner picked the hairline table, ink on paper.",
        "## plan",
        "- The members page lists every member.",
        "## build",
        "Diagnosis: the timer.",
      ],
    );
    const root = workspace({ [ID]: INTERFACE });
    for (const page of ["critique", "capture"]) {
      mkdirSync(join(root, ".claude", "skills", "design", "references"), { recursive: true });
      writeFileSync(join(root, ".claude", "skills", "design", "references", `${page}.md`), "#\n");
    }
    expect(brief(root, REVIEW).code).toBe(0);
    const review = readFileSync(
      join(root, ".greenline", "ledger", ID, "brief-review-1.md"),
      "utf8",
    );
    expect(review).toContain("## The interface");
    expect(review).toContain(
      "components: table\nThe owner picked the hairline table, ink on paper.",
    );
    expect(review).toContain(
      "Read design's critique page, `.claude/skills/design/references/critique.md`, and review the interface by it.",
    );
    expect(review).not.toContain("Diagnosis: the timer.");
    expect(review.indexOf("## The interface")).toBeLessThan(review.indexOf("## Your report"));
    expect(brief(root, ["--change", ID, "--step", "verify", "--round", "1"]).code).toBe(0);
    const verify = readFileSync(
      join(root, ".greenline", "ledger", ID, "brief-verify-1.md"),
      "utf8",
    );
    expect(verify).toContain("The owner picked the hairline table, ink on paper.");
    expect(verify).toContain(
      "Read design's capture page, `.claude/skills/design/references/capture.md`, and capture each page the change touched with `greenline check interface --url <address> --path <page>`",
    );
    // A change that touches no interface carries no such section.
    const plain = workspace();
    expect(brief(plain, REVIEW).code).toBe(0);
    expect(
      readFileSync(join(plain, ".greenline", "ledger", ID, "brief-review-1.md"), "utf8"),
    ).not.toContain("## The interface");
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
      "Usage: greenline brief --change <id> --step design|anticipate|review|verify --round <n>",
    );
  });
});

describe("J-192 S1 greenline brief takes anticipate", () => {
  it("writes anticipate's brief with its artifact and contract, the nonce its report cites, and prints its path", () => {
    const root = workspace();
    const result = brief(root, [
      "--change",
      ID,
      "--step",
      "anticipate",
      "--round",
      "1",
      "--artifact",
      "src/export.js",
      "--contract",
      "An overdue loan's row carries its due date.",
    ]);
    expect(result.err).toContain("start the agent with this path and nothing else");
    expect(result.code).toBe(0);
    const path = `.greenline/ledger/${ID}/brief-anticipate-1.md`;
    expect(result.out).toBe(`${path}\n`);
    const text = readFileSync(join(root, path), "utf8");
    expect(readBrief(ID, "brief-anticipate-1.md", text).kind).toBe("written");
    expect(text).toMatch(/Its first line is `<!-- brief nonce [0-9a-f]{8} -->`/);
    expect(existsSync(join(root, ".greenline", "tmp", ID, "anticipate-1"))).toBe(true);
  });

  it("refuses a step the line starts no fresh agent at, naming the steps it takes", () => {
    const result = brief(workspace(), ["--change", ID, "--step", "build", "--round", "1"]);
    expect(result.code).toBe(2);
    expect(result.err).toContain(
      "the command writes the brief of each step that starts a fresh agent, design, anticipate, review and verify, not 'build'",
    );
  });
});
