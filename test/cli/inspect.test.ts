/**
 * The inspector's address (J-142 S1): the address file `greenline inspect`
 * writes while it serves and removes when it stops, a stale file read as
 * not serving, `greenline view` starting a viewer where none serves and
 * printing an artefact's address, the design step's addresses among them,
 * every listed address answered by the shell and placed in its view, an id
 * the records do not hold drawn as the view's empty state, and the now page
 * rendering the mirror's lines from the one reader, each linking to its
 * view. The inspector runs as a real process where a signal stops it.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { changeOfBranch } from "../../src/core/git-hooks.ts";
import {
  INSPECT_ADDRESS_FILE,
  inspectAddressText,
  pageAddress,
} from "../../src/core/inspect-address.ts";
import { mirrorLines } from "../../src/core/mirror.ts";
import { mirrorInputOf } from "../../src/shell/cli/event.ts";
import { recordDeal } from "../../src/shell/deal-view.ts";
import { branchFacts, workspaceManifest } from "../../src/shell/hooks.ts";
import { readServing, writeAddressFile } from "../../src/shell/inspect/address-file.ts";
import { placeOf, viewOf } from "../../src/shell/inspect/app/addresses.ts";
import { drawReading, ReadState } from "../../src/shell/inspect/app/ui.ts";
import { ChangePage } from "../../src/shell/inspect/app/change-page.ts";
import {
  changeDocumentSpecimen,
  changePartsSpecimen,
} from "../../src/shell/inspect/app/fixtures.ts";
import { draw } from "../shell/inspect/draw.ts";
import { startInspector, type InspectorHandle } from "../../src/shell/inspect/server.ts";
import { runViewCli, VIEW_KINDS, viewPath } from "../../src/shell/inspect/view.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import { INTERFACE_CHANGE, interfaceWorkspace } from "../shell/inspect/interface-fixture.ts";

const ENTRY = join(import.meta.dirname, "../helpers/inspect-entry.ts");
const ID = INTERFACE_CHANGE;
const roots: string[] = [];
const children: ChildProcess[] = [];
const handles: InspectorHandle[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill("SIGKILL");
  for (const handle of handles.splice(0)) await handle.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): ReturnType<typeof interfaceWorkspace> {
  const space = interfaceWorkspace();
  roots.push(space.root);
  return space;
}

/** Wait for a reading to stand, looking every 50 ms. */
async function until<T>(read: () => T | undefined, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > end) throw new Error("the wait ran out");
    await new Promise((done) => setTimeout(done, 50));
  }
}

/** `greenline inspect` as a process of its own, on a free port. */
function inspectProcess(root: string, detached = false): ChildProcess {
  const child = spawn(process.execPath, [ENTRY, "inspect", "--port", "0"], {
    cwd: root,
    stdio: "ignore",
    detached,
  });
  children.push(child);
  return child;
}

const exited = (child: ChildProcess): Promise<void> =>
  child.exitCode !== null
    ? Promise.resolve()
    : new Promise((done) => child.once("exit", () => done()));

describe("J-158 S2 the stop", () => {
  it("exits within two seconds of a terminate, its address file gone, whatever the watcher's close does", async () => {
    const { root } = workspace();
    const child = inspectProcess(root);
    const file = await until(() => readServing(root));
    expect((await fetch(file.address)).status).toBe(200);
    const sent = Date.now();
    child.kill("SIGTERM");
    const stopped = await Promise.race([
      exited(child).then(() => Date.now() - sent),
      new Promise<null>((done) => setTimeout(() => done(null), 2_000)),
    ]);
    expect(stopped, "the inspector was still running two seconds after the terminate").not.toBe(
      null,
    );
    expect(child.exitCode).toBe(0);
    expect(existsSync(join(root, INSPECT_ADDRESS_FILE))).toBe(false);
  });
});

