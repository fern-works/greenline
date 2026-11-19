import { z } from "zod";
import { sha256Hex } from "../commons/hash.ts";
import { contrastRatio, parseColour } from "./colour.ts";
import { parseJson } from "./contract.ts";
import { safeColour, safeLength, safeWeight } from "./style-values.ts";
import {
  COMPONENTS,
  CONCERNS,
  FRAMEWORKS,
  PLATFORMS,
  type Platform,
  type Register,
} from "./interface-facets.ts";

/**
 * The interface catalog (J-123 S6; `workshop/components/interface-catalog.md`):
 * the entries of design language the design step deals from, each data
 * with its facets, its tokens or its sketch, and its provenance, held to one
 * schema and to the floor on its own tokens; the deal, which draws three
 * directions by the facets in play and the page's job under a seed; and the
 * specimen an entry renders as, which the viewer shows and the gate row
 * renders for every entry that has one.
 */

/** The kinds of entry. */
const CATALOG_KINDS = [
  "material",
  "palette",
  "type",
  "shape",
  "hero",
  "section",
  "motion",
  "app style",
  "shell",
  "screen pattern",
  "anatomy by job",
  "rule",
] as const;
/** A kind of entry. */
export type CatalogKind = (typeof CATALOG_KINDS)[number];

/** A token's value: a word, or a number such as a weight. */
export type TokenValue = string | number;

/** A group's named values, or a named group of fields, as DESIGN.md's components and typography hold them. */
export type TokenFields = string | { readonly [field: string]: TokenValue };

/** An entry's tokens in DESIGN.md's groups, with motion beside them. */
export interface CatalogTokens {
  readonly colors?: { readonly [name: string]: string } | undefined;
  readonly typography?: { readonly [name: string]: TokenFields } | undefined;
  readonly spacing?: { readonly [name: string]: string } | undefined;
  readonly rounded?: { readonly [name: string]: string } | undefined;
  readonly components?: { readonly [name: string]: TokenFields } | undefined;
  readonly motion?: { readonly [name: string]: TokenValue } | undefined;
}

/** One ink-on-ground pair a palette names, with the ratio recorded. */
export interface ContrastPair {
  readonly ink: string;
  readonly ground: string;
  /** Text, held to 4.5:1, or large text, held to 3:1. */
  readonly use: "text" | "large";
  readonly ratio: number;
}

/** Where an entry's language came from: a source at its commit, or a studied site on the day it was seen. */
export type CatalogProvenance =
  | {
      readonly repository: string;
      readonly commit: string;
      readonly path: string;
      readonly at?: string | undefined;
      readonly licence: string;
      readonly pin: string;
      readonly basis: string;
    }
  | {
      readonly site: string;
      readonly pages: readonly string[];
      readonly seen: string;
      readonly capture: string;
      readonly sha256: string;
      readonly licence: string;
      readonly basis: string;
    };

/** The facets an entry serves beside its register and platform. */
export interface CatalogFacets {
  readonly concern?: readonly (typeof CONCERNS)[number][] | undefined;
  readonly component?: readonly (typeof COMPONENTS)[number][] | undefined;
  readonly framework?: readonly (typeof FRAMEWORKS)[number][] | undefined;
}

/** One entry of the catalog. */
export interface CatalogEntry {
  readonly id: string;
  readonly kind: CatalogKind;
  readonly register: Register | "both";
  readonly platform: readonly Platform[];
  readonly facets: CatalogFacets;
  readonly tokens?: CatalogTokens | undefined;
  readonly contrast?: readonly ContrastPair[] | undefined;
  readonly sketch?: readonly string[] | undefined;
  readonly words: string;
  readonly provenance: CatalogProvenance;
}

/** The catalog's file: its schema, its recipe and its entries. */
export interface CatalogFile {
  readonly schema: "greenline.interface-catalog/v1";
  readonly recipe: string;
  readonly entries: readonly CatalogEntry[];
}

const value = z.union([z.string(), z.number()]);
const fields = z.union([z.string(), z.record(z.string(), value)]);
const strings = z.record(z.string(), z.string());

