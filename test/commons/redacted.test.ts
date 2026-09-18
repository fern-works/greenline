import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { Redacted } from "../../src/commons/redacted.ts";

it("G2 formats a wrapped credential without exposing its value", () => {
  const secret = randomBytes(32).toString("base64url");
  const credential = new Redacted(secret);
  expect(String(credential)).toBe("[redacted]");
  expect(JSON.stringify({ credential })).toBe('{"credential":"[redacted]"}');
  expect(inspect({ credential })).not.toContain(secret);
  expect(credential.reveal()).toBe(secret);
});
