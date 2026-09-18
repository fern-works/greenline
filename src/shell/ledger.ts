import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  type ContractParseFailed,
  type InvalidField,
} from "../core/contract.ts";
import { isVendored, type CorpusManifest } from "../core/corpus.ts";
import { renderSkillDivergence, type DivergenceState } from "../core/divergence.ts";
import {
  auditCopies,
  auditPins,
  authorityClaims,
  copyChainOf,
  ledgerTip,
  orderLedger,
  parseLedgerEntry,
  renderFamilyProvenance,
  renderLedgerIndex,
  renderNotices,
  renderSourcesRegister,
  type LedgerEntry,
  type LedgerEntryV3,
  type LedgerReference,
  type SubjectPin,
} from "../core/ledger.ts";
import { GENERATED_PROVENANCE_PAGE, loadCorpusManifest } from "./corpus.ts";
import { digestIssues, originIssues, readDigestRegistry } from "./digests.ts";
import {
  measureDivergence,
  readAuthorityWitness,
  WITNESSES,
  type MeasuredSkill,
} from "./divergence.ts";
import type { FileWrite } from "./fs/apply.ts";

/**
 * The ledger on disk (workshop/components/ledger.md): one file per entry,
 * named by its id; the frozen witnesses at their recorded paths; the
 * generated index. Nothing here writes: every function that changes the
 * tree returns the writes for the caller to apply as one plan.
 */
/** The entries' directory under the corpus root, one file per entry named by its id. */
export const LEDGER_RECORDS = "ledger/records";
/** The witness tree under the corpus root, where a frozen file sits at its recorded path. */
export const LEDGER_WITNESSES: typeof WITNESSES = WITNESSES;
/** The generated index under the corpus root. */
export const LEDGER_INDEX = "ledger/INDEX.md";
/** The unit families' directory under the corpus root; each family's reshape record carries its pin. */
const UNITS = "units";
/** The sources register's rows as they stood before the ledger, frozen on 2026-09-16 (the ruling D7); the view appends them. */
export const SOURCES_APPENDIX = "ledger/sources-before-the-ledger.md";
/** The frozen appendix's digest; a changed appendix is refused. */
const SOURCES_APPENDIX_REVISION =
  "93069a6213ffd1f573afa13388fbbd3895b51cd2da1f8e5e398a610fab02dfc5";

/** Every entry under the records directory, of either version, unordered. */
export function readLedger(
  corpusRoot: string,
): Result<readonly LedgerEntry[], ContractParseFailed> {
  const directory = join(corpusRoot, LEDGER_RECORDS);
  const entries: LedgerEntry[] = [];
  try {
    if (!existsSync(directory)) return contractOk([]);
    for (const name of readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()) {
      const path = join(directory, name);
      const parsed = parseLedgerEntry(readFileSync(path, "utf8"), path);
      if (parsed._tag === "err") return parsed;
      if (name !== `${parsed.value.id}.json`)
        return contractFailure(path, [
          { path: "id", message: "a ledger entry's identity must match its filename" },
        ]);
      entries.push(parsed.value);
    }
  } catch (cause) {
    return contractFailure(directory, [
      { path: "", message: `could not read the ledger: ${String(cause)}` },
    ]);
  }
  return contractOk(entries);
}

/** The chain in order, or the ordering's issues as the failure. */
export function readChain(corpusRoot: string): Result<readonly LedgerEntry[], ContractParseFailed> {
  const entries = readLedger(corpusRoot);
  if (entries._tag === "err") return entries;
  const ordered = orderLedger(entries.value);
  return ordered.issues.length > 0
    ? contractFailure(join(corpusRoot, LEDGER_RECORDS), ordered.issues)
    : contractOk(ordered.chain);
}

/** A witness frozen from the live file: its recorded path, the write under the witness tree and the digest an authority records. */
export interface FrozenWitness {
  readonly recorded: string;
  readonly write: FileWrite;
  readonly revision: string;
}

/**
 * Every witness the chain names is frozen at its recorded path with its
 * recorded digest. A witness in `pending` is one the same plan freezes
 * (`freezeWitness`), consulted by its recorded path before the tree.
 */
