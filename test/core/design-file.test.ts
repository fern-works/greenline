import { describe, expect, it } from "vitest";
import {
  DESIGN_SECTIONS,
  designSkeleton,
  governingHome,
  parseDesign,
  referenceReadings,
  resolveValue,
  sectionOrderIssues,
  serializeDesign,
  withToken,
  type DesignDocument,
} from "../../src/core/design-file.ts";

/**
 * DESIGN.md read and written in the format of Google's DESIGN.md spec
 * (J-123 S1): the tokens in YAML front matter, the eight prose sections, the
 * references between tokens, and the nearest file governing a path.
 */

/** A document in the spec's format, written for this test in greenline's own words and values. */
const EXAMPLE = `---
version: alpha
name: Harbour Ledger
description: A quiet product interface for reading accounts.
colors:
  primary: "#1f3a5f"
  on-primary: "#ffffff"
  surface: "#f7f7f5"
  ink: "#1c1c1a"
  # The muted ink stays above 4.5:1 on the surface.
  ink-muted: "#5c5c57"
  accent: "{colors.primary}"
typography:
  body:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    letterSpacing: 0.02em
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
---

# Harbour Ledger

## Overview

Accounts read like a ledger: dense, calm, and exact.

## Colors

One blue carries every action; the rest is ink on paper.

## Typography

A serif for reading, a sans for labels.

## Layout

An eight-pixel grid.

## Elevation & Depth

Flat surfaces separated by hairlines.

## Shapes

Small radii on controls only.

## Components

The primary button is the one filled control on a screen.

## Do's and Don'ts

Do keep tables dense. Don't add a second accent.
`;

function parsed(text: string): DesignDocument {
  const result = parseDesign(text, "DESIGN.md");
  if (result._tag === "err") throw new Error(JSON.stringify(result.error.issues));
  return result.value;
}

describe("J-123 S1 DESIGN.md in the spec's format", () => {
  it("round-trips the example byte for byte", () => {
    expect(serializeDesign(parsed(EXAMPLE))).toBe(EXAMPLE);
  });

  it("reads the tokens by group and the eight sections in order", () => {
    const document = parsed(EXAMPLE);
    expect(document.name).toBe("Harbour Ledger");
    expect(document.tokens.colors.map((token) => token.name)).toEqual([
      "primary",
      "on-primary",
      "surface",
      "ink",
      "ink-muted",
      "accent",
    ]);
    expect(document.tokens.typography[1]).toEqual({
      name: "label",
      fields: [
        { name: "fontFamily", value: "IBM Plex Sans" },
        { name: "fontSize", value: "13px" },
        { name: "letterSpacing", value: "0.02em" },
      ],
    });
    expect(document.tokens.rounded).toEqual([
      { name: "sm", value: "4px" },
      { name: "md", value: "8px" },
    ]);
    expect(document.sections.map((section) => section.heading)).toEqual([...DESIGN_SECTIONS]);
    expect(document.unknownKeys).toEqual([]);
    expect(sectionOrderIssues(document)).toEqual([]);
  });

  it("follows a reference to its value, and names one that breaks or loops", () => {
    const document = parsed(EXAMPLE);
    expect(resolveValue(document, "{colors.accent}")).toEqual({ kind: "value", value: "#1f3a5f" });
    expect(resolveValue(document, "{colors.brand}")).toEqual({
      kind: "broken",
      path: "colors.brand",
    });
    const looped = parsed(
      EXAMPLE.replace('accent: "{colors.primary}"', 'accent: "{colors.accent}"'),
    );
    expect(referenceReadings(looped).find((entry) => entry.token === "colors.accent")).toEqual({
      token: "colors.accent",
      reading: { kind: "cycle", path: "colors.accent" },
    });
  });

  it("names an unknown key, a section out of order, and refuses an unquoted colour", () => {
    const unknown = parsed(
      EXAMPLE.replace("rounded:\n", "brandColours:\n  red: '#c00'\nrounded:\n"),
    );
    expect(unknown.unknownKeys).toEqual(["brandColours"]);
    const swapped = parsed(
      EXAMPLE.replace("## Colors\n", "## Shapes-first\n").replace(
        "## Components\n",
        "## Colors\n\nmoved\n\n## Components\n",
      ),
    );
    expect(sectionOrderIssues(swapped)).toEqual(["Colors"]);
    const bare = parseDesign(
      EXAMPLE.replace('primary: "#1f3a5f"', "primary: #1f3a5f"),
      "DESIGN.md",
    );
    expect(bare._tag === "err" && bare.error.issues[0]?.message).toBe(
      "the value of 'primary' starts with '#', which YAML reads as a comment; quote it",
    );
  });

  it("writes a token into its group and a skeleton that reads back with the eight sections", () => {
    const document = parsed(EXAMPLE);
    const written = parsed(serializeDesign(withToken(document, "colors", "danger", "#b42318")));
    expect(written.tokens.colors.at(-1)).toEqual({ name: "danger", value: "#b42318" });
    expect(written.body).toBe(document.body);
    const skeleton = parsed(designSkeleton("Harbour", "Accounts, read calmly."));
    expect(skeleton.sections.map((section) => section.heading)).toEqual([...DESIGN_SECTIONS]);
    expect(skeleton.name).toBe("Harbour");
  });

  it("lets the nearest DESIGN.md govern a path, the root's what no nested one holds", () => {
    const homes = [".", "apps/site", "apps/site/docs"];
    expect(governingHome("apps/site/docs/a.css", homes)).toBe("apps/site/docs");
    expect(governingHome("apps/site/page.tsx", homes)).toBe("apps/site");
    expect(governingHome("apps/console/page.tsx", homes)).toBe(".");
    expect(governingHome("apps/console/page.tsx", ["apps/site"])).toBeUndefined();
  });
});
