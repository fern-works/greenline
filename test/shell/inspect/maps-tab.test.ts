/**
 * Knowledge's Maps tab (J-221 S1): the interactive companions the two
 * ingested skills make, an architecture map (`architecture-map`, form `map`)
 * and an anatomy figure (`anatomy`, form `figure`), each live in a frame of
 * its raw address with the facts its manifest and status keep. The map and
 * the figures are planted with the fields the Codex run j201t-visuals kept;
 * a diagram beside them stays off the tab, and a capture's form is
 * refused by the tab's own list of forms. Read through the real
 * seam: the inspector serves the pictures document and the tab draws it.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { h } from "preact";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isJsonObject, parseJson } from "../../../src/core/contract.ts";
import { parseInspectorDocument } from "../../../src/core/inspector/contract.ts";
import type { VisualView } from "../../../src/core/inspector/documents.ts";
import { runCli } from "../../../src/shell/cli/runner.ts";
import { MapsList } from "../../../src/shell/inspect/app/atlas.ts";
import {
  listedOnMaps,
  PLACE_TABS,
  pathOf,
  placeOf,
} from "../../../src/shell/inspect/app/addresses.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { fixtureInstallation } from "../../fixtures/corpus.ts";
import { RecordingWriter } from "../../helpers/writer.ts";
import { count, draw } from "./draw.ts";

const VERSION = "0.1.0";
const LENDING = "2026-11-09-lending-on-map";
const FIGURE_CHANGE = "2026-11-09-loan-lifecycle-figure";
const OLDER_FIGURE_CHANGE = "2026-11-02-due-dates-figure";
const DIAGRAM_CHANGE = "2026-11-08-year-search";

interface Planted {
  readonly root: string;
  readonly env: {
    readonly cwd: string;
    readonly version: string;
    readonly installation: ReturnType<typeof fixtureInstallation>;
  };
  readonly made: string;
}

let space: Planted | undefined;
let handle: InspectorHandle | undefined;

/** A workspace whose visual home holds two maps, two figures and a diagram. */
function plant(): Planted {
  const root = mkdtempSync(join(tmpdir(), "greenline-maps-tab-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=QA",
        "-c",
        "user.email=qa@invalid.local",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, ".git"));
  const writer = new RecordingWriter();
  const env = { cwd: root, version: VERSION, installation: fixtureInstallation() };
  if (runCli(["init", "--yes"], writer.writer, VERSION, env) !== 0) throw new Error(writer.err);
  rmSync(join(root, ".git"), { recursive: true });
  git("init", "--quiet");
  write("src/shelf.js", "export const shelf = [];\n");
  write("test/shelf.test.js", "// the shelf's tests\n");
  write("README.md", "# shelf\n");
  git("add", "--all");
  git("commit", "--quiet", "-m", "the shelf");
  const made = git("rev-parse", "HEAD");
  const home = ".greenline/visuals";
  const keep = (
    id: string,
    fields: Readonly<{
      title: string;
      form: string;
      skill: string;
      change: string | null;
      made: string;
      question: string;
    }>,
    files: readonly string[],
    file: string,
  ): void => {
    write(
      `${home}/${id}.visual.json`,
      `${JSON.stringify(
        {
          schema: "greenline.visual/v1",
          title: fields.title,
          form: fields.form,
          skill: fields.skill,
          change: fields.change,
          commit: made,
          files,
          made: fields.made,
          madeBy: "agent",
          summary: `${fields.title}, as made.`,
          brief: {
            question: fields.question,
            form: fields.form,
            nodes: 3,
            finish: "interactive",
            palette: "the house palette",
            reader: "a maintainer learning the shelf",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      `${home}/${id}${file.slice(file.lastIndexOf("."))}`,
      file.endsWith(".svg")
        ? "<svg/>\n"
        : `<!doctype html><title>${fields.title}</title><p>${fields.title}</p>\n`,
    );
  };
  keep(
    "map/architecture",
    {
      title: "Shelf and overdue letters",
      form: "map",
      skill: "architecture-map",
      change: LENDING,
      made: "2026-11-09",
      question: "How does lending a book work end to end in the available code?",
    },
    ["src/shelf.js", "test/shelf.test.js", "README.md"],
    "architecture.html",
  );
  keep(
    "map/a-first-cut",
    {
      title: "The first cut of the shelf",
      form: "map",
      skill: "architecture-map",
      change: null,
      made: "2026-11-01",
      question: "Which parts does the shelf hold?",
    },
    ["src/"],
    "a-first-cut.html",
  );
  keep(
    `${FIGURE_CHANGE}/loan-lifecycle`,
    {
      title: "Loan lifecycle",
      form: "figure",
      skill: "anatomy",
      change: FIGURE_CHANGE,
      made: "2026-11-09",
      question: "How does a loan open, become due or overdue, and close when returned?",
    },
    ["src/shelf.js"],
    "loan-lifecycle.html",
  );
  keep(
    `${OLDER_FIGURE_CHANGE}/due-dates`,
    {
      title: "Due dates",
      form: "figure",
      skill: "anatomy",
      change: OLDER_FIGURE_CHANGE,
      made: "2026-11-02",
      question: "When does a loan fall due?",
    },
    ["README.md"],
    "due-dates.html",
  );
  keep(
    `${DIAGRAM_CHANGE}/year-search`,
    {
      title: "Year search",
      form: "flowchart",
      skill: "diagram-design",
      change: DIAGRAM_CHANGE,
      made: "2026-11-08",
      question: "How does a search by year run?",
    },
    ["src/shelf.js"],
    "year-search.svg",
  );
  git("add", "--all");
  git("commit", "--quiet", "-m", "the pictures");
  // A commit touching the shelf: the pictures that cover it drift.
  write("src/shelf.js", "export const shelf = [1];\n");
  git("add", "--all");
  git("commit", "--quiet", "-m", "a book on the shelf");
  return { root, env, made };
}

beforeAll(async () => {
  space = plant();
  handle = await startInspector(space.root, space.env, 0);
});

afterAll(async () => {
  await handle?.close();
  if (space !== undefined) rmSync(space.root, { recursive: true, force: true });
});

async function pictures(): Promise<readonly VisualView[]> {
  if (handle === undefined) throw new Error("the inspector did not start");
  const response = await fetch(`${handle.url}api/pictures`);
  expect(response.status).toBe(200);
  const body = parseJson(await response.text());
  if (body === undefined || !isJsonObject(body)) throw new Error("no JSON object");
  const parsed = parseInspectorDocument(body);
  if (parsed._tag === "err" || parsed.value.kind !== "pictures")
    throw new Error("not the pictures document");
  if (!parsed.value.pictures.available) throw new Error("the picture home did not read");
  return parsed.value.pictures.items;
}

describe("J-221 S1 the Maps tab's address", () => {
  it("stands under Knowledge after Pictures at /knowledge/maps, and the atlas's tab is Atlas at its kept address", () => {
    expect(PLACE_TABS.knowledge.map((tab) => [tab.label, pathOf(tab.place)])).toEqual([
      ["Overview", "/knowledge"],
      ["Decisions", "/knowledge/decisions"],
      ["House rulings", "/knowledge/rulings"],
      ["Pictures", "/knowledge/pictures"],
      ["Maps", "/knowledge/maps"],
      ["Atlas", "/knowledge/map"],
      ["Subsystems", "/knowledge/subsystems"],
    ]);
    expect(placeOf("/knowledge/maps")).toEqual({ page: "atlas", tab: "maps" });
    expect(placeOf("/knowledge/maps/map/architecture")).toBeUndefined();
  });

  it("lists the forms the two skills make, a map and a figure, and no other", () => {
    expect(
      ["map", "figure", "flowchart", "sequence", "capture", "journey"].map(listedOnMaps),
    ).toEqual([true, true, false, false, false, false]);
  });

  it("is answered by the shell", async () => {
    if (handle === undefined) throw new Error("the inspector did not start");
    const answer = await fetch(`${handle.url}knowledge/maps`);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-type")).toContain("text/html");
  });
});

describe("J-221 S1 the Maps tab's cards", () => {
  it("draws every kept map and figure live in its frame, the maps first and the newest first in each", async () => {
    const items = await pictures();
    const drawn = draw(h(MapsList, { visuals: items }));
    expect(count(drawn, "MapsList")).toBe(1);
    expect(count(drawn, "MapCard")).toBe(4);
    // The home lists the older map first by its name; the tab puts the newest first.
    expect(items.filter((visual) => visual.form === "map").map((visual) => visual.id)).toEqual([
      "map/a-first-cut",
      "map/architecture",
    ]);
    // Each card's frame loads the picture's own bytes, as its page does.
    expect(drawn.frames).toEqual([
      "/raw/visuals/map/architecture",
      "/raw/visuals/map/a-first-cut",
      `/raw/visuals/${FIGURE_CHANGE}/loan-lifecycle`,
      `/raw/visuals/${OLDER_FIGURE_CHANGE}/due-dates`,
    ]);
    // The diagram is the Pictures tab's alone.
    expect(drawn.text).not.toContain("Year search");
    expect(drawn.text).toContain("Architecture maps");
    expect(drawn.text).toContain("Anatomy figures");
  });

  it("gives each card its title, question, change, commit, tier with the commits since, covered files and a link to its full page", async () => {
    if (space === undefined) throw new Error("no workspace");
    const items = await pictures();
    const map = items.find((visual) => visual.id === "map/architecture");
    if (map === undefined) throw new Error("the map is not listed");
    const drawn = draw(h(MapsList, { visuals: [map] }));
    expect(drawn.text).toContain("Shelf and overdue letters");
    expect(drawn.text).toContain(
      "Answers: How does lending a book work end to end in the available code?",
    );
    expect(drawn.links).toContain(`/changes/${LENDING}`);
    expect(drawn.text).toContain(space.made.slice(0, 7));
    expect(drawn.text).toContain("drifting");
    expect(drawn.text).toContain("1 commit since");
    for (const file of ["src/shelf.js", "test/shelf.test.js", "README.md"])
      expect(drawn.text).toContain(file);
    expect(drawn.links).toContain("/pictures/map/architecture");
    expect(drawn.text).toContain("Open full page");
    expect(drawn.text).toContain("architecture-map");
  });

  it("says no map yet where none is kept, with the sentence to say and the skill each loads", () => {
    const drawn = draw(h(MapsList, { visuals: [] }));
    expect(count(drawn, "MapCard")).toBe(0);
    expect(drawn.text).toContain("No map yet.");
    expect(drawn.text).toContain("architecture-map");
    expect(drawn.text).toContain("anatomy");
    expect(drawn.text).toContain("say to the agent");
  });
});