const entrySchema: z.ZodType<CatalogEntry> = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "an id is lower case words joined by hyphens"),
    kind: z.enum(CATALOG_KINDS),
    register: z.enum(["site", "app", "both"]),
    platform: z.array(z.enum(PLATFORMS)),
    facets: z
      .object({
        concern: z.array(z.enum(CONCERNS)).optional(),
        component: z.array(z.enum(COMPONENTS)).optional(),
        framework: z.array(z.enum(FRAMEWORKS)).optional(),
      })
      .strict(),
    tokens: z
      .object({
        colors: strings.optional(),
        typography: z.record(z.string(), fields).optional(),
        spacing: strings.optional(),
        rounded: strings.optional(),
        components: z.record(z.string(), fields).optional(),
        motion: z.record(z.string(), value).optional(),
      })
      .strict()
      .optional(),
    contrast: z
      .array(
        z
          .object({
            ink: z.string(),
            ground: z.string(),
            use: z.enum(["text", "large"]),
            ratio: z.number().positive(),
          })
          .strict(),
      )
      .optional(),
    sketch: z.array(z.string().min(1)).min(1).optional(),
    words: z.string().min(1),
    provenance: z.union([
      z
        .object({
          repository: z.string().regex(/^https:\/\//),
          commit: z.string().regex(/^[0-9a-f]{40}$/, "a full commit"),
          path: z.string().min(1),
          at: z.string().optional(),
          licence: z.string().min(1),
          pin: z.string().min(1),
          basis: z.string().min(1),
        })
        .strict(),
      z
        .object({
          site: z.string().regex(/^https:\/\//),
          pages: z.array(z.string().min(1)).min(1),
          seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          capture: z.string().min(1),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          licence: z.string().min(1),
          basis: z.string().min(1),
        })
        .strict(),
    ]),
  })
  .strict();

/** The catalog file's schema. */
const catalogSchema: z.ZodType<CatalogFile> = z
  .object({
    schema: z.literal("greenline.interface-catalog/v1"),
    recipe: z.string().min(1),
    entries: z.array(z.unknown()),
  })
  .strict()
  .transform((file, context) => {
    const entries: CatalogEntry[] = [];
    file.entries.forEach((raw, index) => {
      const parsed = entrySchema.safeParse(raw);
      if (parsed.success) entries.push(parsed.data);
      else
        for (const issue of parsed.error.issues)
          context.addIssue({
            code: "custom",
            path: ["entries", index, ...issue.path.map(String)],
            message: issue.message,
          });
    });
    return { schema: file.schema, recipe: file.recipe, entries };
  });

/** The most words an entry's own text holds. */
const ENTRY_WORDS = 300;
/** A recorded ratio may differ from the measured one by this much, for rounding. */
const RATIO_SLACK = 0.06;

/**
 * Every issue a catalog's text holds: an entry off the schema, an id named
 * twice, an entry with neither tokens nor a sketch where its kind needs one,
 * colours without the pairs they are read in, a pair under the floor or
 * recorded at a ratio its tokens do not give, and words past the limit.
 * Provenance is the schema's: an entry without one does not parse.
 * @param text the catalog file's text
 * @returns one message per issue, empty for a catalog that holds
 */
export function catalogIssues(text: string): readonly string[] {
  const parsed = catalogSchema.safeParse(parseJson(text));
  if (!parsed.success)
    return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (seen.has(entry.id)) issues.push(`${entry.id}: the id is named twice`);
    seen.add(entry.id);
    if (entry.kind !== "rule" && entry.tokens === undefined && entry.sketch === undefined)
      issues.push(`${entry.id}: a ${entry.kind} entry with neither tokens nor a sketch`);
    const colours = entry.tokens?.colors ?? {};
    if (Object.keys(colours).length > 0 && (entry.contrast ?? []).length === 0)
      issues.push(`${entry.id}: colours with no ink-on-ground pair named`);
    for (const pair of entry.contrast ?? []) {
      const ink = parseColour(colours[pair.ink] ?? "");
      const ground = parseColour(colours[pair.ground] ?? "");
      if (ink === undefined || ground === undefined) {
        issues.push(
          `${entry.id}: the pair ${pair.ink} on ${pair.ground} names a colour the entry does not hold`,
        );
        continue;
      }
      const ratio = contrastRatio(ink, ground);
      const floor = pair.use === "large" ? 3 : 4.5;
      if (ratio < floor)
        issues.push(
          `${entry.id}: ${pair.ink} on ${pair.ground} is ${String(ratio)}:1, under the floor's ${String(floor)}:1 for ${pair.use === "large" ? "large text" : "text"}`,
        );
      if (Math.abs(ratio - pair.ratio) > RATIO_SLACK)
        issues.push(
          `${entry.id}: ${pair.ink} on ${pair.ground} records ${String(pair.ratio)}:1, and its tokens give ${String(ratio)}:1`,
        );
    }
    if (entry.words.split(/\s+/).length > ENTRY_WORDS)
      issues.push(`${entry.id}: its words run past ${String(ENTRY_WORDS)}`);
  }
  return issues;
}

