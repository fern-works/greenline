import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findFilesNamed } from "../../../src/shell/fs/walk.ts";

/**
 * The marker walk behind the drift scan (M6 Stage 1): a marker is a
 * file name, a `*.ext` suffix for a build file whose stem is the
 * project's own, or a `name/` directory; a skipped directory is never
 * entered; a source-file extension is never a marker.
 */

describe("findFilesNamed", () => {
  it("matches names, suffixes, and directories, sorted and root-relative, skipping named trees", () => {
    const root = mkdtempSync(join(tmpdir(), "gl-walk-"));
    try {
      mkdirSync(join(root, "src", "main", "kotlin"), { recursive: true });
      mkdirSync(join(root, "node_modules", "dep"), { recursive: true });
      mkdirSync(join(root, "App.xcodeproj"), { recursive: true });
      writeFileSync(join(root, "Demo.csproj"), "<Project />\n");
      writeFileSync(join(root, "Gemfile"), "source 'https://rubygems.org'\n");
      writeFileSync(join(root, "node_modules", "dep", "Gemfile"), "");
      writeFileSync(join(root, "src", "main", "kotlin", "Main.kt"), "fun main() {}\n");
      const found = findFilesNamed(
        root,
        ["Gemfile", "*.csproj", "kotlin/", "*.xcodeproj/", "*.kt"],
        ["node_modules"],
      );
      expect(found).toEqual([
        "App.xcodeproj/",
        "Demo.csproj",
        "Gemfile",
        "src/main/kotlin/",
        "src/main/kotlin/Main.kt",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
