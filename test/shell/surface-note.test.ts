/**
 * The running surface read from a session and noted for status and the
 * viewer (J-151 S1): the session's signals read from the payload and the
 * first line of the transcript it names, and the newest note of each
 * harness read back.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runningSurface } from "../../src/core/adapters.ts";
import { notedSurface, noteSurface, sessionSurface } from "../../src/shell/skill-loads.ts";

const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-surface-"));
  cleanup.push(dir);
  return dir;
}

/** A rollout whose first line is the session's meta with the source given. */
function rollout(dir: string, source: string | { readonly subagent: string }): string {
  const path = join(dir, "rollout.jsonl");
  writeFileSync(path, `${JSON.stringify({ type: "session_meta", payload: { source } })}\n{}\n`);
  return path;
}

/** Set a session's note to an instant, so the newest is the one meant. */
function age(dir: string, session: string, iso: string): void {
  const at = new Date(iso);
  utimesSync(join(dir, ".greenline", "tmp", "sessions", `${session}.surface.json`), at, at);
}

describe("J-151 S1 the surface read from a session", () => {
  it("reads exec from the rollout's first line, and a sub-agent's object source as nothing", () => {
    const dir = root();
    expect(
      sessionSurface(
        "codex",
        { permission_mode: "plan", transcript_path: rollout(dir, "exec") },
        dir,
      ).surface,
    ).toBe("headless, codex exec");
    expect(
      sessionSurface(
        "codex",
        { permission_mode: "default", transcript_path: rollout(dir, { subagent: "x" }) },
        dir,
      ).surface,
    ).toBe("CLI, default mode");
    // A relative transcript path resolves from the directory given.
    rollout(dir, "exec");
    expect(sessionSurface("codex", { transcript_path: "rollout.jsonl" }, dir).surface).toBe(
      "headless, codex exec",
    );
  });

  it("reads nothing from a first line past the cap or a file that is absent", () => {
    const dir = root();
    const long = join(dir, "long.jsonl");
    writeFileSync(
      long,
      `${JSON.stringify({ type: "session_meta", payload: { source: "exec", pad: "x".repeat(1100 * 1024) } })}\n`,
    );
    expect(sessionSurface("codex", { transcript_path: long }, dir)).toBe(runningSurface("codex"));
    expect(
      sessionSurface("codex", { permission_mode: "default", transcript_path: join(dir, "no") }, dir)
        .surface,
    ).toBe("CLI, default mode");
  });

  it("gives another harness its first row whatever the payload says", () => {
    const dir = root();
    expect(
      sessionSurface(
        "claude-code",
        { permission_mode: "plan", transcript_path: rollout(dir, "exec") },
        dir,
      ),
    ).toBe(runningSurface("claude-code"));
  });
});

describe("J-151 S1 the noted surface status and the viewer read", () => {
  it("reads the newest note of each harness, a later note of another harness leaving it", () => {
    const dir = root();
    mkdirSync(join(dir, ".greenline", "tmp", "sessions"), { recursive: true });
    noteSurface(dir, "x1", runningSurface("codex", { source: "exec" }));
    age(dir, "x1", "2026-10-19T10:00:00.000Z");
    noteSurface(dir, "c1", runningSurface("claude-code"));
    age(dir, "c1", "2026-10-19T11:00:00.000Z");
    expect(notedSurface(dir, "codex").surface).toBe("headless, codex exec");
    expect(notedSurface(dir, "claude-code").surface).toBe("terminal");
    // A later Codex session in plan mode is the one read.
    noteSurface(dir, "i2", runningSurface("codex", { permissionMode: "plan" }));
    age(dir, "i2", "2026-10-19T12:00:00.000Z");
    expect(notedSurface(dir, "codex").surface).toBe("CLI, plan mode");
  });

  it("reads the first row where no note names the harness or a note names no row", () => {
    const dir = root();
    expect(notedSurface(dir, "codex")).toBe(runningSurface("codex"));
    const home = join(dir, ".greenline", "tmp", "sessions");
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "z.surface.json"), '{"harness":"codex","surface":"no such row"}\n');
    expect(notedSurface(dir, "codex")).toBe(runningSurface("codex"));
  });
});