/**
 * The catalog's pin: the first twelve hex of its file's digest, which the
 * deal prints and the direction's ruling line names beside its entry.
 * @param text the catalog file's text
 * @returns the pin
 */
export function catalogPin(text: string): string {
  return sha256Hex(text).slice(0, 12);
}

/**
 * Parse a catalog's text.
 * @param text the file's text
 * @returns its entries, or undefined where it does not read
 */
export function parseCatalog(text: string): readonly CatalogEntry[] | undefined {
  const parsed = catalogSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data.entries : undefined;
}

/** HTML's special characters escaped. */
function escaped(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One row of a sketch read as a wireframe: its proportions and its slots, or the line as written. */
interface SketchRow {
  readonly spans: readonly number[];
  readonly slots: readonly string[];
  readonly line: string;
}

/**
 * A sketch's lines as wireframe rows: `row N: columns 7/5; slot a | slot b`
 * gives its proportions and slots, any other line one band with its words.
 * @param sketch the lines
 * @returns the rows
 */
export function sketchRows(sketch: readonly string[]): readonly SketchRow[] {
  return sketch.map((line) => {
    const match = /^row \d+:\s*columns\s+([\d/]+)(?:\s+over\s+[\d/]+)?;\s*(.*)$/i.exec(line);
    if (match === null)
      return { spans: [12], slots: [line.replace(/^[a-z]+ \d+\s*/i, "").trim() || line], line };
    const spans = (match[1] ?? "12")
      .split("/")
      .map(Number)
      .filter((span) => span > 0);
    const slots = (match[2] ?? "")
      .split("|")
      .map((slot) => slot.replace(/^\s*slot\s+/i, "").trim());
    return { spans: spans.length === 0 ? [12] : spans, slots, line };
  });
}

const roleSchema = z.record(z.string(), value);

/**
 * A typography or component role's fields, where the role is a group of them and not a note.
 * @param fieldsOf the role as the entry holds it
 * @returns its fields, or undefined for a note
 */
export function roleFields(
  fieldsOf: TokenFields,
): { readonly [field: string]: TokenValue } | undefined {
  const parsed = roleSchema.safeParse(fieldsOf);
  return parsed.success ? parsed.data : undefined;
}

/** A line height safe to place in a style: a plain ratio, else a length. */
function safeLineHeight(value: TokenValue | undefined): string {
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 && ratio <= 4
    ? String(ratio)
    : safeLength(value, "1.3");
}

/**
 * An entry's specimen: its palette as ink on ground, its type as lines set
 * in its roles, its sketch as a wireframe, its other tokens as a list, all
 * from the data alone, with no font or image fetched. An entry with neither
 * tokens nor a sketch has none.
 * @param entry the entry
 * @returns the specimen's HTML fragment, or undefined
 */
export function specimenHtml(entry: CatalogEntry): string | undefined {
  if (entry.tokens === undefined && entry.sketch === undefined) return undefined;
  const parts: string[] = [];
  const colours = entry.tokens?.colors ?? {};
  for (const pair of entry.contrast ?? [])
    parts.push(
      `<div class="gl-pair" style="background:${safeColour(colours[pair.ground]) ?? "transparent"};color:${safeColour(colours[pair.ink]) ?? "inherit"}">${escaped(`${pair.ink} on ${pair.ground}, ${String(pair.ratio)}:1`)}</div>`,
    );
  if (Object.keys(colours).length > 0)
    parts.push(
      `<div class="gl-swatches">${Object.entries(colours)
        .map(
          ([name, colour]) =>
            `<span class="gl-swatch" style="background:${safeColour(colour) ?? "transparent"}" title="${escaped(`${name} ${colour}`)}"></span>`,
        )
        .join("")}</div>`,
    );
  for (const [role, group] of Object.entries(entry.tokens?.typography ?? {})) {
    const own = roleFields(group);
    if (own === undefined) continue;
    const size = safeLength(own["fontSize"], "16px");
    parts.push(
      `<p class="gl-type" style="font-size:${size};font-weight:${safeWeight(own["fontWeight"], 400)};line-height:${safeLineHeight(own["lineHeight"])}">${escaped(`${role}, ${size}`)}</p>`,
    );
  }
  for (const row of sketchRows(entry.sketch ?? []))
    parts.push(
      `<div class="gl-row" style="grid-template-columns:${row.spans.map((span) => `${String(span)}fr`).join(" ")}" title="${escaped(row.line)}">${row.slots.map((slot) => `<span class="gl-slot">${escaped(slot)}</span>`).join("")}</div>`,
    );
  const rest = [
    ...Object.entries(entry.tokens?.rounded ?? {}).map(
      ([name, radius]) => `rounded ${name} ${radius}`,
    ),
    ...Object.entries(entry.tokens?.spacing ?? {}).map(([name, step]) => `spacing ${name} ${step}`),
    ...Object.entries(entry.tokens?.motion ?? {}).map(
      ([name, motion]) => `motion ${name} ${String(motion)}`,
    ),
    ...Object.keys(entry.tokens?.components ?? {}).map((name) => `component ${name}`),
  ];
  if (rest.length > 0)
    parts.push(
      `<ul class="gl-tokens">${rest.map((line) => `<li>${escaped(line)}</li>`).join("")}</ul>`,
    );
  return `<figure class="gl-specimen" data-entry="${escaped(entry.id)}" data-kind="${escaped(entry.kind)}">${parts.join("")}<figcaption>${escaped(`${entry.id}, ${entry.kind}, ${entry.register}`)}</figcaption></figure>`;
}

/** What the deal is asked: the register and platform in play, and the page's job, tone, sector and material in hand. */
export interface DealRequest {
  readonly register: Register;
  readonly platform: Platform;
  /** The page's job, such as sign-up or subscribe, which gives the anatomy. */
  readonly job?: string | undefined;
  readonly tone?: string | undefined;
  readonly sector?: string | undefined;
  /** The material in hand, such as photos, copy or a logo; undefined where the owner did not say. */
  readonly material?: readonly string[] | undefined;
  /** The draw's seed; the same request and seed deal the same three. */
  readonly seed: number;
  /** The one reroll the owner may ask for. */
  readonly reroll: boolean;
}

/** One role in a direction and the entry dealt for it. */
export interface DirectionPart {
  readonly role: "material" | "palette" | "type" | "composition" | "motion" | "anatomy";
  readonly entry: CatalogEntry;
}

/** One direction dealt. */
export interface Direction {
  readonly name: string;
  readonly parts: readonly DirectionPart[];
}

/** The roles a direction fills by register, each with the kinds that can fill it. */
const ROLES: ReadonlyMap<
  Register,
  readonly (readonly [DirectionPart["role"], readonly CatalogKind[]])[]
> = new Map([
  [
    "site",
    [
      ["material", ["material"]],
      ["palette", ["palette"]],
      ["type", ["type"]],
      ["composition", ["hero", "shape", "section"]],
      ["motion", ["motion"]],
    ],
  ],
  [
    "app",
    [
      ["material", ["app style", "material"]],
      ["palette", ["palette"]],
      ["type", ["type"]],
      ["composition", ["shell", "screen pattern"]],
      ["motion", ["motion"]],
    ],
  ],
]);

/** A small seeded generator, mulberry32, so a draw is the same under the same seed. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seed made from a request, so the same ask deals the same three.
 * @param text the request as text
 * @returns the seed
 */
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Whether an entry serves the register and the platform in play. */
function serves(entry: CatalogEntry, register: Register, platform: Platform): boolean {
  return (
    (entry.register === register || entry.register === "both") &&
    (entry.platform.length === 0 || entry.platform.includes(platform))
  );
}

/** Whether a sketch needs pictures the owner may not have. */
function needsPictures(entry: CatalogEntry): boolean {
  return (entry.sketch ?? []).some((line) => /\b(?:image|photo|picture)/i.test(line));
}

/** Draw up to `count` entries, without repeats, each weighted. */
function draw(
  candidates: readonly CatalogEntry[],
  weight: (entry: CatalogEntry) => number,
  count: number,
  random: () => number,
): readonly CatalogEntry[] {
  const pool = [...candidates];
  const drawn: CatalogEntry[] = [];
  while (drawn.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + weight(entry), 0);
    const target = random() * total;
    let chosen = pool.length - 1;
    let reached = 0;
    for (const [index, entry] of pool.entries()) {
      reached += weight(entry);
      if (target < reached) {
        chosen = index;
        break;
      }
    }
    const [taken] = pool.splice(chosen, 1);
    if (taken !== undefined) drawn.push(taken);
  }
  return drawn;
}

