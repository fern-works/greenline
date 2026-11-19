import { existsSync } from "node:fs";
import { join } from "node:path";
import { INSPECT_SCHEMA } from "../../core/inspector/contract.ts";
import type {
  RosterSkill,
  SkillChange,
  SkillChangeLoad,
  SkillDocument,
  SkillKindView,
  CheckStandingView,
  DiagnosticEntry,
  DiscussionsDocument,
  HealthFinding,
  HealthGroup,
  PracticeDocument,
  Unread,
  CountedName,
  RosterDocument,
  RosterUse,
  SearchDocument,
  SearchEntry,
  SkillLoad,
  SkillLoadsDocument,
  FrameMapDocument,
  OwedUse,
  OwedView,
} from "../../core/inspector/documents.ts";
import { readFrameMap } from "../frame-map.ts";
import { discussionSummaries } from "./discussions.ts";
import type { SkillLoadFact } from "../../core/skill-loads.ts";
import { heldText, owedUnmetBy } from "../../core/habits-owed.ts";
import { recordIds } from "../changes.ts";
import { workingRecord, workspaceManifest } from "../hooks.ts";
import { owedNow } from "../habits-owed.ts";
import { changeLoads } from "../skill-loads.ts";
import { receiptView, type ReceiptRequestView } from "../../core/inspect.ts";
import { parseManifest } from "../../core/manifest.ts";
import type { CheckStanding } from "../../core/mirror.ts";
import { renderProjection } from "../../core/render.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { GuidanceRequests } from "../guidance-requests.ts";
import type { CommandOutcome } from "../cli/command-outcome.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import type { Diagnostic } from "../cli/output.ts";
import { rosterOf } from "../repository-state.ts";
import { isChangeId } from "../../core/change.ts";
import { pathOf } from "./app/addresses.ts";
import { changeRef, skillRef } from "./refs.ts";
import { listFilesRecursive } from "../fs/walk.ts";
import { changeResolver } from "./links.ts";
import { renderMarkdown } from "./markdown.ts";
import { listedStatus } from "./ledger.ts";
import { readInstalledFile } from "./repository-read.ts";
import { notesReading } from "./captures.ts";
import { changesList } from "./ledger.ts";
import { plansList } from "./plans.ts";
import { picturesDocument } from "./visuals.ts";

/*
 * The documents of the contract that no single reader of today's views
 * builds: the practice with its diagnostics and receipts, the roster with its
 * use across the changes, a change's skill loads, and the kind whose home
 * this version of greenline does not keep, served with no item and the
 * reason. The visual home's documents are `visuals.ts`'s. Each reads the repository as it stands, through
 * the readers `greenline status` uses; nothing here writes.
 */

const RECEIPTS = ".greenline/ledger/receipts";

/**
 * Status's diagnostics in the contract's shape.
 * @param diagnostics the diagnostics a command outcome carries
 * @returns each with its path only where it names one
 */
function diagnosticEntries(diagnostics: readonly Diagnostic[]): readonly DiagnosticEntry[] {
  return diagnostics.map((note): DiagnosticEntry => {
    const entry = { code: note.code, severity: note.severity, message: note.message };
    return note.path === undefined ? entry : { ...entry, path: note.path };
  });
}

/**
 * `greenline status` over the repository, the one run the list, the desk,
 * the plans and the practice share for the state a build reads (J-154 S2,
 * S3): status's list of every change, whose diagnostics and hooks are the
 * command's, the list's width alone apart.
 * @param root the repository root
 * @param env the CLI environment
 * @returns the command's outcome
 */
function statusOutcome(root: string, env: CliEnvironment): CommandOutcome {
  return listedStatus(root, env);
}

/**
 * The diagnostics `greenline status` reports for the repository.
 * @param env the CLI environment, its directory the repository root
 * @returns the diagnostics
 */
export function statusDiagnostics(env: CliEnvironment): readonly DiagnosticEntry[] {
  return diagnosticEntries(statusOutcome(env.cwd, env).diagnostics);
}

