import { describe, expect, it } from "vitest";
import { exactInstantMilliseconds, sameExactInstant } from "../../src/commons/instant.ts";

describe("exact PostgreSQL instants", () => {
  it("accepts equivalent zero-padded spellings without changing their text", () => {
    expect(sameExactInstant("2026-09-20T10:00:00Z", "2026-09-20T10:00:00.000Z")).toBe(true);
    expect(sameExactInstant("2026-09-20T10:00:00.123Z", "2026-09-20T10:00:00.123000Z")).toBe(true);
  });

  it("refuses precision the driver would truncate instead of equating distinct instants", () => {
    expect(exactInstantMilliseconds("2026-09-20T10:00:00.1234Z")).toMatchObject({
      _tag: "err",
      error: { kind: "unsupported precision" },
    });
    expect(sameExactInstant("2026-09-20T10:00:00.1234Z", "2026-09-20T10:00:00.123Z")).toBe(false);
  });
});
