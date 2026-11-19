/**
 * The doors the agent's record and the visual home go through (J-176 S1;
 * the register's rows of 2026-11-05, "The keeper over the oracle" and "The
 * record's lines are the agent's"): `greenline open` writes the record's
 * skeleton with every line its mode owes and a placeholder in each, which
 * the lint refuses at done until the agent writes them; `greenline picture
 * keep` is the one door into a change's folder of the visual home, on the
 * owner's ask and after their yes; `greenline research report` files a
 * research report for an accepted topic. Each on a real repository, a
 * refusal writing nothing.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ok } from "../../src/commons/result.ts";
import type { JsonValue } from "../../src/core/contract.ts";
import { NO_REMAKE_OFFER, parseVisualManifest } from "../../src/core/visuals.ts";
import { recordBreaches } from "../../src/core/record-lint.ts";
import { lackingLine, recordLack } from "../../src/core/record-lines.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runOpenCli } from "../../src/shell/cli/open.ts";
import { runPictureCli } from "../../src/shell/cli/picture.ts";
import { runResearchCli } from "../../src/shell/cli/research.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { journalOwner } from "../../src/shell/owner-words.ts";
import { brieflessVisuals, sessionMadeVisuals, writeChangeLinks } from "../../src/shell/visuals.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const installation = fixtureInstallation();
const ID = "2026-11-06-overdue-letters";
const RECORD = `.greenline/ledger/${ID}.md`;
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A workspace on git with one commit, its manifest naming interface roots or none. */
function workspace(interfaceRoots = false): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-doors-"));
  cleanup.push(root);
  const git = (...args: string[]): void => {
    execFileSync("git", ["-c", "user.name=D", "-c", "user.email=d@example.com", ...args], {
      cwd: root,
      stdio: "ignore",
    });
  };
  git("init", "--quiet", "-b", "main");
  mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "letters.ts"), "export {};\n");
  writeFileSync(
    join(root, ".greenline", "manifest.json"),
    JSON.stringify(
      interfaceRoots
        ? {
            schemaVersion: 6,
            targets: ["claude-code"],
            checks: [],
            interface: { roots: ["src"], extensions: ["tsx"], platform: "web" },
          }
        : { schemaVersion: 6, targets: ["claude-code"], checks: [] },
    ),
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "start");
  return root;
}

function run(
  verb: (argv: readonly string[], writer: RecordingWriter["writer"], cwd: string) => number,
  root: string,
  argv: readonly string[],
) {
  const writer = new RecordingWriter();
  const code = verb(argv, writer.writer, root);
  return { code, out: writer.out, err: writer.err };
}

const open = (root: string, argv: readonly string[]) =>
  run(
    (args, writer, cwd) => runOpenCli(args, writer, { cwd, installation: () => ok(installation) }),
    root,
    argv,
  );
const picture = (root: string, argv: readonly string[]) =>
  run(
    (args, writer, cwd) =>
      runPictureCli(args, writer, { cwd, now: () => new Date("2026-11-06T10:00:00.000Z") }),
    root,
    argv,
  );
const research = (root: string, argv: readonly string[]) => run(runResearchCli, root, argv);

describe("J-176 S1 greenline open writes the record's skeleton, every line the agent's", () => {
  it("writes the skeleton of the mode, every owed line named with a placeholder, and prints its path", () => {
    const root = workspace();
    const opened = open(root, ["--change", ID, "--mode", "regular"]);
    expect(opened.code).toBe(0);
    expect(opened.out).toBe(`${RECORD}\n`);
    expect(opened.err).toContain("replace each placeholder in your own words");
    const text = readFileSync(join(root, RECORD), "utf8");
    expect(text.startsWith('---\nmode: regular\nchoice: "<owner, accepted or standing>"\n')).toBe(
      true,
    );
    // A workspace with no interface roots owes no interface line.
    expect(text).not.toContain("interface:");
    const lack = recordLack(installation.modes, text);
    expect(lack === undefined ? undefined : lackingLine(lack)).toBe(
      "record lacks: choice, why, floors, ground and agent now; skills, agents, rounds, starts and outcome by the close; the start, frame, plan, build, review, verify and close sections at their placeholders; write each in your own words for its meaning; for floors, write floors: none, or the floors you found as a list, as [security]",
    );
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });

  it("names the interface line where the workspace names interface roots", () => {
    const root = workspace(true);
    expect(open(root, ["--change", ID, "--mode", "quick"]).code).toBe(0);
    expect(readFileSync(join(root, RECORD), "utf8")).toContain(
      'interface: "<no, or yes, site or app>"',
    );
  });

  it("refuses a record that stands, a mode the definition lacks and an id that is no change's, writing nothing", () => {
    const root = workspace();
    expect(open(root, ["--change", ID, "--mode", "brisk"]).err).toContain(
      "'brisk' is no mode; the modes are quick, regular, careful",
    );
    expect(open(root, ["--change", "overdue", "--mode", "quick"]).code).toBe(2);
    expect(existsSync(join(root, RECORD))).toBe(false);
    writeFileSync(join(root, RECORD), "kept\n");
    const again = open(root, ["--change", ID, "--mode", "quick"]);
    expect(again.code).toBe(2);
    expect(again.err).toContain("already stands, and a record is never written over");
    expect(readFileSync(join(root, RECORD), "utf8")).toBe("kept\n");
  });

  it("leaves a record whose placeholders stand refused at done, red until every line is the agent's", () => {
    const root = workspace();
    open(root, ["--change", ID, "--mode", "quick"]);
    const skeleton = readFileSync(join(root, RECORD), "utf8");
    const done = skeleton
      .replace('choice: "<owner, accepted or standing>"', "choice: owner")
      .replace(/^yes: .*\n/m, "")
      .replace(/^why: .*$/m, 'why: "the overdue letters"')
      .replace("state: open", "state: done")
      .replace(/^next: .*$/m, "next: none");
    const breaches = recordBreaches({
      id: ID,
      text: done,
      definition: installation.modes,
    }).filter((breach) => breach.rule === "lines");
    expect(breaches[0]?.message).toBe(
      "the done record lacks its floors line: write floors: none, or the floors you found as a list, as [security]; a record opened before this version adds the line by hand",
    );
    expect(breaches[1]?.message).toBe(
      "the done record lacks its ground, agent, skills and outcome lines: write each in your own words for its meaning, as the ledger guide's front matter gives it",
    );
    expect(
      breaches.some((breach) => breach.message.startsWith("the frame section still holds")),
    ).toBe(true);
  });
});

