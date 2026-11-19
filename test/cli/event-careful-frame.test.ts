/**
 * The careful frame held by two doors (J-223 S1; the register's rows of
 * 2026-11-05, "The keeper over the oracle", and 2026-11-09, "Outcomes, not
 * manners"), through `greenline event`'s and `greenline hook pre-commit`'s
 * entry points on fixture repositories with real git, the run
 * j217t-frame-nodes's case: the owner asked for a CSV export of the open
 * loans and answered the proposal with "Use careful."; the agent asked two
 * rounds on two nodes, left ten untouched, never put its restatement to the
 * owner and wrote the plan, the tests and the code in the same turn. Here
 * the harness's before-write hook and git's pre-commit refuse everything
 * outside the change's homes until the frame is whole by the lint and the
 * owner's words, said after the CLI noted the restatement put to them,
 * stand in the record's confirmed line; on Claude Code and on Codex, by a
 * turn's end and by a question tool's card, and never at regular.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runHookCli } from "../../src/shell/cli/hook.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const ID = "2026-11-10-open-loans-csv";
const RECORD = `.greenline/ledger/${ID}.md`;
const SESSION = "019a6e1f-7c4b-7d20-9a31-frame-nodes";
const REQUEST = "Add a CSV export of the open loans for the finance office.";
const CAREFUL = "Use careful.";
const ROUND = "1.1, and member numbers only, never names.";
const CONFIRM = "Yes, that is what I want.";
const RULE = "frame-confirmed";
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

/** The run's sandbox: the shelf on main and the change's branch cut. */
function sandbox(): Space {
  const root = mkdtempSync(join(tmpdir(), "greenline-careful-frame-"));
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
      // git's hooks on, so `greenline hook pre-commit` reads the commit; none is registered with git here.
      hooks: { adapters: true, git: true },
    }),
  );
  space.write(".gitignore", ".greenline/tmp/\n");
  space.write("src/shelf.js", "export class Shelf {}\n");
  space.git("add", ".");
  space.git("commit", "--quiet", "-m", "start");
  space.git("checkout", "--quiet", "-b", `greenline/${ID}`);
  return space;
}

/** The run's frame: two rounds on surface and data, ten nodes untouched, the restatement written. */
const LOANS_FRAME = [
  "Finance needs a CSV of open loans for month-end close, opened in Excel on Windows.",
  "",
  "### Round 1",
  "",
  "- Q1 [surface] How should finance receive the CSV?",
  "  - proposed: a library function the desk app can call",
  "  - answer: a library function",
  "  - decided: owner",
  "- Q2 [data] Which columns should the export contain?",
  "  - proposed: ISBN, title, member number and due date",
  "  - answer: those columns; member number, never a name",
  "  - decided: owner",
];

/** The frame whole: every subject node asked or closed with a reason, the restatement beside them. */
const WHOLE_FRAME = [
  ...LOANS_FRAME,
  "- Q3 [purpose] Is the export for the month-end close alone?",
  "  - proposed: yes",
  "  - answer: yes",
  "  - decided: owner",
  "- closed [scope, adjacent, journey]: a library function beside the shelf, open loans alone",
  "- closed [behaviour, security, performance]: an empty shelf gives the header, no personal data, a few hundred rows",
  "- closed [operations, verification, constraints]: nothing deploys; the shelf's tests; no runtime dependency",
  "",
  "Out of scope: names, storage and a screen.",
];

function recordText(mode: string, frame: readonly string[], confirmed?: string): string {
  return [
    "---",
    `mode: ${mode}`,
    ...(mode === "careful" ? ["choice: owner", "proposed: regular"] : ["choice: owner"]),
    'why: "Give the finance office a CSV of open loans for month-end close."',
    "state: open",
    "next: \"frame: wait for the owner's confirmation of the frame's restatement\"",
    ...(confirmed === undefined ? [] : [`confirmed: "${confirmed}"`]),
    "---",
    "",
    "## frame",
    "",
    ...frame,
    "",
  ].join("\n");
}

/** The hooks' clock, a second on at each event, so every message and note has its own time. */
let tick = 0;

function fire(where: Space, harness: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  tick += 1;
  const at = new Date(Date.parse("2026-11-10T10:00:00.000Z") + tick * 1000);
  const code = runEventCli(["--harness", harness], writer.writer, {
    cwd: where.root,
    stdin: () => JSON.stringify(payload),
    now: () => at,
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
    line: () => definition,
  });
  return { code, out: writer.out, err: writer.err };
}

const ask = (where: Space, harness: string, prompt: string) =>
  fire(where, harness, { hook_event_name: "UserPromptSubmit", session_id: SESSION, prompt });

const end = (where: Space, harness: string, reply: string) =>
  fire(where, harness, {
    hook_event_name: "Stop",
    session_id: SESSION,
    last_assistant_message: reply,
    stop_hook_active: false,
  });

