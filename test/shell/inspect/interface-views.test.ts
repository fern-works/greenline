import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isJsonObject, parseJson } from "../../../src/core/contract.ts";
import { parseDesignPick } from "../../../src/core/design-pick.ts";
import { parseCatalog } from "../../../src/core/interface-catalog.ts";
import type { PickPayload } from "../../../src/shell/inspect/app/client.ts";
import { parseInspectorDocument } from "../../../src/core/inspector/contract.ts";
import type { InspectorDocument } from "../../../src/core/inspector/documents.ts";
import { runDealCli } from "../../../src/shell/cli/deal.ts";
import { dealPath } from "../../../src/shell/deal-view.ts";
import { dealAddress, dealApiPath, dealAskQuery } from "../../../src/core/deal-ask.ts";
import { z } from "zod";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { RecordingWriter } from "../../helpers/writer.ts";
import { CATALOG, INTERFACE_CHANGE, interfaceWorkspace } from "./interface-fixture.ts";

/**
 * The inspector's interface views through their real seam (J-123 S7): the
 * catalog browser's entries each with a specimen, a change's deal of three
 * composites and its pick written with the revision check, the Interfaces
 * tab reading a fixture's captures, scores, history and drift, and the
 * change page's interface with its check by tier; every document validated
 * against its schema.
 */

const ID = INTERFACE_CHANGE;

let root = "";
let handle: InspectorHandle | undefined;

/** What `greenline deal --json` printed: the seed, the view's address and each direction's entries. */
const dealtSchema = z.object({
  seed: z.number(),
  view: z.string().nullable(),
  directions: z.array(z.object({ parts: z.array(z.object({ id: z.string() })) })),
});

beforeAll(async () => {
  const workspace = interfaceWorkspace();
  root = workspace.root;
  handle = await startInspector(root, workspace.env, 0);
});

afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

async function served(
  path: string,
  init?: RequestInit,
): Promise<{ readonly status: number; readonly body: object }> {
  if (handle === undefined) throw new Error("the inspector did not start");
  const response = await fetch(handle.url + path, init);
  const body = parseJson(await response.text());
  if (body === undefined || !isJsonObject(body)) throw new Error(`${path}: not a JSON object`);
  return { status: response.status, body };
}

