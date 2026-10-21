import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tidyWorkingFolders, type DeviceOf } from "../../src/shell/tidy.ts";

/**
 * A working folder that is a mount of another file system is kept with GL0470
 * before any removal starts (J-73 S4, F-3a). No mount can be made in a test,
 * so the device reader tidy takes is the stub `mountedAt`: for the one path it
 * names it reports a device id one above the disk's, as a mount would, and
 * every other path reads its real device id with lstat.
 */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The stub device reader: the disk's device id, but one above it for the mounted path. */
function mountedAt(mounted: string): DeviceOf {
  return (path) => lstatSync(path).dev + (path === mounted ? 1 : 0);
}

describe("J-73 S4 a working folder on another file system", () => {
  it("J-73 S4 is kept as redirected with nothing removed, read through the stub device reader mountedAt", () => {
    const root = mkdtempSync(join(tmpdir(), "tidy-mount-"));
    roots.push(root);
    const files = {
      ".greenline/ledger/2026-10-14-done.md": [
        "---",
        "mode: quick",
        "choice: accepted",
        'why: "w"',
        "state: done",
        "---",
        "",
      ].join("\n"),
      ".greenline/tmp/2026-10-14-done/a.md": "a\n",
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const report = tidyWorkingFolders(
      root,
      "2026-10-14-done",
      mountedAt(join(root, ".greenline", "tmp", "2026-10-14-done")),
    );
    if (report._tag === "err") throw report.error;
    expect(report.value).toEqual({
      removed: [],
      kept: [
        { path: ".greenline/tmp/2026-10-14-done", reason: { kind: "redirected" }, refused: true },
      ],
    });
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/a.md"))).toBe(true);
    // The same folder on the tmp folder's own file system is removed.
    const plain = tidyWorkingFolders(root, "2026-10-14-done");
    if (plain._tag === "err") throw plain.error;
    expect(plain.value.removed).toEqual([".greenline/tmp/2026-10-14-done"]);
  });
});
