/**
 * Where a link into the visual home leads (J-110 S2): a visual's file or its
 * manifest opens the visual's page, a subsystem's page opens the atlas's
 * page, and a path the home's layout does not hold is shown as text.
 */
import { describe, expect, it } from "vitest";
import { repositoryResolver } from "../../../src/shell/inspect/links.ts";

describe("J-110 S2 a link into the visual home", () => {
  const fromLedger = repositoryResolver(".greenline/ledger");

  it("opens a change's visual, the map's and a journey's page by the visual's id", () => {
    expect(fromLedger("../visuals/2026-10-24-cache/request-path.svg")).toEqual({
      kind: "page",
      href: "/pictures/2026-10-24-cache/request-path",
    });
    expect(fromLedger("../visuals/map/architecture.visual.json")).toEqual({
      kind: "page",
      href: "/pictures/map/architecture",
    });
    expect(fromLedger("../visuals/subsystems/http/a-request.html")).toEqual({
      kind: "page",
      href: "/pictures/subsystems/http/a-request",
    });
  });

  it("opens a subsystem's page in the atlas, and shows any other path in the home as text", () => {
    expect(fromLedger("../visuals/subsystems/http.md")).toEqual({
      kind: "page",
      href: "/knowledge/map/http",
    });
    expect(fromLedger("../visuals/atlas.json")).toEqual({ kind: "text" });
    expect(fromLedger("../visuals/loose.svg")).toEqual({ kind: "text" });
  });
});
