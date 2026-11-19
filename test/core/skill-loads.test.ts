/**
 * The skill loads read from a tool call (J-116 S2): the apparatus's method
 * lifted, the skill roots, the shell verbs, whole or part, `cd`, variables
 * and literal loops resolved, and nothing outside the installed roster.
 */
import { describe, expect, it } from "vitest";
import type { Harness } from "../../src/core/adapters.ts";
import type { JsonValue } from "../../src/core/contract.ts";
import {
  carriesCut,
  normaliseEvent,
  refusedWords,
  type NormalisedEvent,
} from "../../src/core/event.ts";
import {
  changesNamed,
  cutLoads,
  declaredBesideLoaded,
  declaredSkills,
  lineCount,
  loadsLine,
  loadsMissing,
  loadsOf,
  parseChangeLoads,
  parseSessionFact,
  readsAsZsh,
  rosterNamesOf,
  sessionLoadsOf,
  settledLoads,
  shellDirectories,
  shellSightings,
  sightingsOf,
  skillFileOf,
  summariseLoads,
  unrunLoads,
  type LoadSeen,
  type LoadsReader,
  type SkillLoadFact,
} from "../../src/core/skill-loads.ts";

const ROOT = "/work/repo";

/** The installed roster: each file with its lines. */
const FILES: ReadonlyMap<string, number> = new Map([
  [".claude/skills/frame/SKILL.md", 90],
  [".claude/skills/review/SKILL.md", 120],
  [".claude/skills/review/references/lens.md", 10],
  [".claude/skills/tdd/SKILL.md", 30],
  [".claude/skills/diagnose/SKILL.md", 40],
  [".agents/skills/tdd/SKILL.md", 30],
  [".agents/skills/review/SKILL.md", 120],
]);

const READER: LoadsReader = {
  fromRoot: (path) =>
    path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path === ROOT ? "." : undefined,
  installed: (path) => FILES.has(path),
  lines: (path) => FILES.get(path),
};

function toolEvent(
  harness: Harness,
  payload: { readonly [key: string]: JsonValue },
): NormalisedEvent {
  const event = normaliseEvent({
    harness,
    kind: undefined,
    native: undefined,
    payload: { hook_event_name: "PreToolUse", session_id: "s1", cwd: ROOT, ...payload },
    at: "2026-10-25T10:00:00.000Z",
  });
  if (event === undefined) throw new Error("no event");
  return event;
}

function loads(
  harness: Harness,
  payload: { readonly [key: string]: JsonValue },
): readonly LoadSeen[] {
  return loadsOf(sightingsOf(toolEvent(harness, payload), ROOT), READER);
}

function shell(text: string, dir: string | null = ROOT): readonly LoadSeen[] {
  return loadsOf(shellSightings(text, dir), READER);
}

describe("J-116 S2 the event keeps a read's path and range and the Skill tool's name", () => {
  it("normalises Claude Code's Skill call and its Read with a range", () => {
    const skill = toolEvent("claude-code", { tool_name: "Skill", tool_input: { skill: "frame" } });
    expect(skill).toMatchObject({ skill: "frame", read: null, command: null, write: null });
    const read = toolEvent("claude-code", {
      tool_name: "Read",
      tool_input: { file_path: `${ROOT}/.claude/skills/tdd/SKILL.md`, offset: 1, limit: 40 },
    });
    expect(read.read).toEqual({
      paths: [`${ROOT}/.claude/skills/tdd/SKILL.md`],
      range: { offset: 1, limit: 40 },
    });
    expect(read.skill).toBeNull();
    const whole = toolEvent("claude-code", {
      tool_name: "Read",
      tool_input: { file_path: "src/app.ts" },
    });
    expect(whole.read).toEqual({ paths: ["src/app.ts"], range: null });
  });

  it("keeps no read on a write or a shell call, and none on Codex, which reads through its shell", () => {
    const write = toolEvent("claude-code", {
      tool_name: "Write",
      tool_input: { file_path: "a.txt", content: "x" },
    });
    expect(write.read).toBeNull();
    expect(write.skill).toBeNull();
    const codex = toolEvent("codex", {
      tool_name: "Bash",
      tool_input: { command: "cat .agents/skills/tdd/SKILL.md" },
    });
    expect(codex.read).toBeNull();
    expect(codex.command?.text).toBe("cat .agents/skills/tdd/SKILL.md");
  });
});

