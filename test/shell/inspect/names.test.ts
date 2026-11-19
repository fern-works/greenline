import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseInspectorDocument } from "../../../src/core/inspector/contract.ts";
import type { InspectorDocument } from "../../../src/core/inspector/documents.ts";
import { isJsonObject, parseJson } from "../../../src/core/contract.ts";
import { CATALOGUE } from "../../../src/shell/inspect/app/catalogue.ts";
import { ChangeRow, LineageStrip } from "../../../src/shell/inspect/app/change.ts";
import { DiscussionRow } from "../../../src/shell/inspect/app/discussion.ts";
import { CHANGE_ROWS, DISCUSSION_ROWS, NAMES } from "../../../src/shell/inspect/app/fixtures.ts";
import {
  drawReading,
  ListSummary,
  NamedText,
  namesOf,
  NotFound,
  ReadState,
  RecordLink,
  suggestionsFor,
} from "../../../src/shell/inspect/app/ui.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { CAREFUL, changesWorkspace } from "./fixture.ts";
import { draw, READY, withNames } from "./walk.ts";
import { h } from "preact";

/**
 * J-158 S2: names over ids, a summary above every list, and one component
 * for a read's three states. The server reads every record's name once
 * (`GET /api/search`); a page shows a reference by its name and keeps the
 * id for its address; and a read says what it reads, what would appear,
 * and what failed with what to do. The components are drawn here without a
 * browser, each context a page gives them handed in; the render check
 * draws them in one.
 */

/** A change id as it stands in the ledger: a date and words. */
const CHANGE_ID = /\b\d{4}-\d{2}-\d{2}-[a-z]/;

