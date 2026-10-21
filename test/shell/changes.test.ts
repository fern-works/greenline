import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listChangeRecords, readChangesOnDisk } from "../../src/shell/changes.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

const definition = fixtureInstallation().modes;
const roots: string[] = [];

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "changes-"));
  roots.push(root);
  return root;
}

const open = [
  "---",
  "mode: quick",
  "choice: accepted",
  'why: "a typo"',
  "state: open",
  "---",
  "",
].join("\n");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the change records on disk", () => {
  it("S4 every Markdown file directly under the ledger is a change record, parsed and sorted by id", () => {
    const root = workspace();
    const ledger = join(root, ".greenline", "ledger");
    mkdirSync(join(ledger, "records"), { recursive: true });
    mkdirSync(join(ledger, "2026-10-04-folder.md"), { recursive: true });
    mkdirSync(join(ledger, "2026-10-04-b", "checks"), { recursive: true });
    writeFileSync(join(ledger, "2026-10-04-b.md"), open);
    writeFileSync(join(ledger, "2026-10-03-a.md"), open);
    writeFileSync(join(ledger, "README.md"), "# The ledger\n");
    writeFileSync(join(ledger, "records", "old.md"), "an earlier format\n");
    writeFileSync(join(ledger, "notes.txt"), "not a record\n");
    const listed = listChangeRecords(root, definition);
    if (listed._tag === "err") throw listed.error;
    expect(listed.value.map((entry) => [entry.id, entry.record._tag])).toEqual([
      ["2026-10-03-a", "ok"],
      ["2026-10-04-b", "ok"],
    ]);
  });

  it("S4 a record that does not parse is reported beside the others, never hiding them", () => {
    const root = workspace();
    const ledger = join(root, ".greenline", "ledger");
    mkdirSync(ledger, { recursive: true });
    writeFileSync(join(ledger, "2026-10-04-good.md"), open);
    writeFileSync(join(ledger, "2026-10-04-bad.md"), "no front matter\n");
    const listed = listChangeRecords(root, definition);
    if (listed._tag === "err") throw listed.error;
    expect(listed.value.map((entry) => [entry.id, entry.record._tag])).toEqual([
      ["2026-10-04-bad", "err"],
      ["2026-10-04-good", "ok"],
    ]);
  });

  it("S4 a workspace with no ledger folder has no change records", () => {
    expect(listChangeRecords(workspace(), definition)).toEqual({ _tag: "ok", value: [] });
  });

  it("S4 a ledger that cannot be read as a folder is a refusal, not an empty list", () => {
    const root = workspace();
    mkdirSync(join(root, ".greenline"), { recursive: true });
    writeFileSync(join(root, ".greenline", "ledger"), "a file where the folder belongs\n");
    expect(listChangeRecords(root, definition)._tag).toBe("err");
  });
});

