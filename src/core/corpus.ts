import { z } from "zod";
import { ok, type Result } from "../commons/result.ts";
import {
  checkContractVersion,
  contractFailure,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { Kind, ModesDefinition } from "./modes.ts";
import type { ActivationMode } from "./skill.ts";

/**
 * The corpus manifest (`corpus/manifest.json`, `docs/SPEC.md` §10): the
 * pinned sources plus the roster. Every roster skill is one
 * directory under `corpus/skills/<name>/` holding the text the consumer
 * installs, generated from its recipe (`workshop/components/recipes.md`);
 * a vendored skill also names the source it was copied from. The manifest
 * carries only what the text cannot: the kind and the slot on the line,
 * the flags, an activation that differs from the one the kind's mechanism
 * implies, and pins. The kinds are the modes definition's
 * (`corpus/runtime/modes.json`), so this parse takes a kind's name as it
 * stands, and `verify` checks it, the slot and the activation against the
 * definition (`kindIssues`, `src/corpus/line.ts`).
 */

const CORPUS_SCHEMA_VERSION = 11 as const;

/**
 * One pinned source (e.g. mattpocock-skills, ponytail), under MIT, which a
 * recipe names by its `name`. The copyright line the notices print is the
 * snapshot's licence file's; a source whose snapshot carries no licence file
 * states it as `holder` (the notices view, `workshop/components/ledger.md`).
 */
export interface CorpusSource {
  readonly name: string;
  readonly repo: string;
  readonly commit: string;
  readonly license: "MIT";
  readonly snapshot: string;
  /** The copyright line, e.g. `Copyright (c) 2026 A. Name`, for a source whose snapshot carries no licence file. */
  readonly holder?: string | undefined;
}

/** What holds a placed phrase's promise: a kind of keeper and where it stands (`workshop/components/recipes.md`, "The keepers"). */
export interface PhraseKeeper {
  readonly kind: "fact" | "hold" | "record" | "oracle";
  readonly where: string;
}

/**
 * One phrase of a words source: its text as the operator wrote it, the
 * date it was brought, and either its homes or its dismissal with the
 * failure the fit craft named, never both.
 */
export interface WordsPhrase {
  readonly id: string;
  readonly text: string;
  readonly date: string;
  /** Its homes: a roster skill's page, `corpus/skills/<skill>/<page>`, or a repository path outside a recipe. */
  readonly where?: readonly string[] | undefined;
  readonly dismissed?: { readonly failure: string } | undefined;
  /** The keeper its home names, beside a home only. */
  readonly keeper?: PhraseKeeper | undefined;
}

/**
 * A source of kind `words` (J-194 S1): the phrases the operator brings, each
 * a source of one passage with no repository, commit, snapshot or licence.
 * It stands in the manifest's `sources` after every pinned source; the lock's
 * pins and the notices leave it out, and a recipe credits it only through a
 * phrase passage (`workshop/components/recipes.md`, "The recipe's fields").
 */
export interface WordsSource {
  readonly name: string;
  readonly kind: "words";
  readonly author: string;
  readonly phrases: readonly WordsPhrase[];
}

/** Where a vendored copy came from: its source (`family`), the skill's name there, and its path in the repository. */
export interface CorpusUpstreamOrigin {
  readonly family: string;
  readonly name: string;
  readonly path: string;
}

/** One roster skill. Without `upstream` it is greenline-native and has nothing to diverge from. */
export interface CorpusSkillEntry {
  readonly name: string;
  /** A kind of the modes definition, which `verify` checks against `corpus/runtime/modes.json`. */
  readonly kind: string;
  /** For a skill whose kind is placed on the line only: the step of the modes definition it stands at, which `verify` checks. */
  readonly slot?: string | undefined;
  /** Stated only when it differs from the activation the kind's mechanism implies: a visible exception, not drift. */
  readonly activation?: ActivationMode | undefined;
  /** A large asset tree that installs only on request; stated only when true. */
  readonly extra?: true | undefined;
  /** A new concept that is not yet a default; stated only when true. */
  readonly trial?: true | undefined;
  readonly upstream?: CorpusUpstreamOrigin | undefined;
  /** The credit text the notices view prints after an extra copy's name, for the assets the copy carries; refused without `extra`. */
  readonly credits?: string | undefined;
}

/**
 * The activation each mechanism of the loop implies. A step, which the
 * mode reaches, and a start, chosen once from the situation a request
 * begins in, are loaded by name; a habit arises on its situation, so the
 * harness may load it from its description.
 */
const MECHANISM_ACTIVATION = {
  reach: "explicit",
  open: "explicit",
  arise: "implicit",
} as const satisfies Readonly<Record<Kind["mechanism"], ActivationMode>>;

/**
 * The activation a kind implies, read from its mechanism.
 * @param kind a kind of the modes definition
 * @returns explicit for a kind the mode reaches or a request opens, implicit for one that arises
 */
export function kindActivation(kind: Kind): ActivationMode {
  return MECHANISM_ACTIVATION[kind.mechanism];
}

/**
 * The activation an entry carries: its own when stated, otherwise the one
 * its kind implies.
 * @param entry a manifest skill
 * @param kind the entry's kind, from the modes definition
 * @returns the activation the installation renders
 */
export function activationOf(
  entry: { readonly activation?: ActivationMode | undefined },
  kind: Kind,
): ActivationMode {
  return entry.activation ?? kindActivation(kind);
}

/**
 * Why the modes definition refuses a skill's kind or slot, or nothing: a
 * kind the definition does not declare; a slot on a kind placed beside the
 * line, which is its own slot; no slot on a kind placed on the line; a
 * trial flag on a kind placed on the line, since every step runs where its
 * mode reaches it (J-93 S1); and a slot that names no step of the
 * definition. The manifest's check
 * (`kindIssues`, `src/corpus/line.ts`), the corpus loader and the
 * installation payload share it.
 * @param definition the modes definition
 * @param skill a skill's kind, slot and trial flag
 * @returns the refusal's message, or undefined when the definition accepts both
 */
export function kindSlotIssue(
  definition: ModesDefinition,
  skill: {
    readonly kind: string;
    readonly slot?: string | undefined;
    readonly trial?: true | undefined;
  },
): string | undefined {
  const kind = definition.kinds.find((declared) => declared.name === skill.kind);
  if (kind === undefined) return `the kind '${skill.kind}' is no kind of the modes definition`;
  if (kind.place === "beside")
    return skill.slot === undefined
      ? undefined
      : `a ${kind.name} is placed beside the line, so it is its own slot and names none`;
  if (skill.slot === undefined)
    return `a ${kind.name} is placed on the line, so it names its slot, a step of the modes definition`;
  if (skill.trial === true)
    return `a ${kind.name} is placed on the line, where every slot runs as its mode reaches it, so it is never a trial`;
  return definition.steps.some((step) => step.name === skill.slot)
    ? undefined
    : `the slot '${skill.slot}' names no step of the modes definition`;
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
  /** The pinned sources, in the manifest's order. */
  readonly sources: readonly CorpusSource[];
  /** The words sources, which stand after the pinned ones; none when the manifest states none. */
  readonly words: readonly WordsSource[];
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

// Every source is under MIT; a source whose snapshot carries no licence file
// states its copyright line as holder.
const sourceSchema = z
  .object({
    name: z.string().regex(KEBAB_CASE),
    repo: z.string().url(),
    commit: z.string().regex(/^[0-9a-f]{40}$/, "full 40-hex commit"),
    snapshot: z.string().regex(SAFE_RELATIVE_PATH),
    license: z.literal("MIT"),
    holder: z
      .string()
      .regex(/^Copyright \(c\) \d{4} .+$/)
      .optional(),
  })
  .strict();

/** The fields a words source never carries, since it has no repository, pin or licence. */
const PIN_FIELDS = ["repo", "commit", "snapshot", "license", "holder"] as const;

/** One line of a phrase's record: not empty, no line break, and no white space at either end, held as written. */
const phraseLine = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim() === value && !/[\r\n]/.test(value),
    "a phrase's line has no line break and no white space at either end",
  );

const phraseSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    text: phraseLine,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a phrase's date is YYYY-MM-DD"),
    where: z.array(z.string().regex(SAFE_RELATIVE_PATH).refine(hasNoTraversal)).min(1).optional(),
    dismissed: z.object({ failure: phraseLine }).strict().optional(),
    keeper: z
      .object({
        kind: z.enum(["fact", "hold", "record", "oracle"]),
        where: phraseLine,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((phrase, context) => {
    if (phrase.where !== undefined && phrase.dismissed !== undefined)
      context.addIssue({
        code: "custom",
        message: "a phrase states its home in where or its failure in dismissed, never both",
      });
    else if (phrase.where === undefined && phrase.dismissed === undefined)
      context.addIssue({
        code: "custom",
        message: "a phrase states its home in where or its failure in dismissed",
      });
    else if (phrase.keeper !== undefined && phrase.where === undefined)
      context.addIssue({ code: "custom", message: "a keeper stands only beside a home" });
  });

const wordsSourceSchema = z
  .object({
    name: z.string().regex(KEBAB_CASE),
    kind: z.literal("words"),
    author: phraseLine,
    phrases: z.array(phraseSchema).min(1),
  })
  .strict();

/** What marks a words source before its own schema reads it: its kind, and any pin field it wrongly carries. */
const wordsMarker = z.looseObject({
  kind: z.literal("words"),
  repo: z.unknown().optional(),
  commit: z.unknown().optional(),
  snapshot: z.unknown().optional(),
  license: z.unknown().optional(),
  holder: z.unknown().optional(),
});

/**
 * A manifest source: a words source when it states `kind: "words"`, a pinned
 * one otherwise, each read by its own strict schema so its issues name its
 * own fields.
 */
const anySourceSchema = z.unknown().transform((value, context) => {
  const marked = wordsMarker.safeParse(value);
  if (marked.success) {
    const pinField = PIN_FIELDS.find((field) => marked.data[field] !== undefined);
    if (pinField !== undefined) {
      context.addIssue({
        code: "custom",
        message: `a words source carries no repository, commit, snapshot, license or holder; '${pinField}' is one`,
      });
      return z.NEVER;
    }
  }
  const parsed = marked.success
    ? wordsSourceSchema.safeParse(value)
    : sourceSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues)
    context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  return z.NEVER;
});

const skillEntrySchema = z
  .object({
    name: z.string().regex(KEBAB_CASE),
    kind: z
      .string({ error: "a roster skill states its kind, a kind of the modes definition" })
      .regex(KEBAB_CASE, "a kind is a kebab-case name"),
    slot: z.string().regex(KEBAB_CASE).optional(),
    activation: z.enum(["implicit", "explicit"]).optional(),
    extra: z.literal(true).optional(),
    trial: z.literal(true).optional(),
    upstream: z
      .object({
        family: z.string().regex(KEBAB_CASE),
        name: z.string().regex(KEBAB_CASE),
        path: z.string().regex(SAFE_RELATIVE_PATH),
      })
      .strict()
      .optional(),
    credits: z.string().trim().min(1).optional(),
  })
  .refine(
    (entry) => entry.credits === undefined || entry.upstream !== undefined,
    "credits belong to the assets an upstream copy carries",
  )
  .strict();

const corpusManifestSchema = z
  .object({
    schemaVersion: z.literal(CORPUS_SCHEMA_VERSION),
    sources: z.array(anySourceSchema).min(1),
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

/** One source of the parsed manifest, pinned or of words. */
type AnySource = z.infer<typeof sourceSchema> | z.infer<typeof wordsSourceSchema>;

function isWordsSource(source: AnySource): source is z.infer<typeof wordsSourceSchema> {
  return "kind" in source;
}

/**
 * Source names are unique across both kinds, a words source stands after
 * every pinned source and holds each phrase id once, and every vendored
 * skill names a pinned source.
 */
function sourceIssues(
  manifest: z.infer<typeof corpusManifestSchema>,
): readonly { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const names = new Set<string>();
  const pinned = new Set<string>();
  let firstWords: number | undefined;
  let misplaced = false;
  for (const [index, entry] of manifest.sources.entries()) {
    if (names.has(entry.name)) {
      issues.push({
        path: `sources[${index}].name`,
        message: `duplicate source '${entry.name}'`,
      });
    }
    names.add(entry.name);
    if (!isWordsSource(entry)) {
      pinned.add(entry.name);
      if (firstWords !== undefined && !misplaced) {
        misplaced = true;
        issues.push({
          path: `sources[${firstWords}]`,
          message: "a words source stands after every pinned source",
        });
      }
      continue;
    }
    firstWords ??= index;
    const ids = new Set<string>();
    for (const [p, phrase] of entry.phrases.entries()) {
      if (ids.has(phrase.id))
        issues.push({
          path: `sources[${index}].phrases[${p}].id`,
          message: `duplicate phrase '${phrase.id}'`,
        });
      ids.add(phrase.id);
    }
  }
  for (const [index, skill] of manifest.skills.entries()) {
    if (skill.upstream !== undefined && !pinned.has(skill.upstream.family)) {
      issues.push({
        path: `skills[${index}].upstream.family`,
        message: `unknown source '${skill.upstream.family}'`,
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
  // An earlier schema is refused with its version named; there is no converter.
  const versionIssue = checkContractVersion(raw, "corpus manifest", CORPUS_SCHEMA_VERSION);
  if (versionIssue !== undefined) return contractFailure(source, [versionIssue]);
  const parsed = corpusManifestSchema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const pathIssues = [
    ...uniquenessIssues(parsed.data.skills),
    ...sourceIssues(parsed.data),
    ...[
      ...parsed.data.sources.flatMap((entry) => (isWordsSource(entry) ? [] : [entry.snapshot])),
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
    sources: parsed.data.sources.filter(
      (entry): entry is z.infer<typeof sourceSchema> => !isWordsSource(entry),
    ),
    words: parsed.data.sources.filter(isWordsSource),
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
