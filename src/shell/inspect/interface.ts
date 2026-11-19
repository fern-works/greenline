import { captureLimitText } from "../../core/interface-check.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../commons/hash.ts";
import { parseJson } from "../../core/contract.ts";
import { designDriftLine } from "../../core/design-drift.ts";
import {
  DESIGN_PICK_FILE,
  parseDesignPick,
  pickedDirection,
  type DesignPick,
} from "../../core/design-pick.ts";
import { keptDealAsk, keptDealAt } from "../deal-view.ts";
import { deal, seedOf, specimenHtml, type DealRequest } from "../../core/interface-catalog.ts";
import { compositeOf, homeComposite, homeEntry } from "../../core/interface-composite.ts";
import { parseInterfaceFact } from "../../core/interface-fact.ts";
import {
  isOnList,
  PLATFORMS,
  REGISTERS,
  type Platform,
  type Register,
} from "../../core/interface-facets.ts";
import { parsePaths, PATHS_FILE } from "../../core/interface-home.ts";
import { INSPECT_SCHEMA } from "../../core/inspector/contract.ts";
import type {
  CatalogDocument,
  DealDocument,
  InterfaceChecksDocument,
  InterfaceRouteView,
  InterfaceDocument,
  NotesReading,
  Unread,
  InterfaceTokenView,
} from "../../core/inspector/documents.ts";
import { recordPath } from "../../core/git-hooks.ts";
import { isChangeId } from "../../core/change.ts";
import { tierOf } from "../../core/visuals.ts";
import { atomicWriteFile } from "../fs/io.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { workingRecord, workspaceManifest } from "../hooks.ts";
import {
  designHomes,
  installedCatalog,
  readInterfaceRulings,
  repositoryFiles,
  workspaceDrift,
} from "../interface.ts";
import { latestInterfaceFact } from "../interface-check.ts";
import { driftFacts, readVisualsHome } from "../visuals.ts";

/**
 * The inspector's interface documents (J-123 S7;
 * `workshop/components/inspector.md`, "The views"): the installed
 * catalog's entries with their specimens for the Atlas's catalog browser,
 * a change's deal with its three composites and the pick, the workspace's
 * addresses with their captures, scores and history, its home's tokens and its
 * own specimen for the Interfaces tab, and a change's interface fact, its
 * latest check by tier and its design section for the change page. Every
 * read here only reads; the pick is the one write, under the writer lock,
 * with the revision check.
 */

/** A file's text, or undefined. */
function textAt(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/** The installed catalog's entries, each with its specimen. */
export function catalogDocument(root: string): Unread<CatalogDocument> {
  const catalog = installedCatalog(root);
  if (catalog.kind === "absent")
    return {
      schema: INSPECT_SCHEMA,
      kind: "catalog",
      catalog: { available: false, reason: catalog.reason, items: [] },
    };
  return {
    schema: INSPECT_SCHEMA,
    kind: "catalog",
    catalog: {
      available: true,
      items: catalog.entries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        register: entry.register,
        platform: entry.platform,
        concerns: entry.facets.concern ?? [],
        components: entry.facets.component ?? [],
        words: entry.words,
        source: "pin" in entry.provenance ? entry.provenance.pin : entry.provenance.site,
        seen: "seen" in entry.provenance ? entry.provenance.seen : null,
        specimen: specimenHtml(entry) ?? null,
      })),
    },
  };
}

/** The pick a change's folder holds, and the revision of its file. */
interface PickStanding {
  readonly pick: DesignPick | null;
  readonly revision: string;
}

/** The pick a change's folder holds, and its revision. */
function pickOf(root: string, id: string): PickStanding {
  const text = textAt(root, `.greenline/ledger/${id}/${DESIGN_PICK_FILE}`);
  return {
    pick: text === undefined ? null : (parseDesignPick(text) ?? null),
    revision: text === undefined ? "none" : sha256Hex(text),
  };
}

