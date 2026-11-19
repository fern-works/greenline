/**
 * The inspector's waiting list reads a wait on the owner under every form
 * the record's next line takes (J-222 S1, the run j217c-states-stop, whose
 * next line wrote the wait `wait on the owner's review ...`): the reader
 * `waitingOn` in `src/shell/inspect/waiting.ts` takes the progress tail's
 * `waiting on you`, which reads the forms `ownerWait` reads beside its own.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { waitingOn } from "../../../src/shell/inspect/waiting.ts";

const ID = "2026-11-10-find-by-year";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "greenline-waiting-forms-"));
  cleanup.push(dir);
  return dir;
}

const facts = (next: string) =>
  ({ id: ID, state: "open", next, step: "build", touchesInterface: false }) as const;

describe("J-222 S1 the inspector's waiting list reads every form of the wait on the owner", () => {
  for (const next of [
    "build: wait until the owner reviews the tests, then implement",
    "build: wait on the owner's review of the tests, then implement",
    "build: ask the owner to review the tests, then implement",
  ])
    it(`lists "${next}" as waiting on the owner at its step`, () => {
      const waiting = waitingOn(root(), facts(next));
      expect(waiting?.question).toBe(next.replace(/^build: /, ""));
      expect(waiting?.step).toBe("build");
      expect(waiting?.source.label).toBe("the record's next line");
    });

  it("lists no wait from a next line that names none", () => {
    expect(waitingOn(root(), facts("build: implement findByYear"))).toBeNull();
  });
});
