/**
 * `greenline status --change` summarises a change's skill loads (J-116 S3)
 * on a real repository with greenline installed: each skill with its count,
 * whole or part and its steps, the skills its sections declare beside the
 * loaded, the record's `skills` line the close states, and the loads files
 * kept out of the folder's reports, so a finished change never reports them
 * uncited.
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
const ID = "2026-10-18-letters";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A workspace with greenline installed and committed, and a writer of its files. */
interface Workspace {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
}

function workspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), "status-loads-"));
  cleanup.push(root);
  const git = (...args: string[]): void => {
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
    });
  };
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet");
  write("a.txt", "a\n");
  const rec = new RecordingWriter();
  if (
    runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    }) !== 0
  )
    throw new Error(`init failed: ${rec.err}`);
  git("add", "--all");
  git("commit", "--quiet", "-m", "install greenline");
  return { root, write };
}

function status(root: string, ...args: string[]) {
  const rec = new RecordingWriter();
  const code = runCli(["status", ...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  return { code, out: rec.out, err: rec.err };
}

const LOADS = [
  {
    skill: "grilling",
    file: "SKILL.md",
    whole: true,
    via: "Skill",
    at: "2026-10-18T09:00:00.000Z",
    step: null,
    agent: null,
    session: "s1",
    turn: 1,
  },
  {
    skill: "grilling",
    file: "SKILL.md",
    whole: true,
    via: "Skill",
    at: "2026-10-18T09:30:00.000Z",
    step: "frame",
    agent: null,
    session: "s1",
    turn: 2,
  },
  {
    skill: "delivery-review",
    file: "SKILL.md",
    whole: true,
    via: "Read",
    at: "2026-10-18T10:00:00.000Z",
    step: "review",
    agent: "a1",
    session: "s1",
    turn: 2,
  },
  {
    skill: "delivery-review",
    file: "references/greenline.md",
    whole: false,
    via: "sed",
    at: "2026-10-18T10:05:00.000Z",
    step: "review",
    agent: "a1",
    session: "s1",
    turn: 2,
  },
];

function record(state: string, extra: readonly string[]): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "the letters"',
    `state: ${state}`,
    ...extra,
    "---",
    "",
    "## frame",
    "x",
    "## plan",
    "x",
    "## anticipate",
    "none at quick",
    "## build",
    "the letter",
    "## review",
    "none at quick",
    "## verify",
    "Read the diff by `delivery-review`'s checklist.",
    "## close",
    "x",
    "",
  ].join("\n");
}

describe("J-116 S3 status summarises a change's loads, and the close states the skills line", () => {
  it("prints a change with four facts summarised, the declared skills beside the loaded, and its skills line", () => {
    const { root, write } = workspace();
    write(
      `.greenline/ledger/${ID}.md`,
      record("done", ["next: none", "skills: [grilling, delivery-review]"]),
    );
    write(
      `.greenline/ledger/${ID}/skills/2026-10-18.jsonl`,
      `${LOADS.map((load) => JSON.stringify(load)).join("\n")}\n`,
    );
    const resume = status(root, "--change", ID);
    expect(resume.out).toContain(
      [
        "  skill loads (4 loads):",
        "    grilling: 2 loads, 2 whole, before the record and at frame",
        "    delivery-review: 2 loads, 1 whole, 1 part, at review",
        "  skills declared and loaded: delivery-review",
        "  skills loaded and not declared: grilling",
        "  skills line: grilling, delivery-review",
      ].join("\n"),
    );
    expect(resume.out + resume.err).not.toContain("skills/2026-10-18.jsonl");
    const json = JSON.parse(status(root, "--change", ID, "--json").out);
    expect(json.changes.change.loads).toMatchObject({
      count: 4,
      uses: [
        { skill: "grilling", loads: 2, whole: 2, part: 0, steps: ["frame"], beforeRecord: 1 },
        {
          skill: "delivery-review",
          loads: 2,
          whole: 1,
          part: 1,
          steps: ["review"],
          beforeRecord: 0,
        },
      ],
    });
    expect(json.changes.change.skills).toEqual(["grilling", "delivery-review"]);
  });

  it("says no load was noted, and refuses a skills line that names no skill", () => {
    const { root, write } = workspace();
    write(`.greenline/ledger/${ID}.md`, record("open", []));
    expect(status(root, "--change", ID).out).toContain("  skill loads: none noted");
    write(`.greenline/ledger/${ID}.md`, record("open", ['skills: ["Two Words"]']));
    const refused = status(root, "--change", ID);
    expect(refused.code).toBe(1);
    expect(refused.out + refused.err).toContain(
      "the skills line names each skill the change loaded",
    );
  });
});
