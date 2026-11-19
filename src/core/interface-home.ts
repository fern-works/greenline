import { captureLimitSchema, type CaptureLimit } from "./interface-check.ts";
import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";
import { REGISTERS, type Register } from "./interface-facets.ts";

/**
 * The interface ledger home, `.greenline/ledger/interface/` (J-123 S1; the
 * generated-files list of `src/core/inspector/contract.ts`): the workspace's
 * own interface record beside the changes. `survey.json` is the survey's
 * sheet, one source per row: measured by a command at a commit, read by the
 * agent from a file, or confirmed by the owner. `paths.json` is the path
 * index: per address of the interface its register, its last capture and
 * its last scores. Each JSON file opens with its `generatedBy` key. Both
 * schemas are served to the viewer by the inspector's contract.
 */

/** The home, from the repository root. */
const INTERFACE_HOME = ".greenline/ledger/interface";
/** The survey sheet's path. */
export const SURVEY_FILE: string = `${INTERFACE_HOME}/survey.json`;
/** The path index's path. */
export const PATHS_FILE: string = `${INTERFACE_HOME}/paths.json`;

const COMMIT = z.string().regex(/^[0-9a-f]{7,40}$/, "a commit's hash, 7 to 40 hex characters");
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "a date, or a date and time");

/** Where a sheet row's value came from. */
export type SurveySource =
  | { readonly kind: "measured"; readonly command: string; readonly commit: string }
  | { readonly kind: "read"; readonly from: string }
  | { readonly kind: "confirmed"; readonly date: string };

/** One row of the survey sheet: a fact of the interface, its value and its one source. */
export interface SurveyRow {
  readonly fact: string;
  readonly value: string;
  readonly source: SurveySource;
}

/** The survey sheet. */
export interface SurveySheet {
  readonly generatedBy: string;
  readonly rows: readonly SurveyRow[];
}

/** The survey sheet's schema, which the inspector's contract serves. */
const surveySchema: z.ZodType<SurveySheet> = z
  .object({
    generatedBy: z.string().min(1),
    rows: z.array(
      z
        .object({
          fact: z.string().min(1),
          value: z.string().min(1),
          source: z.discriminatedUnion("kind", [
            z
              .object({ kind: z.literal("measured"), command: z.string().min(1), commit: COMMIT })
              .strict(),
            z.object({ kind: z.literal("read"), from: z.string().min(1) }).strict(),
            z.object({ kind: z.literal("confirmed"), date: DATE }).strict(),
          ]),
        })
        .strict(),
    ),
  })
  .strict();

/** The scores of a check at a path: the findings red by tier, and the floor's word on what was measured. */
export interface PathScores {
  readonly floor: number;
  readonly reflex: number;
  readonly finish: number;
}

/** A path's last capture: the visual it is, the widths taken and the commit. */
export interface PathCapture {
  /** The capture's place in the visual home, `<change-id>/<slug>` or `interface/<slug>`. */
  readonly visual: string;
  readonly widths: readonly number[];
  readonly commit: string;
  readonly at: string;
}

/** The fidelity read: the capture's colours measured against the home's palette. */
export interface PathFidelity {
  /** The share of the capture's sampled pixels whose colour the palette names, 0 to 1. */
  readonly inPalette: number;
  /** The colours seen most that the palette does not name, as hex. */
  readonly offPalette: readonly string[];
}

/** One address of the interface in the index. */
export interface PathEntry {
  readonly address: string;
  readonly register?: Register | undefined;
  readonly capture?: PathCapture | undefined;
  readonly scores?: PathScores | undefined;
  readonly fidelity?: PathFidelity | undefined;
  /** The limit the latest capture of the address met, where it made none; a capture clears it (J-191 S1). */
  readonly limit?: CaptureLimit | undefined;
}

/** The path index. */
export interface PathIndex {
  readonly generatedBy: string;
  readonly paths: readonly PathEntry[];
}

const scoresSchema = z
  .object({
    floor: z.number().int().min(0),
    reflex: z.number().int().min(0),
    finish: z.number().int().min(0),
  })
  .strict();

/** The path index's schema, which the inspector's contract serves. */
const pathsSchema: z.ZodType<PathIndex> = z
  .object({
    generatedBy: z.string().min(1),
    paths: z.array(
      z
        .object({
          address: z.string().regex(/^\//, "an address starts with '/'"),
          register: z.enum(REGISTERS).optional(),
          capture: z
            .object({
              visual: z.string().min(1),
              widths: z.array(z.number().int().positive()),
              commit: COMMIT,
              at: DATE,
            })
            .strict()
            .optional(),
          scores: scoresSchema.optional(),
          fidelity: z
            .object({
              inPalette: z.number().min(0).max(1),
              offPalette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)),
            })
            .strict()
            .optional(),
          limit: captureLimitSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Parse the survey sheet.
 * @param text the file's text
 * @returns the sheet, or the issues that refused it
 */
export function parseSurvey(text: string): Result<SurveySheet, ContractParseFailed> {
  const parsed = surveySchema.safeParse(parseJson(text));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(SURVEY_FILE, issuesFrom(parsed.error.issues));
}

/**
 * Parse the path index.
 * @param text the file's text
 * @returns the index, or the issues that refused it
 */
export function parsePaths(text: string): Result<PathIndex, ContractParseFailed> {
  const parsed = pathsSchema.safeParse(parseJson(text));
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(PATHS_FILE, issuesFrom(parsed.error.issues));
}

/**
 * A home file's text: its JSON, two spaces, `generatedBy` the first key as
 * the convention for generated files asks.
 * @param document the sheet or the index
 * @returns the text, ending with a newline
 */
export function serializeHomeFile(document: SurveySheet | PathIndex): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * The sheet with the measured rows of one command replaced and every row of
 * another source kept, so a measure run again never drops what the agent
 * read or the owner confirmed.
 * @param sheet the sheet as it stands, or undefined where none does
 * @param generatedBy the command that writes it
 * @param measured the rows the command measured
 * @returns the new sheet
 */
export function withMeasuredRows(
  sheet: SurveySheet | undefined,
  generatedBy: string,
  measured: readonly SurveyRow[],
): SurveySheet {
  const facts = new Set(measured.map((row) => row.fact));
  const kept = (sheet?.rows ?? []).filter(
    (row) => row.source.kind !== "measured" || !facts.has(row.fact),
  );
  return { generatedBy, rows: [...measured, ...kept] };
}