/** The register a change deals in: the one asked, the record's, else the one the rulings give every root. */
function registerFor(root: string, id: string, asked: string | null): Register | undefined {
  if (asked !== null) return isOnList(REGISTERS, asked) ? asked : undefined;
  const stated = workingRecord(root, id)?.interface;
  const fact = stated === undefined ? undefined : parseInterfaceFact(stated);
  if (fact?.touches === true && fact.registers.length === 1) return fact.registers[0];
  const ruled = [...new Set(readInterfaceRulings(root).registers.map((entry) => entry.register))];
  return ruled.length === 1 ? ruled[0] : undefined;
}

/** What the deal view asks: the fields `greenline deal` takes, the seed and the reroll. */
export interface DealAsk {
  readonly register: string | null;
  readonly platform: Platform | null;
  readonly job: string | null;
  readonly tone: string | null;
  readonly sector: string | null;
  readonly material: readonly string[] | null;
  readonly seed: number | null;
  readonly reroll: boolean;
}

/**
 * The ask a deal view's address carries.
 * @param query the address's query
 * @returns the ask
 */
export function dealAskOf(query: URLSearchParams): DealAsk {
  const seed = query.get("seed");
  const platform = query.get("platform");
  const material = (query.get("material") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const named = (key: string): string | null => {
    const value = query.get(key);
    return value === null || value === "" ? null : value;
  };
  return {
    register: named("register"),
    platform: platform !== null && isOnList(PLATFORMS, platform) ? platform : null,
    job: named("job"),
    tone: named("tone"),
    sector: named("sector"),
    material: material.length === 0 ? null : material,
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) : null,
    reroll: query.get("reroll") === "1",
  };
}

/** Whether an address's ask names nothing of a deal: no register, platform, job, tone, sector, material, seed or reroll. */
function asksNothing(ask: DealAsk): boolean {
  return (
    ask.register === null &&
    ask.platform === null &&
    ask.job === null &&
    ask.tone === null &&
    ask.sector === null &&
    ask.material === null &&
    ask.seed === null &&
    !ask.reroll
  );
}

/** The deal request an ask gives, as `greenline deal` would make it. */
function requestOf(root: string, register: Register, ask: DealAsk): DealRequest {
  const platform: Platform = ask.platform ?? workspaceManifest(root)?.interface?.platform ?? "web";
  // The fields in the command's order, so an ask with no seed draws under the seed the command draws under.
  const asked = {
    register,
    platform,
    job: ask.job ?? undefined,
    tone: ask.tone ?? undefined,
    sector: ask.sector ?? undefined,
    material: ask.material ?? undefined,
  };
  return { ...asked, seed: ask.seed ?? seedOf(JSON.stringify(asked)), reroll: ask.reroll };
}

/**
 * A change's deal: the three directions with their composites, and the pick.
 * @param root the repository root
 * @param id the change
 * @param ask the register, the job, the seed and the reroll asked
 * @returns the document, or undefined where no record of the change stands
 */
export function dealDocument(
  root: string,
  id: string,
  asked: DealAsk,
): Unread<DealDocument> | undefined {
  if (!isChangeId(id) || !existsSync(join(root, recordPath(id)))) return undefined;
  const { pick, revision } = pickOf(root, id);
  // An address that asks nothing shows the deal the change dealt, else the one its pick was made from, else none (J-149 S4).
  const kept = asksNothing(asked) ? keptDealAsk(root, id) : undefined;
  const ask: DealAsk = !asksNothing(asked)
    ? asked
    : kept !== undefined
      ? dealAskOf(new URLSearchParams(kept))
      : pick !== null
        ? { ...asked, seed: pick.seed, reroll: pick.reroll, job: pick.job }
        : asked;
  const register = registerFor(root, id, ask.register);
  const catalog = installedCatalog(root);
  const base = {
    schema: INSPECT_SCHEMA,
    kind: "deal",
    change: id,
    register: register ?? null,
    job: ask.job,
    catalog: catalog.kind === "installed" ? catalog.pin : null,
    reroll: ask.reroll,
    dealt: !asksNothing(ask) || pick !== null,
    pick,
    revision,
  } as const;
  if (!base.dealt)
    return {
      ...base,
      seed: 0,
      directions: {
        available: false,
        reason: `No deal for this change: none is kept for it, and no direction was picked in the viewer or in words. The catalog's specimens stand in the catalog view.`,
        items: [],
      },
    };
  if (register === undefined)
    return {
      ...base,
      seed: ask.seed ?? 0,
      directions: {
        available: false,
        reason: "Name the register, site or app: the record and the rulings give no one register.",
        items: [],
      },
    };
  const request = requestOf(root, register, ask);
  if (catalog.kind === "absent")
    return {
      ...base,
      seed: request.seed,
      directions: { available: false, reason: catalog.reason, items: [] },
    };
  const directions = deal(catalog.entries, request);
  return {
    ...base,
    seed: request.seed,
    directions: {
      available: true,
      items: directions.map((direction, index) => {
        const composite = compositeOf(direction, register);
        return {
          index: index + 1,
          name: direction.name,
          parts: direction.parts.map((part) => ({
            role: part.role,
            id: part.entry.id,
            kind: part.entry.kind,
            words: part.entry.words,
          })),
          light: composite.light,
          dark: composite.dark,
        };
      }),
    },
  };
}

