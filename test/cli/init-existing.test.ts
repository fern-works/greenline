/** `greenline init` on a workspace that already has its manifest: refused, never initialized again, and never through a redirected path. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A new Git root, and the CLI run in it on the fixture installation. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "gl-init-existing-"));
  roots.push(root);
  mkdirSync(join(root, ".git"));
  const installation = fixtureInstallation();
  const run = (args: readonly string[]) => {
    const writer = new RecordingWriter();
    const code = runCli(args, writer.writer, "test", { cwd: root, version: "test", installation });
    return { code, out: writer.out };
  };
  return { root, run };
}

/** The one diagnostic a refused init reports. */
function refusal(out: string) {
  return JSON.parse(out).diagnostics;
}

it("refuses a plain init on an initialized workspace and leaves the manifest as it was", () => {
  const { root, run } = workspace();
  expect(run(["init", "--yes"]).code).toBe(0);
  const before = readFileSync(join(root, ".greenline/manifest.json"), "utf8");
  const again = run(["init", "--yes", "--json"]);
  expect(again.code).toBe(1);
  expect(refusal(again.out)).toEqual([
    {
      code: "GL0124",
      severity: "error",
      path: ".greenline/manifest.json",
      message: expect.stringContaining("Workspace already initialized"),
    },
  ]);
  expect(readFileSync(join(root, ".greenline/manifest.json"), "utf8")).toBe(before);
});

it("refuses an init whose write-lock directory is redirected outside the repository", () => {
  const { root, run } = workspace();
  expect(run(["init", "--yes"]).code).toBe(0);
  const outside = mkdtempSync(join(tmpdir(), "gl-init-existing-outside-"));
  roots.push(outside);
  rmSync(join(root, ".greenline/tmp"), { recursive: true, force: true });
  symlinkSync(outside, join(root, ".greenline/tmp"));
  const refused = run(["init", "--yes", "--json"]);
  expect(refused.code).toBe(1);
  expect(refusal(refused.out)).toEqual([
    expect.objectContaining({
      code: "GL0124",
      message:
        "Manifest and write-lock paths must remain inside the repository without redirection.",
    }),
  ]);
});
