import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import { DESIGN_FILE, governingHome, type DesignDocument } from "./design-file.ts";
import {
  facetsMatch,
  isOnList,
  COMPONENTS,
  type Component,
  type FacetsInPlay,
  type Framework,
  type Platform,
} from "./interface-facets.ts";
import { interfaceRules, TIERS, type InterfaceRule, type Tier } from "./interface-registry.ts";
import { registerOf, type InterfaceRulings } from "./interface-rulings.ts";
import {
  holdsReducedMotion,
  holdsViewportCover,
  homeOrphans,
  fileReadOf,
  runStaticRuleOn,
  type FileRead,
  type SourceFile,
} from "./interface-static.ts";
import type { InterfaceSetting } from "./manifest.ts";
import type { InterfaceFact } from "./interface-fact.ts";
import { ROOT_DIR, type DeclaredCheck } from "./checks.ts";
import { namedFloors } from "./record-interface.ts";

/**
 * The interface check (J-123 S4; `workshop/components/interface-rules.md`):
 * the registry's rules of the static engines run on the interface files a
 * change touched, each rule only where its facets match the facets in play,
 * the findings sorted by tier, a reflex finding cleared by a waiver on the
 * record or a standing one in the rulings, and the run red on any floor
 * finding or any reflex finding left unwaived. The render engine's rules run
 * at verify (`./interface-render.ts`) and fold into the same findings.
 */

/** One finding: a rule failing at a place, and whether a waiver clears it. */
export interface InterfaceFinding {
  readonly rule: string;
  readonly tier: Tier;
  readonly path: string;
  readonly line: number;
  readonly detail?: string | undefined;
  /** Where its waiver stands, for a reflex the record or the rulings clear. */
  readonly waived?: "record" | "standing" | undefined;
  /** The width it was measured at, for a render finding. */
  readonly width?: number | undefined;
}

/** The counts by tier the record, the mirror and the viewer read. */
export interface TierCounts {
  /** The floor findings, each one red. */
  readonly floor: number;
  /** The reflex findings left unwaived, each one red. */
  readonly reflex: number;
  /** The reflex findings a waiver cleared. */
  readonly waived: number;
  /** The finish findings, listed and never red. */
  readonly finish: number;
}

/** A waiver the record states: the rule, the reason and the owner's words. */
export interface RecordWaiver {
  readonly rule: string;
  readonly reason: string;
  readonly words: string;
  /** A floor finding's ruling from the record's `## Interface` section, waived in the owner's words (J-148 S3). */
  readonly floor?: boolean;
}

/** A DESIGN.md home a run reads: its directory, its document and its text. */
export interface CheckHome {
  readonly directory: string;
  readonly document: DesignDocument;
  readonly text: string;
}

/** What a run of the static check reads. */
export interface CheckInput {
  readonly files: readonly SourceFile[];
  /** The DESIGN.md homes, each with its directory, its document and its text. */
  readonly homes: readonly CheckHome[];
  readonly setting: InterfaceSetting;
  readonly rulings: InterfaceRulings;
  /** The components the change's design section declares; undefined runs every component's rules. */
  readonly components?: readonly Component[] | undefined;
  readonly waivers: readonly RecordWaiver[];
}

/** A run's result: its findings and their counts, and whether it is red. */
export interface CheckOutcome {
  readonly findings: readonly InterfaceFinding[];
  readonly counts: TierCounts;
  readonly red: boolean;
}

const WAIVER_LINE = /^waived: ([a-z0-9]+(?:-[a-z0-9]+)*): (.+?); the owner's yes: "(.+)"$/gm;

/** The record's build section, from its heading to the next second-level one. */
const BUILD_SECTION = /^## build[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m;

/**
 * The waivers the record's build section states, one per line:
 * `waived: <rule>: <reason>; the owner's yes: "<the owner's words>"`, and
 * each floor finding its `## Interface` section rules waived in the
 * owner's words, `- floor <rule>: waived, "<their words>"` (J-148 S3). A
 * line elsewhere in the record, a quote in the frame say, waives nothing.
 * @param body the record's body
 * @returns the waivers, in order, the floor rulings last
 */
