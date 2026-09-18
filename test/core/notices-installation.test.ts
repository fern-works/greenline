import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileInstallation } from "../../src/shell/installation.ts";
import { renderProjection } from "../../src/core/render.ts";
import { fixtureConfiguration } from "../fixtures/corpus.ts";

it("G3 carries the source notices unchanged into the installed repository", () => {
  const installation = compileInstallation("corpus");
  if (installation._tag === "err") throw installation.error;
  const files = renderProjection(fixtureConfiguration, installation.value);
  expect(files.find((file) => file.path === ".greenline/THIRD_PARTY_NOTICES.md")).toEqual({
    path: ".greenline/THIRD_PARTY_NOTICES.md",
    kind: "file",
    key: undefined,
    content: readFileSync("THIRD_PARTY_NOTICES.md", "utf8"),
  });
});
