import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  factsFileName,
  finishedFacts,
  serializeFacts,
  startedFacts,
} from "../../src/core/facts.ts";
import { parseModes } from "../../src/core/modes.ts";
import { runHookCli } from "../../src/shell/cli/hook.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { writeAddressFile } from "../../src/shell/inspect/address-file.ts";
import { recordDeal } from "../../src/shell/deal-view.ts";
import { fixtureInstallation, fixtureSkills } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/**
 * The status command (`docs/SPEC.md` section 4): the House rulings it lists,
 * and its refusal outside a workspace.
 */

const VERSION: string = "0.1.0";
const CHANGE = "2026-10-27-members";
const tempDirs: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-status-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  const rec = new RecordingWriter();
  const code = runCli(["init", "--yes"], rec.writer, VERSION, {
    cwd: dir,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  if (code !== 0) throw new Error(`init failed in fixture: ${rec.err}`);
  return dir;
}

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function run(root: string, args: readonly string[]): Run {
  const rec = new RecordingWriter();
  const code = runCli([...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  return { code, out: rec.out, err: rec.err };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("greenline status", () => {
  it("lists the House rulings stanza's dash lines from AGENTS.md, as text and in the envelope", () => {
    const root = makeWorkspace();
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    writeFileSync(
      join(root, "AGENTS.md"),
      `# demo\n\n## House rulings\n\n- Errors are thrown, never returned.\n- No default exports.\n\n${agents}`,
    );
    const human = run(root, ["status"]);
    expect(human.code).toBe(0);
    expect(human.out).toContain("house rulings (AGENTS.md): 2");
    expect(human.out).toContain("  - No default exports.");
    const json = run(root, ["status", "--json"]);
    expect(JSON.parse(json.out).houseRulings).toEqual([
      "Errors are thrown, never returned.",
      "No default exports.",
    ]);
    const bare = run(makeWorkspace(), ["status"]);
    expect(bare.out).toContain("house rulings: none");
  });

  it("J-143 S2 prints the surface line from the manifest's targets outside a session", () => {
    const root = makeWorkspace();
    const out = run(root, ["status"]).out;
    const named = z
      .object({ targets: z.array(z.string()) })
      .parse(JSON.parse(readFileSync(join(root, ".greenline", "manifest.json"), "utf8"))).targets;
    expect(named.length).toBeGreaterThan(0);
    for (const target of named) expect(out).toMatch(new RegExp(`^surface: ${target}, `, "m"));
    expect(out).toContain("questions cards");
  });

  it("J-143 S2 names a change open in a worktree git lists, from the main checkout, and never as stopped", () => {
    const root = mkdtempSync(join(tmpdir(), "greenline-status-"));
    tempDirs.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      });
    git("init", "--quiet", "-b", "main");
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    git("add", "--all");
    git("commit", "--quiet", "--no-verify", "-m", "start");
    const tree = join(root, ".claude", "worktrees", CHANGE);
    git("worktree", "add", "--quiet", "-b", `greenline/${CHANGE}`, tree);
    const record = (state: string): string =>
      ["---", "mode: quick", 'why: "w"', "choice: accepted", `state: ${state}`, "---", ""].join(
        "\n",
      );
    mkdirSync(join(tree, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(tree, ".greenline", "ledger", `${CHANGE}.md`), record("stopped"));
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", "add", "."], {
      cwd: tree,
    });
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
        "stop",
      ],
      { cwd: tree },
    );
    // Resumed in the worktree: the working copy open, the commit still stopped.
    writeFileSync(join(tree, ".greenline", "ledger", `${CHANGE}.md`), record("open"));
    const out = run(root, ["status"]).out;
    expect(out).toContain(
      `  open in other worktrees: ${CHANGE} (in the worktree .claude/worktrees/${CHANGE}); each is worked on in its own checkout`,
    );
    expect(out).toContain("  stopped on other branches: none");
    // A change open in this checkout too is this checkout's, never named as another worktree's.
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger", `${CHANGE}.md`), record("open"));
    expect(run(root, ["status"]).out).not.toContain("open in other worktrees");
  });

  it("J-133 S1 names the pages an open interface change touched that no run captured, until a render settles them", () => {
    const root = mkdtempSync(join(tmpdir(), "greenline-status-"));
    tempDirs.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      });
    const write = (path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    git("init", "--quiet", "-b", "main");
    expect(run(root, ["init", "--yes"]).code).toBe(0);
    const manifestPath = join(root, ".greenline", "manifest.json");
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          // SAFETY: init writes the manifest as a JSON object, read back here to add the block.
          ...(manifest as object),
          interface: {
            roots: ["src/app", "src/components"],
            extensions: ["tsx"],
            platform: "web",
            frameworks: ["react"],
            evidence: [],
            confirmed: true,
            check: true,
          },
        },
        null,
        2,
      )}\n`,
    );
    git("add", "--all");
    git("commit", "--quiet", "--no-verify", "-m", "start");
    git("checkout", "--quiet", "-b", `greenline/${CHANGE}`);
    write(
      `.greenline/ledger/${CHANGE}.md`,
      [
        "---",
        "mode: quick",
        'why: "the members page"',
        "choice: accepted",
        "state: open",
        'interface: "yes, app"',
        "---",
        "",
      ].join("\n"),
    );
    write("src/app/members/page.tsx", "export default function Page() { return null; }\n");
    write("src/components/table.tsx", "export function Table() { return null; }\n");
    const owed = run(root, ["status"]);
    expect(owed.err).toContain("GL0605");
    expect(owed.err).toContain(
      `run greenline check interface --url <address> --path <page> for each page of the interface change ${CHANGE} before done`,
    );
    expect(owed.err).toContain(
      `: it has no capture and no named browser limit since the files last changed for /members, and a page rendering src/components/table.tsx; warning GL0605`,
    );
    // The render's fact is made after the files were written, as the command's is.
    const at = new Date(Date.now() + 1000).toISOString();
    write(
      `.greenline/ledger/${CHANGE}/interface/20261027T100000000Z-abc123.json`,
      `${JSON.stringify({
        generatedBy: "greenline check interface",
        at,
        commit: null,
        paths: ["src/app/members/page.tsx", "src/components/table.tsx"],
        counts: { floor: 0, reflex: 0, waived: 0, finish: 0 },
        findings: [],
        unmeasured: [],
        widths: [],
        browser:
          "the browser could not read http://127.0.0.1:3000/members: Page.navigate timed out",
        limit: {
          cause: "timeout",
          origin: "http://127.0.0.1:3000",
          address: "/members",
          at,
          detail: "Page.navigate timed out",
        },
        address: "/members",
        pages: ["/members"],
      })}\n`,
    );
    // J-191 S1: status names the limit, and the notice asks for the record's line until it stands.
    const limited = run(root, ["status"]);
    expect(limited.out).toContain(
      `interface capture: not made for /members, ${at}: the page did not load in time at http://127.0.0.1:3000/members (Page.navigate timed out); the record does not name it yet`,
    );
    expect(limited.err).toContain("GL0605");
    expect(limited.err).toContain(
      "name it in the record's ## Interface section as `- limit /members: <what was not captured, in your words>`",
    );
    write(
      `.greenline/ledger/${CHANGE}.md`,
      `${readFileSync(join(root, ".greenline", "ledger", `${CHANGE}.md`), "utf8")}\n## Interface\n\n- limit /members: not captured; the capture browser timed out\n`,
    );
    const named = run(root, ["status"]);
    expect(named.err).not.toContain("GL0605");
    expect(named.out).toContain("(Page.navigate timed out); the record names it");
  });

  describe("J-134 the agents a method starts and the habits a build owes, read at status", () => {
    /** An installation whose trigger rows owe the fixture's habit at a regular or careful build (J-176 S1). */
    const installation = fixtureInstallation({
      triggers: {
        schema: "greenline.triggers/v1",
        skills: [
          {
            name: "grilling",
            kind: "habit",
            rows: [{ steps: ["build"], modes: ["regular", "careful"], weight: 1, read: "part" }],
          },
        ],
      },
    });
    const statusOf = (root: string): Run => {
      const rec = new RecordingWriter();
      const code = runCli(["status", "--change", CHANGE], rec.writer, VERSION, {
        cwd: root,
        version: VERSION,
        installation,
      });
      return { code, out: rec.out, err: rec.err };
    };
    /** A workspace on git, its change at the mode and cost given, open at build. */
    const workspace = (mode: string, agents?: number): string => {
      const root = mkdtempSync(join(tmpdir(), "greenline-status-"));
      tempDirs.push(root);
      const git = (...args: string[]): string =>
        execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
          cwd: root,
          encoding: "utf8",
        });
      git("init", "--quiet", "-b", "main");
      const rec = new RecordingWriter();
      runCli(["init", "--yes"], rec.writer, VERSION, { cwd: root, version: VERSION, installation });
      git("add", "--all");
      git("commit", "--quiet", "--no-verify", "-m", "start");
      git("checkout", "--quiet", "-b", `greenline/${CHANGE}`);
      writeFileSync(
        join(root, ".greenline", "ledger", `${CHANGE}.md`),
        [
          "---",
          `mode: ${mode}`,
          'why: "the members page"',
          "choice: accepted",
          "state: open",
          'next: "build: write the cache"',
          ...(agents === undefined ? [] : [`agents: ${String(agents)}`, "rounds: 1"]),
          "---",
          "",
        ].join("\n"),
      );
      return root;
    };

    it("names the skill a build owes by its trigger row while no load holds it, and nothing once loaded or at quick", () => {
      const root = workspace("regular");
      const owed = statusOf(root);
      expect(owed.err).toContain("GL0460");
      // The row owes the skill's front at a regular or careful build (J-176 S1).
      expect(owed.err).toContain("owes: grilling (its front");
      // The default view prints the owed line beside the situation line, as the mirror does.
      const whole = new RecordingWriter();
      runCli(["status"], whole.writer, VERSION, { cwd: root, version: VERSION, installation });
      expect(whole.out).toContain("owes: grilling (its front");
      expect(whole.out).toContain("situation: mode no hook saw the request; proceed none");
      const day = new Date().toISOString().slice(0, 10);
      mkdirSync(join(root, ".greenline", "ledger", CHANGE, "skills"), { recursive: true });
      writeFileSync(
        join(root, ".greenline", "ledger", CHANGE, "skills", `${day}.jsonl`),
        `${JSON.stringify({ skill: "grilling", file: "SKILL.md", whole: true, via: "Skill", at: `${day}T10:00:00.000Z`, step: "build", agent: null, session: "s1", turn: 1 })}\n`,
      );
      expect(statusOf(root).err).not.toContain("GL0460");
      expect(statusOf(workspace("quick")).err).not.toContain("GL0460");
    });

    it("reads the limit met with the method's agents named apart, the record counting them or not", () => {
      for (const agents of [2, 4]) {
        const root = workspace("regular", agents);
        mkdirSync(join(root, ".greenline", "tmp", CHANGE), { recursive: true });
        writeFileSync(
          join(root, ".greenline", "tmp", CHANGE, "events.jsonl"),
          [
            { kind: "agent-start", method: "diagram-design" },
            { kind: "agent-start", method: "diagram-design" },
            { kind: "agent-start", method: null },
          ]
            .map((line) => JSON.stringify(line))
            .join("\n"),
        );
        const read = statusOf(root);
        expect(read.err, String(agents)).not.toContain("GL0402");
        expect(read.out, String(agents)).toContain(
          "agents: 2 of 2, and 2 by diagram-design that a method started, counted nowhere and listed nowhere, neither in the record's starts nor in its agents count",
        );
      }
    });
  });

  describe("J-142 S2 and J-144 S1 the facts table's View row names the page the turn's situation calls for", () => {
    const BASE = "http://127.0.0.1:7433";
    /** A workspace on git with the address file of a viewer this process serves, its change open with the record's lines given. */
    const workspace = (lines: readonly string[] | undefined, serving = true): string => {
      const root = mkdtempSync(join(tmpdir(), "greenline-status-"));
      tempDirs.push(root);
      const git = (...args: string[]): string =>
        execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
          cwd: root,
          encoding: "utf8",
        });
      git("init", "--quiet", "-b", "main");
      expect(run(root, ["init", "--yes"]).code).toBe(0);
      git("add", "--all");
      git("commit", "--quiet", "--no-verify", "-m", "start");
      if (serving) writeAddressFile(root, 7433);
      if (lines === undefined) return root;
      git("checkout", "--quiet", "-b", `greenline/${CHANGE}`);
      writeFileSync(
        join(root, ".greenline", "ledger", `${CHANGE}.md`),
        ["---", "mode: regular", 'why: "the members page"', ...lines, "---", "", ""].join("\n"),
      );
      return root;
    };
    const viewOf = (root: string): string | undefined =>
      run(root, ["status"])
        .out.split("\n")
        .find((line) => line.startsWith("| View | "))
        ?.replace(/^\| View \| (.*) \|$/, "view: $1");
    const write = (root: string, path: string, text: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    };

    it("prints no facts and no view with no change open, and reads not serving without the address file", () => {
      const none = run(workspace(undefined), ["status"]).out;
      expect(none).not.toContain("facts:");
      expect(none).not.toMatch(/^view:/m);
      expect(viewOf(workspace(undefined, false))).toBeUndefined();
      expect(viewOf(workspace(["state: open"], false))).toBe("view: not serving");
    });

    it("names the change page at the proposal and at the close", () => {
      expect(viewOf(workspace(["state: open"]))).toBe(`view: ${BASE}/changes/${CHANGE}`);
      expect(viewOf(workspace(["state: done", "choice: accepted"]))).toBe(
        `view: ${BASE}/changes/${CHANGE}`,
      );
    });

    it("names the deal view at an interface change's design until a pick stands, with the ask of the last deal", () => {
      const root = workspace([
        "state: open",
        "choice: accepted",
        'interface: "yes, site"',
        'next: "design: deal three directions"',
      ]);
      expect(viewOf(root)).toBe(`view: ${BASE}/changes/${CHANGE}/deal`);
      recordDeal(root, CHANGE, `/changes/${CHANGE}/deal?register=site&seed=7`);
      expect(viewOf(root)).toBe(`view: ${BASE}/changes/${CHANGE}/deal?register=site&seed=7`);
      write(root, `.greenline/ledger/${CHANGE}/design-pick.json`, "{}\n");
      expect(viewOf(root)).toBe(`view: ${BASE}/changes/${CHANGE}`);
    });

    it("names the frame map while a frame's question waits for its answer", () => {
      const root = workspace(["state: open", "choice: accepted", 'next: "frame: ask the owner"']);
      write(
        root,
        `.greenline/ledger/${CHANGE}.md`,
        [
          "---",
          "mode: regular",
          'why: "the members page"',
          "state: open",
          "choice: accepted",
          'next: "frame: ask the owner"',
          "---",
          "",
          "## frame",
          "",
          "- Q1 [scope] Which pages does it touch?",
          "  - proposed: the members page alone",
          "",
        ].join("\n"),
      );
      expect(viewOf(root)).toBe(`view: ${BASE}/changes/${CHANGE}/frame-map`);
    });

    it("J-154 S3 names the change's waiting part while its next word is the owner's, before a picture and a note", () => {
      const waiting = workspace([
        "state: open",
        "choice: accepted",
        'next: "verify: wait for the owner\'s answer on the empty state"',
      ]);
      expect(viewOf(waiting)).toBe(`view: ${BASE}/changes/${CHANGE}/waiting`);
      write(
        waiting,
        ".greenline/ledger/interface/marks.jsonl",
        `${JSON.stringify({
          id: "m1a2b3c4",
          address: "/members",
          width: 390,
          capture: { id: "interface/capture-members", commit: "abcdef1" },
          element: {
            selector: "#members",
            tag: "table",
            role: "table",
            text: "Members",
            box: { x: 0, y: 0, width: 390, height: 600 },
            source: null,
          },
          region: null,
          crop: { x: 0, y: 0, width: 390, height: 600 },
          note: "The table overflows.",
          intent: "fix",
          state: "open",
          by: "owner",
          words: null,
          at: "2026-10-27T10:00:00.000Z",
          proposed: null,
          closed: null,
        })}\n`,
      );
      expect(viewOf(waiting)).toBe(`view: ${BASE}/changes/${CHANGE}/waiting`);
      // The same note open beside a change whose next word is the agent's: the notes.
      const noted = workspace([
        "state: open",
        "choice: accepted",
        'next: "build: write the table"',
      ]);
      write(
        noted,
        ".greenline/ledger/interface/marks.jsonl",
        readFileSync(join(waiting, ".greenline/ledger/interface/marks.jsonl"), "utf8"),
      );
      expect(viewOf(noted)).toBe(`view: ${BASE}/interface/notes`);
      // A next word that is the agent's waits on nothing: the change page.
      const working = workspace([
        "state: open",
        "choice: accepted",
        'next: "build: write the table"',
      ]);
      expect(viewOf(working)).toBe(`view: ${BASE}/changes/${CHANGE}`);
    });

    it("names the visual a turn made, the captures at an interface change's verify, and the marks while one is open", () => {
      const building = ["state: open", "choice: accepted", 'next: "build: write the table"'];
      const made = workspace(building);
      expect(viewOf(made)).toBe(`view: ${BASE}/changes/${CHANGE}`);
      write(
        made,
        `.greenline/tmp/${CHANGE}/events.jsonl`,
        [
          { kind: "turn-start", at: "2026-10-27T09:00:00.000Z" },
          { kind: "turn-start", at: "2026-10-27T10:00:00.000Z" },
        ]
          .map((line) => JSON.stringify(line))
          .join("\n"),
      );
      write(made, `.greenline/visuals/${CHANGE}/table-flow.md`, "# The table\n");
      write(
        made,
        `.greenline/visuals/${CHANGE}/table-flow.visual.json`,
        `${JSON.stringify({ schema: "greenline.visual/v1", title: "The table", form: "sequence", skill: "diagram-design", change: CHANGE, commit: "abcdef1", files: [], made: "2026-10-27T09:30:00.000Z", summary: "the table's flow" })}\n`,
      );
      expect(viewOf(made)).toBe(`view: ${BASE}/pictures/${CHANGE}/table-flow`);

      // J-221 S1: a kept map or figure, the two skills' interactive companions, links the Maps tab; a diagram holds its own page.
      const turns = [
        { kind: "turn-start", at: "2026-10-27T09:00:00.000Z" },
        { kind: "turn-start", at: "2026-10-27T10:00:00.000Z" },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n");
      for (const [id, form, skill] of [
        ["map/architecture", "map", "architecture-map"],
        [`${CHANGE}/loan-lifecycle`, "figure", "anatomy"],
      ] as const) {
        const kept = workspace(building);
        write(kept, `.greenline/tmp/${CHANGE}/events.jsonl`, turns);
        write(kept, `.greenline/visuals/${id}.html`, "<!doctype html><title>kept</title>\n");
        write(
          kept,
          `.greenline/visuals/${id}.visual.json`,
          `${JSON.stringify({ schema: "greenline.visual/v1", title: "Kept", form, skill, change: CHANGE, commit: "abcdef1", files: [], made: "2026-10-27T09:30:00.000Z", summary: "the kept picture" })}\n`,
        );
        expect(viewOf(kept), form).toBe(`view: ${BASE}/knowledge/maps`);
      }

      const verifying = workspace([
        "state: open",
        "choice: accepted",
        'interface: "yes, app"',
        'next: "verify: capture the members page"',
      ]);
      expect(viewOf(verifying)).toBe(`view: ${BASE}/changes/${CHANGE}/captures`);

      const marked = workspace(building);
      write(
        marked,
        ".greenline/ledger/interface/marks.jsonl",
        `${JSON.stringify({ id: "m1a2b3c4", address: "/members", width: 390, capture: { id: "interface/capture-members", commit: "abcdef1" }, element: { selector: "#members", tag: "table", role: "table", text: "Members", box: { x: 0, y: 0, width: 390, height: 600 }, source: null }, region: null, crop: { x: 0, y: 0, width: 390, height: 600 }, note: "The table overflows.", intent: "fix", state: "open", by: "owner", words: null, at: "2026-10-27T10:00:00.000Z", proposed: null, closed: null })}\n`,
      );
      expect(viewOf(marked)).toBe(`view: ${BASE}/interface/notes`);
    });
  });

  it("fails closed with GL0101 outside an initialized workspace", () => {
    const root = makeWorkspace();
    rmSync(join(root, ".greenline"), { recursive: true, force: true });
    const result = run(root, ["status"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0101");
  });
});

