/**
 * `greenline event` notes the skill loads (J-116 S2) on a fixture repository
 * with real git and payloads as Claude Code and Codex write them: each load
 * in the session's fact first, the change's from the turn its session wrote
 * its record, across sessions on a resume, with the step its record was in
 * and the agent; nothing for a read outside the installed roster.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { serializeLock } from "../../src/core/lock.ts";
import { parseChangeLoads, parseSessionFact } from "../../src/core/skill-loads.ts";
import { readChangesOnDisk } from "../../src/shell/changes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { changeLoads, loadsLockPath } from "../../src/shell/skill-loads.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-10-19-retry";
const DAY = "2026-10-19";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** The installed roster the fixture places, each file with its text. */
const ROSTER = {
  ".claude/skills/frame/SKILL.md": "# frame\n\nRead the request.\n",
  ".claude/skills/frame/references/greenline.md": "# frame's mechanics\n",
  ".claude/skills/tdd/SKILL.md": `${Array.from({ length: 100 }, (_, n) => `line ${String(n)}`).join("\n")}\n`,
  ".agents/skills/tdd/SKILL.md": "# tdd\n\nRed, green, refactor.\n",
  ".agents/skills/close/references/history.md": "# history\n\nWhat the record keeps.\n",
  ".agents/skills/pr-writing/SKILL.md": "# pr-writing\n\nThe message.\n",
} satisfies Readonly<Record<string, string>>;

interface Space {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly git: (...args: string[]) => string;
}

function record(lines: readonly string[]): string {
  return ["---", "mode: quick", 'why: "w"', "choice: accepted", ...lines, "---", "", ""].join("\n");
}

function space(open: readonly string[] | false = false): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-loads-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("src/app.ts", "export {};\n");
  write(
    ".greenline/manifest.json",
    JSON.stringify({ schemaVersion: 6, targets: ["claude-code", "codex"], checks: [] }),
  );
  for (const [path, text] of Object.entries(ROSTER)) write(path, text);
  write(
    ".greenline/lock.json",
    serializeLock({
      schemaVersion: 5,
      cliVersion: "0.1.0",
      installationRevision: "0".repeat(64),
      sources: [],
      files: new Map(Object.keys(ROSTER).map((path) => [path, "1".repeat(64)])),
    }),
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  git("checkout", "--quiet", "-b", "feature");
  if (open !== false) write(`.greenline/ledger/${ID}.md`, record(open));
  return { root, write, git };
}

/** The payload as the harness writes it, a field it leaves out written as undefined. */
interface Payload {
  readonly [key: string]: JsonValue | undefined;
}

function fire(where: Space, harness: string, payload: JsonValue) {
  return fireText(where, harness, payload);
}

function fireText(
  where: Space,
  harness: string,
  payload: Payload | JsonValue,
  instant = `${DAY}T12:00:00.000Z`,
) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date(instant),
  });
  return { code, out: writer.out, err: writer.err };
}

function claude(
  where: Space,
  session: string | undefined,
  tool: string,
  input: { readonly [key: string]: JsonValue },
  agent?: string,
) {
  // A harness that names no session or no agent leaves the field out: JSON drops an absent one as the payload is written.
  return fireText(where, "claude-code", {
    hook_event_name: "PreToolUse",
    session_id: session,
    agent_id: agent,
    transcript_path: "/tmp/t.jsonl",
    cwd: where.root,
    permission_mode: "default",
    tool_name: tool,
    tool_input: input,
    tool_use_id: "toolu_01",
  });
}

function prompt(where: Space, session: string) {
  return fire(where, "claude-code", {
    hook_event_name: "UserPromptSubmit",
    session_id: session,
    cwd: where.root,
    prompt: "go",
  });
}

function changeFacts(where: Space) {
  const path = join(where.root, ".greenline", "ledger", ID, "skills", `${DAY}.jsonl`);
  return existsSync(path) ? parseChangeLoads(readFileSync(path, "utf8")) : [];
}

function sessionFacts(where: Space, session: string) {
  const path = join(where.root, ".greenline", "ledger", "sessions", `${DAY}-${session}.jsonl`);
  return existsSync(path) ? parseSessionFact(readFileSync(path, "utf8")) : [];
}