/**
 * A declared check's latest run for a change in progress, in the contract's outcomes.
 * @param standing the check with its latest run
 * @returns the check's standing
 */
export function checkStandingOf(standing: CheckStanding): CheckStandingView {
  const latest = standing.latest;
  const outcome: CheckStandingView["outcome"] =
    latest === undefined
      ? "not-run"
      : latest.outcome === "started"
        ? "unfinished"
        : latest.outcome === "ok"
          ? "passed"
          : latest.outcome === "unknown"
            ? "not-run"
            : latest.outcome;
  return {
    name: standing.check.name,
    command: standing.check.command,
    outcome,
    at: latest?.at ?? null,
  };
}

/**
 * The discussions, every one that reads, newest first (J-118 S4).
 * @param root the repository root
 * @returns the document
 */
export function discussionsDocument(root: string): Unread<DiscussionsDocument> {
  return {
    schema: INSPECT_SCHEMA,
    kind: "discussions",
    discussions: { available: true, items: discussionSummaries(root) },
  };
}

/**
 * Every name a page shows for a record another page refers to, read once
 * (J-158 S2): the changes, the plans, the discussions, the pictures and the
 * notes, each by its reference with the place that lists it, its state and
 * its time. A home that cannot be read gives no names, and its own pages
 * say why.
 * @param root the repository's root
 * @param env the CLI's environment
 * @param today the day the changes' ages are read against
 * @returns the names document
 */
export function searchDocument(
  root: string,
  env: CliEnvironment,
  today: Date,
): Unread<SearchDocument> {
  const entries: SearchEntry[] = [];
  // Each record carries its own reference since the contract's version two; the names are those.
  for (const change of changesList(root, env, today).changes)
    entries.push({
      kind: "change",
      ...change.ref,
      where: "Changes",
      state: change.state,
      at: change.opened,
    });
  for (const plan of plansList(root, env).plans)
    entries.push({ kind: "plan", ...plan.ref, where: "Plans", state: null, at: null });
  for (const discussion of discussionSummaries(root))
    entries.push({
      kind: "discussion",
      ...discussion.ref,
      where: "Discussions",
      state: discussion.state,
      at: discussion.touched ?? discussion.opened,
    });
  const pictures = picturesDocument(root).pictures;
  if (pictures.available)
    for (const picture of pictures.items)
      entries.push({
        kind: "picture",
        ...picture.ref,
        where: "Pictures",
        state: picture.tier,
        at: picture.made,
      });
  for (const view of notesReading(root).notes)
    entries.push({
      kind: "note",
      ...view.ref,
      where: "Your notes",
      state: view.mark.state,
      at: view.mark.at,
    });
  return { schema: INSPECT_SCHEMA, kind: "search", entries };
}

/** A fact as the contract's skill load carries it, the session and the turn left to the files. */
function loadOf(fact: SkillLoadFact): SkillLoad {
  const load: SkillLoad = {
    skill: fact.skill,
    file: fact.file,
    whole: fact.whole,
    via: fact.via,
    at: fact.at,
    step: fact.step,
    agent: fact.agent,
  };
  // Why a read is a part, where one page per read or the harness's cut made it one (J-203 S1).
  // A settled fact carries no mark of a read never made (J-207 S1).
  return fact.cause === undefined || fact.cause === "unrun" ? load : { ...load, cause: fact.cause };
}

/**
 * The skills a change owed by its trigger rows over every step its mode
 * runs (J-176 S1), each beside whether a load of the change holds it; none
 * where the workspace's manifest does not read.
 * @param root the repository root
 * @param change the change's id
 * @param env the CLI environment, whose installation carries the rows
 * @returns the owed skills, in the order the owed line prints them
 */
