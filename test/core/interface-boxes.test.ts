/**
 * A capture's boxes (J-124 S1): the file's strict schema, a source file
 * made a path from the root, and the hit tests the capture view and the
 * marks use: a click picks the smallest box under it, a stroke names the
 * elements it lies over and not the page around them, and a later capture
 * finds the marked element again by its selector or its source.
 */
import { describe, expect, it } from "vitest";
import {
  parseCaptureBoxes,
  repositoryPathOf,
  type BoxedElement,
} from "../../src/core/interface-boxes.ts";
import { elementAt, elementsUnder, sameElement } from "../../src/core/interface-hits.ts";

function element(
  selector: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text = "",
): BoxedElement {
  return {
    selector,
    tag: "div",
    role: null,
    text,
    box: { x, y, width, height },
    source: null,
  };
}

const PAGE = [
  element("main", 0, 0, 1440, 2000),
  element("main > section", 24, 100, 800, 400),
  element("#start-trial", 40, 300, 160, 48, "Start a trial"),
  element('[data-testid="pricing-link"]', 220, 310, 100, 24, "See pricing"),
];

describe("J-124 S1 the capture's boxes", () => {
  it("reads a boxes file strictly and refuses a field it does not name", () => {
    const file = {
      generatedBy: "greenline check interface",
      address: "/",
      commit: "0123abc",
      at: "2026-10-26T09:00:00.000Z",
      widths: [
        {
          width: 1440,
          height: 900,
          page: { width: 1440, height: 2000 },
          image: { height: 2000 },
          elements: PAGE,
          truncated: false,
        },
      ],
    };
    expect(parseCaptureBoxes(JSON.stringify(file), "f")._tag).toBe("ok");
    expect(parseCaptureBoxes(JSON.stringify({ ...file, extra: 1 }), "f")._tag).toBe("err");
    expect(parseCaptureBoxes("{", "f")._tag).toBe("err");
  });

  it("makes a source file a path from the root, and names none outside it", () => {
    expect(repositoryPathOf("/work/app/src/a.tsx", "/work/app")).toBe("src/a.tsx");
    expect(repositoryPathOf("./src/a.tsx", "/work/app")).toBe("src/a.tsx");
    expect(repositoryPathOf("webpack:///./src/a.tsx", "/work/app")).toBe("src/a.tsx");
    expect(repositoryPathOf("src/a.vue?vue&type=template", "/work/app")).toBe("src/a.vue");
    expect(repositoryPathOf("/elsewhere/a.tsx", "/work/app")).toBeUndefined();
    expect(repositoryPathOf("../a.tsx", "/work/app")).toBeUndefined();
  });

  it("picks the smallest box under a click", () => {
    expect(elementAt(PAGE, 60, 320)?.selector).toBe("#start-trial");
    expect(elementAt(PAGE, 30, 120)?.selector).toBe("main > section");
    expect(elementAt(PAGE, 5000, 5000)).toBeUndefined();
  });

  it("names the elements a stroke lies over, not the page around them", () => {
    const round = [
      [30, 290],
      [340, 290],
      [340, 355],
      [30, 355],
    ] as const;
    expect(elementsUnder(PAGE, round).map((entry) => entry.selector)).toEqual([
      '[data-testid="pricing-link"]',
      "#start-trial",
    ]);
    expect(elementsUnder(PAGE, [])).toEqual([]);
    // Two identical boxes, a link filling its list item: the later, the inner, is named.
    const item = element("li", 10, 10, 100, 20);
    const link = element("li > a", 10, 10, 100, 20);
    expect(
      elementsUnder(
        [item, link],
        [
          [5, 5],
          [120, 35],
        ],
      ).map((entry) => entry.selector),
    ).toEqual(["li > a"]);
  });

  it("finds the marked element again by its selector, else by its source and text", () => {
    const moved = { ...element("main > button", 40, 600, 160, 48, "Start a trial") };
    const sourced: BoxedElement = {
      ...moved,
      source: { file: "src/Cta.tsx", line: 8, column: 7, via: "react" },
    };
    expect(sameElement(PAGE, PAGE[2] ?? moved)?.box.y).toBe(300);
    expect(sameElement([sourced], { ...sourced, selector: "#gone" })?.box.y).toBe(600);
    expect(sameElement([moved], { ...moved, selector: "#gone" })).toBeUndefined();
  });
});
