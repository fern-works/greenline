import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOOKS_ON,
  MANIFEST_SCHEMA_VERSION,
  NO_PROCEED,
  type Manifest,
} from "../../src/core/manifest.ts";
import { noteSeen, proposalLines } from "../../src/shell/habits-owed.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

/**
 * The invariants start's floor in a workspace (J-195 S1): the list the
 * start writes, `.greenline/ledger/<id>/invariants.md`, read by the
 * situation line from the session that wrote it before a change opens,
 * each entry on a public contract or a security boundary a floor seen.
 */

const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
if (compiled._tag !== "ok") throw new Error("the corpus does not compile");
const installation = compiled.value;

const MANIFEST: Manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  targets: ["codex", "claude-code"],
  skills: { exclude: [], include: [] },
  connectors: {},
  proceed: NO_PROCEED,
  trials: [],
  checks: [],
  hooks: HOOKS_ON,
};

const ID = "2026-11-07-overdue-fees";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(boundary: string): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-invariants-"));
  roots.push(root);
  mkdirSync(join(root, ".greenline", "ledger", ID), { recursive: true });
  writeFileSync(
    join(root, ".greenline", "ledger", ID, "invariants.md"),
    [
      "| Invariant | Relied on at | Door | Boundary |",
      "| --- | --- | --- | --- |",
      `| An overdue fee is charged once per day | \`src/fees.ts\` | a unique key | ${boundary} |`,
      "",
    ].join("\n"),
  );
  return root;
}

describe("J-195 S1 the invariants list raises a floor on the situation line", () => {
  it("names the entry on a public contract as a floor seen, from the list the session wrote", () => {
    const root = workspace("public contract");
    noteSeen(root, "session-1", [`.greenline/ledger/${ID}/invariants.md`]);
    const { situation } = proposalLines({
      root,
      installation,
      manifest: MANIFEST,
      change: undefined,
      session: "session-1",
    });
    expect(situation).toContain(
      "floors seen: public-contract (an invariant: An overdue fee is charged once per day);",
    );
  });

  it("raises none for an entry on no such boundary, nor for a list the session never saw", () => {
    const plain = workspace("none");
    noteSeen(plain, "session-1", [`.greenline/ledger/${ID}/invariants.md`]);
    expect(
      proposalLines({
        root: plain,
        installation,
        manifest: MANIFEST,
        change: undefined,
        session: "session-1",
      }).situation,
    ).toContain("floors seen: none;");
    const unseen = workspace("security");
    expect(
      proposalLines({
        root: unseen,
        installation,
        manifest: MANIFEST,
        change: undefined,
        session: "session-2",
      }).situation,
    ).toContain("floors seen: none;");
  });
});

describe("J-226 S1 the situation line names a floor seen that the acting change's floors line leaves out (j217t-ground finding 3)", () => {
  const open = (floors: string): string =>
    [
      "---",
      "mode: regular",
      "choice: owner",
      "proposed: careful",
      'why: "Find shelf books by publication year."',
      floors,
      "state: open",
      'next: "build: write the test"',
      "---",
      "",
    ].join("\n");

  function opened(floors: string): string {
    const root = workspace("public contract");
    writeFileSync(join(root, ".greenline", "ledger", `${ID}.md`), open(floors));
    return root;
  }

  it("names the invariant's floor with its cure while the record's line is empty, and as before once it holds it", () => {
    const lines = (root: string): string => {
      noteSeen(root, "session-1", [`.greenline/ledger/${ID}/invariants.md`]);
      return proposalLines({
        root,
        installation,
        manifest: MANIFEST,
        change: ID,
        session: "session-1",
      }).situation;
    };
    expect(lines(opened("floors: []"))).toContain(
      "floors seen: public-contract (an invariant: An overdue fee is charged once per day); the record's floors line lacks public-contract: add it there where you judge it a floor;",
    );
    expect(lines(opened("floors: [public-contract]"))).not.toContain(
      "the record's floors line lacks",
    );
  });
});