function owedViews(root: string, change: string, env: CliEnvironment): readonly OwedView[] {
  const manifest = workspaceManifest(root);
  if (manifest === undefined) return [];
  const loads = changeLoads(root, change);
  const loaded = new Set(loads.map((load) => load.skill));
  const owed = owedNow(
    { root, installation: env.installation, manifest, change, session: null },
    stepsOfMode(env, workingRecord(root, change)?.mode),
  );
  // The pages a whole read the loads began still holds, as the owes line names them (J-203 S1).
  const triggers = env.installation.triggers;
  const unmet = triggers === undefined ? [] : owedUnmetBy(owed, loads, triggers);
  return owed.map((entry) => {
    const held = unmet.find((each) => each.skill === entry.skill)?.held;
    const view = {
      skill: entry.skill,
      read: entry.read,
      why: entry.why,
      loaded: loaded.has(entry.skill),
    };
    return held === undefined ? view : { ...view, held: heldText(held) };
  });
}

/** The steps a mode runs at a depth other than none; none for a mode the definition lacks. */
function stepsOfMode(env: CliEnvironment, name: string | undefined): ReadonlySet<string> {
  const mode = env.installation.modes.modes.find((each) => each.name === name);
  return new Set(
    env.installation.modes.steps
      .filter((step) => (mode?.steps[step.name]?.depth ?? "none") !== "none")
      .map((step) => step.name),
  );
}

/**
 * One change's skill loads, from the facts the hooks wrote in its folder,
 * oldest first, and the skills it owes beside them (J-176 S1).
 * @param root the repository root
 * @param change the change's id
 * @param env the CLI environment, whose installation carries the trigger rows
 * @returns the document
 */
export function skillLoadsDocument(
  root: string,
  change: string,
  env: CliEnvironment,
): Unread<SkillLoadsDocument> {
  return {
    schema: INSPECT_SCHEMA,
    kind: "skill-loads",
    change,
    loads: { available: true, items: changeLoads(root, change).map(loadOf) },
    owed: owedViews(root, change, env),
  };
}

/**
 * Each skill the changes owed, owed against loaded (J-176 S1): how many
 * changes owed it and how many of those loaded it, the most owed first.
 * @param root the repository root
 * @param env the CLI environment
 * @returns one entry per skill owed
 */
function owedUse(root: string, env: CliEnvironment): readonly OwedUse[] {
  const counts = new Map<string, { owed: number; loaded: number }>();
  for (const id of recordIds(root) ?? [])
    for (const entry of owedViews(root, id, env)) {
      const count = counts.get(entry.skill) ?? { owed: 0, loaded: 0 };
      count.owed += 1;
      if (entry.loaded) count.loaded += 1;
      counts.set(entry.skill, count);
    }
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, ...count }))
    .sort((a, b) => b.owed - a.owed || a.skill.localeCompare(b.skill));
}

/**
 * One change's frame map (J-117 S4), from the file beside its record or its
 * record's frame section.
 * @param root the repository root
 * @param change the change's id
 * @returns the document
 */
export function frameMapDocument(root: string, change: string): Unread<FrameMapDocument> {
  const read = readFrameMap(root, change);
  const restatement = read.map?.restatement.trim() ?? "";
  return {
    schema: INSPECT_SCHEMA,
    kind: "frame-map",
    change,
    ...read,
    // The restatement rendered as the record's other prose is, its links to the folder resolved (J-165 S1).
    restatementHtml:
      restatement === ""
        ? null
        : renderMarkdown(
            restatement,
            changeResolver(change, folderNames(root, change), ".greenline/ledger"),
          ),
    // The owner's words that confirmed a careful frame, shown under the restatement on the Overview (J-223 S1).
    confirmed: workingRecord(root, change)?.confirmed ?? null,
  };
}

/** Every file of a change's folder by its name, which its links resolve against; none where it has none. */
function folderNames(root: string, change: string): readonly string[] {
  const folder = join(root, ".greenline", "ledger", change);
  try {
    return existsSync(folder) ? listFilesRecursive(folder) : [];
  } catch {
    return [];
  }
}

