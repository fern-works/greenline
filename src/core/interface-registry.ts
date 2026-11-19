import { z } from "zod";
import ruleList from "../../corpus/interface/rules.json" with { type: "json" };
import { shouldNeverHappen } from "../commons/defect.ts";
import { parseJson } from "./contract.ts";
import {
  COMPONENTS,
  CONCERNS,
  FRAMEWORKS,
  PLATFORMS,
  REGISTERS,
  type Facets,
} from "./interface-facets.ts";

/**
 * The interface rule registry (J-123 S4; `workshop/components/interface-rules.md`):
 * the one list of interface rules a machine checks, read from the public
 * list J-122 S4 wrote, `corpus/interface/rules.json`, bundled into the CLI.
 * Each rule has its id, its tier, its engine, its facets, the sentence it
 * serves on the design step's pages, its test, and its provenance. The
 * registry also says which of the design step's reference pages carries
 * each rule's sentence, so a rule and its page never drift apart.
 */

/** The three tiers: floor holds `done` on a red, reflex is cleared by a waiver, finish never blocks. */
export const TIERS = ["floor", "reflex", "finish"] as const;
/** A rule's tier. */
export type Tier = (typeof TIERS)[number];

/** The four engines: a pattern over the source, static HTML with the cascade, DESIGN.md drift, and the render. */
const ENGINES = ["pattern", "cascade", "drift", "render"] as const;
/** A rule's engine. */
export type Engine = (typeof ENGINES)[number];

/** Where a rule came from: a source's file at its pin. */
export interface RuleProvenance {
  readonly repository: string;
  readonly commit: string;
  readonly path: string;
  readonly licence: string;
  readonly at?: string | undefined;
  readonly rule?: string | undefined;
}

/** One interface rule. */
export interface InterfaceRule {
  readonly id: string;
  readonly tier: Tier;
  readonly engine: Engine;
  readonly facets: Facets;
  readonly sentence: string;
  readonly test: {
    readonly fail: string;
    readonly pass: string;
    readonly waiver?: string | undefined;
  };
  readonly provenance: readonly RuleProvenance[];
  /** The numbered contradictions between the sources ruled before the rule took a side. */
  readonly rulings?: readonly number[] | undefined;
}

const RULE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ruleSchema = z
  .object({
    id: z.string().regex(RULE_ID),
    tier: z.enum(TIERS),
    engine: z.enum(ENGINES),
    facets: z
      .object({
        register: z.array(z.enum(REGISTERS)),
        platform: z.array(z.enum(PLATFORMS)),
        framework: z.array(z.enum(FRAMEWORKS)),
        concern: z.array(z.enum(CONCERNS)),
        component: z.array(z.enum(COMPONENTS)),
      })
      .strict(),
    sentence: z.string().min(1),
    test: z
      .object({
        fail: z.string().min(1),
        pass: z.string().min(1),
        waiver: z.string().min(1).optional(),
      })
      .strict(),
    provenance: z
      .array(
        z
          .object({
            repository: z.string().min(1),
            commit: z.string().regex(/^[0-9a-f]{40}$/),
            path: z.string().min(1),
            licence: z.string().min(1),
            at: z.string().min(1).optional(),
            rule: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1),
    rulings: z.array(z.number().int().min(1)).optional(),
  })
  .strict();

const listSchema = z.looseObject({
  schema: z.literal("greenline.interface-rules/v1"),
  rules: z.array(ruleSchema),
});

/**
 * The registry's rules, in the list's order, as the CLI bundles them. The
 * list is held to its schema by the `interface-rules` gate row and the
 * registry's tests, so a defect here is a build that should not have passed.
 * @returns every rule
 * @throws when the bundled list does not read, a defect the gate rules out
 */
export function interfaceRules(): readonly InterfaceRule[] {
  const parsed = listSchema.safeParse(parseJson(JSON.stringify(ruleList)));
  return parsed.success
    ? parsed.data.rules
    : shouldNeverHappen(`the bundled interface rule list does not read: ${parsed.error.message}`);
}

/**
 * Parse a rule list's text, as the gate row and the tests read the file.
 * @param text the list's JSON text
 * @returns the rules, or the issues that refused them, each by its path
 */
export function parseRuleList(
  text: string,
):
  | { readonly ok: true; readonly rules: readonly InterfaceRule[] }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const parsed = listSchema.safeParse(parseJson(text));
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  const ids = parsed.data.rules.map((rule) => rule.id);
  const twice = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (twice.length > 0)
    return { ok: false, issues: twice.map((id) => `the id '${id}' is named twice`) };
  return { ok: true, rules: parsed.data.rules };
}

/** The platform pages, by the platform a rule names first among the non-web ones. */
const PLATFORM_PAGES: ReadonlyMap<string, string> = new Map([
  ["ios", "platform/ios.md"],
  ["android", "platform/android.md"],
  ["cross", "platform/react-native.md"],
  ["desktop", "platform/desktop.md"],
]);

/** The framework pages, each holding a framework's interface mechanics. */
const FRAMEWORK_PAGES: ReadonlyMap<string, string> = new Map([
  ["react", "framework/react.md"],
  ["next", "framework/react.md"],
  ["vue", "framework/vue.md"],
  ["nuxt", "framework/vue.md"],
  ["swiftui", "framework/swiftui.md"],
  ["tailwind", "framework/tailwind.md"],
  ["unocss", "framework/tailwind.md"],
  ["vanilla", "framework/vanilla.md"],
  ["css-modules", "framework/vanilla.md"],
  ["react-native", "platform/react-native.md"],
  ["compose", "platform/android.md"],
]);

/**
 * The design step's reference page that carries a rule's sentence, under
 * `references/`: the home's page for the home's own rules; else the page of
 * the first component it names; else, for a rule of native platforms only,
 * the first platform's page; else the first framework's page; else the page
 * of its first concern, imagery standing on its own page; else colour's.
 * @param rule the rule
 * @returns the page's path inside the design skill
 */
export function rulePage(rule: Pick<InterfaceRule, "id" | "facets">): string {
  const { facets } = rule;
  if (rule.id.startsWith("home-")) return "references/home.md";
  const component = facets.component[0];
  if (component !== undefined) return `references/components/${component}.md`;
  const native = facets.platform.filter((platform) => platform !== "web");
  const first = native[0];
  if (first !== undefined && native.length === facets.platform.length) {
    const page = PLATFORM_PAGES.get(first);
    if (page !== undefined) return `references/${page}`;
  }
  const framework = facets.framework.find((name) => FRAMEWORK_PAGES.has(name));
  const frameworkPage = framework === undefined ? undefined : FRAMEWORK_PAGES.get(framework);
  if (frameworkPage !== undefined) return `references/${frameworkPage}`;
  const concern = facets.concern[0];
  if (concern === "imagery") return "references/imagery.md";
  return `references/craft/${concern ?? "colour"}.md`;
}