describe("J-189 S1 the done door and status agree on an owed skill", () => {
  /** A start the request's words owe whole, as the corpus's rows owe one. */
  const installation = fixtureInstallation({
    skills: [
      ...fixtureSkills,
      {
        name: "verify-formally",
        description: "Check a property over every order, not just the tested ones.",
        kind: "start",
        activation: "implicit",
        body: "# Verify formally\n\nState the property, then walk every order.\n",
      },
    ],
    triggers: {
      schema: "greenline.triggers/v1",
      skills: [
        {
          name: "verify-formally",
          kind: "start",
          rows: [{ words: ["not just tested"], weight: 3, read: "whole" }],
        },
      ],
    },
  });
  const modesPath = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const line = () => {
    const read = parseModes(readFileSync(modesPath, "utf8"), modesPath);
    return read._tag === "ok" ? read.value : undefined;
  };

  it("J-189 S1 refuses done while an owed skill is neither loaded nor named, and status names the same skill", () => {
    const root = mkdtempSync(join(tmpdir(), "greenline-owed-door-"));
    tempDirs.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      });
    git("init", "--quiet", "-b", "main");
    const rec = new RecordingWriter();
    runCli(["init", "--yes"], rec.writer, VERSION, { cwd: root, version: VERSION, installation });
    git("add", "--all");
    git("commit", "--quiet", "--no-verify", "-m", "start");
    git("checkout", "--quiet", "-b", `greenline/${CHANGE}`);
    // The hooks recorded a load of another skill, so the owed skill's absence is a fact.
    mkdirSync(join(root, ".greenline", "ledger", CHANGE, "skills"), { recursive: true });
    writeFileSync(
      join(root, ".greenline", "ledger", CHANGE, "skills", "2026-11-07.jsonl"),
      `${JSON.stringify({ skill: "grilling", file: "SKILL.md", whole: true, via: "Skill", at: "2026-11-07T10:00:00.000Z", step: "frame", agent: null, session: "s1", turn: 1 })}\n`,
    );
    // A check passed on this installation, so status judges the done record against the modes.
    const startedAt = "2026-11-07T10:05:00.000Z";
    mkdirSync(join(root, ".greenline", "ledger", CHANGE, "checks"), { recursive: true });
    writeFileSync(
      join(root, ".greenline", "ledger", CHANGE, "checks", factsFileName(startedAt, "door01")),
      serializeFacts(
        finishedFacts(
          startedFacts({
            arguments: ["node", "-e", "the unit check"],
            startedAt,
            commit: null,
            tree: null,
            installation: installation.revision,
          }),
          { kind: "exited", code: 0 },
          5,
        ),
      ),
    );
    writeFileSync(
      join(root, ".greenline", "ledger", `${CHANGE}.md`),
      [
        "---",
        "mode: quick",
        'why: "a book is never lent twice, proved and not just tested"',
        "choice: owner",
        "floors: none",
        "state: done",
        "next: none",
        "ground: branch",
        'agent: "claude-code/opus"',
        "skills: [grilling]",
        'outcome: "A book is lent to one member at a time."',
        "---",
        "",
        "## frame",
        "",
        "one loan a book",
        "",
        "## close",
        "",
        "the checks green",
        "",
      ].join("\n"),
    );
    git("add", "--all");
    const writer = new RecordingWriter();
    const code = runHookCli(["pre-commit"], writer.writer, {
      cwd: root,
      stdin: () => "",
      modes: () => line()?.modes.map((mode) => mode.name),
      line,
      installation: () => installation,
    });
    expect(code).not.toBe(0);
    expect(writer.err).toContain(
      "the change owed verify-formally (the request says not just tested)",
    );
    const status = new RecordingWriter();
    runCli(["status", "--change", CHANGE], status.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation,
    });
    expect(`${status.out}${status.err}`).toContain(
      "the change owed verify-formally (the request says not just tested)",
    );
  });
});

