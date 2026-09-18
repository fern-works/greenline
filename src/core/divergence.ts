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
import type { TextHunk } from "./diff.ts";

/**
 * The divergence ledger (ADR 0039, `docs/SPEC.md` §10). A vendored copy
 * differs from its frozen upstream by measured hunks; a record claims
 * each hunk under an edit with a kind and a reason, and retires hunks
 * upstream absorbed. Records form one append-only chain with one
 * baseline. The gate refuses a live hunk no record claims, a claimed
 * hunk that is not live, and a method edit without its authority.
 */

/** A source identity covers every preserved file, independently of the copy. */
export interface DivergenceSource {
  readonly repo: string;
  readonly commit: string;
  readonly path: string;
  readonly revision: string;
}

/** Why a hunk exists. Only `method` changes what the method does and needs the operator's ruling. */
export type EditKind =
  | "rename"
  | "harness"
  | "location"
  | "lifecycle"
  | "dependency"
  | "vocabulary"
  | "scope"
  | "correction"
  | "method";

export const EDIT_KINDS = [
  "rename",
  "harness",
  "location",
  "lifecycle",
  "dependency",
  "vocabulary",
  "scope",
  "correction",
  "method",
] as const;

/** One reasoned edit claiming one or more measured hunks. */
export interface DivergenceEdit {
  readonly kind: EditKind;
  readonly reason: string;
  readonly hunks: readonly string[];
}

/** A hunk that stopped being live, with the reason (usually: upstream absorbed it). */
export interface DivergenceRetirement {
  readonly hunk: string;
  readonly reason: string;
}

/** The operator's ruling a method edit rests on, witnessed by a file's digest. */
export interface DivergenceAuthority {
  readonly path: string;
  readonly revision: string;
  readonly reason: string;
}

/** One skill's change in one contribution: what the copy looks like now and why. */
export interface DivergenceChange {
  readonly skill: string;
  readonly source: DivergenceSource;
  readonly result: string;
  readonly reason: string;
  readonly edits: readonly DivergenceEdit[];
  readonly retired: readonly DivergenceRetirement[];
  readonly authority?: DivergenceAuthority | undefined;
}

/** Pointers from a record to the review, acquisition, decision or execution account behind it. */
export interface DivergenceLinks {
  readonly acquisition?: string | undefined;
  readonly review?: string | undefined;
  readonly decision?: string | undefined;
  readonly execution?: string | undefined;
}

/** Append-only; never a runtime replay log. */
export interface DivergenceRecord {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly date: string;
  readonly previous: { readonly id: string; readonly revision: string } | null;
  readonly links: DivergenceLinks;
  readonly changes: readonly DivergenceChange[];
}

/** What the manifest pins for one vendored skill, beside what is measured now. */
export interface DivergenceState {
  readonly skill: string;
  readonly record: { readonly id: string; readonly revision: string };
  readonly source: DivergenceSource;
  readonly result: string;
  readonly hunks: readonly string[];
}