describe("J-116 S2 each load from a tool call, whole or part", () => {
  it("reads a Skill call as the skill's SKILL.md whole, and an uninstalled or namespaced skill as nothing", () => {
    expect(loads("claude-code", { tool_name: "Skill", tool_input: { skill: "frame" } })).toEqual([
      { skill: "frame", file: "SKILL.md", whole: true, via: "Skill" },
    ]);
    expect(loads("claude-code", { tool_name: "Skill", tool_input: { skill: "pdf" } })).toEqual([]);
    expect(
      loads("claude-code", { tool_name: "Skill", tool_input: { skill: "plugin:brainstorm" } }),
    ).toEqual([]);
  });

  it("reads a Read by its range: whole without one or with a range that covers the file, part with a short limit", () => {
    const at = (input: { readonly [key: string]: JsonValue }) =>
      loads("claude-code", { tool_name: "Read", tool_input: input });
    expect(at({ file_path: `${ROOT}/.claude/skills/review/SKILL.md` })).toEqual([
      { skill: "review", file: "SKILL.md", whole: true, via: "Read" },
    ]);
    expect(at({ file_path: ".claude/skills/review/SKILL.md", offset: 1, limit: 40 })).toEqual([
      { skill: "review", file: "SKILL.md", whole: false, via: "Read" },
    ]);
    expect(at({ file_path: ".claude/skills/review/SKILL.md", offset: 1, limit: 400 })).toEqual([
      { skill: "review", file: "SKILL.md", whole: true, via: "Read" },
    ]);
    expect(at({ file_path: ".claude/skills/review/SKILL.md", offset: 50 })).toEqual([
      { skill: "review", file: "SKILL.md", whole: false, via: "Read" },
    ]);
    expect(at({ file_path: ".claude/skills/review/references/lens.md" })).toEqual([
      { skill: "review", file: "references/lens.md", whole: true, via: "Read" },
    ]);
  });

  it("records nothing for a read outside the skill roots, an owner's file or a skill file the installation did not place", () => {
    const at = (path: string) =>
      loads("claude-code", { tool_name: "Read", tool_input: { file_path: path } });
    expect(at("src/app.ts")).toEqual([]);
    expect(at(`${ROOT}/README.md`)).toEqual([]);
    expect(at(".claude/skills/mine/SKILL.md")).toEqual([]);
    expect(at("/home/someone/.claude/skills/frame/SKILL.md")).toEqual([]);
    expect(at(".claude/skills/frame/../review/SKILL.md")).toEqual([
      { skill: "review", file: "SKILL.md", whole: true, via: "Read" },
    ]);
  });

  it("reads `cd .claude/skills && cat frame/SKILL.md` as one whole load", () => {
    expect(
      loads("claude-code", {
        tool_name: "Bash",
        tool_input: { command: "cd .claude/skills && cat frame/SKILL.md" },
      }),
    ).toEqual([{ skill: "frame", file: "SKILL.md", whole: true, via: "cat" }]);
  });

  it("reads Codex's shell reads under its login-shell wrapper", () => {
    expect(
      loads("codex", {
        tool_name: "Bash",
        tool_input: { command: "zsh -lc 'cd .agents/skills && cat tdd/SKILL.md'" },
      }),
    ).toEqual([{ skill: "tdd", file: "SKILL.md", whole: true, via: "cat" }]);
    expect(
      loads("codex", {
        tool_name: "Bash",
        tool_input: { command: "bash -lc \"sed -n '1,80p' .agents/skills/review/SKILL.md\"" },
      }),
    ).toEqual([{ skill: "review", file: "SKILL.md", whole: false, via: "sed" }]);
  });

  it("tells whole from part by the verb and its arguments", () => {
    expect(shell("sed -n '1,240p' .claude/skills/review/SKILL.md")).toEqual([
      { skill: "review", file: "SKILL.md", whole: true, via: "sed" },
    ]);
    expect(shell("sed -n 1,\\$p .claude/skills/review/SKILL.md")[0]?.whole).toBe(true);
    expect(shell("sed -n '5,240p' .claude/skills/review/SKILL.md")[0]?.whole).toBe(false);
    expect(shell("sed 's/a/b/' .claude/skills/review/SKILL.md")[0]?.whole).toBe(false);
    expect(shell("head -n 50 .claude/skills/diagnose/SKILL.md")[0]?.whole).toBe(true);
    expect(shell("head -n 20 .claude/skills/diagnose/SKILL.md")[0]?.whole).toBe(false);
    expect(shell("head -100 .claude/skills/review/SKILL.md")[0]?.whole).toBe(false);
    expect(shell("head .claude/skills/review/references/lens.md")[0]?.whole).toBe(true);
    expect(shell("tail -n +1 .claude/skills/tdd/SKILL.md")[0]?.whole).toBe(true);
    expect(shell("tail -5 .claude/skills/tdd/SKILL.md")[0]?.whole).toBe(false);
    expect(shell("rg seam .claude/skills/review/references/lens.md")).toEqual([
      { skill: "review", file: "references/lens.md", whole: false, via: "rg" },
    ]);
    expect(shell("nl -ba .claude/skills/tdd/SKILL.md")[0]?.whole).toBe(true);
  });

  it("counts no verb that puts no file's text in the context", () => {
    expect(shell("wc -l .claude/skills/tdd/SKILL.md")).toEqual([]);
    expect(shell("ls .claude/skills/tdd")).toEqual([]);
    expect(shell("echo .claude/skills/tdd/SKILL.md")).toEqual([]);
    expect(shell("python3 inspect.py .claude/skills/tdd/SKILL.md")).toEqual([]);
    expect(shell("git commit -m 'cat .claude/skills/tdd/SKILL.md'")).toEqual([]);
  });

  it("J-143 S2 counts no read whose output goes to /dev/null or a file, the run's commands among them", () => {
    const names = (text: string): readonly string[] =>
      shell(text).map((load) => `.claude/skills/${load.skill}/${load.file}`);
    expect(
      names(
        "sed -n 1,12p .claude/skills/review/SKILL.md | cut -c1-160 >/dev/null; cat .claude/skills/review/references/lens.md >/dev/null",
      ),
    ).toEqual([]);
    expect(names("sed -n 1,12p .claude/skills/frame/SKILL.md | cut -c1-80 > /dev/null")).toEqual(
      [],
    );
    expect(names("cat .claude/skills/tdd/SKILL.md > out.txt")).toEqual([]);
    expect(names("cat .claude/skills/tdd/SKILL.md >> out.txt")).toEqual([]);
    expect(names("cat .claude/skills/tdd/SKILL.md &>/dev/null")).toEqual([]);
    expect(names("cat .claude/skills/tdd/SKILL.md 1>/dev/null 2>&1")).toEqual([]);
    expect(names("bash -c 'cat .claude/skills/tdd/SKILL.md' >/dev/null")).toEqual([]);
    // Output that reaches the harness is a load: the standard error, a pipeline's reader and the next command's.
    expect(names("cat .claude/skills/tdd/SKILL.md 2>/dev/null")).toEqual([
      ".claude/skills/tdd/SKILL.md",
    ]);
    expect(names("cat .claude/skills/tdd/SKILL.md >&2")).toEqual([".claude/skills/tdd/SKILL.md"]);
    expect(
      names(
        "cat .claude/skills/tdd/SKILL.md | grep -v '^$' | head -80; cat .claude/skills/frame/SKILL.md >/dev/null",
      ),
    ).toEqual([".claude/skills/tdd/SKILL.md"]);
    expect(
      names("cat .claude/skills/tdd/SKILL.md > /dev/null && cat .claude/skills/frame/SKILL.md"),
    ).toEqual([".claude/skills/frame/SKILL.md"]);
  });

  it("J-174 counts no read the agent never saw: the Linear run's reads to /dev/null, a read counted or checksummed, a grep that prints no line", () => {
    const names = (text: string): readonly string[] =>
      shell(text).map((load) => `.agents/skills/${load.skill}/${load.file}`);
    // j109t-linear 002/006: the builder's reads under Codex's login shell, each sent to /dev/null.
    expect(
      names(
        "/bin/zsh -lc 'cat .agents/skills/tdd/SKILL.md .agents/skills/review/SKILL.md > /dev/null && cat .agents/skills/tdd/SKILL.md > /dev/null'",
      ),
    ).toEqual([]);
    for (const counted of [
      "cat .agents/skills/tdd/SKILL.md | wc -l",
      "cat .agents/skills/tdd/SKILL.md | wc",
      "cat .agents/skills/tdd/SKILL.md | sha256sum",
      "cat .agents/skills/tdd/SKILL.md | shasum -a 256",
      "cat .agents/skills/tdd/SKILL.md | md5",
      "cat .agents/skills/tdd/SKILL.md | md5sum",
      "cat .agents/skills/tdd/SKILL.md | cksum",
      "sed -n '1,30p' .agents/skills/tdd/SKILL.md | grep -c red",
      "cat .agents/skills/tdd/SKILL.md | head -5 | wc -c",
      "grep -c red .agents/skills/tdd/SKILL.md",
      "grep -q red .agents/skills/tdd/SKILL.md",
      "rg -l red .agents/skills/tdd/SKILL.md",
      "grep --count red .agents/skills/tdd/SKILL.md",
    ])
      expect(names(counted), counted).toEqual([]);
    // A read whose lines reach the agent is a load; a filter after it shows a part.
    expect(shell("cat .agents/skills/tdd/SKILL.md | head -5")).toEqual([
      { skill: "tdd", file: "SKILL.md", whole: false, via: "cat" },
    ]);
    expect(shell("cat .agents/skills/tdd/SKILL.md | grep red")[0]?.whole).toBe(false);
    expect(shell("cat .agents/skills/tdd/SKILL.md | cat -n")[0]?.whole).toBe(true);
    expect(shell("cat .agents/skills/tdd/SKILL.md | less")[0]?.whole).toBe(true);
    expect(shell("cat .agents/skills/tdd/SKILL.md; wc -l .agents/skills/tdd/SKILL.md")).toEqual([
      { skill: "tdd", file: "SKILL.md", whole: true, via: "cat" },
    ]);
  });

  it("J-174 reads a pipeline's head as the lines it lets through, shared in order by the files one read prints, and `cut` as passing every line", () => {
    const wholes = (text: string): readonly boolean[] => shell(text).map((load) => load.whole);
    // review's SKILL.md holds 120 lines, frame's 90.
    expect(wholes("cat .claude/skills/review/SKILL.md | head -200")).toEqual([true]);
    expect(wholes("cat .claude/skills/review/SKILL.md | head -n 50")).toEqual([false]);
    expect(wholes("sed -n 1,400p .claude/skills/review/SKILL.md | head -150")).toEqual([true]);
    expect(wholes("sed -n 1,400p .claude/skills/review/SKILL.md | sed -n 1,60p")).toEqual([false]);
    // A cut that narrows lines keeps a part of each, since J-207 S1.
    expect(wholes("cat .claude/skills/review/SKILL.md | cut -c1-80")).toEqual([false]);
    expect(wholes("cat .claude/skills/review/SKILL.md | tail -5")).toEqual([false]);
    // Two pages through one head are two pages in one read: each a part since J-203 S1, whatever the head lets through.
    expect(
      wholes("cat .claude/skills/frame/SKILL.md .claude/skills/review/SKILL.md | head -150"),
    ).toEqual([false, false]);
    expect(
      wholes("cat .claude/skills/frame/SKILL.md .claude/skills/review/SKILL.md | head -300"),
    ).toEqual([false, false]);
  });

  it("resolves `cd`, variables and literal loops, and leaves an unknown directory or a glob unread", () => {
    // The loop resolves both pages, and one call that prints two pages shows each as a part (J-203 S1).
    expect(shell("for s in review diagnose; do cat .claude/skills/$s/SKILL.md; done")).toEqual([
      { skill: "review", file: "SKILL.md", whole: false, via: "cat", cause: "together" },
      { skill: "diagnose", file: "SKILL.md", whole: false, via: "cat", cause: "together" },
    ]);
    expect(
      shell("cd .claude/skills && for s in tdd frame; do cat ${s}/SKILL.md; done"),
    ).toHaveLength(2);
    expect(shell("D=.claude/skills; cat $D/frame/SKILL.md")).toEqual([
      { skill: "frame", file: "SKILL.md", whole: true, via: "cat" },
    ]);
    expect(
      shell("cd .claude/skills/review/references && cat lens.md ../SKILL.md").map(
        (load) => load.file,
      ),
    ).toEqual(["references/lens.md", "SKILL.md"]);
    expect(shell(`cd ${ROOT}/.claude/skills && cat tdd/SKILL.md`)).toHaveLength(1);
    expect(shell("cd $HOME/.claude/skills && cat frame/SKILL.md")).toEqual([]);
    expect(shell("cd && cat .claude/skills/frame/SKILL.md")).toEqual([]);
    expect(shell("cat $UNSET/frame/SKILL.md")).toEqual([]);
    expect(shell("for s in .claude/skills/*; do cat $s/SKILL.md; done")).toEqual([]);
    expect(shell("cat frame/SKILL.md", null)).toEqual([]);
    expect(shell("cat tdd/SKILL.md")).toEqual([]);
  });

  it("reads Gemini's read_file offset from 0, so its first line is the file's", () => {
    const at = (input: { readonly [key: string]: JsonValue }) =>
      loadsOf(
        sightingsOf(
          toolEvent("gemini", {
            hook_event_name: "BeforeTool",
            tool_name: "read_file",
            tool_input: input,
          }),
          ROOT,
        ),
        READER,
      );
    expect(
      at({ file_path: ".claude/skills/review/SKILL.md", offset: 0, limit: 120 })[0]?.whole,
    ).toBe(true);
    expect(
      at({ file_path: ".claude/skills/review/SKILL.md", offset: 1, limit: 400 })[0]?.whole,
    ).toBe(false);
  });

  it("reads the directory the harness gives a command, and `env` and `xargs` as wrappers", () => {
    const event = toolEvent("dsh", {
      tool_name: "bash",
      tool_input: { command: "cat frame/SKILL.md", workdir: ".claude/skills" },
    });
    expect(loadsOf(sightingsOf(event, ROOT), READER)).toEqual([
      { skill: "frame", file: "SKILL.md", whole: true, via: "cat" },
    ]);
    expect(shell("env LC_ALL=C cat .claude/skills/frame/SKILL.md")).toHaveLength(1);
  });
});

