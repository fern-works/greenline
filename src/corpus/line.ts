import { casesHandled } from "../commons/defect.ts";
import { kindActivation, kindSlotIssue } from "../core/corpus.ts";
import type { ActivationMode } from "../core/skill.ts";
import {
  depthOf,
  kindNamed,
  STEP_KIND,
  type Depth,
  type Kind,
  type ModesDefinition,
} from "../core/modes.ts";
import {
  latestChanges,
  retiredSkills,
  type Chain,
  type Move,
  type Pages,
  type Placement,
  type SourceEntry,
  type Verdict,
} from "./chain.ts";
import { cell, listed, sentence, table } from "./tables.ts";

/**
 * The line (`workshop/components/ledger.md`, "The line view";
 * `docs/VOCABULARY.md`, "Line", "Slot" and "Stack"): the ordered steps a
 * mode runs, as the modes definition lists them. A slot is a position on
 * the line that one skill serves, of one of the definition's kinds: a kind
 * placed `ordered` stands at a step of the line, and a kind placed `beside`
 * is its own slot. A slot's stack is the roster skills on it and the
 * candidates whose placement names it. The facts are recorded, never
 * tabled by hand: the manifest carries each skill's kind, flags and slot,
 * and a source entry's placement names the slot its move fills,
 * strengthens, adds or reshapes. A placement that names a skill the chain
 * retired stands where the retirement's replacement stands. A candidate
 * whose latest verdict entered its method (a copy, a combine or a lift,
 * which the ingest procedure records after the build) on a row a roster
 * skill stands on is absorbed, and
 * the view lists it apart from a pending one, which a hold keeps on the
 * stack; and the view names each roster skill's latest change with the
 * pages it touched (the first evaluation's proposals 11 and 13). This module
 * checks those facts against
 * each other and renders the line view, `corpus/ledger/LINE.md`, as pure
 * functions. Every kind is read from the definition; the one name it knows
 * is the kind the steps list names, {@link STEP_KIND}.
 */

/** A roster skill's facts on the line, as the manifest states them. */
export interface LineSkill {
  readonly name: string;
  /** A kind of the modes definition, which {@link kindIssues} checks. */
  readonly kind: string;
  /** For a skill whose kind is placed on the line: the step it stands at. */
  readonly slot?: string | undefined;
  /** Stated only when it differs from the activation the kind's mechanism implies, which {@link kindIssues} checks. */
  readonly activation?: ActivationMode | undefined;
  readonly extra?: true | undefined;
  readonly trial?: true | undefined;
}

/** A refusal of one roster skill's kind, slot or activation. */
export interface KindIssue {
  readonly skill: string;
  readonly message: string;
}

/**
 * The roster skills whose kind, slot or activation the modes definition
 * refuses: a kind the definition does not declare; a slot on a kind placed
 * beside the line, which is its own slot; no slot on a kind placed on the
 * line; a slot that names no step of the definition (`kindSlotIssue`); and
 * an activation stated equal to the one the kind's mechanism implies,
 * since a stated activation is always a visible exception.
 * @param skills the manifest's skills
 * @param definition the modes definition on disk
 * @returns one refusal per such skill, by name
 */
export function kindIssues(
  skills: readonly LineSkill[],
  definition: ModesDefinition,
): readonly KindIssue[] {
  return skills.flatMap((skill): readonly KindIssue[] => {
    const issue = kindSlotIssue(definition, skill);
    if (issue !== undefined) return [{ skill: skill.name, message: issue }];
    const kind = kindNamed(definition, skill.kind);
    return kind !== undefined &&
      skill.activation !== undefined &&
      skill.activation === kindActivation(kind)
      ? [
          {
            skill: skill.name,
            message: `activation '${skill.activation}' is the one a ${kind.name} implies; it is stated only to differ`,
          },
        ]
      : [];
  });
}

