import { err, ok, type Result } from "../commons/result.ts";
import type { ModesDefinition } from "../core/modes.ts";
import {
  latestChanges,
  retiredSkills,
  skillOf,
  type Chain,
  type ChangeEntry,
  type Entry,
  type Pages,
  type Placement,
  type SourceEntry,
} from "./chain.ts";
import { lineOf, renderLine, type LineSkill } from "./line.ts";
import { RETENTION_MINIMUM, type SourceMeasure } from "./measure.ts";
import { cell, listed, sentence, table } from "./tables.ts";

/**
 * The views (`workshop/components/ledger.md`, "The fresh chain"): the index
 * of entries, the sources register, the notices and the line view,
 * rendered from the fresh chain, the recipes, the manifest and the modes
 * definition as pure functions. A skill's sources
 * are read from its latest change entry: a source the skill takes text of
 * exactly is tracked, any other is a credit line (C14), and a stub's
 * sources, which its recipe lists, are credit lines. A source entry's
 * verdict is rendered as its word, and a placed method with what it catches
 * and the modes it runs at. A retired skill's latest change no longer
 * counts, so the notices name only the skills that ship; the register lists
 * the retired skills apart, each with the skill that takes its place, and
 * the index shows each retirement. The index opens with a legend that
 * defines every column and line it prints, so a visitor reads the measure
 * as the whole skill's and not the change's size. Every entry shows its
 * gist, the ruling that authorised it first and then its ruling list,
 * which stays cumulative (R49 revisited); a change entry its pages and a
 * retention under the minimum marked in its row; and a source entry its
 * handoff and a placement's loads fact. Where the
 * repository holds the workshop, the outbox of handoffs lists every part
 * handed off, from each source's latest entry. Every table is padded as the
 * formatter pads it, so a written view stays as rendered.
 */

/** A view: its repository-relative path and its text. */
export interface View {
  readonly path: string;
  readonly text: string;
}

/** A pinned source as the notices state it: the manifest's facts and its snapshot's licence file. */
export interface NoticeSource {
  readonly name: string;
  readonly repo: string;
  readonly commit: string;
  /** The snapshot's path under the corpus. */
  readonly snapshot: string;
  /** The snapshot's licence file, when it carries one. */
  readonly licence?: string | undefined;
  /** The manifest's copyright line, for a snapshot without a licence file. */
  readonly holder?: string | undefined;
}

/** A roster skill's manifest facts the notices and the line print. */
export interface ViewSkill extends LineSkill {
  /** The credits for the assets an extra skill carries. */
  readonly credits?: string | undefined;
}

/** What the views are rendered from. */
export interface ViewsInput {
  readonly chain: Chain;
  /** The modes definition, whose steps are the line. */
  readonly definition: ModesDefinition;
  /** The sources each recipe on disk lists, by skill. */
  readonly recipeSources: ReadonlyMap<string, readonly string[]>;
  /** The manifest's sources, in its order. */
  readonly sources: readonly NoticeSource[];
  /** The manifest's skills, in its order. */
  readonly skills: readonly ViewSkill[];
  /** The register's rows from before the old ledger, carried verbatim while their file exists. */
  readonly frozenRows?: string | undefined;
  /** Whether the repository holds the workshop, whose view the outbox of handoffs is. */
  readonly outbox?: boolean | undefined;
}

