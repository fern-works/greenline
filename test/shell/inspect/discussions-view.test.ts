import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentChild } from "preact";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { isJsonObject, parseJson } from "../../../src/core/contract.ts";
import { INSPECT_SCHEMA, parseInspectorDocument } from "../../../src/core/inspector/contract.ts";
import { ChangeHead } from "../../../src/shell/inspect/app/change-page.ts";
import { DiscussionPage, DiscussionRow } from "../../../src/shell/inspect/app/discussion.ts";
import {
  changeDocumentSpecimen,
  DISCUSSION,
  DISCUSSION_ROWS,
} from "../../../src/shell/inspect/app/fixtures.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { changesWorkspace } from "./fixture.ts";

/**
 * The inspector's Discussions view (J-118 S4), on J-120's shell: the
 * documents served from a workspace's discussion records, every one that
 * reads with its idea, state, last touched and the changes it promoted, a
 * discussion's page with its frame map, its decisions, its research and its
 * links, and the change page's link to the discussion it was promoted from;
 * and the components drawn from the catalogue's fixtures, their tree walked
 * as the browser would print it.
 */

const TALK = "2026-10-21-offline-mode";
const PROMOTED = "2026-10-24-cache-headers";

const DISCUSSION_RECORD = `---
idea: "Let the app work on a train"
state: promoted
words: "make the cache headers a change"
changes: [${PROMOTED}]
related: [2026-10-23-plugins]
---

## frame

### Round 1

- Q1 [purpose] Is it for commuters with no signal?
  - proposed: yes, reading only
  - answer: yes, reading and queued writes
  - decided: owner
  - research: [the cache limits](${TALK}/frame-research-1.md)
- closed [security]: nothing new crosses a trust boundary

## research

- [the cache limits](${TALK}/frame-research-1.md): what a service worker may hold

## open questions

- How do queued writes sync?
`;

const CHANGE_RECORD = `---
mode: quick
choice: accepted
why: "Serve the static assets with long cache headers"
state: open
from: ${TALK}
---

## frame

From the discussion's decisions: Q1 yes, reading and queued writes.
`;

interface Served {
  readonly root: string;
  readonly handle: InspectorHandle;
}

let served: Served | undefined;

beforeAll(async () => {
  const space = changesWorkspace();
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(space.root, path)), { recursive: true });
    writeFileSync(join(space.root, path), text);
  };
  write(`.greenline/ledger/discussions/${TALK}.md`, DISCUSSION_RECORD);
  write(`.greenline/ledger/discussions/${TALK}/frame-research-1.md`, "the cache limits\n");
  write(
    ".greenline/ledger/discussions/2026-10-23-plugins.md",
    '---\nidea: "A plugin system"\nstate: open\n---\n',
  );
  write(".greenline/ledger/discussions/2026-10-22-broken.md", "---\nidea: x\n---\n");
  write(`.greenline/ledger/${PROMOTED}.md`, CHANGE_RECORD);
  served = { root: space.root, handle: await startInspector(space.root, space.env, 0) };
});

afterAll(async () => {
  await served?.handle.close();
  if (served !== undefined) rmSync(served.root, { recursive: true, force: true });
});

async function get(path: string) {
  if (served === undefined) throw new Error("the inspector did not start");
  const response = await fetch(served.handle.url + path);
  const body = parseJson(await response.text());
  if (body === undefined || !isJsonObject(body)) throw new Error(`${path}: not a JSON object`);
  return { status: response.status, body };
}

