import { expect, it } from "vitest";
import { parseInstallation } from "../../src/core/installation.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

it("G3 refuses guidance payloads and content corruption in the installation asset", () => {
  const installation = fixtureInstallation();
  expect(parseInstallation(JSON.stringify(installation), "asset")).toEqual({
    _tag: "ok",
    value: installation,
  });
  expect(
    parseInstallation(
      JSON.stringify({ ...installation, units: [{ content: "guidance body" }] }),
      "asset",
    )._tag,
  ).toBe("err");
  expect(
    parseInstallation(JSON.stringify({ ...installation, agentGuide: "tampered" }), "asset")._tag,
  ).toBe("err");
});