describe("J-158 S2 the names the server reads once", () => {
  let handle: InspectorHandle | undefined;
  let root = "";

  beforeAll(async () => {
    const workspace = changesWorkspace();
    root = workspace.root;
    handle = await startInspector(root, workspace.env, 0, () => "// the client app\n");
  });

  afterAll(async () => {
    await handle?.close();
    rmSync(root, { recursive: true, force: true });
  });

  /** A document read through the server and parsed under its schema. */
  async function read(path: string): Promise<InspectorDocument> {
    const response = await fetch(`${handle?.url ?? ""}${path}`);
    expect(response.status, path).toBe(200);
    const body = parseJson(await response.text());
    if (body === undefined || !isJsonObject(body)) throw new Error(`${path}: not a JSON object`);
    const parsed = parseInspectorDocument(body);
    if (parsed._tag === "err") throw new Error(`${path}: ${parsed.error.issues[0]?.message ?? ""}`);
    return parsed.value;
  }

  it("names every change by its id's words, its address the change's page", async () => {
    const names = await read("api/search");
    const changes = await read("api/changes");
    if (names.kind !== "search" || changes.kind !== "changes") throw new Error("wrong kinds");
    for (const change of changes.changes) {
      const entry = names.entries.find((each) => each.kind === "change" && each.id === change.id);
      expect(entry, change.id).toMatchObject({
        address: `/changes/${change.id}`,
        where: "Changes",
        state: change.state,
        at: change.opened,
      });
      expect(entry?.name).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    expect(names.entries.find((each) => each.id === CAREFUL)?.name).toBe("Sessions");
  });

  it("answers an address no page shows with the app itself, so its not-found page can search", async () => {
    const response = await fetch(`${handle?.url ?? ""}atlas/visuals/an-earlier-address`);
    expect(response.status).toBe(404);
    const page = await response.text();
    expect(page).toContain('<script type="module" src="/inspector.mjs"></script>');
  });
});

describe("J-158 S2 a reference by its name", () => {
  it("shows the name, keeps the id as the address and the hover's words, never as text", () => {
    const drawn = draw(
      h(RecordLink, { kind: "change", id: "2026-10-23-login-rate-limit", href: "/x" }),
      withNames(READY),
    );
    expect(drawn.text).toBe("Login rate limit");
    expect(drawn.links).toEqual(["/changes/2026-10-23-login-rate-limit"]);
    expect(drawn.text).not.toMatch(CHANGE_ID);
  });

  it("says it is reading the name while the names are read, its link already leading there, never showing the id", () => {
    const drawn = draw(
      h(RecordLink, { kind: "change", id: "2026-10-23-login-rate-limit", href: "/x" }),
      withNames({ state: "reading" }),
    );
    expect(drawn.text).toBe("reading its name");
    // Busy, not the view's own reading: the page has drawn, and the name fills when it comes.
    expect(drawn.reading).toEqual([]);
    expect(drawn.links).toEqual(["/x"]);
  });

  it("names a record the repository no longer holds as not found, its id the only words left", () => {
    const drawn = draw(
      h(RecordLink, { kind: "change", id: "2026-09-30-gone", href: "/changes" }),
      withNames(READY),
    );
    expect(drawn.text).toBe("2026-09-30-gone (not found)");
    expect(drawn.links).toEqual([]);
  });

  it("draws the lists' rows, the lineage and the discussions with names and no change id as text", () => {
    const rows = draw(
      [
        ...CHANGE_ROWS.map((row) =>
          h(ChangeRow, { change: row.change, at: new Date("2026-10-24T12:00:00Z") }),
        ),
        ...DISCUSSION_ROWS.map((discussion) => h(DiscussionRow, { discussion })),
        h(LineageStrip, {
          hops: [
            {
              kind: "discussion",
              label: "2026-10-21-offline-mode",
              path: "/discussions/2026-10-21-offline-mode",
              here: false,
              named: "discussion",
            },
            {
              kind: "plan",
              label: "007-auth",
              path: "/plans/007-auth",
              here: false,
              named: "plan",
            },
            {
              kind: "change",
              label: "2026-10-24-cache-headers",
              path: "/changes/2026-10-24-cache-headers",
              here: true,
              named: "change",
            },
          ],
        }),
      ],
      withNames(READY),
    );
    expect(rows.text).not.toMatch(CHANGE_ID);
    expect(rows.text).toContain("Let the app work on a train");
    expect(rows.text).toContain("Cache headers");
    expect(rows.text).not.toContain("(not found)");
  });
});

describe("J-158 S2 a finding's own words with the changes it quotes named", () => {
  it("names a whole change id it quotes, and leaves a path that begins with one as written", () => {
    const drawn = draw(
      h(NamedText, {
        text: "the record of '2026-10-23-login-rate-limit' links to '2026-10-23-login-rate-limit/verify/a.png', which is not in its folder; 2026-09-30-gone too",
      }),
      withNames(READY),
    );
    expect(drawn.text).toBe(
      "the record of 'Login rate limit' links to '2026-10-23-login-rate-limit/verify/a.png', which is not in its folder; 2026-09-30-gone too",
    );
    expect(drawn.links).toEqual(["/changes/2026-10-23-login-rate-limit"]);
  });

  it("names an id that ends its sentence, and leaves a file named after one as written", () => {
    const drawn = draw(
      h(NamedText, {
        text: "it is held by 2026-10-24-cache-headers. The file 2026-10-24-cache-headers.md stays.",
      }),
      withNames(READY),
    );
    expect(drawn.text).toBe(
      "it is held by Cache headers. The file 2026-10-24-cache-headers.md stays.",
    );
    expect(drawn.links).toEqual(["/changes/2026-10-24-cache-headers"]);
  });
});

describe("J-158 S2 a summary above every list", () => {
  it("opens with the count, the states in the one vocabulary and the newest by its name", () => {
    const drawn = draw(
      h(ListSummary, {
        count: 4,
        noun: "change",
        states: [
          ["open", 1],
          ["stopped", 0],
          ["done", 3],
        ],
        newest: {
          name: h(RecordLink, { kind: "change", id: "2026-10-24-cache-headers", href: "/" }),
          at: "2026-10-24",
        },
      }),
      withNames(READY),
    );
    expect(drawn.components).toContain("ListSummary");
    expect(drawn.text).toBe("4 changes 1 open 3 done newest Cache headers, 2026-10-24");
  });

  it("says a count of one in the singular and its further facts after", () => {
    const drawn = draw(
      h(ListSummary, {
        count: 1,
        noun: "skill",
        more: "3 loads across the changes, 0 never loaded",
      }),
    );
    expect(drawn.text).toBe("1 skill 3 loads across the changes, 0 never loaded");
  });
});

describe("J-158 S2 a read's three states in one component", () => {
  it("loading says what it reads", () => {
    const drawn = draw(
      drawReading({ state: "reading" }, () => null, "the changes from the ledger"),
    );
    expect(drawn.text).toBe("Reading the changes from the ledger.");
    expect(drawn.reading).toEqual(["reading"]);
    expect(drawn.components).toEqual(["ReadState"]);
  });

  it("failed names what failed, why, and what to do", () => {
    const drawn = draw(
      drawReading(
        { state: "failed", message: "The server answered 500." },
        () => null,
        "the visual home",
      ),
      withNames(READY),
    );
    expect(drawn.reading).toEqual(["failed"]);
    expect(drawn.text).toContain("The visual home could not be read.");
    expect(drawn.text).toContain("The server answered 500.");
    expect(drawn.text).toContain("Read again");
    expect(drawn.text).toContain("greenline status");
  });

  it("an address the repository holds no record for is the view's empty state, never an error", () => {
    const drawn = draw(
      drawReading(
        { state: "failed", message: "No change 2026-01-01-none.", missing: true },
        () => null,
      ),
    );
    expect(drawn.reading).toEqual(["missing"]);
    expect(drawn.text).toContain("Nothing here by that name.");
  });

  it("empty says what would appear and, beside it, why none does", () => {
    const drawn = draw(
      h(
        ReadState,
        { face: "empty", title: "No discussion yet." },
        h("p", null, "An idea you explore with the agent is kept here."),
      ),
    );
    expect(drawn.text).toBe("No discussion yet. An idea you explore with the agent is kept here.");
  });

  it("the catalogue draws each of the three, and the summaries and names beside them", () => {
    const shared = CATALOGUE.find((kind) => kind.kind === "shared")?.specimens ?? [];
    const read = shared.find((specimen) => specimen.component === "ReadState");
    expect(read?.fixtures.map((fixture) => fixture.name)).toEqual([
      "loading, saying what it reads",
      // J-164 S1: the skeleton takes the section's form.
      "loading a section of cards, its skeleton of cards",
      "loading a section of prose, its skeleton of lines",
      "empty, saying what would appear and why none does",
      "failed, naming what failed, why, and what to do",
    ]);
    expect(shared.map((specimen) => specimen.component)).toContain("ListSummary");
    const reference = CATALOGUE.find((kind) => kind.kind === "reference")?.specimens ?? [];
    expect(reference.map((specimen) => specimen.component)).toEqual(["RecordLink", "NotFound"]);
  });
});

describe("J-158 S2 the not-found page", () => {
  it("offers the records an address's words name, the place's own words and the date set aside", () => {
    const names = namesOf(NAMES);
    // The picture holds every word of the address, the change all but its last.
    expect(
      suggestionsFor("/atlas/visuals/2026-10-23-login-rate-limit/states", names)
        .slice(0, 2)
        .map((entry) => entry.name),
    ).toEqual(["Login state chart", "Login rate limit"]);
    expect(suggestionsFor("/changes/2026-10-01", names)).toEqual([]);
    expect(suggestionsFor("/%E0%A4%A", names)).toEqual([]);
  });

  it("says so in a sentence, links what it offers by name, and the way back", () => {
    const drawn = draw(
      h(NotFound, { path: "/atlas/visuals/2026-10-21-offline-mode" }),
      withNames(READY),
    );
    expect(drawn.components).toEqual(["NotFound"]);
    expect(drawn.text).toContain("No page here");
    expect(drawn.text).toContain("Let the app work on a train");
    expect(drawn.links).toContain("/discussions/2026-10-21-offline-mode");
    expect(drawn.links).toContain("/");
  });
});