/** The pick a viewer's button sends. */
const pickRequestSchema = z
  .object({
    direction: z.number().int().min(1).max(3),
    ask: z.string(),
    seed: z.number().int().min(0),
    reroll: z.boolean(),
    revision: z.string().min(1),
  })
  .strict();

/** What a pick's save answers: the pick written, or why not, a stale revision being a conflict. */
export type PickSaved =
  | { readonly kind: "saved"; readonly pick: DesignPick }
  | { readonly kind: "refused"; readonly conflict: boolean; readonly error: string };

/**
 * Write the owner's pick into the change's folder, after checking that the
 * pick file still stands at the revision the page read.
 * @param root the repository root
 * @param id the change
 * @param body the request's body
 * @param now the time it is written at
 * @returns the pick, or why it was refused
 */
export function savePick(
  root: string,
  id: string,
  body: string,
  now: Date = new Date(),
): PickSaved {
  const parsed = pickRequestSchema.safeParse(parseJson(body));
  if (!parsed.success)
    return { kind: "refused", conflict: false, error: "The pick does not read." };
  if (!isChangeId(id) || !existsSync(join(root, recordPath(id))))
    return { kind: "refused", conflict: false, error: "No such change record." };
  const ask: DealAsk = {
    ...dealAskOf(new URLSearchParams(parsed.data.ask)),
    seed: parsed.data.seed,
    reroll: parsed.data.reroll,
  };
  const written = withWorkspaceWrite(root, (): PickSaved => {
    const { revision } = pickOf(root, id);
    if (revision !== parsed.data.revision)
      return {
        kind: "refused",
        conflict: true,
        error: "The pick changed since this page read it; read it again before picking.",
      };
    const dealt = dealDocument(root, id, ask);
    const direction = dealt?.directions.items.find(
      (entry) => entry.index === parsed.data.direction,
    );
    if (dealt === undefined || direction === undefined)
      return { kind: "refused", conflict: false, error: "No such direction in the deal." };
    const pick: DesignPick = {
      generatedBy: "greenline inspect",
      change: id,
      direction: direction.index,
      name: direction.name,
      entries: direction.parts.map((part) => part.id),
      catalog: dealt.catalog ?? "",
      seed: dealt.seed,
      reroll: dealt.reroll,
      job: dealt.job,
      at: now.toISOString(),
    };
    const saved = atomicWriteFile(
      join(root, `.greenline/ledger/${id}/${DESIGN_PICK_FILE}`),
      `${JSON.stringify(pick, null, 2)}\n`,
    );
    return saved._tag === "ok"
      ? { kind: "saved", pick }
      : { kind: "refused", conflict: false, error: saved.error.message };
  });
  return written._tag === "ok"
    ? written.value
    : { kind: "refused", conflict: false, error: written.error.message };
}

/**
 * Record the owner's pick of the deal the change dealt when their words
 * name one direction (J-149 S4; the design step's mechanics page), as the
 * viewer's pick does: into `design-pick.json`, with the owner's words
 * quoted, where no pick of that deal stands yet, the words answering the
 * turn that dealt it. Words that name no direction, a change that dealt
 * none, and words a later turn gave write nothing. Written under the
 * writer lock the viewer's pick takes.
 * @param root the repository root
 * @param id the change the branch holds
 * @param words the owner's words at the turn's start
 * @param answering when the turn the words answer started, undefined where no turn was noted
 * @param now the time it is written at
 * @returns the pick written, or undefined
 */