function ledgerWitnessIssues(
  corpusRoot: string,
  chain: readonly LedgerEntry[],
  pending: readonly FrozenWitness[] = [],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  for (const entry of chain)
    for (const claim of authorityClaims(entry)) {
      const frozen = pending.find((item) => item.recorded === claim.authority.path);
      if (frozen !== undefined) {
        if (frozen.revision !== claim.authority.revision)
          issues.push({
            path: claim.subject,
            message: `${entry.id}: the authority's revision is not the frozen file's digest`,
          });
        continue;
      }
      const witness = readAuthorityWitness(corpusRoot, claim.authority.path);
      if (witness._tag === "err")
        issues.push({
          path: claim.subject,
          message: `${entry.id}: authority witness is unavailable: ${witness.error.message}`,
        });
      else if (sha256Hex(witness.value) !== claim.authority.revision)
        issues.push({ path: claim.subject, message: `${entry.id}: authority witness changed` });
    }
  return issues;
}

/**
 * Freeze one live file as a witness at its own path. A path is frozen once:
 * a frozen witness whose bytes differ from the live file is refused, since
 * the entries that name it hash its digest.
 */
export function freezeWitness(
  repositoryRoot: string,
  corpusRoot: string,
  recorded: string,
): Result<FrozenWitness, ContractParseFailed> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(repositoryRoot, recorded));
  } catch (cause) {
    return contractFailure(recorded, [
      { path: recorded, message: `the file to freeze could not be read: ${String(cause)}` },
    ]);
  }
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return contractFailure(recorded, [
      { path: recorded, message: "a witness is text; the file is not valid UTF-8" },
    ]);
  }
  const revision = sha256Hex(bytes);
  const frozen = readAuthorityWitness(corpusRoot, recorded);
  if (frozen._tag === "ok" && sha256Hex(frozen.value) !== revision)
    return contractFailure(recorded, [
      {
        path: recorded,
        message: "a witness is frozen once; the frozen bytes differ from the live file",
      },
    ]);
  return contractOk({
    recorded,
    write: { path: join(corpusRoot, WITNESSES, recorded), content },
    revision,
  });
}

/** One vendored copy measured against its frozen upstream. */
export function measureSubject(
  corpusRoot: string,
  skill: string,
): Result<MeasuredSkill, ContractParseFailed> {
  const measured = measureDivergence(corpusRoot);
  if (measured._tag === "err") return measured;
  const item = measured.value.find((candidate) => candidate.skill === skill);
  return item === undefined
    ? contractFailure(corpusRoot, [{ path: skill, message: "no vendored copy by that name" }])
    : contractOk(item);
}

/** One unit family as measured: its pin from its reshape record, and each unit file's digest. */
export interface MeasuredFamily {
  readonly family: string;
  readonly pin: LedgerReference | undefined;
  readonly units: readonly { readonly id: string; readonly revision: string }[];
}

// The reshape record is read for its pin only; every other field passes through untouched.
const familyRecord = z
  .object({ ledger: z.object({ id: z.string(), revision: z.string() }).strict().optional() })
  .loose();

/** A family's reshape record, the file this shell moves the pin in. */
function familyRecordPath(corpusRoot: string, family: string): string {
  return join(corpusRoot, UNITS, family, "reshape.json");
}

/**
 * Measure one unit family: the units are the Markdown files whose names
 * start in lower case (a generated page starts in upper case), each at
 * its digest; the pin is the reshape record's `ledger` field.
 */
export function measureFamily(
  corpusRoot: string,
  family: string,
): Result<MeasuredFamily, ContractParseFailed> {
  const directory = join(corpusRoot, UNITS, family);
  const record = familyRecordPath(corpusRoot, family);
  if (!existsSync(record))
    return contractFailure(corpusRoot, [{ path: family, message: "no unit family by that name" }]);
  try {
    const parsed = familyRecord.safeParse(JSON.parse(readFileSync(record, "utf8")));
    if (!parsed.success)
      return contractFailure(record, [
        { path: family, message: "the reshape record's pin is malformed" },
      ]);
    const units = readdirSync(directory, { withFileTypes: true })
      .filter((item) => item.isFile() && item.name.endsWith(".md") && /^[a-z]/.test(item.name))
      .map((item) => item.name)
      .sort()
      .map((name) => ({
        id: name.slice(0, -3),
        revision: sha256Hex(readFileSync(join(directory, name))),
      }));
    return contractOk({ family, pin: parsed.data.ledger, units });
  } catch (cause) {
    return contractFailure(directory, [
      { path: family, message: `could not read the family: ${String(cause)}` },
    ]);
  }
}