/** A write tool's call on a path, as each harness hands it before the tool. */
function beforeWrite(where: Space, harness: string, path: string, text: string) {
  return fire(
    where,
    harness,
    harness === "codex"
      ? {
          hook_event_name: "PreToolUse",
          session_id: SESSION,
          tool_use_id: "call_w",
          tool_name: "apply_patch",
          tool_input: { command: `*** Begin Patch\n*** Update File: ${path}\n*** End Patch` },
        }
      : {
          hook_event_name: "PreToolUse",
          session_id: SESSION,
          tool_use_id: "toolu_w",
          tool_name: "Write",
          tool_input: { file_path: join(where.root, path), content: text },
        },
  );
}

/** The agent's write of the record, admitted inside the homes, its text then on disk. */
function writeRecord(where: Space, harness: string, text: string): void {
  expect(beforeWrite(where, harness, RECORD, text).code).toBe(0);
  where.write(RECORD, text);
}

/** The code's write, the before-write door's reading of it. */
const writeCode = (where: Space, harness: string) =>
  beforeWrite(where, harness, "src/shelf.js", "export class Shelf { loansCsv() {} }\n");

/** git's pre-commit over what the index stages. */
function preCommit(where: Space) {
  const writer = new RecordingWriter();
  const code = runHookCli(["pre-commit"], writer.writer, {
    cwd: where.root,
    stdin: () => "",
    modes: () => definition.modes.map((mode) => mode.name),
    line: () => definition,
  });
  return { code, err: writer.err };
}

/** The run to the frame whole: the request, careful named, the rounds answered, the record written. */
function framed(harness: string, frame: readonly string[] = WHOLE_FRAME): Space {
  const space = sandbox();
  ask(space, harness, REQUEST);
  end(space, harness, "I propose a regular change. Waiting on: your yes.");
  ask(space, harness, CAREFUL);
  writeRecord(space, harness, recordText("careful", LOANS_FRAME));
  end(space, harness, "1. **Delivery** ...\n2. **Columns** ...");
  ask(space, harness, ROUND);
  writeRecord(space, harness, recordText("careful", frame));
  return space;
}

describe.each(["claude-code", "codex"])(
  "J-223 S1 the before-write door at careful, on %s (j217t-frame-nodes)",
  (harness) => {
    it("refuses the code while the frame is not whole, naming the nodes the lint finds uncovered", () => {
      const space = framed(harness, LOANS_FRAME);
      const refused = writeCode(space, harness);
      expect(refused.code).not.toBe(0);
      // Claude Code's write tool names the absolute path, Codex's patch the path from the root.
      expect(refused.err).toMatch(
        /at careful nothing outside the change's homes is written before the owner confirms the frame: the write to \S*src\/shelf\.js lies outside \.greenline\/ledger\/ and \.greenline\/tmp\/2026-11-10-open-loans-csv\/, and /,
      );
      expect(refused.err).toContain(
        "the frame is not whole: the careful frame leaves 10 of the 12 subject nodes neither asked nor closed, purpose, scope, adjacent, journey, behaviour, security, performance, operations, verification and constraints",
      );
      expect(refused.err).toContain(`; ${RULE}, greenline's harness hook`);
    });

    it("refuses it while the whole frame's restatement has not been put, then while it was put and is unanswered", () => {
      const space = framed(harness);
      expect(writeCode(space, harness).err).toContain(
        "the frame is whole and its restatement has not been put to the owner: put it to them, by a card or in the reply that ends your turn, and wait for their words",
      );
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      writeRecord(space, harness, recordText("careful", WHOLE_FRAME));
      expect(writeCode(space, harness).err).toContain(
        "the restatement was put to the owner and they have not answered",
      );
    });

    it("refuses a confirmed line quoting words said before the ask, the answer to the proposal and an interview answer", () => {
      const space = framed(harness);
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      for (const words of [CAREFUL, ROUND]) {
        writeRecord(space, harness, recordText("careful", WHOLE_FRAME, words));
        expect(writeCode(space, harness).err).toContain(
          `the confirmed line quotes "${words}", said before the restatement was put to the owner`,
        );
      }
    });

    it("admits the code once the owner's words after the ask stand in the confirmed line, and git's pre-commit takes it", () => {
      const space = framed(harness);
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(space, harness, CONFIRM);
      writeRecord(space, harness, recordText("careful", WHOLE_FRAME, CONFIRM));
      expect(writeCode(space, harness).code).toBe(0);
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", RECORD, "src/shelf.js");
      expect(preCommit(space)).toEqual({ code: 0, err: "" });
    });

    it("lets git's pre-commit take the homes alone before the confirmation, and refuses a staged code path beside them", () => {
      const space = framed(harness);
      space.git("add", "--", RECORD);
      expect(preCommit(space)).toEqual({ code: 0, err: "" });
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", "src/shelf.js");
      const refused = preCommit(space);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        "at careful nothing outside the change's homes is committed before the owner confirms the frame: the commit stages src/shelf.js, outside .greenline/ledger/, and the frame is whole and its restatement has not been put to the owner",
      );
      expect(refused.err).toContain(`; ${RULE}`);
    });

    it("refuses at git's pre-commit a confirmed line said before the ask, on a commit of the homes alone", () => {
      const space = framed(harness);
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      space.write(RECORD, recordText("careful", WHOLE_FRAME, CAREFUL));
      space.git("add", "--", RECORD);
      const refused = preCommit(space);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `the change waits for the owner's confirmation of the frame: the confirmed line quotes "${CAREFUL}", said before the restatement was put to the owner`,
      );
    });

    it("holds nothing at regular: the code goes on after the owner's choice, frame or none", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, "Use regular.");
      writeRecord(space, harness, recordText("regular", LOANS_FRAME));
      expect(writeCode(space, harness).code).toBe(0);
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", RECORD, "src/shelf.js");
      expect(preCommit(space)).toEqual({ code: 0, err: "" });
    });
  },
);

