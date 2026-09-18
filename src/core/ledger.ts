import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { isRepositoryPath } from "../commons/repository-path.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
  type InvalidField,
} from "./contract.ts";
import {
  divergenceRevision,
  EDIT_KINDS,
  parseDivergenceRecord,
  replayClaims,
  type DivergenceChange,
  type DivergenceSource,
  type DivergenceRecord,
  type DivergenceState,
} from "./divergence.ts";

/**
 * The ledger (`workshop/components/ledger.md`, the rulings of 2026-09-16):
 * one chain of immutable, content-addressed entries about what greenline
 * ships and where it came from. A version-2 divergence record is read as
 * a copy entry with the revision it always had; a version-3 entry is one
 * of four kinds. The chain has one baseline and no branch; a subject's
 * pin names the latest entry that touched it.
 */

/** The four kinds of entry the ruling of 2026-09-16 names; everything else is a view. */
export type LedgerKind = "copy" | "native" | "unit" | "publication";
/** The four kinds as a list, for a command that offers them. */
export const LEDGER_KINDS = ["copy", "native", "unit", "publication"] as const;

/** A predecessor or a pin: an entry by its id and its digest. */
export interface LedgerReference {
  readonly id: string;
  readonly revision: string;
}

/** The ruling an authority rests on, in its own words, so a public entry stands alone. */
export interface LedgerRuling {
  readonly date: string;
  readonly words: string;
}

/** The operator's ruling behind a method edit or a lift, witnessed by a frozen file's digest. */
export interface LedgerAuthority {
  readonly path: string;
  readonly revision: string;
  readonly reason: string;
  readonly ruling: LedgerRuling;
}

/** The licence a family carries in the manifest, MIT; a copy entry states it so the entry stands alone. */
export type SourceLicence = "MIT";

/** A copy's upstream: the version-2 source (repository, commit, path, tree digest) and its licence. */
export interface CopySource extends DivergenceSource {
  readonly license: SourceLicence;
}

/** A copy entry's edit change: the version-2 shape, the licence on its source and the ruling's words on its authority. */
export interface CopyEditChange extends Omit<DivergenceChange, "authority" | "source"> {
  readonly source: CopySource;
  readonly authority?: LedgerAuthority | undefined;
}

/** A copy entry's retirement change (the ruling D10): the skill leaves the roster, with its reason and its replacement or none. */
export interface CopyRetirementChange {
  readonly skill: string;
  readonly reason: string;
  readonly retirement: { readonly replacement: string | null };
}

/** A copy entry's change: an edit of a live copy, or the retirement of one. */
export type CopyChange = CopyEditChange | CopyRetirementChange;

/** What a native span did with its origin: lifted as written, adapted in our words, or credited only. */
export type NativeDisposition = "lifted" | "adapted" | "credited";
/** A native entry's change: a roster skill or the block, its origin (a digest by id and pin, or the house), its spans and its reason. */
export interface NativeChange {
  readonly subject: { readonly skill: string } | { readonly block: string };
  readonly origin: { readonly digest: string; readonly pin: string } | { readonly house: true };
  readonly spans: readonly {
    readonly lines: string;
    readonly disposition: NativeDisposition;
    readonly reason: string;
  }[];
  readonly reason: string;
  readonly authority?: LedgerAuthority | undefined;
}

/** What a unit span did with its source text: retained, rewritten, removed or cut. */
export type UnitDisposition = "retain" | "rewrite" | "remove" | "cut";
/** The six candidate grades of `docs/VOCABULARY.md`, as a unit entry grades each unit against its source. */
export type CandidateGrade =
  | "keep"
  | "confirms"
  | "corrects"
  | "conflict"
  | "dated"
  | "out-of-scope";