describe("J-142 S1 the address file", () => {
  it("is written once greenline inspect serves, ignored by git, and removed when it stops", async () => {
    const { root, git } = workspace();
    const child = inspectProcess(root);
    const file = await until(() => readServing(root));
    expect(file.pid).toBe(child.pid);
    expect(file.address).toBe(`http://127.0.0.1:${String(file.port)}/`);
    expect(file.generatedBy).toBe("greenline inspect");
    expect((await fetch(file.address)).status).toBe(200);
    expect(git("status", "--porcelain")).not.toContain("inspect.json");
    child.kill("SIGTERM");
    await exited(child);
    expect(existsSync(join(root, INSPECT_ADDRESS_FILE))).toBe(false);
    child.kill("SIGINT");
  });

  it("J-154 S2 prints each document read's time with --timing, built the first time and from the cache after", async () => {
    const { root } = workspace();
    const started = Date.now();
    const child = spawn(process.execPath, [ENTRY, "inspect", "--port", "0", "--timing"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    });
    children.push(child);
    let printed = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      printed += chunk.toString("utf8");
    });
    const phases: string[] = [];
    const timed = (): string[] =>
      printed.split("\n").filter((line) => line.startsWith("greenline inspect: read /api/atlas "));
    // What a failure shows: the server's own lines, how long each phase took and the load.
    const words = (): string =>
      `${timed().join(" | ") || "no line"}; ${phases.join(", ") || "no phase done"}; under a one-minute load of ${(loadavg()[0] ?? 0).toFixed(1)}`;
    const waited = async <T>(read: () => T | undefined, ms: number, phase: string): Promise<T> => {
      try {
        const value = await until(read, ms);
        phases.push(`${phase} at ${String(Date.now() - started)} ms`);
        return value;
      } catch {
        throw new Error(`${phase} did not come within ${String(ms)} ms: ${words()}`);
      }
    };
    const file = await waited(() => readServing(root), 30_000, "the address file");
    const read = async (): Promise<void> => {
      expect((await fetch(`${file.address}api/atlas`)).status, words()).toBe(200);
    };
    await read();
    const [first] = await waited(
      () => (timed().length >= 1 ? timed() : undefined),
      15_000,
      "the first read's line",
    );
    expect(first, words()).toMatch(
      /^greenline inspect: read \/api\/atlas [\d.]+ ms, built in [\d.]+ ms on thread [1-9]\d*$/,
    );
    // A read again comes from the cache once the state stops moving; a busy machine may move it once more.
    const cached = /^greenline inspect: read \/api\/atlas [\d.]+ ms from the cache$/;
    const end = Date.now() + 20_000;
    while (!timed().some((line) => cached.test(line)) && Date.now() < end) {
      const before = timed().length;
      await read();
      await waited(
        () => (timed().length > before ? true : undefined),
        10_000,
        "a later read's line",
      );
    }
    expect(
      timed().some((line) => cached.test(line)),
      words(),
    ).toBe(true);
    child.kill("SIGTERM");
    await exited(child);
  }, 90_000); // A process of its own, its builder threads and two reads, on a machine that may be busy.

  it("reads a file whose process is gone, or that does not read, as not serving", () => {
    const { root } = workspace();
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    const path = join(root, INSPECT_ADDRESS_FILE);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, inspectAddressText(7433, gone, "2026-10-27T10:00:00.000Z"));
    expect(readServing(root)).toBeUndefined();
    expect(readServing(root, () => true)?.port).toBe(7433);
    writeAddressFile(root, 7433);
    expect(readServing(root)?.pid).toBe(process.pid);
    writeFileSync(path, '{"generatedBy":"greenline inspect","address":"http://example.com/"}\n');
    expect(readServing(root, () => true)).toBeUndefined();
  });
});