export function pickFromWords(
  root: string,
  id: string,
  words: string,
  answering: number | undefined,
  now: Date = new Date(),
): DesignPick | undefined {
  const kept = keptDealAsk(root, id);
  const keptAt = keptDealAt(root, id);
  // Only the reply that dealt is answered: a deal kept from an earlier turn is no longer the question.
  if (kept === undefined || keptAt === undefined || answering === undefined) return undefined;
  if (keptAt < answering - 2000) return undefined;
  const dealt = dealDocument(root, id, dealAskOf(new URLSearchParams(kept)));
  if (dealt === undefined || !dealt.directions.available) return undefined;
  const standing = dealt.pick;
  if (standing !== null && standing.seed === dealt.seed && standing.reroll === dealt.reroll)
    return undefined;
  const picked = pickedDirection(
    words,
    dealt.directions.items.map((direction) => direction.name),
  );
  const direction = dealt.directions.items.find((entry) => entry.index === picked);
  if (direction === undefined) return undefined;
  const pick: DesignPick = {
    generatedBy: "greenline event",
    words: words.replaceAll('"', "'").replaceAll(/\s+/g, " ").trim().slice(0, 300),
    change: id,
    direction: direction.index,
    name: direction.name,
    entries: direction.parts.map((part) => part.id),
    catalog: dealt.catalog ?? "",
    seed: dealt.seed,
    reroll: dealt.reroll,
    job: dealt.job,
    at: now.toISOString(),
  };
  const written = withWorkspaceWrite(root, () => {
    // A pick the viewer wrote since this deal was read stands.
    if (pickOf(root, id).revision !== dealt.revision) return false;
    const saved = atomicWriteFile(
      join(root, `.greenline/ledger/${id}/${DESIGN_PICK_FILE}`),
      `${JSON.stringify(pick, null, 2)}\n`,
    );
    return saved._tag === "ok";
  });
  return written._tag === "ok" && written.value ? pick : undefined;
}

/** One capture visual of a address. */
interface RouteCapture {
  readonly id: string;
  readonly made: string;
  readonly commit: string;
  readonly files: readonly string[];
  readonly scores: { readonly floor: number; readonly reflex: number; readonly finish: number };
}

/** The capture visuals of each address, oldest first. */
function capturesOf(root: string): ReadonlyMap<string, readonly RouteCapture[]> {
  const byRoute = new Map<string, RouteCapture[]>();
  for (const entry of readVisualsHome(root)) {
    if (entry.manifest._tag === "err") continue;
    const capture = entry.manifest.value.capture;
    if (entry.manifest.value.form !== "capture" || capture === undefined) continue;
    const list = byRoute.get(capture.address) ?? [];
    list.push({
      id: entry.id,
      made: entry.manifest.value.made,
      commit: entry.manifest.value.commit,
      files: entry.manifest.value.files,
      scores: { ...capture.scores },
    });
    byRoute.set(capture.address, list);
  }
  for (const list of byRoute.values())
    list.sort((a, b) => (a.made < b.made ? -1 : a.made > b.made ? 1 : 0));
  return byRoute;
}

/**
 * The workspace's interface (J-154 S3): its pages, the owner's notes on the
 * captures, its home's tokens and specimen, its drift.
 * @param root the repository root
 * @param notes the notes on the captures, with their revision
 * @returns the document
 */
