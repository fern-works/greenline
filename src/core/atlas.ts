import { z } from "zod";
import type { Result } from "../commons/result.ts";
import { CHANGE_ID } from "./change.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import { REFRESH_CAP, UNNAMED_CURE } from "./git-hooks.ts";
import { VISUALS_HOME } from "./visuals.ts";

/**
 * The atlas (J-110 S7; the visual system, "The atlas"): the repository's
 * subsystems, each with a page in the explain form under
 * `.greenline/visuals/subsystems/<name>.md`, the files it covers and the
 * commit it was read at, and its journeys under `subsystems/<name>/`, each
 * a visual with its manifest. Its index is `.greenline/visuals/atlas.json`,
 * which the `explain` start writes and refreshes, and which `greenline
 * status` and the inspector read. A page's staleness is the visuals' own
 * arithmetic (`tierOf`), over the files and the commit the index gives it.
 */

/** The atlas's index, from the repository root. */
export const ATLAS_INDEX: string = `${VISUALS_HOME}/atlas.json`;

/** The index's schema identifier. */
export const ATLAS_SCHEMA = "greenline.atlas/v1";

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const COVERED = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\0\\]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}/;

const subsystemSchema = z
  .object({
    name: z.string().regex(NAME, "a subsystem's name: lowercase words joined by hyphens"),
    title: z.string().trim().min(1),
    layer: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    files: z.array(z.string().regex(COVERED, "a path inside the repository")).min(1),
    commit: z.string().regex(COMMIT, "a commit's hash, 7 to 40 hex characters"),
    read: z.string().regex(DATE, "the date it was read"),
    calls: z.array(z.string().regex(NAME)),
  })
  .strict();

const refreshSchema = z
  .object({
    change: z.string().regex(CHANGE_ID, "the change that refreshed it"),
    commit: z.string().regex(COMMIT),
    whole: z.boolean(),
    pages: z.array(z.string().regex(NAME)),
    greenline: z.string().regex(/^\d+\.\d+\.\d+/, "the greenline version it ran under"),
    cost: z.string().trim().min(1).optional(),
  })
  .strict();

const atlasSchema = z
  .object({
    schema: z.literal(ATLAS_SCHEMA),
    layers: z.array(z.string().trim().min(1)),
    subsystems: z.array(subsystemSchema),
    refreshes: z.array(refreshSchema),
  })
  .strict()
  .superRefine((atlas, context) => {
    const names = atlas.subsystems.map((entry) => entry.name);
    atlas.subsystems.forEach((entry, index) => {
      if (names.indexOf(entry.name) !== index)
        context.addIssue({
          code: "custom",
          path: ["subsystems", index, "name"],
          message: `the subsystem '${entry.name}' is named twice`,
        });
      if (!atlas.layers.includes(entry.layer))
        context.addIssue({
          code: "custom",
          path: ["subsystems", index, "layer"],
          message: `the layer '${entry.layer}' is not one the atlas's layers name`,
        });
      for (const called of entry.calls)
        if (!names.includes(called))
          context.addIssue({
            code: "custom",
            path: ["subsystems", index, "calls"],
            message: `'${called}' is no subsystem of the atlas`,
          });
    });
  });

/** One subsystem of the atlas, as its index holds it. */
export interface AtlasSubsystem {
  readonly name: string;
  readonly title: string;
  /** Its band of the map, one of the atlas's layers. */
  readonly layer: string;
  readonly summary: string;
  /** The repository paths its page covers; a path ending in `/` covers a directory. */
  readonly files: readonly string[];
  /** The commit its page was read at. */
  readonly commit: string;
  readonly read: string;
  /** The subsystems it calls, by name. */
  readonly calls: readonly string[];
}

/** One refresh of the atlas, recorded by the change that made it. */
export interface AtlasRefresh {
  readonly change: string;
  readonly commit: string;
  /** Whether it re-read the whole atlas, which runs at most once per minor version unless the owner names it. */
  readonly whole: boolean;
  /** The pages it rewrote. */
  readonly pages: readonly string[];
  readonly greenline: string;
  /** What the refresh cost, as the change's record states it: the agent a method started, named apart, and its time (J-147 S1). */
  readonly cost?: string | undefined;
}