/**
 * How a source entry's placement names its kind and its slot against the
 * manifest and the modes definition: its kind is one the definition
 * declares; a `fill` names a step of the definition; a `strengthen` names a
 * roster skill of the placement's kind; an `add` names nothing the
 * manifest or the definition holds, save the roster skill its own source
 * built, at the placement's kind, and an added step the definition already
 * holds, since that step's entry follows the change that adds it; a
 * `reshape` names a mode of the definition.
 * @param entry a source entry
 * @param skills the manifest's skills
 * @param definition the modes definition on disk
 * @param builtFrom whether a roster skill's recipe takes from or credits the entry's source
 * @returns every refusal; none for an entry without a placement
 */
export function placementSlotIssues(
  entry: SourceEntry,
  skills: readonly LineSkill[],
  definition: ModesDefinition,
  builtFrom: (skill: string) => boolean,
): readonly string[] {
  const placed = entry.placement;
  if (placed === undefined) return [];
  const { kind, slot } = placed;
  if (kindNamed(definition, kind) === undefined)
    return [`the placement's kind '${kind}' is no kind of the modes definition`];
  const skill = skills.find((candidate) => candidate.name === slot);
  const isStep = definition.steps.some((step) => step.name === slot);
  const isMode = definition.modes.some((mode) => mode.name === slot);
  const kindIssue = (owner: LineSkill, verb: string): readonly string[] =>
    owner.kind === kind
      ? []
      : [
          `the placement's kind is '${kind}', but the roster skill '${owner.name}' it ${verb} is a ${owner.kind}`,
        ];
  switch (placed.move) {
    case "fill":
      return isStep
        ? []
        : [`the placement fills the slot '${slot}', which is no step of the modes definition`];
    case "strengthen":
      return skill === undefined
        ? [`the placement strengthens the slot '${slot}', which names no roster skill`]
        : kindIssue(skill, "strengthens");
    case "add":
      if (skill !== undefined)
        return builtFrom(slot)
          ? kindIssue(skill, "added")
          : [`the placement adds the slot '${slot}', which the roster skill of that name holds`];
      if (isMode)
        return [
          `the placement adds the slot '${slot}', which the modes definition holds as a mode`,
        ];
      if (kind === STEP_KIND)
        return isStep
          ? []
          : [
              `the placement adds the step '${slot}', which the modes definition does not hold; an added step is recorded after the change that adds it`,
            ];
      return isStep
        ? [`the placement adds the slot '${slot}', which the modes definition holds as a step`]
        : [];
    case "reshape":
      return isMode
        ? []
        : [`the placement reshapes '${slot}', which is no mode of the modes definition`];
    default:
      return casesHandled(placed.move);
  }
}

/** A candidate on a slot: its source, its latest verdict, and its latest placement's move and catch. */
export interface Candidate {
  /** The source's pin, or its repository, and the path read there. */
  readonly label: string;
  readonly verdict: Verdict;
  readonly move: Move;
  readonly catches: string;
  /**
   * Whether the method has entered a roster skill: its latest verdict is a
   * copy, a combine or a lift and, on a slot, a roster skill stands on its
   * row. A hold keeps it pending, and so does a slot no skill holds yet or a
   * skill retired with no replacement.
   */
  readonly absorbed: boolean;
}

/** A roster skill's latest change and the installed pages it touched. */
export interface SkillPages {
  readonly skill: string;
  /** The latest change entry's id, or undefined when the chain records no change of the skill. */
  readonly entry: string | undefined;
  readonly pages: Pages;
}

/** One slot of the line and its stack. */
export interface Slot {
  readonly name: string;
  /** For a slot of a kind placed on the line, at a step the definition holds: the step's depth at each mode, in the definition's order. */
  readonly depths?: readonly Depth[] | undefined;
  /** Whether the definition, for a step, or the manifest, for a slot of any other kind, holds the slot. */
  readonly held: boolean;
  readonly defaults: readonly LineSkill[];
  readonly trials: readonly LineSkill[];
  readonly candidates: readonly Candidate[];
}

