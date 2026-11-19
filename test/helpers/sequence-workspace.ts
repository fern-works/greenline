/**
 * The workspace the lifecycle sequences drive (J-140 S2; test/shell/sequences/):
 * a real git repository with greenline's git hooks installed and registered,
 * a `greenline` on the PATH that runs the product's own `hook` and `event`
 * commands from source, a remote of the kind a sequence names, and the
 * harness payloads Claude Code and Codex pipe to `greenline event`. Each
 * sequence file walks one documented lifecycle in the order its page gives.
 * The suite runs only under GREENLINE_SEQUENCES=1, which the
 * lifecycle-sequences gate row sets (scripts/lib/lifecycle-sequences.mjs).
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok } from "../../src/commons/result.ts";
import {
  factsFileName,
  finishedFacts,
  parseFacts,
  serializeFacts,
  startedFacts,
} from "../../src/core/facts.ts";
import { GIT_HOOK_NAMES, gitHookScript, HOOKS_DIRECTORY } from "../../src/core/git-hooks.ts";
import { HOOKS_ON } from "../../src/core/manifest.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { registerGitHooks } from "../../src/shell/hooks.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "./writer.ts";

/** Whether this run holds the sequence suite: only under GREENLINE_SEQUENCES=1. */
export const SEQUENCES_OFF: boolean = process.env["GREENLINE_SEQUENCES"] !== "1";

/** A sequence's time: real git runs a hook through node for each act. */
export const SEQUENCE_TIMEOUT: number = 180_000;

export const ID: string = "2026-10-27-shelf";
export const BRANCH: string = `greenline/${ID}`;
export const GROUND: string = "feature/find-by-author";
export const RECORD: string = `.greenline/ledger/${ID}.md`;
const REVISION = "c".repeat(64);
const cleanup: string[] = [];
const originalPath = process.env["PATH"] ?? "";
let shim = "";

/** Remove every directory this module made; each sequence file calls it after all. */
export function cleanUp(): void {
  process.env["PATH"] = originalPath;
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
  shim = "";
}

/** Put greenline's shim first on the PATH, as an installed workspace has `greenline`. */
export function useShim(): void {
  if (shim === "") {
    shim = mkdtempSync(join(tmpdir(), "greenline-sequence-shim-"));
    cleanup.push(shim);
    const entry = join(import.meta.dirname, "hooks-entry.ts");
    writeFileSync(
      join(shim, "greenline"),
      `#!/bin/sh\nexec "${process.execPath}" "${entry}" "$@"\n`,
    );
    chmodSync(join(shim, "greenline"), 0o755);
  }
  process.env["PATH"] = [shim, originalPath].join(":");
}

export interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

export interface Workspace {
  readonly root: string;
  readonly git: (...args: string[]) => Ran;
  readonly write: (path: string, text: string) => void;
  readonly read: (path: string) => string;
}

/** The remote a sequence runs against: a forge's URL pushed into a bare repository, a path, or none. */
export type Origin = "forge" | "path" | "none";

/** A workspace on `main` with the hooks registered, its manifest's checks declared, and its remote. */
export function workspace(origin: Origin): Workspace {
  useShim();
  const root = mkdtempSync(join(tmpdir(), "greenline-sequence-"));
  cleanup.push(root);
  const git = (...args: string[]): Ran => {
    const ran = spawnSync("git", ["-c", "user.name=O", "-c", "user.email=o@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_EDITOR: "true" },
    });
    return { code: ran.status ?? -1, out: ran.stdout, err: ran.stderr };
  };
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("a.txt", "a\n");
  write(
    ".greenline/manifest.json",
    `${JSON.stringify({ schemaVersion: 6, targets: ["claude-code"], proceed: "none", checks: [], hooks: HOOKS_ON }, null, 2)}\n`,
  );
  for (const name of GIT_HOOK_NAMES) {
    write(`${HOOKS_DIRECTORY}/${name}`, gitHookScript(name));
    chmodSync(join(root, HOOKS_DIRECTORY, name), 0o755);
  }
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  registerGitHooks(root, HOOKS_ON);
  const space = {
    root,
    git,
    write,
    read: (path: string) => readFileSync(join(root, path), "utf8"),
  };
  if (origin !== "none") {
    const bare = mkdtempSync(join(tmpdir(), "greenline-sequence-remote-"));
    cleanup.push(bare);
    spawnSync("git", ["init", "--quiet", "--bare", bare]);
    if (origin === "path") git("remote", "add", "origin", bare);
    else {
      const url = "https://github.com/example/shelf.git";
      git("remote", "add", "origin", url);
      git("config", `url.${bare}.insteadOf`, url);
    }
    git("push", "--quiet", "origin", "main");
  }
  return space;
}