/** The atlas's index. */
export interface Atlas {
  readonly schema: typeof ATLAS_SCHEMA;
  /** The map's bands in order, from the entry points to the foundations. */
  readonly layers: readonly string[];
  readonly subsystems: readonly AtlasSubsystem[];
  readonly refreshes: readonly AtlasRefresh[];
}

/**
 * Parse the atlas's index.
 * @param input the index's text
 * @param source where it was read, for the refusal
 * @returns the atlas, or every field it gets wrong
 */
export function parseAtlas(input: string, source: string): Result<Atlas, ContractParseFailed> {
  const json = parseJson(input);
  if (json === undefined) return contractFailure(source, [{ path: "", message: "not JSON" }]);
  const parsed = atlasSchema.safeParse(json);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk(parsed.data);
}

/**
 * A subsystem's page, from the repository root.
 * @param name the subsystem's name
 * @returns the page's path
 */
export function subsystemPage(name: string): string {
  return `${VISUALS_HOME}/subsystems/${name}.md`;
}

/**
 * The subsystems that call one, by name, in the index's order.
 * @param atlas the atlas
 * @param name the subsystem's name
 * @returns the callers' names
 */
export function calledBy(atlas: Atlas, name: string): readonly string[] {
  return atlas.subsystems.filter((entry) => entry.calls.includes(name)).map((entry) => entry.name);
}

/**
 * A major change since the map, a fact the atlas line names (J-147 S1;
 * the register's row of 2026-10-28 on the visual system's flow): a new
 * top-level module with code, a commit touching a schema, a migration, a
 * state machine or a flow, a change spanning two or more atlas subsystems,
 * or twenty commits touching the map's covered files since its commit or a
 * third of the atlas's pages drifting.
 */
export type MajorChange =
  | { readonly kind: "module"; readonly module: string }
  | { readonly kind: "model"; readonly path: string }
  | { readonly kind: "span"; readonly subsystems: readonly string[] }
  | { readonly kind: "commits"; readonly commits: number }
  | { readonly kind: "pages"; readonly drifting: number; readonly pages: number };

/** The commits touching the map's covered files that make a major change. */
const MAJOR_COMMITS = 20;

/** The subsystems one change spans that make a major change. */
const MAJOR_SPAN = 2;

/** What git and the index answer for the major-change reading, since the map's commit. */
export interface MajorFacts {
  /** The top-level folders HEAD holds with code that the map's commit did not hold. */
  readonly newModules: readonly string[];
  /** The files changed since the map's commit whose path names a schema, a migration, a state machine or a flow. */
  readonly modelPaths: readonly string[];
  /** The atlas subsystems the open change's files touch, by name. */
  readonly spanned: readonly string[];
  /** The commits touching the map's covered files since its commit; null where no map stands. */
  readonly mapBehind: number | null;
  readonly drifting: number;
  readonly pages: number;
}

/**
 * The first major change the facts hold, in the order the row names them,
 * or undefined where none does. Commits are counted, never the wall clock.
 * @param facts git's and the index's answers
 * @returns the major change
 */
export function majorChange(facts: MajorFacts): MajorChange | undefined {
  const module = facts.newModules[0];
  if (module !== undefined) return { kind: "module", module };
  const path = facts.modelPaths[0];
  if (path !== undefined) return { kind: "model", path };
  if (facts.spanned.length >= MAJOR_SPAN) return { kind: "span", subsystems: facts.spanned };
  if (facts.mapBehind !== null && facts.mapBehind >= MAJOR_COMMITS)
    return { kind: "commits", commits: facts.mapBehind };
  if (facts.pages > 0 && facts.drifting * 3 >= facts.pages)
    return { kind: "pages", drifting: facts.drifting, pages: facts.pages };
  return undefined;
}

/**
 * A major change in the owner's words, as the atlas line and the viewer say it.
 * @param change the fact
 * @returns the words
 */
export function majorWords(change: MajorChange): string {
  switch (change.kind) {
    case "module":
      return `a new top-level module, ${change.module}/, holds code`;
    case "model":
      return `a commit touched ${change.path}, a shape the map draws`;
    case "span":
      return `this change spans ${change.subsystems.join(" and ")}`;
    case "commits":
      return `${String(change.commits)} commits touched the map's files since it was made`;
    case "pages":
      return `${String(change.drifting)} of the atlas's ${String(change.pages)} pages drift`;
  }
}