/** Every unit family under the corpus root: the directories that carry a reshape record. */
export function measureFamilies(
  corpusRoot: string,
): Result<readonly MeasuredFamily[], ContractParseFailed> {
  const root = join(corpusRoot, UNITS);
  if (!existsSync(root)) return contractOk([]);
  const families: MeasuredFamily[] = [];
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (!item.isDirectory() || !existsSync(familyRecordPath(corpusRoot, item.name))) continue;
    const measured = measureFamily(corpusRoot, item.name);
    if (measured._tag === "err") return measured;
    families.push(measured.value);
  }
  return contractOk(families);
}

function copyStates(
  corpusRoot: string,
  measured: readonly MeasuredSkill[],
): Result<readonly DivergenceState[], ContractParseFailed> {
  const states: DivergenceState[] = [];
  for (const item of measured) {
    if (item.record === undefined)
      return contractFailure(corpusRoot, [
        { path: item.skill, message: "copy has no pinned ledger entry" },
      ]);
    states.push({
      skill: item.skill,
      record: item.record,
      source: item.source,
      result: item.result,
      hunks: item.hunks.map((hunk) => hunk.id),
    });
  }
  return contractOk(states);
}

/** The subjects outside the copy audit that carry no pin: native skills without one in the manifest, families without one in their reshape record. */
function unpinnedSubjects(
  manifest: CorpusManifest,
  families: readonly MeasuredFamily[],
): readonly string[] {
  return [
    ...manifest.skills.flatMap((entry) =>
      entry.ledger === undefined && !isVendored(entry) ? [`skill:${entry.name}`] : [],
    ),
    ...families.flatMap((family) => (family.pin === undefined ? [`family:${family.family}`] : [])),
  ];
}

/** The pins that exist outside the copy audit: a native skill's in the manifest, a family's in its reshape record. */
function otherPins(
  manifest: CorpusManifest,
  families: readonly MeasuredFamily[],
): readonly SubjectPin[] {
  return [
    ...manifest.skills.flatMap((entry) =>
      entry.ledger === undefined || isVendored(entry)
        ? []
        : [{ subject: `skill:${entry.name}`, pin: entry.ledger }],
    ),
    ...families.flatMap((family) =>
      family.pin === undefined ? [] : [{ subject: `family:${family.family}`, pin: family.pin }],
    ),
  ];
}

/**
 * The views a valid state carries, rendered from the chain and the trees
 * (workshop/components/ledger.md, "The views"): the index; one provenance
 * page per vendored copy and per unit family; the sources register with
 * its frozen appendix; the consumer notices. The corpus root sits under
 * the repository root, where the register and the notices live.
 */
