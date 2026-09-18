import { z } from "zod";
import { ok, type Result } from "../commons/result.ts";
import { contractFailure, issuesFrom, parseJson, type ContractParseFailed } from "./contract.ts";
import { CLASS_ACTIVATION, SKILL_CLASSES, type ActivationMode, type SkillClass } from "./skill.ts";

/**
 * The corpus manifest (`corpus/manifest.json`, `docs/SPEC.md` §10): the
 * pinned upstream families plus the roster. Every roster skill is one
 * directory under `corpus/skills/<name>/` holding the text the consumer
 * installs; a vendored skill also names the upstream it was copied from
 * and the ledger entry that last touched it (`workshop/components/ledger.md`,
 * from ADR 0039). The manifest carries only what the text cannot: the class, an
 * activation that differs from the class default, membership and pins.
 */

const CORPUS_SCHEMA_VERSION = 8 as const;

/**
 * One pinned upstream family (e.g. mattpocock-skills, ponytail), under MIT.
 * The copyright line the notices print is the snapshot's licence file's; a
 * family whose snapshot carries no licence file states it as `holder` (the
 * notices view, `workshop/components/ledger.md`).
 */
export interface CorpusUpstream {
  readonly name: string;
  readonly repo: string;
  readonly commit: string;
  readonly license: "MIT";
  readonly snapshot: string;
  /** The copyright line, e.g. `Copyright (c) 2026 A. Name`, for a family whose snapshot carries no licence file. */
  readonly holder?: string | undefined;
}

/** Where a vendored copy came from: a family, the skill's name there, and its path in the repository. */
export interface CorpusUpstreamOrigin {
  readonly family: string;
  readonly name: string;
  readonly path: string;
}

/** One roster skill. Without `upstream` it is greenline-native and has nothing to diverge from. */
export interface CorpusSkillEntry {
  readonly name: string;
  readonly class: SkillClass;
  /** Stated only when it differs from the class default: a visible exception, not drift. */
  readonly activation?: ActivationMode | undefined;
  /** Opt-in membership (ADR 0029): carries a non-markdown asset tree. */
  readonly optIn?: true | undefined;
  readonly upstream?: CorpusUpstreamOrigin | undefined;
  /** The ledger entry that last touched the skill, at that entry's own revision; a pending acquisition may omit it, and distribution refuses an unrecorded copy. */
  readonly ledger?: { readonly id: string; readonly revision: string } | undefined;
  /** The credit text the notices view prints after an opt-in copy's name, for the assets the copy carries; refused without `optIn`. */
  readonly credits?: string | undefined;
}

/** The activation an entry carries: its own when stated, otherwise its class default. */
export function activationOf(entry: CorpusSkillEntry): ActivationMode {
  return entry.activation ?? CLASS_ACTIVATION[entry.class];
}

/** A vendored entry names its upstream origin. */
export function isVendored(
  entry: CorpusSkillEntry,
): entry is CorpusSkillEntry & { readonly upstream: CorpusUpstreamOrigin } {
  return entry.upstream !== undefined;
}

/** One row of the always-loaded intent-to-skill table (`docs/SPEC.md` §8). */
export interface CorpusIntent {
  readonly intent: string;
  readonly skills: readonly string[];
}

export interface CorpusManifest {
  readonly schemaVersion: typeof CORPUS_SCHEMA_VERSION;
  readonly upstreams: readonly CorpusUpstream[];
  readonly skills: readonly CorpusSkillEntry[];
  readonly intents: readonly CorpusIntent[];
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Repo-relative POSIX paths without traversal. A leading dot segment is
 * allowed (`.agents/rules/ponytail.md` is a real upstream path); `..`
 * traversal is rejected separately by `hasNoTraversal`.
 */
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*\/$)[\w.][\w./-]*$/;

function hasNoTraversal(path: string): boolean {
  return path.split("/").every((segment) => segment !== ".." && segment !== ".");
}

const upstreamBase = {
  name: z.string().regex(KEBAB_CASE),
  repo: z.string().url(),
  commit: z.string().regex(/^[0-9a-f]{40}$/, "full 40-hex commit"),
  snapshot: z.string().regex(SAFE_RELATIVE_PATH),
};
// Every family is under MIT; a family whose snapshot carries no licence file
// states its copyright line as holder.
const upstreamSchema = z
  .object({
    ...upstreamBase,
    license: z.literal("MIT"),
    holder: z
      .string()
      .regex(/^Copyright \(c\) \d{4} .+$/)
      .optional(),
  })
  .strict();