describe("J-116 S2 the facts' files, summarised", () => {
  it("reads a change's loads and a session's lines, leaving out a line that does not read", () => {
    const load = {
      skill: "tdd",
      file: "SKILL.md",
      whole: false,
      via: "Read",
      at: "2026-10-25T10:00:00.000Z",
      step: "build",
      agent: null,
      session: "s1",
      turn: 3,
    };
    expect(parseChangeLoads(`${JSON.stringify(load)}\nnot json\n{"skill":"x"}\n`)).toEqual([load]);
    const binding = { change: "2026-10-25-retry", turn: 2, at: "2026-10-25T10:00:00.000Z" };
    const { session: _session, ...rest } = load;
    const seen = { ...rest, noted: null };
    expect(parseSessionFact(`${JSON.stringify(seen)}\n${JSON.stringify(binding)}\n`)).toEqual([
      seen,
      binding,
    ]);
  });

  it("summarises the loads per skill and prints the mirror's line only when it holds a fact", () => {
    const facts = [
      { skill: "frame", file: "SKILL.md", whole: true, via: "Skill", step: null },
      { skill: "tdd", file: "SKILL.md", whole: false, via: "Read", step: "build" },
      { skill: "frame", file: "references/greenline.md", whole: true, via: "cat", step: "frame" },
      { skill: "tdd", file: "SKILL.md", whole: false, via: "sed", step: "verify" },
    ];
    expect(summariseLoads(facts)).toEqual([
      { skill: "frame", loads: 2, whole: 2, part: 0, steps: ["frame"], beforeRecord: 1 },
      { skill: "tdd", loads: 2, whole: 0, part: 2, steps: ["build", "verify"], beforeRecord: 0 },
    ]);
    expect(loadsLine(facts)).toBe("skills loaded: frame, tdd (part)");
    expect(loadsLine([])).toBeUndefined();
  });

  it("reads the declared skills from the sections and sets them beside the loaded", () => {
    const roster = rosterNamesOf(FILES.keys());
    expect([...roster].sort()).toEqual(["diagnose", "frame", "review", "tdd"]);
    const declared = declaredSkills(
      ["Followed `frame` and `tdd`.", "Ran `pnpm test`; `review` at the independent depth."],
      roster,
    );
    expect(declared).toEqual(["frame", "review", "tdd"]);
    expect(declaredBesideLoaded(declared, ["frame", "diagnose"])).toEqual({
      declaredAndLoaded: ["frame"],
      loadedNotDeclared: ["diagnose"],
      declaredNeverLoaded: ["review", "tdd"],
    });
  });

  it("names a skill's file from the root and counts a file's lines", () => {
    expect(skillFileOf(".agents/skills/tdd/references/a.md")).toEqual({
      skill: "tdd",
      file: "references/a.md",
    });
    expect(skillFileOf("src/skills/tdd/SKILL.md")).toBeUndefined();
    expect(skillFileOf(".claude/skills/Tdd/SKILL.md")).toBeUndefined();
    expect(lineCount("a\nb\n")).toBe(2);
    expect(lineCount("a\nb")).toBe(2);
    expect(lineCount("")).toBe(0);
  });
});

