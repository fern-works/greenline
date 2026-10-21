import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../../fixtures/corpus.ts";
import { RecordingWriter } from "../../helpers/writer.ts";

/**
 * A workspace for the plans and knowledge views: a plan split into four
 * tickets (one done, one ready, one waiting on it, one in progress under a
 * mode the owner named), a plan whose ticket list still waits for the
 * owner, a plan whose tickets file does not parse, the decisions book with
 * its roots fence, an ADR home and a glossary, committed in a real git
 * repository.
 */

export const VERSION = "0.1.0";
export const PLAN = "004-search";
export const DRAFT_PLAN = "005-later";
export const BROKEN_PLAN = "006-broken";
export const PLANNING = "2026-10-10-search";
export const DONE_TICKET = "2026-10-11-index";
export const OVERRIDDEN_TICKET = "2026-10-12-ranking";

const front = (fields: readonly string[]): readonly string[] => ["---", ...fields, "---", ""];
const section = (heading: string, text: string): readonly string[] => [
  `## ${heading}`,
  "",
  ...(text === "" ? [] : [text, ""]),
];

const records = {
  [PLANNING]: [
    ...front([
      "mode: careful",
      "choice: accepted",
      'why: "search the catalogue by title and author"',
      "state: open",
      'next: "verify: check the whole result against the spec"',
      `plan: ${PLAN}`,
    ]),
    ...section("frame", "The catalogue has no search."),
    ...section("plan", "Four tickets, in `tickets.md`."),
    ...section("anticipate", "The index must not lose a title."),
    ...section("verify", ""),
    ...section("close", ""),
  ].join("\n"),
  [DONE_TICKET]: [
    ...front([
      "mode: regular",
      "choice: accepted",
      'why: "build the search index"',
      "state: done",
      "next: none",
      `plan: ${PLAN}`,
      "ticket: T1",
    ]),
    ...section("build", "Built the index."),
    ...section("review", "One reviewer, clean."),
    ...section("verify", "The index holds every title."),
    ...section("close", "Done."),
  ].join("\n"),
  [OVERRIDDEN_TICKET]: [
    ...front([
      "mode: quick",
      "choice: owner",
      "proposed: regular",
      'why: "rank the results by recency"',
      "state: stopped",
      'next: "build: weigh the publication year"',
      `plan: ${PLAN}`,
      "ticket: T4",
    ]),
    ...section("build", ""),
    ...section("review", "none at quick"),
    ...section("verify", ""),
    ...section("close", ""),
  ].join("\n"),
} satisfies Readonly<Record<string, string>>;

const tickets = [
  ...front(["status: complete"]),
  "# Tickets",
  "",
  "## T1",
  "",
  'intent: "Build the search index."',
  "scope:",
  "  - src/search/index.ts",
  "acceptance:",
  '  - "Every title is indexed."',
  "mode: regular",
  "",
  "## T2",
  "",
  'intent: "Query the index from the catalogue page."',
  "scope:",
  "  - src/catalogue/page.ts",
  "acceptance:",
  '  - "A query returns the matching titles."',
  '  - "An empty query returns nothing."',
  "after: [T1]",
  "mode: quick",
  "",
  "## T3",
  "",
  'intent: "Highlight the matched words."',
  "scope:",
  "  - src/catalogue/highlight.ts",
  "acceptance:",
  '  - "Each matched word is marked."',
  "after: [T2]",
  "mode: quick",
  "",
  "## T4",
  "",
  'intent: "Rank the results by recency."',
  "scope:",
  "  - src/search/rank.ts",
  "acceptance:",
  '  - "The newest title comes first."',
  "mode: regular",
  "",
].join("\n");

const decisions = [
  "# Decisions",
  "",
  "## API",
  "",
  "The owner settled TypeScript for the API; [the record](../docs/adr/0001-typescript.md) holds the reasons.",
  "",
  "```greenline-roots",
  JSON.stringify(
    [
      {
        root: "apps/api",
        purpose: "service or API",
        languages: ["typescript"],
        technologies: ["fastify"],
        decision: "#api",
        exclusions: [{ kind: "unit", id: "orm-active-record" }],
      },
    ],
    null,
    2,
  ),
  "```",
  "",
  "## Storage",
  "",
  "Sessions are stored in Postgres.",
  "",
].join("\n");

