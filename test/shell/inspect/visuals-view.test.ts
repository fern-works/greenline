/**
 * The inspector's visual home through its real seam (J-110 S2 and S7): the
 * Visuals documents with each visual's tier, the map first; one visual with
 * its picture's bytes served apart under their own policy; the atlas's
 * bands and pages; the drift on the Now desk; the change's links; and the
 * view's one write, the delete, refused on a stale revision.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isJsonObject, parseJson } from "../../../src/core/contract.ts";
import { parseInspectorDocument } from "../../../src/core/inspector/contract.ts";
import type { InspectorDocument } from "../../../src/core/inspector/documents.ts";
import { manifestWithMaker } from "../../../src/core/visuals.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { isValidElement, type ComponentChild } from "preact";
import { AtlasEmpty, VisualCard, VisualPicture } from "../../../src/shell/inspect/app/atlas.ts";
import {
  atlasDocument,
  CAPTURE_POLICY,
  VISUAL_POLICY,
} from "../../../src/shell/inspect/visuals.ts";
import { CHANGE, OLDER, visualsWorkspace, type VisualsWorkspace } from "./visuals-fixture.ts";

let space: VisualsWorkspace | undefined;
let handle: InspectorHandle | undefined;

beforeAll(async () => {
  space = visualsWorkspace();
  handle = await startInspector(space.root, space.env, 0);
});

afterAll(async () => {
  await handle?.close();
  if (space !== undefined) rmSync(space.root, { recursive: true, force: true });
});

function url(path: string): string {
  if (handle === undefined) throw new Error("the inspector did not start");
  return handle.url + path;
}

async function document(path: string): Promise<InspectorDocument> {
  const response = await fetch(url(path));
  expect(response.status, path).toBe(200);
  const body = parseJson(await response.text());
  if (body === undefined || !isJsonObject(body)) throw new Error(`${path}: no JSON object`);
  const parsed = parseInspectorDocument(body);
  if (parsed._tag === "err")
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path} ${issue.message}`).join("; "),
    );
  return parsed.value;
}

describe("J-110 S2 the Visuals view's documents", () => {
  it("lists every visual with its tier, the map and the journeys first, the changes newest first", async () => {
    const list = await document("api/pictures");
    if (list.kind !== "pictures" || !list.pictures.available) throw new Error("no visuals");
    expect(list.pictures.items.map((visual) => [visual.id, visual.tier])).toEqual([
      ["map/architecture", "drifting"],
      ["subsystems/http/a-request", "fresh"],
      [`${CHANGE}/request-path`, "drifting"],
      [`${OLDER}/login-states`, "stale"],
    ]);
    const drawing = list.pictures.items[2];
    expect(drawing?.commitsSince).toBe(1);
    expect(drawing?.file).toEqual({
      path: `.greenline/visuals/${CHANGE}/request-path.svg`,
      kind: "svg",
    });
    expect(list.pictures.items[3]?.commitsSince).toBeNull();
  });

  it("opens one visual by its id, a Markdown one rendered, and answers 404 for an id the home does not hold", async () => {
    const one = await document(`api/pictures/${OLDER}/login-states`);
    if (one.kind !== "picture") throw new Error("not a visual");
    expect(one.html).toContain("<code>open</code>");
    const svg = await document(`api/pictures/${CHANGE}/request-path`);
    if (svg.kind !== "picture") throw new Error("not a visual");
    expect(svg.html).toBeNull();
    for (const path of [
      "api/pictures/map/nothing",
      `api/pictures/${CHANGE}/..%2F..%2Fmanifest`,
      "api/pictures/..",
    ])
      expect((await fetch(url(path))).status, path).toBe(404);
  });

  it("serves an SVG's and an HTML page's own bytes under the visual's policy, and no Markdown or unknown one", async () => {
    const svg = await fetch(url(`raw/visuals/${CHANGE}/request-path`));
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(svg.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(svg.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(svg.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await fetch(url("raw/visuals/map/architecture"));
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await html.text()).toContain("The map.");
    expect((await fetch(url(`raw/visuals/${OLDER}/login-states`))).status).toBe(404);
    expect((await fetch(url("raw/visuals/map/elsewhere"))).status).toBe(404);
  });

  it("lets the shell frame its own origin and nothing else", async () => {
    const shell = await fetch(url("knowledge/pictures"));
    expect(shell.headers.get("content-security-policy")).toContain("frame-src 'self'");
    const page = await fetch(url(`pictures/${CHANGE}/request-path`));
    expect(page.status).toBe(200);
  });
});

describe("J-110 S7 the atlas's documents", () => {
  it("draws the map's bands from the index's layers, each subsystem with its tier, and the pages with their journeys", async () => {
    const atlas = await document("api/atlas");
    if (atlas.kind !== "atlas" || !atlas.map.available || !atlas.subsystems.available)
      throw new Error("no atlas");
    expect(atlas.map.items).toEqual([
      { name: "entry", subsystems: [{ name: "http", tier: "fresh" }] },
      { name: "core", subsystems: [{ name: "cache", tier: "drifting" }] },
    ]);
    const http = atlas.subsystems.items.find((entry) => entry.name === "http");
    expect(http?.journeys.map((journey) => journey.id)).toEqual(["subsystems/http/a-request"]);
    expect(atlas.subsystems.items.find((entry) => entry.name === "cache")?.calledBy).toEqual([
      "http",
    ]);
    const page = await document("api/atlas/subsystems/http");
    if (page.kind !== "subsystem") throw new Error("not a page");
    expect(page.html).toContain("Overview");
    const unwritten = await document("api/atlas/subsystems/cache");
    if (unwritten.kind !== "subsystem") throw new Error("not a page");
    expect(unwritten.html).toBeNull();
    expect((await fetch(url("api/atlas/subsystems/none"))).status).toBe(404);
  });

  it("puts the drift on the Now desk: the visuals and the page that drifted", async () => {
    const now = await document("api/desk");
    if (now.kind !== "desk" || !now.drift.available) throw new Error("no drift");
    expect(now.drift.items.map((notice) => [notice.kind, notice.id, notice.tier])).toEqual([
      ["visual", `${OLDER}/login-states`, "stale"],
      ["visual", `${CHANGE}/request-path`, "drifting"],
      ["visual", "map/architecture", "drifting"],
      ["subsystem", "cache", "drifting"],
      ["document", "README.md", "drifting"],
    ]);
    // J-147 S5: a document's notice says whose it is.
    expect(now.drift.items.at(-1)?.detail).toContain(
      "the owner's page, offered and never rewritten unasked",
    );
  });
});

describe("J-147 S5 the atlas's empty state, the documents and the refreshes, no offer among them (J-176 S1)", () => {
  it("carries the standing, the documents with their tiers and authors, and the index's refreshes", async () => {
    const atlas = await document("api/atlas");
    if (atlas.kind !== "atlas" || !atlas.documents.available) throw new Error("no atlas");
    // One of the two pages drifting is a third of them or more, a major change since the map.
    expect(atlas.standing).toEqual({
      pages: 2,
      major: "1 of the atlas's 2 pages drift",
      mapBehind: 1,
    });
    expect(atlas.documents.items).toEqual([
      expect.objectContaining({
        path: "README.md",
        author: "owner",
        files: ["src/cache.ts"],
        tier: "drifting",
        commitsSince: 1,
      }),
    ]);
    expect(atlas.refreshes).toEqual([
      { change: CHANGE, whole: false, pages: ["http"], cost: "one agent, four minutes" },
    ]);
  });

  it("opens a listed document's page rendered, and answers 404 for a path the index does not list", async () => {
    const page = await document("api/atlas/documents/README.md");
    if (page.kind !== "document") throw new Error("not a document");
    expect(page.document.tier).toBe("drifting");
    expect(page.html).toContain("The cache keeps the answers.");
    for (const path of [
      "api/atlas/documents/src/cache.ts",
      "api/atlas/documents/..%2F..%2Fetc%2Fpasswd",
    ])
      expect((await fetch(url(path))).status, path).toBe(404);
  });

  it("says no map yet where the atlas holds no page", () => {
    // A plain repository with no visual home: the document is read straight from the builder, no server.
    const bare = mkdtempSync(join(tmpdir(), "greenline-atlas-empty-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: bare });
      const atlas = atlasDocument(bare);
      expect(atlas.standing).toEqual({ pages: 0, major: null, mapBehind: null });
      expect(atlas.documents).toEqual({ available: true, items: [] });
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("draws the empty state as the owner's ask, and a major change as a fact", () => {
    const words = (node: ComponentChild): string => JSON.stringify(node);
    const empty = words(AtlasEmpty({ standing: { pages: 0, major: null, mapBehind: null } }));
    // Named Atlas, so the Maps tab's "No map yet" is never the atlas's (J-221 S1).
    expect(empty).toContain("No atlas yet.");
    expect(empty).not.toContain("No map yet.");
    expect(empty).toContain("how does this code fit together?");
    expect(empty).toContain("The map is made on the owner's ask");
    expect(empty).not.toContain("offer");
    expect(
      words(
        AtlasEmpty({
          standing: {
            pages: 0,
            major: "a new top-level module, billing/, holds code",
            mapBehind: null,
          },
        }),
      ),
    ).toContain("A major change since the map: a new top-level module, billing/, holds code.");
  });

  it("lists a record's refreshes on its change's page", async () => {
    if (space === undefined) throw new Error("no workspace");
    writeFileSync(
      join(space.root, `.greenline/ledger/${CHANGE}.md`),
      [
        "---",
        "mode: quick",
        "choice: accepted",
        'why: "long cache headers"',
        "state: open",
        "refreshes:",
        '  - { by: explain, pages: "http, map", cost: "one agent, four minutes" }',
        "---",
        "",
        "## frame",
        "",
        "Serve the assets with long cache headers.",
        "",
      ].join("\n"),
    );
    try {
      const page = await document(`api/changes/${CHANGE}`);
      if (page.kind !== "change") throw new Error("no change");
      expect(page.change.card.refreshes).toEqual([
        { by: "explain", pages: "http, map", cost: "one agent, four minutes" },
      ]);
    } finally {
      rmSync(join(space.root, `.greenline/ledger/${CHANGE}.md`), { force: true });
    }
  });
});

describe("J-110 S2 the delete, the view's one write", () => {
  /** A delete's body as the app sends it, or a malformed one missing its revision. */
  interface DeleteBody {
    readonly id: string;
    readonly expectedRevision?: string;
  }
  const remove = (body: DeleteBody | Record<string, never>) =>
    fetch(url("api/pictures/delete"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("refuses a stale revision with 409 and a malformed body with 400, then deletes the visual and its manifest and keeps the links file", async () => {
    const root = space?.root ?? "";
    const id = `${CHANGE}/request-path`;
    const stale = await remove({ id, expectedRevision: "0".repeat(64) });
    expect(stale.status).toBe(409);
    expect((await remove({ id })).status).toBe(400);
    const read = await document(`api/pictures/${id}`);
    if (read.kind !== "picture") throw new Error("not a visual");
    const done = await remove({ id, expectedRevision: read.picture.revision });
    expect(done.status).toBe(200);
    expect(existsSync(join(root, `.greenline/visuals/${CHANGE}/request-path.svg`))).toBe(false);
    expect(existsSync(join(root, `.greenline/visuals/${CHANGE}/request-path.visual.json`))).toBe(
      false,
    );
    expect((await fetch(url(`api/pictures/${id}`))).status).toBe(404);
    expect((await remove({ id, expectedRevision: read.picture.revision })).status).toBe(409);
    const links = readFileSync(join(root, `.greenline/ledger/${CHANGE}/visuals.json`), "utf8");
    expect(links).toContain('"generatedBy": "greenline inspect"');
    expect(links).not.toContain("request-path");
  });

  it("refuses a delete from another origin", async () => {
    const foreign = await fetch(url("api/pictures/delete"), {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://elsewhere.test" },
      body: "{}",
    });
    expect(foreign.status).toBe(403);
  });
});