/** What the atlas line states (J-147 S1). */
export interface AtlasStanding {
  /** The subsystem pages the index holds. */
  readonly pages: number;
  readonly drifting: number;
  /** The commits touching the map's covered files since its commit; null where no map stands. */
  readonly mapBehind: number | null;
  /** A major change since the map, undefined where none. */
  readonly major?: MajorChange | undefined;
  /** At the close, the pages, journeys and the map the change touched, which the close refreshes. */
  readonly touched?: readonly string[] | undefined;
  /**
   * At the close, the pages, journeys and the map the change rewrote that
   * the record's `refreshes` line does not name, which the done door holds
   * (J-227 S1).
   */
  readonly unnamed?: readonly string[] | undefined;
}

/**
 * The atlas line the mirror and `greenline status` print after the drift
 * line (J-147 S1): `atlas: none`, or the pages, the drifting ones and the
 * map's commits behind, a major change since the map, and at the close the
 * pages the change touched and those it rewrote that the record's
 * `refreshes` line does not name (J-227 S1). A fact the agent reads; no
 * offer follows from it (J-176 S1).
 * @param standing what the line states
 * @returns the line, unindented
 */
export function atlasLine(standing: AtlasStanding): string {
  const count = standing.touched?.length ?? 0;
  const touched =
    standing.touched === undefined || count === 0
      ? ""
      : count > REFRESH_CAP
        ? `; this change touched ${String(count)} pages, more than the three the close refreshes: the rest wait for the owner's ask`
        : `; this change touched ${standing.touched.join(", ")}: the close refreshes ${count === 1 ? "it" : "them"}`;
  const major =
    standing.major === undefined
      ? ""
      : `; a major change since the map: ${majorWords(standing.major)}`;
  // The pages the change rewrote that its refreshes line does not name, as the done door names them (J-227 S1).
  const rewrote =
    standing.unnamed === undefined || standing.unnamed.length === 0
      ? ""
      : `; this change rewrote ${standing.unnamed.join(", ")}, which the record's refreshes line does not name: ${UNNAMED_CURE}`;
  if (standing.pages === 0) return `atlas: none${major}${touched}${rewrote}`;
  const pages = `${String(standing.pages)} page${standing.pages === 1 ? "" : "s"}, ${String(standing.drifting)} drifting`;
  const map =
    standing.mapBehind === null
      ? ""
      : `; map ${String(standing.mapBehind)} commit${standing.mapBehind === 1 ? "" : "s"} behind`;
  return `atlas: ${pages}${map}${major}${touched}${rewrote}`;
}

/** The words a path that holds a shape names: a schema, a migration, a state machine, a flow. */
const MODEL_WORDS = new Set([
  "schema",
  "schemas",
  "migration",
  "migrations",
  "state",
  "statemachine",
  "machine",
  "machines",
  "fsm",
]);

/** A word naming a flow, alone or in the compounds a path writes as one word, a data flow or a CI pipeline's. */
const FLOW_WORD = /^(?:work|data|control)?flows?$/;

/** The extensions of a file that is a schema whatever its name. */
const SCHEMA_EXTENSIONS = new Set(["sql", "prisma", "graphql", "gql", "proto", "avsc"]);

/**
 * Whether a changed file holds a shape the map draws: its path names a
 * schema, a migration, a state machine or a flow, or its extension is a
 * schema's. Read from the path alone, so a shape the files do not name is
 * not seen.
 * @param path the file, from the root, `/`-separated
 * @returns true for a shape's file outside greenline's folder
 */
export function isModelFile(path: string): boolean {
  if (path.startsWith(".greenline/")) return false;
  const lower = path.toLowerCase();
  const extension = lower.includes(".") ? (lower.split(".").at(-1) ?? "") : "";
  if (SCHEMA_EXTENSIONS.has(extension)) return true;
  return lower.split(/[^a-z]+/).some((word) => MODEL_WORDS.has(word) || FLOW_WORD.test(word));
}