/** Open the change and give its record the owner's yes, as the agent writes it. */
function yesGiven(root: string, words = "Yes, go ahead."): void {
  writeFileSync(
    join(root, RECORD),
    [
      "---",
      "mode: quick",
      "choice: accepted",
      `yes: "${words}"`,
      'why: "the overdue letters"',
      "state: open",
      "---",
      "",
      "## frame",
      "",
      "the letters",
      "",
    ].join("\n"),
  );
}

const KEEP = [
  "keep",
  `.greenline/tmp/${ID}/flow.svg`,
  "--change",
  ID,
  "--ask",
  "Keep the flow diagram of the letters.",
  "--title",
  "How a letter goes out",
  "--form",
  "flow",
  "--skill",
  "show-me",
  "--summary",
  "The overdue letter's path from the loan to the post, for the reviewer.",
  "--files",
  "src/letters.ts",
];

/** A drawn picture under the change's working folder. */
function drawn(root: string): void {
  mkdirSync(join(root, ".greenline", "tmp", ID), { recursive: true });
  writeFileSync(join(root, ".greenline", "tmp", ID, "flow.svg"), "<svg></svg>\n");
}

describe("J-176 S1 greenline picture keep, the one door into the visual home", () => {
  it("keeps the picture with its manifest together, the words the agent's and the commit and date stamped", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    journalOwner(root, "s1", ["Keep the flow diagram of the letters."], "2026-11-06T10:00:00.000Z");
    const kept = picture(root, KEEP);
    expect(kept.err).toContain(`kept ${ID}/flow with its manifest`);
    expect(kept.code).toBe(0);
    expect(kept.out).toBe(`.greenline/visuals/${ID}/flow.svg\n`);
    expect(readFileSync(join(root, ".greenline", "visuals", ID, "flow.svg"), "utf8")).toBe(
      "<svg></svg>\n",
    );
    const manifestPath = `.greenline/visuals/${ID}/flow.visual.json`;
    const manifest = parseVisualManifest(
      readFileSync(join(root, manifestPath), "utf8"),
      manifestPath,
    );
    expect(manifest._tag === "ok" ? manifest.value : undefined).toMatchObject({
      title: "How a letter goes out",
      form: "flow",
      skill: "show-me",
      change: ID,
      files: ["src/letters.ts"],
      made: "2026-11-06",
      // The owner's ask is recorded as the picture's reason.
      ask: "Keep the flow diagram of the letters.",
    });
    // A picture that stands is never written over.
    expect(picture(root, KEEP).err).toContain(
      "is never written over: keep the remake under a new slug",
    );
  });

  it("keeps nothing before the owner's yes, nor on words no message of the owner's holds (the pictures scenario's pre-yes)", () => {
    const root = workspace();
    drawn(root);
    const before = picture(root, KEEP);
    expect(before.code).toBe(2);
    expect(before.err).toContain("nothing is kept in the visual home before the owner's yes");
    yesGiven(root);
    journalOwner(root, "s1", ["Add the overdue letters."], "2026-11-06T10:00:00.000Z");
    const unasked = picture(root, KEEP);
    expect(unasked.code).toBe(2);
    expect(unasked.err).toContain("a picture is kept only on the owner's ask");
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });

  it("refuses a file of another kind, a file outside the repository and a covered file its commit does not hold", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    writeFileSync(join(root, ".greenline", "tmp", ID, "check.json"), "{}\n");
    const json = [...KEEP];
    json[1] = `.greenline/tmp/${ID}/check.json`;
    expect(picture(root, json).err).toContain("not a .json file");
    const absent = [...KEEP.slice(0, -1), "src/letters.ts,src/nowhere.ts"];
    expect(picture(root, absent).err).toContain(
      "the picture covers src/nowhere.ts, which the commit HEAD names does not hold",
    );
    expect(
      picture(
        root,
        KEEP.filter((word) => word !== "--skill" && word !== "show-me"),
      ).err,
    ).toContain("--skill is required");
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });
});