async function document(path: string): Promise<InspectorDocument> {
  const { status, body } = await served(path);
  expect(status, path).toBe(200);
  const parsed = parseInspectorDocument(JSON.parse(JSON.stringify(body)));
  if (parsed._tag === "err")
    throw new Error(
      `${path}: ${parsed.error.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
    );
  return parsed.value;
}

describe("J-123 S7 the interface views", () => {
  it("serves every installed catalog entry with its specimen", async () => {
    const page = await document("api/catalog");
    if (page.kind !== "catalog" || !page.catalog.available) throw new Error("no catalog");
    const count = parseCatalog(CATALOG)?.length ?? 0;
    expect(page.catalog.items).toHaveLength(count);
    for (const entry of page.catalog.items)
      expect(entry.specimen, entry.id).toContain(`data-entry="${entry.id}"`);
  });

  it("deals in the view the three the command dealt, and records the pick with the revision check", async () => {
    const writer = new RecordingWriter();
    const code = runDealCli(
      ["--job", "sign-up", "--tone", "calm", "--material", "copy", "--json"],
      writer.writer,
      root,
    );
    expect(code, writer.err).toBe(0);
    const dealt = dealtSchema.parse(JSON.parse(writer.out));
    expect(dealt.view).toBe(
      `/changes/${ID}/deal?register=site&job=sign-up&tone=calm&material=copy&seed=${String(dealt.seed)}`,
    );
    // The ask kept for greenline view's address of the deal and of a direction (J-142 S1).
    expect(dealPath(root, ID)).toBe(dealt.view);
    expect(dealPath(root, ID, "Calm Ledger")).toBe(
      (dealt.view ?? "").replace("/deal?", "/deal/Calm%20Ledger?"),
    );
    // The view's own request: the ask its address carries, as the app reads `location.search`.
    const ask = dealAskQuery(new URL(dealt.view ?? "", "http://127.0.0.1").search);
    const deal = await document(dealApiPath(ID, ask, false).slice(1));
    if (deal.kind !== "deal" || !deal.directions.available) throw new Error("no deal");
    expect(deal.seed).toBe(dealt.seed);
    expect(
      deal.directions.items.map((direction) => direction.parts.map((part) => part.id)),
    ).toEqual(dealt.directions.map((direction) => direction.parts.map((part) => part.id)));
    expect(deal.directions.items[0]?.parts.some((part) => part.role === "anatomy")).toBe(true);
    expect(deal.register).toBe("site");
    expect(deal.directions.items.map((direction) => direction.index)).toEqual([1, 2, 3]);
    for (const direction of deal.directions.items) {
      expect(direction.light).toMatch(/^<!doctype html>/);
      expect(direction.light).not.toMatch(/<script|<link|url\(http/);
    }
    expect(deal.revision).toBe("none");
    const pick: PickPayload = {
      direction: 2,
      ask,
      seed: deal.seed,
      reroll: false,
      revision: deal.revision,
    };
    const post = (body: PickPayload) =>
      served(`api/changes/${ID}/deal/pick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post(pick)).status).toBe(200);
    const written = parseDesignPick(
      readFileSync(join(root, `.greenline/ledger/${ID}/design-pick.json`), "utf8"),
    );
    expect(written?.entries).toEqual(deal.directions.items[1]?.parts.map((part) => part.id));
    expect(written?.direction).toBe(2);
    expect(written?.catalog).toBe(deal.catalog);
    expect(deal.catalog).toMatch(/^[0-9a-f]{12}$/);
    const stale = await post(pick);
    expect(stale.status).toBe(409);
    const again = await document(dealApiPath(ID, ask, false).slice(1));
    expect(again.kind === "deal" && again.pick?.direction).toBe(2);
    expect((await served("api/changes/no-such-change/deal")).status).toBe(404);
  });

  it("J-144 S7 shows the rerolled three at the address the command and the view line name, picks the direction shown and keeps the first three as history", async () => {
    // The pick the test before this one wrote is the change's; this deal is read and picked afresh.
    rmSync(join(root, `.greenline/ledger/${ID}/design-pick.json`), { force: true });
    const writer = new RecordingWriter();
    const code = runDealCli(
      ["--job", "sign-up", "--tone", "calm", "--seed", "11", "--reroll", "--json"],
      writer.writer,
      root,
    );
    expect(code, writer.err).toBe(0);
    const dealt = dealtSchema.parse(JSON.parse(writer.out));
    expect(dealt.view).toBe(
      `/changes/${ID}/deal?register=site&job=sign-up&tone=calm&seed=11&reroll=1`,
    );
    // greenline view deal and the View row read the address the command kept.
    expect(dealPath(root, ID)).toBe(dealt.view);
    const ask = dealAskQuery(new URL(dealt.view ?? "", "http://127.0.0.1").search);
    const shown = await document(dealApiPath(ID, ask, false).slice(1));
    if (shown.kind !== "deal" || !shown.directions.available) throw new Error("no deal");
    expect(shown.reroll).toBe(true);
    expect(
      shown.directions.items.map((direction) => direction.parts.map((part) => part.id)),
    ).toEqual(dealt.directions.map((direction) => direction.parts.map((part) => part.id)));
    // The first three, the deal's history, at the address without the reroll.
    const firstAsk = dealAskQuery(new URL(dealAddress(ID, ask, false), "http://127.0.0.1").search);
    const first = await document(dealApiPath(ID, firstAsk, false).slice(1));
    if (first.kind !== "deal" || !first.directions.available) throw new Error("no first deal");
    expect(first.reroll).toBe(false);
    expect(first.directions.items.map((direction) => direction.name)).not.toEqual(
      shown.directions.items.map((direction) => direction.name),
    );
    // The pick writes the direction the page showed, the reroll's.
    const picked = await served(`api/changes/${ID}/deal/pick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction: 1,
        ask,
        seed: shown.seed,
        reroll: shown.reroll,
        revision: shown.revision,
      } satisfies PickPayload),
    });
    expect(picked.status).toBe(200);
    const written = parseDesignPick(
      readFileSync(join(root, `.greenline/ledger/${ID}/design-pick.json`), "utf8"),
    );
    expect(written?.entries).toEqual(shown.directions.items[0]?.parts.map((part) => part.id));
    expect(written?.reroll).toBe(true);
  });

  it("reads the pages' captures, scores, history and the home for the interface", async () => {
    const page = await document("api/interface");
    if (page.kind !== "interface" || !page.pages.available) throw new Error("no pages");
    const [route, limited] = page.pages.items;
    expect(route?.address).toBe("/pricing");
    expect(route?.limit).toBeNull();
    // J-191 S1: the capture's limit beside the captures, in the words the check and status say it.
    expect(limited?.address).toBe("/plans");
    expect(limited?.capture).toBeNull();
    expect(limited?.limit).toEqual({
      cause: "timeout",
      origin: "http://127.0.0.1:3000",
      at: "2026-10-25T12:10:00.000Z",
      words:
        "the page did not load in time at http://127.0.0.1:3000/plans (Page.navigate timed out)",
    });
    expect(route?.history.map((capture) => capture.floor)).toEqual([2, 0]);
    expect(route?.tier).toBe("fresh");
    expect(route?.fidelity?.inPalette).toBe(0.9);
    expect(page.tokens.map((token) => `${token.group}.${token.name}`)).toEqual([
      "colors.ground",
      "colors.ink",
      "colors.accent",
      "rounded.md",
    ]);
    expect(page.drift).toContain("1 colour the code uses that DESIGN.md does not name");
    expect(page.specimen).toContain('data-entry="design-md"');
    expect(page.page?.light).toMatch(/^<!doctype html>/);
    expect(page.facets?.registers).toEqual(["site"]);
  });

  it("gives the change page its interface fact, its check by tier, its design section and its pick", async () => {
    const page = await document(`api/changes/${ID}/interface`);
    if (page.kind !== "interface-checks") throw new Error("no interface");
    expect(page.touches).toBe(true);
    expect(page.fact?.counts.floor).toBe(1);
    expect(page.design).toContain("components: pricing");
  });
});