describe("J-116 S2 the hooks note each skill load, the record beginning before the change", () => {
  it("notes the loads before the record in the session's fact, joins the change at the turn its session writes the record, and records nothing for an owner's file", () => {
    const here = space();
    prompt(here, "s1");
    expect(claude(here, "s1", "Skill", { skill: "frame" }).code).toBe(0);
    claude(here, "s1", "Read", {
      file_path: join(here.root, ".claude/skills/tdd/SKILL.md"),
      offset: 1,
      limit: 40,
    });
    claude(here, "s1", "Read", { file_path: join(here.root, "src/app.ts") });
    expect(sessionFacts(here, "s1")).toEqual([
      expect.objectContaining({
        skill: "frame",
        file: "SKILL.md",
        whole: true,
        via: "Skill",
        turn: 1,
        step: null,
      }),
      expect.objectContaining({
        skill: "tdd",
        file: "SKILL.md",
        whole: false,
        via: "Read",
        turn: 1,
      }),
    ]);
    expect(existsSync(join(here.root, ".greenline", "ledger", ID))).toBe(false);
    // The session writes the change's record: the change names this session from this turn.
    claude(here, "s1", "Write", {
      file_path: join(here.root, ".greenline", "ledger", `${ID}.md`),
      content: "x",
    });
    here.write(
      `.greenline/ledger/${ID}.md`,
      record(["state: open", 'next: "build: write the test"']),
    );
    expect(changeFacts(here)).toEqual([
      expect.objectContaining({ skill: "frame", whole: true, session: "s1", turn: 1, step: null }),
      expect.objectContaining({ skill: "tdd", whole: false, session: "s1", turn: 1 }),
    ]);
    claude(here, "s1", "Bash", { command: "cd .claude/skills && cat frame/SKILL.md" });
    prompt(here, "s1");
    claude(
      here,
      "s1",
      "Read",
      { file_path: ".claude/skills/frame/references/greenline.md" },
      "agent-7",
    );
    const facts = changeFacts(here);
    expect(facts.slice(2)).toEqual([
      {
        skill: "frame",
        file: "SKILL.md",
        whole: true,
        via: "cat",
        at: `${DAY}T12:00:00.000Z`,
        step: "build",
        agent: null,
        session: "s1",
        turn: 1,
      },
      expect.objectContaining({
        file: "references/greenline.md",
        agent: "agent-7",
        turn: 2,
        step: "build",
      }),
    ]);
    expect(sessionFacts(here, "s1").filter((line) => "skill" in line)).toHaveLength(4);
    // The next turn's mirror carries the change's loads.
    expect(prompt(here, "s1").out).toContain("skills loaded: frame, tdd (part)");
  });

  it("keeps the loads of a session that opens no change as its own, and joins the turns before the owner's yes to the change the session opens", () => {
    const here = space();
    prompt(here, "s2");
    claude(here, "s2", "Skill", { skill: "tdd" });
    expect(sessionFacts(here, "s2")).toHaveLength(1);
    expect(readdirSync(join(here.root, ".greenline", "ledger"))).toEqual(["sessions"]);
    // The proposal's turn ends; the owner's yes opens the next, where the record is written.
    prompt(here, "s2");
    claude(here, "s2", "Write", { file_path: `.greenline/ledger/${ID}.md`, content: "x" });
    here.write(`.greenline/ledger/${ID}.md`, record(["state: open"]));
    claude(here, "s2", "Skill", { skill: "frame" });
    expect(changeFacts(here).map((load) => [load.skill, load.turn])).toEqual([
      ["tdd", 1],
      ["frame", 2],
    ]);
  });

  it("joins a change the session resumes after another change, and gives neither change the other's loads", () => {
    const other = "2026-10-19-other";
    const here = space();
    const open = (id: string, state: string) => {
      claude(here, "s5", "Write", { file_path: `.greenline/ledger/${id}.md`, content: "x" });
      here.write(`.greenline/ledger/${id}.md`, record([`state: ${state}`]));
    };
    prompt(here, "s5");
    open(ID, "open");
    claude(here, "s5", "Skill", { skill: "frame" });
    // A request for another change stops this one, and the other opens.
    here.write(`.greenline/ledger/${ID}.md`, record(["state: stopped", 'next: "build: go on"']));
    prompt(here, "s5");
    open(other, "open");
    claude(here, "s5", "Skill", { skill: "tdd" });
    here.write(`.greenline/ledger/${other}.md`, record(["state: done", "next: none"]));
    // The close lands: a done the commit holds holds no later read (J-189 S1).
    here.git("add", "--all");
    here.git("commit", "--quiet", "-m", "close the other");
    // A question with no change open, then the first change resumed.
    prompt(here, "s5");
    claude(here, "s5", "Read", { file_path: ".claude/skills/frame/references/greenline.md" });
    prompt(here, "s5");
    open(ID, "open");
    claude(here, "s5", "Bash", { command: "cat .claude/skills/tdd/SKILL.md" });
    expect(changeFacts(here).map((load) => [load.skill, load.file, load.turn])).toEqual([
      ["frame", "SKILL.md", 1],
      ["frame", "references/greenline.md", 3],
      ["tdd", "SKILL.md", 4],
    ]);
    const otherFacts = parseChangeLoads(
      readFileSync(
        join(here.root, ".greenline", "ledger", other, "skills", `${DAY}.jsonl`),
        "utf8",
      ),
    );
    expect(otherFacts.map((load) => [load.skill, load.turn])).toEqual([["tdd", 2]]);
  });

  it("reads Codex's shell read, and joins a resumed change from the session that writes its record again", () => {
    const here = space(["state: stopped", 'next: "build: write the test"']);
    const codex = (session: string, command: string) =>
      fire(here, "codex", {
        hook_event_name: "PreToolUse",
        session_id: session,
        turn_id: "t1",
        cwd: here.root,
        model: "gpt-6.1-sol",
        tool_name: "Bash",
        tool_input: { command },
        tool_use_id: "call_1",
      });
    fire(here, "codex", { hook_event_name: "UserPromptSubmit", session_id: "c9", cwd: here.root });
    codex("c9", "zsh -lc 'cd .agents/skills && cat tdd/SKILL.md'");
    expect(changeFacts(here)).toEqual([]);
    fire(here, "codex", {
      hook_event_name: "PreToolUse",
      session_id: "c9",
      cwd: here.root,
      tool_name: "apply_patch",
      tool_input: {
        command: `*** Begin Patch\n*** Update File: .greenline/ledger/${ID}.md\n*** End Patch\n`,
      },
    });
    here.write(
      `.greenline/ledger/${ID}.md`,
      record(["state: open", 'next: "build: write the test"']),
    );
    codex("c9", "sed -n '1,2p' .agents/skills/tdd/SKILL.md");
    expect(changeFacts(here)).toEqual([
      expect.objectContaining({ skill: "tdd", whole: true, via: "cat", session: "c9", step: null }),
      expect.objectContaining({
        skill: "tdd",
        whole: false,
        via: "sed",
        session: "c9",
        step: "build",
      }),
    ]);
  });

  it("J-174 writes no fact for the Linear run's reads the agent never saw, and one for the read it did", () => {
    const here = space(["state: open"]);
    const codex = (command: string) =>
      fire(here, "codex", {
        hook_event_name: "PreToolUse",
        session_id: "c7",
        turn_id: "t6",
        cwd: here.root,
        model: "gpt-6.1-terra",
        tool_name: "Bash",
        tool_input: { command },
        tool_use_id: "call_4",
      });
    fire(here, "codex", { hook_event_name: "UserPromptSubmit", session_id: "c7", cwd: here.root });
    // j109t-linear 002/006 items 4, 12, 17 and 34: the skill pages read to /dev/null.
    codex(
      "/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md > /dev/null && cat .agents/skills/tdd/SKILL.md > /dev/null'",
    );
    codex("/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md | wc -l'");
    codex("/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md | shasum -a 256'");
    codex("/bin/zsh -lc 'grep -c red .agents/skills/tdd/SKILL.md'");
    expect(changeFacts(here)).toEqual([]);
    expect(sessionFacts(here, "c7").filter((line) => "skill" in line)).toEqual([]);
    codex("/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md'");
    expect(changeFacts(here)).toEqual([
      expect.objectContaining({ skill: "tdd", whole: true, via: "cat", session: "c7" }),
    ]);
  });

  it("notes a load straight in the branch's open change where the harness names no session", () => {
    const here = space(["state: open"]);
    claude(here, undefined, "Skill", { skill: "frame" });
    expect(changeFacts(here)).toEqual([
      expect.objectContaining({ skill: "frame", session: null, turn: null }),
    ]);
    expect(existsSync(join(here.root, ".greenline", "ledger", "sessions"))).toBe(false);
  });

  it("notes nothing for a shell command the guardrails refuse, and never stops a read", () => {
    const here = space(["state: open"]);
    const refused = claude(here, "s4", "Bash", {
      command: "cat .claude/skills/frame/SKILL.md; git reset --hard",
    });
    expect(refused.code).toBe(2);
    expect(sessionFacts(here, "s4")).toEqual([]);
    expect(claude(here, "s4", "Read", { file_path: ".claude/skills/frame/SKILL.md" }).code).toBe(0);
  });
});

