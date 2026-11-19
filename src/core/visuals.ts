import { z } from "zod";
import type { Result } from "../commons/result.ts";
import { CHANGE_ID } from "./change.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  isJsonObject,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { Tier } from "./inspector/documents.ts";

/**
 * The visual home, `.greenline/visuals/` (`docs/SPEC.md` §3; the visual
 * system, `workshop/components/visual-system.md`): every durable picture
 * the practice keeps, a change's under its id, the architecture map under
 * `map/`, the atlas's subsystem journeys under `subsystems/<name>/`. Beside
 * each visual stands its manifest, `<slug>.visual.json`, naming its title,
 * its form, the skill that made it, its change, the commit it was made at,
 * the files it covers, when it was made and what it shows. `greenline
 * status` and the inspector compute its staleness from the same facts,
 * through {@link tierOf}, by commits and never the wall clock.
 */

/** The home of every durable visual, from the repository root. */
export const VISUALS_HOME = ".greenline/visuals";

/** The folder of the captures the owner takes from the viewer while no change is open (J-124 S1). */
export const INTERFACE_VISUALS = "interface";

/** The suffix of a visual's manifest, beside the visual of the same slug. */
export const MANIFEST_SUFFIX = ".visual.json";

/** The manifest's schema identifier. */
export const VISUAL_SCHEMA = "greenline.visual/v1";

/** The file kinds a visual may be, in the order a slug's file is looked for: an SVG drawing, an HTML page, a Markdown page. */
export const VISUAL_EXTENSIONS = ["svg", "html", "md"] as const;

/** A visual file's kind, by its extension. */
export type VisualExtension = (typeof VISUAL_EXTENSIONS)[number];

/** A slug: lowercase words joined by hyphens, as a file's stem. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A change's picture's id, `<change>/<slug>`, as a remake's `replaces` names it (J-227 S1). */
const CHANGE_PICTURE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A repository path a manifest may cover: relative, `/`-separated, never leaving the root, a trailing `/` naming a directory. */
const COVERED = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\0\\]+$/;

const DATE_OR_INSTANT =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/** A durable picture's finishes (J-204 S1): a text drawing, an SVG in the style guide's look, or an interactive page. */
const PICTURE_FINISHES = ["text", "branded SVG", "interactive"] as const;

/** A durable picture's finish. */
export type PictureFinish = (typeof PICTURE_FINISHES)[number];

const briefSchema = z
  .object({
    question: z.string().trim().min(1),
    form: z.string().trim().min(1).max(40),
    nodes: z.number().int().min(1),
    finish: z.enum(PICTURE_FINISHES),
    palette: z.string().trim().min(1),
    reader: z.string().trim().min(1),
  })
  .strict();

