import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/commons/hash.ts";

describe("sha256Hex", () => {
  it("matches the standard empty-string vector", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the standard abc vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic for identical input", () => {
    expect(sha256Hex("same input")).toBe(sha256Hex("same input"));
  });

  it("distinguishes different input", () => {
    expect(sha256Hex("one")).not.toBe(sha256Hex("two"));
  });
});