describe("J-223 S1 the ask noted at a question tool's call, a card answered in the same turn counted", () => {
  it("notes the ask on Claude Code's question card before its answers are journaled, so its answer confirms", () => {
    const space = framed("claude-code");
    const card = fire(space, "claude-code", {
      hook_event_name: "PostToolUse",
      session_id: SESSION,
      tool_name: "AskUserQuestion",
      tool_use_id: "toolu_confirm",
      tool_input: {
        questions: [
          {
            header: "frame",
            question: "Here's what I now think you want: ... Is that right?",
            options: [
              { label: "Yes (Recommended)", description: "The restatement holds." },
              { label: "Refine", description: "Something is off." },
            ],
          },
        ],
      },
      tool_response: {
        answers: { "Here's what I now think you want: ... Is that right?": "Yes, that is it" },
      },
    });
    expect(card.code).toBe(0);
    writeRecord(space, "claude-code", recordText("careful", WHOLE_FRAME, "Yes, that is it"));
    expect(writeCode(space, "claude-code").code).toBe(0);
  });

  it("notes no ask while the frame is not whole, so a card's answer then never confirms", () => {
    const space = framed("claude-code", LOANS_FRAME);
    fire(space, "claude-code", {
      hook_event_name: "PostToolUse",
      session_id: SESSION,
      tool_name: "AskUserQuestion",
      tool_use_id: "toolu_round",
      tool_input: { questions: [{ header: "scope", question: "Open loans alone?", options: [] }] },
      tool_response: { answers: { "Open loans alone?": "Yes" } },
    });
    writeRecord(space, "claude-code", recordText("careful", WHOLE_FRAME, "Yes"));
    expect(writeCode(space, "claude-code").err).toContain(
      'the confirmed line quotes "Yes", said before the restatement was put to the owner',
    );
  });
});

describe("J-223 S1 status names the careful frame's gaps while the record is open", () => {
  it("names the nodes not covered as the record-form notice, and none once the frame is whole", () => {
    const status = (where: Space): string => {
      const writer = new RecordingWriter();
      runCli(["status", "--change", ID], writer.writer, "0.0.0-test", {
        cwd: where.root,
        version: "0.0.0-test",
        installation: fixtureInstallation(),
      });
      return `${writer.out}${writer.err}`;
    };
    const space = framed("codex", LOANS_FRAME);
    expect(status(space)).toContain(
      `correct the open change '${ID}''s record before done, which git's hooks refuse while it stands: the careful frame leaves 10 of the 12 subject nodes neither asked nor closed`,
    );
    writeRecord(space, "codex", recordText("careful", WHOLE_FRAME));
    expect(status(space)).not.toContain("the careful frame leaves");
  });
});

/** A setup commit the test makes past the hooks, as the owner's own terminal would. */
const commitAll = (where: Space, message: string, ...paths: string[]): void => {
  where.git("add", "--", ...paths);
  where.git("commit", "--quiet", "--no-verify", "-m", `${message}\n\nGreenline-Change: ${ID}`);
};

