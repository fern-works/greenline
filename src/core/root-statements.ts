import { z } from "zod";
import type { Result } from "../commons/result.ts";
import { isRepositoryPath } from "../commons/repository-path.ts";
import { CabinetAccessFailed, type Vocabulary, type ListResult } from "./cabinet.ts";
import { err, ok } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
  type InvalidField,
} from "./contract.ts";

/** A repository prohibition, naming a unit or the cabinet's existing responsibility group. */
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

/** Parse root intent and group prohibitions against supplied vocabulary; never infer scope or write policy. */
export function parseRootStatements(
  input: string,
  source: string,
  vocabulary: Vocabulary,
): Result<readonly RootStatement[], ContractParseFailed> {
  const parsed = statements.safeParse(parseJson(input));
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const issues: InvalidField[] = [];
  parsed.data.forEach((entry, index) =>
    entry.exclusions.forEach((exclusion, position) => {
      if (
        exclusion.kind === "option-group" &&
        !vocabulary.responsibility.includes(exclusion.responsibility)
      )
        issues.push({
          path: `[${index}].exclusions[${position}].responsibility`,
          message: "unknown responsibility",
        });
    }),
  );
  return issues.length ? contractFailure(source, issues) : contractOk(parsed.data);
}

/** Ordinary authored decisions with one optional, explicitly named root-statement block. */
export interface DecisionDocument {
  readonly body: string;
  readonly roots: readonly RootStatement[];
}

/** Local reads check structure; retrieval additionally checks the bound vocabulary. */
export function parseDecisionDocument(
  input: string,
  source: string,
  vocabulary?: Vocabulary,
): Result<DecisionDocument, ContractParseFailed> {
  const starts = [...input.matchAll(/^```greenline-roots\s*$/gm)];
  const blocks = [...input.matchAll(/^```greenline-roots\s*\n([\s\S]*?)^```\s*$/gm)];
  if (starts.length !== blocks.length || blocks.length > 1)
    return contractFailure(source, [
      { path: "roots", message: "Use one complete greenline-roots JSON block." },
    ]);
  const content = blocks[0]?.[1] ?? "[]";
  const local = statements.safeParse(parseJson(content));
  if (!local.success) return contractFailure(source, issuesFrom(local.error.issues));
  const roots =
    vocabulary === undefined
      ? contractOk(local.data)
      : parseRootStatements(content, source, vocabulary);
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

/** Expand explicit root prohibitions using metadata only; no inferred inheritance or body reads. */
export function rootExclusions(
  statements: readonly RootStatement[],
  roots: readonly string[],
  catalog: ListResult,
  explicit: readonly string[] = [],
): Result<ReadonlySet<string>, CabinetAccessFailed> {
  const units = new Map(catalog.units.map((unit) => [unit.id, unit]));
  const excluded = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): Result<void, CabinetAccessFailed> => {
    if (visiting.has(id)) return err(new CabinetAccessFailed("invalid response", "contains cycle"));
    if (excluded.has(id)) return ok(undefined);
    const unit = units.get(id);
    if (unit === undefined)
      return err(
        new CabinetAccessFailed(
          "configuration",
          `excluded unit ${id} is absent from this snapshot`,
        ),
      );
    visiting.add(id);
    for (const child of unit.contains) {
      const result = visit(child);
      if (result._tag === "err") return result;
    }
    visiting.delete(id);
    excluded.add(id);
    return ok(undefined);
  };
  const ids = [...explicit];
  for (const statement of statements.filter((statement) => roots.includes(statement.root)))
    for (const exclusion of statement.exclusions)
      if (exclusion.kind === "unit") ids.push(exclusion.id);
      else {
        const members = catalog.units.filter(
          (unit) => unit.option_group?.responsibility === exclusion.responsibility,
        );
        if (members.length === 0)
          return err(
            new CabinetAccessFailed(
              "configuration",
              `excluded option group ${exclusion.responsibility} has no members in this snapshot`,
            ),
          );
        ids.push(...members.map((unit) => unit.id));
      }
  for (const id of ids) {
    const result = visit(id);
    if (result._tag === "err") return result;
  }
  return ok(excluded);
}