/**
 * The outcome line a done record states (J-168 S1), where its lines give
 * none of their own.
 * @param lines the record's front-matter lines
 * @returns the line, or none
 */
export function outcomeOf(lines: readonly string[]): readonly string[] {
  const has = (key: string): boolean => lines.some((line) => line.startsWith(`${key}:`));
  // An accepted record quotes the owner's yes, and a done one carries every line its mode owes (J-176 S1).
  const yes = lines.includes("choice: accepted") && !has("yes") ? ['yes: "Yes, go ahead."'] : [];
  if (!lines.includes("state: done")) return yes;
  return [
    ...yes,
    // The floors line, owed from the open in every mode (J-226 S1).
    ...(has("floors") ? [] : ["floors: none"]),
    ...(has("ground") ? [] : ["ground: branch"]),
    ...(has("agent") ? [] : ['agent: "claude-code/opus"']),
    ...(has("skills") ? [] : ["skills: [frame, build, verify, close]"]),
    ...(has("outcome") ? [] : ['outcome: "The shelf finds books by author."']),
  ];
}

/** A change record in the ledger guide's front matter, with a frame and, when given, a close section. */
export function recordText(lines: readonly string[], close?: string): string {
  return [
    "---",
    "mode: quick",
    'why: "the shelf finds books by author"',
    ...lines,
    ...outcomeOf(lines),
    "---",
    "",
    "## frame",
    "",
    "find a book by its author",
    "",
    ...(close === undefined ? [] : ["## close", "", close, ""]),
  ].join("\n");
}

/** Write the record and commit it, and its folder, alone. */
export function commitRecord(space: Workspace, text: string, message: string): Ran {
  space.write(RECORD, text);
  space.git("add", "--", RECORD, ...(folderHolds(space) ? [`.greenline/ledger/${ID}/`] : []));
  return space.git("commit", "--quiet", "-m", message);
}

const folderHolds = (space: Workspace): boolean => {
  try {
    return readdirSync(join(space.root, ".greenline/ledger", ID)).length > 0;
  } catch {
    return false;
  }
};

/** Write a code file and commit it. */
export function commitCode(space: Workspace, path: string, message: string): Ran {
  space.write(path, `${path}\n`);
  space.git("add", "--", path);
  return space.git("commit", "--quiet", "-m", message);
}

/** The change trailer of the latest commit, as git reads its trailers. */
export const trailerOf = (space: Workspace): string =>
  space.git("log", "-1", "--format=%(trailers:key=Greenline-Change,valueonly)").out.trim();

/** A check's facts under the change's folder, exited with the code given at the hour given. */
export function writeCheck(space: Workspace, code: number, at: string): void {
  const startedAt = `2026-10-27T${at}:00:00.000Z`;
  const started = startedFacts({
    arguments: ["node", "-e", "the unit check"],
    startedAt,
    commit: null,
    tree: null,
    installation: REVISION,
  });
  space.write(
    `.greenline/ledger/${ID}/checks/${factsFileName(startedAt, "seq001")}`,
    serializeFacts(finishedFacts(started, { kind: "exited", code }, 5)),
  );
}

