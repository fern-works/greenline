/**
 * The capture view (J-124 S3): its address, the catalogue's fixtures held
 * to the contract, the hit tests on the fixture capture (a click resolves
 * the planted button, a stroke the elements under it), and the served
 * workspace: a capture with its boxes, the marks by state with the
 * addressed one's after found by its element, a mark appended from the
 * viewer listed with the others, and the change page's marks the change's
 * own.
 */
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson } from "../../../src/core/contract.ts";
import { parseInspectorDocument } from "../../../src/core/inspector/contract.ts";
import type { InspectorDocument } from "../../../src/core/inspector/documents.ts";
import { elementAt, elementsUnder } from "../../../src/core/interface-hits.ts";
import { pathOf, placeOf } from "../../../src/shell/inspect/app/addresses.ts";
import { NoCaptureImage } from "../../../src/shell/inspect/app/marks.ts";
import {
  CAPTURE,
  CAPTURE_AFTER,
  CAPTURE_PHONE,
  CAPTURE_WIDE,
  CAPTURE_PICTURE,
  MARKS,
  READ,
} from "../../../src/shell/inspect/app/interface-fixtures.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { draw } from "./draw.ts";
import { INTERFACE_CHANGE, interfaceWorkspace } from "./interface-fixture.ts";

let handle: InspectorHandle | undefined;
let root = "";

beforeAll(async () => {
  const space = interfaceWorkspace();
  root = space.root;
  handle = await startInspector(space.root, space.env, 0);
});
afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

async function read(path: string): Promise<InspectorDocument> {
  if (handle === undefined) throw new Error("the inspector did not start");
  const response = await fetch(handle.url + path);
  expect(response.status, path).toBe(200);
  const parsed = parseInspectorDocument(z.json().parse(parseJson(await response.text())));
  if (parsed._tag === "err")
    throw new Error(`${path}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  return parsed.value;
}

describe("J-124 S3 the capture view", () => {
  it("reads and prints the capture's address, one picture's address (J-154 S3)", () => {
    const path = `/pictures/${INTERFACE_CHANGE}/capture-pricing`;
    const place = { page: "picture", id: `${INTERFACE_CHANGE}/capture-pricing` } as const;
    expect(placeOf(path)).toEqual(place);
    expect(pathOf(place)).toBe(path);
    expect(placeOf("/pictures/interface/capture-home")).toEqual({
      page: "picture",
      id: "interface/capture-home",
    });
    expect(placeOf("/pictures/only-one")).toBeUndefined();
    // The first design's address is no place: the not-found page answers it.
    expect(
      placeOf(`/atlas/interfaces/captures/${INTERFACE_CHANGE}/capture-pricing`),
    ).toBeUndefined();
  });

  it("holds the catalogue's capture and notes fixtures to the contract, in a picture's document", () => {
    for (const capture of [CAPTURE.capture, CAPTURE_AFTER.capture])
      expect(
        parseInspectorDocument(
          z.json().parse({
            schema: "greenline.inspect/v2",
            kind: "picture",
            read: READ,
            picture: CAPTURE_PICTURE,
            html: null,
            capture,
            notes: MARKS,
          }),
        )._tag,
        capture.id,
      ).toBe("ok");
  });

  it("words a capture that kept no image: its address, its widths, its scores, why nothing marks (J-155 S6)", () => {
    const capture = {
      ...CAPTURE.capture,
      widths: CAPTURE.capture.widths.map((entry) => ({ ...entry, image: null })),
    };
    const widths = capture.widths.map((entry) => String(entry.width)).join(", ");
    const scored = draw(
      NoCaptureImage({
        capture,
        summary: `${capture.address} at ${widths}: floor 0 red, reflex 0 red, finish 41`,
      }),
    );
    expect(scored.components).toEqual(["NoCaptureImage"]);
    expect(scored.text).toContain("This capture kept no image.");
    expect(scored.text).toContain(`It recorded ${capture.address} at ${widths} wide`);
    expect(scored.text).toContain("scored floor 0 red, reflex 0 red, finish 41");
    expect(scored.text).toContain("the picker and the pencil have nothing to mark");
    const bare = draw(NoCaptureImage({ capture, summary: null }));
    expect(bare.text).not.toContain("scored");
    expect(bare.text).toContain(`at ${widths} wide, but no picture of the page`);
  });

  it("resolves the planted button on a click and the elements under a stroke", () => {
    expect(elementAt(CAPTURE_PHONE.elements, 100, 920)?.selector).toBe("#start-trial");
    expect(elementAt(CAPTURE_WIDE.elements, 30, 30)?.selector).toBe("main > h1");
    const round = [
      [10, 10],
      [620, 10],
      [620, 200],
      [10, 200],
    ] as const;
    expect(elementsUnder(CAPTURE_WIDE.elements, round).map((element) => element.selector)).toEqual([
      "#start-trial",
      "main > h1",
    ]);
  });

  it("serves a capture with its boxes, and the marks by state with the addressed one's after", async () => {
    const picture = await read(`api/pictures/${INTERFACE_CHANGE}/capture-pricing-before`);
    if (picture.kind !== "picture" || picture.capture === null) throw new Error("no capture");
    const capture = { capture: picture.capture };
    expect(capture.capture.boxes).toBeNull();
    expect(capture.capture.widths.map((width) => width.width)).toEqual([1440, 768, 390]);
    expect(capture.capture.history.map((entry) => entry.id)).toEqual([
      `${INTERFACE_CHANGE}/capture-pricing-before`,
      `${INTERFACE_CHANGE}/capture-pricing`,
    ]);
    const facing = await read("api/interface");
    if (facing.kind !== "interface") throw new Error("no notes");
    const marks = { marks: facing.notes.notes };
    expect(marks.marks.map((view) => [view.mark.id, view.mark.state])).toEqual([
      ["m1a2b3c4", "addressed"],
      ["m5d6e7f8", "open"],
    ]);
    expect(marks.marks[0]?.after).toEqual({
      capture: `${INTERFACE_CHANGE}/capture-pricing`,
      box: { x: 24, y: 120, width: 160, height: 48 },
    });
    expect(marks.marks[0]?.change).toBe(INTERFACE_CHANGE);
  });

  it("appends a mark from the viewer and lists it with the others", async () => {
    if (handle === undefined) throw new Error("the inspector did not start");
    const facing = await read("api/interface");
    if (facing.kind !== "interface") throw new Error("no notes");
    const before = facing.notes;
    const answer = await fetch(`${handle.url}api/marks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capture: `${INTERFACE_CHANGE}/capture-pricing`,
        width: 1440,
        region: [
          [10, 10],
          [1430, 10],
          [1430, 80],
          [10, 80],
        ],
        note: "The heading feels cramped.",
        intent: "idea",
        revision: before.revision,
      }),
    });
    expect(answer.status).toBe(200);
    const read2 = await read("api/interface");
    if (read2.kind !== "interface") throw new Error("no notes");
    const after = { marks: read2.notes.notes };
    expect(after.marks).toHaveLength(3);
    expect(after.marks.at(-1)?.mark).toMatchObject({
      by: "owner",
      intent: "idea",
      region: { elements: ["main > h1"] },
    });
  });
});