describe("J-189 S1 every read joined to the change held at the read", () => {
  /** The session writes the change's record, naming it, and the record stands as given. */
  const writes = (here: Space, session: string, text: string): void => {
    claude(here, session, "Write", { file_path: `.greenline/ledger/${ID}.md`, content: "x" });
    here.write(`.greenline/ledger/${ID}.md`, text);
  };

  it("J-189 S1 joins a read at the close while the done stands uncommitted, and keeps a read after the landed close the session's own", () => {
    const here = space();
    prompt(here, "s6");
    writes(here, "s6", record(["state: open", 'next: "close: the close"']));
    // The close written and its commit refused: the owed skill read before the done commit lands.
    here.write(`.greenline/ledger/${ID}.md`, record(["state: done", "next: none"]));
    claude(here, "s6", "Skill", { skill: "tdd" });
    expect(changeFacts(here).map((load) => load.skill)).toEqual(["tdd"]);
    here.git("add", "--all");
    here.git("commit", "--quiet", "-m", "close");
    // A question after the landed close: the session's own.
    prompt(here, "s6");
    claude(here, "s6", "Skill", { skill: "frame" });
    expect(changeFacts(here).map((load) => load.skill)).toEqual(["tdd"]);
    expect(
      sessionFacts(here, "s6")
        .filter((line) => "skill" in line)
        .at(-1),
    ).toMatchObject({
      skill: "frame",
      noted: null,
    });
  });

  it("J-189 S1 joins a read after a stop, and through a resume in the same session on a record that stands stopped or whose front matter does not read", () => {
    const here = space();
    prompt(here, "s7");
    writes(here, "s7", record(["state: open", 'next: "build: go on"']));
    // The stop, committed; the same session reads on, then resumes.
    here.write(`.greenline/ledger/${ID}.md`, record(["state: stopped", 'next: "build: go on"']));
    here.git("add", "--all");
    here.git("commit", "--quiet", "-m", "stop");
    prompt(here, "s7");
    claude(here, "s7", "Skill", { skill: "frame" });
    // j109t-roster-usec 001/005: the resume's record left malformed while the session reads.
    here.write(`.greenline/ledger/${ID}.md`, "---\nmode: quick\nstate: open\n");
    claude(here, "s7", "Bash", { command: "cat .claude/skills/tdd/SKILL.md" });
    writes(here, "s7", record(["state: open", 'next: "build: go on"']));
    expect(changeFacts(here).map((load) => [load.skill, load.turn])).toEqual([
      ["frame", 2],
      ["tdd", 2],
    ]);
    expect(
      sessionFacts(here, "s7").filter((line) => "skill" in line && line.noted === null),
    ).toEqual([]);
  });
});