describe("J-176 S1 greenline research report files the report of an accepted topic", () => {
  const frame = (accepted: boolean): string =>
    [
      "---",
      "mode: careful",
      "choice: owner",
      'why: "the rates"',
      "state: open",
      "---",
      "",
      "## frame",
      "",
      "- R1 [data] The rates the bank charges",
      "  - source: the web",
      "  - question: which rate applies?",
      "  - changes: the letter's fee",
      ...(accepted ? ['  - accepted: "yes, look it up"'] : []),
      "",
    ].join("\n");

  it("refuses a topic the owner has not accepted, then files the report with the start's mark", () => {
    const root = workspace();
    writeFileSync(join(root, RECORD), frame(false));
    mkdirSync(join(root, ".greenline", "tmp", ID), { recursive: true });
    writeFileSync(join(root, ".greenline", "tmp", ID, "rates.md"), "# The rates\n\nFixed.\n");
    const argv = ["report", `.greenline/tmp/${ID}/rates.md`, "--change", ID, "--topic", "R1"];
    expect(research(root, argv).err).toContain("the owner has not accepted R1");
    writeFileSync(join(root, RECORD), frame(true));
    const filed = research(root, argv);
    expect(filed.code).toBe(0);
    const report = `.greenline/ledger/${ID}/frame-research-1.md`;
    expect(filed.out).toBe(`${report}\n`);
    expect(readFileSync(join(root, report), "utf8")).toBe(
      "<!-- generated by the research start: report 1 -->\n# The rates\n\nFixed.\n",
    );
    expect(research(root, argv).err).toContain("is never written over");
    expect(research(root, ["report", "x.md", "--change", ID, "--topic", "R9"]).err).toContain(
      "the frame section proposes no topic R9",
    );
  });
});

describe("J-192 S1 the keep's ask is the owner's whole ask, and the picture's maker is the agent facts'", () => {
  /** One event through greenline event as Claude Code pipes it, a fresh agent's where an agent id is given. */
  function event(root: string, payload: { readonly [key: string]: JsonValue }): void {
    const writer = new RecordingWriter();
    runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: root,
      stdin: () => JSON.stringify({ session_id: "root-session", cwd: root, ...payload }),
      line: () => installation.modes,
    });
  }

  /** A shell command that draws the picture, its before and after events around the write, by the agent named or the session. */
  function drawnByShell(root: string, agent: string | undefined, call: string): void {
    const command = `mkdir -p .greenline/tmp/${ID}/picture-1 && cat > .greenline/tmp/${ID}/picture-1/path.svg <<'SVG'\n<svg></svg>\nSVG`;
    // A fresh agent's tool carries its agent id; the session's carries none.
    const tool =
      agent === undefined
        ? { tool_name: "Bash", tool_use_id: call, tool_input: { command } }
        : { tool_name: "Bash", tool_use_id: call, tool_input: { command }, agent_id: agent };
    event(root, { hook_event_name: "PreToolUse", ...tool });
    mkdirSync(join(root, ".greenline", "tmp", ID, "picture-1"), { recursive: true });
    writeFileSync(join(root, ".greenline", "tmp", ID, "picture-1", "path.svg"), "<svg></svg>\n");
    event(root, { hook_event_name: "PostToolUse", ...tool });
  }

  const keepPath = (ask: string): readonly string[] => {
    const argv = [...KEEP];
    argv[1] = `.greenline/tmp/${ID}/picture-1/path.svg`;
    argv[argv.indexOf("--ask") + 1] = ask;
    return argv;
  };

  function madeBy(root: string, slug = "path"): string | undefined {
    const path = `.greenline/visuals/${ID}/${slug}.visual.json`;
    const read = parseVisualManifest(readFileSync(join(root, path), "utf8"), path);
    return read._tag === "ok" ? read.value.madeBy : undefined;
  }

  it("records the fresh agent that drew the picture by a shell write as its maker, and status names no GL0604 (j179c-pictures-home finding 3)", () => {
    const root = workspace();
    yesGiven(root);
    journalOwner(
      root,
      "root-session",
      ["Keep a picture of the overdue path."],
      "2026-11-06T10:00:00.000Z",
    );
    drawnByShell(root, "a-fresh-drawer", "draw-1");
    const kept = picture(root, keepPath("Keep a picture of the overdue path."));
    expect(kept.err).toContain("kept");
    expect(kept.code).toBe(0);
    expect(madeBy(root)).toBe("agent");
    expect(sessionMadeVisuals(root)).toEqual([]);
  });

  it("records the session as the maker where no fresh agent drew it, which GL0604 names", () => {
    const root = workspace();
    yesGiven(root);
    journalOwner(
      root,
      "root-session",
      ["Keep a picture of the overdue path."],
      "2026-11-06T10:00:00.000Z",
    );
    drawnByShell(root, undefined, "draw-1");
    expect(picture(root, keepPath("Keep a picture of the overdue path.")).code).toBe(0);
    expect(madeBy(root)).toBe("session");
    expect(sessionMadeVisuals(root).map((visual) => visual.id)).toEqual([`${ID}/path`]);
  });

  it("refuses an ask that is a fragment of the owner's message, naming what a real ask is (the Codex tester's handback)", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    journalOwner(root, "s1", ["Keep one of the loan's states too."], "2026-11-06T10:00:00.000Z");
    const fragment = picture(root, [...KEEP.slice(0, 5), "Keep one", ...KEEP.slice(6)]);
    expect(fragment.code).toBe(2);
    expect(fragment.err).toContain(
      `"Keep one" is a fragment of the owner's message "Keep one of the loan's states too."`,
    );
    expect(fragment.err).toContain(
      "a real ask is the owner's whole message asking for a lasting picture, quoted as they said it",
    );
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });

  it("refuses a question as the ask, which asks for no picture (j109t-pictures-offerc)", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    const question = "And every method of the shelf with who calls it and what it touches?";
    journalOwner(root, "s1", [question], "2026-11-06T10:00:00.000Z");
    const asked = picture(root, [...KEEP.slice(0, 5), question, ...KEEP.slice(6)]);
    expect(asked.code).toBe(2);
    expect(asked.err).toContain(
      `the owner's message "${question}" asks for no picture to keep: answer it inline`,
    );
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });

  it("refuses a keep with no ask, naming what a real ask is", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    const absent = picture(root, [...KEEP.slice(0, 4), ...KEEP.slice(6)]);
    expect(absent.code).toBe(2);
    expect(absent.err).toContain(
      "--ask is required: a real ask is the owner's whole message asking for a lasting picture, quoted as they said it",
    );
  });
});