/** `greenline check` on the merge commit for the change at the close step; returns the commit its facts name. */
export async function checkOnMerge(space: Workspace, code: number): Promise<string | null> {
  const writer = new RecordingWriter();
  await runCheckCli(
    ["--change", ID, "--step", "close", "--", "node", "-e", `process.exit(${String(code)})`],
    writer.writer,
    {
      cwd: space.root,
      installation: () => ok(fixtureInstallation()),
      environment: process.env,
      stdio: "ignore",
    },
  );
  const folder = join(space.root, ".greenline/ledger", ID, "checks");
  const newest = readdirSync(folder).sort().at(-1) ?? "";
  const facts = parseFacts(readFileSync(join(folder, newest), "utf8"), "facts");
  return facts._tag === "ok" ? facts.value.commit : null;
}

/** A harness's name for `greenline event --harness`. */
export type Harness = "claude-code" | "codex";

/** A tool's event as a harness pipes it to `greenline event`: Codex's carries a turn and its model, Claude Code's a shell call's duration after it. */
export interface ToolEvent {
  readonly hook_event_name: "PreToolUse" | "PostToolUse";
  readonly session_id: string;
  readonly tool_name: string;
  readonly tool_use_id: string;
  readonly cwd: string;
  readonly tool_input: Readonly<Record<string, string>>;
  readonly turn_id?: string;
  readonly model?: string;
  duration_ms?: number;
}

/**
 * A message of the owner's at a turn's start, in the session the harness's
 * tool events carry, which the hooks journal (J-176 S1).
 */
export function ownerSays(space: Workspace, harness: Harness, words: string): Ran {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: space.root,
    stdin: () =>
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: harness === "codex" ? "c1" : "s1",
        cwd: space.root,
        prompt: words,
      }),
    modes: () => ["quick", "regular", "careful"],
  });
  return { code, out: writer.out, err: writer.err };
}

/** One event through `greenline event`, as the harness's adapter pipes it. */
export function fire(space: Workspace, harness: Harness, payload: ToolEvent): Ran {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: space.root,
    stdin: () => JSON.stringify(payload),
    modes: () => ["quick", "regular", "careful"],
  });
  return { code, out: writer.out, err: writer.err };
}

/** A shell command's tool event, in the harness's own shape: Codex's carries a turn and no duration. */
export function shellEvent(
  space: Workspace,
  harness: Harness,
  name: "PreToolUse" | "PostToolUse",
  call: string,
  command: string,
): ToolEvent {
  if (harness === "codex")
    return {
      hook_event_name: name,
      session_id: "c1",
      turn_id: "t1",
      cwd: space.root,
      model: "gpt-6.1-sol",
      tool_name: "Bash",
      tool_input: { command },
      tool_use_id: call,
    };
  const event: ToolEvent = {
    hook_event_name: name,
    session_id: "s1",
    tool_name: "Bash",
    tool_use_id: call,
    cwd: space.root,
    tool_input: { command },
  };
  if (name === "PostToolUse") event.duration_ms = 1000;
  return event;
}

/** The write tool's event for one path, in the harness's shape: Claude Code's Write, Codex's apply_patch. */
export function writeEvent(
  space: Workspace,
  harness: Harness,
  name: "PreToolUse" | "PostToolUse",
  call: string,
  path: string,
): ToolEvent {
  return harness === "codex"
    ? {
        hook_event_name: name,
        session_id: "c1",
        turn_id: "t1",
        cwd: space.root,
        model: "gpt-6.1-sol",
        tool_name: "apply_patch",
        tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+x\n*** End Patch\n` },
        tool_use_id: call,
      }
    : {
        hook_event_name: name,
        session_id: "s1",
        tool_name: "Write",
        tool_use_id: call,
        cwd: space.root,
        tool_input: { file_path: join(space.root, path), content: "x" },
      };
}