/** A unit entry's change: one family, the digest read against it, the spans, each unit's revision and grade, and the reason. */
export interface UnitChange {
  readonly family: string;
  readonly origin: { readonly digest: string; readonly pin: string };
  readonly spans: readonly { readonly lines: string; readonly disposition: UnitDisposition }[];
  readonly units: readonly {
    readonly id: string;
    readonly revision: string;
    readonly grade: CandidateGrade;
  }[];
  readonly reason: string;
  readonly authority?: LedgerAuthority | undefined;
}

/** A publication entry's change: one snapshot, the one before it, when it was published, and each unit at its revision with a reason. */
export interface PublicationChange {
  readonly snapshot: string;
  readonly previous: string | null;
  readonly at: string;
  readonly units: readonly {
    readonly id: string;
    readonly revision: string;
    readonly reason: string;
  }[];
  readonly reason: string;
}

/** The optional links of an envelope; a reader outside the repository ignores them, so one may name a private path. */
export interface LedgerLinks {
  readonly acquisition?: string | undefined;
  readonly review?: string | undefined;
  readonly decision?: string | undefined;
  readonly execution?: string | undefined;
}

interface Envelope {
  readonly schemaVersion: 3;
  readonly id: string;
  readonly date: string;
  readonly previous: LedgerReference | null;
  readonly links?: LedgerLinks | undefined;
}

/** A version-3 entry, one of four kinds. */
export type LedgerEntryV3 =
  | (Envelope & { readonly kind: "copy"; readonly changes: readonly CopyChange[] })
  | (Envelope & { readonly kind: "native"; readonly changes: readonly NativeChange[] })
  | (Envelope & { readonly kind: "unit"; readonly changes: readonly UnitChange[] })
  | (Envelope & { readonly kind: "publication"; readonly changes: readonly PublicationChange[] });

/**
 * One entry of the chain as the reader holds it: the envelope every kind
 * shares, its revision, the subjects it touches, and its raw form.
 */
interface LedgerEntryBase {
  readonly id: string;
  readonly date: string;
  readonly previous: LedgerReference | null;
  readonly kind: LedgerKind;
  readonly revision: string;
  readonly subjects: readonly string[];
}
/** An entry as the reader holds it: a version-2 record kept whole, or a version-3 entry, each with its revision and subjects. */
export type LedgerEntry =
  | (LedgerEntryBase & { readonly version: 2; readonly raw: DivergenceRecord })
  | (LedgerEntryBase & { readonly version: 3; readonly raw: LedgerEntryV3 });