export function interfaceDocument(root: string, notes: NotesReading): Unread<InterfaceDocument> {
  const setting = workspaceManifest(root)?.interface;
  const rulings = readInterfaceRulings(root);
  const registers = [...new Set(rulings.registers.map((entry) => entry.register))];
  const files = repositoryFiles(root);
  const homes = designHomes(root, files);
  const home = homes.find((entry) => entry.directory === ".") ?? homes[0];
  const design = home?.ok === true ? home.document : undefined;
  const notices: string[] = [];
  if (home !== undefined && !home.ok) notices.push(`DESIGN.md does not read: ${home.reason}`);
  if (setting !== undefined && homes.length === 0)
    notices.push("No DESIGN.md: the home is offered; the survey writes it with the owner.");
  const tokens: InterfaceTokenView[] =
    design === undefined
      ? []
      : [
          ...design.tokens.colors.map((token) => ({
            group: "colors",
            name: token.name,
            value: token.value,
          })),
          ...design.tokens.typography.map((token) => ({
            group: "typography",
            name: token.name,
            value: token.fields.map((field) => `${field.name} ${field.value}`).join(", "),
          })),
          ...design.tokens.rounded.map((token) => ({
            group: "rounded",
            name: token.name,
            value: token.value,
          })),
          ...design.tokens.spacing.map((token) => ({
            group: "spacing",
            name: token.name,
            value: token.value,
          })),
        ];
  const drift =
    setting !== undefined && homes.some((entry) => entry.ok)
      ? (designDriftLine(workspaceDrift(root, setting, files, homes)) ?? null)
      : null;
  const captures = capturesOf(root);
  const pathsText = textAt(root, PATHS_FILE);
  const index = pathsText === undefined ? undefined : parsePaths(pathsText);
  if (index?._tag === "err")
    notices.push(
      `${PATHS_FILE} does not read: ${index.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  const addresses: InterfaceRouteView[] = (index?._tag === "ok" ? index.value.paths : []).map(
    (entry) => {
      const history = captures.get(entry.address) ?? [];
      const last = history.at(-1);
      const tier =
        last === undefined ? null : tierOf(driftFacts(root, last.commit, last.files)).tier;
      if (tier === "stale" || tier === "drifting")
        notices.push(
          `The capture of ${entry.address} is ${tier}: a covered file changed since it was taken.`,
        );
      return {
        address: entry.address,
        register: entry.register ?? null,
        capture:
          entry.capture === undefined
            ? null
            : {
                visual: entry.capture.visual,
                widths: entry.capture.widths,
                commit: entry.capture.commit,
                at: entry.capture.at,
              },
        scores: entry.scores ?? null,
        fidelity: entry.fidelity ?? null,
        history: history.map((capture) => ({
          visual: capture.id,
          made: capture.made,
          ...capture.scores,
        })),
        tier,
        limit:
          entry.limit === undefined
            ? null
            : {
                cause: entry.limit.cause,
                origin: entry.limit.origin,
                at: entry.limit.at,
                words: captureLimitText(entry.limit),
              },
      };
    },
  );
  const page =
    design === undefined
      ? null
      : homeComposite(
          design,
          registers.length === 1 && registers[0] !== undefined ? registers[0] : "site",
        );
  return {
    schema: INSPECT_SCHEMA,
    kind: "interface",
    pages:
      setting === undefined
        ? {
            available: false,
            reason:
              "The manifest names no interface roots, so the workspace has no interface here.",
            items: [],
          }
        : { available: true, items: addresses },
    facets:
      setting === undefined
        ? null
        : { platform: setting.platform, frameworks: setting.frameworks, registers },
    tokens,
    drift,
    specimen: design === undefined ? null : (specimenHtml(homeEntry(design)) ?? null),
    page,
    notices,
    notes,
  };
}

/**
 * A change's interface for its page: the fact, the latest check, the design section and the pick.
 * @param root the repository root
 * @param id the change
 * @returns the document, or undefined where no record of the change stands
 */
export function interfaceChecksDocument(
  root: string,
  id: string,
): Unread<InterfaceChecksDocument> | undefined {
  if (!isChangeId(id)) return undefined;
  const record = workingRecord(root, id);
  if (record === undefined) return undefined;
  const fact = record.interface === undefined ? undefined : parseInterfaceFact(record.interface);
  return {
    schema: INSPECT_SCHEMA,
    kind: "interface-checks",
    change: id,
    touches: fact?.touches === true,
    fact: latestInterfaceFact(root, id) ?? null,
    design: record.design ?? null,
    pick: pickOf(root, id).pick,
  };
}
