import { expect, it } from "vitest";
import { contractDiagnostics } from "../../src/shell/cli/command-outcome.ts";

it("names the sibling reason field when a decision field refuses prose", () => {
  const [withHint, plain] = contractDiagnostics(
    "GL0123",
    [
      {
        path: "selections[0].decision",
        message: 'Invalid option: expected one of "selected"|"deferred"',
      },
      { path: "selections[0].reason", message: "Invalid input: expected string" },
    ],
    ".greenline/ledger/records/repair.json",
  );
  expect(withHint?.message).toBe(
    'selections[0].decision: Invalid option: expected one of "selected"|"deferred" The prose belongs in the sibling \'reason\' field.',
  );
  expect(withHint?.path).toBe(".greenline/ledger/records/repair.json");
  expect(plain?.message).toBe("selections[0].reason: Invalid input: expected string");
});
