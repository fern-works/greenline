import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONTRACT_DOCUMENTS,
  GENERATED_FILES,
  INSPECT_SCHEMA,
  parseInspectorDocument,
  REMAINING_DOCUMENTS,
} from "../../../src/core/inspector/contract.ts";
import { isJsonObject, parseJson, type JsonValue } from "../../../src/core/contract.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { BROKEN, CAREFUL, CAREFUL_LOADS, changesWorkspace, QUICK, REGULAR } from "./fixture.ts";
import { homesWorkspace, PLAN } from "./homes-fixture.ts";

/**
 * The contract through its real seam: every document the inspector serves,
 * read with `fetch` from a fixture workspace and validated against its
 * schema; the version rule; the kinds whose home a later version adds,
 * served empty with the reason; the generated files a change's folder may
 * hold, named once.
 */

interface Served {
  readonly root: string;
  readonly handle: InspectorHandle;
}

let changes: Served | undefined;
let homes: Served | undefined;

beforeAll(async () => {
  const one = changesWorkspace();
  changes = { root: one.root, handle: await startInspector(one.root, one.env, 0) };
  const two = homesWorkspace();
  homes = { root: two.root, handle: await startInspector(two.root, two.env, 0) };
});

afterAll(async () => {
  for (const served of [changes, homes]) {
    await served?.handle.close();
    if (served !== undefined) rmSync(served.root, { recursive: true, force: true });
  }
});

async function get(served: Served | undefined, path: string) {
  if (served === undefined) throw new Error("the inspector did not start");
  const response = await fetch(served.handle.url + path);
  const body = parseJson(await response.text());
  if (body === undefined || !isJsonObject(body)) throw new Error(`${path}: not a JSON object`);
  return { status: response.status, body };
}