export function recordWaivers(body: string): readonly RecordWaiver[] {
  const build = BUILD_SECTION.exec(body)?.[1] ?? "";
  return [
    ...[...build.matchAll(WAIVER_LINE)].map((match) => ({
      rule: match[1] ?? "",
      reason: match[2] ?? "",
      words: match[3] ?? "",
    })),
    ...namedFloors(body).flatMap((floor) =>
      floor.ruling.kind === "waived"
        ? [
            {
              rule: floor.rule,
              reason: "the owner's ruling on the floor finding",
              words: floor.ruling.words,
              floor: true,
            },
          ]
        : [],
    ),
  ];
}

/** The platform a file's own extension names, where it names one. */
function filePlatform(path: string): Platform | undefined {
  if (path.endsWith(".swift")) return "ios";
  if (path.endsWith(".kt")) return "android";
  return undefined;
}

/** The frameworks a file's extension adds to the workspace's. */
function fileFrameworks(path: string, workspace: readonly Framework[]): readonly Framework[] {
  const added: Framework[] = [];
  if (path.endsWith(".swift")) added.push("swiftui");
  if (path.endsWith(".kt")) added.push("compose");
  if (path.endsWith(".vue")) added.push("vue");
  if (path.endsWith(".svelte")) added.push("svelte");
  return [...new Set([...workspace, ...added])];
}

/**
 * The facets in play for one file: the workspace's platform and frameworks,
 * narrowed by the file's own kind, the register the rulings give its root,
 * and the components the change declares.
 * @param path the file's path
 * @param input the run's input
 * @returns the facets in play
 */
export function facetsOfFile(
  path: string,
  input: Pick<CheckInput, "setting" | "rulings" | "components">,
): FacetsInPlay {
  const register = registerOf(input.rulings, path);
  return {
    register: register === undefined ? undefined : [register],
    platform: filePlatform(path) ?? input.setting.platform,
    frameworks: fileFrameworks(path, input.setting.frameworks),
    components: input.components,
  };
}

/** The tier counts of a list of findings. */
export function countsOf(findings: readonly InterfaceFinding[]): TierCounts {
  return {
    floor: findings.filter((finding) => finding.tier === "floor" && finding.waived === undefined)
      .length,
    reflex: findings.filter((finding) => finding.tier === "reflex" && finding.waived === undefined)
      .length,
    waived: findings.filter((finding) => finding.waived !== undefined).length,
    finish: findings.filter((finding) => finding.tier === "finish").length,
  };
}

/**
 * The findings with their waivers applied: a reflex finding a record's waiver
 * or a standing waiver names is cleared; a floor finding only by the
 * change record's own ruling in the owner's words (J-148 S3), never by a
 * standing waiver or the build section's line.
 * @param findings the findings
 * @param waivers the record's waivers
 * @param rulings the rulings, whose standing waivers apply to the workspace
 * @returns the findings, each reflex marked where a waiver clears it
 */
export function withWaivers(
  findings: readonly InterfaceFinding[],
  waivers: readonly RecordWaiver[],
  rulings: InterfaceRulings,
): readonly InterfaceFinding[] {
  return findings.map((finding) => {
    if (finding.tier === "floor")
      return !UNWAIVED.has(finding.rule) &&
        waivers.some((waiver) => waiver.floor === true && waiver.rule === finding.rule)
        ? { ...finding, waived: "record" }
        : finding;
    if (finding.tier !== "reflex") return finding;
    if (waivers.some((waiver) => waiver.floor !== true && waiver.rule === finding.rule))
      return { ...finding, waived: "record" };
    if (rulings.waivers.some((waiver) => waiver.rule === finding.rule))
      return { ...finding, waived: "standing" };
    return finding;
  });
}

/**
 * Run the static engines' rules on the files.
 * @param input the files, the homes, the setting, the rulings, the components and the waivers
 * @param rules the registry's rules, all of them by default
 * @returns the findings by tier and whether the run is red
 */