describe("J-198 S1 the loads noted for a change reach its facts across an authorized reset (j196t-conduct-empty finding 3)", () => {
  /** A Codex tool call of the run's session, at its own instant. */
  const codex = (
    here: Space,
    at: string,
    tool: string,
    input: { readonly [key: string]: JsonValue },
  ) =>
    fireText(
      here,
      "codex",
      {
        hook_event_name: "PreToolUse",
        session_id: "01a1b87d-cf02",
        turn_id: "t1",
        cwd: here.root,
        model: "gpt-6.1-terra",
        tool_name: tool,
        tool_input: input,
        tool_use_id: "call_1",
      },
      at,
    );
  const turn = (here: Space, at: string) =>
    fireText(
      here,
      "codex",
      { hook_event_name: "UserPromptSubmit", session_id: "01a1b87d-cf02", cwd: here.root },
      at,
    );
  const recordWrite = (here: Space, at: string, text: string): void => {
    codex(here, at, "apply_patch", {
      command: `*** Begin Patch\n*** Update File: .greenline/ledger/${ID}.md\n*** End Patch\n`,
    });
    here.write(`.greenline/ledger/${ID}.md`, text);
  };
  const shell = (here: Space, at: string, command: string) =>
    codex(here, at, "Bash", { command: `/bin/zsh -lc '${command}'` });

  it("keeps the close's three loads, noted after the last commit, in the change's facts at the close after git reset --hard", () => {
    const here = space();
    turn(here, `${DAY}T00:11:00.000Z`);
    recordWrite(here, `${DAY}T00:11:34.157Z`, record(["state: open", 'next: "review: go on"']));
    shell(here, `${DAY}T00:11:36.536Z`, "cat .agents/skills/tdd/SKILL.md");
    here.git("add", "--all");
    here.git("commit", "--quiet", "-m", "build");
    // Turns 13 and 14 of the run: the close's history and the commit message read, noted for the change, never committed.
    turn(here, `${DAY}T00:19:00.000Z`);
    shell(here, `${DAY}T00:19:08.647Z`, "cat .agents/skills/close/references/history.md");
    turn(here, `${DAY}T00:19:30.000Z`);
    shell(
      here,
      `${DAY}T00:19:35.500Z`,
      "cat .agents/skills/pr-writing/SKILL.md .agents/skills/close/references/history.md",
    );
    const noted = (): readonly string[] =>
      changeFacts(here).map((load) => `${load.skill}/${load.file}@${load.at.slice(11, 23)}`);
    const three = [
      "close/references/history.md@00:19:08.647",
      "pr-writing/SKILL.md@00:19:35.500",
      "close/references/history.md@00:19:35.500",
    ];
    expect(noted()).toEqual(["tdd/SKILL.md@00:11:36.536", ...three]);
    // The owner's authorized reset, 001/015: the change's facts go back to the commit, the session's fact stays.
    here.git("reset", "--hard", "--quiet");
    expect(noted()).toEqual(["tdd/SKILL.md@00:11:36.536"]);
    expect(
      sessionFacts(here, "01a1b87d-cf02").filter((line) => "skill" in line && line.noted === ID),
    ).toHaveLength(4);
    // The close, 002/001: the session writes the record done.
    turn(here, `${DAY}T00:30:00.000Z`);
    recordWrite(here, `${DAY}T00:30:10.000Z`, record(["state: done", "next: none"]));
    expect(noted()).toEqual(["tdd/SKILL.md@00:11:36.536", ...three]);
    // Rejoined once: a later load adds itself and repeats none.
    shell(here, `${DAY}T00:30:20.000Z`, "cat .agents/skills/tdd/SKILL.md");
    expect(noted()).toEqual(["tdd/SKILL.md@00:11:36.536", ...three, "tdd/SKILL.md@00:30:20.000"]);
  });

  it("reads the loads the reset removed as the change's before any later event rejoins them", () => {
    const here = space();
    turn(here, `${DAY}T00:11:00.000Z`);
    recordWrite(here, `${DAY}T00:11:34.157Z`, record(["state: open", 'next: "review: go on"']));
    shell(here, `${DAY}T00:11:36.536Z`, "cat .agents/skills/tdd/SKILL.md");
    here.git("add", "--all");
    here.git("commit", "--quiet", "-m", "build");
    shell(here, `${DAY}T00:19:08.647Z`, "cat .agents/skills/close/references/history.md");
    here.git("reset", "--hard", "--quiet");
    expect(changeFacts(here).map((load) => load.skill)).toEqual(["tdd"]);
    expect(changeLoads(here.root, ID).map((load) => `${load.skill}/${load.file}`)).toEqual([
      "tdd/SKILL.md",
      "close/references/history.md",
    ]);
  });
});