/** A route's document, validated against its schema; the kind it carries. */
async function document(served: Served | undefined, path: string, kind: string) {
  const { status, body } = await get(served, path);
  expect(status, path).toBe(200);
  const parsed = parseInspectorDocument(body);
  if (parsed._tag === "err")
    throw new Error(
      `${path}: ${parsed.error.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
    );
  expect(parsed.value.schema).toBe(INSPECT_SCHEMA);
  expect(parsed.value.kind, path).toBe(kind);
  return parsed.value;
}

describe("J-116 S4 the skill loads served from the facts the hooks wrote", () => {
  it("serves a change's loads oldest first, and none for a change with no facts", async () => {
    const loads = await document(changes, `api/changes/${CAREFUL}/loads`, "skill-loads");
    if (loads.kind !== "skill-loads" || !loads.loads.available) throw new Error("no loads");
    expect(loads.loads.items.map((item) => [item.skill, item.step, item.agent])).toEqual([
      ["grilling", null, null],
      ["delivery-review", "build", null],
      ["delivery-review", "review", "r1"],
    ]);
    expect(loads.loads.items[0]).toEqual({
      skill: "grilling",
      file: "SKILL.md",
      whole: false,
      via: "sed",
      at: CAREFUL_LOADS[0]?.at,
      step: null,
      agent: null,
    });
    const none = await document(changes, `api/changes/${QUICK}/loads`, "skill-loads");
    if (none.kind !== "skill-loads") throw new Error("not loads");
    expect(none.loads).toEqual({ available: true, items: [] });
  });

  it("counts the roster's use across the changes: by step, by harness and model, the changes, and a step skill's loads off its step", async () => {
    const roster = await document(changes, "api/roster", "roster");
    if (roster.kind !== "roster" || !roster.use.available) throw new Error("no use");
    expect(roster.use.items).toEqual([
      {
        skill: "delivery-review",
        loads: 3,
        whole: 2,
        part: 1,
        steps: ["review", "build"],
        agents: ["not stated", "claude-code/opus"],
        changes: 2,
        byStep: [
          { name: "review", loads: 2 },
          { name: "build", loads: 1 },
        ],
        byAgent: [
          { name: "not stated", loads: 1 },
          { name: "claude-code/opus", loads: 2 },
        ],
        outside: 1,
        firstAt: "2026-10-05T10:00:00.000Z",
        lastAt: "2026-10-08T09:30:00.000Z",
      },
      {
        skill: "grilling",
        loads: 1,
        whole: 0,
        part: 1,
        steps: ["before the record"],
        agents: ["claude-code/opus"],
        changes: 1,
        byStep: [{ name: "before the record", loads: 1 }],
        byAgent: [{ name: "claude-code/opus", loads: 1 }],
        outside: 0,
        firstAt: "2026-10-08T08:00:00.000Z",
        lastAt: "2026-10-08T08:00:00.000Z",
      },
    ]);
  });
});

describe("J-165 S1 a skill's page and the roster's words", () => {
  it("serves a skill with its use, the changes that loaded it, the most recent first, and its every load, oldest first", async () => {
    const page = await document(changes, "api/roster/delivery-review", "skill");
    if (page.kind !== "skill") throw new Error("not a skill");
    expect(page.skill.name).toBe("delivery-review");
    expect(page.skill.description).toMatch(/[.!?]$/);
    expect(page.skillKind?.name).toBe(page.skill.kind);
    expect(page.use?.loads).toBe(3);
    expect(page.changes.map((change) => [change.change.id, change.loads, change.steps])).toEqual([
      [CAREFUL, 2, ["build", "review"]],
      [REGULAR, 1, ["review"]],
    ]);
    expect(page.loads.map((load) => [load.change, load.at])).toEqual([
      [REGULAR, "2026-10-05T10:00:00.000Z"],
      [CAREFUL, "2026-10-08T09:00:00.000Z"],
      [CAREFUL, "2026-10-08T09:30:00.000Z"],
    ]);
    const never = await document(changes, "api/roster/grilling", "skill");
    if (never.kind !== "skill") throw new Error("not a skill");
    expect(never.changes.map((change) => change.change.id)).toEqual([CAREFUL]);
    expect((await get(changes, "api/roster/no-such-skill")).status).toBe(404);
    const roster = await document(changes, "api/roster", "roster");
    if (roster.kind !== "roster") throw new Error("not the roster");
    expect(roster.kinds.map((kind) => kind.name)).toEqual(["step", "start", "habit"]);
  });
});

describe("J-117 S4 the frame map served from the change's folder or its record", () => {
  it("serves the map the folder's file holds, the record's frame read live where none stands, and no document for a change it does not hold", async () => {
    const filed = await document(changes, `api/changes/${CAREFUL}/frame`, "frame-map");
    if (filed.kind !== "frame-map" || filed.map === null) throw new Error("no map");
    expect(filed.source).toBe("file");
    expect(
      filed.map.questions.map((question) => [question.id, question.node, question.decided]),
    ).toEqual([
      ["Q1", "scope", "owner"],
      ["Q2", "data", "agent"],
    ]);
    expect(filed.map.research).toEqual([{ file: "frame-research-1.md", questions: ["Q2"] }]);
    // The record's confirmed line, the owner's words under the restatement on the Overview (J-223 S1).
    expect(filed.confirmed).toBe("Yes, move them to schema 2.");
    expect(filed.map.nodes.find((node) => node.node === "security")).toEqual({
      node: "security",
      state: "closed",
      reason: "the schema holds no secret",
      questions: [],
    });
    const read = await document(changes, `api/changes/${REGULAR}/frame`, "frame-map");
    if (read.kind !== "frame-map" || read.map === null) throw new Error("no map");
    expect(read.source).toBe("record");
    expect(read.map.questions).toEqual([]);
    expect(read.map.restatement).toBe("Uploads hang **forever** when the server stalls.");
    // The restatement rendered by the house renderer, its marks drawn, never shown raw (J-165 S1).
    expect(read.confirmed).toBeNull();
    expect(read.restatementHtml).toBe(
      "<p>Uploads hang <strong>forever</strong> when the server stalls.</p>",
    );
    const broken = await document(changes, `api/changes/${BROKEN}/frame`, "frame-map");
    if (broken.kind !== "frame-map") throw new Error("not a frame map");
    expect([broken.map, broken.reason]).toEqual([
      null,
      "the record does not parse, so its frame section is not read",
    ]);
    const unknown = await get(changes, "api/changes/2026-10-01-none/frame");
    expect(unknown.status).toBe(404);
  });
});

describe("every document validates against its schema", () => {
  it("serves each document of a workspace with changes, check facts and commits", async () => {
    const routes: readonly (readonly [string, string])[] = [
      ["api/contract", "contract"],
      ["api/desk", "desk"],
      ["api/desk?since=2026-10-01T00:00:00Z", "desk"],
      ["api/changes", "changes"],
      [`api/changes/${CAREFUL}`, "change"],
      [`api/changes/${QUICK}`, "change"],
      [`api/changes/${CAREFUL}/checks`, "check-facts"],
      [`api/changes/${CAREFUL}/commits`, "commits"],
      [`api/changes/${CAREFUL}/loads`, "skill-loads"],
      [`api/changes/${CAREFUL}/frame`, "frame-map"],
      [`api/changes/${CAREFUL}/changed`, "changed-files"],
      [`api/changes/${CAREFUL}/pictures`, "pictures"],
      [`api/changes/${CAREFUL}/notes`, "notes"],
      [`api/changes/${CAREFUL}/source`, "source"],
      [`api/changes/${CAREFUL}/interface`, "interface-checks"],
      ["api/roster/delivery-review", "skill"],
      ["api/discussions", "discussions"],
      ["api/pictures", "pictures"],
      ["api/atlas", "atlas"],
      ["api/roster", "roster"],
      ["api/practice", "practice"],
      ["api/settings", "settings"],
      ["api/practice/files/AGENTS.md", "installed-file"],
      ["api/interface", "interface"],
      ["api/plans", "plans"],
      ["api/knowledge", "homes"],
      ["api/knowledge/work", "home"],
    ];
    for (const [path, kind] of routes) await document(changes, path, kind);
  });

  it("serves the plans, a plan and every knowledge home of a workspace that keeps them", async () => {
    await document(homes, "api/plans", "plans");
    await document(homes, `api/plans/${PLAN}`, "plan");
    for (const home of ["work", "decisions", "adr", "glossary"])
      await document(homes, `api/knowledge/${home}`, "home");
  });

  it("names every document the routes serve, by artefact kind, in the contract document", async () => {
    const contract = await document(changes, "api/contract", "contract");
    if (contract.kind !== "contract") throw new Error("not the contract");
    expect(contract.version).toBe(2);
    expect(contract.documents).toEqual(CONTRACT_DOCUMENTS);
    // The design's remaining documents, each with the job that owes it (J-154 S3).
    expect(contract.remaining).toEqual(REMAINING_DOCUMENTS);
    // J-155 S2 serves the step, the file and the changed file's lines.
    for (const kind of ["step", "file", "diff"])
      expect(CONTRACT_DOCUMENTS.map((entry) => entry.kind)).toContain(kind);
    // J-165 S1 serves the record's source, so the events alone are owed.
    expect(REMAINING_DOCUMENTS.map((entry) => [entry.kind, entry.owner])).toEqual([
      ["events", "J-158"],
    ]);
    for (const kind of ["changed-files", "notes", "source", "skill"])
      expect(CONTRACT_DOCUMENTS.map((entry) => entry.kind)).toContain(kind);
    const artefacts = new Set(contract.documents.map((entry) => entry.artefact));
    for (const artefact of [
      "change",
      "check fact",
      "commit",
      "discussion",
      "visual and manifest",
      "subsystem page and journey",
      "skill load",
      "diagnostic",
      "plan and ticket",
      "knowledge home",
      "settings",
    ])
      expect(artefacts, artefact).toContain(artefact);
  });
});

describe("J-154 S2, S3 a page's one document and its tags", () => {
  it("J-165 S1 serves the change's head alone, each part at its own address, its pictures and notes its own", async () => {
    const page = await document(changes, `api/changes/${CAREFUL}`, "change");
    if (page.kind !== "change") throw new Error("not a change");
    // The head holds the record, its folder, what it waits on and its strip, and no part.
    expect(Object.keys(page).sort()).toEqual(
      ["change", "kind", "read", "ref", "schema", "state", "strip", "waitingOn"].sort(),
    );
    expect(page.strip.map((step) => step.step)).toEqual(
      page.change.sections.filter((section) => section.kind === "step").map((s) => s.heading),
    );
    expect(page.ref).toEqual({ id: CAREFUL, name: "Sessions", address: `/changes/${CAREFUL}` });
    const pictures = await document(changes, "api/pictures", "pictures");
    const own = await document(changes, `api/changes/${CAREFUL}/pictures`, "pictures");
    if (
      pictures.kind !== "pictures" ||
      own.kind !== "pictures" ||
      !pictures.pictures.available ||
      !own.pictures.available
    )
      throw new Error("no pictures");
    expect(own.pictures.items).toEqual(
      pictures.pictures.items.filter((visual) => visual.change === CAREFUL),
    );
    const facing = await document(changes, "api/interface", "interface");
    const notes = await document(changes, `api/changes/${CAREFUL}/notes`, "notes");
    if (facing.kind !== "interface" || notes.kind !== "notes") throw new Error("not the notes");
    expect(notes.notes).toEqual({
      ...facing.notes,
      notes: facing.notes.notes.filter((view) => view.change === CAREFUL),
    });
    const files = await document(changes, `api/changes/${CAREFUL}/changed`, "changed-files");
    if (files.kind !== "changed-files") throw new Error("not the files");
    expect(files.changedFiles.unknown).toBeNull();
    const checks = await document(changes, `api/changes/${CAREFUL}/checks`, "check-facts");
    if (checks.kind !== "check-facts") throw new Error("not the checks");
    expect(checks.checks.runs).toBeGreaterThan(0);
    // The head reads the record as the status derivations do: its state, its step and its strip, the list's.
    const list = await document(changes, "api/changes", "changes");
    if (list.kind !== "changes") throw new Error("not the list");
    for (const entry of list.changes) {
      const head = await document(changes, `api/changes/${entry.id}`, "change");
      if (head.kind !== "change") throw new Error("not a change");
      expect([head.state, head.change.card.step, head.strip], entry.id).toEqual([
        entry.state,
        entry.step,
        entry.strip,
      ]);
      expect(head.waitingOn, entry.id).toEqual(entry.waitingOn);
    }
    for (const aspect of ["changed", "pictures", "notes", "source", "checks"])
      expect((await get(changes, `api/changes/2026-10-01-none/${aspect}`)).status, aspect).toBe(
        404,
      );
  });

  it("J-165 S1 serves the record's source whole with its path and when it was written", async () => {
    const source = await document(changes, `api/changes/${CAREFUL}/source`, "source");
    if (source.kind !== "source") throw new Error("not the source");
    expect(source.path).toBe(`.greenline/ledger/${CAREFUL}.md`);
    expect(source.text).toBe(
      readFileSync(join(changes?.root ?? "", `.greenline/ledger/${CAREFUL}.md`), "utf8"),
    );
    expect(Number.isNaN(Date.parse(source.at ?? ""))).toBe(false);
    expect(source.change).toEqual({
      id: CAREFUL,
      name: "Sessions",
      address: `/changes/${CAREFUL}`,
    });
  });

  it("answers the first design's addresses as no document, with no converter (J-154 S3)", async () => {
    for (const path of [
      "api/now",
      "api/mirror",
      "api/pages/now",
      "api/pages/atlas",
      `api/pages/changes/${CAREFUL}`,
      `api/changes/${CAREFUL}/steps`,
      "api/state",
      "api/diagnostics",
      "api/receipts",
      "api/interfaces",
      "api/marks",
      "api/visuals",
      "api/captures/2026-10-01-a/one",
    ])
      expect((await get(changes, path)).status, path).toBe(404);
  });

  it("answers a change's page 404 for a change it does not hold", async () => {
    const { status } = await get(changes, "api/changes/2026-10-01-none");
    expect(status).toBe(404);
  });

  it("answers a document read again with its tag as not modified, and with a new tag once its state moves", async () => {
    if (changes === undefined) throw new Error("the inspector did not start");
    const address = `${changes.handle.url}api/changes/${QUICK}`;
    const first = await fetch(address);
    const tag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(tag).toMatch(/^"[0-9a-f]{32}"$/);
    const again = await fetch(address, { headers: { "if-none-match": tag ?? "" } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    mkdirSync(join(changes.root, `.greenline/ledger/${QUICK}`), { recursive: true });
    writeFileSync(join(changes.root, `.greenline/ledger/${QUICK}/note.md`), "# A note\n");
    const moved = await fetch(address, { headers: { "if-none-match": tag ?? "" } });
    expect(moved.status).toBe(200);
    expect(moved.headers.get("etag")).not.toBe(tag);
    await moved.text();
  });
});

describe("the version rule", () => {
  it("refuses a document of another version, an unknown kind and an unknown field", async () => {
    const { body } = await get(changes, "api/changes");
    expect(parseInspectorDocument(body)._tag).toBe("ok");
    const refused = (value: JsonValue): string => {
      const parsed = parseInspectorDocument(value);
      if (parsed._tag === "ok") throw new Error("accepted");
      return parsed.error.issues.map((issue) => issue.message).join("; ");
    };
    expect(refused({ ...body, schema: "greenline.inspect/v1" })).toContain("greenline.inspect/v2");
    expect(refused({ ...body, kind: "weather" })).toContain("weather");
    expect(refused({ ...body, surplus: true })).toMatch(/surplus|unrecognized/i);
    expect(refused("not a document")).toMatch(/object/i);
  });
});

describe("what the documents carry beyond today's readings", () => {
  it("gives each change in the list the step it reached and its strip, the same words in each form", async () => {
    const list = await document(changes, "api/changes", "changes");
    if (list.kind !== "changes") throw new Error("not the list");
    const careful = list.changes.find((entry) => entry.id === CAREFUL);
    expect(careful?.step).toBe("verify");
    expect(careful?.strip.map((step) => step.step)).toEqual([
      "frame",
      "design",
      "plan",
      "anticipate",
      "build",
      "review",
      "verify",
      "close",
    ]);
    expect(careful?.strip.filter((step) => step.current).map((step) => step.step)).toEqual([
      "verify",
    ]);
  });

  it("gives each commit of a change its trailers", async () => {
    const commits = await document(changes, `api/changes/${CAREFUL}/commits`, "commits");
    if (commits.kind !== "commits") throw new Error("not the commits");
    expect(commits.commits.length).toBeGreaterThan(0);
    expect(commits.commits[0]?.subject).toBe("the migration");
    expect(commits.commits[0]?.trailers).toEqual([{ key: "Greenline-Change", value: CAREFUL }]);
  });

  it("puts the changes in progress on the desk with their strips and the last close", async () => {
    const now = await document(changes, "api/desk", "desk");
    if (now.kind !== "desk") throw new Error("not the desk");
    const ids = now.inProgress.map((entry) => entry.id);
    expect(ids).toContain(CAREFUL);
    expect(ids).toContain(REGULAR);
    expect(ids).not.toContain(QUICK);
    expect(now.inProgress.every((entry) => entry.strip.length === 8)).toBe(true);
    expect(now.lastClose?.id).toBe(QUICK);
  });

  it("serves the discussions and the visual home empty where the ledger holds none, and 404 for a record they do not hold (J-110 S2, J-118 S4)", async () => {
    const discussions = await document(changes, "api/discussions", "discussions");
    if (discussions.kind !== "discussions") throw new Error("not discussions");
    expect(discussions.discussions).toEqual({ available: true, items: [] });
    const atlas = await document(changes, "api/atlas", "atlas");
    if (atlas.kind !== "atlas") throw new Error("not the atlas");
    expect(atlas.map).toEqual({ available: true, items: [] });
    expect(atlas.subsystems).toEqual({ available: true, items: [] });
    const pictures = await document(changes, "api/pictures", "pictures");
    if (pictures.kind !== "pictures") throw new Error("not the pictures");
    expect(pictures.pictures).toEqual({ available: true, items: [] });
    for (const path of [
      "api/discussions/2026-10-01-idea",
      "api/atlas/subsystems/http",
      "api/pictures/one",
      "api/pictures/2026-10-01-a/one",
      "api/marks/m0000000",
      "api/practice/files/src/app.ts",
      "api/practice/files/..%2Fsecret",
    ])
      expect((await get(changes, path)).status, path).toBe(404);
  });
});

describe("the generated files a change's folder may hold", () => {
  it("names each with its home, its generated header, its writer and whether tidy removes it", async () => {
    const contract = await document(changes, "api/contract", "contract");
    if (contract.kind !== "contract") throw new Error("not the contract");
    expect(contract.generatedFiles).toEqual(GENERATED_FILES);
    expect(GENERATED_FILES.map((file) => file.name)).toEqual([
      "skills/<date>.jsonl",
      "sessions/<date>-<session>.jsonl",
      "frame-map.json",
      "frame-research-<n>.md",
      "visuals.json",
      "survey.json",
      "paths.json",
      "interface/<stamp>.json",
      "kept.json",
      "design-pick.json",
      "marks.jsonl",
    ]);
    for (const file of GENERATED_FILES) {
      expect(file.home.length).toBeGreaterThan(0);
      expect(file.header.length).toBeGreaterThan(0);
      expect(file.writer.length).toBeGreaterThan(0);
      // tidy removes only a finished change's working folder, never a ledger file.
      expect(file.tidy).toBe(false);
    }
  });
});
