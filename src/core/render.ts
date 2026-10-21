import { SKELETONS_LINE, type Installation } from "./installation.ts";
import type { CorpusIntent } from "./corpus.ts";
import { trialSkillNames, type Manifest } from "./manifest.ts";
import { isSkillMounted } from "./connectors/registry.ts";
import { renderRecordSkeleton } from "./change.ts";
import { renderModeTable, STEP_KIND, type ModesDefinition } from "./modes.ts";
import { displayName, type SkillSource } from "./skill.ts";
import { FILE_ADAPTERS, freshJson, JSON_ADAPTERS, type Harness } from "./adapters.ts";
import { GIT_HOOK_NAMES, gitHookScript, HOOKS_DIRECTORY } from "./git-hooks.ts";

/**
 * Renderers (`docs/SPEC.md` §6). Pure and deterministic: identical
 * manifest + skills produce byte-identical output on every platform
 * (LF endings, forward-slash paths, sorted file order). Codex consumes
 * `.agents/skills/<name>/SKILL.md` plus per-skill `agents/openai.yaml`
 * activation policy; Claude Code consumes `.claude/skills/<name>/SKILL.md`;
 * both always-loaded policies share the managed `AGENTS.md`/`CLAUDE.md`
 * blocks. The repo-root `agents/openai.yaml` is the machine-readable
 * activation catalog.
 */

/** The managed-block key for the always-loaded policy region. */
export const POLICY_BLOCK_KEY: string = "policy";

/**
 * One desired file: a whole file, a managed block's body, or a harness
 * configuration greenline merges its entries into (`json`), whose content is
 * the file a workspace without one gets; the lock owns greenline's entries alone.
 */
export interface DesiredFile {
  readonly path: string;
  readonly kind: "file" | "block" | "json";
  /** The block key when kind is "block". */
  readonly key: string | undefined;
  /** Owned region text: full file content for "file", block body for "block", the new file for "json". */
  readonly content: string;
  /** Written executable, as a git hook's script is, so git runs it and no registration changes its mode. */
  readonly executable?: boolean | undefined;
}

/** Deterministic YAML double-quoted scalar (valid JSON escaping). */
function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function quoted(fields: {
  readonly name: string;
  readonly description: string;
  readonly explicit: boolean;
}): string {
  const fence = fields.explicit ? "disable-model-invocation: true\n" : "";
  return `---\nname: ${yamlScalar(fields.name)}\ndescription: ${yamlScalar(fields.description)}\n${fence}---\n\n`;
}

/**
 * A rendered SKILL.md: frontmatter + harness-neutral body, one trailing
 * newline. `explicit` is Codex discovery metadata, not another user
 * approval step. The request's authority governs invocation; there is no
 * Claude frontmatter fence: `disable-model-invocation` blocked invocation even
 * after consent, dead-ending every explicit pipeline stage in headless
 * runs (the exam, three hits, both profiles; ADR 0013 supersedes 0009).
 */
export function renderSkillFile(skill: SkillSource): string {
  return (
    quoted({
      name: skill.name,
      description: skill.description,
      explicit: false,
    }) +
    skill.body.trimEnd() +
    "\n"
  );
}

/**
 * Per-skill Codex activation metadata (`agents/openai.yaml` inside the
 * skill directory). Explicit skills opt out of implicit invocation,
 * matching `policy.allow_implicit_invocation`.
 */
export function renderCodexSkillMetadata(skill: SkillSource): string {
  const lines = [
    `interface:`,
    `  display_name: ${yamlScalar(displayName(skill.name))}`,
    `  short_description: ${yamlScalar(skill.description)}`,
  ];
  if (skill.activation === "explicit") {
    lines.push(`policy:`, `  allow_implicit_invocation: false`);
  }
  return lines.join("\n") + "\n";
}

/** The root catalog: which skills are installed, where, their kind, and how they activate. */
export function renderCodexCatalog(skills: readonly SkillSource[]): string {
  const rows = skills.map(
    (skill) =>
      `  - name: ${yamlScalar(skill.name)}\n` +
      `    path: ${yamlScalar(`.agents/skills/${skill.name}`)}\n` +
      `    kind: ${yamlScalar(skill.kind)}\n` +
      `    activation: ${yamlScalar(skill.activation)}`,
  );
  return `version: 1\nskills:\n${rows.join("\n")}\n`;
}