describe("J-205 S1 the loads rejoined to a change, one fact per load (j196t-conduct-emptyb finding 3)", () => {
  const SESSION = "01a1bb6f-9509-7672-b16e-63bb60321156";
  /** One load of the run's turn 7, as the session's fact or the change's files hold it. */
  const seen = (skill: string, file: string, at: string) => ({
    skill,
    file,
    whole: true,
    via: "cat",
    at: `${DAY}T${at}Z`,
    step: "build",
    agent: null,
    turn: 7,
  });
  const run = [
    seen("tdd", "SKILL.md", "13:59:12.757"),
    seen("plan", "method.md", "13:59:12.757"),
    seen("tdd", "method.md", "13:59:12.748"),
  ];
  const lines = (values: readonly object[]): string =>
    values.map((value) => `${JSON.stringify(value)}\n`).join("");

  it("reads the farewell change's three facts of one tdd load as one, and a later load rejoins none of them again", () => {
    const here = space(["state: open", 'next: "build: write the farewell"']);
    const [tdd, plan, method] = run.map((load) => ({ ...load, session: SESSION }));
    if (tdd === undefined || plan === undefined || method === undefined) throw new Error("run");
    // The session's fact holds each load once (line 53 on); the change's files hold the tdd load three times (lines 7, 8 and 10).
    here.write(
      `.greenline/ledger/sessions/${DAY}-${SESSION}.jsonl`,
      lines([
        { change: ID, turn: 7, at: `${DAY}T13:59:05.026Z` },
        ...run.map((load) => ({ ...load, noted: ID })),
      ]),
    );
    here.write(
      `.greenline/ledger/${ID}/skills/${DAY}.jsonl`,
      lines([tdd, tdd, plan, tdd, plan, method]),
    );
    const read = (): readonly string[] =>
      changeLoads(here.root, ID).map(
        (load) => `${load.skill}/${load.file}@${load.at.slice(11, 23)}`,
      );
    expect(read()).toEqual([
      "tdd/method.md@13:59:12.748",
      "tdd/SKILL.md@13:59:12.757",
      "plan/method.md@13:59:12.757",
    ]);
    // A later load rejoins what the files lack and appends no second copy of a load they hold.
    fireText(
      here,
      "codex",
      {
        hook_event_name: "PreToolUse",
        session_id: SESSION,
        cwd: here.root,
        tool_name: "Bash",
        tool_input: { command: "cat .agents/skills/close/references/history.md" },
        tool_use_id: "call_2",
      },
      `${DAY}T14:00:00.000Z`,
    );
    expect(changeFacts(here)).toHaveLength(7);
    expect(read()).toEqual([
      "tdd/method.md@13:59:12.748",
      "tdd/SKILL.md@13:59:12.757",
      "plan/method.md@13:59:12.757",
      "close/references/history.md@14:00:00.000",
    ]);
  });
});