describe("J-198 S1 the picture's maker where a Codex helper drew it (j196t-conduct-empty finding 2)", () => {
  const HELPER = "01a1b883-1c99-7003-bcd8-bb91135014ed";
  const SESSION = "01a1b87d-cf02-7683-b19d-f4c2be4f6102";
  const PARTS = `.greenline/tmp/${ID}/greeting-parts.svg`;
  const ASK = "Keep one of how the greeting's parts fit together too.";
  const keepCommand = (ask: string): string =>
    `greenline picture keep ${PARTS} --change ${ID} --ask ${ask} --title 'Greeting parts' --form component --skill diagram-design --summary 'Shows how the caller, module, test and instructions fit together.'`;

  /**
   * The events Codex's hooks logged for the parts picture in the run's turn
   * 001/009, as `greenline event` normalised them: the helper's start, its
   * listing, its apply_patch of the picture and its stop, each carrying its
   * agent id; then the session's first keep, refused for its curly
   * apostrophe, which names the file; then the second keep's before-tool,
   * logged as the keep runs.
   */
  function runEvents(root: string): readonly { readonly [key: string]: JsonValue }[] {
    const base = { v: 1, harness: "codex", session: SESSION, cwd: root };
    const shell = (at: string, kind: string, agent: string | null, call: string, text: string) => ({
      ...base,
      at,
      kind,
      native: kind === "before-tool" ? "PreToolUse" : "PostToolUse",
      agent,
      call,
      tool: { name: "Bash", class: "shell" },
      command: { text, dir: null, exit: null, outcome: "unknown", durationMs: null },
      write: null,
    });
    const patch = (at: string, kind: string) => ({
      ...base,
      at,
      kind,
      native: kind === "before-tool" ? "PreToolUse" : "PostToolUse",
      agent: HELPER,
      call: "exec-a136737c-57cf-4846-ac11-fbf6302531bc",
      tool: { name: "apply_patch", class: "write" },
      command: null,
      write: { paths: [PARTS] },
    });
    const listing = `ls -la .greenline/visuals .greenline/tmp/${ID}`;
    const refused = keepCommand("'Keep one of how the greeting’s parts fit together too.'");
    return [
      { ...base, at: "2026-11-08T00:16:04.035Z", kind: "agent-start", agent: HELPER, call: null },
      shell("2026-11-08T00:16:10.397Z", "before-tool", HELPER, "exec-195f", listing),
      shell("2026-11-08T00:16:10.653Z", "after-tool", HELPER, "exec-195f", listing),
      patch("2026-11-08T00:16:21.577Z", "before-tool"),
      patch("2026-11-08T00:16:21.785Z", "after-tool"),
      { ...base, at: "2026-11-08T00:16:27.629Z", kind: "agent-stop", agent: HELPER, call: null },
      shell("2026-11-08T00:16:27.755Z", "before-tool", null, "exec-49dc", refused),
      shell("2026-11-08T00:16:28.139Z", "after-tool", null, "exec-49dc", refused),
      shell("2026-11-08T00:16:30.510Z", "before-tool", null, "exec-fb17", keepCommand(`"${ASK}"`)),
    ];
  }

  function logged(root: string, events: readonly { readonly [key: string]: JsonValue }[]): void {
    mkdirSync(join(root, ".greenline", "tmp", ID), { recursive: true });
    writeFileSync(
      join(root, ".greenline", "tmp", ID, "events.jsonl"),
      events.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
  }

  /** The picture as the helper's apply_patch left it, its time inside that write. */
  function drawnByHelper(root: string): void {
    writeFileSync(join(root, PARTS), "<svg></svg>\n");
    const written = new Date("2026-11-08T00:16:21.700Z");
    utimesSync(join(root, PARTS), written, written);
  }

  const keepParts = (root: string) => {
    const argv = [...KEEP];
    argv[1] = PARTS;
    argv[argv.indexOf("--ask") + 1] = ASK;
    return picture(root, argv);
  };

  function madeByOf(root: string): string | undefined {
    const path = `.greenline/visuals/${ID}/greeting-parts.visual.json`;
    const read = parseVisualManifest(readFileSync(join(root, path), "utf8"), path);
    return read._tag === "ok" ? read.value.madeBy : undefined;
  }

  it("reads the helper's apply_patch, which Codex's hooks log with its agent id, as the agent's, the session's refused keep naming the file no write of it", () => {
    const root = workspace();
    yesGiven(root);
    journalOwner(root, SESSION, [ASK], "2026-11-08T00:16:00.000Z");
    logged(root, runEvents(root));
    drawnByHelper(root);
    expect(keepParts(root).code).toBe(0);
    expect(madeByOf(root)).toBe("agent");
    expect(sessionMadeVisuals(root)).toEqual([]);
  });

  it("names no maker where the hooks logged the change's events but no write of the picture, rather than the session", () => {
    const root = workspace();
    yesGiven(root);
    journalOwner(root, SESSION, [ASK], "2026-11-08T00:16:00.000Z");
    logged(
      root,
      runEvents(root).filter((entry) => !JSON.stringify(entry).includes("apply_patch")),
    );
    drawnByHelper(root);
    expect(keepParts(root).code).toBe(0);
    expect(madeByOf(root)).toBeUndefined();
    expect(sessionMadeVisuals(root)).toEqual([]);
  });
});

describe("J-204 S1 the brief a durable picture's skill writes before it draws, read into its manifest", () => {
  const BRIEF = [
    "# Brief: how a letter goes out",
    "",
    "- question: Which steps does an overdue loan pass before its letter is posted?",
    "- form: flow",
    "- nodes: 9",
    "- finish: branded SVG",
    "- palette: the style guide's, the accent on the overdue branch",
    "- reader: the owner, new to the letters",
    "",
  ].join("\n");

  function briefed(root: string, text = BRIEF): void {
    mkdirSync(join(root, ".greenline", "tmp", ID, "pictures"), { recursive: true });
    writeFileSync(join(root, ".greenline", "tmp", ID, "pictures", "flow.brief.md"), text);
  }

  function manifestOf(root: string) {
    const path = `.greenline/visuals/${ID}/flow.visual.json`;
    const read = parseVisualManifest(readFileSync(join(root, path), "utf8"), path);
    return read._tag === "ok" ? read.value : undefined;
  }

  it("reads the brief into the manifest's brief, and status names no kept picture without one", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    briefed(root);
    journalOwner(root, "s1", ["Keep the flow diagram of the letters."], "2026-11-06T10:00:00.000Z");
    expect(picture(root, KEEP).code).toBe(0);
    expect(manifestOf(root)?.brief).toEqual({
      question: "Which steps does an overdue loan pass before its letter is posted?",
      form: "flow",
      nodes: 9,
      finish: "branded SVG",
      palette: "the style guide's, the accent on the overdue branch",
      reader: "the owner, new to the letters",
    });
    expect(brieflessVisuals(root)).toEqual([]);
  });

  it("keeps a picture with no brief, which status names by GL0606, the notice inviting no remake", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    journalOwner(root, "s1", ["Keep the flow diagram of the letters."], "2026-11-06T10:00:00.000Z");
    expect(picture(root, KEEP).code).toBe(0);
    expect(manifestOf(root)?.brief).toBeUndefined();
    expect(brieflessVisuals(root)).toEqual([
      {
        id: `${ID}/flow`,
        title: "How a letter goes out",
        path: `.greenline/visuals/${ID}/flow.visual.json`,
      },
    ]);
    const writer = new RecordingWriter();
    runCli(["status", "--json"], writer.writer, "0.0.0", {
      cwd: root,
      version: "0.0.0",
      installation: fixtureInstallation(),
    });
    // SAFETY: the envelope's JSON is the CLI's own output, read for its diagnostics.
    const found = (
      JSON.parse(writer.out) as { diagnostics: { code: string; message: string }[] }
    ).diagnostics.filter((entry) => entry.code === "GL0606");
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain(`'${ID}/flow', "How a letter goes out"`);
    expect(found[0]?.message).toContain("kept with no brief");
    expect(found[0]?.message).toContain(NO_REMAKE_OFFER);
  });

  it("refuses a brief that does not read, naming each field, and keeps nothing", () => {
    const root = workspace();
    yesGiven(root);
    drawn(root);
    briefed(
      root,
      "# Brief\n\n- question: Which steps?\n- form: flow\n- nodes: many\n- finish: glossy\n",
    );
    journalOwner(root, "s1", ["Keep the flow diagram of the letters."], "2026-11-06T10:00:00.000Z");
    const refused = picture(root, KEEP);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(
      `the brief .greenline/tmp/${ID}/pictures/flow.brief.md does not read`,
    );
    expect(refused.err).toContain("nodes");
    expect(refused.err).toContain("finish");
    expect(refused.err).toContain("palette");
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });
});