describe("J-198 S1 the loads the sessions' facts gave a change, and those its files lack", () => {
  const load = (skill: string, at: string, noted: string | null) => ({
    skill,
    file: "SKILL.md",
    whole: true,
    via: "cat",
    at,
    step: null,
    agent: null,
    turn: 1,
    noted,
  });
  const change = "2026-11-08-greeting-module";

  it("gives a change the loads noted in it and the loads its naming joined, never another change's", () => {
    const lines = [
      load("frame", "2026-11-08T00:10:24.392Z", null),
      { change, turn: 3, at: "2026-11-08T00:11:34.157Z" },
      load("tdd", "2026-11-08T00:11:36.536Z", change),
      load("router", "2026-11-08T00:12:00.000Z", "2026-11-08-other"),
      load("prose", "2026-11-08T00:13:00.000Z", null),
      { change: "2026-11-08-other", turn: 4, at: "2026-11-08T00:14:00.000Z" },
      load("close", "2026-11-08T00:19:08.647Z", change),
    ];
    expect(
      sessionLoadsOf(change, "s1", lines).map((entry) => [entry.skill, entry.session]),
    ).toEqual([
      ["frame", "s1"],
      ["tdd", "s1"],
      ["close", "s1"],
    ]);
  });

  it("names the loads the files lack, each matched once and kept one fact per load, whatever session the files name", () => {
    const fact = (skill: string, at: string, session: string | null) => {
      const { noted: _noted, ...rest } = load(skill, at, null);
      return { ...rest, session };
    };
    const kept = [
      fact("tdd", "2026-11-08T00:11:36.536Z", "raw-id"),
      fact("tdd", "2026-11-08T00:11:36.536Z", null),
    ];
    const noted = [
      fact("tdd", "2026-11-08T00:11:36.536Z", "s1"),
      fact("tdd", "2026-11-08T00:11:36.536Z", "s1"),
      fact("tdd", "2026-11-08T00:11:36.536Z", "s1"),
      fact("close", "2026-11-08T00:19:08.647Z", "s1"),
    ];
    // One load noted three times, and held twice under two spellings of its session, is one fact held (J-205 S1).
    expect(loadsMissing(kept, noted).map((entry) => entry.skill)).toEqual(["close"]);
    expect(loadsMissing([], noted).map((entry) => entry.skill)).toEqual(["tdd", "close"]);
  });

  it("gives a change each load once where the session's fact holds it twice (j196t-conduct-emptyb finding 3)", () => {
    const twice = load("tdd", "2026-11-08T13:59:12.757Z", change);
    const lines = [{ change, turn: 7, at: "2026-11-08T13:59:05.026Z" }, twice, twice];
    expect(sessionLoadsOf(change, "s1", lines).map((entry) => entry.skill)).toEqual(["tdd"]);
  });
});

