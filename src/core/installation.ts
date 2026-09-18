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
import type { SkillSource } from "./skill.ts";
import type { CorpusIntent } from "./corpus.ts";

/** Only engineering methods and runtime prose are installed; cabinet publications are independent. */
export interface InstallationInput {
  readonly skills: readonly SkillSource[];
  readonly intents: readonly CorpusIntent[];
  readonly upstreams: readonly {
    readonly name: string;
    readonly repo: string;
    readonly commit: string;
  }[];
  readonly agentGuide: string;
  readonly workGuide: string;
  readonly ledgerGuide: string;
  readonly notices: string;
}
/** Exact identity of the composed installation, with no guidance units or publication pin. */
export interface Installation extends InstallationInput {
  readonly schemaVersion: 1;
  readonly revision: string;
}
const text = z.string().min(1);
const identifier = z.string().regex(/^[a-z][a-z0-9-]*$/);
const skill: z.ZodType<SkillSource> = z
  .object({
    name: identifier,
    description: text,
    class: z.enum(["entry", "stage", "support", "discipline", "situational"]),
    activation: z.enum(["implicit", "explicit"]),
    optIn: z.literal(true).optional(),
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
  .transform(({ optIn, supportFiles, ...value }) => {
    const base = optIn === undefined ? value : { ...value, optIn };
    return supportFiles === undefined ? base : { ...base, supportFiles };
  });
const input = z
  .object({
    skills: z.array(skill),
    intents: z.array(z.object({ intent: text, skills: z.array(identifier) }).strict()),
    upstreams: z.array(
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
  schemaVersion: z.literal(1),
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
  for (const skill of parsed.data.skills)
    if (
      new Set(skill.supportFiles?.map((file) => file.path)).size !==
      (skill.supportFiles?.length ?? 0)
    )
      return contractFailure("installation", [
        { path: skill.name, message: "Duplicate support path." },
      ]);
  // The intent table is grouped by class, so one row names skills of one class.
  const classOf = new Map(parsed.data.skills.map((skill) => [skill.name, skill.class]));
  for (const intent of parsed.data.intents)
    if (new Set(intent.skills.map((name) => classOf.get(name))).size > 1)
      return contractFailure("installation", [
        { path: intent.intent, message: "An intent row names skills of one class." },
      ]);
  const body = {
    ...parsed.data,
    skills: [...parsed.data.skills].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    ),
    schemaVersion: 1 as const,
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