export function renderLedgerViews(
  corpusRoot: string,
  chain: readonly LedgerEntry[],
  measured: readonly MeasuredSkill[],
  families: readonly MeasuredFamily[],
  manifest: CorpusManifest,
): Result<readonly FileWrite[], ContractParseFailed> {
  const repositoryRoot = dirname(corpusRoot);
  const records = copyChainOf(chain);
  let appendix: string;
  try {
    appendix = readFileSync(join(corpusRoot, SOURCES_APPENDIX), "utf8");
  } catch (cause) {
    return contractFailure(corpusRoot, [
      {
        path: SOURCES_APPENDIX,
        message: `the frozen appendix could not be read: ${String(cause)}`,
      },
    ]);
  }
  if (sha256Hex(appendix) !== SOURCES_APPENDIX_REVISION)
    return contractFailure(corpusRoot, [
      { path: SOURCES_APPENDIX, message: "the frozen appendix changed; it is kept byte for byte" },
    ]);
  // The chain is the notices' authority for each family's source: the latest
  // copy entry of any of its copies names the repository and the commit; the
  // manifest supplies membership, the credits and, for a family whose
  // snapshot carries no licence file, the copyright line as holder; a
  // disagreement between the chain and the manifest is refused.
  const latestSource = (skill: string) => {
    for (const entry of [...chain].reverse()) {
      if (entry.kind !== "copy" || !entry.subjects.includes(`skill:${skill}`)) continue;
      if (entry.version === 2)
        return entry.raw.changes.find((item) => item.skill === skill)?.source;
      if (entry.raw.kind !== "copy") continue;
      const change = entry.raw.changes.find((item) => item.skill === skill);
      if (change === undefined || "retirement" in change) return undefined;
      return change.source;
    }
    return undefined;
  };
  const noticeFamilies = [];
  let permission = "";
  for (const family of manifest.upstreams) {
    const copies = manifest.skills.filter((skill) => skill.upstream?.family === family.name);
    for (const copy of copies) {
      const source = latestSource(copy.name);
      if (source === undefined)
        return contractFailure(corpusRoot, [
          { path: family.name, message: `no copy entry for ${copy.name} names its source` },
        ]);
      if (source.repo !== family.repo || source.commit !== family.commit)
        return contractFailure(corpusRoot, [
          {
            path: family.name,
            message: `the notices' source differs between the chain (${source.repo} at ${source.commit.slice(0, 12)}, for ${copy.name}) and the manifest (${family.repo} at ${family.commit.slice(0, 12)})`,
          },
        ]);
    }
    let copyright: string;
    const licencePath = join(corpusRoot, family.snapshot, "LICENSE");
    if (existsSync(licencePath)) {
      if (family.holder !== undefined)
        return contractFailure(corpusRoot, [
          {
            path: family.name,
            message:
              "the snapshot carries a licence file; its copyright line is the file's, not a holder",
          },
        ]);
      let licence: string;
      try {
        licence = readFileSync(licencePath, "utf8");
      } catch (cause) {
        return contractFailure(corpusRoot, [
          { path: family.name, message: `the licence file could not be read: ${String(cause)}` },
        ]);
      }
      const line = /^Copyright.*$/m.exec(licence)?.[0];
      const start = licence.indexOf("Permission is hereby granted");
      if (line === undefined || start < 0)
        return contractFailure(corpusRoot, [
          {
            path: family.name,
            message: "the licence file carries no copyright line or permission text",
          },
        ]);
      copyright = line;
      if (permission === "") permission = licence.slice(start).trim();
    } else if (family.holder !== undefined) copyright = family.holder;
    else
      return contractFailure(corpusRoot, [
        {
          path: family.name,
          message:
            "the snapshot carries no licence file and the manifest names no holder for its copyright line",
        },
      ]);
    noticeFamilies.push({
      name: family.name,
      repo: family.repo,
      commit: family.commit,
      copyright,
      methods: copies.map((skill) => ({ name: skill.name, optIn: skill.optIn === true })),
    });
  }
  if (permission === "")
    return contractFailure(corpusRoot, [
      { path: "upstreams", message: "no snapshot carries a licence file to supply the MIT text" },
    ]);
  const credits = manifest.skills.flatMap((skill) =>
    skill.credits === undefined
      ? []
      : [{ skill: skill.name, optIn: skill.optIn === true, text: skill.credits }],
  );
  return contractOk([
    { path: join(corpusRoot, LEDGER_INDEX), content: renderLedgerIndex(chain) },
    ...measured.map((item) => ({
      path: join(corpusRoot, "skills", item.skill, GENERATED_PROVENANCE_PAGE),
      content: renderSkillDivergence(item, records),
    })),
    ...families.map((family) => ({
      path: join(corpusRoot, UNITS, family.family, GENERATED_PROVENANCE_PAGE),
      content: renderFamilyProvenance(family.family, chain),
    })),
    {
      path: join(repositoryRoot, "docs/SOURCES.md"),
      content: renderSourcesRegister(chain, appendix),
    },
    {
      path: join(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
      content: renderNotices({ families: noticeFamilies, permission, credits }),
    },
  ]);
}

/**
 * The chain verified where its records stand (this checkout), or, in a tree
 * that carries the ledger's views and not the chain (the public tree,
 * workshop/components/public-export.md), the views checked: every vendored
 * copy pinned in the manifest with its provenance page beside it, and the
 * index present. The private gate verifies the chain on every run; a tree
 * without the records builds from bytes that gate verified.
 */
export function verifyLedgerOrViews(
  corpusRoot: string,
): Result<readonly LedgerEntry[], ContractParseFailed> {
  if (existsSync(join(corpusRoot, LEDGER_RECORDS))) return verifyLedger(corpusRoot);
  const manifest = loadCorpusManifest(corpusRoot);
  if (manifest._tag === "err")
    return contractFailure(corpusRoot, [{ path: "manifest", message: manifest.error.message }]);
  const issues: InvalidField[] = [];
  if (!existsSync(join(corpusRoot, LEDGER_INDEX)))
    issues.push({ path: LEDGER_INDEX, message: "the ledger index is absent" });
  for (const skill of manifest.value.skills) {
    if (!isVendored(skill)) continue;
    if (skill.ledger === undefined)
      issues.push({
        path: skill.name,
        message: "a vendored copy without a ledger pin cannot ship",
      });
    if (!existsSync(join(corpusRoot, "skills", skill.name, GENERATED_PROVENANCE_PAGE)))
      issues.push({ path: skill.name, message: "the copy's provenance page is absent" });
  }
  return issues.length > 0 ? contractFailure(corpusRoot, issues) : contractOk([]);
}

function auditIssues(
  corpusRoot: string,
  chain: readonly LedgerEntry[],
  manifest: CorpusManifest,
  families: readonly MeasuredFamily[],
  states: readonly DivergenceState[],
  pending: readonly FrozenWitness[] = [],
): readonly InvalidField[] {
  return [
    ...auditCopies(chain, states),
    ...auditPins(chain, otherPins(manifest, families), unpinnedSubjects(manifest, families)),
    ...ledgerWitnessIssues(corpusRoot, chain, pending),
  ];
}

/**
 * The gate's check. Refused now: a broken chain; a copy without a pin or
 * with a stale one; a live hunk no entry claims or a claimed hunk no
 * longer live; a stale pin on a native skill or a family; a witness
 * missing or changed; a private path (at the parse); a view that differs
 * from its render; the frozen appendix changed; a unit whose source ref
 * resolves to no row of the digest registry, a live note without its row
 * or its header, a historical row whose blob at its commit has another
 * digest, a digest origin that names no row or another pin; a native
 * skill or a family the chain records without a pin. A native skill or a family without a pin is
 * refused from the stage that records their entries (the ledger plan's
 * stage E), a unit's source ref from the same stage, and a snapshot's
 * publication entry from stage F; the component page names each.
 */
export function verifyLedger(
  corpusRoot: string,
): Result<readonly LedgerEntry[], ContractParseFailed> {
  const chain = readChain(corpusRoot);
  if (chain._tag === "err") return chain;
  const manifest = loadCorpusManifest(corpusRoot);
  if (manifest._tag === "err")
    return contractFailure(corpusRoot, [{ path: "manifest", message: manifest.error.message }]);
  const measured = measureDivergence(corpusRoot);
  if (measured._tag === "err") return measured;
  const families = measureFamilies(corpusRoot);
  if (families._tag === "err") return families;
  const states = copyStates(corpusRoot, measured.value);
  if (states._tag === "err") return states;
  const issues = [
    ...auditIssues(corpusRoot, chain.value, manifest.value, families.value, states.value),
    ...digestIssues(dirname(corpusRoot), corpusRoot),
  ];
  const registry = readDigestRegistry(corpusRoot);
  if (registry._tag === "ok") issues.push(...originIssues(chain.value, registry.value.rows));
  const views = renderLedgerViews(
    corpusRoot,
    chain.value,
    measured.value,
    families.value,
    manifest.value,
  );
  if (views._tag === "err") return views;
  for (const page of views.value) {
    try {
      if (readFileSync(page.path, "utf8") !== page.content)
        issues.push({ path: page.path, message: "the view is stale; render it" });
    } catch {
      issues.push({ path: page.path, message: "the view is missing; render it" });
    }
  }
  return issues.length > 0 ? contractFailure(corpusRoot, issues) : chain;
}

/** The skills whose manifest pin an entry moves: a copy's skills and a native entry's skill subjects. */
function pinnedSkills(entry: LedgerEntryV3): readonly string[] {
  switch (entry.kind) {
    case "copy":
      return entry.changes.flatMap((change) => ("retirement" in change ? [] : [change.skill]));
    case "native":
      return entry.changes.flatMap((change) =>
        "skill" in change.subject ? [change.subject.skill] : [],
      );
    default:
      return [];
  }
}

/** The families whose reshape-record pin a unit entry moves. */
function pinnedFamilies(entry: LedgerEntryV3): readonly string[] {
  return entry.kind === "unit" ? entry.changes.map((change) => change.family) : [];
}

/** A family's reshape record with its pin moved, the rest of the file passed through. */
function familyPinWrite(
  corpusRoot: string,
  family: string,
  pin: LedgerReference,
): Result<FileWrite, ContractParseFailed> {
  const path = familyRecordPath(corpusRoot, family);
  try {
    const parsed = familyRecord.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success)
      return contractFailure(path, [
        { path: family, message: "the reshape record's pin is malformed" },
      ]);
    return contractOk({
      path,
      content: `${JSON.stringify({ ...parsed.data, ledger: pin }, null, 2)}\n`,
    });
  } catch (cause) {
    return contractFailure(path, [
      { path: family, message: `could not read the reshape record: ${String(cause)}` },
    ]);
  }
}