describe("J-203 S1 one page per read, and a result the harness cut, noted as parts (j196c-merged-skills)", () => {
  const after = (where: Space, native: string, command: string, extra: Payload, instant?: string) =>
    fireText(
      where,
      "claude-code",
      {
        hook_event_name: native,
        session_id: "s9",
        transcript_path: "/tmp/t.jsonl",
        cwd: where.root,
        tool_name: "Bash",
        tool_input: { command },
        tool_use_id: "toolu_01PscdpDMnZD7JFKV2NLvrjZ",
        ...extra,
      },
      instant,
    );
  const read = (where: Space) =>
    changeLoads(where.root, ID).map((load) =>
      [`${load.skill}/${load.file}`, load.whole, load.cause ?? "-"].join(" "),
    );

  it("notes two pages one call printed as two parts, each read with another page", () => {
    const here = space(["state: open"]);
    const both = "cat .claude/skills/frame/SKILL.md .claude/skills/frame/references/greenline.md";
    claude(here, "s9", "Bash", { command: both });
    expect(read(here)).toEqual([
      "frame/SKILL.md false together",
      "frame/references/greenline.md false together",
    ]);
  });

  it("settles the run's cut result into the read it cut, on the failed call's after-tool, and leaves a whole result whole", () => {
    const here = space(["state: open"]);
    const one = "cat .claude/skills/frame/SKILL.md; echo =====BUILD";
    claude(here, "s9", "Bash", { command: one });
    after(here, "PostToolUseFailure", one, {
      error:
        "Exit code 1\n# frame\n\n... [4048 characters truncated] ...\n\nzsh: command not found: =====BUILD",
    });
    expect(read(here)).toEqual(["frame/SKILL.md false cut"]);
    // A whole result after a later whole read leaves that read whole; the later call is noted at its own time, so it is a load of its own (J-205 S1).
    const later = `${DAY}T12:00:05.000Z`;
    after(here, "PreToolUse", "cat .claude/skills/frame/SKILL.md", {}, later);
    after(
      here,
      "PostToolUse",
      "cat .claude/skills/frame/SKILL.md",
      { tool_response: { stdout: "# frame\n\nRead the request.\n", stderr: "" } },
      later,
    );
    expect(read(here)).toEqual(["frame/SKILL.md false cut", "frame/SKILL.md true -"]);
  });
});

describe("J-207 S1 the reader stops where zsh stops, the result's error marks the reads not made, and a reviewer's loads at review (j196c-roster-usec)", () => {
  // threads/001/turns/001: the call, then its result ending on zsh's error.
  const TWO_PAGES =
    "cd .claude/skills/frame && cat SKILL.md; echo ======; cat references/greenline.md";
  const ERROR = "Exit code 1\n# frame\n\nRead the request.\n(eval):1: ===== not found";
  const AT = `${DAY}T12:00:00.000Z`;
  /** Fire a payload with the shell the environment names and the modes definition the hook reads. */
  const fired = (where: Space, zsh: boolean | undefined, payload: Payload, instant: string) => {
    const writer = new RecordingWriter();
    runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: where.root,
      stdin: () => JSON.stringify(payload),
      now: () => new Date(instant),
      line: () => fixtureInstallation().modes,
      zsh,
    });
    return writer.out;
  };
  const bash = (where: Space, zsh: boolean | undefined, native: string, extra: Payload) =>
    fired(
      where,
      zsh,
      {
        hook_event_name: native,
        session_id: "s7",
        transcript_path: "/tmp/t.jsonl",
        cwd: where.root,
        tool_name: "Bash",
        tool_input: { command: TWO_PAGES },
        tool_use_id: "toolu_01SoXoeR583NeNt3Q2rDRbva",
        ...extra,
      },
      AT,
    );
  const read = (where: Space) =>
    changeLoads(where.root, ID).map((load) =>
      [`${load.skill}/${load.file}`, load.whole, load.cause ?? "-"].join(" "),
    );

  it("notes the one page printed before the equals row whole under zsh, and nothing after it, the result's error adding no mark", () => {
    const here = space(["state: open"]);
    bash(here, true, "PreToolUse", {});
    expect(read(here)).toEqual(["frame/SKILL.md true -"]);
    bash(here, true, "PostToolUseFailure", { error: ERROR });
    expect(changeFacts(here)).toHaveLength(1);
    expect(read(here)).toEqual(["frame/SKILL.md true -"]);
  });

  it("under a shell named otherwise notes both pages, then marks the page after the failing word not made where the result carries zsh's error, an earlier read of it kept", () => {
    const here = space(["state: open"]);
    fired(
      here,
      false,
      {
        hook_event_name: "PreToolUse",
        session_id: "s7",
        transcript_path: "/tmp/t.jsonl",
        cwd: here.root,
        tool_name: "Read",
        tool_input: { file_path: join(here.root, ".claude/skills/frame/references/greenline.md") },
        tool_use_id: "toolu_00",
      },
      `${DAY}T11:00:00.000Z`,
    );
    bash(here, false, "PreToolUse", {});
    expect(read(here)).toEqual([
      "frame/references/greenline.md true -",
      "frame/SKILL.md false together",
      "frame/references/greenline.md false together",
    ]);
    bash(here, false, "PostToolUseFailure", { error: ERROR });
    expect(read(here)).toEqual([
      "frame/references/greenline.md true -",
      "frame/SKILL.md false together",
    ]);
    // The shell's own list stopped no read the environment's reading noted: a result with no such error marks nothing.
    const again = space(["state: open"]);
    bash(again, false, "PreToolUse", {});
    bash(again, false, "PostToolUseFailure", { error: "Exit code 1\n# frame\n" });
    expect(read(again)).toHaveLength(2);
  });

  it("notes a fresh reviewer's loads at the review step its brief names, while the session's own read stays at the record's step", () => {
    const here = space(["state: open", 'next: "build: write the test"']);
    here.write(`.greenline/ledger/${ID}/brief-review-1.md`, "<the brief>\n");
    fired(
      here,
      true,
      {
        hook_event_name: "PreToolUse",
        session_id: "s7",
        cwd: here.root,
        tool_name: "Agent",
        tool_use_id: "toolu_01FfCToF3Gw5CU3qRo4LHm29",
        tool_input: {
          description: "review",
          subagent_type: "general-purpose",
          prompt: `.greenline/ledger/${ID}/brief-review-1.md`,
        },
      },
      AT,
    );
    fired(
      here,
      true,
      { hook_event_name: "SubagentStart", session_id: "s7", agent_id: "ae1f333d847155b2d" },
      AT,
    );
    const reads = (agent: string | undefined, instant: string) =>
      fired(
        here,
        true,
        {
          hook_event_name: "PreToolUse",
          session_id: "s7",
          agent_id: agent,
          cwd: here.root,
          tool_name: "Read",
          tool_input: { file_path: join(here.root, ".claude/skills/frame/SKILL.md") },
          tool_use_id: "toolu_02",
        },
        instant,
      );
    reads("ae1f333d847155b2d", `${DAY}T12:00:01.000Z`);
    reads(undefined, `${DAY}T12:00:02.000Z`);
    expect(changeLoads(here.root, ID).map((load) => [load.agent, load.step])).toEqual([
      ["ae1f333d847155b2d", "review"],
      [null, "build"],
    ]);
  });
});