export function checkInterface(
  input: CheckInput,
  rules: readonly InterfaceRule[] = interfaceRules(),
): CheckOutcome {
  const staticRules = rules.filter(
    (rule) => rule.engine !== "render" && rule.id !== "home-orphans",
  );
  const directories = input.homes.map((home) => home.directory);
  const reducedMotionAnywhere = input.files.some((file) => holdsReducedMotion(file.text));
  const viewportCoverAnywhere = input.files.some((file) => holdsViewportCover(file.text));
  const findings: InterfaceFinding[] = [];
  for (const file of input.files) {
    const isHome = file.path === DESIGN_FILE || file.path.endsWith(`/${DESIGN_FILE}`);
    const governing = isHome
      ? file.path === DESIGN_FILE
        ? "."
        : file.path.slice(0, -DESIGN_FILE.length - 1)
      : governingHome(file.path, directories);
    const design = input.homes.find((home) => home.directory === governing)?.document;
    const play = facetsOfFile(file.path, input);
    // The file is parsed once, on the first rule its facets select, for every rule after it.
    let read: FileRead | undefined;
    const context = { design, reducedMotionAnywhere, viewportCoverAnywhere };
    for (const rule of staticRules) {
      if (!facetsMatch(rule.facets, play)) continue;
      read ??= fileReadOf(file);
      const hits = runStaticRuleOn(rule.id, read, context);
      for (const hit of hits)
        findings.push({
          rule: rule.id,
          tier: rule.tier,
          path: file.path,
          line: hit.line,
          detail: hit.detail,
        });
    }
  }
  const orphans = rules.find((rule) => rule.id === "home-orphans");
  if (orphans !== undefined)
    for (const home of input.homes) {
      const governed = input.files.filter(
        (file) =>
          !file.path.endsWith(DESIGN_FILE) &&
          governingHome(file.path, directories) === home.directory,
      );
      if (governed.length === 0) continue;
      const path = home.directory === "." ? DESIGN_FILE : `${home.directory}/${DESIGN_FILE}`;
      for (const hit of homeOrphans(home.document, home.text, governed))
        findings.push({
          rule: orphans.id,
          tier: orphans.tier,
          path,
          line: hit.line,
          detail: hit.detail,
        });
    }
  const waived = withWaivers(findings, input.waivers, input.rulings);
  const counts = countsOf(waived);
  return { findings: waived, counts, red: counts.floor > 0 || counts.reflex > 0 };
}

/**
 * The run's report, by tier: each finding with its place and its rule's
 * sentence, the waived ones marked.
 * @param outcome the run's outcome
 * @param rules the registry's rules, for the sentences
 * @returns the text, ending with a newline
 */
export function renderFindings(
  outcome: CheckOutcome,
  rules: readonly InterfaceRule[] = interfaceRules(),
): string {
  const sentence = new Map([
    ...rules.map((rule): [string, string] => [rule.id, rule.sentence]),
    [KEPT_RULE, KEPT_SENTENCE],
    [REDESIGN_RULE, REDESIGN_SENTENCE],
  ]);
  const { counts } = outcome;
  const lines = [interfaceChecksLine(counts)];
  for (const tier of TIERS) {
    const own = outcome.findings.filter((finding) => finding.tier === tier);
    if (own.length === 0) continue;
    lines.push(`${tier}:`);
    for (const finding of own)
      lines.push(
        `  ${finding.path}:${String(finding.line)}${finding.width === undefined ? "" : ` at ${String(finding.width)}`} ${finding.rule}${finding.waived === undefined ? "" : ` (waived, ${finding.waived === "record" ? "on the record" : "standing"})`}: ${sentence.get(finding.rule) ?? ""}${finding.detail === undefined ? "" : ` [${finding.detail}]`}`,
      );
  }
  lines.push(...waiverAsks(outcome.findings));
  return `${lines.join("\n")}\n`;
}

/**
 * The ask a reflex finding no waiver clears earns (J-144 S3; design's
 * references, "The check and its waivers"): once per rule, where the agent
 * reads the finding as a false alarm, the owner is asked one plain
 * question for the whole workspace, yes offered first, never by the rule's
 * name and never told to leave a file of theirs alone; the yes is written as
 * a standing waiver under `## Interface` in the decisions book, which every
 * later change's check reads, so no change asks again. A rule a standing
 * waiver already clears asks nothing.
 * @param findings the findings
 * @returns one line per reflex rule left to ask about
 */