const text = z.string().trim().min(1);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const hunkId = z.string().regex(/^h:[a-f0-9]{16}(#[1-9][0-9]*)?$/);
const path = text.refine(isRepositoryPath, "a relative record path without traversal");
const reference = z.object({ id, revision: hash }).strict();
const sourceSchema = z
  .object({ repo: z.url(), commit: z.string().regex(/^[a-f0-9]{40}$/), path, revision: hash })
  .strict();
const editSchema = z
  .object({ kind: z.enum(EDIT_KINDS), reason: text, hunks: z.array(hunkId).min(1) })
  .strict();
const retirementSchema = z.object({ hunk: hunkId, reason: text }).strict();
const authoritySchema = z.object({ path, revision: hash, reason: text }).strict();
const changeSchema = z
  .object({
    skill: id,
    source: sourceSchema,
    result: hash,
    reason: text,
    edits: z.array(editSchema),
    retired: z.array(retirementSchema),
    authority: authoritySchema.optional(),
  })
  .strict()
  .refine(
    (change) =>
      change.edits.every((edit) => edit.kind !== "method") || change.authority !== undefined,
    "a method edit requires the operator's authority witness",
  );
const recordSchema = z
  .object({
    schemaVersion: z.literal(2),
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
      .strict(),
    changes: z.array(changeSchema).min(1),
  })
  .strict();

/**
 * Parse one record; refuse two changes for one skill and one hunk claimed
 * twice or retired twice in a change. A hunk both retired and claimed in
 * one change is a re-kind: the earlier claim is retired and the hunk is
 * claimed again with its new kind and reason.
 */
export function parseDivergenceRecord(
  input: string,
  source: string,
): Result<DivergenceRecord, ContractParseFailed> {
  const parsed = recordSchema.safeParse(parseJson(input));
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const issues: InvalidField[] = [];
  if (
    new Set(parsed.data.changes.map((change) => change.skill)).size !== parsed.data.changes.length
  )
    issues.push({ path: "changes", message: "one change per skill in a contribution" });
  for (const change of parsed.data.changes) {
    for (const [label, hunks] of [
      ["claimed", change.edits.flatMap((edit) => edit.hunks)],
      ["retired", change.retired.map((entry) => entry.hunk)],
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
  return issues.length > 0 ? contractFailure(source, issues) : contractOk(parsed.data);
}

/** A record pin follows its content, while presentation-only JSON formatting can vary. */
export function divergenceRevision(record: DivergenceRecord): string {
  return sha256Hex(JSON.stringify(record));
}

/**
 * The chain from baseline to tip, or the reasons it is not one chain:
 * duplicate ids, no single baseline, a branch, a missing or changed
 * predecessor, a cycle, a detached record.
 */
export interface DivergenceChain {
  readonly chain: readonly DivergenceRecord[];
  readonly issues: readonly InvalidField[];
}

export function orderDivergenceRecords(records: readonly DivergenceRecord[]): DivergenceChain {
  const issues: InvalidField[] = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length)
    issues.push({ path: "records", message: "duplicate divergence record identity" });
  const baselines = records.filter((record) => record.previous === null);
  if (records.length > 0 && baselines.length !== 1)
    issues.push({ path: "records", message: "divergence records require one connected baseline" });
  const successor = new Map<string, DivergenceRecord>();
  for (const record of records) {
    const previous = record.previous;
    if (previous === null) continue;
    if (successor.has(previous.id))
      issues.push({
        path: record.id,
        message: "divergence history branches; append to the current tip",
      });
    successor.set(previous.id, record);
    const predecessor = byId.get(previous.id);
    if (predecessor === undefined || divergenceRevision(predecessor) !== previous.revision)
      issues.push({
        path: record.id,
        message: "the preceding divergence record is missing or changed",
      });
  }
  const chain: DivergenceRecord[] = [];
  const visited = new Set<string>();
  let cursor = baselines[0];
  while (cursor !== undefined) {
    if (visited.has(cursor.id)) {
      issues.push({ path: cursor.id, message: "cyclic divergence history" });
      break;
    }
    visited.add(cursor.id);
    chain.push(cursor);
    cursor = successor.get(cursor.id);
  }
  if (issues.length === 0 && chain.length !== records.length)
    issues.push({ path: "records", message: "a divergence record is detached from the chain" });
  return { chain, issues };
}

/** Which edit, in which record, claims a hunk that is live after replaying the chain. */
export interface HunkClaim {
  readonly record: string;
  readonly kind: EditKind;
  readonly reason: string;
}

/** The live claims for one skill after replaying the chain, and any wrong step met on the way. */
export interface ClaimReplay {
  readonly claims: ReadonlyMap<string, HunkClaim>;
  readonly issues: readonly InvalidField[];
}

/** Replay the chain for one skill: claims accumulate, retirements remove; a wrong step is an issue. */
export function replayClaims(chain: readonly DivergenceRecord[], skill: string): ClaimReplay {
  const claims = new Map<string, HunkClaim>();
  const issues: InvalidField[] = [];
  for (const record of chain) {
    const change = record.changes.find((entry) => entry.skill === skill);
    if (change === undefined) continue;
    for (const retirement of change.retired) {
      if (!claims.delete(retirement.hunk))
        issues.push({
          path: skill,
          message: `${record.id} retires ${retirement.hunk}, which no earlier record claimed`,
        });
    }
    for (const edit of change.edits)
      for (const hunk of edit.hunks) {
        if (claims.has(hunk))
          issues.push({
            path: skill,
            message: `${record.id} claims ${hunk}, which an earlier record already claims`,
          });
        claims.set(hunk, { record: record.id, kind: edit.kind, reason: edit.reason });
      }
  }
  return { claims, issues };
}

/**
 * Verify the chain and every pinned state: the pin names the latest
 * record touching the skill, that record's source and result match what
 * is measured, and the replayed claims cover exactly the live hunks.
 */
export function auditDivergenceRecords(
  records: readonly DivergenceRecord[],
  current: readonly DivergenceState[],
): readonly InvalidField[] {
  const ordered = orderDivergenceRecords(records);
  if (ordered.issues.length > 0) return ordered.issues;
  const issues: InvalidField[] = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const state of current) {
    const record = byId.get(state.record.id);
    if (record === undefined || divergenceRevision(record) !== state.record.revision) {
      issues.push({ path: state.skill, message: "pinned divergence record is missing or changed" });
      continue;
    }
    const change = record.changes.find((entry) => entry.skill === state.skill);
    if (change === undefined) {
      issues.push({ path: state.skill, message: "pinned divergence record has no change for it" });
      continue;
    }
    const latest = [...ordered.chain]
      .reverse()
      .find((entry) => entry.changes.some((candidate) => candidate.skill === state.skill));
    if (latest !== undefined && latest.id !== record.id)
      issues.push({
        path: state.skill,
        message: "manifest must pin the latest recorded state for this skill",
      });
    if (
      change.source.repo !== state.source.repo ||
      change.source.commit !== state.source.commit ||
      change.source.path !== state.source.path ||
      change.source.revision !== state.source.revision
    )
      issues.push({ path: state.skill, message: "upstream source differs from the pinned record" });
    if (change.result !== state.result)
      issues.push({ path: state.skill, message: "the copy differs from its pinned record" });
    const replay = replayClaims(ordered.chain, state.skill);
    issues.push(...replay.issues);
    const live = new Set(state.hunks);
    for (const hunk of live)
      if (!replay.claims.has(hunk))
        issues.push({ path: state.skill, message: `hunk ${hunk} is live and no record claims it` });
    for (const hunk of replay.claims.keys())
      if (!live.has(hunk))
        issues.push({ path: state.skill, message: `hunk ${hunk} is claimed and no longer live` });
  }
  return issues;
}

/** What one skill's PROVENANCE.md is rendered from. */
export interface SkillDivergenceInput {
  readonly skill: string;
  readonly source: DivergenceSource;
  readonly hunks: readonly TextHunk[];
  readonly upstreamLines: number;
}

const HUNK_LINE_CAP = 60;

function hunkDiff(hunk: TextHunk): readonly string[] {
  if (hunk.kind !== "changed") {
    const count = hunk.kind === "added" ? hunk.added.length : hunk.removed.length;
    return [`${hunk.kind === "added" ? "Added" : "Removed"} file, ${count} lines.`];
  }
  const body = [...hunk.removed.map((line) => `-${line}`), ...hunk.added.map((line) => `+${line}`)];
  const shown = body.slice(0, HUNK_LINE_CAP);
  const rest = body.length - shown.length;
  return ["```diff", ...shown, ...(rest > 0 ? [`(${rest} more lines)`] : []), "```"];
}

/**
 * Generate one skill's readable divergence page from the chain and its
 * measured hunks: the source pin, the drift figure, one section per
 * edit with its hunks as diffs, and the retirements.
 */
export function renderSkillDivergence(
  input: SkillDivergenceInput,
  chain: readonly DivergenceRecord[],
): string {
  const replay = replayClaims(chain, input.skill);
  const changed = input.hunks.reduce(
    (sum, hunk) => sum + hunk.removed.length + hunk.added.length,
    0,
  );
  const percent = input.upstreamLines === 0 ? 0 : Math.round((changed / input.upstreamLines) * 100);
  const touching = chain.filter((record) =>
    record.changes.some((change) => change.skill === input.skill),
  );
  const lines = [
    `# ${input.skill}: differences from upstream`,
    "",
    "Generated from `corpus/ledger/records/`; do not edit.",
    "",
    `Source: ${input.source.repo} at ${input.source.commit}, \`${input.source.path}\`. Drift: ${changed} of ${input.upstreamLines} lines changed (${percent}%). Records: ${touching.map((record) => record.id).join(", ")}.`,
    "",
  ];
  const groups = new Map<string, { readonly claim: HunkClaim; readonly hunks: TextHunk[] }>();
  const unclaimed: TextHunk[] = [];
  for (const hunk of input.hunks) {
    const claim = replay.claims.get(hunk.id);
    if (claim === undefined) {
      unclaimed.push(hunk);
      continue;
    }
    const key = `${claim.record} ${claim.kind} ${claim.reason}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { claim, hunks: [hunk] });
    else group.hunks.push(hunk);
  }
  for (const group of groups.values()) {
    const count = group.hunks.length;
    lines.push(
      `## ${group.claim.kind}: ${group.claim.reason.replace(/\s+/g, " ")}`,
      "",
      `Record \`${group.claim.record}\`, ${count} hunk${count === 1 ? "" : "s"}.`,
      "",
    );
    for (const hunk of group.hunks)
      lines.push(`### \`${hunk.id}\` in \`${hunk.path}\``, "", ...hunkDiff(hunk), "");
  }
  if (unclaimed.length > 0) {
    lines.push("## Unclaimed", "");
    for (const hunk of unclaimed) lines.push(`- \`${hunk.id}\` in \`${hunk.path}\``);
    lines.push("");
  }
  const retirements = touching.flatMap((record) =>
    (record.changes.find((change) => change.skill === input.skill)?.retired ?? []).map(
      (entry) => `- \`${entry.hunk}\` in \`${record.id}\`: ${entry.reason.replace(/\s+/g, " ")}`,
    ),
  );
  if (retirements.length > 0) lines.push("## Retired", "", ...retirements, "");
  return lines.join("\n");
}
