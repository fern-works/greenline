import { describe, expect, it } from "vitest";
import { lockedChanged, lockRefusal, patchWrite, textAfter } from "../../src/core/design-lock.ts";
import { parseInterfaceRulings, renderInterfaceRulings } from "../../src/core/interface-rulings.ts";
import { declaredPages, namedFloors, unlocks } from "../../src/core/record-interface.ts";

/**
 * The lock of DESIGN.md and the change record's `## Interface` section
 * (J-148 S3, S4): a write that changes a locked section is refused until
 * the record carries the owner's words for it, and the section's floor
 * rulings, unlocks and routes read line by line.
 */

const DESIGN = [
  "---",
  "name: Tracker",
  "colors:",
  "  primary: '#1a1a1a'",
  "  surface: '#ffffff'",
  "typography:",
  "  body:",
  "    fontFamily: Inter",
  "spacing:",
  "  sm: 4px",
  "---",
  "",
  "## Overview",
  "",
  "A quiet tracker.",
  "",
  "## Colors",
  "",
  "Ink on paper.",
  "",
  "## Layout",
  "",
  "A single column.",
  "",
].join("\n");

describe("J-148 S3 the lock of DESIGN.md", () => {
  it("names the locked sections a write changes, its tokens counted as its own", () => {
    const locked = ["Colors", "Typography"];
    expect(lockedChanged(DESIGN, DESIGN.replace("Ink on paper.", "Ink on slate."), locked)).toEqual(
      ["Colors"],
    );
    expect(lockedChanged(DESIGN, DESIGN.replace("'#1a1a1a'", "'#222222'"), locked)).toEqual([
      "Colors",
    ]);
    expect(
      lockedChanged(DESIGN, DESIGN.replace("fontFamily: Inter", "fontFamily: Geist"), locked),
    ).toEqual(["Typography"]);
    // An unlocked section and its tokens change freely.
    expect(
      lockedChanged(DESIGN, DESIGN.replace("A single column.", "Two columns."), locked),
    ).toEqual([]);
    expect(lockedChanged(DESIGN, DESIGN.replace("sm: 4px", "sm: 6px"), locked)).toEqual([]);
  });

  it("reads the text after a whole write, edits in order and a patch's hunks, and guesses nothing", () => {
    expect(textAfter(DESIGN, { whole: "x" })).toBe("x");
    expect(
      textAfter(DESIGN, { edits: [{ find: "Ink on paper.", put: "Ink on slate." }] }),
    ).toContain("Ink on slate.");
    expect(textAfter(DESIGN, { edits: [{ find: "absent text", put: "y" }] })).toBeUndefined();
    const patch = [
      "*** Begin Patch",
      "*** Update File: DESIGN.md",
      "@@",
      " ## Colors",
      " ",
      "-Ink on paper.",
      "+Ink on slate.",
      "*** End Patch",
    ].join("\n");
    const write = patchWrite(patch, (path) => path === "DESIGN.md");
    expect(write).toBeDefined();
    if (write === undefined) return;
    expect(lockedChanged(DESIGN, textAfter(DESIGN, write) ?? DESIGN, ["Colors"])).toEqual([
      "Colors",
    ]);
    expect(patchWrite(patch, (path) => path === "other.md")).toBeUndefined();
  });

  it("refuses a locked section's change with one line naming it, and lets the owner's unlock through", () => {
    expect(lockRefusal("DESIGN.md", ["Colors"], [])).toBe(
      `this write would change DESIGN.md's Colors section, which the interface rulings hold locked as the owner's pick; ask the owner, write their words in the change record's ## Interface section as \`- unlock Colors: "<their words>"\`, and write again; design-lock`,
    );
    expect(lockRefusal("DESIGN.md", ["Colors"], ["colors"])).toBeUndefined();
    expect(lockRefusal("DESIGN.md", [], [])).toBeUndefined();
  });

  it("locks only the sections the locked line names, a group of tokens no section applies as its own, and `unlock all` opens them", () => {
    expect(
      lockedChanged(DESIGN, DESIGN.replace("A quiet tracker.", "A loud tracker."), []),
    ).toEqual([]);
    expect(
      lockedChanged(DESIGN, DESIGN.replace("name: Tracker", "name: Board"), ["name tokens"]),
    ).toEqual(["name tokens"]);
    expect(lockRefusal("DESIGN.md", ["Overview"], ["all"])).toBeUndefined();
  });

  it("reads and writes the rulings' locked line", () => {
    const book = "# Decisions\n\n## Interface\n\n- platform: web\n- locked: Colors, Typography\n";
    const read = parseInterfaceRulings(book);
    expect(read.issues).toEqual([]);
    expect(read.rulings.locked).toEqual(["Colors", "Typography"]);
    expect(renderInterfaceRulings(read.rulings)).toContain("- locked: Colors, Typography");
  });
});

describe("J-148 S3 and S4 the change record's ## Interface section", () => {
  const body = [
    "## build",
    "",
    '- floor target-size: waived, "not in the build section"',
    "",
    "## Interface",
    "",
    "- page /: tally/templates/tally/home.html",
    '- floor target-size at the remove button: waived, "keep it small, it is a dense table"',
    "- floor focus-visible: fixed",
    "- floor text-contrast-aa at /settings",
    "- floor target-size at /items/:id: fixed",
    '- unlock Colors: "yes, warm the ink"',
    "",
  ].join("\n");

  it("reads each floor finding with the owner's ruling or none, and nothing outside the section", () => {
    expect(namedFloors(body).map((floor) => [floor.rule, floor.where, floor.ruling])).toEqual([
      [
        "target-size",
        "the remove button",
        { kind: "waived", words: "keep it small, it is a dense table" },
      ],
      ["focus-visible", "", { kind: "fixed" }],
      ["text-contrast-aa", "/settings", { kind: "none" }],
      ["target-size", "/items/:id", { kind: "fixed" }],
    ]);
  });

  it("reads the unlocks and the routes", () => {
    expect(unlocks(body)).toEqual([{ section: "Colors", words: "yes, warm the ink" }]);
    expect([...declaredPages(body)]).toEqual([["tally/templates/tally/home.html", "/"]]);
  });
});