/** The slots of one kind of the definition; a kind placed on the line has them in the line's order. */
export interface LineSection {
  readonly kind: Kind;
  readonly rows: readonly Slot[];
}

/** The candidates whose move changes one mode's steps: they name the mode, not a slot. */
export interface ModeCandidates {
  readonly mode: string;
  readonly candidates: readonly Candidate[];
}

/** The candidates whose placement names a skill retired with no skill in its place: they stand on no slot. */
export interface RetiredCandidates {
  readonly skill: string;
  readonly candidates: readonly Candidate[];
}

/** The line: the modes' names, one section per kind of the definition in its order, the candidates that change a mode, those on a skill retired with no replacement, and each roster skill's latest pages. */
export interface Line {
  readonly modes: readonly string[];
  readonly sections: readonly LineSection[];
  readonly byMode: readonly ModeCandidates[];
  readonly onRetired: readonly RetiredCandidates[];
  readonly pages: readonly SkillPages[];
}

/** What the line is rendered from. */
export interface LineInput {
  readonly definition: ModesDefinition;
  readonly skills: readonly LineSkill[];
  readonly chain: Chain;
}

/** The verdicts that take a candidate off its stack. */
const OFF_THE_STACK: ReadonlySet<Verdict> = new Set(["decline", "hand-off"]);

/** The verdicts under which a candidate's method has entered a roster skill: absorbed, not pending. */
const ABSORBED: ReadonlySet<Verdict> = new Set(["copy", "combine", "lift"]);

/** A source read, by its repository and its path, with its latest verdict and its latest placement. */
interface SourceState {
  readonly entry: SourceEntry;
  readonly verdict: Verdict;
  readonly placement: Placement | undefined;
}

/** Each source's latest verdict and latest placement, in the order the chain first reads it. */
function sourceStates(chain: Chain): readonly SourceState[] {
  const states = new Map<string, SourceState>();
  for (const { entry } of chain.entries) {
    if (entry.kind !== "source") continue;
    const key = `${entry.source.repository} ${entry.source.path}`;
    const before = states.get(key);
    states.set(key, {
      entry,
      verdict: entry.verdict,
      placement: entry.placement ?? before?.placement,
    });
  }
  return [...states.values()];
}

function labelOf(entry: SourceEntry): string {
  const where = entry.pin ?? entry.source.repository;
  return entry.source.path === "." ? where : `${where}/${entry.source.path}`;
}

/** A row's place: its kind's section and its slot's name. */
interface Place {
  readonly kind: string;
  readonly name: string;
}

/** The slot a roster skill stands on: its step, for a kind placed on the line, or the skill itself. */
function slotNameOf(skill: LineSkill, definition: ModesDefinition): string {
  return kindNamed(definition, skill.kind)?.place === "ordered"
    ? (skill.slot ?? skill.name)
    : skill.name;
}

/** The name a slot's name stands for once the retirements are followed, and whether no replacement followed its retirement. */
interface Heir {
  readonly name: string;
  readonly orphan: boolean;
}

/** A candidate whose placement names a skill retired with no replacement: it stands on no row. */
interface Orphaned {
  readonly orphan: string;
}

/**
 * The skill a slot's name stands for once the chain's retirements are
 * followed: a name the manifest does not list that the chain retired
 * stands for its replacement, and that one for its own, until a listed
 * skill or a name nothing retired is reached.
 * @returns the name reached, and whether it is a skill retired with no replacement
 */
function heirOf(
  name: string,
  skills: ReadonlyMap<string, LineSkill>,
  retired: ReadonlyMap<string, string | null>,
): Heir {
  const seen = new Set<string>();
  let at = name;
  while (!skills.has(at) && retired.has(at) && !seen.has(at)) {
    seen.add(at);
    const next = retired.get(at) ?? null;
    if (next === null) return { name: at, orphan: true };
    at = next;
  }
  return { name: at, orphan: false };
}