describe("J-193 S1 the status names a branch that predates the practice and a clone without its hooks", () => {
  /** A repository's root and its git. */
  interface Installed {
    readonly root: string;
    readonly git: (...args: string[]) => string;
  }

  /** A real repository, initialized and committed on main, the hooks registered by init. */
  function installed(): Installed {
    const root = mkdtempSync(join(tmpdir(), "greenline-status-ground-"));
    tempDirs.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
        cwd: root,
        encoding: "utf8",
      }).trim();
    git("init", "--quiet", "-b", "main");
    writeFileSync(join(root, "README.md"), "# shelf\n");
    git("add", "README.md");
    git("commit", "--quiet", "-m", "before the install");
    git("branch", "feature/overdue");
    const rec = new RecordingWriter();
    const code = runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    });
    if (code !== 0) throw new Error(`init failed in fixture: ${rec.err}`);
    git("add", "--all");
    git("commit", "--quiet", "-m", "install greenline");
    return { root, git };
  }

  const PREDATES =
    "this branch predates the practice: feature/overdue holds no .greenline/manifest.json where main holds one";

  /** The words the status line says after the way back (J-206 S1, j196t-wait-proceed-1b thread 001 turn 003). */
  const SESSION_WORDS =
    "either brings the practice's files to the tree but not to the running session, since a harness loads its hooks at a session's start, so once it is done the owner starts a new session, where the practice stands again, and nothing is edited until then";

  it("names the branch cut before the install and the way back, where the default branch holds the manifest (j109t-wait-proceed-1d)", () => {
    const { root, git } = installed();
    git("checkout", "--quiet", "feature/overdue");
    const result = run(root, ["status"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0101");
    expect(result.err).toContain(PREDATES);
    expect(result.err).toContain("switch to main or merge it into feature/overdue");
    // A repository whose default branch holds no manifest is no workspace, said as before.
    const plain = mkdtempSync(join(tmpdir(), "greenline-status-plain-"));
    tempDirs.push(plain);
    execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: plain });
    const none = run(plain, ["status"]);
    expect(none.err).toContain("not a greenline workspace; run 'greenline init' first");
    expect(none.err).not.toContain("predates");
  });

  it("says after the way back that a merge brings no hook to the running session, so the owner starts a new one and nothing is edited until then (J-206 S1, j196t-wait-proceed-1b)", () => {
    const { root, git } = installed();
    git("checkout", "--quiet", "feature/overdue");
    const result = run(root, ["status"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain(
      `switch to main or merge it into feature/overdue, \`git switch main\` or \`git merge main\`; ${SESSION_WORDS}`,
    );
  });

  it("names the branch cut before the install from main, with what a request for its files owes under proceed regular (J-213 S1, j196t-wait-proceed-1c)", () => {
    const { root } = installed();
    expect(run(root, ["status"]).out).toContain(
      "  stopped on other branches: none\n  branches before the practice: feature/overdue\n",
    );
    const path = join(root, ".greenline", "manifest.json");
    writeFileSync(
      path,
      `${JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), proceed: "regular" }, null, 2)}\n`,
    );
    const result = run(root, ["status"]);
    expect(result.out).toContain(
      "  branches before the practice: feature/overdue; a request for their files under proceed regular proposes the merge of main into the branch as the one yes, asks no direction first, and once it is done the owner starts a new session there\n",
    );
    expect(JSON.parse(run(root, ["status", "--json"]).out).situation.predating).toEqual({
      kind: "known",
      base: "main",
      branches: ["feature/overdue"],
      proceed: "regular",
    });
  });

  it("names a clone whose git configuration registers none of greenline's hooks and the sync that installs them, and says nothing where they stand (j179c-states-stop-2b)", () => {
    const { root } = installed();
    const NOT_INSTALLED = "hooks not installed here:";
    expect(run(root, ["status"]).out).not.toContain(NOT_INSTALLED);
    const clone = mkdtempSync(join(tmpdir(), "greenline-status-clone-"));
    tempDirs.push(clone);
    rmSync(clone, { recursive: true });
    execFileSync("git", ["clone", "--quiet", root, clone]);
    const out = run(clone, ["status"]).out;
    expect(out).toContain(
      "hooks not installed here: this checkout's git configuration registers none of greenline's hooks, so no commit, rewrite or push is held to the record; greenline sync installs them, run by the owner or, once the owner is told what it installs, on the owner's word\n",
    );
    expect(out.split("\n").filter((line) => line.includes(NOT_INSTALLED))).toHaveLength(1);
    // The owner's own sync, from a terminal no harness hook reads, goes on as before (J-224 S1).
    expect(run(clone, ["sync"]).code).toBe(0);
    expect(run(clone, ["status"]).out).not.toContain(NOT_INSTALLED);
  });
});