/**
 * Deal three directions: for each role of the register, three entries that
 * serve the facets in play drawn without repeats, weighted toward the
 * tone's, the sector's and the material's words; a composition that needs
 * pictures is left out where the owner named material without them; and
 * the anatomy the job gives, the same for the three. The reroll draws again
 * under another seed. Never the catalog whole.
 * @param entries the catalog's entries
 * @param request the request
 * @returns three directions, fewer where the catalog holds too few entries for a role
 */
export function deal(entries: readonly CatalogEntry[], request: DealRequest): readonly Direction[] {
  const random = generator(request.seed + (request.reroll ? 7919 : 0));
  const words = [request.tone, request.sector, ...(request.material ?? [])]
    .flatMap((text) => (text ?? "").toLowerCase().split(/[^a-z0-9]+/))
    .filter((word) => word.length > 2);
  const weight = (entry: CatalogEntry): number => {
    const text = `${entry.id} ${entry.words}`.toLowerCase();
    return 1 + 2 * words.filter((word) => text.includes(word)).length;
  };
  const pictures =
    request.material === undefined ||
    request.material.some((item) => /photo|image|picture|illustration/i.test(item));
  const usable = entries.filter(
    (entry) =>
      serves(entry, request.register, request.platform) && (pictures || !needsPictures(entry)),
  );
  const roles = ROLES.get(request.register) ?? [];
  const drawnByRole = roles.map(([role, kinds]) => ({
    role,
    drawn: draw(
      usable.filter((entry) => kinds.includes(entry.kind)),
      weight,
      3,
      random,
    ),
  }));
  const job = request.job?.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  // The job's anatomy is the page's, not a composition: the picture rule leaves it in.
  const anatomy =
    job === undefined
      ? undefined
      : entries
          .filter((entry) => serves(entry, request.register, request.platform))
          .find(
            (entry) =>
              entry.kind === "anatomy by job" &&
              (entry.id === `job-${job}` || entry.id.endsWith(job)),
          );
  const count = Math.max(0, ...drawnByRole.map((entry) => entry.drawn.length));
  return Array.from({ length: Math.min(3, count) }, (_, index): Direction => {
    const parts: DirectionPart[] = drawnByRole.flatMap(({ role, drawn }) => {
      const entry = drawn[index] ?? drawn[index % Math.max(1, drawn.length)];
      return entry === undefined ? [] : [{ role, entry }];
    });
    if (anatomy !== undefined) parts.push({ role: "anatomy", entry: anatomy });
    const lead = parts.find((part) => part.role === "material") ?? parts[0];
    const composition = parts.find((part) => part.role === "composition");
    return {
      name: [lead?.entry.id, composition?.entry.id].filter((id) => id !== undefined).join(" with "),
      parts,
    };
  });
}