/** The workspace built, with what the tests read back. */
export interface HomesWorkspace {
  readonly root: string;
  readonly env: {
    readonly cwd: string;
    readonly version: string;
    readonly installation: ReturnType<typeof fixtureInstallation>;
  };
}

/**
 * Build the workspace in a new temporary directory, which the caller removes.
 * @param homes whether to write the decisions book, the ADR home and the glossary
 * @returns the workspace
 */
export function homesWorkspace(homes = true): HomesWorkspace {
  const root = mkdtempSync(join(tmpdir(), "greenline-homes-view-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=QA",
        "-c",
        "user.email=qa@invalid.local",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, ".git"));
  const writer = new RecordingWriter();
  // The product's own work guide, so the knowledge view renders the guide a workspace receives.
  const workGuide = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "corpus", "runtime", "work.md"),
    "utf8",
  );
  const env = { cwd: root, version: VERSION, installation: fixtureInstallation({ workGuide }) };
  if (runCli(["init", "--yes"], writer.writer, VERSION, env) !== 0) throw new Error(writer.err);
  rmSync(join(root, ".git"), { recursive: true });
  git("init", "--quiet");
  for (const [id, text] of Object.entries(records)) write(`.greenline/ledger/${id}.md`, text);
  write(`.greenline/plans/${PLAN}/tickets.md`, tickets);
  write(
    `.greenline/plans/${PLAN}/spec.md`,
    [
      ...front(["status: complete"]),
      "# Search",
      "",
      `Search by title and author. The index is [its ticket's record](../../ledger/${DONE_TICKET}.md); the list is [the tickets](tickets.md).`,
      "",
      "## Out of scope",
      "",
      "Full-text search of the books.",
      "",
    ].join("\n"),
  );
  write(
    `.greenline/plans/${PLAN}/decisions.md`,
    [...front(["status: draft"]), "# Decisions", "", "The index lives in memory.", ""].join("\n"),
  );
  write(
    `.greenline/plans/${DRAFT_PLAN}/tickets.md`,
    [
      ...front(["status: draft"]),
      "## T1",
      "",
      'intent: "Export the catalogue."',
      "scope:",
      "  - src/export.ts",
      "acceptance:",
      '  - "The export lists every title."',
      "mode: quick",
      "",
    ].join("\n"),
  );
  write(
    `.greenline/plans/${BROKEN_PLAN}/tickets.md`,
    [
      ...front(["status: complete"]),
      "## T1",
      "",
      'intent: "Half a ticket."',
      "mode: lightning",
      "",
    ].join("\n"),
  );
  if (homes) {
    write(".greenline/DECISIONS.md", decisions);
    write(
      "docs/adr/0001-typescript.md",
      [
        "# 1. Use TypeScript for the API",
        "",
        "Date: 2026-09-01",
        "",
        "## Status",
        "",
        "Accepted",
        "",
        "## Context",
        "",
        "The team writes TypeScript.",
        "",
      ].join("\n"),
    );
    write(
      "docs/adr/0002-postgres.md",
      [
        ...front(["status: proposed", "date: 2026-09-20"]),
        "# 2. Store sessions in Postgres",
        "",
        "Sessions outgrow memory. <script>alert(1)</script>",
        "",
      ].join("\n"),
    );
    write(
      "GLOSSARY.md",
      [
        "# Glossary",
        "",
        "## Catalogue",
        "",
        "Every title the library holds.",
        "",
        "## Ticket",
        "",
        "One entry of a plan's `tickets.md`; see [the decisions](.greenline/DECISIONS.md#storage).",
        "",
      ].join("\n"),
    );
  }
  git("add", "--all");
  git("commit", "--quiet", "-m", "the plans and the homes");
  return { root, env };
}