/** Views that cannot be rendered, with every reason. */
class ViewsRefused extends Error {
  /** The tag the Result law switches on. */
  readonly _tag = "ViewsRefused" as const;
  /** Every reason. */
  readonly issues: readonly string[];
  /** @param issues every reason */
  constructor(issues: readonly string[]) {
    super(`the views are refused: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

/** One skill's use of one source: its retention and coverage, none for a credit line of a stub. */
export interface Use {
  readonly skill: string;
  readonly credit: boolean;
  readonly retention: number | null;
  readonly coverage: number | null;
  /** Whether the retention reaches the minimum; null for a stub's credit or a source nothing is taken of. */
  readonly meetsMinimum: boolean | null;
}

/** A source's terms: its copyright line. */
interface Terms {
  readonly copyright: string;
}

const PERMISSION_START = "Permission is hereby granted";

function percent(value: number | null): string {
  return value === null ? "none" : `${(value * 100).toFixed(1)}%`;
}

/** The retention minimum as the views print it, 90%. */
const MINIMUM_TEXT = `${Math.round(RETENTION_MINIMUM * 100)}%`;

/**
 * A retention as a row shows it, marked when it is under the minimum, so a
 * retention the operator ruled below it is visible in its own row rather
 * than only in a ruling's words.
 * @param retention the retention
 * @param meetsMinimum whether it reaches the minimum; null when nothing is taken
 * @returns the cell's text
 */
function retentionCell(retention: number | null, meetsMinimum: boolean | null): string {
  return meetsMinimum === false
    ? `${percent(retention)}, under the ${MINIMUM_TEXT} minimum`
    : percent(retention);
}

function short(commit: string): string {
  return `\`${commit.slice(0, 12)}\``;
}

function subjectText(entry: ChangeEntry): string {
  const skill = skillOf(entry);
  return skill === undefined ? `the ${entry.subject}` : `the skill \`${skill}\``;
}

/** What a placed method catches and the modes it runs at, in one register cell. */
function placementCell(placement: Placement | undefined): string {
  if (placement === undefined) return "none";
  const runs = placement.modes
    .filter((row) => row.depth !== "none")
    .map((row) => `\`${row.mode}\` (\`${row.step}\`, ${row.depth})`);
  const where = runs.length === 0 ? "no mode" : listed(runs);
  return `${sentence(placement.catches)} A ${placement.kind} by \`${placement.move}\` of \`${placement.slot}\`, placed at ${where}, a ${placement.ships}.`;
}

/** A placement in the index: its move, evidence and boldest option, then one row per mode. */
function placementLines(placement: Placement): readonly string[] {
  return [
    `A \`${placement.kind}\` by \`${placement.move}\` of \`${placement.slot}\`, placed as a \`${placement.ships}\` on \`${placement.evidence}\` evidence. It catches: ${sentence(placement.catches)} The boldest option, \`${placement.boldest.move}\`, needs: ${sentence(placement.boldest.needs)}`,
    "",
    table(
      ["Mode", "Step", "Depth", "Cost in words"],
      placement.modes.map((row) => [
        `\`${row.mode}\``,
        `\`${row.step}\``,
        `\`${row.depth}\``,
        String(row.cost),
      ]),
    ),
    "",
    ...(placement.loads === undefined
      ? []
      : [
          `It loads ${listed(placement.loads.map((row) => `\`${row.file}\` at the depth \`${row.depth}\``))}.`,
          "",
        ]),
  ];
}

/** An entry's gist, as the index shows it under the entry's first paragraph. */
function gistLines(entry: Entry): readonly string[] {
  return [`Gist: ${entry.gist}`, ""];
}

/**
 * An entry's rulings, as the index shows them: the one that authorised it
 * first, then the whole list, which stays cumulative for a change (R49
 * revisited: keep the list, show this change's ruling first).
 * @param entry an entry
 * @returns its lines
 */
function rulingLines(entry: Entry): readonly string[] {
  const named = entry.authorisedBy;
  const authority =
    named === "unknown"
      ? "Authorised by: not recorded. The entry was recorded before the ledger kept this field, with several rulings of its own, and its record does not say which one authorised it."
      : named === null
        ? "Authorised by: no ruling of its own."
        : `Authorised by: ${named.date}: ${named.words}`;
  const list =
    entry.ruling.length === 0
      ? ["No ruling is recorded."]
      : [
          entry.kind === "change" ? "Rulings, cumulative:" : "Rulings:",
          "",
          ...entry.ruling.map((item) => `- ${item.date}: ${item.words}`),
        ];
  return [authority, "", ...list, ""];
}

/** A change's pages, as the index shows them under its first paragraph. */
function pagesLines(pages: Pages): readonly string[] {
  const text =
    pages === "unknown"
      ? "Pages: unknown. The entry was recorded before the ledger kept this field, and its record does not show them."
      : pages.length === 0
        ? "Pages: none. The change touched no installed page."
        : `Pages: ${pages.map((page) => `\`${page.path}\``).join(", ")}.`;
  return [text, ""];
}

/** A change's measure table: one row per source, each retention under the minimum marked. */
function measureTable(sources: readonly SourceMeasure[]): string {
  return table(
    ["Source", "Segments", "Taken", "Exact", "Retention", "Coverage", "Credit line"],
    sources.map((source) => [
      `\`${source.source}\``,
      String(source.segments),
      String(source.taken),
      String(source.exact),
      retentionCell(source.retention, source.meetsMinimum),
      percent(source.coverage),
      source.creditLine ? "yes" : "no",
    ]),
  );
}

