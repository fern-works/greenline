import { expect, it } from "vitest";
import { contractDiagnostics } from "../../src/shell/cli/command-outcome.ts";

it("locates each contract issue at its file and names its field in the message", () => {
  const [issue] = contractDiagnostics(
    "GL0102",
    [{ path: "skills.exclude[0]", message: "Invalid input: expected string" }],
    ".greenline/manifest.json",
  );
  expect(issue?.message).toBe("skills.exclude[0]: Invalid input: expected string");
  expect(issue?.path).toBe(".greenline/manifest.json");
});
