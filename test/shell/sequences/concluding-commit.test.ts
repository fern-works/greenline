/**
 * The concluding commit from each state, walked as the pages give it:
 * corpus/runtime/ledger.md, "Commits" ("the commit that finishes or stops a
 * change is that change's, trailer included, whatever state HEAD holds its
 * record in ... and so is a commit of the record and its folder alone in
 * every state, `done` included"; "A record HEAD holds `done` changes only in
 * a commit of the record and its folder alone ... and never with code beside
 * it") and "Open and stopped".
 *
 * From each state HEAD holds, open, stopped and done, the commit of the
 * record and its folder alone that sets the next state is the change's, with
 * its trailer; on main with no remote and on the change's branch with a
 * path remote. A done record committed with code beside it is refused on
 * the change's own branch as on main and on a ground branch (J-144 S4). A
 * done change's check fact committed under its folder alone is the
 * change's on main with a remote and no change open, on main with none, on
 * a ground branch and on its own branch; two changes' folders are refused
 * (J-145 S2). The interface home's path index goes with a done record's
 * commit and is refused beside code (J-228 S1).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  BRANCH,
  cleanUp,
  commitCode,
  commitRecord,
  GROUND,
  ID,
  type Origin,
  RECORD,
  recordText,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  trailerOf,
  workspace,
  writeCheck,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

/** The record in a state, with what that state carries: a next line when stopped, a close when finished. */
const inState = (state: string, extra: readonly string[] = []): string =>
  state === "stopped"
    ? recordText([
        "choice: accepted",
        "state: stopped",
        'next: "build: the index"',
        'stopped: "Stop there for today."',
        ...extra,
      ])
    : state === "done" || state === "dropped"
      ? recordText(["choice: accepted", `state: ${state}`, "next: none", ...extra], "concluded")
      : recordText(["choice: accepted", `state: ${state}`, ...extra]);

/** A change opened and built on the ground given, HEAD holding its record in the state given. */
function heldIn(origin: Origin, state: string, branch = origin === "none" ? "main" : BRANCH) {
  const space = workspace(origin);
  if (branch !== "main") space.git("checkout", "--quiet", "-b", branch);
  expect(commitRecord(space, inState("open"), "open").code).toBe(0);
  expect(commitCode(space, "src/shelf.ts", "build").code).toBe(0);
  writeCheck(space, 0, "10");
  if (state !== "open") {
    const set = commitRecord(space, inState(state), `set ${state}`);
    expect(set.code, set.err).toBe(0);
  }
  return space;
}

/** Each state HEAD holds, and the state its concluding commit sets. */
const MOVES: ReadonlyArray<readonly [string, string]> = [
  ["open", "stopped"],
  ["open", "done"],
  ["open", "dropped"],
  ["stopped", "open"],
  ["stopped", "done"],
  ["stopped", "dropped"],
  ["done", "done"],
];

describe.skipIf(SEQUENCES_OFF)("the concluding commit from each state", () => {
  const steps: Array<[Origin, string, string]> = [];
  for (const origin of ["none", "path"] as const)
    for (const [from, to] of MOVES) steps.push([origin, from, to]);

  it.each(steps)(
    "with %s remote, from %s to %s: the record and its folder alone, the change's trailer",
    (origin, from, to) => {
      const space = heldIn(origin, from);
      const extra = from === "done" ? ['landing: "merge it, the owner"'] : [];
      const concluded = commitRecord(space, inState(to, extra), `${from} to ${to}`);
      expect(concluded.code, concluded.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );

  // J-144 S4: the refusal holds on the change's own greenline/<id> branch too,
  // as on main with no remote and on a ground branch the proposal named.
  it.each<[Origin, string]>([
    ["none", "main"],
    ["path", GROUND],
    ["path", BRANCH],
  ])(
    "with %s remote on %s: a done record with code beside it is refused, the same record alone taken",
    (origin, branch) => {
      const space = heldIn(origin, "done", branch);
      space.write(RECORD, inState("done", ['landing: "merge it, the owner"']));
      space.write("src/more.ts", "more\n");
      space.git("add", "--", RECORD, "src/more.ts");
      const mixed = space.git("commit", "--quiet", "-m", "the words with code beside them");
      expect(mixed.code).not.toBe(0);
      expect(mixed.err).toContain(
        `change ${ID} is done, so src/more.ts cannot be committed beside its record`,
      );
      expect(mixed.err).toContain("; finished-record-alone, greenline's pre-commit hook");
      space.git("reset", "--quiet", "--", "src/more.ts");
      const alone = space.git("commit", "--quiet", "-m", "the words alone");
      expect(alone.code, alone.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );

  /** The done change landed on main of a repository with a path remote: its ground branch fast-forwarded, no change open there. */
  function landedOnMain() {
    const space = heldIn("path", "done", GROUND);
    expect(space.git("checkout", "--quiet", "main").code).toBe(0);
    expect(space.git("merge", "--quiet", "--ff-only", GROUND).code).toBe(0);
    return space;
  }

  // J-145 S2: a done change's check rerun after the close commits its fact under the change's folder alone.
  it.each<[string, () => ReturnType<typeof heldIn>]>([
    ["main with a remote, no change open", landedOnMain],
    ["main with no remote, no change open", () => heldIn("none", "done")],
    ["a ground branch", () => heldIn("path", "done", GROUND)],
    ["the change's own branch", () => heldIn("path", "done", BRANCH)],
  ])(
    "on %s: a done change's check fact committed under its folder alone, the change's trailer",
    (_where, made) => {
      const space = made();
      writeCheck(space, 0, "11");
      space.git("add", "--", `.greenline/ledger/${ID}/`);
      const fact = space.git("commit", "--quiet", "-m", "record the rerun check");
      expect(fact.code, fact.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );

  // J-228 S1, the run j217c-roster-use F13: the interface check's path index goes with the change's record.
  it.each<[string, () => ReturnType<typeof heldIn>]>([
    ["main with no remote", () => heldIn("none", "done")],
    ["the change's own branch", () => heldIn("path", "done", BRANCH)],
  ])(
    "on %s: the done record committed with the interface home's path index is the change's, and the index beside code is refused",
    (_where, made) => {
      const space = made();
      const index = ".greenline/ledger/interface/paths.json";
      space.write(index, '{ "generatedBy": "greenline check" }\n');
      space.write("src/more.ts", "more\n");
      space.git("add", "--", index, "src/more.ts");
      const beside = space.git("commit", "--quiet", "-m", "the index beside code");
      expect(beside.code).not.toBe(0);
      space.git("reset", "--quiet", "--", "src/more.ts");
      space.write(RECORD, inState("done", ['landing: "declined: leave the branch"']));
      space.git("add", "--", RECORD, index);
      const carried = space.git("commit", "--quiet", "-m", "the landing words and the index");
      expect(carried.code, carried.err).toBe(0);
      expect(trailerOf(space)).toBe(ID);
    },
    SEQUENCE_TIMEOUT,
  );

  it(
    "on main with a remote: two changes' folders staged together are refused as no change's",
    () => {
      const space = landedOnMain();
      writeCheck(space, 0, "11");
      space.write(".greenline/ledger/2026-10-27-other/checks/fact.json", "{}\n");
      space.git("add", "--", `.greenline/ledger/${ID}/`, ".greenline/ledger/2026-10-27-other/");
      const both = space.git("commit", "--quiet", "-m", "two changes' facts");
      expect(both.code).not.toBe(0);
      expect(both.err).toContain("no change is open on main");
    },
    SEQUENCE_TIMEOUT,
  );
});