describe("J-203 S1 one page per read, and a read the harness cut, each a part (j196c-merged-skills)", () => {
  const SANDBOX = "/runs/j196c-merged-skills/enclosure/sandbox";
  const PAGES: ReadonlyMap<string, number> = new Map([
    [".claude/skills/tdd/SKILL.md", 40],
    [".claude/skills/tdd/method.md", 120],
    [".claude/skills/tdd/tests.md", 90],
    [".claude/skills/ponytail/SKILL.md", 50],
    [".claude/skills/ponytail/simplify.md", 80],
    [".claude/skills/build/SKILL.md", 60],
    [".claude/skills/build/method.md", 70],
    [".claude/skills/build/references/greenline.md", 40],
  ]);
  const reader: LoadsReader = {
    fromRoot: (path) =>
      path.startsWith(`${SANDBOX}/`) ? path.slice(SANDBOX.length + 1) : undefined,
    installed: (path) => PAGES.has(path),
    lines: (path) => PAGES.get(path),
  };
  // threads/001/turns/001/stdout.jsonl line 437, the call whose result line 445 came back cut.
  const RUN_COMMAND = `cd "${SANDBOX}/.claude/skills" && cat tdd/method.md ponytail/simplify.md; echo =====BUILD; cat build/SKILL.md build/method.md build/references/greenline.md`;
  const CUT_ERROR =
    "Exit code 1\n# Test-Driven Development: the method\n\nWhether a change gains a new test is judged on its cost.\n\n... [4048 characters truncated] ...\n\nmaking code more consistent with the codebase, not imposing external preferences.";

  it("reads the run's one call of five pages as five parts, each read with another page", () => {
    const seen = loadsOf(shellSightings(RUN_COMMAND, SANDBOX), reader);
    expect(seen.map((load) => `${load.skill}/${load.file}`)).toEqual([
      "tdd/method.md",
      "ponytail/simplify.md",
      "build/SKILL.md",
      "build/method.md",
      "build/references/greenline.md",
    ]);
    expect(seen.every((load) => !load.whole && load.cause === "together")).toBe(true);
  });

  it("keeps one page alone whole, the same page read twice in one call whole, and a page beside a file outside the roster whole", () => {
    expect(
      loadsOf(shellSightings(`cat ${SANDBOX}/.claude/skills/tdd/method.md`, SANDBOX), reader),
    ).toEqual([{ skill: "tdd", file: "method.md", whole: true, via: "cat" }]);
    expect(
      loadsOf(
        shellSightings(
          "cat .claude/skills/tdd/method.md; cat .claude/skills/tdd/method.md",
          SANDBOX,
        ),
        reader,
      ).every((load) => load.whole),
    ).toBe(true);
    expect(
      loadsOf(shellSightings("cat .claude/skills/tdd/tests.md src/shelf.js", SANDBOX), reader),
    ).toEqual([{ skill: "tdd", file: "tests.md", whole: true, via: "cat" }]);
  });

  it("reads Claude Code's cut result from the after-tool payload, on success and on failure", () => {
    const after = (native: string, extra: { readonly [key: string]: JsonValue }) =>
      normaliseEvent({
        harness: "claude-code",
        kind: undefined,
        native: undefined,
        payload: {
          hook_event_name: native,
          session_id: "s1",
          cwd: SANDBOX,
          tool_name: "Bash",
          tool_use_id: "toolu_01PscdpDMnZD7JFKV2NLvrjZ",
          tool_input: { command: RUN_COMMAND },
          ...extra,
        },
        at: "2026-11-08T06:29:00.000Z",
      });
    expect(after("PostToolUseFailure", { error: CUT_ERROR })?.cut).toBe(true);
    expect(
      after("PostToolUse", {
        tool_response: { stdout: "a\n\n... [912 characters truncated] ...\n\nb", stderr: "" },
      })?.cut,
    ).toBe(true);
    expect(
      after("PostToolUse", { tool_response: { stdout: "the page whole", stderr: "" } })?.cut,
    ).toBe(false);
    // Codex hands its output text as the response; no marker, no cut.
    const codex = normaliseEvent({
      harness: "codex",
      kind: undefined,
      native: undefined,
      payload: {
        hook_event_name: "PostToolUse",
        session_id: "s1",
        cwd: SANDBOX,
        tool_name: "Bash",
        tool_input: { command: "cat .agents/skills/tdd/method.md" },
        tool_response: "the page whole",
      },
      at: "2026-11-08T06:29:00.000Z",
    });
    expect(codex?.cut).toBe(false);
    // The tool's start carries no result.
    expect(after("PreToolUse", {})?.cut).toBe(false);
  });

  it("settles a cut into the read it cut, so the change counts one part where the hooks noted a whole", () => {
    const fact = (
      file: string,
      whole: boolean,
      at: string,
      cause?: "together" | "cut",
    ): SkillLoadFact => {
      const seen: SkillLoadFact = {
        skill: "tdd",
        file,
        whole,
        via: "cat",
        at,
        step: "build",
        agent: null,
        session: "s1",
        turn: 1,
      };
      return cause === undefined ? seen : { ...seen, cause };
    };
    const before = fact("SKILL.md", true, "2026-11-08T06:28:59.000Z");
    const cut = fact("SKILL.md", false, "2026-11-08T06:29:00.000Z", "cut");
    const again = fact("SKILL.md", true, "2026-11-08T06:30:00.000Z");
    expect(settledLoads([before, cut])).toEqual([{ ...before, whole: false, cause: "cut" }]);
    expect(settledLoads([before, cut, again])).toEqual([
      { ...before, whole: false, cause: "cut" },
      again,
    ]);
    // A cut with no read before it is kept, a part; another file's read is never taken.
    const method = fact("method.md", true, "2026-11-08T06:28:00.000Z");
    expect(settledLoads([method, cut])).toEqual([method, cut]);
    expect(cutLoads([{ skill: "tdd", file: "SKILL.md", whole: true, via: "cat" }])).toEqual([
      { skill: "tdd", file: "SKILL.md", whole: false, via: "cat", cause: "cut" },
    ]);
    // The facts keep the cause, and a line that names another cause does not read.
    expect(parseChangeLoads(`${JSON.stringify(cut)}\n`)).toEqual([cut]);
    expect(parseChangeLoads(`${JSON.stringify({ ...cut, cause: "short" })}\n`)).toEqual([]);
    expect(carriesCut("x\n\n... [4048 characters truncated] ...\n\ny")).toBe(true);
    expect(carriesCut("a page that says truncated in its own words")).toBe(false);
  });
});

