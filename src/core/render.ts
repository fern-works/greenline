import type { Installation } from "./installation.ts";
import type { CorpusIntent } from "./corpus.ts";
import type { Manifest } from "./manifest.ts";
import { isSkillMounted } from "./connectors/registry.ts";
import { SKILL_CLASSES, displayName, type SkillSource } from "./skill.ts";

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

/** One desired file: whole-file or a managed block body. */
export interface DesiredFile {
  readonly path: string;
  readonly kind: "file" | "block";
  /** The block key when kind is "block". */
  readonly key: string | undefined;
  /** Owned region text: full file content for "file", block body for "block". */
  readonly content: string;
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

/** The root catalog: which skills are installed, where, their class, and how they activate. */
export function renderCodexCatalog(skills: readonly SkillSource[]): string {
  const rows = skills.map(
    (skill) =>
      `  - name: ${yamlScalar(skill.name)}\n` +
      `    path: ${yamlScalar(`.agents/skills/${skill.name}`)}\n` +
      `    class: ${yamlScalar(skill.class)}\n` +
      `    activation: ${yamlScalar(skill.activation)}`,
  );
  return `version: 1\nskills:\n${rows.join("\n")}\n`;
}

/**
 * The always-loaded codex policy region inside AGENTS.md. The
 * intent-to-skill table is corpus data (`docs/SPEC.md` §8), passed in
 * by the caller; a row whose skills are all excluded from the
 * workspace drops entirely. The roster records installed presence; the
 * agent interprets these authored pointers under the request's authority.
 */
export function renderAgentsPolicyBlock(
  skills: readonly SkillSource[],
  intents: readonly CorpusIntent[] = [],
  guide = "",
): string {
  // Presence and class; harness-specific discovery policy stays in its metadata.
  const roster = SKILL_CLASSES.flatMap((skillClass) => {
    const names = skills.filter((skill) => skill.class === skillClass).map((skill) => skill.name);
    return names.length === 0 ? [] : [`- ${skillClass}: ${names.join(", ")}`];
  }).join("\n");
  const selected = new Map(skills.map((skill) => [skill.name, skill.class]));
  const rank = (entry: CorpusIntent): number =>
    SKILL_CLASSES.indexOf(selected.get(entry.skills[0] ?? "") ?? "entry");
  // Rows keep the manifest's order within a class; classes follow the roster.
  const ordered = intents
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index);
  const intentRows = ordered.flatMap(({ entry }) => {
    const names = entry.skills.filter((name) => selected.has(name));
    return names.length === 0 ? [] : [`| ${entry.intent} | ${names.join(", ")} |`];
  });
  const table =
    intentRows.length === 0
      ? ""
      : `\n\n## What to load when\n\n${[
          "| What you are doing | Skill to load |",
          "| --- | --- |",
          ...intentRows,
        ].join("\n")}`;
  return (
    `> Owned region, generated by the greenline CLI. Do not edit.\n\n` +
    `${guide.trim()}\n\n` +
    `## Installed skills\n\n${roster}${table}`
  );
}

/**
 * The ephemeral skill workspace's self-ignoring gitignore (operator
 * ruling, 2026-08-29): skills scratch in `.greenline/tmp/<skill>/`
 * instead of host temp directories; only this file is tracked, so a
 * fresh clone heals on the first sync and nothing else ever commits.
 */
export function renderTmpGitignore(): string {
  return (
    "# greenline: the ephemeral skill workspace (tmp/<skill>/).\n" +
    "# Nothing here is ever committed; evidence a ticket relies on is\n" +
    "# promoted to the owning ticket's evidence instead.\n" +
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
): readonly DesiredFile[] {
  const { skills, intents, ledgerGuide, agentGuide, workGuide } = installation;
  const selected = [...skills]
    .filter((skill) => isSkillMounted(skill, manifest.skills, manifest.connectors))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
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
  if (ledgerGuide !== undefined)
    files.push({
      path: ".greenline/ledger/README.md",
      kind: "file",
      key: undefined,
      content: ledgerGuide,
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
    content: renderAgentsPolicyBlock(selected, intents, agentGuide),
  });
  files.push({
    path: "CLAUDE.md",
    kind: "block",
    key: POLICY_BLOCK_KEY,
    content: renderClaudePolicyBlock(),
  });
  return files.sort(byNameThenPath);
}