/** A source entry's handoff, as the index shows it: the recipient, then each part at its locator. */
function handoffLines(entry: SourceEntry): readonly string[] {
  if (entry.handoff === undefined) return [];
  return [
    `Handed to \`${entry.handoff.recipient}\`:`,
    "",
    ...entry.handoff.parts.map((part) => `- ${part.part}, at ${part.locator}`),
    "",
  ];
}

function document(lines: readonly string[]): string {
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Each source's uses, by source name, as the sources register lists them:
 * from each skill's latest change entry, skills in name order, and a
 * stub's recipe sources as credit lines.
 * @param input the chain and the sources each recipe on disk lists
 * @returns each source's uses
 */
export function usesBySource(
  input: Pick<ViewsInput, "chain" | "recipeSources">,
): ReadonlyMap<string, readonly Use[]> {
  const uses = new Map<string, Use[]>();
  const add = (source: string, use: Use): void => {
    uses.set(source, [...(uses.get(source) ?? []), use]);
  };
  for (const [skill, entry] of [...latestChanges(input.chain)].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (entry.measure.stub)
      for (const source of input.recipeSources.get(skill) ?? [])
        add(source, {
          skill,
          credit: true,
          retention: null,
          coverage: null,
          meetsMinimum: null,
        });
    for (const source of entry.measure.sources)
      add(source.source, {
        skill,
        credit: source.creditLine,
        retention: source.retention,
        coverage: source.coverage,
        meetsMinimum: source.meetsMinimum,
      });
  }
  return uses;
}

function entrySection(entry: Entry): readonly string[] {
  const lines = [`## ${entry.id}`, ""];
  if ("oldChain" in entry.previous)
    lines.push(
      `It continues the old chain from its tip \`${entry.previous.oldChain.id}\` (revision ${short(entry.previous.oldChain.revision)}), whose file the commit ${short(entry.previous.oldChain.commit)} last wrote.`,
      "",
    );
  if (entry.kind === "retirement") {
    const heir =
      entry.replacedBy === null
        ? "no skill takes its place"
        : `\`${entry.replacedBy}\` takes its place`;
    lines.push(
      `A retirement of the skill \`${entry.skill}\`, by ${entry.slice}; ${heir}. It leaves the recipe ${short(entry.recipe)}: ${entry.reason}`,
      "",
      ...gistLines(entry),
      ...rulingLines(entry),
    );
    return lines;
  }
  if (entry.kind === "source") {
    const pin = entry.pin === undefined ? "" : `, pinned as \`${entry.pin}\``;
    lines.push(
      `A source read: ${entry.source.repository} at ${short(entry.source.commit)}, path \`${entry.source.path}\`${pin}. Licence \`${entry.licence}\`, verdict \`${entry.verdict}\`: ${entry.reason}`,
      "",
      ...gistLines(entry),
      ...rulingLines(entry),
      ...handoffLines(entry),
    );
    if (entry.placement !== undefined) lines.push(...placementLines(entry.placement));
    return lines;
  }
  lines.push(
    `A change to ${subjectText(entry)}: ${entry.reason}`,
    "",
    ...pagesLines(entry.pages),
    ...gistLines(entry),
  );
  if (entry.measure.stub)
    lines.push("The skill is a stub: its sources are credited, not measured.", "");
  else if (entry.measure.sources.length > 0) lines.push(measureTable(entry.measure.sources), "");
  // "Growth" read as the change's size; the figure is the whole skill's written text.
  lines.push(
    `Written words, the whole skill's: ${entry.measure.growth}.`,
    "",
    ...rulingLines(entry),
  );
  return lines;
}

/**
 * The index's legend: every line and column an entry prints, defined once
 * at the head, so a visitor never reads the skill's written words as the
 * change's size or meets a column nowhere defined (the first evaluation's
 * proposal 10).
 */
const INDEX_LEGEND: readonly string[] = [
  "## How to read an entry",
  "",
  "Every entry opens with what it records and its reason, then:",
  "",
  "- Gist: the reason in at most twelve words.",
  "- Authorised by: the one ruling that authorised the entry, shown first, with its date and the operator's words. It reads `no ruling of its own` when the entry adds none, and `not recorded` on an entry recorded before the ledger kept this field with several rulings of its own.",
  "- Rulings: every ruling the entry carries, each with its date and the operator's words. A change's list is cumulative: it restates the rulings of its subject's earlier changes and appends its own.",
  "",
  "A change entry records one change to a skill, the modes or the block. It also shows:",
  "",
  "- Pages: the installed pages the change touched, each by its path inside the skill's directory, or in the workspace for the modes or the block. It reads `unknown` on an entry recorded before the ledger kept this field whose record does not show them.",
  "- The measure table, one row per source the skill takes from. It measures the whole skill as the change leaves it, not the change alone.",
  "  - Source: the pinned source.",
  "  - Segments: the sentences and list items of the source's files the skill's recipe names.",
  "  - Taken: the segments the skill takes.",
  "  - Exact: the taken segments the skill keeps unedited and in the source's order.",
  `  - Retention: exact over taken. A retention under the ${MINIMUM_TEXT} minimum is marked in its row, and the operator's ruling allows it.`,
  "  - Coverage: taken over segments.",
  "  - Credit line: `yes` when the skill takes no segment exactly, so the source is credited rather than measured.",
  "- Written words, the whole skill's: the words the skill's recipe writes itself, beyond what it takes from its sources, across the whole skill. It is not the size of the change.",
  "",
  "A source entry records one source read from a repository at a commit: its repository, commit and path, its licence, its verdict and its reason. It may also show:",
  "",
  "- Handed to: the owner a part of the source is handed to, garden or a workshop craft, then each part and where it stands in the source.",
  "- Its placement, for a source whose method enters a skill: its kind, its move and the slot it names, whether it ships as a `trial` a workspace enables or as a `default`, the evidence for it, what it catches, and the boldest move considered with what that move needs. Then one row per mode:",
  "",
  "- Mode: the mode the row places the method at.",
  "- Step: the step of the line where the method runs or loads at that mode.",
  "- Depth: that step's depth at that mode.",
  "- Cost in words: the words an agent reads at that mode that the placement adds there; below zero for the words a swap removes.",
  "- It loads: the reference files the method reads, each inside the skill's directory, and the depth at which it reads them.",
  "",
  "A retirement entry records a skill leaving the roster: the slice that retires it, the skill that takes its place and the recipe it leaves.",
];

/**
 * The index of entries, newest first.
 * @param chain a whole chain
 * @returns the text of `corpus/ledger/INDEX.md`
 */
function renderIndex(chain: Chain): string {
  return document([
    "# The ledger",
    "",
    "Generated by `node scripts/corpus.mjs views` from the entries under `corpus/ledger/entries/`, and never edited by hand. Each entry names its predecessor by the digest of its bytes, and the first cites the old chain's tip. The entries are listed newest first.",
    "",
    ...INDEX_LEGEND,
    "",
    ...(chain.entries.length === 0 ? ["No entry is recorded yet.", ""] : []),
    ...[...chain.entries].reverse().flatMap(({ entry }) => entrySection(entry)),
  ]);
}

function section(heading: string, rows: readonly (readonly string[])[], head: readonly string[]) {
  return [`## ${heading}`, "", rows.length === 0 ? "None yet." : table(head, rows), ""];
}

function renderRegister(input: ViewsInput, uses: ReadonlyMap<string, readonly Use[]>): string {
  const read = input.chain.entries.flatMap(({ entry }) =>
    entry.kind === "source"
      ? [
          [
            cell(
              `${entry.source.repository} at ${short(entry.source.commit)}, \`${entry.source.path}\``,
            ),
            `\`${entry.licence}\``,
            `\`${entry.verdict}\``,
            cell(placementCell(entry.placement)),
            cell(entry.reason),
            `\`${entry.id}\``,
          ],
        ]
      : [],
  );
  const retired = [...retiredSkills(input.chain).values()].map((entry) => [
    `\`${entry.skill}\``,
    entry.replacedBy === null ? "none" : `\`${entry.replacedBy}\``,
    cell(entry.slice),
    cell(entry.reason),
    `\`${entry.id}\``,
  ]);
  const where = (source: NoticeSource) => `${source.repo} at ${short(source.commit)}`;
  const rows = (credit: boolean) =>
    input.sources.flatMap((source) =>
      (uses.get(source.name) ?? [])
        .filter((use) => use.credit === credit)
        .map((use) =>
          credit
            ? [`\`${source.name}\``, where(source), `\`${use.skill}\``]
            : [
                `\`${source.name}\``,
                where(source),
                `\`${use.skill}\``,
                retentionCell(use.retention, use.meetsMinimum),
                percent(use.coverage),
              ],
        ),
    );
  const frozen =
    input.frozenRows === undefined
      ? []
      : [
          "## Before the ledger, frozen on 2026-09-16",
          "",
          "These rows are the register as it stood before the old ledger, kept byte for byte.",
          "",
          input.frozenRows.trimEnd(),
          "",
        ];
  return document([
    "# Sources",
    "",
    `Generated by \`node scripts/corpus.mjs views\` from the entries under \`corpus/ledger/entries/\` and the recipes, and never edited by hand. It lists every source read from a repository at a commit, as its source entry records it; then each tracked source with the skills that take its text, their retention (the taken segments kept unedited and in the source's order, over those taken, marked in its row under the ${MINIMUM_TEXT} minimum) and their coverage (the segments taken, over those the recipe names); then the credit lines, the sources a skill takes no text of exactly (the ruling C14); then the skills retired, each with the skill that takes its place.`,
    "",
    ...section("Sources read", read, [
      "Source",
      "Licence",
      "Verdict",
      "Placement",
      "Reason",
      "Entry",
    ]),
    ...section("Tracked sources", rows(false), [
      "Source",
      "Repository and commit",
      "Skill",
      "Retention",
      "Coverage",
    ]),
    ...section("Credit lines", rows(true), ["Source", "Repository and commit", "Skill"]),
    ...section("Retired skills", retired, ["Skill", "Replaced by", "Slice", "Reason", "Entry"]),
    ...frozen,
  ]);
}

/**
 * The outbox of handoffs, `docs/HANDOFFS.md`: from each source's latest
 * entry, by its repository and its path, in the order of those entries,
 * every part its handoff names, with its recipient and locator.
 * @param chain a whole chain
 * @returns the text of `docs/HANDOFFS.md`
 */
function renderOutbox(chain: Chain): string {
  const latest = new Map<string, SourceEntry>();
  for (const { entry } of chain.entries) {
    if (entry.kind !== "source") continue;
    const key = `${entry.source.repository} ${entry.source.path}`;
    latest.delete(key);
    latest.set(key, entry);
  }
  const handed = [...latest.values()].flatMap((entry) =>
    (entry.handoff?.parts ?? []).map((part) => [
      cell(`${entry.source.repository} at ${short(entry.source.commit)}, \`${entry.source.path}\``),
      `\`${entry.handoff?.recipient ?? ""}\``,
      cell(part.part),
      cell(part.locator),
      `\`${entry.id}\``,
    ]),
  );
  return document([
    "# Handoffs",
    "",
    "Generated by `node scripts/corpus.mjs views` from the entries under `corpus/ledger/entries/`, and never edited by hand. It lists every part the ledger hands to another owner, garden or a workshop craft, as each source's latest entry records it, oldest first. The receiving owner reads it from its own checkout and takes a part by recording its own entry naming the entry here.",
    "",
    "## Handed off",
    "",
    handed.length === 0
      ? "None yet."
      : table(["Source", "Recipient", "Part", "Locator", "Entry"], handed),
  ]);
}

/** A source's terms from its licence file or its holder, or why there are none. */
function termsOf(source: NoticeSource): Result<Terms, ViewsRefused> {
  const refuse = (message: string) => err(new ViewsRefused([`${source.name}: ${message}`]));
  if (source.licence === undefined)
    return source.holder === undefined
      ? refuse("the snapshot carries no licence file and the manifest names no holder")
      : ok({ copyright: source.holder });
  if (source.holder !== undefined)
    return refuse("the snapshot carries a licence file; its copyright line is the file's");
  const copyright = /^Copyright.*$/m.exec(source.licence)?.[0];
  const start = source.licence.indexOf(PERMISSION_START);
  if (copyright === undefined || start < 0)
    return refuse("the licence file carries no copyright line or permission text");
  return ok({ copyright: copyright.trim() });
}

function renderNotices(
  used: readonly { readonly source: NoticeSource; readonly terms: Terms }[],
  uses: ReadonlyMap<string, readonly Use[]>,
  skills: ReadonlyMap<string, ViewSkill>,
  permission: string,
): readonly View[] {
  const extra = (skill: string) => (skills.get(skill)?.extra === true ? " (extra)" : "");
  const named = (use: Use) => `\`${use.skill}\`${extra(use.skill)}${use.credit ? " (credit)" : ""}`;
  const rows = used.map(({ source, terms }) => [
    `\`${source.name}\``,
    `[${source.repo.replace(/\/$/, "").split("/").at(-1) ?? source.repo}](${source.repo}) at \`${source.commit}\``,
    cell(`MIT; ${terms.copyright}`),
    (uses.get(source.name) ?? []).map(named).join(", "),
  ]);
  const credited = [
    ...new Set(used.flatMap(({ source }) => (uses.get(source.name) ?? []).map((u) => u.skill))),
  ]
    .sort()
    .flatMap((skill) => {
      const credits = skills.get(skill)?.credits;
      return credits === undefined ? [] : [`The \`${skill}\`${extra(skill)} ${credits}`, ""];
    });
  const notices = document([
    "# Third-party notices for greenline",
    "",
    "These notices cover the skills greenline distributes that take text from, or credit, a source outside greenline. greenline is independent and implies no endorsement by any source author; its own license does not replace the terms below. This file is generated by the corpus instrument's `views` verb from the ledger's entries, the recipes and the manifest, and never edited by hand.",
    "",
    "## Sources",
    "",
    used.length === 0
      ? "No skill takes from or credits a source yet."
      : table(["Source", "Repository and commit", "Terms and attribution", "Skills"], rows),
    "",
    "A skill marked (credit) takes no text of its source exactly; the source is credited for what it lent. A skill marked (extra) installs only when a workspace asks for it. Every difference a skill makes from its source's text is recorded with its reason in the skill's recipe, and every change to it is an entry of the ledger. Source rights travel with these skills; preserve this notice with copied skills.",
    "",
    ...(credited.length === 0 ? [] : ["## Credits within optional assets", "", ...credited]),
    ...(used.length === 0
      ? []
      : [
          "## MIT License",
          "",
          "The following text applies to every source above.",
          "",
          permission,
          "",
        ]),
  ]);
  const corpusNotice = document([
    "# Corpus sources",
    "",
    "Generated by `node scripts/corpus.mjs views`, and never edited by hand. It lists each source a recipe takes from or credits, with its frozen snapshot and its terms. The complete notices, with the licence text, are `THIRD_PARTY_NOTICES.md` at the repository root, which travels with the package and the installed skills.",
    "",
    used.length === 0
      ? "No skill takes from or credits a source yet."
      : table(
          ["Source", "Snapshot", "Terms"],
          used.map(({ source, terms }) => [
            `\`${source.name}\``,
            `\`corpus/${source.snapshot}/\``,
            cell(`MIT; ${terms.copyright}`),
          ]),
        ),
    "",
    "A snapshot is immutable. A skill under `corpus/skills/` is rendered from its recipe and these snapshots and verified byte for byte by `node scripts/corpus.mjs verify`.",
  ]);
  return [
    { path: "THIRD_PARTY_NOTICES.md", text: notices },
    { path: "corpus/NOTICE.md", text: corpusNotice },
  ];
}

/**
 * Render the five views: the index, the sources register, the two notices
 * and the line view; and the outbox of handoffs where the repository holds
 * the workshop.
 * @param input the chain, the modes definition, the recipes' sources, the manifest's sources and skills, the frozen rows and whether to render the outbox
 * @returns each view's path and text, or why a source's terms cannot be stated
 */
export function renderViews(input: ViewsInput): Result<readonly View[], ViewsRefused> {
  const uses = usesBySource(input);
  const used: { readonly source: NoticeSource; readonly terms: Terms }[] = [];
  const issues: string[] = [];
  for (const source of input.sources) {
    if ((uses.get(source.name) ?? []).length === 0) continue;
    const terms = termsOf(source);
    if (terms._tag === "err") issues.push(...terms.error.issues);
    else used.push({ source, terms: terms.value });
  }
  const known = new Set(input.sources.map((source) => source.name));
  for (const name of uses.keys())
    if (!known.has(name)) issues.push(`${name}: the manifest pins no such source`);
  const permission = input.sources.flatMap((source) => {
    const start = source.licence?.indexOf(PERMISSION_START) ?? -1;
    return source.licence === undefined || start < 0 ? [] : [source.licence.slice(start).trimEnd()];
  })[0];
  if (used.length > 0 && permission === undefined)
    issues.push("no snapshot's licence file carries the MIT permission text");
  if (issues.length > 0) return err(new ViewsRefused(issues));
  return ok([
    { path: "corpus/ledger/INDEX.md", text: renderIndex(input.chain) },
    { path: "docs/SOURCES.md", text: renderRegister(input, uses) },
    ...renderNotices(
      used,
      uses,
      new Map(input.skills.map((skill) => [skill.name, skill])),
      permission ?? "",
    ),
    {
      path: "corpus/ledger/LINE.md",
      text: renderLine(
        lineOf({ definition: input.definition, skills: input.skills, chain: input.chain }),
      ),
    },
    ...(input.outbox === true
      ? [{ path: "docs/HANDOFFS.md", text: renderOutbox(input.chain) }]
      : []),
  ]);
}