describe("J-227 S1 the keep says what it kept without, and a remake names the picture it replaces", () => {
  const ASK = "Explain the issue lifecycle with a figure.";
  const BRIEF = [
    "- question: How does an issue move from created to done, and where is it saved?",
    "- form: figure",
    "- nodes: 7",
    "- finish: interactive",
    "- palette: the style guide's",
    "- reader: a teammate new to the board",
    "",
  ].join("\n");

  /** A figure drawn under the change's working folder, by its stem. */
  function figure(root: string, stem: string): string {
    mkdirSync(join(root, ".greenline", "tmp", ID), { recursive: true });
    writeFileSync(join(root, ".greenline", "tmp", ID, `${stem}.html`), "<html></html>\n");
    return `.greenline/tmp/${ID}/${stem}.html`;
  }

  /** The keep's arguments for a figure, with more options after them. */
  function keepFigure(file: string, more: readonly string[] = []): readonly string[] {
    return [
      "keep",
      file,
      "--change",
      ID,
      "--ask",
      ASK,
      "--title",
      "Issue lifecycle",
      "--form",
      "figure",
      "--skill",
      "anatomy",
      "--summary",
      "How an issue moves between its states and where each move is saved.",
      "--files",
      "src/letters.ts",
      ...more,
    ];
  }

  function ready(): string {
    const root = workspace();
    yesGiven(root);
    journalOwner(root, "s1", [ASK], "2026-11-06T10:00:00.000Z");
    mkdirSync(join(root, ".greenline", "tmp", ID, "pictures"), { recursive: true });
    // The brief stands under the first slug alone, as in j201t-linear-visuals 001/011.
    writeFileSync(
      join(root, ".greenline", "tmp", ID, "pictures", "issue-lifecycle.brief.md"),
      BRIEF,
    );
    return root;
  }

  function statusFound(root: string, code: string): readonly { message: string; path?: string }[] {
    const writer = new RecordingWriter();
    runCli(["status", "--json"], writer.writer, "0.0.0", {
      cwd: root,
      version: "0.0.0",
      installation: fixtureInstallation(),
    });
    // SAFETY: the envelope's JSON is the CLI's own output, read for its diagnostics.
    return (
      JSON.parse(writer.out) as { diagnostics: { code: string; message: string; path?: string }[] }
    ).diagnostics.filter((entry) => entry.code === code);
  }

  it("prints, after its kept line, that each remake kept under a new slug had no brief and the two paths it read (j201t-linear-visuals finding 6)", () => {
    const root = ready();
    const first = picture(root, keepFigure(figure(root, "issue-lifecycle")));
    expect(first.code).toBe(0);
    // A keep whose brief stands prints no such line.
    expect(first.err).not.toContain("with no brief");
    for (const slug of ["issue-lifecycle-v2", "issue-lifecycle-final"]) {
      const kept = picture(root, keepFigure(figure(root, slug)));
      expect(kept.code).toBe(0);
      const lines = kept.err.trimEnd().split("\n");
      expect(lines[0]).toContain(`kept ${ID}/${slug} with its manifest`);
      expect(lines[1]).toBe(
        `greenline picture: kept ${ID}/${slug} with no brief: none stood at .greenline/tmp/${ID}/${slug}.brief.md or .greenline/tmp/${ID}/pictures/${slug}.brief.md, the brief is read under the slug a picture is kept as, and greenline status names it as GL0606`,
      );
    }
    expect(brieflessVisuals(root).map((visual) => visual.id)).toEqual([
      `${ID}/issue-lifecycle-final`,
      `${ID}/issue-lifecycle-v2`,
    ]);
  });

  it("records the picture a remake replaces, which status names as GL0609 for the owner to delete in greenline inspect (j201t-linear-visuals finding 16)", () => {
    const root = ready();
    expect(picture(root, keepFigure(figure(root, "issue-lifecycle"))).code).toBe(0);
    // A keep without the option reads as before: no replaces, and nothing named.
    expect(statusFound(root, "GL0609")).toEqual([]);
    const remake = picture(
      root,
      keepFigure(figure(root, "issue-lifecycle-corrected"), ["--replaces", "issue-lifecycle"]),
    );
    expect(remake.code).toBe(0);
    const path = `.greenline/visuals/${ID}/issue-lifecycle-corrected.visual.json`;
    const text = readFileSync(join(root, path), "utf8");
    const read = parseVisualManifest(text, path);
    expect(read._tag === "ok" ? read.value.replaces : undefined).toBe(`${ID}/issue-lifecycle`);
    // The replaced picture's id is written after the ask.
    expect(text.indexOf('"replaces"')).toBeGreaterThan(text.indexOf('"ask"'));
    expect(text.indexOf('"brief"')).toBe(-1);
    const first = parseVisualManifest(
      readFileSync(join(root, `.greenline/visuals/${ID}/issue-lifecycle.visual.json`), "utf8"),
      "first",
    );
    expect(first._tag === "ok" ? first.value.replaces : "unread").toBeUndefined();
    const found = statusFound(root, "GL0609");
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe(`.greenline/visuals/${ID}/issue-lifecycle.visual.json`);
    expect(found[0]?.message).toBe(
      `name the visual '${ID}/issue-lifecycle', "Issue lifecycle", to the owner as replaced: the picture '${ID}/issue-lifecycle-corrected', "Issue lifecycle", was kept with --replaces issue-lifecycle, and the owner may delete the replaced one in greenline inspect; nothing is deleted unasked, and ${NO_REMAKE_OFFER}`,
    );
  });

  it("refuses a --replaces naming no standing picture of the change's folder, keeping nothing", () => {
    const root = ready();
    const nowhere = picture(
      root,
      keepFigure(figure(root, "issue-lifecycle-corrected"), ["--replaces", "issue-lifecycle"]),
    );
    expect(nowhere.code).toBe(2);
    expect(nowhere.err).toContain(
      `--replaces names issue-lifecycle, and no picture of that slug stands in .greenline/visuals/${ID}/: name the slug of the kept picture this one replaces, in the same change's folder`,
    );
    // A picture of another change's folder is no slug of this one's.
    const other = picture(
      root,
      keepFigure(figure(root, "issue-lifecycle-corrected"), [
        "--replaces",
        "2026-11-01-older/issue-lifecycle",
      ]),
    );
    expect(other.code).toBe(2);
    expect(other.err).toContain("'2026-11-01-older/issue-lifecycle' is no slug");
    expect(existsSync(join(root, ".greenline", "visuals"))).toBe(false);
  });
});

