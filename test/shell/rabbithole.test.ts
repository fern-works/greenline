import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  factsFileName,
  finishedFacts,
  serializeFacts,
  startedFacts,
} from "../../src/core/facts.ts";
import { RABBITHOLE_PHRASE } from "../../src/core/rabbithole.ts";
import { cardsNoteLine } from "../../src/shell/cards-note.ts";
import { rabbitholeNudge } from "../../src/shell/rabbithole.ts";
import { startTurn } from "../../src/shell/skill-loads.ts";

/**
 * The rabbithole nudge in a workspace (J-195 S3): read from the change's raw
 * log and its recorded checks, written to the raw log as its fact, printed
 * once per change and noted for the next turn's mirror.
 */

const ID = "2026-11-07-overdue-fees";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-rabbithole-"));
  roots.push(root);
  mkdirSync(join(root, ".greenline", "tmp", ID), { recursive: true });
  return root;
}

function logEdit(root: string, at: string, path: string): void {
  appendFileSync(
    join(root, ".greenline", "tmp", ID, "events.jsonl"),
    `${JSON.stringify({ v: 1, at, harness: "claude-code", kind: "after-tool", session: "s1", cwd: root, write: { paths: [join(root, path)] } })}\n`,
  );
}

function recordPass(root: string, at: string): void {
  const folder = join(root, ".greenline", "ledger", ID, "checks");
  mkdirSync(folder, { recursive: true });
  const started = startedFacts({
    arguments: ["pnpm", "test"],
    startedAt: at,
    commit: null,
    tree: null,
    installation: "0".repeat(64),
  });
  writeFileSync(
    join(folder, factsFileName(at, "abc123")),
    serializeFacts(finishedFacts(started, { kind: "exited", code: 0 }, 1000)),
  );
}

describe("J-195 S3 the nudge read from the change's facts", () => {
  it("prints on the third edit of the same file, once per change, and notes its fact in the raw log", () => {
    const root = workspace();
    logEdit(root, "2026-11-07T10:00:00.000Z", "src/fees.ts");
    logEdit(root, "2026-11-07T10:01:00.000Z", "src/fees.ts");
    expect(rabbitholeNudge(root, ID, null)).toBeUndefined();
    logEdit(root, "2026-11-07T10:02:00.000Z", "src/fees.ts");
    const line = rabbitholeNudge(root, ID, null);
    expect(line).toContain(RABBITHOLE_PHRASE);
    expect(line).toContain("src/fees.ts");
    const log = readFileSync(join(root, ".greenline", "tmp", ID, "events.jsonl"), "utf8");
    expect(log).toMatch(/"kind":"nudge","rule":"rabbithole","files":\["src\/fees\.ts"\]/);
    logEdit(root, "2026-11-07T10:03:00.000Z", "src/fees.ts");
    expect(rabbitholeNudge(root, ID, null)).toBeUndefined();
  });

  it("prints none where a passing recorded check stands between the edits", () => {
    const root = workspace();
    logEdit(root, "2026-11-07T10:00:00.000Z", "src/fees.ts");
    logEdit(root, "2026-11-07T10:01:00.000Z", "src/fees.ts");
    recordPass(root, "2026-11-07T10:01:30.000Z");
    logEdit(root, "2026-11-07T10:02:00.000Z", "src/fees.ts");
    expect(rabbitholeNudge(root, ID, null)).toBeUndefined();
  });

  it("leaves greenline's own folder out of the edits it counts", () => {
    const root = workspace();
    for (const minute of ["00", "01", "02"])
      logEdit(root, `2026-11-07T10:${minute}:00.000Z`, `.greenline/ledger/${ID}.md`);
    expect(rabbitholeNudge(root, ID, null)).toBeUndefined();
  });

  it("notes the line for the next turn's mirror where a session holds the change", () => {
    const root = workspace();
    for (const minute of ["00", "01", "02"])
      logEdit(root, `2026-11-07T10:${minute}:00.000Z`, "src/fees.ts");
    startTurn(root, "s1", "2026-11-07T09:59:00.000Z");
    const line = rabbitholeNudge(root, ID, "s1");
    expect(line).toBeDefined();
    // The mirror at the next turn's start repeats it once, and no later turn does.
    startTurn(root, "s1", "2026-11-07T10:05:00.000Z");
    expect(cardsNoteLine(root, "s1")).toBe(line);
    startTurn(root, "s1", "2026-11-07T10:09:00.000Z");
    expect(cardsNoteLine(root, "s1")).toBeUndefined();
  });
});
