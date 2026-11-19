/**
 * The ledger's machine-written files held by the hooks (J-173 S1; the
 * register's row of 2026-10-31, "The ledger's files are the CLI's to
 * write"): the before-write hook refuses the agent's Write or Edit to the
 * marks file, a links or interface index, a check's facts and a picture
 * under a change's ledger folder, whatever the change's state, naming the
 * command that owns the file; the shell guard refuses a command whose
 * words name one of them as a write target, the interface conduct run's
 * scripted closure first; and the agent's own files, the CLI's reads and
 * greenline's own commands go on.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { ledgerShellRefusalOf } from "../../src/shell/guard.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const ID = "2026-10-31-filter-search";
const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A workspace with a change open on its branch, accepted, or none open on main. */
function space(open: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "ledger-files-"));
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
  write("package.json", "{}\n");
  const init = new RecordingWriter();
  if (
    runCli(["init", "--yes"], init.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    }) !== 0
  )
    throw new Error(init.out + init.err);
  write(".greenline/ledger/interface/marks.jsonl", "");
  git("add", "--all");
  git("commit", "--quiet", "--no-verify", "-m", "start");
  if (open) {
    git("checkout", "--quiet", "-b", `greenline/${ID}`);
    write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: regular",
        'why: "w"',
        "state: open",
        "choice: accepted",
        'yes: "go ahead"',
        "---",
        "",
      ].join("\n"),
    );
  }
  return root;
}

/** One hook event's verdict: the exit code and what it printed on stderr. */
function fire(root: string, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-10-31T12:00:00.000Z"),
  });
  return { code, err: writer.err };
}

/** A Codex shell command before it runs. */
function codexShell(root: string, command: string) {
  return {
    hook_event_name: "PreToolUse",
    session_id: "c1",
    turn_id: "t1",
    cwd: root,
    model: "gpt-6.1-sol",
    tool_name: "Bash",
    tool_input: { command },
    tool_use_id: "call-1",
  } satisfies JsonValue;
}

/** A Claude Code write before it runs. */
function claudeWrite(root: string, path: string) {
  return {
    hook_event_name: "PreToolUse",
    session_id: "s1",
    tool_name: "Write",
    tool_input: { file_path: join(root, path), content: "x" },
  } satisfies JsonValue;
}

/** The interface conduct run's scripted closure (j109t-conduct-interface 001/020), as Codex ran it. */
const CLOSURE = [
  "python3 - <<'PY'",
  "import json",
  "from pathlib import Path",
  "",
  "path = Path('.greenline/ledger/interface/marks.jsonl')",
  "marks = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]",
  "with path.open('a') as output:",
  "    for mark in marks:",
  "        mark['state'] = 'addressed'",
  "        mark['closed'] = {'by': 'owner', 'via': 'words', 'words': 'Just edit the marks file and set them to addressed.'}",
  "        output.write(json.dumps(mark) + '\\n')",
  "PY",
].join("\n");