describe.each(["claude-code", "codex"])(
  "J-223 S1 correction C1: a careful record that does not parse holds the doors, on %s",
  (harness) => {
    const unparsed: readonly (readonly [string, string])[] = [
      [
        "its why still the skeleton's placeholder",
        recordText("careful", WHOLE_FRAME).replace(
          'why: "Give the finance office a CSV of open loans for month-end close."',
          'why: "<why the change exists, in one line>"',
        ),
      ],
      [
        "an empty confirmed line",
        recordText("careful", WHOLE_FRAME).replace("state: open", 'state: open\nconfirmed: ""'),
      ],
      ["a heading repeated", `${recordText("careful", WHOLE_FRAME)}\n## frame\n\nagain\n`],
    ];

    it.each(unparsed)(
      "refuses a write outside the homes over %s, in the parser's words",
      (_what, text) => {
        const space = framed(harness);
        end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
        ask(space, harness, CONFIRM);
        writeRecord(space, harness, text);
        const refused = writeCode(space, harness);
        expect(refused.code).not.toBe(0);
        expect(refused.err).toContain(
          "the frame is not whole: the careful record does not parse, so its frame cannot be read: ",
        );
        expect(refused.err).toContain(`; ${RULE}, greenline's harness hook`);
      },
    );

    it("refuses at git's pre-commit a staged code path beside a careful record that does not parse", () => {
      const space = framed(harness);
      const [, text = ""] = unparsed[0] ?? [];
      space.write(RECORD, text);
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", RECORD, "src/shelf.js");
      const refused = preCommit(space);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        "the careful record does not parse, so its frame cannot be read",
      );
    });

    it("leaves a regular record that does not parse to the doors that read it, never this rule", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, "Use regular.");
      writeRecord(
        space,
        harness,
        recordText("regular", LOANS_FRAME).replace(
          'why: "Give the finance office a CSV of open loans for month-end close."',
          'why: "<why the change exists, in one line>"',
        ),
      );
      expect(writeCode(space, harness).err).not.toContain(RULE);
    });
  },
);

describe("J-223 S1 correction C2: a confirmed line is judged in a merge", () => {
  /** The change's branch with its whole careful record committed and main moved on since. */
  function diverged(): Space {
    const space = framed("claude-code");
    commitAll(space, "the record", RECORD);
    space.git("checkout", "--quiet", "main");
    space.write("README.md", "The shelf.\n");
    space.git("add", "README.md");
    space.git("commit", "--quiet", "--no-verify", "-m", "readme");
    space.git("checkout", "--quiet", `greenline/${ID}`);
    return space;
  }

  it("refuses a confirmed line written into the record during a merge of the base, the words said before the ask", () => {
    const space = diverged();
    end(space, "claude-code", "Here's what I now think you want: ... Yes / no / refine?");
    space.git("merge", "--quiet", "--no-ff", "--no-commit", "main");
    space.write(RECORD, recordText("careful", WHOLE_FRAME, CAREFUL));
    space.git("add", "--", RECORD);
    const refused = preCommit(space);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      `the change waits for the owner's confirmation of the frame: the confirmed line quotes "${CAREFUL}", said before the restatement was put to the owner`,
    );
  });

  it("lets a merge through that brings the record with the line the merged commit carries", () => {
    const space = diverged();
    space.git("checkout", "--quiet", "-b", "confirmed-side");
    space.write(RECORD, recordText("careful", WHOLE_FRAME, CONFIRM));
    commitAll(space, "the confirmation", RECORD);
    space.git("checkout", "--quiet", `greenline/${ID}`);
    space.git("merge", "--quiet", "--no-ff", "--no-commit", "confirmed-side");
    expect(preCommit(space)).toEqual({ code: 0, err: "" });
  });

  it("lets a merge of the base through with no confirmed line staged, as before", () => {
    const space = diverged();
    space.git("merge", "--quiet", "--no-ff", "--no-commit", "main");
    expect(preCommit(space)).toEqual({ code: 0, err: "" });
  });
});