/** What the block is composed from. */
export interface PolicyBlockInput {
  /** The authored prose, `corpus/runtime/agent.md`: working here, the request loop, authority. */
  readonly guide: string;
  /** The modes definition: the mode table, the floors, the kinds and their when-sentences, the line. */
  readonly modes: ModesDefinition;
  /** The skills installed in this workspace, as `renderProjection` decides them. */
  readonly installed: readonly SkillSource[];
  /** Every skill the workspace may install, the excluded left out; an extra among them that is not installed is listed as installing on request. */
  readonly available: readonly SkillSource[];
  /** The manifest's intent rows: the situations that key the skills of a kind beside the line. */
  readonly intents: readonly CorpusIntent[];
}

/** A trial skill beside the line is installed only where `trials` names it, so its row is marked as a trial alone. */
const TRIAL_ROW_MARK = " (trial)";

/** "a", "a or b", "a, b or c". */
function orList(items: readonly string[]): string {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} or ${items.at(-1) ?? ""}`;
}

/** A kind's name as the first word of a heading or a column, its first letter upper case. */
function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The floors, grouped by the mode each raises a proposal to, in the modes' order; empty with none. */
function renderFloors(modes: ModesDefinition): string {
  const groups = modes.modes.flatMap((mode) => {
    const risks = modes.floors.filter((floor) => floor.mode === mode.name).map((f) => f.risk);
    return risks.length === 0 ? [] : [`${mode.name} for ${orList(risks)}`];
  });
  return groups.length === 0
    ? ""
    : `A floor raises your proposal to at least the mode it names: ${groups.join("; ")}.`;
}

/**
 * The always-loaded policy region inside AGENTS.md (`workshop/components/block.md`):
 * the authored prose, then the mode table and the floors from the modes
 * definition, then the roster by kind, each kind in the definition's order
 * introduced once by its when-sentence. A kind placed on the line lists the
 * steps in the line's order with the skill serving each, which the mode
 * runs; a kind placed beside it is a table of the intent rows whose skills
 * are of that kind, keyed by the situation that calls each. A row keeps its
 * installed skills and an extra not installed, marked as installing on
 * request; a row with neither drops, and so does a kind with no row. The
 * steps' rows drop, since the line lists the steps. Descriptions stay in
 * each harness's per-skill metadata.
 */
export function renderAgentsPolicyBlock(input: PolicyBlockInput): string {
  const { modes } = input;
  const installed = new Set(input.installed.map((skill) => skill.name));
  // Every skill the block may name: an installed one, or an extra the
  // workspace has not asked for. Any other skill is absent and unnamed.
  const listed = new Map<string, SkillSource>([
    ...input.available
      .filter((skill) => skill.extra === true && !installed.has(skill.name))
      .map((skill): [string, SkillSource] => [skill.name, skill]),
    ...input.installed.map((skill): [string, SkillSource] => [skill.name, skill]),
  ]);
  const named = (skill: SkillSource, trialMarked: boolean): string => {
    const extra =
      skill.extra !== true
        ? ""
        : installed.has(skill.name)
          ? " (extra)"
          : " (extra, installs on request)";
    return `\`${skill.name}\`${extra}${skill.trial === true && !trialMarked ? TRIAL_ROW_MARK : ""}`;
  };
  const sections = modes.kinds.flatMap((kind) => {
    const ofKind = [...listed.values()].filter((skill) => skill.kind === kind.name);
    const body =
      kind.place === "ordered"
        ? renderLineOfKind(modes, kind.name, ofKind, named)
        : renderRowsOfKind(kind.name, input.intents, listed, named);
    return body === "" ? [] : [`## ${capitalized(kind.name)} skills\n\n${kind.when}\n\n${body}`];
  });
  const floors = renderFloors(modes);
  return [
    "> Owned region, generated by the greenline CLI. Do not edit.",
    input.guide.trim(),
    `## The modes\n\n${renderModeTable(modes).trimEnd()}${floors === "" ? "" : `\n\n${floors}`}`,
    ...sections,
  ].join("\n\n");
}

/**
 * The steps of a kind placed on the line, in the line's order, with the
 * skills serving each. The step kind lists every step, saying so where no
 * skill serves one; another kind lists the steps its skills stand at.
 */
