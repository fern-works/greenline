import { z } from "zod";
import type { Result } from "../commons/result.ts";
import { parseColour, withinChannels, type Rgb } from "./colour.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import type { DesignDocument } from "./design-file.ts";
import type { PathEntry, PathFidelity, PathIndex } from "./interface-home.ts";
import type { Inventory } from "./interface-render.ts";

/**
 * A redesign's kept list and a capture's fidelity (J-123 S5; the redesign
 * start's page and design's capture page): the kept list,
 * `.greenline/ledger/<id>/kept.json`, holds per address what the before's
 * page carries, its links, fields, form actions, handlers, test hooks, ids
 * and headings, each loss the owner means recorded with its reason; the
 * after is read the same way and an entry it lacks fails the kept check.
 * The fidelity read measures a capture's sampled colours against the home's
 * palette for the path index.
 */

/** The kept list's file in a change's folder. */
export const KEPT_FILE = "kept.json";

/** The kinds of entry a address keeps, in the order the list holds them. */
const KEPT_KINDS = [
  "links",
  "fields",
  "actions",
  "handlers",
  "testHooks",
  "ids",
  "headings",
] as const;
/** A kind of kept entry. */
export type KeptKind = (typeof KEPT_KINDS)[number];

/** A loss the owner means: the entry, its kind and why it goes. */
export interface KeptLoss {
  readonly kind: KeptKind;
  readonly entry: string;
  readonly reason: string;
}

/** One address's kept entries and its recorded losses. */
export interface KeptRoute extends Inventory {
  readonly address: string;
  readonly losses: readonly KeptLoss[];
}

/** The kept list. */
export interface KeptList {
  readonly generatedBy: string;
  readonly addresses: readonly KeptRoute[];
}

const entries = z.array(z.string());

/** The kept list's schema. */
const keptSchema: z.ZodType<KeptList> = z
  .object({
    generatedBy: z.string().min(1),
    addresses: z.array(
      z
        .object({
          address: z.string().regex(/^\//, "a address starts with '/'"),
          links: entries,
          fields: entries,
          actions: entries,
          handlers: entries,
          testHooks: entries,
          ids: entries,
          headings: entries,
          losses: z.array(
            z
              .object({
                kind: z.enum(KEPT_KINDS),
                entry: z.string().min(1),
                reason: z.string().min(1),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Parse a kept list.
 * @param text the file's text
 * @param source its path
 * @returns the list, or the issues that refused it
 */
export function parseKept(text: string, source: string): Result<KeptList, ContractParseFailed> {
  const parsed = keptSchema.safeParse(parseJson(text));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/**
 * The union of inventories read at several widths, each entry once, in the
 * order first read.
 * @param inventories the inventories
 * @returns one inventory
 */
export function unionInventory(inventories: readonly Inventory[]): Inventory {
  const merged = (kind: KeptKind): readonly string[] => [
    ...new Set(inventories.flatMap((inventory) => inventory[kind])),
  ];
  return {
    links: merged("links"),
    fields: merged("fields"),
    actions: merged("actions"),
    handlers: merged("handlers"),
    testHooks: merged("testHooks"),
    ids: merged("ids"),
    headings: merged("headings"),
  };
}

/**
 * The list with a address's before written, a address it holds left as it is.
 * @param list the list as it stands, or undefined where none does
 * @param address the address
 * @param inventory what the before's page holds
 * @param generatedBy the command that writes it
 * @returns the list
 */
export function withKeptRoute(
  list: KeptList | undefined,
  address: string,
  inventory: Inventory,
  generatedBy: string,
): KeptList {
  const addresses = list?.addresses ?? [];
  if (addresses.some((entry) => entry.address === address))
    return list ?? { generatedBy, addresses };
  return {
    generatedBy: list?.generatedBy ?? generatedBy,
    addresses: [...addresses, { address, ...inventory, losses: [] }],
  };
}

/** One kept entry the after lacks. */
export interface KeptMissing {
  readonly kind: KeptKind;
  readonly entry: string;
}

/**
 * The kept check: each entry the address keeps that the after's page lacks
 * and no recorded loss names.
 * @param kept the address's kept entries
 * @param after what the after's page holds
 * @returns the missing entries
 */
export function keptMissing(kept: KeptRoute, after: Inventory): readonly KeptMissing[] {
  return KEPT_KINDS.flatMap((kind) => {
    const now = new Set(after[kind]);
    const lost = new Set(
      kept.losses.filter((loss) => loss.kind === kind).map((loss) => loss.entry),
    );
    return kept[kind]
      .filter((entry) => !now.has(entry) && !lost.has(entry))
      .map((entry) => ({ kind, entry }));
  });
}

/** Two sampled colours within this many units per channel are one, the samples being rounded to eights. */
const SAMPLE_TOLERANCE = 12;
/** A colour off the palette is named when it holds at least this share of the samples. */
const NAMED_SHARE = 0.01;

/**
 * The fidelity read: the share of a capture's sampled pixels whose colour
 * the home's palette names, and the colours seen most that it does not.
 * @param design the home that governs the address
 * @param samples each sampled colour as hex with its count
 * @returns the read, or undefined where the home names no colour or nothing was sampled
 */
export function fidelityOf(
  design: DesignDocument | undefined,
  samples: ReadonlyMap<string, number>,
): PathFidelity | undefined {
  const palette = (design?.tokens.colors ?? []).flatMap((token): Rgb[] => {
    const colour = parseColour(token.value);
    return colour === undefined ? [] : [colour];
  });
  const total = [...samples.values()].reduce((sum, count) => sum + count, 0);
  if (palette.length === 0 || total === 0) return undefined;
  let inside = 0;
  const outside = new Map<string, number>();
  for (const [hex, count] of samples) {
    const colour = parseColour(hex);
    if (
      colour !== undefined &&
      palette.some((entry) => withinChannels(entry, colour, SAMPLE_TOLERANCE))
    )
      inside += count;
    else outside.set(hex, count);
  }
  const offPalette = [...outside.entries()]
    .filter(([, count]) => count / total >= NAMED_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([hex]) => hex);
  return { inPalette: Math.round((inside / total) * 1000) / 1000, offPalette };
}

/**
 * The path index with one address's entry written, the others kept in order.
 * @param index the index as it stands, or undefined where none does
 * @param entry the address's entry
 * @param generatedBy the command that writes it
 * @returns the index
 */
export function withPathEntry(
  index: PathIndex | undefined,
  entry: PathEntry,
  generatedBy: string,
): PathIndex {
  const paths = index?.paths ?? [];
  const at = paths.findIndex((path) => path.address === entry.address);
  // A read that wrote no capture keeps the last one the address had, so its history stays.
  const last = at === -1 ? undefined : paths[at]?.capture;
  const kept: PathEntry =
    entry.capture === undefined && last !== undefined ? { ...entry, capture: last } : entry;
  return {
    generatedBy: index?.generatedBy ?? generatedBy,
    paths: at === -1 ? [...paths, kept] : paths.map((path, place) => (place === at ? kept : path)),
  };
}