const manifestSchema = z
  .object({
    schema: z.literal(VISUAL_SCHEMA),
    title: z.string().trim().min(1),
    form: z.string().trim().min(1).max(40),
    skill: z.string().regex(SLUG, "a skill's name"),
    change: z.string().regex(CHANGE_ID, "a change's id").nullable(),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/, "a commit's hash, 7 to 40 hex characters"),
    files: z.array(z.string().regex(COVERED, "a path inside the repository")),
    made: z.string().regex(DATE_OR_INSTANT, "a date, or a date and time"),
    madeBy: z.enum(["agent", "session"]).optional(),
    summary: z.string().trim().min(1),
    ask: z.string().trim().min(1).optional(),
    replaces: z.string().regex(CHANGE_PICTURE, "a change's picture, as <change>/<slug>").optional(),
    brief: briefSchema.optional(),
    reaches: z.array(z.string().regex(/^https?:\/\//, "an http or https address")).optional(),
    capture: z
      .object({
        address: z.string().regex(/^\//, "a address starts with '/'"),
        widths: z.array(z.number().int().positive()).min(1),
        scores: z
          .object({
            floor: z.number().int().min(0),
            reflex: z.number().int().min(0),
            finish: z.number().int().min(0),
          })
          .strict(),
        kept: z
          .object({ checked: z.number().int().min(0), missing: z.number().int().min(0) })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** A capture's facts (J-123 S5): the address, the widths taken, the findings red by tier, and on a redesign the kept check's count. */
export interface CaptureFacts {
  readonly address: string;
  readonly widths: readonly number[];
  readonly scores: { readonly floor: number; readonly reflex: number; readonly finish: number };
  /** The kept entries checked and the ones missing, on a redesign's after. */
  readonly kept?: { readonly checked: number; readonly missing: number } | undefined;
}

/** Who wrote a visual: a fresh agent the line started, or the root session. */
export type VisualMaker = "agent" | "session";

/**
 * The clause every notice of a kept picture ends with (J-198 S1): the notice
 * names the fact to the owner and invites nothing, since a remake is the
 * owner's ask alone and the reply offers no lasting picture
 * (j196t-conduct-empty finding 1).
 */
export const NO_REMAKE_OFFER = "the reply offers no remake, which is the owner's ask alone";

/**
 * Who drew a kept picture, as a notice names it beside its title (J-198 S1).
 * @param maker the manifest's `madeBy`
 * @returns the words with their leading comma, or none where no maker stands
 */
export function makerWords(maker: VisualMaker | undefined): string {
  if (maker === undefined) return "";
  return maker === "agent" ? ", drawn by a fresh agent" : ", drawn by the session itself";
}

/**
 * A manifest's text with its maker recorded beside `made` (J-129 S6): the
 * session once any write of the visual came from it, since a durable visual
 * is a fresh agent's, and the agent only while every write was one. A
 * capture's manifest, the one `greenline check interface` writes with its
 * `capture` facts, takes no maker: it is the check's (J-134 S2).
 * @param text the manifest's text as it stands
 * @param maker who made this write
 * @returns the new text, or undefined where it needs none, is a capture's or is no JSON object
 */
export function manifestWithMaker(
  text: string,
  maker: VisualMaker,
  absentOnly = false,
): string | undefined {
  const json = parseJson(text);
  if (json === undefined || !isJsonObject(json)) return undefined;
  const fields = json;
  // A capture is the interface check's own output, never a visual the session or an agent made (J-134 S2).
  if (fields["capture"] !== undefined) return undefined;
  const stated = fields["madeBy"];
  // A shell command's write is read by its files' times, so it fills a maker and never replaces one (J-135 S2).
  if (absentOnly && stated !== undefined) return undefined;
  const next: VisualMaker = stated === "session" ? "session" : maker;
  if (stated === next) return undefined;
  const entries = Object.entries(fields).filter(([key]) => key !== "madeBy");
  const after = entries.findIndex(([key]) => key === "made");
  const at = after === -1 ? entries.length : after + 1;
  const ordered = [...entries.slice(0, at), ["madeBy", next], ...entries.slice(at)];
  return `${JSON.stringify(Object.fromEntries(ordered), null, 2)}\n`;
}

/** One event of a change's raw log as the keep reads it for the picture's maker (J-192 S1). */
export interface DrawingEvent {
  readonly kind: string;
  /** When the hook saw it, an ISO time. */
  readonly at: string;
  /** The fresh agent that ran the tool, null for the session itself. */
  readonly agent: string | null;
  /** The id pairing a before-tool with its after-tool. */
  readonly call: string | null;
  /** The shell command's text, null for a tool that runs none. */
  readonly command: string | null;
  /** The paths a write tool wrote, from the root, none for any other tool. */
  readonly written: readonly string[];
}

/** How far a file's time may stand outside its command's run and still be its write, in milliseconds. */
const WRITE_SLACK_MS = 2000;

/**
 * Who drew a picture the keep takes (J-192 S1; the one maker rule, J-129
 * S6): derived from the agent facts the hooks logged for the change, never
 * the agent's word. The last write of the picture's file is read: a write
 * tool's that names its path, or a shell command's whose run holds the
 * file's time, one naming the file outranking one that only holds it; a
 * fresh agent's write makes the picture the agent's, and the session's the
 * session's. A shell command that names the file outside the file's time
 * wrote nothing of it, such as the session's own keep refused a moment
 * before (J-198 S1, j196t-conduct-empty finding 2). Where the hooks logged
 * no write of the file, or nothing for the change, a harness without them,
 * there are no facts, and the manifest names no maker.
 * @param source the picture's file, from the root, `/`-separated
 * @param modifiedMs the file's modification time
 * @param events the change's logged events, oldest first
 * @returns the maker, or undefined where no logged write of the file stands
 */
export function pictureMaker(
  source: string,
  modifiedMs: number,
  events: readonly DrawingEvent[],
): VisualMaker | undefined {
  if (events.length === 0) return undefined;
  const name = source.slice(source.lastIndexOf("/") + 1);
  const started = new Map<string, number>();
  let last:
    | { readonly agent: string | null; readonly named: boolean; readonly at: number }
    | undefined;
  for (const event of events) {
    const at = Date.parse(event.at);
    if (Number.isNaN(at)) continue;
    if (event.kind === "before-tool" && event.call !== null) started.set(event.call, at);
    if (event.kind !== "after-tool") continue;
    const wrote = event.written.includes(source);
    const from = event.call === null ? undefined : started.get(event.call);
    const during =
      event.command !== null &&
      modifiedMs >= (from ?? at) - WRITE_SLACK_MS &&
      modifiedMs <= at + WRITE_SLACK_MS;
    // A command that names the file is its write only while its run holds the file's time.
    const named = during && event.command.includes(name);
    if (!wrote && !during) continue;
    // A write that names the file outranks a run that only holds its time.
    const strong = wrote || named;
    if (last === undefined || strong || !last.named)
      last = { agent: event.agent, named: strong, at };
  }
  if (last === undefined) return undefined;
  return last.agent === null ? "session" : "agent";
}

/** A visual's manifest, as its maker wrote it. */
export interface VisualManifest {
  readonly schema: typeof VISUAL_SCHEMA;
  readonly title: string;
  /** The kind of picture, such as `sequence`, `state`, `map`, `journey` or `figure`. */
  readonly form: string;
  /** The skill that made it. */
  readonly skill: string;
  /** The change that made it; null for none. */
  readonly change: string | null;
  /** The commit the visual was made at. */
  readonly commit: string;
  /** The repository paths it covers; a path ending in `/` covers a directory. */
  readonly files: readonly string[];
  readonly made: string;
  /**
   * Who wrote it, as the hooks recorded it after the write (J-129 S6): a
   * fresh agent, or the root session itself, which a durable visual never
   * is made by; absent where no hook recorded a write.
   */
  readonly madeBy?: VisualMaker | undefined;
  readonly summary: string;
  /**
   * The owner's words that asked for the picture, which `greenline picture
   * keep` records (J-176 S1): a change's durable picture is kept on the
   * owner's ask alone; absent on a visual made before the door.
   */
  readonly ask?: string | undefined;
  /**
   * The kept picture this remake replaces, by its id `<change>/<slug>`,
   * which `greenline picture keep --replaces` records (J-227 S1) and
   * `greenline status` names as GL0609 while the replaced one stands;
   * absent on a picture that replaces none.
   */
  readonly replaces?: string | undefined;
  /**
   * The brief its skill wrote before the picture was drawn, which
   * `greenline picture keep` reads into the manifest (J-204 S1): the
   * question it answers, its form, its node count, its finish, its palette
   * and its reader; absent where none was written, which status names.
   */
  readonly brief?: PictureBrief | undefined;
  /**
   * The http or https addresses the visual's file loads from outside the
   * repository, which the event hook records after a write under the home
   * and `greenline status` names as GL0608 (J-147 S3); absent where none.
   */
  readonly reaches?: readonly string[] | undefined;
  /** A visual of the form `capture` names what it captured. */
  readonly capture?: CaptureFacts | undefined;
}

/** A durable picture's brief (J-204 S1), written by its skill before it is drawn. */
export interface PictureBrief {
  /** The question the picture answers, in the reader's words. */
  readonly question: string;
  /** Its form, such as `sequence`, `state` or `architecture`. */
  readonly form: string;
  /** The nodes it draws. */
  readonly nodes: number;
  readonly finish: PictureFinish;
  /** Its palette, by the project's style guide where one stands. */
  readonly palette: string;
  /** Who reads it. */
  readonly reader: string;
}

/** A brief's file beside the picture its skill draws: `.greenline/tmp/<id>/pictures/<slug>.brief.md`. */
export function briefPath(change: string, slug: string): string {
  return `.greenline/tmp/${change}/pictures/${slug}.brief.md`;
}

/** The brief's fields, in its file's order. */
const BRIEF_FIELDS = ["question", "form", "nodes", "finish", "palette", "reader"] as const;

/** A brief's line: `- <field>: <value>`, a list marker and emphasis allowed. */
const BRIEF_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*:(?:\*\*)?\s*(.+?)\s*$/;

/**
 * Parse a picture's brief: one line per field, `- question: <words>`,
 * `- form:`, `- nodes:`, `- finish:` (text, branded SVG or interactive),
 * `- palette:` and `- reader:`; any other line, a title among them, is the
 * brief's own and read for nothing.
 * @param input the brief's text
 * @param source where it was read, for the refusal
 * @returns the brief, or every field it lacks or gets wrong
 */
export function parseBrief(
  input: string,
  source: string,
): Result<PictureBrief, ContractParseFailed> {
  const found = new Map<string, string>();
  for (const line of input.split("\n")) {
    const match = BRIEF_LINE.exec(line);
    const field = match?.[1]?.toLowerCase();
    if (match === null || field === undefined || !BRIEF_FIELDS.some((each) => each === field))
      continue;
    if (!found.has(field)) found.set(field, match[2] ?? "");
  }
  const finish = found.get("finish");
  const nodes = found.get("nodes");
  const parsed = briefSchema.safeParse({
    question: found.get("question"),
    form: found.get("form"),
    nodes: nodes !== undefined && /^\d+$/.test(nodes) ? Number(nodes) : nodes,
    finish: PICTURE_FINISHES.find((each) => each.toLowerCase() === finish?.toLowerCase()) ?? finish,
    palette: found.get("palette"),
    reader: found.get("reader"),
  });
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk(parsed.data);
}

/**
 * Parse a visual's manifest.
 * @param input the manifest's text
 * @param source where it was read, for the refusal
 * @returns the manifest, or every field it gets wrong
 */
export function parseVisualManifest(
  input: string,
  source: string,
): Result<VisualManifest, ContractParseFailed> {
  const json = parseJson(input);
  if (json === undefined) return contractFailure(source, [{ path: "", message: "not JSON" }]);
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk(parsed.data);
}

/** The style guide's slug: `style-guide.md` and its manifest `style-guide.visual.json` at the home's top (J-147 S1). */
export const STYLE_GUIDE = "style-guide";

/** Where a visual stands in the home: under a change, in the map, in a subsystem's journeys, or the project's style guide. */
export type VisualPlace =
  | { readonly kind: "change"; readonly change: string; readonly slug: string }
  /** A capture the owner took from the viewer while no change was open (J-124 S1). */
  | { readonly kind: "interface"; readonly slug: string }
  | { readonly kind: "map"; readonly slug: string }
  | { readonly kind: "journey"; readonly subsystem: string; readonly slug: string }
  /** The project's diagram style guide, the form `style`, at the home's top (J-147 S1). */
  | { readonly kind: "style"; readonly slug: typeof STYLE_GUIDE };

/**
 * The place a manifest names by its path under the home, or undefined for a
 * path the home's layout does not hold.
 * @param underHome the manifest's path relative to {@link VISUALS_HOME}, `/`-separated
 * @returns its place
 */
export function placeOfManifest(underHome: string): VisualPlace | undefined {
  if (!underHome.endsWith(MANIFEST_SUFFIX)) return undefined;
  const parts = underHome.slice(0, -MANIFEST_SUFFIX.length).split("/");
  const slug = parts.at(-1) ?? "";
  if (!SLUG.test(slug)) return undefined;
  const [first, second] = parts;
  if (parts.length === 1 && slug === STYLE_GUIDE) return { kind: "style", slug: STYLE_GUIDE };
  if (parts.length === 2 && first === "map") return { kind: "map", slug };
  if (parts.length === 2 && first === INTERFACE_VISUALS) return { kind: "interface", slug };
  if (parts.length === 2 && first !== undefined && CHANGE_ID.test(first))
    return { kind: "change", change: first, slug };
  if (parts.length === 3 && first === "subsystems" && second !== undefined && SLUG.test(second))
    return { kind: "journey", subsystem: second, slug };
  return undefined;
}

/**
 * A visual's id, its path under the home without the manifest's suffix:
 * `<change>/<slug>`, `map/<slug>`, `interface/<slug>`, `subsystems/<name>/<slug>` or `style-guide`, which the
 * inspector's deep link `/atlas/visuals/<id>` carries.
 * @param place where it stands
 * @returns the id
 */
export function visualId(place: VisualPlace): string {
  switch (place.kind) {
    case "change":
      return `${place.change}/${place.slug}`;
    case "map":
      return `map/${place.slug}`;
    case "interface":
      return `${INTERFACE_VISUALS}/${place.slug}`;
    case "journey":
      return `subsystems/${place.subsystem}/${place.slug}`;
    case "style":
      return STYLE_GUIDE;
  }
}

/**
 * The folder a change's visuals stand in, from the repository root.
 * @param change the change's id
 * @returns the folder, with its trailing `/`
 */
export function changeVisualsFolder(change: string): string {
  return `${VISUALS_HOME}/${change}/`;
}

/** What git answered about a visual's covered files since its commit. */
export type DriftFacts =
  /** The visual's commit is not in the repository's history, so nothing since it can be counted. */
  | { readonly kind: "unknown-commit" }
  | {
      readonly kind: "read";
      /** The commits after the visual's commit, up to HEAD, that touched a covered file. */
      readonly touching: number;
      /** The covered paths the visual's commit held that HEAD no longer holds. */
      readonly missing: number;
    };

/** A visual's or an atlas page's staleness: its tier and the commits that touched its files since. */
export interface Staleness {
  readonly tier: Tier;
  readonly commitsSince: number | null;
}

/**
 * The staleness arithmetic the map, the atlas, `greenline status` and the
 * inspector share, in the map's tiers read as three words: fresh while no
 * commit since touched a covered file (the map's "current" included),
 * drifting once one did, stale when its commit cannot be read or a covered
 * file is gone. Commits are counted, never the wall clock.
 * @param facts git's answers
 * @returns the tier and the commits counted
 */
export function tierOf(facts: DriftFacts): Staleness {
  if (facts.kind === "unknown-commit") return { tier: "stale", commitsSince: null };
  if (facts.missing > 0) return { tier: "stale", commitsSince: facts.touching };
  return { tier: facts.touching > 0 ? "drifting" : "fresh", commitsSince: facts.touching };
}

/** One visual a change's links file names. */
export interface ChangeVisualLink {
  readonly id: string;
  readonly title: string;
  /** The visual's file from the repository root; null when its manifest stands alone. */
  readonly file: string | null;
  readonly manifest: string;
}

/** The links file's name in the change's folder, `.greenline/ledger/<id>/`. */
export const LINKS_FILE = "visuals.json";

/**
 * A change's links file, `.greenline/ledger/<id>/visuals.json`: the visuals
 * its folder in the home holds, in id order, opening with its `generatedBy`
 * key, the command that wrote it, as every generated JSON file beside a
 * record does.
 * @param change the change's id
 * @param links its visuals
 * @param writer the command that writes it: the event hook after a tool, or the inspector after a delete
 * @returns the file's text
 */
export function linksFileText(
  change: string,
  links: readonly ChangeVisualLink[],
  writer: LinksWriter,
): string {
  const sorted = [...links].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return `${JSON.stringify({ generatedBy: writer, change, visuals: sorted }, null, 2)}\n`;
}

/** The commands that write a change's links file. */
export type LinksWriter = "greenline event" | "greenline inspect";

/**
 * The documents index (J-147 S1; the register's row of 2026-10-28 on the
 * documents' drift): the repository's own documents, a README or a page
 * under `docs/`, each with the files it covers, read by the visuals' own
 * arithmetic, so a document drifts as an atlas page does. The `explain`
 * start seeds it at discovery from the top level and `docs/`, and the event
 * hook keeps a listed document's commit when a change writes it. A document
 * the owner wrote is offered for its refresh and never rewritten unasked.
 */
export const DOCUMENTS_INDEX: string = `${VISUALS_HOME}/documents.json`;

/** The documents index's schema identifier. */
export const DOCUMENTS_SCHEMA = "greenline.documents/v1";

/** Who wrote a document: the practice, which may refresh it at a close, or the owner, whose page is only offered. */
export type DocumentAuthor = "practice" | "owner";

const documentSchema = z
  .object({
    path: z.string().regex(COVERED, "a path inside the repository"),
    author: z.enum(["practice", "owner"]),
    files: z.array(z.string().regex(COVERED, "a path inside the repository")).min(1),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/, "a commit's hash, 7 to 40 hex characters"),
    change: z.string().regex(CHANGE_ID, "a change's id").nullable(),
  })
  .strict();

const documentsSchema = z
  .object({
    schema: z.literal(DOCUMENTS_SCHEMA),
    documents: z.array(documentSchema),
  })
  .strict()
  .superRefine((index, context) => {
    const paths = index.documents.map((entry) => entry.path);
    index.documents.forEach((entry, at) => {
      if (paths.indexOf(entry.path) !== at)
        context.addIssue({
          code: "custom",
          path: ["documents", at, "path"],
          message: `the document '${entry.path}' is listed twice`,
        });
    });
  });

/** One document the index lists. */
export interface IndexedDocument {
  /** The document's path from the root. */
  readonly path: string;
  readonly author: DocumentAuthor;
  /** The repository paths it covers; a path ending in `/` covers a directory. */
  readonly files: readonly string[];
  /** The commit it was kept at. */
  readonly commit: string;
  /** The change that kept it last; null for the discovery that listed it. */
  readonly change: string | null;
}

/** The documents index. */
export interface DocumentsIndex {
  readonly schema: typeof DOCUMENTS_SCHEMA;
  readonly documents: readonly IndexedDocument[];
}

/**
 * Parse the documents index.
 * @param input the index's text
 * @param source where it was read, for the refusal
 * @returns the index, or every field it gets wrong
 */
export function parseDocuments(
  input: string,
  source: string,
): Result<DocumentsIndex, ContractParseFailed> {
  const json = parseJson(input);
  if (json === undefined) return contractFailure(source, [{ path: "", message: "not JSON" }]);
  const parsed = documentsSchema.safeParse(json);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  return contractOk(parsed.data);
}

/**
 * The index's text with the documents a change wrote kept at a commit: each
 * listed path among the written takes the commit and the change, the rest
 * stand as they are (J-147 S1).
 * @param index the index as it stands
 * @param written the paths the change wrote, from the root
 * @param commit the commit the documents are kept at
 * @param change the change that wrote them
 * @returns the new text, or undefined where no listed document was written or none moves
 */
export function documentsKept(
  index: DocumentsIndex,
  written: readonly string[],
  commit: string,
  change: string,
): string | undefined {
  let moved = false;
  const documents = index.documents.map((entry) => {
    if (!written.includes(entry.path)) return entry;
    if (entry.commit === commit && entry.change === change) return entry;
    moved = true;
    return { ...entry, commit, change };
  });
  return moved ? documentsText({ ...index, documents }) : undefined;
}

/**
 * The documents index as its file holds it.
 * @param index the index
 * @returns the text, two-space indented with a closing newline
 */
function documentsText(index: DocumentsIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/**
 * A manifest's text with its commit moved, the other keys kept in order:
 * the close moves a change's visual to the commit it closes at where no
 * file the visual covers changed since its own (J-147 S3, J-216 S1).
 * @param text the manifest's text as it stands
 * @param commit the commit to pin
 * @returns the new text, or undefined where it is no JSON object or already pinned there
 */
export function manifestAtCommit(text: string, commit: string): string | undefined {
  const json = parseJson(text);
  if (json === undefined || !isJsonObject(json)) return undefined;
  const stated = PINNED.safeParse(json);
  if (!stated.success || stated.data.commit === commit) return undefined;
  return `${JSON.stringify({ ...json, commit }, null, 2)}\n`;
}

/** The manifest's commit, read where it is text. */
const PINNED = z.object({ commit: z.string() });

/** A change's visual the close's pin read: its id and its manifest's path from the root. */
export interface PinnedVisual {
  readonly id: string;
  readonly path: string;
}

/**
 * A visual whose commit the close's pin left as it stands (J-216 S1), and
 * why: a file it covers changed between its commit and the close's, or the
 * history does not hold its commit, so status names it as GL0601 does.
 */
export interface KeptAnchor extends PinnedVisual {
  readonly commit: string;
  readonly reason: "covered-changed" | "commit-unknown";
}

/** What the close's pin did to a change's visuals: the manifests it moved, and the ones it kept, in the home's order. */
export interface ChangePin {
  readonly moved: readonly PinnedVisual[];
  readonly kept: readonly KeptAnchor[];
}

/**
 * The after-tool line naming what the close's pin did (J-216 S1; the
 * register's row of 2026-11-05, "The keeper over the oracle"): each moved
 * visual and the commit it takes, which the record's commit carries, and
 * each kept one with its commit and its reason; a kept visual's drift is
 * status's fact, named in the close section, and the line offers no remake
 * (J-198 S1).
 * @param pin what the pin did
 * @param commit the commit the moved visuals take
 * @returns the line, or undefined where the pin moved and kept nothing
 */
export function closePinLine(pin: ChangePin, commit: string): string | undefined {
  if (pin.moved.length === 0 && pin.kept.length === 0) return undefined;
  const short = commit.slice(0, 7);
  const moved = pin.moved.map(
    (visual) => `${visual.id} takes ${short}, as nothing it covers changed since its commit`,
  );
  const kept = pin.kept.map(
    (visual) =>
      `${visual.id} keeps its commit ${visual.commit.slice(0, 7)}, as ${visual.reason === "covered-changed" ? "a file it covers changed since" : "the history does not hold that commit"}`,
  );
  const commitIt =
    pin.moved.length === 0
      ? []
      : [`commit ${pin.moved.length === 1 ? "its manifest" : "their manifests"} with the record`];
  const drift =
    pin.kept.length === 0
      ? []
      : [`status names the drift (GL0601), which the close section names, and ${NO_REMAKE_OFFER}`];
  return `pictures at the close: ${[...moved, ...commitIt, ...kept, ...drift].join("; ")}`;
}

/**
 * A manifest's text with the addresses its visual reaches outside the
 * repository recorded in `reaches`, after `summary` where it stands new
 * (J-147 S3); the key goes when none is left.
 * @param text the manifest's text as it stands
 * @param reaches the addresses found in the visual's file, in order
 * @returns the new text, or undefined where it is no JSON object or nothing moves
 */
export function manifestWithReaches(text: string, reaches: readonly string[]): string | undefined {
  const json = parseJson(text);
  if (json === undefined || !isJsonObject(json)) return undefined;
  const stated = json["reaches"];
  const same =
    Array.isArray(stated) &&
    stated.length === reaches.length &&
    stated.every((value, at) => value === reaches[at]);
  if (same || (stated === undefined && reaches.length === 0)) return undefined;
  const entries = Object.entries(json).filter(([key]) => key !== "reaches");
  if (reaches.length === 0) return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
  const after = entries.findIndex(([key]) => key === "summary");
  const at = after === -1 ? entries.length : after + 1;
  const ordered = [...entries.slice(0, at), ["reaches", [...reaches]], ...entries.slice(at)];
  return `${JSON.stringify(Object.fromEntries(ordered), null, 2)}\n`;
}

/** An element's attribute that loads a resource from an address. */
const LOADS =
  /<(?:script|link|img|iframe|source|video|audio|embed|object|image|use)\b[^>]*?\s(?:src|href|data|xlink:href)\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi;

/** A stylesheet's or a script's load of an address. */
const FETCHES =
  /(?:url\(\s*["']?|@import\s+(?:url\(\s*)?["']?|[f]etch\(\s*["'`]|import\s*\(\s*["'`]|from\s+["'])(https?:\/\/[^"'`)\s;]+)/gi;

/**
 * The addresses a durable visual's file loads from outside the repository
 * (J-147 S3): a script, a stylesheet, an image, a frame or a font it
 * fetches by an http or https address, each once in order; a link the
 * reader follows by hand and an XML namespace are no load.
 * @param text the visual's file
 * @returns the addresses
 */
export function reachesOf(text: string): readonly string[] {
  const found: { at: number; address: string }[] = [];
  for (const pattern of [LOADS, FETCHES])
    for (const match of text.matchAll(pattern))
      if (match[1] !== undefined) found.push({ at: match.index, address: match[1] });
  return [...new Set(found.sort((a, b) => a.at - b.at).map((entry) => entry.address))];
}