describe("J-208 S1 the loads rejoined after an authorized reset, one fact per load where two hooks rejoin at once (j196t-conduct-emptyc finding 5)", () => {
  const SESSION = "01a1bbed-db22-7ae2-a61f-0d503637f9ce";
  /** One load of the run's turn 13, as the session's fact or the change's files hold it. */
  const seen = (skill: string, file: string, at: string) => ({
    skill,
    file,
    whole: true,
    via: "cat",
    at: `${DAY}T${at}Z`,
    step: "review",
    agent: null,
    turn: 13,
  });
  /** The three loads the hard reset took from the change's files and the session's fact kept. */
  const three = [
    seen("close", "references/history.md", "16:21:03.891"),
    seen("pr-writing", "SKILL.md", "16:21:03.891"),
    seen("pr-writing", "method.md", "16:21:12.120"),
  ];
  const lines = (values: readonly object[]): string =>
    values.map((value) => `${JSON.stringify(value)}\n`).join("");
  const filePath = (here: Space): string =>
    join(here.root, ".greenline", "ledger", ID, "skills", `${DAY}.jsonl`);

  /** The run's state after the reset at 001/014: the session's fact holds the three loads, the change's files lack them. */
  function afterReset(): Space {
    const here = space(["state: open", 'next: "review: go on"']);
    here.write(
      `.greenline/ledger/sessions/${DAY}-${SESSION}.jsonl`,
      lines([
        { change: ID, turn: 3, at: `${DAY}T16:12:50.721Z` },
        ...three.map((load) => ({ ...load, noted: ID })),
      ]),
    );
    here.write(
      `.greenline/ledger/${ID}/skills/${DAY}.jsonl`,
      lines([{ ...seen("tdd", "SKILL.md", "16:12:55.000"), turn: 3, session: SESSION }]),
    );
    return here;
  }

  it("holds the three loads once when a second hook's rejoin runs while the first one's is under way, the run's two reads 9 ms apart at 001/019", async () => {
    const here = afterReset();
    // The first hook, the read of build's commits page at 16:24:25.855: its rejoin of the three and its own load, written while it holds the rejoin.
    const first = lines([
      ...three.map((load) => ({ ...load, session: SESSION })),
      { ...seen("build", "references/commits.md", "16:24:25.855"), turn: 19, session: SESSION },
    ]);
    const worker = new Worker(
      [
        "const { workerData, parentPort } = require('node:worker_threads');",
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "fs.mkdirSync(path.dirname(workerData.lock), { recursive: true });",
        "fs.closeSync(fs.openSync(workerData.lock, 'wx'));",
        "parentPort.postMessage('held');",
        "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);",
        "fs.appendFileSync(workerData.file, workerData.lines);",
        "fs.rmSync(workerData.lock);",
      ].join("\n"),
      {
        eval: true,
        workerData: { lock: loadsLockPath(here.root, ID), file: filePath(here), lines: first },
      },
    );
    const exited = new Promise((resolve) => worker.once("exit", resolve));
    await new Promise((resolve) => worker.once("message", resolve));
    // The second hook, the read at 16:24:25.864, while the first holds its rejoin.
    fireText(
      here,
      "codex",
      {
        hook_event_name: "PreToolUse",
        session_id: SESSION,
        cwd: here.root,
        tool_name: "Bash",
        tool_input: { command: "/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md'" },
        tool_use_id: "call_19",
      },
      `${DAY}T16:24:25.864Z`,
    );
    await exited;
    const held = readFileSync(filePath(here), "utf8")
      .split("\n")
      .filter((line) => line !== "");
    expect(held.length).toBe(new Set(held).size);
    expect(
      changeFacts(here).map((load) => `${load.skill}/${load.file}@${load.at.slice(11, 23)}`),
    ).toEqual([
      "tdd/SKILL.md@16:12:55.000",
      "close/references/history.md@16:21:03.891",
      "pr-writing/SKILL.md@16:21:03.891",
      "pr-writing/method.md@16:21:12.120",
      "build/references/commits.md@16:24:25.855",
      "tdd/SKILL.md@16:24:25.864",
    ]);
  });

  it("reads files that hold the three loads twice as one fact each, as status reads the change's folder", () => {
    const here = afterReset();
    here.write(
      `.greenline/ledger/${ID}/skills/${DAY}.jsonl`,
      lines([...three, ...three].map((load) => ({ ...load, session: SESSION }))),
    );
    const disk = readChangesOnDisk(here.root, fixtureInstallation().modes);
    if (disk._tag === "err") throw disk.error;
    const folder = disk.value.changes.find((entry) => entry.id === ID)?.folder;
    if (folder?._tag !== "ok") throw new Error("the change's folder does not read");
    expect(folder.value.loads.map((load) => `${load.skill}/${load.file}`)).toEqual([
      "close/references/history.md",
      "pr-writing/SKILL.md",
      "pr-writing/method.md",
    ]);
  });
});

