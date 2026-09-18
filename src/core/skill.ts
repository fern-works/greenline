/**
 * The skill corpus model (`docs/SPEC.md` §6). A skill is harness-neutral
 * prose plus one-line metadata; renderers project it into each harness's
 * conventions. The real corpus arrives in M2; until then fixtures feed
 * the renderers through the same shape.
 */

export type HarnessName = "codex" | "claude-code";

/** How a skill is activated in a harness. */
export type ActivationMode = "implicit" | "explicit";

/**
 * What kind of method a skill is (ADR 0039): the class decides conduct.
 * An entry resolves the work and the next method; a stage of the delivery
 * arc consumes an artifact and produces the next; a support skill gathers
 * evidence for the stage that dispatched it; a discipline is applied on
 * the agent's own judgment; a situational skill fires on a situation in
 * the conversation and is offered when its output is a durable file.
 */
export type SkillClass = "entry" | "stage" | "support" | "discipline" | "situational";

export const SKILL_CLASSES = ["entry", "stage", "support", "discipline", "situational"] as const;

/** The activation each class implies. */
export interface ClassActivation {
  readonly entry: ActivationMode;
  readonly stage: ActivationMode;
  readonly support: ActivationMode;
  readonly discipline: ActivationMode;
  readonly situational: ActivationMode;
}

/** The activation a class implies; a manifest entry states activation only to differ. */
export const CLASS_ACTIVATION: ClassActivation = {
  entry: "implicit",
  stage: "explicit",
  support: "implicit",
  discipline: "implicit",
  situational: "implicit",
};

/** A support file inside a skill directory (path relative to the skill root). */
export interface SkillFile {
  readonly path: string;
  readonly content: string;
}

export interface SkillSource {
  /** greenline name, kebab-case. */
  readonly name: string;
  /** One-line, harness-neutral description used for discovery. */
  readonly description: string;
  readonly class: SkillClass;
  readonly activation: ActivationMode;
  /**
   * Opt-in membership (ADR 0029): a skill carrying a non-markdown
   * asset tree installs only when the workspace manifest's
   * `skills.include` names it. Data from the
   * corpus manifest, gate-asserted against the skill's real files.
   */
  readonly optIn?: true;
  /** Harness-neutral markdown body (no frontmatter). */
  readonly body: string;
  /** Additional files projected alongside SKILL.md (guides, templates). */
  readonly supportFiles?: readonly SkillFile[];
}

/** Installation availability is separate from selection for the current task. */
export function isSkillIncluded(
  skill: SkillSource,
  choices: { readonly include: readonly string[]; readonly exclude: readonly string[] },
): boolean {
  return (
    !choices.exclude.includes(skill.name) &&
    (skill.optIn !== true || choices.include.includes(skill.name))
  );
}

/** "delivery-review" -> "Delivery Review" (user-facing display names). */
export function displayName(name: string): string {
  return name
    .split("-")
    .map((part) =>
      ["tdd", "cli", "ui"].includes(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}