/** The units an entry names, each checked against the tree at its revision. */
function unitIssues(
  entry: LedgerEntryV3,
  families: readonly MeasuredFamily[],
): readonly InvalidField[] {
  const issues: InvalidField[] = [];
  const byFamily = new Map(families.map((family) => [family.family, family]));
  const everywhere = new Map(
    families.flatMap((family) => family.units.map((unit) => [unit.id, unit.revision] as const)),
  );
  if (entry.kind === "unit")
    for (const change of entry.changes) {
      const family = byFamily.get(change.family);
      if (family === undefined) {
        issues.push({ path: change.family, message: "no unit family by that name" });
        continue;
      }
      const revisions = new Map(family.units.map((unit) => [unit.id, unit.revision]));
      for (const unit of change.units)
        if (revisions.get(unit.id) !== unit.revision)
          issues.push({
            path: change.family,
            message: `unit ${unit.id} is not in the family at that revision`,
          });
    }
  if (entry.kind === "publication")
    for (const change of entry.changes)
      for (const unit of change.units)
        if (everywhere.get(unit.id) !== unit.revision)
          issues.push({ path: change.snapshot, message: `no unit ${unit.id} at that revision` });
  return issues;
}

/**
 * Append one version-3 entry of any of the four kinds: refused when its
 * identity is taken, its predecessor is not the tip, a copy's stated
 * source, licence or result differs from what is measured, a retirement
 * names a skill the manifest still lists, whose copy still exists, that
 * the chain never recorded as a copy or already retired, or names a
 * replacement off the roster, a unit or a publication names a unit the
 * tree does not hold at that revision, or the extended chain does not
 * audit clean. The witnesses the entry names
 * are the ones in `frozen`, from `freezeWitness`, or already in the tree.
 * The writes, one plan in this order: the frozen witnesses, the manifest
 * when a skill's pin moves, each reshape record when a family's pin
 * moves, the regenerated views, and the entry last, so a plan that stops
 * before the entry lands converges on a retry. A snapshot's pin is the
 * cabinet's publication log, outside this tree.
 */