describe("the changes on disk", () => {
  const facts = JSON.stringify({
    schemaVersion: 1,
    state: "started",
    arguments: ["make"],
    startedAt: "2026-10-04T12:00:00.000Z",
    commit: null,
    tree: null,
    installation: "c".repeat(64),
  });

  function write(root: string, files: Readonly<Record<string, string>>): void {
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content);
    }
  }

  function value<T>(
    result: { readonly _tag: "ok"; readonly value: T } | { readonly _tag: "err" } | undefined,
  ): T | undefined {
    return result?._tag === "ok" ? result.value : undefined;
  }

  function read(root: string) {
    const gathered = readChangesOnDisk(root, definition);
    if (gathered._tag === "err") throw gathered.error;
    return gathered.value;
  }

  it("S5 each change comes with its folder: the reports in it and its check facts, parsed", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-04-a.md": open,
      ".greenline/ledger/2026-10-04-a/review.md": "# Review\n",
      ".greenline/ledger/2026-10-04-a/notes/round-1.md": "round\n",
      ".greenline/ledger/2026-10-04-a/checks/20261004T120000000Z-a1b2c3.json": facts,
      ".greenline/ledger/2026-10-04-a/checks/20261004T120001000Z-d4e5f6.json": "{ half",
      ".greenline/ledger/2026-10-04-a/checks/stray.txt": "not facts\n",
      ".greenline/ledger/2026-10-04-b.md": open,
    });
    const [a, b] = read(root).changes;
    expect(a?.id).toBe("2026-10-04-a");
    // A file under checks/ that is not facts stays visible as a report, so nothing in the folder is hidden.
    expect(value(a?.folder)?.reports).toEqual([
      "checks/stray.txt",
      "notes/round-1.md",
      "review.md",
    ]);
    expect(value(a?.folder)?.checks.map((check) => [check.file, check.parsed._tag])).toEqual([
      ["checks/20261004T120000000Z-a1b2c3.json", "ok"],
      ["checks/20261004T120001000Z-d4e5f6.json", "err"],
    ]);
    expect(b).toMatchObject({ id: "2026-10-04-b", folder: undefined });
    expect(b?.record._tag).toBe("ok");
  });

  it("S5 an unparsable record is kept as a failure beside the others and its folder is still read", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-04-bad.md": "no front matter\n",
      ".greenline/ledger/2026-10-04-bad/review.md": "# Review\n",
      ".greenline/ledger/2026-10-04-good.md": open,
    });
    expect(
      read(root).changes.map((change) => [
        change.id,
        change.record._tag,
        value(change.folder)?.reports,
      ]),
    ).toEqual([
      ["2026-10-04-bad", "err", ["review.md"]],
      ["2026-10-04-good", "ok", undefined],
    ]);
  });

  it("S5 each plan directory comes with its tickets file and its plan documents, a bad one kept as a failure", () => {
    const root = workspace();
    write(root, {
      ".greenline/plans/003-login/tickets.md": [
        "---",
        "status: draft",
        "---",
        "",
        "## T1",
        "",
        'intent: "the form"',
        "scope: [src/form.ts]",
        "acceptance:",
        '  - "it submits"',
        "mode: regular",
        "",
      ].join("\n"),
      ".greenline/plans/003-login/spec.md": "---\nstatus: complete\n---\n\n# Spec\n",
      ".greenline/plans/003-login/map.md": "---\nstatus: final\n---\n",
      ".greenline/plans/003-login/research/notes.md": "not a plan document\n",
      ".greenline/plans/004-empty/README.txt": "no documents\n",
    });
    const [login, empty] = read(root).plans;
    expect(login?.name).toBe("003-login");
    const tickets = value(login?.contents)?.tickets?.parsed;
    expect(tickets?._tag === "ok" ? tickets.value : tickets).toMatchObject({
      status: "draft",
      tickets: [{ id: "T1", mode: "regular" }],
    });
    expect(
      value(login?.contents)?.documents.map((document) => [document.file, document.parsed._tag]),
    ).toEqual([
      ["map.md", "err"],
      ["spec.md", "ok"],
    ]);
    expect(empty).toEqual({
      name: "004-empty",
      contents: { _tag: "ok", value: { tickets: undefined, documents: [] } },
    });
  });

  it("S5 a change folder or plan directory that cannot be listed is a failure on its own entry, the others still read", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-04-a.md": open,
      ".greenline/ledger/2026-10-04-b.md": open,
      ".greenline/ledger/2026-10-04-b/review.md": "# Review\n",
      ".greenline/plans/003-good/spec.md": "---\nstatus: draft\n---\n",
    });
    // A dangling symlink in one folder, and a plan directory that cannot be read.
    mkdirSync(join(root, ".greenline", "ledger", "2026-10-04-a"));
    symlinkSync(
      join(root, "gone"),
      join(root, ".greenline", "ledger", "2026-10-04-a", "report.md"),
    );
    const locked = join(root, ".greenline", "plans", "004-locked");
    mkdirSync(locked);
    chmodSync(locked, 0o000);
    try {
      const gathered = read(root);
      expect(gathered.changes.map((change) => [change.id, change.folder?._tag])).toEqual([
        ["2026-10-04-a", "err"],
        ["2026-10-04-b", "ok"],
      ]);
      expect(gathered.plans.map((plan) => [plan.name, plan.contents._tag])).toEqual([
        ["003-good", "ok"],
        ["004-locked", "err"],
      ]);
    } finally {
      chmodSync(locked, 0o700);
    }
  });

  it("S5 the ledger's earlier formats are left alone, and a workspace with neither folder has nothing", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/README.md": "# The ledger\n",
      ".greenline/ledger/records/2026-10-04-x.json": "{}",
      ".greenline/ledger/receipts/r.json": "{}",
    });
    expect(read(root)).toEqual({ changes: [], plans: [], working: [] });
    expect(read(workspace())).toEqual({ changes: [], plans: [], working: [] });
  });

  it("J-73 S4 the working folders are the directories under tmp named by a change id, links and other names left out", () => {
    const root = workspace();
    write(root, {
      ".greenline/tmp/2026-10-14-b/brief-review-1.md": "brief\n",
      ".greenline/tmp/2026-10-14-a/probe.txt": "probe\n",
      ".greenline/tmp/.gitignore": "*\n",
      ".greenline/tmp/.write.lock": "1\n",
      ".greenline/tmp/notes/x.md": "x\n",
      ".greenline/tmp/2026-02-30-unreal/x.md": "x\n",
      ".greenline/tmp/2026-10-14-file": "a file, not a folder\n",
    });
    symlinkSync(
      join(root, ".greenline", "tmp", "notes"),
      join(root, ".greenline", "tmp", "2026-10-14-link"),
    );
    expect(read(root).working).toEqual(["2026-10-14-a", "2026-10-14-b"]);
  });
});
