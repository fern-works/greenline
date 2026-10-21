import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { isRepositoryPath } from "../commons/repository-path.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { SkillFacts, SkillSource } from "./skill.ts";
import { kindSlotIssue, type CorpusIntent } from "./corpus.ts";
import { modesDefinition, type ModesDefinition } from "./modes.ts";

/** Only engineering methods and runtime prose are installed; published guidance is garden's and never installed. */
export interface InstallationInput {
  readonly skills: readonly SkillSource[];
  readonly intents: readonly CorpusIntent[];
  /** The modes definition, whole: the one source the block, the record skeletons and the CLI read. */
  readonly modes: ModesDefinition;
  /** The pinned sources the lock records. */
  readonly sources: readonly {
    readonly name: string;
    readonly repo: string;
    readonly commit: string;
  }[];
  readonly agentGuide: string;
  readonly workGuide: string;
  readonly ledgerGuide: string;
  readonly notices: string;
}
/**
 * The line of the ledger guide, `corpus/runtime/ledger.md`, that the
 * installation replaces with the skeleton of each mode, rendered from the
 * modes definition and the workspace's enabled trials. The guide holds it
 * exactly once.
 */
export const SKELETONS_LINE = "<!-- greenline: the skeleton of each mode -->";

/** Exact identity of the composed installation, with no guidance units or publication pin. */
export interface Installation extends InstallationInput {
  readonly schemaVersion: 2;
  readonly revision: string;
}
const text = z.string().min(1);
const identifier = z.string().regex(/^[a-z][a-z0-9-]*$/);
const skill: z.ZodType<SkillSource> = z
  .object({
    name: identifier,
    description: text,
    kind: identifier,
    slot: identifier.optional(),
    activation: z.enum(["implicit", "explicit"]),
    extra: z.literal(true).optional(),
    trial: z.literal(true).optional(),
    body: text,
    supportFiles: z
      .array(
        z
          .object({
            path: text.refine(isRepositoryPath).refine((path) => path !== "SKILL.md"),
            content: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  // An optional fact is set only when stated, so an absent one has no key.
  .transform(({ slot, extra, trial, supportFiles, ...value }) => {
    const facts: SkillFacts = {};
    if (slot !== undefined) facts.slot = slot;
    if (extra !== undefined) facts.extra = extra;
    if (trial !== undefined) facts.trial = trial;
    if (supportFiles !== undefined) facts.supportFiles = supportFiles;
    return { ...value, ...facts };
  });
const input = z
  .object({
    skills: z.array(skill),
    intents: z.array(z.object({ intent: text, skills: z.array(identifier) }).strict()),
    modes: modesDefinition,
    sources: z.array(
      z
        .object({ name: identifier, repo: z.url(), commit: z.string().regex(/^[a-f0-9]{40}$/) })
        .strict(),
    ),
    agentGuide: text,
    workGuide: text,
    ledgerGuide: text,
    notices: text,
  })
  .strict();
const stored = input.extend({
  schemaVersion: z.literal(2),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Validate unique names, support ownership and intent references before packaging. */
export function buildInstallation(
  value: InstallationInput,
): Result<Installation, ContractParseFailed> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return contractFailure("installation", issuesFrom(parsed.error.issues));
  const names = new Set(parsed.data.skills.map((skill) => skill.name));
  if (
    names.size !== parsed.data.skills.length ||
    parsed.data.intents.some((intent) => intent.skills.some((name) => !names.has(name)))
  )
    return contractFailure("installation", [
      { path: "skills", message: "Skill names must be unique and every intent must resolve." },
    ]);
  if (parsed.data.ledgerGuide.split("\n").filter((line) => line === SKELETONS_LINE).length !== 1)
    return contractFailure("installation", [
      {
        path: "ledgerGuide",
        message: `The ledger guide holds the line '${SKELETONS_LINE}' exactly once, where the skeleton of each mode is rendered.`,
      },
    ]);
  for (const skill of parsed.data.skills)
    if (
      new Set(skill.supportFiles?.map((file) => file.path)).size !==
      (skill.supportFiles?.length ?? 0)
    )
      return contractFailure("installation", [
        { path: skill.name, message: "Duplicate support path." },
      ]);
  // Each skill's kind and slot are the payload's own modes definition's, so
  // the block the payload renders lists every skill where its kind stands.
  for (const skill of parsed.data.skills) {
    const issue = kindSlotIssue(parsed.data.modes, skill);
    if (issue !== undefined)
      return contractFailure("installation", [{ path: `skills.${skill.name}`, message: issue }]);
  }
  // The block keys each kind's skills by its intent rows, so one row names skills of one kind.
  const kindOf = new Map(parsed.data.skills.map((skill) => [skill.name, skill.kind]));
  for (const intent of parsed.data.intents)
    if (new Set(intent.skills.map((name) => kindOf.get(name))).size > 1)
      return contractFailure("installation", [
        { path: intent.intent, message: "An intent row names skills of one kind." },
      ]);
  const body = {
    ...parsed.data,
    skills: [...parsed.data.skills].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    ),
    schemaVersion: 2 as const,
  };
  return contractOk({ ...body, revision: sha256Hex(JSON.stringify(body)) });
}

/** Refuse extra payload fields and corrupt bytes; no alternative local guidance format exists. */
export function parseInstallation(
  text: string,
  source: string,
): Result<Installation, ContractParseFailed> {
  const parsed = stored.safeParse(parseJson(text));
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const { schemaVersion: _schema, revision, ...body } = parsed.data;
  const built = buildInstallation(body);
  if (built._tag === "err") return built;
  return built.value.revision === revision
    ? built
    : contractFailure(source, [
        { path: "revision", message: "Installation content does not match its identity." },
      ]);
}