export function appendEntry(
  corpusRoot: string,
  entry: LedgerEntryV3,
  frozen: readonly FrozenWitness[] = [],
): Result<readonly FileWrite[], ContractParseFailed> {
  const parsed = parseLedgerEntry(JSON.stringify(entry), entry.id);
  if (parsed._tag === "err") return parsed;
  const existing = readChain(corpusRoot);
  if (existing._tag === "err") return existing;
  if (existing.value.some((item) => item.id === entry.id))
    return contractFailure(entry.id, [
      { path: "id", message: "a ledger entry is immutable; use a new identity" },
    ]);
  const tip = ledgerTip(existing.value);
  const atTip =
    tip === undefined
      ? entry.previous === null
      : entry.previous?.id === tip.id && entry.previous.revision === tip.revision;
  if (!atTip)
    return contractFailure(entry.id, [
      {
        path: "previous",
        message: `the predecessor must be the tip: ${tip === undefined ? "none" : `${tip.id} at ${tip.revision}`}`,
      },
    ]);
  const extended = orderLedger([...existing.value, parsed.value]);
  if (extended.issues.length > 0) return contractFailure(entry.id, extended.issues);
  const manifest = loadCorpusManifest(corpusRoot);
  if (manifest._tag === "err")
    return contractFailure(corpusRoot, [{ path: "manifest", message: manifest.error.message }]);
  const measured = measureDivergence(corpusRoot);
  if (measured._tag === "err") return measured;
  const families = measureFamilies(corpusRoot);
  if (families._tag === "err") return families;
  const pin = { id: parsed.value.id, revision: parsed.value.revision };
  const touched = new Set(pinnedSkills(entry));
  for (const name of touched)
    if (!manifest.value.skills.some((item) => item.name === name))
      return contractFailure(entry.id, [
        { path: name, message: "no skill by that name in the manifest" },
      ]);
  if (entry.kind === "copy")
    for (const change of entry.changes) {
      if ("retirement" in change) {
        if (manifest.value.skills.some((item) => item.name === change.skill))
          return contractFailure(entry.id, [
            {
              path: change.skill,
              message: `the manifest still lists ${change.skill}; a retirement records a skill that has left the roster`,
            },
          ]);
        if (existsSync(join(corpusRoot, "skills", change.skill)))
          return contractFailure(entry.id, [
            {
              path: change.skill,
              message: `the copy of ${change.skill} still exists under corpus/skills/; a retirement records a copy that is gone`,
            },
          ]);
        // A retirement is the tombstone of a copy the chain recorded, once.
        const latest = [...existing.value]
          .reverse()
          .find((item) => item.kind === "copy" && item.subjects.includes(`skill:${change.skill}`));
        if (latest === undefined)
          return contractFailure(entry.id, [
            {
              path: change.skill,
              message: `no copy entry for ${change.skill} in the chain; a retirement is the tombstone of a recorded copy`,
            },
          ]);
        const retiredBefore =
          latest.version === 3 &&
          latest.raw.kind === "copy" &&
          latest.raw.changes.some((item) => item.skill === change.skill && "retirement" in item);
        if (retiredBefore)
          return contractFailure(entry.id, [
            { path: change.skill, message: `${change.skill} is already retired at ${latest.id}` },
          ]);
        const replacement = change.retirement.replacement;
        if (
          replacement !== null &&
          !manifest.value.skills.some((item) => item.name === replacement)
        )
          return contractFailure(entry.id, [
            { path: change.skill, message: `the replacement ${replacement} is not on the roster` },
          ]);
        continue;
      }
      const actual = measured.value.find((item) => item.skill === change.skill);
      if (actual === undefined)
        return contractFailure(entry.id, [
          { path: change.skill, message: "no vendored copy by that name" },
        ]);
      if (
        actual.source.revision !== change.source.revision ||
        actual.source.commit !== change.source.commit ||
        actual.source.path !== change.source.path
      )
        return contractFailure(entry.id, [
          { path: change.skill, message: "the entry's source differs from the measured upstream" },
        ]);
      if (actual.result !== change.result)
        return contractFailure(entry.id, [
          { path: change.skill, message: "the entry's result differs from the measured copy" },
        ]);
    }
  const unitProblems = unitIssues(entry, families.value);
  if (unitProblems.length > 0) return contractFailure(entry.id, unitProblems);
  // A digest origin names a registry row by its id and its pin.
  const registry = readDigestRegistry(corpusRoot);
  if (registry._tag === "err") return registry;
  const originProblems = originIssues([parsed.value], registry.value.rows);
  if (originProblems.length > 0) return contractFailure(entry.id, originProblems);
  const nextManifest: CorpusManifest = {
    ...manifest.value,
    skills: manifest.value.skills.map((item) =>
      touched.has(item.name) ? { ...item, ledger: pin } : item,
    ),
  };
  const movedFamilies = new Set(pinnedFamilies(entry));
  const nextFamilies = families.value.map((family) =>
    movedFamilies.has(family.family) ? { ...family, pin } : family,
  );
  const familyWrites: FileWrite[] = [];
  for (const family of movedFamilies) {
    const write = familyPinWrite(corpusRoot, family, pin);
    if (write._tag === "err") return write;
    familyWrites.push(write.value);
  }
  const states = copyStates(
    corpusRoot,
    measured.value.map((item) => (touched.has(item.skill) ? { ...item, record: pin } : item)),
  );
  if (states._tag === "err") return states;
  const issues = auditIssues(
    corpusRoot,
    extended.chain,
    nextManifest,
    nextFamilies,
    states.value,
    frozen,
  );
  if (issues.length > 0) return contractFailure(entry.id, issues);
  const views = renderLedgerViews(
    corpusRoot,
    extended.chain,
    measured.value,
    nextFamilies,
    nextManifest,
  );
  if (views._tag === "err") return views;
  return contractOk([
    ...frozen.map((witness) => witness.write),
    ...(touched.size > 0
      ? [
          {
            path: join(corpusRoot, "manifest.json"),
            content: `${JSON.stringify(nextManifest, null, 2)}\n`,
          },
        ]
      : []),
    ...familyWrites,
    ...views.value,
    {
      path: join(corpusRoot, LEDGER_RECORDS, `${entry.id}.json`),
      content: `${JSON.stringify(entry, null, 2)}\n`,
    },
  ]);
}
