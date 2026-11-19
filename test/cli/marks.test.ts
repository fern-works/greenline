/**
 * The marks record (J-124 S2): `greenline mark add` appends a mark with its
 * schema into the folder of the change open on its address, or under the
 * interface ledger home with none open; the mirror and status count the
 * open ones by address and name a mark stale once a commit touches the file
 * its element came from; the agent's proposal leaves a mark open; a closure
 * without the owner's act is refused and one in the owner's words is kept
 * with the words; the viewer's mark and closure carry the revision check;
 * and the hook refuses a hand edit of a marks file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson } from "../../src/core/contract.ts";
import { parseInspectorDocument } from "../../src/core/inspector/contract.ts";
import { markSchema, readMarks } from "../../src/core/marks.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runMarkCli } from "../../src/shell/cli/mark.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { startInspector } from "../../src/shell/inspect/server.ts";
import { markedCaptures } from "../../src/shell/marks.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const ID = "2026-10-26-plans-page";
const CAPTURE = `${ID}/capture-plans`;
const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Space {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, text: string) => void;
  readonly mark: (...argv: string[]) => { code: number; out: string; err: string };
  readonly status: () => string;
  readonly mirror: () => string;
}

/** The boxes of the planted capture at one width. */
function width(value: number) {
  return {
    width: value,
    height: 844,
    page: { width: value, height: 1200 },
    image: { height: 1200 },
    elements: [
      {
        selector: "main",
        tag: "main",
        role: "main",
        text: "Plans",
        box: { x: 0, y: 0, width: value, height: 1200 },
        source: null,
      },
      {
        selector: "#start-trial",
        tag: "button",
        role: "button",
        text: "Start a trial",
        box: { x: 24, y: 900, width: 160, height: 48 },
        source: { file: "src/components/Cta.tsx", line: 8, column: 7, via: "react" },
      },
      {
        selector: "main > p",
        tag: "p",
        role: "paragraph",
        text: "Cancel any time.",
        box: { x: 24, y: 960, width: 200, height: 24 },
        source: null,
      },
    ],
    truncated: false,
  };
}

/** A web app with the interface, a change open on its branch and a capture of /plans with its boxes. */
function space(open = true): Space {
  const root = mkdtempSync(join(tmpdir(), "marks-"));
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
  write("package.json", JSON.stringify({ dependencies: { react: "19.0.0" } }));
  write("src/components/Cta.tsx", "export const Cta = () => <button>Start a trial</button>;\n");
  write("src/components/Other.tsx", "export const Other = () => null;\n");
  const init = new RecordingWriter();
  if (
    runCli(["init", "--yes"], init.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    }) !== 0
  )
    throw new Error(init.out + init.err);
  git("add", "--all");
  git("commit", "--quiet", "--no-verify", "-m", "start");
  const commit = git("rev-parse", "HEAD");
  const home = open ? ID : "interface";
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
        'interface: "yes, app"',
        "---",
        "",
      ].join("\n"),
    );
  }
  write(`.greenline/visuals/${home}/capture-plans.html`, "<!doctype html><title>Capture</title>\n");
  write(
    `.greenline/visuals/${home}/capture-plans.visual.json`,
    `${JSON.stringify({ schema: "greenline.visual/v1", title: "Capture of /plans", form: "capture", skill: "verify", change: open ? ID : null, commit, files: ["src/components/Cta.tsx"], made: "2026-10-26T09:00:00.000Z", summary: "/plans", capture: { address: "/plans", widths: [1440, 768, 390], scores: { floor: 0, reflex: 0, finish: 0 } } })}\n`,
  );
  write(
    `.greenline/visuals/${home}/capture-plans.boxes.json`,
    `${JSON.stringify({ generatedBy: "greenline check interface", address: "/plans", commit, at: "2026-10-26T09:00:00.000Z", widths: [width(1440), width(768), width(390)] })}\n`,
  );
  const mark = (...argv: string[]) => {
    const writer = new RecordingWriter();
    const code = runMarkCli(argv, writer.writer, root, () => new Date("2026-10-26T10:00:00.000Z"));
    return { code, out: writer.out, err: writer.err };
  };
  const status = (): string => {
    const writer = new RecordingWriter();
    runCli(["status"], writer.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    });
    return writer.out;
  };
  const mirror = (): string => {
    const writer = new RecordingWriter();
    runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: root,
      stdin: () => JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "hello" }),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });
    return writer.out;
  };
  return { root, git, write, mark, status, mirror };
}

const ADD = [
  "add",
  "--capture",
  CAPTURE,
  "--width",
  "390",
  "--selector",
  "#start-trial",
  "--note",
  "The call to action sits below the fold at 390.",
  "--intent",
  "fix",
  "--words",
  "the trial button is too low on the phone",
];