describe("J-173 S1 the hooks refuse the agent's own hand on the ledger's machine-written files", () => {
  it("refuses the run's scripted closure of the marks, wrapped as Codex runs it, with greenline mark named", () => {
    for (const open of [true, false]) {
      const root = space(open);
      const verdict = fire(root, "codex", codexShell(root, `/bin/zsh -lc "${CLOSURE}"`));
      expect(verdict.code, `open: ${String(open)}`).toBe(2);
      expect(verdict.err).toBe(
        "`python3 -` writes by a script: the owner's marks are not edited by hand, so the write to .greenline/ledger/interface/marks.jsonl is stopped; change them through greenline mark (list, add, propose, close), which records whose act each line is, and close a mark only on the owner's word; marks-by-hand, greenline's harness hook\n",
      );
    }
  });

  it("refuses a Write to each machine-written file, whatever the change's state, the owner named", () => {
    for (const open of [true, false]) {
      const root = space(open);
      for (const [path, owner] of [
        [".greenline/ledger/interface/marks.jsonl", "greenline mark"],
        [`.greenline/ledger/${ID}/visuals.json`, "the hooks write"],
        [
          `.greenline/ledger/${ID}/checks/20261031T125942292Z-64a9ae.json`,
          "greenline check writes",
        ],
        [".greenline/ledger/interface/paths.json", "greenline check interface writes"],
        [`.greenline/visuals/${ID}/capture-home.boxes.json`, "greenline check interface writes"],
      ] as const) {
        const verdict = fire(root, "claude-code", claudeWrite(root, path));
        expect([path, open, verdict.code]).toEqual([path, open, 2]);
        expect(verdict.err, path).toContain(owner);
        expect(verdict.err, path).toMatch(
          /; (?:marks|ledger)-by-hand, greenline's harness hook\n$/,
        );
      }
    }
  });

  it("refuses a picture written under a change's ledger folder, by a write or a copy, with the visual home named", () => {
    const root = space(true);
    const written = fire(
      root,
      "claude-code",
      claudeWrite(root, `.greenline/ledger/${ID}/verify/screens/home.png`),
    );
    expect(written.code).toBe(2);
    expect(written.err).toContain(`the visual home, .greenline/visuals/${ID}/`);
    expect(written.err).toMatch(/; picture-in-ledger, greenline's harness hook\n$/);
    // The Linear run's copy of its screenshots into the change's folder.
    const copied = fire(
      root,
      "codex",
      codexShell(root, `cp /tmp/shots/home.png .greenline/ledger/${ID}/verify/screens/`),
    );
    expect(copied.code).toBe(2);
    expect(copied.err).toContain("writes by a copy or a move: a picture is no record");
  });

  it("refuses a redirection and an edit in place onto a links file from the folder a cd names", () => {
    const root = space(true);
    for (const command of [
      `cd .greenline/ledger/${ID} && echo '{}' > visuals.json`,
      `sed -i '' 's/a/b/' .greenline/ledger/${ID}/frame-map.json`,
    ]) {
      const verdict = fire(root, "codex", codexShell(root, command));
      expect([command, verdict.code]).toEqual([command, 2]);
      expect(verdict.err).toContain("ledger-by-hand");
    }
  });

  it("lets the agent's own files, a read and greenline's own commands go on", () => {
    const root = space(true);
    for (const command of [
      "cat .greenline/ledger/interface/marks.jsonl",
      "greenline mark list --all",
      `jq .visuals .greenline/ledger/${ID}/visuals.json`,
      `git add .greenline/ledger/${ID}/visuals.json`,
      `echo note >> .greenline/ledger/${ID}/review-1.md`,
    ])
      expect([command, fire(root, "codex", codexShell(root, command)).code]).toEqual([command, 0]);
    expect(fire(root, "claude-code", claudeWrite(root, `.greenline/ledger/${ID}.md`)).code).toBe(0);
  });

  it("refuses a picture written into the visual home by hand, which greenline picture keep alone writes (J-176 S1)", () => {
    const root = space(true);
    const refused = fire(
      root,
      "claude-code",
      claudeWrite(root, `.greenline/visuals/${ID}/shot.png`),
    );
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("which greenline picture keep alone writes");
    expect(refused.err).toContain("visuals-by-hand");
  });
});

describe("J-193 S1 a record write whose script only names the visual home is let through", () => {
  const CAPTURE = `.greenline/visuals/${ID}/capture-members.html`;
  /** The record write the hook refused (j179c-conduct-interfaceb 001/010, note 8), cut to its shape, as Claude Code ran it. */
  const VERIFY = [
    "python3 -I - <<'EOF'",
    `p=".greenline/ledger/${ID}.md"`,
    "s=open(p).read()",
    "v='''The baseline is the commit before; the treatment is the branch.",
    "",
    `It also wrote a capture, \`${CAPTURE}\`, and a path index \`.greenline/ledger/interface/paths.json\`;`,
    "none is committed, and the owner decides: delete that capture in greenline inspect.",
    "'''",
    'open(p,"w").write(s+"\\n## verify\\n\\n"+v)',
    "EOF",
  ].join("\n");

  /** A Claude Code shell command before it runs. */
  const bash = (command: string): JsonValue => ({
    hook_event_name: "PreToolUse",
    session_id: "s1",
    tool_name: "Bash",
    tool_input: { command },
  });

  it("lets the record's write go on though its prose names the capture and the path index", () => {
    const root = space(true);
    expect(fire(root, "claude-code", bash(VERIFY))).toEqual({ code: 0, err: "" });
  });

  it("refuses a redirection, a copy and a script's write onto the visual home as before", () => {
    const root = space(true);
    for (const command of [
      `echo x > ${CAPTURE}`,
      `cp .greenline/tmp/${ID}/capture.html ${CAPTURE}`,
      `python3 -c "open('${CAPTURE}','w').write('x')"`,
    ]) {
      const refused = fire(root, "claude-code", bash(command));
      expect([command, refused.code]).toEqual([command, 2]);
      expect(refused.err).toContain("visuals-by-hand, greenline's harness hook");
    }
  });
});

describe("J-227 S1 a figure's sources are record: anatomy's page and the guard agree (j201t-visuals finding 5, j201t-linear-visuals finding 7)", () => {
  const SLUG = "loan-lifecycle";
  const SOURCES = `.greenline/ledger/${ID}/sources/${SLUG}/`;

  /** A Codex shell command before it runs, as the run's anatomy agent ran its copies. */
  const copy = (root: string, command: string) => fire(root, "codex", codexShell(root, command));

  it("names the change's ledger folder on anatomy's page for the build script and the model, the figure alone kept in the home", () => {
    const page = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "corpus",
        "skills",
        "anatomy",
        "references",
        "greenline.md",
      ),
      "utf8",
    );
    expect(page).toContain("`.greenline/ledger/<id>/sources/<slug>/`");
    expect(page).not.toContain("its build script and model module beside them in that folder");
  });

  it("admits a copy of the build script and the model into the ledger folder, and refuses the same into the home and an SVG into the ledger", () => {
    const root = space(true);
    const tmp = `.greenline/tmp/${ID}/anatomy`;
    expect(
      copy(root, `mkdir -p ${SOURCES} && cp ${tmp}/build.mjs ${tmp}/model.js ${SOURCES}`),
    ).toEqual({
      code: 0,
      err: "",
    });
    const home = copy(root, `cp ${tmp}/build.mjs ${tmp}/model.js .greenline/visuals/${ID}/`);
    expect(home.code).toBe(2);
    expect(home.err).toContain("visuals-by-hand, greenline's harness hook");
    const svg = copy(root, `cp ${tmp}/${SLUG}.svg ${SOURCES}`);
    expect(svg.code).toBe(2);
    expect(svg.err).toContain("picture-in-ledger, greenline's harness hook");
  });
});