describe("J-129 S6 the visual's maker on the view", () => {
  it("carries the manifest's madeBy, null where no hook recorded one", async () => {
    if (space === undefined) throw new Error("no workspace");
    const before = await document("api/pictures/map/architecture");
    if (before.kind !== "picture") throw new Error("no visual");
    expect(before.picture.madeBy).toBeNull();
    const path = join(space.root, ".greenline/visuals/map/architecture.visual.json");
    writeFileSync(path, manifestWithMaker(readFileSync(path, "utf8"), "session") ?? "");
    const after = await document("api/pictures/map/architecture");
    if (after.kind !== "picture") throw new Error("no visual");
    expect(after.picture.madeBy).toBe("session");
  });
});

describe("J-144 S7 the picture page embeds every kept visual as its raw route serves it", () => {
  /** The Linear clone's kind of kept visual: a screen mockup of three looks, an HTML page with no script. */
  const LOOKS =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Three looks</title><style>:root{color-scheme:light dark}body{margin:0;background:#eceef2}.screen{width:1440px;height:560px}</style></head><body><section class="look"><h2>Look 1: Mist</h2><div class="screen"></div></section></body></html>\n';

  /** Plants the looks page and its manifest, so each test of this block stands alone. */
  const plantLooks = (): string => {
    if (space === undefined) throw new Error("no workspace");
    const folder = join(space.root, ".greenline", "visuals", CHANGE);
    writeFileSync(join(folder, "looks.html"), LOOKS);
    writeFileSync(
      join(folder, "looks.visual.json"),
      `${JSON.stringify({ schema: "greenline.visual/v1", title: "Three looks", form: "screen mockup", skill: "design", change: CHANGE, commit: "0".repeat(40), files: [], made: "2026-10-27", summary: "The three looks." })}\n`,
    );
    return folder;
  };

  it("serves the looks page's own bytes as HTML under the visual's sandbox, and a capture's with no script", async () => {
    const folder = plantLooks();
    const raw = await fetch(url(`raw/visuals/${CHANGE}/looks`));
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(raw.headers.get("content-security-policy")).toBe(VISUAL_POLICY);
    // The page's frame and the route read the same bytes.
    expect(await raw.text()).toBe(readFileSync(join(folder, "looks.html"), "utf8"));
    const page = await document(`api/pictures/${CHANGE}/looks`);
    if (page.kind !== "picture") throw new Error("not a visual");
    expect(page.picture.file).toEqual({
      path: `.greenline/visuals/${CHANGE}/looks.html`,
      kind: "html",
    });
    // A capture runs nothing of the owner's page, by the route's own policy.
    writeFileSync(join(folder, "shot.html"), "<!doctype html><p>the page</p>\n");
    writeFileSync(
      join(folder, "shot.visual.json"),
      `${JSON.stringify({ schema: "greenline.visual/v1", title: "The page", form: "capture", skill: "design", change: CHANGE, commit: "0".repeat(40), files: [], made: "2026-10-27", summary: "The page, captured." })}\n`,
    );
    const shot = await fetch(url(`raw/visuals/${CHANGE}/shot`));
    expect(shot.headers.get("content-security-policy")).toBe(CAPTURE_POLICY);
    expect(CAPTURE_POLICY).toMatch(/script-src 'none'.*; sandbox$/);
    expect(VISUAL_POLICY).toMatch(/; sandbox allow-scripts$/);
  });

  it("frames the raw route with no sandbox attribute a client could refuse, the route's policy the sandbox", async () => {
    plantLooks();
    const page = await document(`api/pictures/${CHANGE}/looks`);
    if (page.kind !== "picture") throw new Error("not a visual");
    const drawn = VisualPicture({ visual: page.picture, html: page.html });
    const frame = isValidElement(drawn) ? drawn.props.children : undefined;
    if (!isValidElement(frame)) throw new Error("the picture holds no frame");
    expect(frame.type).toBe("iframe");
    const props: object = frame.props;
    expect(Object.entries(props)).toContainEqual(["src", `/raw/visuals/${CHANGE}/looks`]);
    expect(Object.keys(props)).not.toContain("sandbox");
  });
});

describe("J-204 S1 the picture's card shows its brief's question and finish", () => {
  it("carries the brief's question and finish, null where the picture was kept with no brief, and the card shows them", async () => {
    if (space === undefined) throw new Error("no workspace");
    const before = await document(`api/pictures/${OLDER}/login-states`);
    if (before.kind !== "picture") throw new Error("no visual");
    expect([before.picture.question, before.picture.finish]).toEqual([null, null]);
    const path = join(space.root, `.greenline/visuals/${OLDER}/login-states.visual.json`);
    const fields = parseJson(readFileSync(path, "utf8"));
    if (fields === undefined || !isJsonObject(fields)) throw new Error("no manifest");
    const brief = {
      question: "Which parts does a request pass before the cache answers?",
      form: "sequence",
      nodes: 6,
      finish: "branded SVG",
      palette: "the style guide's",
      reader: "the owner",
    };
    writeFileSync(path, `${JSON.stringify({ ...fields, brief }, null, 2)}\n`);
    const after = await document(`api/pictures/${OLDER}/login-states`);
    if (after.kind !== "picture") throw new Error("no visual");
    expect([after.picture.question, after.picture.finish]).toEqual([
      "Which parts does a request pass before the cache answers?",
      "branded SVG",
    ]);
    const card = JSON.stringify(VisualCard({ visual: after.picture }));
    expect(card).toContain('"data-field":"finish"');
    expect(card).toContain("Which parts does a request pass before the cache answers?");
  });
});
