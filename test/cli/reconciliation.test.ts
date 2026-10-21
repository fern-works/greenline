import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseArgs } from "../../src/shell/cli/args.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { compileInstallation } from "../../src/shell/installation.ts";
import { parseChangeRecord } from "../../src/core/change.ts";
import { renderLedgerGuide } from "../../src/core/render.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

it("refuses a dry-run flag on status while preserving sync dry-run", () => {
  expect(parseArgs(["status", "--dry-run"], "test").kind).toBe("usage-error");
  const sync = parseArgs(["sync", "--dry-run"], "test");
  expect(sync.kind).toBe("run");
  if (sync.kind === "run") expect(sync.request.dryRun).toBe(true);
});

/** A skeleton's placeholders filled as an agent opening its change would fill them. */
function filled(skeleton: string): string {
  return skeleton
    .replace("<owner, accepted or standing>", "accepted")
    .replace('"<why the change exists>"', '"the retry loses the deadline"')
    .replace('next: "<step>: <the action that resumes it>"', 'next: "frame: read the retry loop"')
    .replace(/<the start skill[^>]*>/, "diagnose reproduced the lost deadline.")
    .replace(/<one "### Round <n>" sub-heading[^>]*>/g, "### Round 1\n\n[report](report-1.md)")
    .replace(/<[^<>\n]+>/g, "Written.");
}

it("S16b each skeleton the installed ledger guide prints, filled, is a record status reads without a finding", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-skeletons-"));
  mkdirSync(join(root, ".git"));
  const release = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
  if (release._tag === "err") throw release.error;
  const env = { cwd: root, version: "test", installation: release.value };
  try {
    expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
    const guide = readFileSync(join(root, ".greenline/ledger/README.md"), "utf8");
    const skeletons = [...guide.matchAll(/### ([a-z-]+)\n\n```markdown\n([\s\S]*?)\n```/g)];
    expect(skeletons.map((found) => found[1])).toEqual(
      release.value.modes.modes.map((mode) => mode.name),
    );
    for (const [, mode, skeleton] of skeletons)
      writeFileSync(join(root, `.greenline/ledger/2026-10-08-${mode}.md`), filled(skeleton ?? ""));
    const writer = new RecordingWriter();
    runCli(["status", "--json"], writer.writer, "test", env);
    const changes = JSON.parse(writer.out).changes;
    expect(
      changes.current.map((view: { id: string; reading: string; step: string }) => [
        view.id,
        view.reading,
        view.step,
      ]),
    ).toEqual(
      skeletons
        .map(([, mode]) => [`2026-10-08-${mode}`, "judged", "frame"])
        .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? "")),
    );
    expect(changes.findings).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("S16b the raise and the floors the installed ledger guide prints are fields a record parses with", () => {
  const release = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
  if (release._tag === "err") throw release.error;
  const { modes, ledgerGuide } = release.value;
  const guide = renderLedgerGuide(ledgerGuide, modes);
  const raise = /```text\n(raises:\n {2}- \{[^\n]*\})\n```/.exec(guide)?.[1];
  if (raise === undefined) throw new Error("the raise example is missing");
  const floorsLine = /The `floors` field names each floor[^\n]*/.exec(guide)?.[0] ?? "";
  const floors = [...floorsLine.matchAll(/`([a-z-]+)` for /g)].map((found) => found[1]);
  expect(floors).toEqual(modes.floors.map((floor) => floor.name));
  const text = [
    "---",
    "mode: careful",
    "choice: standing",
    'why: "the retry loses the deadline"',
    "state: open",
    `floors: [${floors.join(", ")}]`,
    raise,
    "---",
    "",
  ].join("\n");
  const parsed = parseChangeRecord(modes, "2026-10-08-retry.md", text);
  expect(parsed._tag === "ok" ? parsed.value.raises : parsed).toEqual([
    { from: "quick", reason: "the change touches the session store" },
  ]);
});

it("S16b the tickets file printed in the installed work guide is a plan status reads without a finding", () => {
  const root = mkdtempSync(join(tmpdir(), "gl-tickets-"));
  mkdirSync(join(root, ".git"));
  const env = { cwd: root, version: "test", installation: fixtureInstallation() };
  try {
    expect(runCli(["init", "--yes"], new RecordingWriter().writer, "test", env)).toBe(0);
    const guide = readFileSync("corpus/runtime/work.md", "utf8");
    const tickets = /```text\n(---\nstatus: draft\n---\n\n# Tickets[\s\S]*?)\n```/.exec(guide)?.[1];
    if (tickets === undefined) throw new Error("the tickets example is missing");
    mkdirSync(join(root, ".greenline/plans/003-login"), { recursive: true });
    writeFileSync(join(root, ".greenline/plans/003-login/tickets.md"), `${tickets}\n`);
    const writer = new RecordingWriter();
    runCli(["status", "--json"], writer.writer, "test", env);
    const changes = JSON.parse(writer.out).changes;
    expect(changes.findings).toBe(0);
    expect(changes.plans).toEqual([
      {
        name: "003-login",
        readable: true,
        tickets: "draft",
        progress: [
          { ticket: "T1", progress: "not started" },
          { ticket: "T2", progress: "not started" },
        ],
        frontier: [],
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