/**
 * Where a placement's candidate stands: the row of the step it fills; the
 * row of the roster skill it strengthens, or of the one its add built,
 * after the retirements are followed to the skill that took a retired
 * one's place; or a row of its own in its kind's section, such as an added
 * step. A reshape stands on no row, and neither does a placement on a skill
 * retired with no replacement.
 */
function placeOf(
  placed: Placement,
  skills: ReadonlyMap<string, LineSkill>,
  definition: ModesDefinition,
  retired: ReadonlyMap<string, string | null>,
): Place | Orphaned | undefined {
  if (placed.move === "reshape") return undefined;
  if (placed.move === "fill") return { kind: STEP_KIND, name: placed.slot };
  const heir = heirOf(placed.slot, skills, retired);
  if (heir.orphan) return { orphan: heir.name };
  const skill = skills.get(heir.name);
  if (skill !== undefined) return { kind: skill.kind, name: slotNameOf(skill, definition) };
  return { kind: placed.kind, name: heir.name };
}

/**
 * The line of the definition, the manifest and the chain: one section per
 * kind of the definition, in its order. The step kind's section has one
 * row per step of the definition in its order, each with its depth at
 * every mode; another kind placed on the line has a row for each step its
 * skills and candidates stand at, in the line's order; a kind placed beside
 * the line has one row per skill, in the manifest's order; and each section
 * then has a row for each slot a candidate names that nothing holds. A
 * candidate is a source whose latest verdict is not decline or hand-off and
 * that some entry placed; it stands with its latest verdict and its latest
 * placement, on the row of the skill that took the place of a retired skill
 * its placement names, or apart when no skill took that place. A skill or a candidate of a kind the definition does not
 * declare stands on no row: `verify` refuses such a skill, and `record`
 * such a placement.
 * @param input the definition, the manifest's skills and the chain
 * @returns the line
 */
export function lineOf(input: LineInput): Line {
  const { definition, skills } = input;
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const rows = new Map<string, Candidate[]>();
  const order: Place[] = [];
  const open = (place: Place): Candidate[] => {
    const key = `${place.kind} ${place.name}`;
    let found = rows.get(key);
    if (found === undefined) {
      found = [];
      rows.set(key, found);
      order.push(place);
    }
    return found;
  };
  for (const step of definition.steps) open({ kind: STEP_KIND, name: step.name });
  for (const skill of skills) open({ kind: skill.kind, name: slotNameOf(skill, definition) });
  const onModes = new Map<string, Candidate[]>();
  const onRetired = new Map<string, Candidate[]>();
  const retired = new Map(
    [...retiredSkills(input.chain)].map(([skill, entry]) => [skill, entry.replacedBy] as const),
  );
  for (const state of sourceStates(input.chain)) {
    if (state.placement === undefined || OFF_THE_STACK.has(state.verdict)) continue;
    const candidate: Candidate = {
      label: labelOf(state.entry),
      verdict: state.verdict,
      move: state.placement.move,
      catches: state.placement.catches,
      absorbed: ABSORBED.has(state.verdict),
    };
    const place = placeOf(state.placement, byName, definition, retired);
    if (place === undefined)
      onModes.set(state.placement.slot, [...(onModes.get(state.placement.slot) ?? []), candidate]);
    else if ("orphan" in place)
      onRetired.set(place.orphan, [...(onRetired.get(place.orphan) ?? []), candidate]);
    else open(place).push(candidate);
  }
  const stepIndex = (name: string): number => {
    const index = definition.steps.findIndex((step) => step.name === name);
    return index === -1 ? definition.steps.length : index;
  };
  const slotOf = (kind: Kind, name: string): Slot => {
    const onIt = skills.filter(
      (skill) => skill.kind === kind.name && slotNameOf(skill, definition) === name,
    );
    const step =
      kind.place === "ordered"
        ? definition.steps.find((candidate) => candidate.name === name)
        : undefined;
    return {
      name,
      depths:
        step === undefined ? undefined : definition.modes.map((mode) => depthOf(mode, step.name)),
      held: kind.name === STEP_KIND ? step !== undefined : onIt.length > 0,
      defaults: onIt.filter((skill) => skill.trial !== true),
      trials: onIt.filter((skill) => skill.trial === true),
      // A method entered under its verdict is absorbed only where a roster skill stands to hold it.
      candidates: (rows.get(`${kind.name} ${name}`) ?? []).map((candidate) => ({
        ...candidate,
        absorbed: candidate.absorbed && onIt.length > 0,
      })),
    };
  };
  const section = (kind: Kind): LineSection => {
    const places = order.filter((place) => place.kind === kind.name);
    // A stable sort, so the slots at no step of the line keep the order they were met in.
    const ordered =
      kind.place === "ordered"
        ? [...places].sort((left, right) => stepIndex(left.name) - stepIndex(right.name))
        : places;
    return { kind, rows: ordered.map((place) => slotOf(kind, place.name)) };
  };
  return {
    modes: definition.modes.map((mode) => mode.name),
    sections: definition.kinds.map(section),
    byMode: [...onModes].map(([mode, candidates]) => ({ mode, candidates })),
    onRetired: [...onRetired].map(([skill, candidates]) => ({
      skill,
      candidates: candidates.map((candidate) => ({ ...candidate, absorbed: false })),
    })),
    pages: skillPages(skills, input.chain),
  };
}