/** The marks a file holds as they stand. */
function marksAt(root: string, path: string) {
  return readMarks(readFileSync(join(root, path), "utf8"));
}

describe("J-124 S2 the marks record", () => {
  it("appends a mark with its schema in the open change's folder, which the mirror and status count", () => {
    const here = space();
    const added = here.mark(...ADD);
    expect(added.code, added.err).toBe(0);
    const file = `.greenline/ledger/${ID}/marks.jsonl`;
    const lines = readFileSync(join(here.root, file), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const mark = markSchema.parse(parseJson(lines[0] ?? ""));
    expect(mark).toMatchObject({
      address: "/plans",
      width: 390,
      capture: { id: CAPTURE },
      element: { selector: "#start-trial", text: "Start a trial" },
      region: null,
      intent: "fix",
      state: "open",
      by: "agent",
      words: "the trial button is too low on the phone",
      proposed: null,
      closed: null,
    });
    expect(mark.id).toMatch(/^m[0-9a-f]{7}$/);
    expect(mark.crop).toEqual({ x: 0, y: 876, width: 208, height: 96 });
    expect(here.status()).toContain("marks: 1 open on /plans\n");
    expect(here.mirror()).toContain("marks: 1 open on /plans");
    expect(here.mark("list").out).toContain(
      `${mark.id} open /plans at 390, fix: button "Start a trial" #start-trial (src/components/Cta.tsx:8)`,
    );
  });

  it("keeps a mark under the interface ledger home while no change is open on its address", () => {
    const here = space(false);
    expect(
      here.mark(...ADD.map((arg) => (arg === CAPTURE ? "interface/capture-plans" : arg))).code,
    ).toBe(0);
    expect(existsSync(join(here.root, ".greenline/ledger/interface/marks.jsonl"))).toBe(true);
    expect(here.mirror()).toContain("marks: 1 open on /plans");
  });

  it("marks a region with the elements under its stroke", () => {
    const here = space();
    const added = here.mark(
      "add",
      "--capture",
      CAPTURE,
      "--width",
      "1440",
      "--region",
      "10,890 300,890 300,995 10,995",
      "--note",
      "Too much air here.",
      "--intent",
      "idea",
      "--words",
      "the space around the button feels loose",
    );
    expect(added.code, added.err).toBe(0);
    const [mark] = marksAt(here.root, `.greenline/ledger/${ID}/marks.jsonl`).marks;
    expect(mark?.region?.elements).toEqual(["main > p", "#start-trial"]);
  });

  it("names a mark stale once a commit touches the file its element came from", () => {
    const here = space();
    here.mark(...ADD);
    here.write("src/components/Other.tsx", "export const Other = () => 1;\n");
    here.git("add", "src/components/Other.tsx");
    here.git("commit", "--quiet", "--no-verify", "-m", "other");
    expect(here.status()).not.toContain("stale");
    here.write("src/components/Cta.tsx", "export const Cta = () => <button>Try it</button>;\n");
    here.git("add", "src/components/Cta.tsx");
    here.git("commit", "--quiet", "--no-verify", "-m", "cta");
    const { marks } = marksAt(here.root, `.greenline/ledger/${ID}/marks.jsonl`);
    expect(here.status()).toContain(
      `marks: 1 open on /plans; 1 stale since its capture (${marks[0]?.id ?? ""})`,
    );
  });

  it("refuses a closure without the owner's act, keeps a proposal open, and closes on the owner's words", () => {
    const here = space();
    here.mark(...ADD);
    const file = `.greenline/ledger/${ID}/marks.jsonl`;
    const id = marksAt(here.root, file).marks[0]?.id ?? "";
    const bare = here.mark("close", id, "--as", "addressed");
    expect(bare.code).toBe(1);
    expect(bare.err).toContain("a mark closes only on the owner's act");
    const proposal = here.mark(
      "propose",
      id,
      "--capture",
      CAPTURE,
      "--note",
      "Moved above the fold.",
    );
    expect(proposal.code, proposal.err).toBe(0);
    expect(marksAt(here.root, file).marks[0]).toMatchObject({
      state: "open",
      proposed: { as: "addressed", capture: CAPTURE, note: "Moved above the fold." },
    });
    expect(here.status()).toContain("marks: 1 open on /plans");
    const closed = here.mark("close", id, "--as", "addressed", "--words", "yes, that is fixed");
    expect(closed.code, closed.err).toBe(0);
    expect(marksAt(here.root, file).marks[0]).toMatchObject({
      state: "addressed",
      closed: { by: "owner", via: "words", words: "yes, that is fixed" },
    });
    expect(readFileSync(join(here.root, file), "utf8").trim().split("\n")).toHaveLength(3);
    expect(here.status()).not.toContain("marks:");
    expect(here.mark("close", id, "--as", "declined", "--words", "no").code).toBe(1);
  });

  it("J-129 S5 closes a mark in words only on the owner's verdict: a delegation or a deferral is refused naming the rule", () => {
    const here = space();
    here.mark(...ADD);
    const file = `.greenline/ledger/${ID}/marks.jsonl`;
    const id = marksAt(here.root, file).marks[0]?.id ?? "";
    for (const words of [
      "close them all yourself, I have not looked yet",
      "Whatever you think",
      "your call",
      "I haven't looked at it",
    ]) {
      const refused = here.mark("close", id, "--as", "addressed", "--words", words);
      expect([words, refused.code]).toEqual([words, 1]);
      // J-144 S3: in the agent's own words, why an unseen mark cannot close and what closes it.
      expect(refused.err).toContain(
        `I can't close the mark ${id} on these words: they leave the verdict to me or for later`,
      );
      expect(refused.err).toContain("a mark you have not judged is not mine to close");
      expect(refused.err).toContain(
        "so it stays open: open it in greenline inspect and close it there, or give your verdict on that mark in a word",
      );
      expect(refused.err).toContain(
        "a mark closes in words only on the owner's verdict on that mark",
      );
      expect(refused.err).not.toMatch(/the command refuses/i);
    }
    const vague = here.mark("close", id, "--as", "addressed", "--words", "sure thing, go on");
    expect(vague.code).toBe(1);
    expect(vague.err).toContain(
      `I can't close the mark ${id} on these words: they give no verdict on it`,
    );
    expect(marksAt(here.root, file).marks[0]).toMatchObject({ state: "open", closed: null });
    // The refusal names every outcome word the rule takes.
    const refusedText = here.mark("close", id, "--as", "addressed", "--words", "close them all");
    expect(refusedText.err).toContain(
      "in a word, fixed, done, fine, good, ok, okay, yes, decline, declined, no or drop,",
    );
    const fine = here.mark("close", id, "--as", "addressed", "--words", "the button is fine now");
    expect(fine.code, fine.err).toBe(0);
    expect(marksAt(here.root, file).marks[0]).toMatchObject({
      state: "addressed",
      closed: { by: "owner", via: "words", words: "the button is fine now" },
    });
    // Words that name the mark's note close it too, with no outcome word.
    const named = space();
    named.mark(...ADD);
    const other = marksAt(named.root, file).marks[0]?.id ?? "";
    const fold = named.mark(
      "close",
      other,
      "--as",
      "addressed",
      "--words",
      "it sits above the fold at last",
    );
    expect(fold.code, fold.err).toBe(0);
  });

  it("J-143 S2 reads one sentence the same for each mark it names by its note's words, a short pair of them included", () => {
    const here = space();
    const add = (selector: string, note: string, words: string): void => {
      const added = here.mark(
        ...ADD.slice(0, ADD.indexOf("--selector")),
        "--selector",
        selector,
        "--note",
        note,
        "--intent",
        "fix",
        "--words",
        words,
      );
      expect(added.code, added.err).toBe(0);
    };
    // The two marks of the run, their notes as the owner's words gave them; the rail's element shares no word with the sentence.
    add(
      "main > p",
      "On a phone the rail takes the whole top of the page; make it a top bar with the two links side by side.",
      "on my phone the menu eats the top of the page, make it a bar with the two links next to each other",
    );
    add(
      "#start-trial",
      "On a phone the sign-up button is squeezed beside the heading; make it a full-width button under the heading at 390.",
      "on my phone the sign up button is squeezed next to the heading, make it full width under it",
    );
    const file = `.greenline/ledger/${ID}/marks.jsonl`;
    const [rail, button] = marksAt(here.root, file).marks.map((mark) => mark.id);
    const sentence = "The button is right now, and the top bar too; close those two.";
    for (const id of [rail ?? "", button ?? ""]) {
      const closed = here.mark("close", id, "--as", "addressed", "--words", sentence);
      expect([id, closed.code, closed.err]).toEqual([id, 0, ""]);
    }
    expect(marksAt(here.root, file).marks.map((mark) => mark.state)).toEqual([
      "addressed",
      "addressed",
    ]);
  });

  it("refuses a mark the agent records without the owner's words, and one naming no element of the capture", () => {
    const here = space();
    expect(here.mark(...ADD.slice(0, -2)).code).toBe(2);
    const missing = here.mark(...ADD.map((arg) => (arg === "#start-trial" ? "#gone" : arg)));
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("No element #gone at 390");
    expect(readMarks("{}\n").unreadable).toHaveLength(1);
  });

  it("refuses a line that would not read back, a blank note or a blank proposal, and writes nothing", () => {
    const here = space();
    const blank = here.mark(...ADD.map((arg) => (arg.startsWith("The call") ? "   " : arg)));
    expect(blank.code).toBe(1);
    expect(blank.err).toContain("The mark does not read");
    expect(existsSync(join(here.root, `.greenline/ledger/${ID}/marks.jsonl`))).toBe(false);
    here.mark(...ADD);
    const file = `.greenline/ledger/${ID}/marks.jsonl`;
    const id = marksAt(here.root, file).marks[0]?.id ?? "";
    expect(here.mark("propose", id, "--note", "  ").code).toBe(1);
    expect(readFileSync(join(here.root, file), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("keeps a proposal's after from being overwritten, as it keeps the marked capture", () => {
    const here = space();
    here.mark(...ADD);
    const file = `.greenline/ledger/${ID}/marks.jsonl`;
    const id = marksAt(here.root, file).marks[0]?.id ?? "";
    expect(markedCaptures(here.root).has(`${ID}/capture-after`)).toBe(false);
    here.write(
      `.greenline/visuals/${ID}/capture-after.visual.json`,
      readFileSync(join(here.root, `.greenline/visuals/${ID}/capture-plans.visual.json`), "utf8"),
    );
    expect(
      here.mark("propose", id, "--capture", `${ID}/capture-after`, "--note", "Moved.").code,
    ).toBe(0);
    expect(markedCaptures(here.root).has(`${ID}/capture-after`)).toBe(true);
  });

  it("names a mark stale by the interface roots where its capture covers no file and its element names no source", () => {
    const here = space();
    const manifest = `.greenline/visuals/${ID}/capture-plans.visual.json`;
    here.write(
      manifest,
      readFileSync(join(here.root, manifest), "utf8").replace(
        '"files":["src/components/Cta.tsx"]',
        '"files":[]',
      ),
    );
    expect(here.mark(...ADD.map((arg) => (arg === "#start-trial" ? "main > p" : arg))).code).toBe(
      0,
    );
    expect(here.status()).not.toContain("stale");
    here.write("src/components/Other.tsx", "export const Other = () => 2;\n");
    here.git("add", "src/components/Other.tsx");
    here.git("commit", "--quiet", "--no-verify", "-m", "other");
    expect(here.status()).toContain("1 stale since its capture");
  });

  it("takes the owner's mark and closure from the viewer with the revision check", async () => {
    const here = space();
    const handle = await startInspector(
      here.root,
      { cwd: here.root, version: VERSION, installation: fixtureInstallation() },
      0,
    );
    try {
      const read = async () => {
        const parsed = parseInspectorDocument(
          z.json().parse(parseJson(await (await fetch(`${handle.url}api/interface`)).text())),
        );
        if (parsed._tag === "err" || parsed.value.kind !== "interface") throw new Error("no notes");
        return { revision: parsed.value.notes.revision, marks: parsed.value.notes.notes };
      };
      const before = await read();
      expect(before).toMatchObject({ revision: "none", marks: [] });
      const post = (path: string, body: Readonly<Record<string, string | number>>) =>
        fetch(`${handle.url}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const mark = {
        capture: CAPTURE,
        width: 768,
        selector: "#start-trial",
        note: "Make it the accent.",
        intent: "options",
        revision: before.revision,
      };
      expect((await post("api/marks", mark)).status).toBe(200);
      expect((await post("api/marks", mark)).status).toBe(409);
      const after = await read();
      const view = after.marks[0];
      expect(view).toMatchObject({
        file: `.greenline/ledger/${ID}/marks.jsonl`,
        change: ID,
        stale: false,
        after: null,
        mark: { by: "owner", words: null, intent: "options" },
      });
      const id = view?.mark.id ?? "";
      expect(
        (await post(`api/marks/${id}/close`, { as: "declined", revision: before.revision })).status,
      ).toBe(409);
      expect(
        (await post(`api/marks/${id}/close`, { as: "declined", revision: after.revision })).status,
      ).toBe(200);
      expect((await read()).marks[0]?.mark).toMatchObject({
        state: "declined",
        closed: { by: "owner", via: "viewer", words: null },
      });
    } finally {
      await handle.close();
    }
  });

  it("refuses a hand edit of a marks file in the hook", () => {
    const here = space();
    const writer = new RecordingWriter();
    const code = runEventCli(["--harness", "claude-code"], writer.writer, {
      cwd: here.root,
      stdin: () =>
        JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: {
            file_path: join(here.root, `.greenline/ledger/${ID}/marks.jsonl`),
            content: "x",
          },
        }),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });
    expect(code).toBe(2);
    expect(writer.err).toMatch(
      /^the owner's marks are not edited by hand, so the write to .* is stopped; change them through greenline mark .*; marks-by-hand, greenline's harness hook\n$/,
    );
  });
});