/** The step a load is counted under: the record's step, or the time before the record stood. */
const BEFORE_RECORD = "before the record";
/** The harness and model a load is counted under where its record states no agent line. */
const NOT_STATED = "not stated";

/** Add one load to a name's count, keeping the names in the order first seen. */
function countUnder(counts: Map<string, number>, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

function counted(counts: ReadonlyMap<string, number>): readonly CountedName[] {
  return [...counts.entries()].map(([name, loads]) => ({ name, loads }));
}

/**
 * The roster's use across the changes: each skill's loads, whole and part,
 * the changes, the steps, the harness and model of each record's agent line,
 * and its loads outside its situation, where a step skill loaded at another
 * step; the skills in the order of their loads, most first.
 * @param root the repository root
 * @param slots each roster skill's step, for a skill on the line
 * @returns one entry per skill loaded
 */
function rosterUse(root: string, slots: ReadonlyMap<string, string | null>): readonly RosterUse[] {
  const uses = new Map<
    string,
    {
      loads: number;
      whole: number;
      part: number;
      changes: Set<string>;
      steps: Map<string, number>;
      agents: Map<string, number>;
      outside: number;
      firstAt: string;
      lastAt: string;
    }
  >();
  const earlier = (a: string, b: string): boolean => Date.parse(a) < Date.parse(b);
  for (const id of recordIds(root) ?? []) {
    const agent = workingRecord(root, id)?.agent ?? NOT_STATED;
    for (const load of changeLoads(root, id)) {
      const use = uses.get(load.skill) ?? {
        loads: 0,
        whole: 0,
        part: 0,
        changes: new Set<string>(),
        steps: new Map<string, number>(),
        agents: new Map<string, number>(),
        outside: 0,
        firstAt: load.at,
        lastAt: load.at,
      };
      if (earlier(load.at, use.firstAt)) use.firstAt = load.at;
      if (earlier(use.lastAt, load.at)) use.lastAt = load.at;
      use.loads += 1;
      if (load.whole) use.whole += 1;
      else use.part += 1;
      use.changes.add(id);
      countUnder(use.steps, load.step ?? BEFORE_RECORD);
      countUnder(use.agents, agent);
      const slot = slots.get(load.skill) ?? null;
      if (slot !== null && load.step !== null && load.step !== slot) use.outside += 1;
      uses.set(load.skill, use);
    }
  }
  return [...uses.entries()]
    .map(([skill, use]): RosterUse => ({
      skill,
      loads: use.loads,
      whole: use.whole,
      part: use.part,
      steps: [...use.steps.keys()],
      agents: [...use.agents.keys()],
      changes: use.changes.size,
      byStep: counted(use.steps),
      byAgent: counted(use.agents),
      outside: use.outside,
      firstAt: use.firstAt,
      lastAt: use.lastAt,
    }))
    .sort((a, b) => b.loads - a.loads || a.skill.localeCompare(b.skill));
}

/**
 * The roster as installed here: each skill with its kind and slot, whether
 * its file is installed and whether it is an extra, and its use across the
 * changes from the loads the hooks wrote.
 * @param root the repository root
 * @param env the CLI environment
 * @returns the document
 */
export function rosterDocument(root: string, env: CliEnvironment): Unread<RosterDocument> {
  const installed = installedSkills(root, env);
  const use = rosterUse(root, slotsOf(env));
  const loaded = new Set(use.map((entry) => entry.skill));
  return {
    schema: INSPECT_SCHEMA,
    kind: "roster",
    kinds: kindsOf(env),
    skills: env.installation.skills.map((skill) => rosterSkill(skill, installed)),
    use: { available: true, items: use },
    neverRead: env.installation.skills
      .filter((skill) => installed.has(skill.name) && !loaded.has(skill.name))
      .map((skill) => skill.name),
    owed: owedUse(root, env),
  };
}

/** The skills whose file the installation wrote and that stands, by name. */
function installedSkills(root: string, env: CliEnvironment): ReadonlySet<string> {
  const io = createNodeFileIo();
  const text = readInstalledFile(root, io, ".greenline/manifest.json");
  const manifest =
    text._tag === "ok"
      ? parseManifest(text.value, ".greenline/manifest.json", rosterOf(env.installation))
      : undefined;
  const installed = new Set<string>();
  if (manifest?._tag === "ok")
    for (const file of renderProjection(manifest.value, env.installation)) {
      const skill = /\/skills\/([^/]+)\/SKILL\.md$/.exec(file.path)?.[1];
      if (skill !== undefined && readInstalledFile(root, io, file.path)._tag === "ok")
        installed.add(skill);
    }
  return installed;
}

/** Each roster skill's step, for a skill on the line. */
function slotsOf(env: CliEnvironment): ReadonlyMap<string, string | null> {
  return new Map(env.installation.skills.map((skill) => [skill.name, skill.slot ?? null]));
}

/** The kinds of skill the modes declare, each with its sentence (J-165 S1). */
function kindsOf(env: CliEnvironment): readonly SkillKindView[] {
  return env.installation.modes.kinds.map((kind) => ({ name: kind.name, when: kind.when }));
}

/** A description's first sentence: up to its first full stop, question or exclamation mark before a space, or the whole. */
function firstSentence(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  return /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
}

/** One skill of the installation as the roster carries it. */
function rosterSkill(
  skill: CliEnvironment["installation"]["skills"][number],
  installed: ReadonlySet<string>,
): RosterSkill {
  return {
    name: skill.name,
    ref: skillRef(skill.name),
    kind: skill.kind,
    slot: skill.slot ?? null,
    installed: installed.has(skill.name),
    extra: skill.extra === true,
    description: firstSentence(skill.description),
    activation: skill.activation,
  };
}

/**
 * One skill's page (J-165 S1): the skill, its kind with its sentence, its
 * use across the changes, the changes that loaded it, the most recent
 * first, each with its loads and the steps they came at, and every load
 * with its change, oldest first.
 * @param root the repository root
 * @param env the CLI environment
 * @param name the skill's name
 * @returns the document, or undefined for a name the roster does not hold
 */
export function skillDocument(
  root: string,
  env: CliEnvironment,
  name: string,
): Unread<SkillDocument> | undefined {
  const found = env.installation.skills.find((skill) => skill.name === name);
  if (found === undefined) return undefined;
  const loads: SkillChangeLoad[] = [];
  const changes: (SkillChange & { readonly lastAt: string })[] = [];
  for (const id of recordIds(root) ?? []) {
    const own = changeLoads(root, id).filter((load) => load.skill === name);
    if (own.length === 0) continue;
    for (const load of own) loads.push({ ...loadOf(load), change: id });
    const steps = new Map<string, number>();
    for (const load of own) countUnder(steps, load.step ?? BEFORE_RECORD);
    const last = own.map((load) => load.at).sort((a, b) => Date.parse(a) - Date.parse(b));
    changes.push({
      change: changeRef(id),
      loads: own.length,
      steps: [...steps.keys()],
      lastAt: last.at(-1) ?? "",
    });
  }
  const skillKind = kindsOf(env).find((each) => each.name === found.kind) ?? null;
  // The pages its whole read includes, as its recipe names them (J-203 S1).
  const wholeRead = env.installation.triggers?.skills.find((each) => each.name === name)?.wholeRead;
  const document: Unread<SkillDocument> = {
    schema: INSPECT_SCHEMA,
    kind: "skill",
    skill: rosterSkill(found, installedSkills(root, env)),
    skillKind,
    use: rosterUse(root, slotsOf(env)).find((entry) => entry.skill === name) ?? null,
    changes: changes
      .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
      .map(({ lastAt: _last, ...change }) => change),
    loads: loads.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  };
  return wholeRead === undefined ? document : { ...document, wholeRead };
}

/** The request collections that read, body-free, and the files that do not. */
interface ReceiptsReading {
  readonly receipts: readonly ReceiptRequestView[];
  readonly problems: readonly { readonly file: string; readonly message: string }[];
}

/**
 * The request collections as they stand, each readable one body-free
 * beside the files that cannot be read.
 * @param root the repository root
 * @returns the receipts and the problems
 */
function receiptReading(root: string): ReceiptsReading {
  const survey = new GuidanceRequests(root, createNodeFileIo()).survey();
  if (survey._tag === "err")
    return { receipts: [], problems: [{ file: RECEIPTS, message: survey.error.message }] };
  return {
    receipts: receiptView(
      survey.value.flatMap((item) => ("request" in item ? [item.request] : [])),
    ),
    problems: survey.value.flatMap((item) =>
      "failure" in item ? [{ file: `${RECEIPTS}/${item.file}`, message: item.failure }] : [],
    ),
  };
}

/** The page that shows a diagnostic's record: a change's page, or a plan's; null for any other path. */
function recordAddress(path: string | undefined): string | null {
  const change = /^\.greenline\/ledger\/([^/]+?)(?:\.md$|\/)/.exec(path ?? "")?.[1];
  if (change !== undefined && isChangeId(change))
    return pathOf({ page: "change", id: change, part: null });
  const plan = /^\.greenline\/plans\/([^/]+)/.exec(path ?? "")?.[1];
  return plan === undefined ? null : pathOf({ page: "plan", name: plan, part: null });
}

/**
 * The diagnostics grouped by their code, errors first, each group with its
 * count, its first message, the page of the first record it names and its
 * findings in status's order, each finding's message kept only where it is
 * not the group's first (J-232 S1).
 * @param diagnostics the diagnostics
 * @returns the groups
 */
function healthGroups(diagnostics: readonly DiagnosticEntry[]): readonly HealthGroup[] {
  const groups = new Map<
    string,
    Omit<HealthGroup, "findings" | "count"> & { findings: HealthFinding[] }
  >();
  for (const note of diagnostics) {
    const key = `${note.severity}\0${note.code}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        kind: note.severity,
        code: note.code,
        text: note.message,
        address: recordAddress(note.path),
        findings: [],
      };
      groups.set(key, group);
    }
    const finding: HealthFinding = note.message === group.text ? {} : { message: note.message };
    group.findings.push(note.path === undefined ? finding : { ...finding, path: note.path });
  }
  return [...groups.values()]
    .map((group): HealthGroup => ({ ...group, count: group.findings.length }))
    .sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === "error" ? -1 : 1));
}

/**
 * The practice (J-154 S3): the health `greenline status` reports, grouped
 * and whole, the declared checks with the hooks, the CLI's version, and the
 * receipts of each consultation with whether a connector could make one.
 * @param root the repository root
 * @param env the CLI environment
 * @returns the document
 */
export function practiceDocument(root: string, env: CliEnvironment): Unread<PracticeDocument> {
  const text = readInstalledFile(root, createNodeFileIo(), ".greenline/manifest.json");
  const manifest =
    text._tag === "ok"
      ? parseManifest(text.value, ".greenline/manifest.json", rosterOf(env.installation))
      : undefined;
  const diagnosis = statusOutcome(root, env);
  const diagnostics = diagnosticEntries(diagnosis.diagnostics);
  const errors = diagnostics.filter((note) => note.severity === "error").length;
  return {
    schema: INSPECT_SCHEMA,
    kind: "practice",
    health: {
      errors,
      warnings: diagnostics.length - errors,
      groups: healthGroups(diagnostics),
      source: {
        label: "greenline status",
        address: pathOf({ page: "practice" }),
      },
    },
    hooks:
      diagnosis.hooks === undefined || manifest?._tag !== "ok"
        ? null
        : { settings: manifest.value.hooks, ...diagnosis.hooks },
    version: env.version,
    ...receiptReading(root),
    connector: manifest?._tag === "ok" && manifest.value.connectors.garden !== undefined,
  };
}