/**
 * Each roster skill's latest change entry and the pages it touched, in the
 * manifest's order.
 * @param skills the manifest's skills
 * @param chain the whole chain
 * @returns one row per skill
 */
function skillPages(skills: readonly LineSkill[], chain: Chain): readonly SkillPages[] {
  const latest = latestChanges(chain);
  return skills.map((skill) => {
    const entry = latest.get(skill.name);
    return { skill: skill.name, entry: entry?.id, pages: entry?.pages ?? [] };
  });
}

function counted(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

function depthText(value: Depth): string {
  if (value.depth === "independent") return `independent, ${counted(value.agents, "agent")}`;
  if (value.depth === "looped") return `looped, ${counted(value.rounds, "round")}`;
  return value.depth;
}

function skillsText(skills: readonly LineSkill[]): string {
  return skills.length === 0
    ? "none"
    : skills
        .map((skill) => `\`${skill.name}\`${skill.extra === true ? " (extra)" : ""}`)
        .join(", ");
}

function candidatesText(candidates: readonly Candidate[], marked = false): string {
  return candidates.length === 0
    ? "none"
    : candidates
        .map(
          (candidate) =>
            `\`${candidate.label}\` (\`${candidate.verdict}\`, \`${candidate.move}\`${marked ? (candidate.absorbed ? ", absorbed" : ", pending") : ""}): ${sentence(candidate.catches)}`,
        )
        .join("; ");
}

function pagesText(pages: Pages): string {
  if (pages === "unknown") return "unknown";
  return pages.length === 0 ? "none" : pages.map((page) => `\`${page.path}\``).join(", ");
}

/** The marks of a row: a slot nothing holds yet, the re-cut's work, and the combine candidates. */
function marksOf(slot: Slot, kind: Kind): string {
  const marks: string[] = [];
  if (!slot.held)
    marks.push(
      kind.name === STEP_KIND
        ? "proposed: the modes definition holds no such step"
        : "proposed: no roster skill holds the slot yet",
    );
  if (slot.defaults.length > 1) marks.push(`re-cut: ${slot.defaults.length} default skills`);
  // Absorbed sources have entered already, so only pending candidates can be combined.
  const byCatch = new Map<string, number>();
  for (const candidate of slot.candidates.filter((each) => !each.absorbed))
    byCatch.set(candidate.catches, (byCatch.get(candidate.catches) ?? 0) + 1);
  for (const shared of byCatch.values())
    if (shared > 1) marks.push(`combine candidate: ${shared} candidates share a catch`);
  return marks.join("; ");
}

/** A kind's name with its article, as the view's prose names it. */
function articled(name: string): string {
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

/**
 * The line view's text.
 * @param line the line of the definition, the manifest and the chain
 * @returns the text of `corpus/ledger/LINE.md`
 */
export function renderLine(line: Line): string {
  const body = line.sections.flatMap((section) => {
    const onTheLine = section.kind.place === "ordered";
    const head = [
      "Slot",
      ...(onTheLine ? line.modes : []),
      "Default skills",
      "Trials",
      "Absorbed",
      "Candidates",
      "Marks",
    ];
    const rows = section.rows.map((slot) => [
      `\`${slot.name}\``,
      ...(onTheLine
        ? line.modes.map((_, index) => depthText(slot.depths?.[index] ?? { depth: "none" }))
        : []),
      skillsText(slot.defaults),
      skillsText(slot.trials),
      cell(candidatesText(slot.candidates.filter((candidate) => candidate.absorbed))),
      cell(candidatesText(slot.candidates.filter((candidate) => !candidate.absorbed))),
      marksOf(slot, section.kind),
    ]);
    return [
      `## The ${section.kind.name}s`,
      "",
      rows.length === 0 ? "None yet." : table(head, rows),
      "",
    ];
  });
  const modeRows =
    line.byMode.length === 0
      ? []
      : [
          "## The reshapes",
          "",
          "A reshape changes which steps a mode runs, or at what depth, so it names a mode rather than a slot.",
          "",
          table(
            ["Mode", "Candidates"],
            line.byMode.map((onMode) => [
              `\`${onMode.mode}\``,
              cell(candidatesText(onMode.candidates, true)),
            ]),
          ),
          "",
        ];
  const retiredRows =
    line.onRetired.length === 0
      ? []
      : [
          "## On a retired skill",
          "",
          "A candidate whose placement names a skill retired with no skill in its place stands on no slot, until a new placement names one.",
          "",
          table(
            ["Retired skill", "Candidates"],
            line.onRetired.map((on) => [
              `\`${on.skill}\``,
              cell(candidatesText(on.candidates, true)),
            ]),
          ),
          "",
        ];
  const pageRows =
    line.pages.length === 0
      ? []
      : [
          "## The pages",
          "",
          "Each roster skill's latest change and the installed pages it touched, by their path inside the skill's directory. `unknown` marks a change recorded before its entry named its pages; the index lists every change with its pages.",
          "",
          table(
            ["Skill", "Latest change", "Pages it touched"],
            line.pages.map((row) => [
              `\`${row.skill}\``,
              row.entry === undefined ? "none" : `\`${row.entry}\``,
              cell(pagesText(row.pages)),
            ]),
          ),
          "",
        ];
  const kinds = listed(
    line.sections.map((section) => articled(section.kind.name)),
    "or",
  );
  return `${[
    "# The line",
    "",
    `Generated by \`node scripts/corpus.mjs views\` from the modes definition \`corpus/runtime/modes.json\`, the manifest's skills and the entries under \`corpus/ledger/entries/\` (the source entries and each skill's latest change entry), and never edited by hand. The line is the ordered steps a mode runs. A slot is a position on it that one skill serves: ${kinds}. A slot's stack is the roster skills on it and the candidates whose placement names it, each with its source's latest verdict; a decline or a hand-off takes a candidate off its stack, and a hold keeps it there.`,
    "",
    "A source whose latest verdict is a copy, a combine or a lift, on a row a roster skill stands on, has entered that skill and is listed under Absorbed; any other is a pending candidate, listed under Candidates: one a hold keeps, and one whose slot no skill holds yet. A slot that more than one default skill serves is marked for the re-cut, which leaves one skill per slot. A slot whose pending candidates share a catch is marked as a combine candidate. A slot that a candidate's add names and nothing holds yet is marked as proposed. A candidate whose placement names a retired skill stands on the row of the skill that took its place.",
    "",
    ...body,
    ...modeRows,
    ...retiredRows,
    ...pageRows,
  ]
    .join("\n")
    .trimEnd()}\n`;
}