const text = z.string().trim().min(1);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const hunkId = z.string().regex(/^h:[a-f0-9]{16}(#[1-9][0-9]*)?$/);
const path = text.refine(isRepositoryPath, "a relative record path without traversal");
const reference = z.object({ id, revision: hash }).strict();
const ruling = z.object({ date: z.iso.date(), words: text }).strict();
const authority = z.object({ path, revision: hash, reason: text, ruling }).strict();
const sourceSchema = z
  .object({
    repo: z.url(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    path,
    revision: hash,
    license: z.literal("MIT"),
  })
  .strict();
const copyEditChange = z
  .object({
    skill: id,
    source: sourceSchema,
    result: hash,
    reason: text,
    edits: z.array(
      z.object({ kind: z.enum(EDIT_KINDS), reason: text, hunks: z.array(hunkId).min(1) }).strict(),
    ),
    retired: z.array(z.object({ hunk: hunkId, reason: text }).strict()),
    authority: authority.optional(),
  })
  .strict()
  .refine(
    (change) =>
      change.edits.every((edit) => edit.kind !== "method") || change.authority !== undefined,
    "a method edit requires the operator's authority witness",
  );
const copyRetirementChange = z
  .object({
    skill: id,
    reason: text,
    retirement: z.object({ replacement: id.nullable() }).strict(),
  })
  .strict();
const copyChange = z.union([copyEditChange, copyRetirementChange]);
const nativeChange = z
  .object({
    subject: z.union([z.object({ skill: id }).strict(), z.object({ block: path }).strict()]),
    origin: z.union([
      z.object({ digest: id, pin: text }).strict(),
      z.object({ house: z.literal(true) }).strict(),
    ]),
    spans: z.array(
      z
        .object({
          lines: text,
          disposition: z.enum(["lifted", "adapted", "credited"]),
          reason: text,
        })
        .strict(),
    ),
    reason: text,
    authority: authority.optional(),
  })
  .strict()
  .refine(
    (change) => "house" in change.origin || change.authority !== undefined,
    "a lift from a digest requires the operator's authority witness",
  );
const unitChange = z
  .object({
    family: id,
    origin: z.object({ digest: id, pin: text }).strict(),
    spans: z.array(
      z
        .object({ lines: text, disposition: z.enum(["retain", "rewrite", "remove", "cut"]) })
        .strict(),
    ),
    units: z.array(
      z
        .object({
          id,
          revision: hash,
          grade: z.enum(["keep", "confirms", "corrects", "conflict", "dated", "out-of-scope"]),
        })
        .strict(),
    ),
    reason: text,
    authority: authority.optional(),
  })
  .strict();
const publicationChange = z
  .object({
    snapshot: text,
    previous: text.nullable(),
    at: z.iso.datetime(),
    units: z.array(z.object({ id, revision: hash, reason: text }).strict()),
    reason: text,
  })
  .strict();
const envelope = {
  schemaVersion: z.literal(3),
  id,
  date: z.iso.date(),
  previous: reference.nullable(),
  links: z
    .object({
      acquisition: path.optional(),
      review: path.optional(),
      decision: path.optional(),
      execution: path.optional(),
    })
    .strict()
    .optional(),
};
const entrySchema = z.discriminatedUnion("kind", [
  z.object({ ...envelope, kind: z.literal("copy"), changes: z.array(copyChange).min(1) }).strict(),
  z
    .object({ ...envelope, kind: z.literal("native"), changes: z.array(nativeChange).min(1) })
    .strict(),
  z.object({ ...envelope, kind: z.literal("unit"), changes: z.array(unitChange).min(1) }).strict(),
  z
    .object({
      ...envelope,
      kind: z.literal("publication"),
      changes: z.array(publicationChange).min(1),
    })
    .strict(),
]);

/** The subjects an entry is about, one per change, as the chain names them. */
function subjectsOf(entry: LedgerEntryV3): readonly string[] {
  switch (entry.kind) {
    case "copy":
      return entry.changes.map((change) => `skill:${change.skill}`);
    case "native":
      return entry.changes.map((change) =>
        "skill" in change.subject
          ? `skill:${change.subject.skill}`
          : `block:${change.subject.block}`,
      );
    case "unit":
      return entry.changes.map((change) => `family:${change.family}`);
    case "publication":
      return entry.changes.map((change) => `snapshot:${change.snapshot}`);
  }
}

const versionTwo = z.object({ schemaVersion: z.literal(2) }).loose();
// A copy entry's changes are checked by their own form first, so a refusal
// names the field, where the union alone would say only "Invalid input".
const copyProbe = z
  .object({
    kind: z.literal("copy"),
    changes: z.array(z.object({ retirement: z.unknown().optional() }).loose()),
  })
  .loose();

const PRIVATE_PATHS = /docs\/(?:work|research)\/[^"\\]*/g;

/**
 * The private-path rule (the ruling of 2026-09-16): no entry names a
 * working document or a digest in what a public reader sees. The changes
 * are scanned serialised; the links, which a public reader ignores, are
 * outside them.
 */
function privatePathIssues(entry: LedgerEntry): readonly InvalidField[] {
  const serialised = JSON.stringify(entry.raw.changes);
  return [...serialised.matchAll(PRIVATE_PATHS)].map((match) => ({
    path: entry.id,
    message: `a public entry names a private path: ${match[0].slice(0, 80)}`,
  }));
}

/** The revision of a version-3 entry: its parsed JSON, serialised; formatting cannot change it. */
export function ledgerRevision(entry: LedgerEntryV3): string {
  return sha256Hex(JSON.stringify(entry));
}

/**
 * Parse one entry of either version. A version-2 record keeps the
 * revision it always had; a version-3 entry is refused for two changes on
 * one subject, a hunk claimed or retired twice in one change, a method
 * edit or a lift without its authority, and a private path.
 */
export function parseLedgerEntry(
  input: string,
  source: string,
): Result<LedgerEntry, ContractParseFailed> {
  const json = parseJson(input);
  if (versionTwo.safeParse(json).success) {
    const record = parseDivergenceRecord(input, source);
    if (record._tag === "err") return record;
    return contractOk({
      version: 2,
      id: record.value.id,
      date: record.value.date,
      previous: record.value.previous,
      kind: "copy",
      revision: divergenceRevision(record.value),
      subjects: record.value.changes.map((change) => `skill:${change.skill}`),
      raw: record.value,
    });
  }
  const probe = copyProbe.safeParse(json);
  if (probe.success) {
    const problems: InvalidField[] = [];
    probe.data.changes.forEach((change, index) => {
      const form = change.retirement === undefined ? copyEditChange : copyRetirementChange;
      const checked = form.safeParse(change);
      if (!checked.success)
        problems.push(
          ...issuesFrom(checked.error.issues).map((issue) => ({
            path: issue.path === "" ? `changes[${index}]` : `changes[${index}].${issue.path}`,
            message: issue.message,
          })),
        );
    });
    if (problems.length > 0) return contractFailure(source, problems);
  }
  const parsed = entrySchema.safeParse(json);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const entry: LedgerEntryV3 = parsed.data;
  const issues: InvalidField[] = [];
  const subjects = subjectsOf(entry);
  if (new Set(subjects).size !== subjects.length)
    issues.push({ path: "changes", message: "one change per subject in an entry" });
  if (entry.kind === "copy")
    for (const change of entry.changes) {
      if ("retirement" in change) continue;
      for (const [label, hunks] of [
        ["claimed", change.edits.flatMap((edit) => edit.hunks)],
        ["retired", change.retired.map((item) => item.hunk)],
      ] as const) {
        const seen = new Set<string>();
        for (const hunk of hunks) {
          if (seen.has(hunk))
            issues.push({
              path: change.skill,
              message: `hunk ${hunk} is ${label} twice in one change`,
            });
          seen.add(hunk);
        }
      }
    }
  const held: LedgerEntry = {
    version: 3,
    id: entry.id,
    date: entry.date,
    previous: entry.previous,
    kind: entry.kind,
    revision: ledgerRevision(entry),
    subjects,
    raw: entry,
  };
  issues.push(...privatePathIssues(held));
  return issues.length > 0 ? contractFailure(source, issues) : contractOk(held);
}

/** The chain from baseline to tip, or why it is not one chain. */
export interface LedgerChain {
  readonly chain: readonly LedgerEntry[];
  readonly issues: readonly InvalidField[];
}

export function orderLedger(entries: readonly LedgerEntry[]): LedgerChain {
  const issues: InvalidField[] = [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length)
    issues.push({ path: "records", message: "duplicate ledger entry identity" });
  const baselines = entries.filter((entry) => entry.previous === null);
  if (entries.length > 0 && baselines.length !== 1)
    issues.push({ path: "records", message: "the ledger requires one connected baseline" });
  const successor = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    const previous = entry.previous;
    if (previous === null) continue;
    if (successor.has(previous.id))
      issues.push({ path: entry.id, message: "the ledger branches; append to the current tip" });
    successor.set(previous.id, entry);
    const predecessor = byId.get(previous.id);
    if (predecessor === undefined || predecessor.revision !== previous.revision)
      issues.push({ path: entry.id, message: "the preceding ledger entry is missing or changed" });
  }
  const chain: LedgerEntry[] = [];
  const visited = new Set<string>();
  let cursor = baselines[0];
  while (cursor !== undefined) {
    if (visited.has(cursor.id)) {
      issues.push({ path: cursor.id, message: "cyclic ledger history" });
      break;
    }
    visited.add(cursor.id);
    chain.push(cursor);
    cursor = successor.get(cursor.id);
  }
  if (issues.length === 0 && chain.length !== entries.length)
    issues.push({ path: "records", message: "a ledger entry is detached from the chain" });
  return { chain, issues };
}

/** The tip of a valid chain, or undefined for an empty one. */
export function ledgerTip(chain: readonly LedgerEntry[]): LedgerReference | undefined {
  const last = chain[chain.length - 1];
  return last === undefined ? undefined : { id: last.id, revision: last.revision };
}

/**
 * A copy entry as the divergence replay reads it: the record itself for
 * version 2, and the version-3 edit changes in the version-2 shape (the
 * source without its licence, the authority without its ruling), which the
 * replay and the page renderers consume; a retirement has no hunks and is
 * left out, and an entry of retirements only is not projected. The entry's
 * own revision stays with the entry, and its `previous` is the raw one;
 * `copyChainOf` re-links it.
 */
export function copyRecordOf(entry: LedgerEntry): DivergenceRecord | undefined {
  if (entry.version === 2) return entry.raw;
  const raw = entry.raw;
  if (raw.kind !== "copy") return undefined;
  if (raw.changes.every((change) => "retirement" in change)) return undefined;
  return {
    schemaVersion: 2,
    id: raw.id,
    date: raw.date,
    previous: raw.previous,
    links: raw.links ?? {},
    changes: raw.changes.flatMap((change) => {
      if ("retirement" in change) return [];
      const { authority: witnessed, source, ...rest } = change;
      const unlicensed = {
        repo: source.repo,
        commit: source.commit,
        path: source.path,
        revision: source.revision,
      };
      return witnessed === undefined
        ? { ...rest, source: unlicensed }
        : {
            ...rest,
            source: unlicensed,
            authority: {
              path: witnessed.path,
              revision: witnessed.revision,
              reason: witnessed.reason,
            },
          };
    }),
  };
}

/**
 * The copy entries of a chain in the replay's shape, in chain order, as a
 * valid version-2 chain: a version-2 record keeps its own predecessor; a
 * version-3 copy is re-linked to the copy before it in this projection,
 * since its raw predecessor may be an entry of another kind that the
 * projection leaves out.
 */
export function copyChainOf(chain: readonly LedgerEntry[]): readonly DivergenceRecord[] {
  const records: DivergenceRecord[] = [];
  for (const entry of chain) {
    const record = copyRecordOf(entry);
    if (record === undefined) continue;
    if (entry.version === 2) {
      records.push(record);
      continue;
    }
    const predecessor = records[records.length - 1];
    records.push({
      ...record,
      previous:
        predecessor === undefined
          ? null
          : { id: predecessor.id, revision: divergenceRevision(predecessor) },
    });
  }
  return records;
}

/**
 * Audit every pinned copy against the chain: the pin names the latest
 * entry touching the skill at that entry's own revision, that entry's
 * source and result match what is measured, and the replayed claims cover
 * exactly the live hunks.
 */
export function auditCopies(
  chain: readonly LedgerEntry[],
  current: readonly DivergenceState[],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  const byId = new Map(chain.map((entry) => [entry.id, entry]));
  const records = copyChainOf(chain);
  for (const state of current) {
    const pinned = byId.get(state.record.id);
    if (pinned === undefined || pinned.revision !== state.record.revision) {
      issues.push({ path: state.skill, message: "the pinned ledger entry is missing or changed" });
      continue;
    }
    const record = copyRecordOf(pinned);
    const change = record?.changes.find((item) => item.skill === state.skill);
    if (record === undefined || change === undefined) {
      issues.push({ path: state.skill, message: "the pinned ledger entry has no change for it" });
      continue;
    }
    const latest = [...chain]
      .reverse()
      .find((entry) => entry.kind === "copy" && entry.subjects.includes(`skill:${state.skill}`));
    if (latest !== undefined && latest.id !== pinned.id)
      issues.push({
        path: state.skill,
        message: "the pin must name the latest entry for this skill",
      });
    if (
      change.source.repo !== state.source.repo ||
      change.source.commit !== state.source.commit ||
      change.source.path !== state.source.path ||
      change.source.revision !== state.source.revision
    )
      issues.push({ path: state.skill, message: "upstream source differs from the pinned entry" });
    if (change.result !== state.result)
      issues.push({ path: state.skill, message: "the copy differs from its pinned entry" });
    const replay = replayClaims(records, state.skill);
    issues.push(...replay.issues);
    const live = new Set(state.hunks);
    for (const hunk of live)
      if (!replay.claims.has(hunk))
        issues.push({ path: state.skill, message: `hunk ${hunk} is live and no entry claims it` });
    for (const hunk of replay.claims.keys())
      if (!live.has(hunk))
        issues.push({ path: state.skill, message: `hunk ${hunk} is claimed and no longer live` });
  }
  return issues;
}

/** One witness an entry's authority names: the subject it rules on, the recorded path and digest. */
export interface AuthorityClaim {
  readonly subject: string;
  readonly authority: { readonly path: string; readonly revision: string };
}

/** The witnesses an entry names, one per change with an authority, paired with the change's subject. */
export function authorityClaims(entry: LedgerEntry): readonly AuthorityClaim[] {
  const changes: readonly {
    readonly reason: string;
    readonly authority?: { readonly path: string; readonly revision: string } | undefined;
  }[] = entry.raw.changes;
  return changes.flatMap((change, index) => {
    const subject = entry.subjects[index];
    return change.authority === undefined || subject === undefined
      ? []
      : [
          {
            subject,
            authority: { path: change.authority.path, revision: change.authority.revision },
          },
        ];
  });
}

/** A subject's pin, by id and digest, from the manifest or a reshape record. */
export interface SubjectPin {
  readonly subject: string;
  readonly pin: LedgerReference;
}

/**
 * Audit pins outside the copy audit: each names the latest entry for its
 * subject at that entry's own revision, and a subject in `unpinned` that
 * the chain records is refused, since its pin is owed.
 */
export function auditPins(
  chain: readonly LedgerEntry[],
  pins: readonly SubjectPin[],
  unpinned: readonly string[] = [],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  const byId = new Map(chain.map((entry) => [entry.id, entry]));
  for (const subject of unpinned)
    if (chain.some((entry) => entry.subjects.includes(subject)))
      issues.push({
        path: subject,
        message: "the chain records this subject and it carries no pin",
      });
  for (const { subject, pin } of pins) {
    const pinned = byId.get(pin.id);
    if (pinned === undefined || pinned.revision !== pin.revision) {
      issues.push({ path: subject, message: "the pinned ledger entry is missing or changed" });
      continue;
    }
    const latest = [...chain].reverse().find((entry) => entry.subjects.includes(subject));
    if (latest === undefined || latest.id !== pin.id)
      issues.push({
        path: subject,
        message: "the pin must name the latest entry for this subject",
      });
  }
  return issues;
}

/** The ledger index: every entry, newest last, with its kind, its subjects and its reason. */
export function renderLedgerIndex(chain: readonly LedgerEntry[]): string {
  const lines = [
    "# The ledger",
    "",
    "Generated from `corpus/ledger/records/`; do not edit. Each entry is one file under that directory; the witnesses the entries name are frozen under `corpus/ledger/witnesses/` at their recorded paths. The first chain and the ledger before it are in git (removed from the tree on 2026-09-13).",
    "",
  ];
  for (const entry of chain) {
    lines.push(`## ${entry.date}: ${entry.id} (${entry.kind})`, "");
    const changes: readonly {
      readonly reason: string;
      readonly retirement?: { readonly replacement: string | null } | undefined;
    }[] = entry.raw.changes;
    entry.subjects.forEach((subject, index) => {
      const change = changes[index];
      const reason = change?.reason ?? "";
      const retired =
        change?.retirement === undefined
          ? ""
          : ` (retired${change.retirement.replacement === null ? "" : `; replaced by ${change.retirement.replacement}`})`;
      lines.push(`- **${subject}**${retired}: ${reason.replace(/\s+/g, " ")}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * A Markdown table padded as the gate's formatter pads it (every cell to
 * its column's width, the separator dashes filling it), so a rendered view
 * is byte-stable under the formatter.
 */
function markdownTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((cell, index) =>
    Math.max(3, cell.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? 3)).join(" | ")} |`;
  return [
    line(header),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

/** A unit family's provenance page: every unit entry that touched it, or the sentence that none has. */
export function renderFamilyProvenance(family: string, chain: readonly LedgerEntry[]): string {
  const lines = [
    `# ${family}: provenance`,
    "",
    "Generated from `corpus/ledger/records/`; do not edit.",
    "",
  ];
  const touching = chain.filter(
    (entry) =>
      entry.version === 3 && entry.kind === "unit" && entry.subjects.includes(`family:${family}`),
  );
  if (touching.length === 0) {
    lines.push(
      "No entry touches this family yet: its units predate the ledger, and the sources read for them stand in the sources register's frozen appendix.",
      "",
    );
    return lines.join("\n");
  }
  for (const entry of touching) {
    if (entry.version !== 3 || entry.raw.kind !== "unit") continue;
    const change = entry.raw.changes.find((item) => item.family === family);
    if (change === undefined) continue;
    lines.push(
      `## ${entry.date}: ${entry.id}`,
      "",
      `Origin: digest \`${change.origin.digest}\`, ${change.origin.pin}. ${change.reason.replace(/\s+/g, " ")}`,
      "",
    );
    if (change.spans.length > 0)
      lines.push(
        markdownTable(
          ["Span", "Disposition"],
          change.spans.map((span) => [span.lines, span.disposition]),
        ),
        "",
      );
    lines.push(
      markdownTable(
        ["Unit", "Grade", "Revision"],
        change.units.map((unit) => [`\`${unit.id}\``, unit.grade, unit.revision.slice(0, 12)]),
      ),
      "",
    );
  }
  return lines.join("\n");
}

/**
 * The sources register as a view: every source the entries name since the
 * ledger, then the rows as they stood before it, frozen (the ruling D7).
 */
export function renderSourcesRegister(chain: readonly LedgerEntry[], appendix: string): string {
  const rows: string[][] = [];
  for (const entry of chain) {
    if (entry.version !== 3) continue;
    const raw = entry.raw;
    if (raw.kind === "copy")
      for (const change of raw.changes)
        if (!("retirement" in change))
          rows.push([
            `${change.source.repo} at \`${change.source.commit.slice(0, 12)}\` (${change.source.license})`,
            `in the product as the \`${change.skill}\` roster skill`,
            `\`${entry.id}\``,
            entry.date,
          ]);
    if (raw.kind === "native")
      for (const change of raw.changes)
        if ("digest" in change.origin)
          rows.push([
            `digest \`${change.origin.digest}\`, ${change.origin.pin}`,
            "skill" in change.subject
              ? `in the product as the \`${change.subject.skill}\` roster skill`
              : "in the product as the block",
            `\`${entry.id}\``,
            entry.date,
          ]);
    if (raw.kind === "unit")
      for (const change of raw.changes)
        rows.push([
          `digest \`${change.origin.digest}\`, ${change.origin.pin}`,
          // A read with no span and no unit is a source read against the family and rejected (the ruling D7).
          change.spans.length === 0 && change.units.length === 0
            ? `read against the \`${change.family}\` unit family and rejected`
            : `in the product as the \`${change.family}\` unit family`,
          `\`${entry.id}\``,
          entry.date,
        ]);
  }
  return [
    "# Sources",
    "",
    "This register is a view of the ledger, rendered by `node scripts/ledger.mjs render` and never edited: first every source an entry has named since 2026-09-16, then the rows as they stood before the ledger, frozen as an appendix (the ruling D7 of 2026-09-16). A source's standing is the entry that names it; a source read and rejected is a unit entry against the family it was read for, with no span and no unit, listed here as rejected.",
    "",
    "## From the ledger",
    "",
    rows.length === 0
      ? "No entry names a source yet."
      : markdownTable(["Source", "Standing", "Entry", "Date"], rows),
    "",
    "## Before the ledger, frozen on 2026-09-16",
    "",
    "These rows are the register as it stood, kept byte for byte; a source's standing since then is in the table above.",
    "",
    appendix.trimEnd(),
    "",
  ].join("\n");
}

/** One preserved family as the notices name it. */
export interface NoticesFamily {
  readonly name: string;
  readonly repo: string;
  readonly commit: string;
  /** The copyright line: the licence file's, or the manifest's holder for a family whose snapshot carries none. */
  readonly copyright: string;
  readonly methods: readonly { readonly name: string; readonly optIn: boolean }[];
}

/** What the notices view is rendered from: the families, the MIT permission text, and the credits opt-in copies carry. */
export interface NoticesInput {
  readonly families: readonly NoticesFamily[];
  readonly permission: string;
  readonly credits: readonly {
    readonly skill: string;
    readonly optIn: boolean;
    readonly text: string;
  }[];
}

/** The consumer notices as a view of the families, their terms and their copies (the ruling D8). */
export function renderNotices(input: NoticesInput): string {
  const repoName = (repo: string) => repo.replace(/\/$/, "").split("/").pop() ?? repo;
  const rows = input.families.map((family) => [
    `\`${family.name}\``,
    `[${repoName(family.repo)}](${family.repo}) at \`${family.commit}\``,
    `MIT; ${family.copyright}`,
    family.methods
      .map((method) => `\`${method.name}\`${method.optIn ? " (opt-in)" : ""}`)
      .join(", "),
  ]);
  const credits = input.credits.map(
    (credit) => `The \`${credit.skill}\`${credit.optIn ? " (opt-in)" : ""} ${credit.text}`,
  );
  return [
    "# Third-party notices for greenline",
    "",
    "These notices cover the methods and optional assets distributed with greenline",
    "and copied into a consumer repository. They identify every distributed source family,",
    "including optional methods. greenline is independent and implies no upstream",
    "endorsement. Its own license does not replace the source-specific terms below.",
    "This file is rendered from greenline's ledger and never edited by hand.",
    "",
    "## Preserved source families",
    "",
    markdownTable(
      ["Family", "Source and revision", "Terms and attribution", "Methods (installed names)"],
      rows,
    ),
    "",
    "The method names above join each installed copy to its source family and terms.",
    "Optional methods are listed even when a repository does not install them.",
    "Native methods are governed by greenline’s own license.",
    "",
    "Each method is an edited copy of its source: the steps and support are the",
    "author's, and every difference from the source (homes, names, handoffs, harness",
    "mechanics, scope) is recorded with its reason beside the copy. Any change to an",
    "author's own steps is recorded with the operator's ruling. Source rights travel",
    "with these copies; preserve this notice with copied methods.",
    "",
    ...(credits.length > 0
      ? ["## Credits within optional assets", "", ...credits.flatMap((line) => [line, ""])]
      : []),
    "## MIT License",
    "",
    "The following text applies to every source family above.",
    "",
    input.permission.trimEnd(),
    "",
  ].join("\n");
}
