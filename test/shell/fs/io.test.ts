import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOk } from "../../../src/commons/result.ts";
import { atomicWriteFile } from "../../../src/shell/fs/io.ts";

/** Run a test against a fresh temp directory that is removed on exit. */
function inTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "greenline-io-test-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("atomicWriteFile", () => {
  it("creates a file with the exact content and creates missing parents", () => {
    inTempDir((dir) => {
      const path = join(dir, "nested", "deeper", "file.txt");
      const result = atomicWriteFile(path, "hello");
      expect(isOk(result)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe("hello");
    });
  });

  it("replaces existing content in place", () => {
    inTempDir((dir) => {
      const path = join(dir, "file.txt");
      atomicWriteFile(path, "first");
      const result = atomicWriteFile(path, "second");
      expect(isOk(result)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe("second");
    });
  });

  it("leaves no temp litter behind after a successful write", () => {
    inTempDir((dir) => {
      const path = join(dir, "clean.txt");
      atomicWriteFile(path, "content");
      expect(readdirSync(dir)).toEqual(["clean.txt"]);
    });
  });
});