const skillEntrySchema = z
  .object({
    name: z.string().regex(KEBAB_CASE),
    class: z.enum(SKILL_CLASSES),
    activation: z.enum(["implicit", "explicit"]).optional(),
    optIn: z.literal(true).optional(),
    upstream: z
      .object({
        family: z.string().regex(KEBAB_CASE),
        name: z.string().regex(KEBAB_CASE),
        path: z.string().regex(SAFE_RELATIVE_PATH),
      })
      .strict()
      .optional(),
    ledger: z
      .object({ id: z.string().regex(KEBAB_CASE), revision: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .optional(),
    credits: z.string().trim().min(1).optional(),
  })
  .refine(
    (entry) => entry.credits === undefined || entry.optIn === true,
    "credits belong to the assets an opt-in copy carries",
  )
  .strict()
  .refine(
    (entry) => entry.activation === undefined || entry.activation !== CLASS_ACTIVATION[entry.class],
    "activation is stated only when it differs from the class default",
  );

const corpusManifestSchema = z
  .object({
    schemaVersion: z.literal(CORPUS_SCHEMA_VERSION),
    upstreams: z.array(upstreamSchema).min(1),
    skills: z.array(skillEntrySchema).min(1),
    intents: z
      .array(
        z
          .object({
            intent: z.string().min(1),
            skills: z.array(z.string().regex(KEBAB_CASE)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

function uniquenessIssues(skills: readonly z.infer<typeof skillEntrySchema>[]): readonly {
  path: string;
  message: string;
}[] {
  const issues: { path: string; message: string }[] = [];
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const [index, skill] of skills.entries()) {
    if (names.has(skill.name)) {
      issues.push({
        path: `skills[${index}].name`,
        message: `duplicate skill name '${skill.name}'`,
      });
    }
    names.add(skill.name);
    if (skill.upstream !== undefined) {
      const key = `${skill.upstream.family}:${skill.upstream.path}`;
      if (paths.has(key)) {
        issues.push({
          path: `skills[${index}].upstream.path`,
          message: `duplicate upstream path '${key}'`,
        });
      }
      paths.add(key);
    }
  }
  return issues;
}

/** Family names are unique, and every vendored skill names a pinned family. */
function familyIssues(
  manifest: z.infer<typeof corpusManifestSchema>,
): readonly { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const families = new Set<string>();
  for (const [index, upstream] of manifest.upstreams.entries()) {
    if (families.has(upstream.name)) {
      issues.push({
        path: `upstreams[${index}].name`,
        message: `duplicate upstream family '${upstream.name}'`,
      });
    }
    families.add(upstream.name);
  }
  for (const [index, skill] of manifest.skills.entries()) {
    if (skill.upstream !== undefined && !families.has(skill.upstream.family)) {
      issues.push({
        path: `skills[${index}].upstream.family`,
        message: `unknown upstream family '${skill.upstream.family}'`,
      });
    }
  }
  return issues;
}

/** Parse and validate corpus manifest text into the normalized model. */
export function parseCorpusManifest(
  input: string,
  source: string,
): Result<CorpusManifest, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined) {
    return contractFailure(source, [{ path: "", message: "corpus manifest is not valid JSON" }]);
  }
  const parsed = corpusManifestSchema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const pathIssues = [
    ...uniquenessIssues(parsed.data.skills),
    ...familyIssues(parsed.data),
    ...[
      ...parsed.data.upstreams.map((upstream) => upstream.snapshot),
      ...parsed.data.skills.flatMap((skill) =>
        skill.upstream === undefined ? [] : [skill.upstream.path],
      ),
    ]
      .filter((path) => !hasNoTraversal(path))
      .map((path) => ({ path: "upstream", message: `path escapes the corpus: '${path}'` })),
    ...intentIssues(parsed.data),
  ];
  if (pathIssues.length > 0) return contractFailure(source, pathIssues);
  return ok({
    schemaVersion: parsed.data.schemaVersion,
    upstreams: parsed.data.upstreams,
    skills: parsed.data.skills,
    intents: parsed.data.intents,
  });
}

/** Every intent row names at least one skill on the roster. */
function intentIssues(
  manifest: z.infer<typeof corpusManifestSchema>,
): readonly { path: string; message: string }[] {
  const roster = new Set(manifest.skills.map((skill) => skill.name));
  const issues: { path: string; message: string }[] = [];
  for (const [index, entry] of manifest.intents.entries()) {
    for (const [skillIndex, name] of entry.skills.entries()) {
      if (!roster.has(name)) {
        issues.push({
          path: `intents[${index}].skills[${skillIndex}]`,
          message: `intent names '${name}', which is not on the roster`,
        });
      }
    }
  }
  return issues;
}
