/**
 * greenline/readers in the built package (J-150 S2; docs/SPEC.md, "The
 * readers module"): the build's entry exports what the source module does,
 * with its types, and a consumer that installs the prepared package imports
 * `greenline/readers` through the package's exports. The build is the one
 * `pnpm build` wrote, as the gate's `tsdown-build` row runs it before the
 * suite.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import * as source from "../../src/readers/index.ts";

const repoRoot = join(import.meta.dirname, "..", "..");
const built = join(repoRoot, "dist", "readers", "readers.mjs");
const types = join(repoRoot, "dist", "readers", "readers.d.mts");
const prepared = join(repoRoot, "dist", "package");

// A checkout with no build builds once, as the built-bundle tests do; the gate's build row has always run first.
beforeAll(() => {
  if (!existsSync(built) || !existsSync(join(prepared, "dist/readers/readers.mjs")))
    execFileSync("pnpm", ["build"], { cwd: repoRoot, stdio: "ignore" });
}, 600_000);

/** The types the module exports beside its values, which a consumer's compiler reads from the types file. */
const TYPES = [
  "EventInput",
  "FrameDecider",
  "FrameMap",
  "FrameQuestion",
  "Harness",
  "JsonValue",
  "LoadSeen",
  "LoadsReader",
  "NormalisedEvent",
  "PictureCount",
  "PictureNote",
  "RecordBreach",
  "RecordLintInput",
  "RecordLintRule",
  "RefusalLine",
  "ReplyParts",
  "ShellReading",
  "Sighting",
  "SkillFile",
  "Span",
  "UnmarkedCard",
];

const homes: string[] = [];
afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("J-150 S2 the readers module as the build writes it", () => {
  it("exports from the built entry every reader the source module exports, and its types name them", async () => {
    // SAFETY: the import is the built bundle of this module; its keys are compared with the source's below.
    const entry = (await import(built)) as typeof source;
    expect(Object.keys(entry).toSorted()).toEqual(Object.keys(source).toSorted());
    const declared = readFileSync(types, "utf8");
    const exported = /export \{([^}]*)\}/.exec(declared)?.[1] ?? "";
    const names = exported.split(",").map((name) => name.trim().replace(/^type /, ""));
    expect(names.toSorted()).toEqual([...Object.keys(source), ...TYPES].toSorted());
  });

  it("reads a reply in the built entry as the source does", async () => {
    // SAFETY: the built bundle exports the readers by these names, checked above against the source's.
    const entry = (await import(built)) as typeof source;
    const reply = "Done.\n\nWaiting on: your word.\n\nhttp://127.0.0.1:4747/changes/x";
    expect(entry.replyPartsOf(reply)).toEqual(source.replyPartsOf(reply));
    expect(entry.replyPartsOf(reply).waiting).toBe("Waiting on: your word.");
    // The record lint's readers, which the apparatus's ledger oracle imports (J-149 S1).
    const record = [
      "---",
      "mode: quick",
      "choice: accepted",
      'why: "a fix"',
      "state: open",
      "---",
      "",
      "## frame",
      "",
      "- Q1 [scope] Archived rows too?",
      "  - decided: owner",
      "",
    ].join("\n");
    const id = "2026-10-29-a-fix";
    expect(entry.recordBreaches({ id, text: record })).toEqual(
      source.recordBreaches({ id, text: record }),
    );
    expect(entry.recordBreaches({ id, text: record }).map((breach) => breach.rule)).toEqual([
      "frame",
    ]);
    expect(
      entry.frameMapOf("- Q1 [scope] Why?\n  - answer: yes\n  - decided: agent").questions,
    ).toEqual(
      source.frameMapOf("- Q1 [scope] Why?\n  - answer: yes\n  - decided: agent").questions,
    );
    const discussion = [
      "---",
      'idea: "a cache"',
      "state: open",
      "---",
      "",
      "## frame",
      "",
      "- Q1 [scope] Which pages?",
      "  - answer: the list",
      "  - decided: the owner, on the card",
      "",
    ].join("\n");
    expect(entry.discussionBreaches("2026-10-29-a-cache", discussion).map((b) => b.rule)).toEqual([
      "frame",
    ]);
  });
});

describe("J-150 S2 greenline/readers from the prepared package", () => {
  it("names the module in the package's exports and carries its files", () => {
    const manifest = z
      .object({ exports: z.record(z.string(), z.unknown()), files: z.array(z.string()) })
      .loose()
      .parse(JSON.parse(readFileSync(join(prepared, "package.json"), "utf8")));
    expect(manifest.exports["./readers"]).toEqual({
      types: "./dist/readers/readers.d.mts",
      import: "./dist/readers/readers.mjs",
    });
    expect(manifest.files).toContain("dist/readers");
    expect(existsSync(join(prepared, "dist/readers/readers.mjs"))).toBe(true);
    expect(existsSync(join(prepared, "dist/readers/readers.d.mts"))).toBe(true);
  });

  it("resolves greenline/readers for a consumer that installs the package, and reads with it", () => {
    const consumer = mkdtempSync(join(tmpdir(), "greenline-readers-"));
    homes.push(consumer);
    mkdirSync(join(consumer, "node_modules"), { recursive: true });
    symlinkSync(prepared, join(consumer, "node_modules", "greenline"), "dir");
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(
      join(consumer, "read.mjs"),
      [
        'import { replyPartsOf, refusalOf } from "greenline/readers";',
        'const refusal = refusalOf("commit first; discard-words, greenline\'s harness hook");',
        'const parts = replyPartsOf("Done.\\n\\nWaiting on: your word.");',
        "console.log(JSON.stringify([parts.waiting, refusal?.rule]));",
      ].join("\n"),
    );
    const run = spawnSync(process.execPath, ["read.mjs"], { cwd: consumer, encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.stdout.trim()).toBe(JSON.stringify(["Waiting on: your word.", "discard-words"]));
  });
});