/** The first sentences of a text, up to a number of words, and every sentence that names a pitfall. */
function gist(words: string, limit: number): string {
  const sentences = words.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  let count = 0;
  for (const sentence of sentences) {
    const size = sentence.split(/\s+/).length;
    if (count + size > limit && kept.length > 0) break;
    kept.push(sentence);
    count += size;
  }
  const pitfalls = sentences.filter(
    (sentence) => /pitfall/i.test(sentence) && !kept.includes(sentence),
  );
  return [...kept, ...pitfalls].join(" ");
}

/** An entry's source in a few words. */
function sourceOf(entry: CatalogEntry): string {
  return "pin" in entry.provenance
    ? entry.provenance.pin
    : `${entry.provenance.site.replace(/^https:\/\//, "").replace(/\/$/, "")}, seen ${entry.provenance.seen}`;
}

/**
 * The deal's text: each direction with its parts, each part its entry's
 * id, kind and source, a few sentences of its reasons and its pitfalls,
 * and its sketch where it has one.
 * @param directions the directions dealt
 * @returns the text, ending with a newline
 */
export function dealText(directions: readonly Direction[]): string {
  if (directions.length === 0)
    return "No direction can be dealt: the catalog holds no entry for the facets in play.\n";
  const part = (role: string, entry: CatalogEntry): readonly string[] => [
    `- ${role}: ${entry.id} (${entry.kind}, from ${sourceOf(entry)}). ${gist(entry.words, 40)}`,
    ...(entry.sketch ?? []).map((line) => `    ${line}`),
  ];
  const shown = directions.map((direction, index) =>
    [
      `Direction ${String(index + 1)}: ${direction.name}`,
      ...direction.parts
        .filter((each) => each.role !== "anatomy")
        .flatMap((each) => part(each.role, each.entry)),
    ].join("\n"),
  );
  // The job gives the same anatomy to the three, so it is printed once.
  const anatomy = directions[0]?.parts.find((each) => each.role === "anatomy")?.entry;
  const job =
    anatomy === undefined
      ? []
      : [["The job's anatomy, for all three:", ...part("anatomy", anatomy)].join("\n")];
  return `${[...shown, ...job].join("\n\n")}\n`;
}