export function waiverAsks(findings: readonly InterfaceFinding[]): readonly string[] {
  const lines = new Map<string, number>();
  for (const finding of findings)
    if (finding.tier === "reflex" && finding.waived === undefined)
      lines.set(finding.rule, (lines.get(finding.rule) ?? 0) + 1);
  if (lines.size === 0) return [];
  return [
    "to ask the owner once for this workspace, only where you read it as a false alarm:",
    ...[...lines.entries()].map(
      ([rule, count]) =>
        `  ${rule}, ${String(count)} ${count === 1 ? "line" : "lines"}: one question in the owner's words, never the rule's name, such as "The style check flags ${count === 1 ? "the line" : `the ${String(count)} lines`} that <what ${count === 1 ? "it does" : "they do"}, in the owner's words>, a false alarm. Shall I tell it to ignore ${count === 1 ? "it" : "them"} for this site?", yes offered first; their yes is the line \`waiver: ${rule}: <what it protects>\` under ## Interface in .greenline/DECISIONS.md, and no later change asks again`,
    ),
  ];
}

/** The redesign's kept check: a floor finding of its own, outside the registry, since its list is the change's and no rule's. */
export const KEPT_RULE = "kept-list";

/** The redesign's evidence: a floor finding of its own, the redesign's start, its before capture and its kept list (J-148 S3). */
export const REDESIGN_RULE = "redesign-evidence";

/** The redesign's sentence, printed as a registry rule's is. */
const REDESIGN_SENTENCE =
  "A redesign runs its verify with the redesign start loaded, a before capture of each page it reshapes and the kept list that before wrote.";

/** The floor findings outside the registry, which no ruling waives. */
const UNWAIVED: ReadonlySet<string> = new Set([KEPT_RULE, REDESIGN_RULE]);

/** The kept check's sentence, printed as a registry rule's is. */
const KEPT_SENTENCE =
  "What the page carried before the redesign stays: a link, field, form action, handler, test hook, id or heading on the kept list is there after, or its loss is recorded with its reason.";

/**
 * The status mirror's line of the latest interface check (J-107 S2's edition).
 * @param counts the latest run's counts
 * @returns `interface checks: floor 0 red, reflex 2 red (1 waived), finish 3`
 */
export function interfaceChecksLine(counts: TierCounts): string {
  return `interface checks: floor ${String(counts.floor)} red, reflex ${String(counts.reflex)} red (${String(counts.waived)} waived), finish ${String(counts.finish)}`;
}

/**
 * The capture the interface check could not make (J-191 S1): a limit is a
 * fact with its cause, the origin tried, the address and the
 * time, written in the change's interface fact and the path index, never a
 * silence. The record's `## Interface` section names it in the agent's
 * words (`- limit <address>: <words>`) before done, so the owner sees what
 * was not captured. The check captures the app's own origin, never the
 * viewer's: the viewer's address is refused in one line.
 *
 * Pure: the shell drives the browser and reads the viewer's address file.
 */

/** Why a capture was not made, from the stage that failed. */
const LIMIT_CAUSES = [
  "no-browser",
  "browser-start",
  "timeout",
  "refused",
  "load-failed",
  "platform",
] as const;

/** A limit's cause. */
export type LimitCause = (typeof LIMIT_CAUSES)[number];

/** The stage of a capture that failed: finding the browser, starting it, or reading the page. */
export type LimitStage = "find" | "launch" | "read";

/** A capture's limit as the fact keeps it. */
export interface CaptureLimit {
  readonly cause: LimitCause;
  /** The origin tried; null for a screen no browser renders. */
  readonly origin: string | null;
  /** The page's address under the origin, starting with '/'. */
  readonly address: string;
  /** When the capture was tried. */
  readonly at: string;
  /** The engine's own words. */
  readonly detail: string;
}

