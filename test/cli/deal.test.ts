/**
 * The interface catalog installed on request and dealt from (J-123 S6): the
 * extra is absent after init and the deal says so; once the manifest
 * includes it, sync installs its page and its entries, and `greenline deal`
 * prints three directions, the same three under the same ask, others on the
 * reroll.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Installation } from "../../src/core/installation.ts";
import { runDealCli } from "../../src/shell/cli/deal.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { compileInstallation } from "../../src/shell/installation.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
const installation = (): Installation => {
  if (compiled._tag === "err") throw new Error(JSON.stringify(compiled.error.issues));
  return compiled.value;
};

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function cli(root: string, ...argv: string[]): Ran {
  const recording = new RecordingWriter();
  const code = runCli(argv, recording.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: installation(),
  });
  return { code, out: recording.out, err: recording.err };
}

function dealt(root: string, ...argv: string[]): Ran {
  const recording = new RecordingWriter();
  const code = runDealCli(argv, recording.writer, root);
  return { code, out: recording.out, err: recording.err };
}

describe("J-123 S6 the catalog installs on request and deals", () => {
  it("is absent by default, installs when the manifest includes it, and deals three directions", () => {
    const root = mkdtempSync(join(tmpdir(), "deal-"));
    cleanup.push(root);
    execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    const init = cli(root, "init", "--yes");
    expect(init.code, init.out + init.err).toBe(0);
    const entries = join(root, ".claude", "skills", "interface-catalog", "catalog", "entries.json");
    expect(existsSync(entries)).toBe(false);
    const absent = dealt(root, "--register", "site");
    expect(absent.code).toBe(1);
    expect(absent.err).toContain("the interface catalog is not installed");

    const path = join(root, ".greenline", "manifest.json");
    const manifest: { skills: { include: string[] } } = JSON.parse(readFileSync(path, "utf8"));
    manifest.skills.include = ["interface-catalog"];
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    const sync = cli(root, "sync");
    expect(sync.code, sync.out + sync.err).toBe(0);
    expect(readFileSync(entries, "utf8")).toBe(
      readFileSync(
        join(import.meta.dirname, "../../corpus/interface/catalog/entries.json"),
        "utf8",
      ),
    );
    expect(existsSync(join(root, ".agents", "skills", "interface-catalog", "SKILL.md"))).toBe(true);

    const first = dealt(root, "--register", "site", "--job", "sign-up", "--tone", "calm");
    expect(first.code, first.err).toBe(0);
    // The catalog's pin is the installed entries' digest, which the direction's ruling line names.
    expect(first.out).toMatch(/^Dealt from catalog [0-9a-f]{12} under seed \d+\.\n\nDirection 1: /);
    expect(first.out).toContain("\nDirection 3: ");
    expect(dealt(root, "--register", "site", "--job", "sign-up", "--tone", "calm").out).toBe(
      first.out,
    );
    const again = dealt(
      root,
      "--register",
      "site",
      "--job",
      "sign-up",
      "--tone",
      "calm",
      "--reroll",
    );
    expect(again.out).toContain(", rerolled.");
    expect(again.out.replace(/^.*\n/, "")).not.toBe(first.out.replace(/^.*\n/, ""));
    const json: { directions: { parts: { id: string }[] }[] } = JSON.parse(
      dealt(root, "--register", "app", "--seed", "4", "--json").out,
    );
    expect(json.directions).toHaveLength(3);
  });

  it("refuses a register off the list and a register it cannot tell", () => {
    const root = mkdtempSync(join(tmpdir(), "deal-"));
    cleanup.push(root);
    expect(dealt(root, "--register", "landing").code).toBe(2);
    const untold = dealt(root);
    expect(untold.code).toBe(2);
    expect(untold.err).toContain("name the register with --register site or app");
  });
});
