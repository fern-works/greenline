import { describe, expect, it } from "vitest";
import {
  factsFileName,
  finishedFacts,
  isFactsFileName,
  markedProbe,
  parseChecksFile,
  parseFacts,
  serializeFacts,
  serializeHookRun,
  startedFacts,
  type HookRun,
} from "../../src/core/facts.ts";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const installation = "c".repeat(64);
const started = startedFacts({
  arguments: ["pnpm", "exec", "vitest", "run"],
  step: "verify",
  startedAt: "2026-10-04T12:00:00.123Z",
  commit,
  tree,
  installation,
});

function refused(path: string, message: string) {
  return { _tag: "err", error: expect.objectContaining({ issues: [{ path, message }] }) };
}

describe("check facts", () => {
  it("S4 a run's facts are written started, then finished with its outcome and duration, and read back exactly", () => {
    expect(started).toEqual({
      schemaVersion: 1,
      state: "started",
      arguments: ["pnpm", "exec", "vitest", "run"],
      step: "verify",
      startedAt: "2026-10-04T12:00:00.123Z",
      commit,
      tree,
      installation,
    });
    const finished = finishedFacts(started, { kind: "exited", code: 3 }, 1250);
    expect(finished).toEqual({
      schemaVersion: 1,
      state: "finished",
      arguments: ["pnpm", "exec", "vitest", "run"],
      step: "verify",
      startedAt: "2026-10-04T12:00:00.123Z",
      commit,
      tree,
      installation,
      outcome: { kind: "exited", code: 3 },
      durationMs: 1250,
    });
    expect(parseFacts(serializeFacts(started), "f.json")).toEqual({ _tag: "ok", value: started });
    expect(parseFacts(serializeFacts(finished), "f.json")).toEqual({ _tag: "ok", value: finished });
  });

  it("S4 a run in a repository with no commit, or where git cannot say, stores null for the commit and the tree", () => {
    const unknown = startedFacts({
      arguments: ["make"],
      startedAt: "2026-10-04T12:00:00.000Z",
      commit: null,
      tree: null,
      installation,
    });
    expect(parseFacts(serializeFacts(unknown), "f.json")).toEqual({ _tag: "ok", value: unknown });
  });

  it("S4 a facts file is named by its start time and a short random part", () => {
    expect(factsFileName("2026-10-04T12:00:00.123Z", "a1b2c3")).toBe(
      "20261004T120000123Z-a1b2c3.json",
    );
  });
});

describe("check facts name each other, and a probe is marked", () => {
  it("J-84 S2 a run names the newest facts file already in the folder, and the first names none", () => {
    const second = startedFacts({
      arguments: ["make"],
      startedAt: "2026-10-04T12:01:00.000Z",
      commit,
      tree,
      installation,
      previous: "20261004T120000123Z-a1b2c3.json",
    });
    expect(second.previous).toBe("20261004T120000123Z-a1b2c3.json");
    expect("previous" in started).toBe(false);
    const finished = finishedFacts(second, { kind: "exited", code: 0 }, 5);
    expect(finished.previous).toBe("20261004T120000123Z-a1b2c3.json");
    expect(parseFacts(serializeFacts(finished), "f.json")).toEqual({ _tag: "ok", value: finished });
  });

  it("J-84 S2 a probe recorded by mistake is marked, every other fact kept as it was", () => {
    const finished = finishedFacts(started, { kind: "exited", code: 1 }, 5);
    const marked = markedProbe(finished);
    expect(marked).toEqual({ ...finished, probe: true });
    expect(parseFacts(serializeFacts(marked), "f.json")).toEqual({ _tag: "ok", value: marked });
    expect(markedProbe(started)).toEqual({ ...started, probe: true });
  });

  it("J-84 S2 a facts file's name is told from any other", () => {
    expect(isFactsFileName("20261004T120000123Z-a1b2c3.json")).toBe(true);
    expect(isFactsFileName("../20261004T120000123Z-a1b2c3.json")).toBe(false);
    expect(isFactsFileName("checks/20261004T120000123Z-a1b2c3.json")).toBe(false);
    expect(isFactsFileName("notes.json")).toBe(false);
  });

  it("J-84 S2 refuses a previous that is no facts file's name, and a probe mark other than true", () => {
    expect(parseFacts(JSON.stringify({ ...started, previous: "../x.json" }), "f.json")).toEqual(
      refused("previous", "Invalid string: must match pattern /^\\d{8}T\\d{9}Z-[0-9a-f]+\\.json$/"),
    );
    expect(parseFacts(JSON.stringify({ ...started, probe: false }), "f.json")).toEqual(
      refused("probe", "Invalid input: expected true"),
    );
  });
});

