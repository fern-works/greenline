import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  connectorChoiceIssues,
  connectorsSchema,
  type ConnectorsConfiguration,
} from "./connectors/registry.ts";
import {
  checkContractVersion,
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
  type InvalidField,
} from "./contract.ts";
import { kindNamed, type ModesDefinition } from "./modes.ts";
import { declaredCheckSchema, type DeclaredCheck } from "./checks.ts";
import { DEFAULT_FILE_TOKENS } from "./file-tokens.ts";
import { GROUND_SETTINGS, type GroundSetting } from "./ground.ts";
import { FRAMEWORKS, PLATFORMS, type Framework, type Platform } from "./interface-facets.ts";

export const MANIFEST_SCHEMA_VERSION = 6 as const;
export type TargetName = "codex" | "claude-code";
/** The `proceed` setting's value that lets the agent proceed under no mode without waiting. */
export const NO_PROCEED = "none";
/** Repository installation choices; engineering policy stays in the decision home. */
export interface Manifest {
  readonly schemaVersion: 6;
  readonly targets: readonly TargetName[];
  readonly skills: { readonly exclude: readonly string[]; readonly include: readonly string[] };
  /** The enabled connectors; an absent entry, or an absent map, means disabled. */
  readonly connectors: ConnectorsConfiguration;
  /**
   * The `proceed` setting: `none`, the default, or a mode of the modes
   * definition. At a mode the agent proceeds without waiting for that mode
   * and every faster one, and waits for the slower.
   */
  readonly proceed: string;
  /**
   * The `ground` setting, the owner's standing preference for where a
   * change's work goes: `branch`, a branch of its own in place, or
   * `worktree`, a worktree of its own; the proposal states it instead of
   * asking. Absent, the proposal offers the two each time.
   */
  readonly ground?: GroundSetting | undefined;
  /** The trial skills this workspace enabled, each a start or a habit; a trial skill not listed is not installed. */
  readonly trials: readonly string[];
  /** The checks this workspace declares (`src/core/checks.ts`): what a recorded command is matched against, and what pre-commit reads before a done. */
  readonly checks: readonly DeclaredCheck[];
  /** Whether init and sync install the git hooks and the harness adapters; each is on by default. */
  readonly hooks: HookSettings;
  /**
   * The file token cap's opt-in (J-114 S4, `src/core/file-tokens.ts`): the
   * cap an authored file stays under, 5,000 tokens by default, and the
   * globs exempt beside the standard ones; absent, the workspace takes no
   * cap and the plan declares no check for it.
   */
  readonly fileTokens?: FileTokensSetting | undefined;
  /**
   * The interface block (J-123 S1; `workshop/components/interface-practice.md`,
   * "The fact"): the roots and the extensions of the workspace's interface,
   * its platform and frameworks with the evidence that named them, whether
   * the owner confirmed them, and the interface check's opt-in. init and
   * sync write it where an interface exists; absent, the workspace has none.
   */
  readonly interface?: InterfaceSetting | undefined;
}
/** The interface block's setting. */
export interface InterfaceSetting {
  readonly roots: readonly string[];
  readonly extensions: readonly string[];
  readonly platform: Platform;
  readonly frameworks: readonly Framework[];
  /** One line per detected fact, `<fact>: <what named it>`. */
  readonly evidence: readonly string[];
  /** Whether the owner confirmed the detected facts through cards; sync detects again until then. */
  readonly confirmed: boolean;
  /** The interface check's opt-in: on, an interface change's plan declares `greenline check interface`. */
  readonly check: boolean;
}
/** The file token cap's setting: the cap in tokens, and the workspace's own exemptions. */
export interface FileTokensSetting {
  readonly cap: number;
  readonly exempt: readonly string[];
}
/** The hooks settings: `git` registers the git hooks, `adapters` writes one adapter per harness present. */
export interface HookSettings {
  readonly git: boolean;
  readonly adapters: boolean;
}
/** Both mechanisms on, the default init writes. */
export const HOOKS_ON: HookSettings = { git: true, adapters: true };
/** What a manifest's names are checked against when the installation is loaded: its skills and its modes. */
export interface ManifestRoster {
  readonly skills: readonly string[];
  /** The trial skills `trials` may name (`trialSkillNames`). */
  readonly trials: readonly string[];
  readonly modes: ModesDefinition;
}
/** An interface root: `.` for the whole repository, or a relative directory that never leaves it. */
const INTERFACE_ROOT = /^(?:\.|(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\0\\]*[^/\0\\])$/;
const identifier = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "a name is lower case, digits and hyphens");
const schema = z
  .object({
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    targets: z.array(z.enum(["codex", "claude-code"])).min(1),
    skills: z
      .object({
        exclude: z.array(z.string().min(1)).default([]),
        include: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .default({ exclude: [], include: [] }),
    connectors: connectorsSchema.default({}),
    // Both settings are checked against the modes definition where the installation loads.
    proceed: identifier.default(NO_PROCEED),
    ground: z
      .string()
      .refine((value): value is GroundSetting => GROUND_SETTINGS.some((name) => name === value), {
        message: `ground is ${GROUND_SETTINGS.join(" or ")}, or absent for the offer each time`,
      })
      .optional(),
    trials: z.array(identifier).default([]),
    checks: z.array(declaredCheckSchema).default([]),
    hooks: z
      .object({ git: z.boolean().default(true), adapters: z.boolean().default(true) })
      .strict()
      .default(HOOKS_ON),
    fileTokens: z
      .object({
        cap: z.number().int().min(1).default(DEFAULT_FILE_TOKENS),
        exempt: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .optional(),
    interface: z
      .object({
        roots: z
          .array(z.string().regex(INTERFACE_ROOT, "a root is `.` or a directory from the root"))
          .min(1),
        extensions: z
          .array(z.string().regex(/^[a-z0-9]+$/, "an extension, without its dot"))
          .min(1),
        platform: z.enum(PLATFORMS),
        frameworks: z.array(z.enum(FRAMEWORKS)).default([]),
        evidence: z.array(z.string().min(1)).default([]),
        confirmed: z.boolean().default(false),
        check: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * The trial skills the workspace's `trials` setting enables by name: each
 * skill flagged `trial` whose kind the definition places beside the line, a
 * start or a habit today (S17 of the plan modes-records-recipes). No step is
 * a trial since J-93 S1, so a skill on the line is never one.
 * @param definition the modes definition
 * @param skills the installation's skills, each with its kind and its flag
 * @returns their names, in the skills' order
 */
export function trialSkillNames(
  definition: ModesDefinition,
  skills: readonly { readonly name: string; readonly kind: string; readonly trial?: true }[],
): readonly string[] {
  return skills
    .filter(
      (skill) => skill.trial === true && kindNamed(definition, skill.kind)?.place === "beside",
    )
    .map((skill) => skill.name);
}

/**
 * The two settings against the loaded installation: `proceed` is none or a
 * mode of the definition, and every entry of `trials` is one of the
 * installation's trial skills.
 */
function settingIssues(
  proceed: string,
  trials: readonly string[],
  roster: ManifestRoster,
): readonly InvalidField[] {
  const { modes } = roster;
  const issues: InvalidField[] = [];
  const modeNames: readonly string[] = modes.modes.map((entry) => entry.name);
  if (proceed !== NO_PROCEED && !modeNames.includes(proceed))
    issues.push({
      path: "proceed",
      message: `proceed is ${[NO_PROCEED, ...modeNames].join(", ")}, not '${proceed}'`,
    });
  const skills =
    roster.trials.length === 0
      ? "the installation holds no trial skill"
      : `the trial skills are ${roster.trials.join(", ")}`;
  for (const [index, name] of trials.entries())
    if (!roster.trials.includes(name))
      issues.push({
        path: `trials[${index}]`,
        message: `'${name}' is not a trial skill; ${skills}`,
      });
  return issues;
}

/**
 * Parse the installation contract. With the installation loaded, the skill
 * names, `proceed` and `trials` are checked against its skills and modes;
 * without it they are read as written and checked wherever it loads.
 * @param input the manifest's text
 * @param source where the text came from, for the refusal
 * @param roster the installation's skills and modes, when it is loaded
 * @returns the manifest, or every issue found
 */
export function parseManifest(
  input: string,
  source: string,
  roster?: ManifestRoster,
): Result<Manifest, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [{ path: "", message: "manifest is not valid JSON" }]);
  const version = checkContractVersion(raw, "manifest", MANIFEST_SCHEMA_VERSION);
  if (version !== undefined) return contractFailure(source, [version]);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  for (const [field, values] of [
    ["targets", parsed.data.targets],
    ["skills.include", parsed.data.skills.include],
    ["skills.exclude", parsed.data.skills.exclude],
    ["trials", parsed.data.trials],
  ] as const)
    if (new Set(values).size !== values.length)
      return contractFailure(source, [
        { path: field, message: `Duplicate entry: ${values.join(", ")}` },
      ]);
  const connectorIssues = connectorChoiceIssues(parsed.data.skills, parsed.data.connectors);
  if (connectorIssues.length > 0) return contractFailure(source, connectorIssues);
  // Two declarations under one name would make a matched run's check ambiguous.
  const checkNames = parsed.data.checks.map((check) => check.name);
  if (new Set(checkNames).size !== checkNames.length)
    return contractFailure(source, [
      { path: "checks", message: `Duplicate check name: ${checkNames.join(", ")}` },
    ]);
  if (roster !== undefined) {
    const known = new Set(roster.skills);
    const issues: InvalidField[] = (["include", "exclude"] as const).flatMap((field) =>
      parsed.data.skills[field].flatMap((name, index) =>
        known.has(name)
          ? []
          : [
              {
                path: `skills.${field}[${index}]`,
                message: `Unknown skill '${name}'; see the installed skill list in AGENTS.md.`,
              },
            ],
      ),
    );
    issues.push(...settingIssues(parsed.data.proceed, parsed.data.trials, roster));
    if (issues.length > 0) return contractFailure(source, issues);
  }
  return contractOk(parsed.data);
}
/** Deterministic manifest serialization; the settings always appear but `ground`, `fileTokens` and `interface`, each written only where it is set, and the connectors map only while it holds an entry. */
export function serializeManifest(manifest: Manifest): string {
  const head = {
    schemaVersion: manifest.schemaVersion,
    targets: manifest.targets,
    skills: manifest.skills,
    proceed: manifest.proceed,
  };
  const settings = { trials: manifest.trials, checks: manifest.checks, hooks: manifest.hooks };
  // The file token cap's opt-in follows the hooks only where the workspace takes it.
  const capped =
    manifest.fileTokens === undefined ? settings : { ...settings, fileTokens: manifest.fileTokens };
  // The interface block follows where the workspace has an interface.
  const tail =
    manifest.interface === undefined ? capped : { ...capped, interface: manifest.interface };
  // The fields in their order, `ground` among them only where it is set.
  const choices =
    manifest.ground === undefined
      ? { ...head, ...tail }
      : { ...head, ground: manifest.ground, ...tail };
  const enabled = Object.values(manifest.connectors).some((entry) => entry !== undefined);
  const document = enabled ? { ...choices, connectors: manifest.connectors } : choices;
  return JSON.stringify(document, null, 2) + "\n";
}