describe("J-209 S1 the loads lock's wait bounded by its deadline, the hold best effort", () => {
  const SESSION = "01a1bbed-db22-7ae2-a61f-0d503637f9ce";
  /** A load of the change's open record, read by a Codex shell's cat. */
  const read = {
    hook_event_name: "PreToolUse",
    session_id: SESSION,
    tool_name: "Bash",
    tool_input: { command: "/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md'" },
    tool_use_id: "call_lock",
  };
  /** A change open on its branch, its session's fact naming it at turn 3. */
  function opened(): Space {
    const here = space(["state: open", 'next: "build: go on"']);
    here.write(
      `.greenline/ledger/sessions/${DAY}-${SESSION}.jsonl`,
      `${JSON.stringify({ change: ID, turn: 3, at: `${DAY}T16:12:50.721Z` })}\n`,
    );
    return here;
  }
  const tdd = (here: Space) =>
    changeLoads(here.root, ID).filter((load) => load.skill === "tdd" && load.file === "SKILL.md");

  it("ends the wait at its deadline where the lock's stat fails, a dangling link at its path, and appends unheld", () => {
    const here = opened();
    const lock = loadsLockPath(here.root, ID);
    mkdirSync(join(lock, ".."), { recursive: true });
    symlinkSync(join(here.root, "nowhere", "lock"), lock);
    // The hook runs as the harness runs it, in a process of its own, so a wait with no bound is killed and read as such.
    const entry = join(import.meta.dirname, "..", "helpers", "hooks-entry.ts");
    const started = Date.now();
    const ran = spawnSync(process.execPath, [entry, "event", "--harness", "codex"], {
      cwd: here.root,
      input: JSON.stringify({ ...read, cwd: here.root }),
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(ran.signal, "the hook was killed in its wait").toBeNull();
    expect(ran.status, ran.stderr).toBe(0);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(tdd(here)).toHaveLength(1);
  }, 30_000);

  it("leaves no lock behind after a hold", () => {
    const here = opened();
    expect(fireText(here, "codex", { ...read, cwd: here.root }).code).toBe(0);
    expect(tdd(here)).toHaveLength(1);
    expect(existsSync(loadsLockPath(here.root, ID))).toBe(false);
  });

  it("appends unheld once the wait for another hook's fresh hold runs out, that hold left in place", () => {
    const here = opened();
    const lock = loadsLockPath(here.root, ID);
    mkdirSync(join(lock, ".."), { recursive: true });
    writeFileSync(lock, "");
    const started = Date.now();
    expect(fireText(here, "codex", { ...read, cwd: here.root }).code).toBe(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
    expect(tdd(here)).toHaveLength(1);
    expect(existsSync(lock)).toBe(true);
  });
});
