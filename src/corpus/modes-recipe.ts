import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "../core/contract.ts";
import type { ModesDefinition } from "../core/modes.ts";
import type { EntryMeasure } from "./chain.ts";
import { EDIT_KINDS, gistText, type Account } from "./recipe.ts";
import type { SkillState } from "./record.ts";

/**
 * The modes definition's native recipe, `corpus/recipes/modes.json`
 * (`workshop/components/recipes.md`, "The modes recipe"; the ruling (b)
 * on S16b of the plan modes-records-recipes). The definition is
 * edited by hand, so the recipe renders nothing: it states the sha256 of
 * the definition it accounts for and one account per part of it, each kind,
 * the steps, each mode and the floors, with the kind, the reason and, on a
 * `method` account, the operator's ruling. A `modes` change entry records
 * the recipe's digest, the definition's digest as its result and a measure
 * with no source and no growth, so a reshape of the modes is ledgered as a
 * skill's change is.
 */

/** The recipe's schema. */
const MODES_RECIPE_SCHEMA = "greenline.modes-recipe/v1";

/** The definition's path under the corpus, the one file the recipe accounts for. */
const MODES_DEFINITION = "runtime/modes.json";

/**
 * The operator's ruling that lets a mode read more words than its budget:
 * the excess it names, in words, and the operator's words. `budget` reads
 * it; a mode whose excess passes the words named is refused again.
 */
export interface Excess {
  readonly words: number;
  readonly ruling: string;
}

/** One part of the definition with its account: `kind:<name>`, `steps`, `mode:<name>` or `floors`. */
export interface ModesPart extends Account {
  readonly part: string;
  /** On a mode's account only: the excess of words over its budget the operator ruled. */
  readonly excess?: Excess;
}

/** An account under construction, its ruling added only when stated. */
type PartDraft = { -readonly [K in keyof ModesPart]: ModesPart[K] };

/** The modes recipe: the definition it accounts for and an account per part. */
export interface ModesRecipe {
  readonly schema: typeof MODES_RECIPE_SCHEMA;
  readonly definition: { readonly path: typeof MODES_DEFINITION; readonly sha256: string };
  readonly parts: readonly ModesPart[];
}

const text = z.string().min(1);
const PART = /^(?:kind:[a-z][a-z0-9-]*|steps|mode:[a-z][a-z0-9-]*|floors)$/;
/** The prefix of a mode's part, `mode:<name>`. */
const MODE_PART = "mode:";
const schema = z
  .object({
    schema: z.literal(MODES_RECIPE_SCHEMA),
    definition: z
      .object({
        path: z.literal(MODES_DEFINITION),
        sha256: z.string().regex(/^[a-f0-9]{64}$/, "a sha256 is 64 lower-case hex characters"),
      })
      .strict(),
    parts: z
      .array(
        z
          .object({
            part: z.string().regex(PART, "a part is kind:<name>, steps, mode:<name> or floors"),
            kind: z.enum(EDIT_KINDS),
            reason: text,
            gist: gistText.optional(),
            ruling: text.optional(),
            excess: z
              .object({ words: z.number().int().min(1), ruling: text })
              .strict()
              .optional(),
          })
          .strict()
          .superRefine((value, context) => {
            if (value.excess !== undefined && !value.part.startsWith(MODE_PART))
              context.addIssue({
                code: "custom",
                path: ["excess"],
                message: "only a mode's account names an excess of words over its budget",
              });
            if ((value.kind === "method") !== (value.ruling !== undefined))
              context.addIssue({
                code: "custom",
                path: ["ruling"],
                message:
                  value.kind === "method"
                    ? "a method account carries the operator's ruling"
                    : "only a method account carries a ruling",
              });
          }),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, entry] of value.parts.entries())
      if (value.parts.findIndex((other) => other.part === entry.part) < index)
        context.addIssue({
          code: "custom",
          path: ["parts", index, "part"],
          message: `the part '${entry.part}' is accounted for twice`,
        });
  });

