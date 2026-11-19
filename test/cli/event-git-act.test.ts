/**
 * A git act that moves the working tree writes no metadata (J-228 S1; the
 * register's row of 2026-11-09, "Outcomes, not manners"), through `greenline
 * event`'s entry point on fixture repositories with real git, the case the
 * run j201t-linear-visuals' (finding 1, 001/018 `item_8` and `item_9`, 002/007
 * `item_6` to `item_8`): after the agent's `git stash push` of a journey's
 * manifest the after-tool hook, reading the files whose times moved, wrote
 * `madeBy: session` into it again, and the merge that followed aborted on
 * the dirty file. The hook now takes no homes from a command whose git act
 * moves the tree: no maker filled, no change named and no frame map derived;
 * a shell command's own write still gets its maker (J-135 S2).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-10-shortcuts";
const RECORD = `.greenline/ledger/${ID}.md`;
const JOURNEY = ".greenline/visuals/journeys/save-transaction.visual.json";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const definition = ((): ModesDefinition => {
  const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
})();

interface Space {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly git: (...args: string[]) => string;
}

function recordText(): string {
  return [
    "---",
    "mode: regular",
    "choice: accepted",
    'yes: "Yes, go ahead."',
    'why: "the shortcuts are undocumented"',
    "state: done",
    'next: "none"',
    "---",
    "",
    "## frame",
    "",
    "- Q1 [scope] Every shortcut or the common ones?\n  - proposed: every one",
    "",
  ].join("\n");
}

/** A workspace on main after the change's close, as the run's main checkout stood, its record done and a journey's manifest committed, the manifest with no maker. */
function workspace(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-git-act-"));
  cleanup.push(root);
  const space: Space = {
    root,
    git: (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    write: (path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    },
  };
  space.git("init", "--quiet", "-b", "main");
  space.write(
    ".greenline/manifest.json",
    JSON.stringify({
      schemaVersion: 6,
      targets: ["claude-code", "codex"],
      checks: [],
      proceed: "none",
      hooks: { adapters: true, git: false },
    }),
  );
  space.write(".gitignore", ".greenline/tmp/\n.greenline/ledger/sessions/\n");
  space.write("a.txt", "a\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  space.write(RECORD, recordText());
  space.write(JOURNEY, manifest(space));
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "open the change");
  return space;
}

function manifest(space: Space): string {
  return `${JSON.stringify({
    schema: "greenline.visual/v1",
    title: "Saving a transaction",
    form: "sequence",
    skill: "diagram-design",
    change: ID,
    commit: space.git("rev-parse", "HEAD"),
    files: ["a.txt"],
    made: "2026-11-10",
    summary: "The save.",
  })}\n`;
}

function fire(where: Space, payload: JsonValue): void {
  const writer = new RecordingWriter();
  runEventCli(["--harness", "claude-code"], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date(),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
}

/** A shell command through the hooks, the files the act writes written between its two events. */
function shell(where: Space, call: string, command: string, act: () => void): void {
  const event = (name: string): JsonValue => ({
    hook_event_name: name,
    session_id: "s1",
    tool_name: "Bash",
    tool_use_id: call,
    cwd: where.root,
    tool_input: { command },
  });
  fire(where, event("PreToolUse"));
  act();
  fire(where, event("PostToolUse"));
}

const makerOf = (where: Space, path: string): string | undefined =>
  z
    .looseObject({ madeBy: z.string().optional() })
    .parse(JSON.parse(readFileSync(join(where.root, path), "utf8"))).madeBy;

const frameMap = (where: Space): string =>
  join(where.root, ".greenline", "ledger", ID, "frame-map.json");

describe("J-228 S1 a git act that moves the tree writes no metadata (j201t-linear-visuals F1)", () => {
  it("leaves a stashed manifest as git wrote it, its committed copy with no maker", () => {
    const space = workspace();
    fire(space, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "Merge it." });
    space.write(JOURNEY, manifest(space).replace("The save.", "The save, edited."));
    shell(space, "st", `git stash push -- ${JOURNEY}`, () => {
      space.git("stash", "push", "--quiet", "--", JOURNEY);
    });
    expect(makerOf(space, JOURNEY)).toBeUndefined();
    expect(space.git("status", "--porcelain")).toBe("");
    // A merge that moves the manifest writes no maker either.
    shell(space, "mg", "git merge --no-edit greenline/other", () => {
      space.write(JOURNEY, readFileSync(join(space.root, JOURNEY), "utf8"));
    });
    expect(makerOf(space, JOURNEY)).toBeUndefined();
  });

  it("derives no frame map from a record a checkout moves", () => {
    const space = workspace();
    shell(space, "co", "git switch --quiet other && git switch --quiet -", () => {
      space.write(RECORD, recordText());
    });
    expect(existsSync(frameMap(space))).toBe(false);
  });

  it("still fills the maker of a manifest a shell command writes itself", () => {
    const space = workspace();
    shell(space, "w", `cat > ${JOURNEY} <<'EOF'\n{}\nEOF`, () => {
      space.write(JOURNEY, manifest(space));
    });
    expect(makerOf(space, JOURNEY)).toBe("session");
  });
});
