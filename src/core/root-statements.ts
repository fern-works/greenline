import { z } from "zod";
import type { Result } from "../commons/result.ts";
import { isRepositoryPath } from "../commons/repository-path.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";

/** A repository prohibition, naming a unit or a responsibility group of the guidance consulted. */
export type RootExclusion =
  | { readonly kind: "unit"; readonly id: string }
  | { readonly kind: "option-group"; readonly responsibility: string };

/** Settled intent for exactly one governed root; empty choices remain unknown. */
export interface RootStatement {
  readonly root: string;
  readonly purpose: string | null;
  readonly languages: readonly string[];
  readonly technologies: readonly string[];
  readonly decision: string;
  readonly exclusions: readonly RootExclusion[];
}

const text = z.string().trim().min(1);
const exclusionSchema: z.ZodType<RootExclusion> = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("unit"), id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) })
    .strict(),
  z.object({ kind: z.literal("option-group"), responsibility: text }).strict(),
]);
const statement: z.ZodType<RootStatement> = z
  .object({
    root: z
      .string()
      .refine((path) => path === "." || isRepositoryPath(path), "a repository-relative root"),
    purpose: text.nullable(),
    languages: z.array(text),
    technologies: z.array(text),
    decision: text,
    exclusions: z.array(exclusionSchema),
  })
  .strict();
const statements = z.array(statement).superRefine((entries, context) => {
  const roots = new Set<string>();
  entries.forEach((entry, index) => {
    if (roots.has(entry.root))
      context.addIssue({
        code: "custom",
        path: [index, "root"],
        message: "duplicate governed root",
      });
    roots.add(entry.root);
  });
});

/** Parse root intent and prohibitions; never infer scope or write policy. */
export function parseRootStatements(
  input: string,
  source: string,
): Result<readonly RootStatement[], ContractParseFailed> {
  const parsed = statements.safeParse(parseJson(input));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/** Ordinary authored decisions with one optional, explicitly named root-statement block. */
export interface DecisionDocument {
  readonly body: string;
  readonly roots: readonly RootStatement[];
}

/** The decisions book: its body and its one optional root-statement block, checked for structure. */
export function parseDecisionDocument(
  input: string,
  source: string,
): Result<DecisionDocument, ContractParseFailed> {
  const starts = [...input.matchAll(/^```greenline-roots\s*$/gm)];
  const blocks = [...input.matchAll(/^```greenline-roots\s*\n([\s\S]*?)^```\s*$/gm)];
  if (starts.length !== blocks.length || blocks.length > 1)
    return contractFailure(source, [
      { path: "roots", message: "Use one complete greenline-roots JSON block." },
    ]);
  const roots = parseRootStatements(blocks[0]?.[1] ?? "[]", source);
  return roots._tag === "err" ? roots : contractOk({ body: input, roots: roots.value });
}

/**
 * The languages the named roots settled, unioned and sorted. Declared
 * metadata only: a root that declares none contributes none, and no language
 * is inherited from a sibling root, a parent path, or the repository's files.
 */
export function rootLanguages(
  statements: readonly RootStatement[],
  roots: readonly string[],
): readonly string[] {
  const languages = new Set<string>();
  for (const statement of statements)
    if (roots.includes(statement.root))
      for (const language of statement.languages) languages.add(language);
  return [...languages].sort();
}

/** The prohibitions governed roots declare: unit ids, and responsibility groups still to expand. */
export interface RootExclusionSubjects {
  readonly units: readonly string[];
  readonly groups: readonly string[];
}

/** The prohibitions the governed roots declare, units and responsibility groups apart, each once. */
export function rootExclusionSubjects(
  statements: readonly RootStatement[],
  roots: readonly string[],
): RootExclusionSubjects {
  const units = new Set<string>();
  const groups = new Set<string>();
  for (const statement of statements.filter((entry) => roots.includes(entry.root)))
    for (const exclusion of statement.exclusions)
      if (exclusion.kind === "unit") units.add(exclusion.id);
      else groups.add(exclusion.responsibility);
  return { units: [...units].sort(), groups: [...groups].sort() };
}