/** The limit's schema, which the fact, the path index and the viewer read. */
export const captureLimitSchema: z.ZodType<CaptureLimit> = z
  .object({
    cause: z.enum(LIMIT_CAUSES),
    origin: z.string().min(1).nullable(),
    address: z.string().startsWith("/"),
    at: z.iso.datetime(),
    detail: z.string().min(1),
  })
  .strict();

/**
 * A limit's cause from the stage that failed and the engine's words.
 * @param stage the stage that failed
 * @param reason the engine's words
 * @returns the cause
 */
export function limitCauseOf(stage: LimitStage, reason: string): LimitCause {
  if (stage === "find") return "no-browser";
  if (stage === "launch") return "browser-start";
  if (/ERR_CONNECTION_REFUSED/.test(reason)) return "refused";
  if (/timed out|did not load in|did not settle in|did not arrive/.test(reason)) return "timeout";
  return "load-failed";
}

/** What a limit is made from. */
export interface LimitInput {
  readonly stage: LimitStage;
  readonly reason: string;
  readonly origin: string;
  readonly address: string;
  readonly at: string;
}

/**
 * The limit a failed capture met.
 * @param input the stage, the engine's words, the origin, the address and the time
 * @returns the limit
 */
export function captureLimitOf(input: LimitInput): CaptureLimit {
  return {
    cause: limitCauseOf(input.stage, input.reason),
    origin: input.origin.replace(/\/+$/, ""),
    address: input.address,
    at: input.at,
    detail: input.reason,
  };
}

/**
 * The limit of a screen no browser renders (J-143 S3): the platform's, which
 * settles its render as it always has.
 * @param address the screen
 * @param at when it was named
 * @param detail why no browser renders it
 * @returns the limit
 */
export function platformLimit(address: string, at: string, detail: string): CaptureLimit {
  return { cause: "platform", origin: null, address, at, detail };
}

/** The cause in words, as the status, the refusal and the viewer say it. */
const CAUSE_WORDS = {
  "no-browser": "no browser ran",
  "browser-start": "the browser did not start",
  timeout: "the page did not load in time",
  refused: "nothing answers",
  "load-failed": "the page did not load",
  platform: "no browser renders this platform",
} as const satisfies Readonly<Record<LimitCause, string>>;

/**
 * A limit in words: its cause, where, and the engine's words.
 * @param limit the limit
 * @returns the sentence, with no closing stop
 */
export function captureLimitText(limit: CaptureLimit): string {
  const where = `${limit.origin ?? ""}${limit.address}`;
  if (limit.cause === "refused")
    return `nothing answers at ${where}: the app is not running there (${limit.detail})`;
  if (limit.cause === "platform") return `${CAUSE_WORDS.platform}: ${limit.detail}`;
  return `${CAUSE_WORDS[limit.cause]} at ${where} (${limit.detail})`;
}

/** The loopback names a local origin may take. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "0.0.0.0"]);

/**
 * The refusal of an origin that is the viewer's own address
 * (j179c-conduct-interfaceb finding 4): a loopback origin on the port the
 * viewer serves.
 * @param origin the origin given to the capture
 * @param viewer the viewer's base address, undefined where none serves
 * @returns the one line refusing it, or undefined where it is not the viewer's
 */
export function viewerOriginRefusal(
  origin: string,
  viewer: string | undefined,
): string | undefined {
  if (viewer === undefined) return undefined;
  let given: URL;
  let serving: URL;
  try {
    given = new URL(origin);
    serving = new URL(viewer);
  } catch {
    return undefined;
  }
  if (!LOOPBACK.has(given.hostname) || given.port !== serving.port) return undefined;
  return `${origin.replace(/\/+$/, "")} is the viewer's own address, where greenline inspect serves, not the app's; give the origin the app serves, from its start command or the record's \`- app <origin>\` line`;
}

/** A render rule a run did not measure, and why. */
export interface Unmeasured {
  readonly rule: string;
  readonly why: string;
}

