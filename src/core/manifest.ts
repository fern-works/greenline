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
  /** The trial skills this workspace enabled, each a start or a habit; a trial skill not listed is not installed. */
  readonly trials: readonly string[];
  /** The checks this workspace declares (`src/core/checks.ts`): what a recorded command is matched against, and what pre-commit reads before a done. */
  readonly checks: readonly DeclaredCheck[];
  /** Whether init and sync install the git hooks and the harness adapters; each is on by default. */
  readonly hooks: HookSettings;
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
    trials: z.array(identifier).default([]),
    checks: z.array(declaredCheckSchema).default([]),
    hooks: z
      .object({ git: z.boolean().default(true), adapters: z.boolean().default(true) })
      .strict()
      .default(HOOKS_ON),
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
/** Deterministic manifest serialization; the settings always appear, the connectors map only while it holds an entry. */
export function serializeManifest(manifest: Manifest): string {
  const choices = {
    schemaVersion: manifest.schemaVersion,
    targets: manifest.targets,
    skills: manifest.skills,
    proceed: manifest.proceed,
    trials: manifest.trials,
    checks: manifest.checks,
    hooks: manifest.hooks,
  };
  const enabled = Object.values(manifest.connectors).some((entry) => entry !== undefined);
  const document = enabled ? { ...choices, connectors: manifest.connectors } : choices;
  return JSON.stringify(document, null, 2) + "\n";
}
