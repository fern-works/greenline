import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

/**
 * The status command (`docs/SPEC.md` section 4): the House rulings it lists,
 * and its refusal outside a workspace.
 */

const VERSION: string = "0.1.0";
const tempDirs: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-status-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  const rec = new RecordingWriter();
  const code = runCli(["init", "--yes"], rec.writer, VERSION, {
    cwd: dir,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  if (code !== 0) throw new Error(`init failed in fixture: ${rec.err}`);
  return dir;
}

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function run(root: string, args: readonly string[]): Run {
  const rec = new RecordingWriter();
  const code = runCli([...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  return { code, out: rec.out, err: rec.err };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("greenline status", () => {
  it("lists the House rulings stanza's dash lines from AGENTS.md, as text and in the envelope", () => {
    const root = makeWorkspace();
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    writeFileSync(
      join(root, "AGENTS.md"),
      `# demo\n\n## House rulings\n\n- Errors are thrown, never returned.\n- No default exports.\n\n${agents}`,
    );
    const human = run(root, ["status"]);
    expect(human.code).toBe(0);
    expect(human.out).toContain("house rulings (AGENTS.md): 2");
    expect(human.out).toContain("  - No default exports.");
    const json = run(root, ["status", "--json"]);
    expect(JSON.parse(json.out).houseRulings).toEqual([
      "Errors are thrown, never returned.",
      "No default exports.",
    ]);
    const bare = run(makeWorkspace(), ["status"]);
    expect(bare.out).toContain("house rulings: none");
  });

  it("fails closed with GL0101 outside an initialized workspace", () => {
    const root = makeWorkspace();
    rmSync(join(root, ".greenline"), { recursive: true, force: true });
    const result = run(root, ["status"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("GL0101");
  });
});