describe("check facts refuse", () => {
  it("S4 refuses a field the facts do not define, such as the command's output", () => {
    expect(parseFacts(JSON.stringify({ ...started, output: "PASS" }), "f.json")).toEqual(
      refused("", 'Unrecognized key: "output"'),
    );
    const finished = finishedFacts(started, { kind: "exited", code: 0 }, 5);
    expect(
      parseFacts(JSON.stringify({ ...finished, stdout: "PASS", stderr: "" }), "f.json"),
    ).toEqual(refused("", 'Unrecognized keys: "stdout", "stderr"'));
  });

  it("S4 refuses a started file that states an outcome, and a finished one that states none", () => {
    expect(
      parseFacts(JSON.stringify({ ...started, outcome: { kind: "exited", code: 0 } }), "f.json"),
    ).toEqual(refused("", 'Unrecognized key: "outcome"'));
    expect(
      parseFacts(JSON.stringify({ ...started, state: "finished", durationMs: 1 }), "f.json"),
    ).toEqual(refused("outcome", "Invalid input: expected object, received undefined"));
  });

  it("S4 refuses a commit, tree or installation that is not an id, and an empty argument list", () => {
    expect(parseFacts(JSON.stringify({ ...started, commit: "HEAD" }), "f.json")).toEqual(
      refused("commit", "Invalid string: must match pattern /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/"),
    );
    expect(parseFacts(JSON.stringify({ ...started, tree: "main" }), "f.json")).toEqual(
      refused("tree", "Invalid string: must match pattern /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/"),
    );
    expect(parseFacts(JSON.stringify({ ...started, installation: "1" }), "f.json")).toEqual(
      refused("installation", "Invalid string: must match pattern /^[0-9a-f]{64}$/"),
    );
    expect(parseFacts(JSON.stringify({ ...started, arguments: [] }), "f.json")).toEqual(
      refused("arguments", "Too small: expected array to have >=1 items"),
    );
  });

  it("S4 refuses text that is not JSON", () => {
    expect(parseFacts("{", "f.json")).toEqual(refused("", "check facts are not valid JSON"));
  });
});

describe("J-98 S1 a run of a declared check names the check and the directory it ran in", () => {
  const declared = startedFacts({
    arguments: ["npm", "test"],
    startedAt: "2026-10-04T12:00:00.123Z",
    commit,
    tree,
    installation,
    check: "web",
    dir: "apps/web",
  });

  it("writes the check's name and its directory, and reads them back through the finish", () => {
    expect(declared).toMatchObject({ check: "web", dir: "apps/web" });
    const finished = finishedFacts(declared, { kind: "exited", code: 0 }, 5);
    expect(parseFacts(serializeFacts(finished), "f.json")).toEqual({ _tag: "ok", value: finished });
  });

  it("refuses a name that is no check's name and a directory outside the repository", () => {
    expect(parseFacts(JSON.stringify({ ...declared, check: "Web Test" }), "f.json")._tag).toBe(
      "err",
    );
    expect(parseFacts(JSON.stringify({ ...declared, dir: "../elsewhere" }), "f.json")._tag).toBe(
      "err",
    );
  });
});

describe("J-93 S3 a hook-recorded run beside the check facts", () => {
  const run: HookRun = {
    schemaVersion: 1,
    source: "hook",
    harness: "claude-code",
    check: "unit",
    arguments: ["pnpm run test -- --coverage"],
    dir: ".",
    startedAt: "2026-10-19T12:00:00.000Z",
    commit,
    tree,
    treeAt: "run-start",
    installation,
    state: "finished",
    outcome: { kind: "unknown", code: null },
    durationMs: null,
  };

  it("reads a file whose source is hook as a hook-recorded run, the text whole, and any other as check facts", () => {
    const hooked = parseChecksFile(serializeHookRun(run), "checks/x.json");
    expect(hooked.kind).toBe("hook");
    expect(hooked.parsed._tag === "ok" ? hooked.parsed.value : undefined).toEqual(run);
    const checked = parseChecksFile(serializeFacts(started), "checks/y.json");
    expect(checked.kind).toBe("check");
    expect(checked.parsed._tag).toBe("ok");
  });

  it("refuses a hook-recorded run with a field it does not define, its text split, or an outcome of check's", () => {
    for (const bad of [
      { ...run, extra: 1 },
      { ...run, arguments: ["pnpm", "run", "test"] },
      { ...run, outcome: { kind: "exited", code: 0 } },
      { ...run, treeAt: "later" },
    ]) {
      const read = parseChecksFile(JSON.stringify(bad), "checks/z.json");
      expect(read.kind).toBe("hook");
      expect(read.parsed._tag).toBe("err");
    }
  });
});