/**
 * Parse the modes recipe: refuse invalid JSON, another schema, an unknown or
 * missing field, a part that is not one of the four forms, a part accounted
 * for twice, a kind outside the seven, a ruling on any account but a
 * `method` one or a `method` account without one, and a gist outside its
 * rule (`gistIssues` in `recipe.ts`).
 * @param input the recipe file's text
 * @param source where the text came from, for the refusal
 * @returns the recipe, or every issue found
 */
export function parseModesRecipe(
  input: string,
  source: string,
): Result<ModesRecipe, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [{ path: "", message: "the recipe is not valid JSON" }]);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  const parts = parsed.data.parts.map((entry): ModesPart => {
    const account: PartDraft = {
      part: entry.part,
      kind: entry.kind,
      reason: entry.reason,
    };
    // A gist, a ruling and an excess are set only when stated, so an account without one has no key.
    if (entry.gist !== undefined) account.gist = entry.gist;
    if (entry.ruling !== undefined) account.ruling = entry.ruling;
    if (entry.excess !== undefined) account.excess = entry.excess;
    return account;
  });
  return contractOk({ schema: parsed.data.schema, definition: parsed.data.definition, parts });
}

/**
 * The excess of words the operator ruled for a mode, from the mode's account.
 * @param recipe the parsed recipe
 * @param mode a mode's name
 * @returns the excess its account names, or undefined when it names none
 */
export function excessOf(recipe: ModesRecipe, mode: string): Excess | undefined {
  return recipe.parts.find((entry) => entry.part === `${MODE_PART}${mode}`)?.excess;
}

/**
 * The parts of a definition a recipe accounts for, in its order: each kind,
 * the steps, each mode and the floors.
 * @param definition the parsed definition
 * @returns the parts' names
 */
function definitionParts(definition: ModesDefinition): readonly string[] {
  return [
    ...definition.kinds.map((kind) => `kind:${kind.name}`),
    "steps",
    ...definition.modes.map((mode) => `${MODE_PART}${mode.name}`),
    "floors",
  ];
}

/**
 * How the recipe differs from the definition on disk: the digest it states
 * is not the file's, a part of the definition it does not account for, or
 * an account of a part the definition does not hold.
 * @param recipe the parsed recipe
 * @param bytes the definition file's bytes
 * @param definition the definition those bytes parse to
 * @returns every difference; none when the recipe accounts for the definition whole
 */
export function modesRecipeIssues(
  recipe: ModesRecipe,
  bytes: Uint8Array,
  definition: ModesDefinition,
): readonly string[] {
  const issues: string[] = [];
  const digest = sha256Hex(bytes);
  if (recipe.definition.sha256 !== digest)
    issues.push(
      `the recipe accounts for the definition ${recipe.definition.sha256}; corpus/${MODES_DEFINITION} is ${digest}: account for the change and state the new digest`,
    );
  const held = definitionParts(definition);
  const accounted = recipe.parts.map((entry) => entry.part);
  for (const part of held)
    if (!accounted.includes(part))
      issues.push(`the part '${part}' of the definition has no account in the recipe`);
  for (const part of accounted)
    if (!held.includes(part))
      issues.push(`the recipe accounts for '${part}', which the definition does not hold`);
  return issues;
}

/** A modes change entry's measure: no source and no growth, since the recipe takes and writes no prose. */
const MODES_MEASURE: EntryMeasure = { stub: false, sources: [], growth: 0 };

/**
 * What the tree gives for the modes, as a change entry records it.
 * @param recipeBytes the recipe file's bytes
 * @param recipe the parsed recipe
 * @param definitionBytes the definition file's bytes
 * @returns the recipe's digest, the definition's digest as the result, the measure and whether an account is a method
 */
export function modesState(
  recipeBytes: Uint8Array,
  recipe: ModesRecipe,
  definitionBytes: Uint8Array,
): SkillState {
  return {
    recipe: sha256Hex(recipeBytes),
    result: sha256Hex(definitionBytes),
    measure: MODES_MEASURE,
    method: recipe.parts.some((entry) => entry.kind === "method"),
  };
}
