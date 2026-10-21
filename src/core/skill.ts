/**
 * The skill corpus model (`docs/SPEC.md` §6). A skill is harness-neutral
 * prose plus one-line metadata; renderers project it into each harness's
 * conventions. The corpus feeds them through this shape, and so do the
 * test fixtures.
 */

export type HarnessName = "codex" | "claude-code";

/** How a skill is activated in a harness. */
export type ActivationMode = "implicit" | "explicit";

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
  /**
   * A kind of the modes definition (`corpus/runtime/modes.json`): the
   * trigger the loop runs the skill by and its contract with the loop.
   */
  readonly kind: string;
  /** For a skill whose kind the definition places on the line: the step it serves. */
  readonly slot?: string;
  readonly activation: ActivationMode;
  /**
   * A skill with a large asset tree that installs only when the workspace
   * manifest's `skills.include` names it. Data from the corpus manifest,
   * gate-asserted against the skill's real files.
   */
  readonly extra?: true;
  /** A new concept that is not yet a default; it runs only where the workspace enabled it. */
  readonly trial?: true;
  /** Harness-neutral markdown body (no frontmatter). */
  readonly body: string;
  /** Additional files projected alongside SKILL.md (guides, templates). */
  readonly supportFiles?: readonly SkillFile[];
}

/** A skill's optional facts as a reader collects them, each set only when stated, so an absent one has no key. */
export type SkillFacts = {
  -readonly [Fact in "slot" | "extra" | "trial" | "supportFiles"]?: NonNullable<SkillSource[Fact]>;
};

/** Installation availability is separate from selection for the current task. */
export function isSkillIncluded(
  skill: SkillSource,
  choices: { readonly include: readonly string[]; readonly exclude: readonly string[] },
): boolean {
  return (
    !choices.exclude.includes(skill.name) &&
    (skill.extra !== true || choices.include.includes(skill.name))
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