async function document(path: string) {
  const { status, body } = await get(path);
  expect(status, path).toBe(200);
  const parsed = parseInspectorDocument(body);
  if (parsed._tag === "err")
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path} ${issue.message}`).join("; "),
    );
  expect(parsed.value.schema).toBe(INSPECT_SCHEMA);
  return parsed.value;
}

describe("J-118 S4 the discussions served from the records", () => {
  it("lists every discussion that reads, newest first, with its idea, state, last touched and the changes it promoted", async () => {
    const list = await document("api/discussions");
    if (list.kind !== "discussions" || !list.discussions.available) throw new Error("none");
    expect(
      list.discussions.items.map((item) => [item.id, item.title, item.state, item.promoted]),
    ).toEqual([
      ["2026-10-23-plugins", "A plugin system", "open", []],
      [TALK, "Let the app work on a train", "promoted", [PROMOTED]],
    ]);
    expect(list.discussions.items[1]).toMatchObject({ opened: "2026-10-21", touched: null });
  });

  it("serves a discussion's page with its frame map, decisions, sections, research and links, and 404 for one that does not read", async () => {
    const page = await document(`api/discussions/${TALK}`);
    if (page.kind !== "discussion") throw new Error("not a discussion");
    const view = page.discussion;
    expect(view.decisionLines).toEqual([
      "Q1 Is it for commuters with no signal? yes, reading and queued writes",
    ]);
    expect(view.decisions).toBe(1);
    expect(view.research).toEqual(["frame-research-1.md"]);
    expect(view.sections.map((section) => section.heading)).toEqual(["research", "open questions"]);
    expect(view.map?.nodes.filter((node) => node.state !== "untouched")).toEqual([
      { node: "purpose", state: "open", reason: null, questions: ["Q1"] },
      {
        node: "security",
        state: "closed",
        reason: "nothing new crosses a trust boundary",
        questions: [],
      },
    ]);
    expect(view).toMatchObject({
      related: ["2026-10-23-plugins"],
      words: "make the cache headers a change",
      revisit: null,
      reason: null,
      into: null,
    });
    expect((await get("api/discussions/2026-10-22-broken")).status).toBe(404);
    expect((await get("api/discussions/2026-10-01-none")).status).toBe(404);
  });

  it("puts the open and parked discussions on the desk, and gives the change page the discussion it was promoted from", async () => {
    const now = await document("api/desk");
    if (now.kind !== "desk" || !now.discussions.available) throw new Error("not the desk");
    expect(now.discussions.items.map((item) => item.id)).toEqual(["2026-10-23-plugins"]);
    const change = await document(`api/changes/${PROMOTED}`);
    if (change.kind !== "change") throw new Error("not a change");
    expect(change.change.card.from).toEqual([TALK]);
  });
});

/** A child in a tree, which the walk reads for what it is. */
const CHILD = z.custom<ComponentChild>(() => true);
interface Props {
  readonly [key: string]: ComponentChild;
}
const COMPONENT = z.object({
  type: z.custom<(props: Props) => ComponentChild>((value) => value instanceof Function),
  props: z.record(z.string(), CHILD),
});
const ELEMENT = z.object({
  type: z.string(),
  props: z.looseObject({ children: CHILD.optional() }),
});
const LEAF = z.union([z.string(), z.number()]);
const TEXT = z.string();

interface Drawn {
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly Drawn[];
  readonly text: string;
}

function draw(node: ComponentChild): readonly Drawn[] {
  const leaf = LEAF.safeParse(node);
  if (leaf.success)
    return [{ tag: "#text", attributes: new Map(), children: [], text: String(leaf.data) }];
  if (Array.isArray(node)) return node.flatMap(draw);
  const component = COMPONENT.safeParse(node);
  if (component.success) {
    // A component that holds state, a fold's open part, gives what it paints first (J-164 S1).
    const type: unknown = component.data.type;
    const first =
      type instanceof Function && "firstPaint" in type && type.firstPaint instanceof Function
        ? type.firstPaint
        : undefined;
    if (first !== undefined) return draw(first(component.data.props));
    return draw(component.data.type(component.data.props));
  }
  const element = ELEMENT.safeParse(node);
  if (!element.success) return [];
  const children = draw(element.data.props.children);
  return [
    {
      tag: element.data.type,
      attributes: new Map(
        Object.entries(element.data.props).flatMap(([name, value]): [string, string][] => {
          const text = TEXT.safeParse(value);
          return text.success ? [[name, text.data]] : [];
        }),
      ),
      children,
      text: children.map((child) => child.text).join(""),
    },
  ];
}

function all(drawn: Drawn): readonly Drawn[] {
  return [drawn, ...drawn.children.flatMap(all)];
}

function component(drawn: readonly Drawn[], name: string): Drawn | undefined {
  return drawn.flatMap(all).find((element) => element.attributes.get("data-component") === name);
}

describe("J-118 S4 the discussion's components on J-120's shell", () => {
  const page = draw(DiscussionPage({ discussion: DISCUSSION }));

  it("heads the page with its idea, its state, the owner's words quoted and the changes it promoted (J-166 S1)", () => {
    const strip = component(page, "PromotedStrip");
    const hops = strip === undefined ? [] : all(strip).filter((element) => element.tag === "a");
    expect(hops.map((hop) => hop.attributes.get("href"))).toEqual(
      DISCUSSION.promoted.map((id) => `/changes/${id}`),
    );
    const text = page.map((element) => element.text).join("");
    expect(text).toContain(DISCUSSION.title);
    expect(text).toContain(`Your words: ${DISCUSSION.words ?? ""}`);
    expect(text).toContain("touched 2026-10-24");
    // The research a fold that reads its report when it opens.
    expect(component(page, "ResearchReport")).toBeDefined();
  });

  it("draws its frame map with J-117's component, a report named and never linked to a change's page", () => {
    const map = component(page, "FrameMap");
    expect(map).toBeDefined();
    expect(map?.text).toContain("The discussion's nodes");
    const research = map === undefined ? [] : all(map).filter((element) => element.tag === "a");
    expect(research).toEqual([]);
    expect(map?.text).toContain("frame-research-1.md");
  });

  it("lists the decisions, the promoted changes, the research and the related discussions", () => {
    const text = page.map((element) => element.text).join("");
    for (const line of DISCUSSION.decisionLines) expect(text).toContain(line);
    const anchors = page.flatMap(all).filter((element) => element.tag === "a");
    const hrefs = anchors.map((anchor) => anchor.attributes.get("href"));
    expect(hrefs).toContain("/discussions/2026-10-23-plugins");
    expect(hrefs).toContain(`/changes/${DISCUSSION.promoted[0] ?? ""}`);
  });

  it("draws a row with its state, idea, last touched, decisions and what it promoted", () => {
    const rows = DISCUSSION_ROWS.map((discussion) => draw(DiscussionRow({ discussion })));
    expect(rows[0]?.[0]?.attributes.get("data-state")).toBe("promoted");
    expect(rows[0]?.[0]?.text).toContain("touched 2026-10-24");
    expect(rows[0]?.[0]?.text).toContain("promoted 1 change");
    expect(rows[1]?.[0]?.text).toContain("not committed yet");
  });

  it("heads the change page's lineage with the discussion it was promoted from, a link to its page", () => {
    const changePage = draw(ChangeHead({ page: changeDocumentSpecimen() }));
    const lineage = component(changePage, "LineageStrip");
    const first = lineage === undefined ? undefined : all(lineage).find((e) => e.tag === "a");
    expect(first?.attributes.get("href")).toBe("/discussions/2026-10-21-offline-mode");
    expect(first?.text).toContain("discussion");
  });
});