describe("J-227 S1 a picture deleted from the home is named, the owner's delete by the inspector's stamp (j217c-conduct-runner finding 2)", () => {
  function event(root: string, payload: { readonly [key: string]: JsonValue }): void {
    const writer = new RecordingWriter();
    runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: root,
      stdin: () => JSON.stringify({ session_id: "root-session", cwd: root, ...payload }),
      line: () => installation.modes,
    });
  }

  function git(root: string, ...args: string[]): void {
    execFileSync("git", ["-c", "user.name=D", "-c", "user.email=d@example.com", ...args], {
      cwd: root,
      stdio: "ignore",
    });
  }

  function gl0610(root: string): readonly { message: string; path?: string }[] {
    const writer = new RecordingWriter();
    runCli(["status", "--json"], writer.writer, "0.0.0", {
      cwd: root,
      version: "0.0.0",
      installation: fixtureInstallation(),
    });
    // SAFETY: the envelope's JSON is the CLI's own output, read for its diagnostics.
    return (
      JSON.parse(writer.out) as { diagnostics: { code: string; message: string; path?: string }[] }
    ).diagnostics.filter((entry) => entry.code === "GL0610");
  }

  /** Two kept pictures committed with the links file, as at j217c-conduct-runner 001/010. */
  function kept(): string {
    const root = workspace();
    yesGiven(root);
    journalOwner(root, "s1", ["Keep the flow diagram of the letters."], "2026-11-06T10:00:00.000Z");
    drawn(root);
    expect(picture(root, KEEP).code).toBe(0);
    const states = [...KEEP];
    states[1] = `.greenline/tmp/${ID}/loan-states.md`;
    writeFileSync(join(root, ".greenline", "tmp", ID, "loan-states.md"), "# states\n");
    states[states.indexOf("--title") + 1] = "The loan's states";
    expect(picture(root, states).code).toBe(0);
    writeChangeLinks(root, ID, "greenline event");
    git(root, "add", ".greenline/visuals", `.greenline/ledger/${ID}`);
    git(root, "commit", "--quiet", "-m", "keep the pictures");
    return root;
  }

  function deleted(root: string): void {
    for (const name of ["loan-states.md", "loan-states.visual.json"])
      rmSync(join(root, ".greenline", "visuals", ID, name));
  }

  it("names the owner's delete in greenline inspect, its stamp kept by the event hook while the list is unchanged", () => {
    const root = kept();
    deleted(root);
    // The inspector's delete writes the links file with its stamp.
    writeChangeLinks(root, ID, "greenline inspect");
    const tool = { tool_name: "Bash", tool_use_id: "st-1", tool_input: { command: "git status" } };
    event(root, { hook_event_name: "PreToolUse", ...tool });
    event(root, { hook_event_name: "PostToolUse", ...tool });
    const links = readFileSync(join(root, ".greenline", "ledger", ID, "visuals.json"), "utf8");
    expect(links).toContain('"generatedBy": "greenline inspect"');
    const found = gl0610(root);
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe(`.greenline/ledger/${ID}/visuals.json`);
    expect(found[0]?.message).toBe(
      `name the visual '${ID}/loan-states', "The loan's states", to the owner as deleted: the owner deleted it in greenline inspect, and change ${ID}'s committed links file still lists it; a deleted picture is remade only on the owner's ask, never restored from git`,
    );
  });

  it("names a picture deleted outside the inspector without the owner's words, and nothing once the deletion is committed", () => {
    const root = kept();
    deleted(root);
    writeChangeLinks(root, ID, "greenline event");
    const found = gl0610(root);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toBe(
      `name the visual '${ID}/loan-states', "The loan's states", to the owner as deleted: it is gone from the visual home, and change ${ID}'s committed links file still lists it; a deleted picture is remade only on the owner's ask, never restored from git`,
    );
    git(root, "add", "--all", ".greenline/visuals", `.greenline/ledger/${ID}`);
    git(root, "commit", "--quiet", "-m", "the owner's delete");
    expect(gl0610(root)).toEqual([]);
  });
});