function renderLineOfKind(
  modes: ModesDefinition,
  kindName: string,
  skills: readonly SkillSource[],
  named: (skill: SkillSource, trialMarked: boolean) => string,
): string {
  const lines = modes.steps.flatMap((step) => {
    const serving = skills.filter((skill) => skill.slot === step.name);
    if (serving.length === 0 && kindName !== STEP_KIND) return [];
    const [only] = serving;
    if (serving.length === 0) return [`${step.name}: no skill installed`];
    if (serving.length === 1 && only?.name === step.name) return [named(only, true)];
    return [`${step.name}: ${serving.map((skill) => named(skill, true)).join(", ")}`];
  });
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

/**
 * The intent rows whose skills are of a kind beside the line, in the
 * manifest's order, each keyed by its situation; empty when no row names a
 * skill the block may list.
 */
function renderRowsOfKind(
  kindName: string,
  intents: readonly CorpusIntent[],
  listed: ReadonlyMap<string, SkillSource>,
  named: (skill: SkillSource, trialMarked: boolean) => string,
): string {
  const rows = intents.flatMap((entry) => {
    const skills = entry.skills.flatMap((name) => {
      const skill = listed.get(name);
      return skill === undefined ? [] : [skill];
    });
    return skills.length === 0 || skills.some((skill) => skill.kind !== kindName)
      ? []
      : [`| ${entry.intent} | ${skills.map((skill) => named(skill, false)).join(", ")} |`];
  });
  return rows.length === 0
    ? ""
    : [`| The situation | ${capitalized(kindName)} |`, "| --- | --- |", ...rows].join("\n");
}

/**
 * The workspace's ledger guide, `.greenline/ledger/README.md`: the authored
 * guide with its skeletons line replaced by the skeleton of each mode,
 * generated from the modes definition (`renderRecordSkeleton`), so `sync`
 * regenerates it whenever the definition changes. The CLI's refusals of a
 * record cite this guide.
 * @param guide the authored guide, holding {@link SKELETONS_LINE} once
 * @param modes the modes definition
 * @returns the installed guide
 */
export function renderLedgerGuide(guide: string, modes: ModesDefinition): string {
  const listed = (names: readonly string[]): string =>
    names.length < 2
      ? names.map((name) => `\`${name}\``).join("")
      : `${names
          .slice(0, -1)
          .map((name) => `\`${name}\``)
          .join(", ")} and \`${names.at(-1) ?? ""}\``;
  const split = (holder: "plan" | "ticket"): readonly string[] =>
    modes.steps
      .filter((step) => step.whenSplit === holder || step.whenSplit === "both")
      .map((step) => step.name);
  const splitLine = `When the work is split into tickets, the planning record holds the sections of ${listed(split("plan"))}, and each ticket's record those of ${listed(split("ticket"))}. Each record holds its share whole, a step its mode does not run saying \`none at <mode>\`.`;
  const floorsLine =
    modes.floors.length === 0
      ? []
      : [
          `The \`floors\` field names each floor you found by its name: ${modes.floors.map((floor) => `\`${floor.name}\` for ${floor.risk}`).join("; ")}.`,
          "",
        ];
  const skeletons = [
    splitLine,
    "",
    ...floorsLine,
    ...modes.modes.flatMap((mode) => [
      `### ${mode.name}`,
      "",
      "```markdown",
      renderRecordSkeleton(modes, mode).trimEnd(),
      "```",
      "",
    ]),
  ]
    .join("\n")
    .trimEnd();
  return guide
    .split("\n")
    .map((line) => (line === SKELETONS_LINE ? skeletons : line))
    .join("\n");
}

/**
 * The working files' self-ignoring gitignore (operator ruling, 2026-08-29,
 * and C11 of 2026-10-04): a change's working files live in
 * `.greenline/tmp/<id>/` instead of host temp directories; only this file
 * is tracked, so a fresh clone heals on the first sync and nothing else
 * ever commits.
 */
export function renderTmpGitignore(): string {
  return (
    "# greenline: the working files of each change (tmp/<id>/).\n" +
    "# Nothing here is ever committed; what a change record relies on is\n" +
    "# copied into the change's folder under .greenline/ledger/ instead.\n" +
    "*\n!.gitignore\n"
  );
}

/** The always-loaded claude policy region inside CLAUDE.md. */
export function renderClaudePolicyBlock(): string {
  return `> Owned region, generated by the greenline CLI. Do not edit.\n\n@AGENTS.md`;
}

function byNameThenPath(a: DesiredFile, b: DesiredFile): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

/**
 * Compose the entire desired set for a workspace: harness projections,
 * the activation catalog, and both managed policy blocks. Blocks are
 * emitted even with zero skills so the owned region always exists.
 * Output is sorted by path and byte-deterministic.
 */