describe.each(["claude-code", "codex"])(
  "J-223 S1 correction C3: the ask noted for a change on a worktree ground, on %s",
  (harness) => {
    const WT = `.worktrees/${ID}`;

    /** The main checkout the session runs in, and the change's worktree of its own. */
    interface Grounded {
      readonly main: Space;
      readonly work: Space;
    }

    /** The change on a worktree of its own, the session in the main checkout on main; quiet, its record laid with no tool of the session's. */
    function grounded(quiet = false): Grounded {
      const main = sandbox();
      main.git("checkout", "--quiet", "main");
      main.write(".git/info/exclude", ".worktrees/\n");
      main.git("worktree", "add", "--quiet", WT, `greenline/${ID}`);
      const work: Space = {
        ...main,
        root: join(main.root, WT),
        write: (path: string, text: string): void => {
          mkdirSync(join(main.root, WT, path, ".."), { recursive: true });
          writeFileSync(join(main.root, WT, path), text);
        },
      };
      ask(main, harness, REQUEST);
      ask(main, harness, CAREFUL);
      const text = recordText("careful", WHOLE_FRAME);
      if (!quiet) expect(beforeWrite(main, harness, `${WT}/${RECORD}`, text).code).toBe(0);
      work.write(RECORD, text);
      return { main, work };
    }

    const workCode = (main: Space) =>
      beforeWrite(main, harness, `${WT}/src/shelf.js`, "export class Shelf { loansCsv() {} }\n");

    it("refuses the worktree's code before the owner's words after the ask, and opens it after", () => {
      const { main, work } = grounded();
      expect(workCode(main).err).toContain("its restatement has not been put to the owner");
      end(main, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(main, harness, CONFIRM);
      const text = recordText("careful", WHOLE_FRAME, CONFIRM);
      expect(beforeWrite(main, harness, `${WT}/${RECORD}`, text).code).toBe(0);
      work.write(RECORD, text);
      expect(workCode(main).code).toBe(0);
    });

    it("keeps one change's ask beside another's in the session's note", () => {
      const { main, work } = grounded();
      end(main, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(main, harness, CONFIRM);
      // A second careful change on the main checkout's own branch, its frame whole too, its ask noted after the owner's words.
      const OTHER = "2026-11-10-overdue-fines";
      main.git("checkout", "--quiet", "-b", `greenline/${OTHER}`);
      main.write(`.greenline/ledger/${OTHER}.md`, recordText("careful", WHOLE_FRAME));
      end(main, harness, "Here's what I now think you want for the fines: ...");
      // The worktree's change keeps its own ask, so the words said after it still confirm it.
      const text = recordText("careful", WHOLE_FRAME, CONFIRM);
      expect(beforeWrite(main, harness, `${WT}/${RECORD}`, text).code).toBe(0);
      work.write(RECORD, text);
      expect(workCode(main).code).toBe(0);
    });

    /** The owner's yes later in the session, quoted in the worktree's record, then its code. */
    const confirmedThenCode = (main: Space, work: Space) => {
      ask(main, harness, CONFIRM);
      const text = recordText("careful", WHOLE_FRAME, CONFIRM);
      expect(beforeWrite(main, harness, `${WT}/${RECORD}`, text).code).toBe(0);
      work.write(RECORD, text);
      return workCode(main);
    };

    it("C3b notes no ask for a session that only read a file in the worktree", () => {
      const { main, work } = grounded(true);
      // Claude Code reads with its read tool, Codex with a command run in the worktree's directory.
      fire(
        main,
        harness,
        harness === "codex"
          ? {
              hook_event_name: "PreToolUse",
              session_id: SESSION,
              tool_use_id: "call_r",
              tool_name: "Bash",
              tool_input: { command: `cd ${WT} && cat src/shelf.js` },
            }
          : {
              hook_event_name: "PreToolUse",
              session_id: SESSION,
              tool_use_id: "toolu_r",
              tool_name: "Read",
              tool_input: { file_path: join(main.root, WT, "src/shelf.js") },
            },
      );
      end(main, harness, "The shelf holds one class.");
      expect(confirmedThenCode(main, work).err).toContain(
        `the confirmed line quotes "${CONFIRM}", said before the restatement was put to the owner`,
      );
    });

    it("C3b notes no ask for a session whose command only names the change", () => {
      const { main, work } = grounded(true);
      fire(main, harness, {
        hook_event_name: "PreToolUse",
        session_id: SESSION,
        tool_use_id: "toolu_s",
        tool_name: "Bash",
        tool_input: { command: `greenline status --change ${ID}` },
      });
      end(main, harness, "The branch holds one commit.");
      expect(confirmedThenCode(main, work).err).toContain(
        `the confirmed line quotes "${CONFIRM}", said before the restatement was put to the owner`,
      );
    });

    it("C3b notes the ask for a session whose write in the worktree was refused", () => {
      const { main, work } = grounded(true);
      expect(workCode(main).code).not.toBe(0);
      end(main, harness, "Here's what I now think you want: ... Yes / no / refine?");
      expect(confirmedThenCode(main, work).code).toBe(0);
    });

    it("C3b notes the ask for a session whose shell command writes in the worktree", () => {
      const { main, work } = grounded(true);
      fire(main, harness, {
        hook_event_name: "PreToolUse",
        session_id: SESSION,
        tool_use_id: "toolu_w2",
        tool_name: "Bash",
        tool_input: { command: `echo note > ${WT}/notes.txt` },
      });
      end(main, harness, "Here's what I now think you want: ... Yes / no / refine?");
      expect(confirmedThenCode(main, work).code).toBe(0);
    });
  },
);

describe.each(["claude-code", "codex"])(
  "J-223 S1 correction C4: a ticket's frame is its planning change's, on %s",
  (harness) => {
    const TICKET = "2026-11-10-loans-export-t1";
    const PLAN_LINE = "plan: 001-loans";
    const planning = (confirmed?: string): string =>
      recordText("careful", WHOLE_FRAME, confirmed).replace(
        "state: open",
        `state: open\n${PLAN_LINE}`,
      );
    const ticket = [
      "---",
      "mode: careful",
      "choice: owner",
      'why: "Export the open loans as CSV, the plan\'s first ticket."',
      "state: open",
      PLAN_LINE,
      "ticket: T1",
      "---",
      "",
      "## build",
      "",
      "The export's first test.",
      "",
    ].join("\n");
    const ticketRecord = `.greenline/ledger/${TICKET}.md`;

    function planned(confirm: boolean): Space {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      writeRecord(space, harness, planning());
      if (confirm) {
        end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
        ask(space, harness, CONFIRM);
        writeRecord(space, harness, planning(CONFIRM));
        commitAll(space, "the planning change's confirmed frame", RECORD);
      }
      ask(space, harness, "Open the first ticket.");
      expect(beforeWrite(space, harness, ticketRecord, ticket).code).toBe(0);
      space.write(ticketRecord, ticket);
      return space;
    }

    it("opens the ticket's writes and commits on its planning change's confirmed frame, no confirmation of its own", () => {
      const space = planned(true);
      expect(writeCode(space, harness).code).toBe(0);
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", ticketRecord, "src/shelf.js");
      expect(preCommit(space)).toEqual({ code: 0, err: "" });
    });

    it("refuses the ticket's code while its planning change's frame is not confirmed, naming that record", () => {
      const space = planned(false);
      const refused = writeCode(space, harness);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `the frame is its planning change's, .greenline/ledger/${ID}.md, and the frame is whole and its restatement has not been put to the owner`,
      );
    });
  },
);

describe.each(["claude-code", "codex"])(
  "J-223 S1 correction 2, C4: a ticket's frame with no door left open, on %s",
  (harness) => {
    const TICKET = "2026-11-10-loans-export-t1";
    const TICKET_RECORD = `.greenline/ledger/${TICKET}.md`;
    const PLAN_LINE = "plan: 001-loans";
    const withLines = (text: string, ...lines: string[]): string =>
      text.replace("state: open", ["state: open", ...lines].join("\n"));
    const ticketOf = (mode: string): string =>
      [
        "---",
        `mode: ${mode}`,
        "choice: owner",
        'why: "Export the open loans as CSV, the plan\'s first ticket."',
        "state: open",
        PLAN_LINE,
        "ticket: T1",
        "---",
        "",
        "## build",
        "",
        "The export's first test.",
        "",
      ].join("\n");
    const laid = (space: Space, path: string, text: string): void => {
      expect(beforeWrite(space, harness, path, text).code).toBe(0);
      space.write(path, text);
    };
    const codeCommit = (space: Space, ...records: string[]) => {
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", ...records, "src/shelf.js");
      return preCommit(space);
    };

    it("input 1: holds a careful record that names a plan no record leads, naming the cure at both doors", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, withLines(recordText("careful", LOANS_FRAME), PLAN_LINE, "ticket: T9"));
      const refused = writeCode(space, harness);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain("the ticket's planning change is not found");
      expect(refused.err).toContain(
        `write the plan line on the planning change's record, or take the plan and ticket lines out of ${RECORD} so the change owes its own frame`,
      );
      expect(codeCommit(space, RECORD).err).toContain("the ticket's planning change is not found");
      // The second cure: the lines out, the change owes its own frame.
      laid(space, RECORD, recordText("careful", LOANS_FRAME));
      expect(writeCode(space, harness).err).toContain(
        "the frame is not whole: the careful frame leaves",
      );
    });

    it("input 1, the first cure: the plan line on a confirmed careful planning record opens the ticket", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, withLines(recordText("careful", WHOLE_FRAME), PLAN_LINE));
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(space, harness, CONFIRM);
      laid(space, RECORD, withLines(recordText("careful", WHOLE_FRAME, CONFIRM), PLAN_LINE));
      commitAll(space, "the planning change's confirmed frame", RECORD);
      laid(space, TICKET_RECORD, ticketOf("careful"));
      expect(writeCode(space, harness).code).toBe(0);
      expect(codeCommit(space, TICKET_RECORD)).toEqual({ code: 0, err: "" });
    });

    it("input 2: refuses a confirmed line staged on a careful ticket's record, and never settles one HEAD carried beside a ticket line", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      const lined = withLines(recordText("careful", WHOLE_FRAME, CAREFUL), PLAN_LINE, "ticket: T9");
      space.write(RECORD, lined);
      space.git("add", "--", RECORD);
      expect(preCommit(space).err).toContain(
        "a ticket's record holds no confirmed line: its frame is its planning change's",
      );
      space.git("commit", "--quiet", "--no-verify", "-m", `the record\n\nGreenline-Change: ${ID}`);
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      space.write(RECORD, recordText("careful", WHOLE_FRAME, CAREFUL));
      space.git("add", "--", RECORD);
      expect(preCommit(space).err).toContain(
        `the confirmed line quotes "${CAREFUL}", said before the restatement was put to the owner`,
      );
    });

    it("input 3: a stand-in planning record that names no plan holds a ticket of any mode while it is careful and unconfirmed", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, recordText("careful", WHOLE_FRAME));
      laid(space, TICKET_RECORD, ticketOf("regular"));
      const refused = writeCode(space, harness);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(`the frame is its planning change's, ${RECORD}, and`);
      expect(codeCommit(space, TICKET_RECORD).err).toContain(
        `the frame is its planning change's, ${RECORD}`,
      );
    });

    it("input 3, a stand-in never opens: a careful ticket under a confirmed stand-in is held as not found", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, recordText("careful", WHOLE_FRAME));
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(space, harness, CONFIRM);
      laid(space, RECORD, recordText("careful", WHOLE_FRAME, CONFIRM));
      laid(space, TICKET_RECORD, ticketOf("careful"));
      expect(writeCode(space, harness).err).toContain("the ticket's planning change is not found");
    });

    it("input 4: of two records that name the plan, an unconfirmed careful one holds, named", () => {
      const space = sandbox();
      const SECOND = "2026-11-10-zz-loans-plan";
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, withLines(recordText("regular", WHOLE_FRAME), PLAN_LINE));
      laid(
        space,
        `.greenline/ledger/${SECOND}.md`,
        withLines(recordText("careful", WHOLE_FRAME), PLAN_LINE),
      );
      laid(space, TICKET_RECORD, ticketOf("careful"));
      const refused = writeCode(space, harness);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `the frame is its planning change's, .greenline/ledger/${SECOND}.md, and`,
      );
      expect(codeCommit(space, TICKET_RECORD).err).toContain(`.greenline/ledger/${SECOND}.md`);
    });

    it("input 5 (correction 3): a dropped planning record that is careful and unconfirmed holds the ticket by name, with the cure", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(
        space,
        RECORD,
        withLines(recordText("careful", WHOLE_FRAME), PLAN_LINE)
          .replace("state: open", "state: dropped")
          .replace(/next: .*\n/, "next: none\n"),
      );
      laid(space, TICKET_RECORD, ticketOf("careful"));
      const cure = `which is dropped and holds no confirmation: take the plan and ticket lines out of ${TICKET_RECORD} so the change owes its own frame`;
      expect(writeCode(space, harness).err).toContain(
        `the frame is its planning change's, ${RECORD}, ${cure}`,
      );
      expect(codeCommit(space, TICKET_RECORD).err).toContain(cure);
    });

    it("input 5 (correction 3): a dropped planning record that is confirmed leaves a careful ticket held as not found", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, withLines(recordText("careful", WHOLE_FRAME), PLAN_LINE));
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(space, harness, CONFIRM);
      laid(
        space,
        RECORD,
        withLines(recordText("careful", WHOLE_FRAME, CONFIRM), PLAN_LINE)
          .replace("state: open", "state: dropped")
          .replace(/next: .*\n/, "next: none\n"),
      );
      laid(space, TICKET_RECORD, ticketOf("careful"));
      expect(writeCode(space, harness).err).toContain("the ticket's planning change is not found");
      expect(codeCommit(space, TICKET_RECORD).err).toContain(
        "the ticket's planning change is not found",
      );
    });

    it("what stays: a ticket below careful whose plan only a dropped record below careful names is a change at its own mode", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, "Use regular.");
      laid(
        space,
        RECORD,
        withLines(recordText("regular", WHOLE_FRAME), PLAN_LINE)
          .replace("state: open", "state: dropped")
          .replace(/next: .*\n/, "next: none\n"),
      );
      laid(space, TICKET_RECORD, ticketOf("regular"));
      expect(writeCode(space, harness).err).not.toContain(RULE);
    });
  },
);