describe("J-207 S1 the reader stops where zsh stops, a cut that narrows lines a part, the result's error a second reading (j196c-roster-usec)", () => {
  // The run's sandbox, its managed root's prefix left off as the J-203 S1 case leaves it; the space a path may hold kept.
  const SANDBOX = "/runs/j196c roster-usec/enclosure/sandbox";
  const PAGES: ReadonlyMap<string, number> = new Map([
    [".agents/skills/frame/SKILL.md", 24],
    [".agents/skills/frame/references/greenline.md", 40],
    [".agents/skills/frame/method.md", 60],
    [".agents/skills/frame/references/interview.md", 50],
    [".claude/skills/domain-and-types/method.md", 70],
    [".claude/skills/ponytail/method.md", 90],
    [".claude/skills/tdd/references/greenline.md", 8],
    [".claude/skills/boundaries/method.md", 82],
    [".claude/skills/design/references/craft.md", 60],
    [".agents/skills/build/references/commits.md", 50],
    [".agents/skills/tdd/references/greenline.md", 8],
    [".agents/skills/ponytail/method.md", 90],
    [".agents/skills/design/references/home.md", 39],
    [".agents/skills/design/references/craft.md", 60],
  ]);
  const reader: LoadsReader = {
    fromRoot: (path) =>
      path.startsWith(`${SANDBOX}/`) ? path.slice(SANDBOX.length + 1) : undefined,
    installed: (path) => PAGES.has(path),
    lines: (path) => PAGES.get(path),
  };
  const ZSH = { zsh: true } as const;
  const read = (text: string, reading: { readonly zsh?: boolean } = ZSH): readonly string[] =>
    loadsOf(shellSightings(text, SANDBOX, reading), reader).map((load) =>
      [`${load.skill}/${load.file}`, load.whole ? "whole" : "part", load.cause ?? "-"].join(" "),
    );
  // The five calls the judge's finding 1 names, as the run's captures hold them.
  const CALLS = {
    "001/001 toolu_01SoXoeR583NeNt3Q2rDRbva": `cd "${SANDBOX}/.agents/skills/frame" && cat SKILL.md; echo ======; cat references/greenline.md`,
    "001/003 toolu_01RW4KzR4shywJkYYdudUQVY": `cd "${SANDBOX}/.claude/skills" && cat domain-and-types/method.md; echo =========; cat ponytail/method.md`,
    "001/003 toolu_014xDLyUCPvbzXL4e88rPjF9": `cd "${SANDBOX}/.claude/skills" && cat tdd/references/greenline.md; echo ==========; sed -n 1,50p boundaries/method.md; echo ==========; cat design/references/craft.md`,
    "002/001 toolu_01FB6sTKYZza3m2ysv39DdCA": `cd "${SANDBOX}" && cat .agents/skills/frame/method.md; echo =====; cat .agents/skills/frame/references/interview.md`,
    "002/005 toolu_01U3Cd8PPfSKc9KwpzVD9uPG": `cd "${SANDBOX}" && cat .agents/skills/build/references/commits.md | cut -c1-900; echo ====TDDG; cat .agents/skills/tdd/references/greenline.md | cut -c1-900; echo ====PT; sed -n 1,60p .agents/skills/ponytail/method.md | cut -c1-500`,
  } as const;

  it("reads each of the run's calls under zsh as the one page printed before the equals row, whole by its own range, and nothing after it", () => {
    expect(Object.values(CALLS).map((call) => read(call))).toEqual([
      ["frame/SKILL.md whole -"],
      ["domain-and-types/method.md whole -"],
      ["tdd/references/greenline.md whole -"],
      ["frame/method.md whole -"],
      // The fifth's one printed page went through `cut -c1-900`, a part by the cut's rule.
      ["build/references/commits.md part -"],
    ]);
  });

  it("reads the same list whole under a shell that names itself otherwise, each page with another a part", () => {
    expect(read(CALLS["001/001 toolu_01SoXoeR583NeNt3Q2rDRbva"], { zsh: false })).toEqual([
      "frame/SKILL.md part together",
      "frame/references/greenline.md part together",
    ]);
    expect(read(CALLS["001/003 toolu_01RW4KzR4shywJkYYdudUQVY"], {})).toEqual([
      "domain-and-types/method.md part together",
      "ponytail/method.md part together",
    ]);
  });

  it("stops where zsh stops and nowhere else: a quoted or escaped equals, a lone one, one inside a word or an assignment, a subshell, a substitution, a pipeline's earlier command, the background and a nested shell", () => {
    const page = ".agents/skills/frame/SKILL.md";
    const other = ".agents/skills/frame/method.md";
    const pages = (text: string): readonly string[] =>
      read(text).map((line) => line.split(" ")[0] ?? "");
    const both = ["frame/SKILL.md", "frame/method.md"];
    // zsh's equals expansion refuses the word, and the whole list stops there.
    expect(pages(`cat ${page} && echo ===== && cat ${other}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`cat ${page}\necho =====\ncat ${other}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`cat ${page}; echo ==; cat ${other}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`cat ${page}; echo A =====; cat ${other}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`cat ${page}; { echo =====; }; cat ${other}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`echo =====; cat ${page}`)).toEqual([]);
    // The pipeline's last command runs in the shell itself: the pipeline before it shows nothing.
    expect(pages(`cat ${page} | grep =====; cat ${other}`)).toEqual([]);
    expect(pages(`for f in ${page} =====; do cat $f; done; cat ${other}`)).toEqual([]);
    // A test's `==` is a word zsh expands, and refuses; a `[[ ]]` test's is an operator.
    expect(pages(`[ a == a ] && cat ${page}; cat ${other}`)).toEqual([]);
    expect(pages(`if [[ a == a ]]; then cat ${page}; fi; cat ${other}`)).toEqual(both);
    // No stop: zsh expands none of these, or the failure stays in its own process.
    expect(pages(`cat ${page}; echo "====="; cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; echo \\=====; cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; echo '='====; cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; echo =; cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; echo x=====; cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; LINE=x; cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; (echo =====); cat ${other}`)).toEqual(both);
    expect(pages(`(cat ${page}; echo =====; cat ${other}); cat ${other}`)).toEqual(both);
    expect(pages(`cat ${page}; echo $(echo =====); cat ${other}`)).toEqual(both);
    expect(pages(`echo =====C | cat; cat ${page}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`echo ===== & cat ${page}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`eval "echo =====; cat ${other}"; cat ${page}`)).toEqual(["frame/SKILL.md"]);
    expect(pages(`bash -c "echo =====; cat ${other}"`)).toEqual(["frame/method.md"]);
    expect(pages(`zsh -c "echo =====; cat ${other}"; cat ${page}`)).toEqual(["frame/SKILL.md"]);
    // J-203 S1's run command, read again: the pages before its equals word printed, and none after it.
    expect(
      pages(
        `cat ${page} ${other}; echo =====BUILD; cat .agents/skills/frame/references/greenline.md`,
      ),
    ).toEqual(both);
  });

  it("reads a cut that narrows lines, by character, byte or field, as a part, and a cut that narrows none as passing every line", () => {
    // 002/005 toolu_01YTG2fsALWGXDjpU8jomGpd and toolu_018CziZHjfxRrAdoP43YXLNZ, both noted whole by the run's facts.
    expect(
      read(
        `cd "${SANDBOX}" && sed -n 1,80p .agents/skills/design/references/home.md | cut -c1-500`,
      ),
    ).toEqual(["design/references/home.md part -"]);
    expect(
      read(
        `cd "${SANDBOX}" && cat .agents/skills/design/references/craft.md | cut -c1-700; ls .agents/skills/design/references/components`,
      ),
    ).toEqual(["design/references/craft.md part -"]);
    const home = ".agents/skills/design/references/home.md";
    for (const narrowing of [
      "cut -c 1-80",
      "cut -b1-10",
      "cut -d: -f2",
      "cut -sf1",
      "cut --characters=1-5",
      "cut --bytes 1-4",
      "cut --fields=1",
    ])
      expect(read(`cat ${home} | ${narrowing}`), narrowing).toEqual([
        "design/references/home.md part -",
      ]);
    expect(read(`cat ${home} | cut`)).toEqual(["design/references/home.md whole -"]);
    expect(read(`cat ${home} | cut -d,`)).toEqual(["design/references/home.md whole -"]);
  });

  it("reads zsh's error in the result as the words it refused, and marks the reads after the failing word as not made", () => {
    const command = CALLS["001/001 toolu_01SoXoeR583NeNt3Q2rDRbva"];
    // threads/001/turns/001/stdout.jsonl line 219, the failed call's result.
    const error =
      'Exit code 1\n---\nname: "frame"\n---\n\n# Frame\n\nNext: the next step of the change\'s mode\n(eval):1: ===== not found';
    const after = normaliseEvent({
      harness: "claude-code",
      kind: undefined,
      native: undefined,
      payload: {
        hook_event_name: "PostToolUseFailure",
        session_id: "s1",
        cwd: SANDBOX,
        tool_name: "Bash",
        tool_use_id: "toolu_01SoXoeR583NeNt3Q2rDRbva",
        tool_input: { command },
        error,
      },
      at: "2026-11-08T14:58:29.829Z",
    });
    expect(after?.refused).toEqual(["======"]);
    expect(refusedWords("zsh:3: =TDDG not found\n(eval):12: ==== not found")).toEqual([
      "==TDDG",
      "=====",
    ]);
    // A command zsh cannot find, another program's words or a page's own prose refuse no expansion.
    expect(refusedWords("zsh: command not found: foo\ngrep: x: No such file")).toEqual([]);
    expect(refusedWords("the page says ===== not found in its prose")).toEqual([]);
    if (after === undefined) throw new Error("no event");
    // A shell named otherwise noted both pages before the call; the result's error leaves the first alone.
    const noted = loadsOf(sightingsOf(after, SANDBOX), reader);
    const ran = loadsOf(sightingsOf(after, SANDBOX, { refused: new Set(after.refused) }), reader);
    expect(ran).toEqual([{ skill: "frame", file: "SKILL.md", whole: true, via: "cat" }]);
    const unrun = unrunLoads(noted, ran);
    expect(unrun).toEqual([
      {
        skill: "frame",
        file: "references/greenline.md",
        whole: false,
        via: "cat",
        cause: "unrun",
      },
    ]);
    const fact = (load: LoadSeen, at: string): SkillLoadFact => ({
      ...load,
      at,
      step: "frame",
      agent: null,
      session: "s1",
      turn: 1,
    });
    const before = noted.map((load) => fact(load, "2026-11-08T14:58:29.331Z"));
    const earlier = fact(
      { skill: "frame", file: "references/greenline.md", whole: true, via: "Read" },
      "2026-11-08T14:50:00.000Z",
    );
    const marks = unrun.map((load) => fact(load, after.at));
    expect(settledLoads([earlier, ...before, ...marks])).toEqual([earlier, before[0]]);
    // A mark with no read before it leaves nothing, and the facts keep the cause.
    expect(settledLoads(marks)).toEqual([]);
    expect(parseChangeLoads(marks.map((mark) => `${JSON.stringify(mark)}\n`).join(""))).toEqual(
      marks,
    );
    // A reading that stopped already leaves nothing to mark.
    expect(unrunLoads(ran, ran)).toEqual([]);
  });

  it("reads zsh from the environment where it names the shell, and on macOS where it names none", () => {
    expect(readsAsZsh("/bin/zsh", "darwin")).toBe(true);
    expect(readsAsZsh("/usr/local/bin/zsh", "linux")).toBe(true);
    expect(readsAsZsh("/bin/bash", "darwin")).toBe(false);
    expect(readsAsZsh("/opt/homebrew/bin/fish", "darwin")).toBe(false);
    expect(readsAsZsh(undefined, "darwin")).toBe(true);
    expect(readsAsZsh("", "darwin")).toBe(true);
    expect(readsAsZsh(undefined, "linux")).toBe(false);
  });
});

describe("J-215 S1 the directories a shell line runs in and the changes its greenline commands name (j196t-conduct-emptyd)", () => {
  const MAIN = "/repo";
  it("reads each command's directory after the cd steps, in a nested shell's script too", () => {
    expect(shellDirectories("python3 -m unittest discover -v", MAIN)).toEqual([MAIN]);
    expect(
      shellDirectories(
        "/bin/zsh -lc 'cd .worktrees/2026-11-09-greeting-test && python3 -m unittest'",
        MAIN,
      ),
    ).toEqual(["/repo/.worktrees/2026-11-09-greeting-test"]);
    expect(shellDirectories("cd /elsewhere && ls; cd - && ls", MAIN)).toEqual(["/elsewhere"]);
    expect(shellDirectories('W=/tree; cd "$W" && git status', MAIN)).toEqual(["/tree"]);
  });

  it("reads the change a greenline command names by --change, in either form", () => {
    expect(
      changesNamed(
        "/bin/zsh -lc 'greenline check --change 2026-11-09-greeting-test --step build -- python3 -m unittest discover -v'",
      ),
    ).toEqual(["2026-11-09-greeting-test"]);
    expect(changesNamed("greenline brief --change=2026-11-09-greeting-test --step review")).toEqual(
      ["2026-11-09-greeting-test"],
    );
    expect(changesNamed("echo --change 2026-11-09-greeting-test")).toEqual([]);
    expect(changesNamed("greenline check --change not-an-id -- true")).toEqual([]);
  });
});