describe("J-227 S1 the keep's own command fills no maker in a change's folder (j201t-linear-visuals finding 2, j201c-visuals finding 3)", () => {
  const ASK = "Keep a picture of the overdue path.";
  const FILE = `.greenline/tmp/${ID}/picture-1/path.svg`;

  /** One event through greenline event as Claude Code pipes it. */
  function event(root: string, payload: { readonly [key: string]: JsonValue }): void {
    const writer = new RecordingWriter();
    runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: root,
      stdin: () => JSON.stringify({ session_id: "root-session", cwd: root, ...payload }),
      line: () => installation.modes,
    });
  }

  /** A shell command around a write it makes, by the agent named or the session. */
  function shell(
    root: string,
    call: string,
    command: string,
    agent: string | undefined,
    run: () => void,
  ): void {
    const own = { tool_name: "Bash", tool_use_id: call, tool_input: { command } };
    // A fresh agent's tool carries its agent id; the session's carries none.
    const tool = agent === undefined ? own : { ...own, agent_id: agent };
    event(root, { hook_event_name: "PreToolUse", ...tool });
    run();
    event(root, { hook_event_name: "PostToolUse", ...tool });
  }

  function draw(root: string): void {
    mkdirSync(join(root, ".greenline", "tmp", ID, "picture-1"), { recursive: true });
    writeFileSync(join(root, FILE), "<svg></svg>\n");
  }

  /** The keep run as the session runs it, through the shell, its own hook events around it. */
  function keptThroughShell(root: string): number {
    const argv = [...KEEP];
    argv[1] = FILE;
    argv[argv.indexOf("--ask") + 1] = ASK;
    let code = -1;
    shell(root, "keep-1", `greenline ${argv.join(" ")}`, undefined, () => {
      code = picture(root, argv).code;
    });
    return code;
  }

  function madeBy(root: string): string | undefined {
    const path = `.greenline/visuals/${ID}/path.visual.json`;
    const read = parseVisualManifest(readFileSync(join(root, path), "utf8"), path);
    return read._tag === "ok" ? read.value.madeBy : "unread";
  }

  function ready(): string {
    const root = workspace();
    yesGiven(root);
    journalOwner(root, "root-session", [ASK], "2026-11-06T10:00:00.000Z");
    // The change's log holds the session's own tools before the drawing.
    shell(root, "st-1", "git status --short", undefined, () => undefined);
    return root;
  }

  it("leaves the maker absent where a fresh agent's write reached no hook and the session kept it", () => {
    const root = ready();
    // The helper's write through Codex's exec reached no hook, as at 001/016, seconds after the session's last tool.
    draw(root);
    const later = new Date(Date.now() + 10_000);
    utimesSync(join(root, FILE), later, later);
    expect(keptThroughShell(root)).toBe(0);
    expect(madeBy(root)).toBeUndefined();
    expect(sessionMadeVisuals(root)).toEqual([]);
  });

  it("reads a fresh agent's logged write as the agent's, the keep's own command filling nothing", () => {
    const root = ready();
    shell(root, "draw-1", `cat > ${FILE} <<'SVG'\n<svg></svg>\nSVG`, "a-fresh-drawer", () =>
      draw(root),
    );
    expect(keptThroughShell(root)).toBe(0);
    expect(madeBy(root)).toBe("agent");
  });

  it("reads the session's own sed -i on the helper's drawing before the keep as the session's, the one maker rule", () => {
    const root = ready();
    shell(root, "draw-1", `cat > ${FILE} <<'SVG'\n<svg></svg>\nSVG`, "a-fresh-drawer", () =>
      draw(root),
    );
    shell(root, "sed-1", `sed -i '' 's/svg/svg /' ${FILE}`, undefined, () =>
      writeFileSync(join(root, FILE), "<svg ></svg>\n"),
    );
    expect(keptThroughShell(root)).toBe(0);
    expect(madeBy(root)).toBe("session");
  });
});