describe.each(["claude-code", "codex"])(
  "J-223 S1 correction 3, F1 and F2: a dropped state opens nothing, and the commit reads what it carries, on %s",
  (harness) => {
    const TICKET = "2026-11-10-loans-export-t1";
    const TICKET_RECORD = `.greenline/ledger/${TICKET}.md`;
    const PLAN_LINE = "plan: 001-loans";
    const DROPPED = "the change is dropped and its frame was never confirmed";
    const dropped = (text: string): string =>
      text.replace("state: open", "state: dropped").replace(/next: .*\n/, "next: none\n");
    const withPlan = (text: string): string =>
      text.replace("state: open", `state: open\n${PLAN_LINE}`);
    const ticketOf = (mode: string): string =>
      [
        "---",
        `mode: ${mode}`,
        "choice: owner",
        'why: "Export the open loans as CSV, the plan\'s first ticket."',
        "state: open",
        PLAN_LINE,
        "ticket: T1",
        "---",
        "",
        "## build",
        "",
        "The export's first test.",
        "",
      ].join("\n");
    const laid = (space: Space, path: string, text: string): void => {
      expect(beforeWrite(space, harness, path, text).code).toBe(0);
      space.write(path, text);
    };
    const codeCommit = (space: Space, ...records: string[]) => {
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", ...records, "src/shelf.js");
      return preCommit(space);
    };

    it("F1 inputs 1 and 2: a careful record set dropped before its confirmation is refused a write and a commit outside the homes, the cure a record-alone commit", () => {
      const space = framed(harness);
      laid(space, RECORD, dropped(recordText("careful", WHOLE_FRAME)));
      const refused = writeCode(space, harness);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(DROPPED);
      expect(refused.err).toContain("make the other work a new change");
      expect(refused.err).not.toContain("put it to them");
      expect(codeCommit(space, RECORD).err).toContain(DROPPED);
    });

    it("F1 input 3: a confirmed line said before the ask, staged on a dropped record, is refused; the drop alone passes", () => {
      const space = framed(harness);
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      space.write(RECORD, dropped(recordText("careful", WHOLE_FRAME, CAREFUL)));
      space.git("add", "--", RECORD);
      const refused = preCommit(space);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        `the change is dropped and its confirmed line quotes "${CAREFUL}"`,
      );
      space.write(RECORD, dropped(recordText("careful", WHOLE_FRAME)));
      space.git("add", "--", RECORD);
      expect(preCommit(space)).toEqual({ code: 0, err: "" });
    });

    it("F1: a careful change dropped after its confirmation writes and commits its taken-back code", () => {
      const space = framed(harness);
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(space, harness, CONFIRM);
      writeRecord(space, harness, recordText("careful", WHOLE_FRAME, CONFIRM));
      commitAll(space, "the confirmed frame", RECORD);
      laid(space, RECORD, dropped(recordText("careful", WHOLE_FRAME, CONFIRM)));
      expect(writeCode(space, harness).code).toBe(0);
      expect(codeCommit(space, RECORD)).toEqual({ code: 0, err: "" });
    });

    it.each(["regular", "careful"])(
      "F1 input 4: a dropped careful planning record with no confirmation holds a %s ticket, naming the cure",
      (mode) => {
        const space = sandbox();
        ask(space, harness, REQUEST);
        ask(space, harness, CAREFUL);
        laid(space, RECORD, dropped(withPlan(recordText("careful", WHOLE_FRAME))));
        laid(space, TICKET_RECORD, ticketOf(mode));
        const cure = `take the plan and ticket lines out of ${TICKET_RECORD} so the change owes its own frame`;
        const refused = writeCode(space, harness);
        expect(refused.code).not.toBe(0);
        expect(refused.err).toContain(cure);
        expect(codeCommit(space, TICKET_RECORD).err).toContain(cure);
      },
    );

    /** A careful planning change, unconfirmed, and its ticket, both staged beside the code. */
    function stagedTicket(): Space {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, withPlan(recordText("careful", WHOLE_FRAME)));
      laid(space, TICKET_RECORD, ticketOf("regular"));
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", RECORD, TICKET_RECORD, "src/shelf.js");
      return space;
    }

    it("F2: the commit reads the ticket's record from the index when its working copy is deleted, saying so", () => {
      const space = stagedTicket();
      rmSync(join(space.root, TICKET_RECORD));
      const refused = preCommit(space);
      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(`the frame is its planning change's, ${RECORD}`);
      expect(refused.err).toContain("the records are read as the commit carries them");
    });

    it("F2: the commit reads the ticket's record from the index when its working copy is set dropped", () => {
      const space = stagedTicket();
      space.write(TICKET_RECORD, dropped(ticketOf("regular")));
      expect(preCommit(space).err).toContain(`the frame is its planning change's, ${RECORD}`);
    });

    it("F2: the commit reads the planning record from the index when its working copy is deleted", () => {
      const space = stagedTicket();
      rmSync(join(space.root, RECORD));
      expect(preCommit(space).err).toContain(`the frame is its planning change's, ${RECORD}`);
    });

    it("F2: the commit reads the planning record from the index when its working copy holds an unstaged confirmed line", () => {
      const space = stagedTicket();
      space.write(RECORD, withPlan(recordText("careful", WHOLE_FRAME, CONFIRM)));
      expect(preCommit(space).err).toContain(`the frame is its planning change's, ${RECORD}`);
    });

    it("F2, the reverse: a planning record staged with a held confirmation lets the ticket's commit through over an older working copy", () => {
      const space = sandbox();
      ask(space, harness, REQUEST);
      ask(space, harness, CAREFUL);
      laid(space, RECORD, withPlan(recordText("careful", WHOLE_FRAME)));
      laid(space, TICKET_RECORD, ticketOf("regular"));
      end(space, harness, "Here's what I now think you want: ... Yes / no / refine?");
      ask(space, harness, CONFIRM);
      space.write(RECORD, withPlan(recordText("careful", WHOLE_FRAME, CONFIRM)));
      space.write("src/shelf.js", "export class Shelf { loansCsv() {} }\n");
      space.git("add", "--", RECORD, TICKET_RECORD, "src/shelf.js");
      space.write(RECORD, withPlan(recordText("careful", WHOLE_FRAME)));
      expect(preCommit(space)).toEqual({ code: 0, err: "" });
    });
  },
);