/** The interface check's fact, the tiered findings of one run, kept in the change's folder. */
export interface InterfaceCheckFact {
  readonly generatedBy: string;
  readonly at: string;
  readonly commit: string | null;
  readonly paths: readonly string[];
  readonly counts: TierCounts;
  readonly findings: readonly InterfaceFinding[];
  /** The render rules not measured on this run, with why: no browser, or a rule that needs a person's reading. */
  readonly unmeasured: readonly Unmeasured[];
  /** The widths the render engine measured, none on a static run. */
  readonly widths: readonly number[];
  /** Why no browser ran, where none did on a render run. */
  readonly browser?: string | undefined;
  /** The capture's limit, where a render run made none: its cause, the origin tried and the time (J-191 S1). */
  readonly limit?: CaptureLimit | undefined;
  /** The address a render run rendered, `--path`'s, none on a static run (J-133 S1). */
  readonly address?: string | undefined;
  /** The pages the change touched, read from its interface files' paths (J-133 S1, `./interface-pages.ts`). */
  readonly pages?: readonly string[] | undefined;
}

const countsSchema = z
  .object({
    floor: z.number().int().min(0),
    reflex: z.number().int().min(0),
    waived: z.number().int().min(0),
    finish: z.number().int().min(0),
  })
  .strict();

/** The fact's schema, which the inspector's contract serves. */
export const interfaceCheckFactSchema: z.ZodType<InterfaceCheckFact> = z
  .object({
    generatedBy: z.string().min(1),
    at: z.iso.datetime(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
    paths: z.array(z.string().min(1)),
    counts: countsSchema,
    findings: z.array(
      z
        .object({
          rule: z.string().min(1),
          tier: z.enum(TIERS),
          path: z.string().min(1),
          line: z.number().int().min(0),
          detail: z.string().optional(),
          waived: z.enum(["record", "standing"]).optional(),
          width: z.number().int().positive().optional(),
        })
        .strict(),
    ),
    unmeasured: z.array(z.object({ rule: z.string().min(1), why: z.string().min(1) }).strict()),
    widths: z.array(z.number().int().positive()),
    browser: z.string().min(1).optional(),
    limit: captureLimitSchema.optional(),
    address: z.string().startsWith("/").optional(),
    pages: z.array(z.string().startsWith("/")).optional(),
  })
  .strict();

/** The folder of a change's interface facts, from the root. */
export function interfaceFactsFolder(id: string): string {
  return `.greenline/ledger/${id}/interface`;
}

/**
 * Parse an interface fact.
 * @param text the file's text
 * @param source its path
 * @returns the fact, or the issues that refused it
 */
export function parseInterfaceCheckFact(
  text: string,
  source: string,
): Result<InterfaceCheckFact, ContractParseFailed> {
  const parsed = interfaceCheckFactSchema.safeParse(parseJson(text));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/**
 * The components a design section declares, parsed from the closed list.
 * @param names the names as written
 * @returns those on the list
 */
export function componentsOn(names: readonly string[]): readonly Component[] {
  return names.filter((name): name is Component => isOnList(COMPONENTS, name));
}

/** The command the interface check runs as, declared or not. */
export const INTERFACE_CHECK_COMMAND = "greenline check interface";

/**
 * The checks a change is held to (J-123 S4): the workspace's declared
 * checks, and, where the manifest's interface block sets the opt-in and the
 * record says the change touches an interface, the declared check
 * `interface`, whose run is `greenline check interface` at the root; a done
 * is held on its latest run as on any declared check's. A workspace that
 * declares the command itself keeps its own declaration.
 * @param checks the workspace's declared checks
 * @param setting the manifest's interface block
 * @param fact the record's interface fact
 * @returns the checks the change is held to
 */
export function checksOfChange(
  checks: readonly DeclaredCheck[],
  setting: InterfaceSetting | undefined,
  fact: InterfaceFact | undefined,
): readonly DeclaredCheck[] {
  if (setting?.check !== true || fact?.touches !== true) return checks;
  if (checks.some((check) => check.command === INTERFACE_CHECK_COMMAND)) return checks;
  const taken = new Set(checks.map((check) => check.name));
  let name = "interface";
  for (let index = 2; taken.has(name); index += 1) name = `interface-${String(index)}`;
  return [...checks, { name, command: INTERFACE_CHECK_COMMAND, dir: ROOT_DIR }];
}
