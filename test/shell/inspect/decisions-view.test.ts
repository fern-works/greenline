import { describe, expect, it } from "vitest";
import type { HomeDocument, SettingsDocument } from "../../../src/core/inspector/documents.ts";
import { DECISIONS_HOME, SETTINGS } from "../../../src/shell/inspect/app/fixtures.ts";
import type { Reading } from "../../../src/shell/inspect/app/ui.ts";
import { decisionsBook } from "../../../src/shell/inspect/app/views.ts";
import { draw } from "./draw.ts";

/**
 * The decisions book in Knowledge draws from two reads, the settings
 * document and the knowledge home (J-237 S1): it reads as reading until
 * both have landed, so the editor and its root statements are drawn
 * together, and a failed read of the home still draws the editor alone.
 */

const unpicked = (): void => undefined;
const HOME: HomeDocument = {
  schema: SETTINGS.schema,
  read: SETTINGS.read,
  kind: "home",
  home: DECISIONS_HOME,
};
const reading = { state: "reading" } as const;
const settingsRead: Reading<SettingsDocument> = { state: "ready", document: SETTINGS };
const homeRead: Reading<HomeDocument> = { state: "ready", document: HOME };

describe("J-237 S1 the decisions book draws once", () => {
  it("draws no editor while the home is still in flight, though the settings have landed", () => {
    const drawn = draw(decisionsBook(settingsRead, reading, unpicked));
    expect(drawn.components).not.toContain("PolicyEditor");
    expect(drawn.text).not.toContain("Root statements");
  });

  it("draws no editor while the settings are in flight, though the home has landed", () => {
    const drawn = draw(decisionsBook(reading, homeRead, unpicked));
    expect(drawn.components).not.toContain("PolicyEditor");
  });

  it("draws the editor with its root statements once both reads have landed", () => {
    const drawn = draw(decisionsBook(settingsRead, homeRead, unpicked));
    expect(drawn.components).toContain("PolicyEditor");
    expect(drawn.text).toContain("Root statements");
  });

  it("draws the editor with no home when the home's read fails, as before", () => {
    const drawn = draw(
      decisionsBook(settingsRead, { state: "failed", message: "refused" }, unpicked),
    );
    expect(drawn.components).toContain("PolicyEditor");
    expect(drawn.text).not.toContain("Root statements");
  });

  it("shows the settings' refusal when the settings fail, whatever the home", () => {
    const drawn = draw(
      decisionsBook({ state: "failed", message: "the settings are refused" }, homeRead, unpicked),
    );
    expect(drawn.components).not.toContain("PolicyEditor");
    expect(drawn.text).toContain("the settings are refused");
  });
});