export function renderProjection(
  manifest: Manifest,
  installation: Installation,
  present: ReadonlySet<Harness> = new Set(),
): readonly DesiredFile[] {
  const { skills, intents, ledgerGuide, agentGuide, workGuide } = installation;
  // A trial skill beside the line installs only where the workspace's
  // `trials` names it, as a connector's skill installs only while it is
  // enabled; no skill on the line is a trial (J-93 S1).
  const trialSkills = new Set(trialSkillNames(installation.modes, skills));
  const mounted = (skill: SkillSource): boolean =>
    isSkillMounted(skill, manifest.skills, manifest.connectors) &&
    (!trialSkills.has(skill.name) || manifest.trials.includes(skill.name));
  const selected = [...skills].filter(mounted).sort((a, b) => (a.name < b.name ? -1 : 1));
  const files: DesiredFile[] = [];

  if (manifest.targets.includes("codex") && selected.length > 0) {
    files.push({
      path: "agents/openai.yaml",
      kind: "file",
      key: undefined,
      content: renderCodexCatalog(selected),
    });
    for (const skill of selected) {
      files.push({
        path: `.agents/skills/${skill.name}/SKILL.md`,
        kind: "file",
        key: undefined,
        content: renderSkillFile(skill),
      });
      files.push({
        path: `.agents/skills/${skill.name}/agents/openai.yaml`,
        kind: "file",
        key: undefined,
        content: renderCodexSkillMetadata(skill),
      });
      for (const file of skill.supportFiles ?? []) {
        files.push({
          path: `.agents/skills/${skill.name}/${file.path}`,
          kind: "file",
          key: undefined,
          content: file.content,
        });
      }
    }
  }
  if (manifest.targets.includes("claude-code")) {
    for (const skill of selected) {
      files.push({
        path: `.claude/skills/${skill.name}/SKILL.md`,
        kind: "file",
        key: undefined,
        content: renderSkillFile(skill),
      });
      for (const file of skill.supportFiles ?? []) {
        files.push({
          path: `.claude/skills/${skill.name}/${file.path}`,
          kind: "file",
          key: undefined,
          content: file.content,
        });
      }
    }
  }
  files.push({ path: ".greenline/WORK.md", kind: "file", key: undefined, content: workGuide });
  files.push({
    path: ".greenline/THIRD_PARTY_NOTICES.md",
    kind: "file",
    key: undefined,
    content: installation.notices,
  });
  files.push({
    path: ".greenline/ledger/README.md",
    kind: "file",
    key: undefined,
    content: renderLedgerGuide(ledgerGuide, installation.modes),
  });
  files.push({
    path: ".greenline/tmp/.gitignore",
    kind: "file",
    key: undefined,
    content: renderTmpGitignore(),
  });
  files.push({
    path: "AGENTS.md",
    kind: "block",
    key: POLICY_BLOCK_KEY,
    content: renderAgentsPolicyBlock({
      guide: agentGuide,
      modes: installation.modes,
      installed: selected,
      // An excluded skill is never offered: an exclusion wins over an include.
      available: skills.filter(
        (skill) =>
          !manifest.skills.exclude.includes(skill.name) &&
          (!trialSkills.has(skill.name) || manifest.trials.includes(skill.name)),
      ),
      intents,
    }),
  });
  files.push({
    path: "CLAUDE.md",
    kind: "block",
    key: POLICY_BLOCK_KEY,
    content: renderClaudePolicyBlock(),
  });
  files.push(...renderHookFiles(manifest, present));
  return files.sort(byNameThenPath);
}

/**
 * The hooks' files (`workshop/components/installation-payload.md`, "The git
 * hooks and the adapters"): the git hooks' scripts under `.greenline/hooks/`
 * while `hooks.git` is on, and, while `hooks.adapters` is on, the adapter of
 * each harness present: Claude Code and Codex where the targets name them,
 * the others where the shell found their files, and dsh's always, since its
 * bridge is the owner's to mount.
 * @param manifest the workspace's settings
 * @param present the harnesses the repository shows beside the targets
 * @returns the desired files
 */
export function renderHookFiles(
  manifest: Manifest,
  present: ReadonlySet<Harness>,
): readonly DesiredFile[] {
  const files: DesiredFile[] = [];
  if (manifest.hooks.git)
    for (const name of GIT_HOOK_NAMES)
      files.push({
        path: `${HOOKS_DIRECTORY}/${name}`,
        kind: "file",
        key: undefined,
        content: gitHookScript(name),
        executable: true,
      });
  if (!manifest.hooks.adapters) return files;
  const harnesses = new Set<Harness>([...present, "dsh"]);
  if (manifest.targets.includes("claude-code")) harnesses.add("claude-code");
  if (manifest.targets.includes("codex")) harnesses.add("codex");
  for (const adapter of JSON_ADAPTERS)
    if (harnesses.has(adapter.harness))
      files.push({ path: adapter.path, kind: "json", key: undefined, content: freshJson(adapter) });
  for (const adapter of FILE_ADAPTERS)
    if (harnesses.has(adapter.harness))
      files.push({ path: adapter.path, kind: "file", key: undefined, content: adapter.content });
  return files;
}