describe("J-142 S1 greenline view", () => {
  it("starts a viewer where none serves, prints the artefact's address, and on one serving prints without starting", async () => {
    const { root } = workspace();
    let started = 0;
    const start = (at: string): void => {
      started += 1;
      inspectProcess(at, true);
    };
    const first = new RecordingWriter();
    expect(await runViewCli(["change", ID], first.writer, { cwd: root, start }), first.err).toBe(0);
    expect(started).toBe(1);
    const file = readServing(root);
    if (file === undefined) throw new Error("no address file after greenline view");
    expect(first.out).toBe(`${pageAddress(file.address, `/changes/${ID}`)}\n`);
    const page = await fetch(first.out.trim());
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const again = new RecordingWriter();
    expect(await runViewCli(["deal", ID], again.writer, { cwd: root, start })).toBe(0);
    expect(started).toBe(1);
    expect(again.out).toBe(`${pageAddress(file.address, `/changes/${ID}/deal`)}\n`);
    process.kill(file.pid, "SIGTERM");
    await until(() => (existsSync(join(root, INSPECT_ADDRESS_FILE)) ? undefined : true));
  });

  it("starts a viewer where the address file's process runs but nothing answers at its address", async () => {
    const { root, env } = workspace();
    // A port that was free a moment ago, its file naming this live process: a reused process id.
    const probe = await startInspector(root, env, 0);
    const port = probe.port;
    await probe.close();
    writeAddressFile(root, port);
    let started = 0;
    const writer = new RecordingWriter();
    const code = await runViewCli(["now"], writer.writer, {
      cwd: root,
      start: (at) => {
        started += 1;
        inspectProcess(at, true);
      },
    });
    expect(code, writer.err).toBe(0);
    expect(started).toBe(1);
    const file = readServing(root);
    expect(file?.pid).not.toBe(process.pid);
    expect(writer.out).toBe(`${pageAddress(file?.address ?? "", "/")}\n`);
    if (file !== undefined) process.kill(file.pid, "SIGTERM");
  });

  it("refuses an artefact it does not name and arguments that do not fit, outside a workspace too", async () => {
    const { root } = workspace();
    const start = (): void => {
      throw new Error("no viewer starts for a refusal");
    };
    for (const argv of [["nothing"], ["change"], ["capture", ID, "/pricing", "wide"]]) {
      const writer = new RecordingWriter();
      expect(await runViewCli(argv, writer.writer, { cwd: root, start }), argv.join(" ")).toBe(2);
      expect(writer.out).toBe("");
    }
    const help = new RecordingWriter();
    expect(await runViewCli(["--help"], help.writer, { cwd: root, start })).toBe(0);
    for (const kind of VIEW_KINDS) expect(help.out).toContain(`  ${kind.kind}`);
    const outside = new RecordingWriter();
    expect(await runViewCli(["now"], outside.writer, { cwd: dirname(root), start })).toBe(1);
  });

  it("names every artefact's address, the design step's among them, each placed in its view", () => {
    const { root } = workspace();
    recordDeal(root, ID, `/changes/${ID}/deal?register=site&job=sign-up&seed=7&reroll=1`);
    // J-144 S7: the address names the reroll the command dealt, the three the owner picks from.
    const deal = "register=site&job=sign-up&seed=7&reroll=1";
    const expected: readonly (readonly [string, readonly string[], string, string])[] = [
      // J-164 S1: each under the five places; a capture's page lights Interface once it is read.
      ["now", [], "/", "desk"],
      ["change", [ID], `/changes/${ID}`, "changes"],
      ["waiting", [ID], `/changes/${ID}/waiting`, "changes"],
      ["step", [ID, "build"], `/changes/${ID}/build`, "changes"],
      ["frame", [ID], `/changes/${ID}/frame-map`, "changes"],
      ["question", [ID, "scope"], `/changes/${ID}/frame-map/scope`, "changes"],
      ["deal", [ID], `/changes/${ID}/deal?${deal}`, "changes"],
      ["specimen", [ID, "Calm Ledger"], `/changes/${ID}/deal/Calm%20Ledger?${deal}`, "changes"],
      ["report", [ID, "design-1"], `/changes/${ID}/files/design-1.md`, "changes"],
      ["report", [ID, "review-1"], `/changes/${ID}/files/review-1.md`, "changes"],
      ["visuals", [], "/knowledge/pictures", "knowledge"],
      ["visual", [ID, "flow"], `/pictures/${ID}/flow`, "knowledge"],
      ["captures", [ID], `/changes/${ID}/captures`, "changes"],
      [
        "capture",
        [ID, "/pricing", "768"],
        `/pictures/${ID}/capture-pricing?width=768`,
        "knowledge",
      ],
      ["interfaces", [], "/interface", "interface"],
      ["marks", [], "/interface/notes", "interface"],
      ["mark", ["m5d6e7f8"], "/interface/notes/m5d6e7f8", "interface"],
      ["discussion", ["2026-10-21-offline"], "/discussions/2026-10-21-offline", "changes"],
      ["loads", [ID], `/changes/${ID}/loads`, "changes"],
      ["roster", [], "/practice/roster", "practice"],
    ];
    expect(new Set(expected.map(([kind]) => kind))).toEqual(
      new Set(VIEW_KINDS.map((entry) => entry.kind)),
    );
    for (const [kind, args, path, view] of expected) {
      const resolved = viewPath(root, kind, args);
      expect(resolved, `${kind} ${args.join(" ")}`).toEqual({ path });
      const place = placeOf(new URL(path, "http://127.0.0.1:7433").pathname);
      expect(place, path).toBeDefined();
      if (place !== undefined) expect(viewOf(place), path).toBe(view);
    }
    // A page no capture shows names the change's captures, and says so.
    expect(viewPath(root, "capture", [ID, "/members", "390"])).toEqual({
      path: `/changes/${ID}/captures`,
      note: `no capture of /members under ${ID}; the address shows the change's captures`,
    });
  });
});