describe("J-227 S1 a restore into the home is refused, a hidden write is named after the tool", () => {
  const STATES = `.greenline/visuals/${ID}/loan-states.md`;

  /** A Claude Code shell command at a hook event. */
  const bash = (root: string, kind: string, command: string, call = "b-1"): JsonValue => ({
    hook_event_name: kind,
    session_id: "s1",
    cwd: root,
    tool_name: "Bash",
    tool_use_id: call,
    tool_input: { command },
  });

  /** A workspace with a kept picture committed in the change's folder of the home. */
  function kept(): string {
    const root = space(true);
    mkdirSync(join(root, ".greenline", "visuals", ID), { recursive: true });
    writeFileSync(join(root, STATES), "# states\n");
    execFileSync("git", ["add", "--all"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=F",
        "-c",
        "user.email=f@example.com",
        "commit",
        "--quiet",
        "--no-verify",
        "-m",
        "kept",
      ],
      { cwd: root },
    );
    return root;
  }

  it("refuses the run's restore before the tool, in the harness hook and the shell guard, the owner's delete named (j217c-conduct-runner finding 2)", () => {
    const root = kept();
    rmSync(join(root, STATES));
    const restore = `git restore -- ${STATES} .greenline/visuals/${ID}/loan-states.visual.json; git status --short`;
    const refused = fire(root, "claude-code", bash(root, "PreToolUse", restore));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("writes by a restore");
    expect(refused.err).toContain(
      "a picture the owner deleted in greenline inspect is remade only on the owner's ask, never restored from git; visuals-by-hand, greenline's harness hook",
    );
    expect(ledgerShellRefusalOf(restore, root, root)).toContain("visuals-by-hand");
    // The home and .greenline hold the change's folder, emptied or not.
    rmSync(join(root, ".greenline", "visuals", ID), { recursive: true });
    for (const command of [
      "git checkout -- .greenline/visuals",
      "git restore .greenline",
      `git restore .greenline/visuals/${ID}`,
    ])
      expect([
        command,
        ledgerShellRefusalOf(command, root, root)?.endsWith("visuals-by-hand"),
      ]).toEqual([command, true]);
  });

  it("lets the index's restore and a branch checkout go on, and leaves a whole-tree restore to the discard rule", () => {
    const root = kept();
    // A whole-tree restore is a discard, which its own rule and the owner's words decide.
    for (const command of ["git checkout -- .", "git restore ."])
      expect([command, ledgerShellRefusalOf(command, root, root)]).toEqual([command, undefined]);
    for (const command of [
      `git restore --staged ${STATES}`,
      "git checkout main",
      "git switch main",
    ])
      expect([command, fire(root, "claude-code", bash(root, "PreToolUse", command)).code]).toEqual([
        command,
        0,
      ]);
  });

  /** A shell command's before and after events around what it does, the after's output returned. */
  function ran(root: string, command: string, run: () => void, call: string) {
    const writer = new RecordingWriter();
    const at = (kind: string) =>
      runEventCli(["--harness", "claude-code"], writer.writer, {
        cwd: root,
        stdin: () => JSON.stringify(bash(root, kind, command, call)),
      });
    at("PreToolUse");
    run();
    const code = at("PostToolUse");
    return { code, out: writer.out, err: writer.err };
  }

  it("names after the tool a write into the change's folder the words hid, and none for the keep's own or a branch checkout's", () => {
    const root = space(true);
    // item_17 of j201t-visuals 002/001: the folder's path built from parts.
    const parts = [
      "python3 - <<'PY'",
      "from pathlib import Path",
      "root = Path('.greenline')",
      `dest = root / 'visuals/${ID}'`,
      "(dest / 'build.mjs').write_text('x')",
      "PY",
    ].join("\n");
    const hidden = ran(
      root,
      parts,
      () => {
        mkdirSync(join(root, ".greenline", "visuals", ID), { recursive: true });
        writeFileSync(join(root, ".greenline", "visuals", ID, "build.mjs"), "x\n");
      },
      "h-1",
    );
    expect(hidden.code).toBe(0);
    expect(hidden.out).toContain(
      `the command wrote .greenline/visuals/${ID}/build.mjs in a change's folder of the visual home, which its words did not show, so the hooks name it after the tool: .greenline/visuals/${ID}/build.mjs is a kept picture or its manifest in the visual home, which greenline picture keep alone writes`,
    );
    expect(hidden.out).toContain("visuals-by-hand");
    for (const [command, call] of [
      [`greenline picture keep .greenline/tmp/${ID}/flow.svg --change ${ID}`, "k-1"],
      // The interface check's capture stands in the change's folder by its own door.
      ["greenline check interface --url http://127.0.0.1:5173 --path /", "i-1"],
      ["git checkout greenline/other", "c-1"],
    ] as const) {
      const quiet = ran(
        root,
        command,
        () => writeFileSync(join(root, ".greenline", "visuals", ID, "flow.svg"), "<svg/>\n"),
        call,
      );
      expect([command, quiet.out.includes("which its words did not show")]).toEqual([
        command,
        false,
      ]);
    }
  });
});