describe("J-142 S1 every address answers with its view", () => {
  it("serves the shell for every listed address and for a record the repository does not hold, whose document answers 404", async () => {
    const { root, env } = workspace();
    const handle = await startInspector(root, env, 0);
    handles.push(handle);
    const paths = VIEW_KINDS.map((entry) => {
      const args = entry.args.map((arg) => (arg === "<change>" ? ID : arg.slice(1, -1)));
      const args2 = entry.kind === "capture" ? [ID, "/pricing", "390"] : args;
      const resolved = viewPath(root, entry.kind, args2);
      if ("refused" in resolved) throw new Error(resolved.refused);
      return resolved.path;
    });
    for (const path of [...paths, "/changes/2026-01-01-nothing", "/interface/notes/m0000000"]) {
      const answer = await fetch(handle.url.replace(/\/$/, "") + path);
      expect(answer.status, path).toBe(200);
      expect(answer.headers.get("content-type"), path).toContain("text/html");
    }
    expect((await fetch(`${handle.url}api/changes/2026-01-01-nothing`)).status).toBe(404);
  });

  it("draws the view's empty state, never an error, where the server holds nothing at the address", () => {
    const drawn = drawReading(
      { state: "failed", message: "No such change.", missing: true },
      () => null,
    );
    expect(drawn).toMatchObject({ props: { "data-reading": "missing" } });
    // SAFETY: the match above holds that drawReading returned the missing state's div, whose one child is a vnode.
    const inner = (drawn as { props: { children: { type: unknown; props: unknown } } }).props
      .children;
    // The one component of a read's states, at its empty face (J-158 S2).
    expect(inner.type).toBe(ReadState);
    expect(inner.props).toMatchObject({ face: "empty", title: "Nothing here by that name." });
    const failed = drawReading({ state: "failed", message: "The read failed." }, () => null);
    expect(failed).toMatchObject({ props: { "data-reading": "failed" } });
  });
});

describe("J-142 S1 a part the change does not hold", () => {
  it("opens the tab its part names, and says there what would appear where the change holds none (J-155 S2)", () => {
    const page = changeDocumentSpecimen();
    const parts = changePartsSpecimen();
    const bare = { ...page, waitingOn: null };
    const bareParts = {
      ...parts,
      frame: { ...parts.frame, map: null },
      loads: { ...parts.loads, loads: { available: true as const, items: [] } },
    };
    // The frame map opens the frame step's fold, why the Overview; both say no question was asked (J-166 S1).
    for (const [part, words] of [
      ["frame-map", "No frame question was asked."],
      ["why", "No frame question was asked."],
    ] as const) {
      const drawn = draw(
        ChangePage({ page: bare, parts: bareParts, part, file: null, changed: null }),
      );
      expect(drawn.text, part).toContain(words);
    }
    // Nothing waits: the waiting part opens the Overview with no banner.
    const waiting = draw(
      ChangePage({ page: bare, parts: bareParts, part: "waiting", file: null, changed: null }),
    );
    expect(waiting.components).not.toContain("WaitingBanner");
    expect(waiting.components).toContain("WhatYouDecided");
    const loads = draw(ChangePage({ page, parts, part: "loads", file: null, changed: null }));
    expect(loads.components).toContain("SkillChips");
  });
});

describe("J-154 S3 the mirror's lines leave the viewer", () => {
  it("serves no mirror document and no now page, and the mirror's View row names a page the viewer answers", async () => {
    const { root, env } = workspace();
    const handle = await startInspector(root, env, 0);
    handles.push(handle);
    writeAddressFile(root, handle.port);
    expect((await fetch(`${handle.url}api/mirror`)).status).toBe(404);
    expect((await fetch(`${handle.url}now`)).status).toBe(404);
    const manifest = workspaceManifest(root);
    if (manifest === undefined) throw new Error("no manifest");
    const facts = branchFacts(root);
    const input = mirrorInputOf(
      root,
      undefined,
      manifest,
      facts.current,
      changeOfBranch(facts.current, facts),
      () => env.installation.modes,
      null,
    );
    const view = mirrorLines(input).find((line) => line.fact === "view");
    expect(view?.text.trim()).toBe(`| View | ${handle.url}interface/notes |`);
    expect(placeOf("/interface/notes")).toEqual({ page: "marks" });
    expect((await fetch(`${handle.url}interface/notes`)).status).toBe(200);
  });
});
