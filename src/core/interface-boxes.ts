import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";

/**
 * A capture's boxes (J-124 S1; design's marks page): beside each capture's
 * page in the visual home stands `<slug>.boxes.json`, which names every
 * element the page rendered at each captured width, its rectangle in the
 * page's own coordinates, its role, its visible text, a selector that finds
 * it again, and the source location the framework's development build
 * carries, where it carries one. A mark names an element by these facts, so
 * the agent finds the element in the code and in the next capture.
 */

/** The suffix of a capture's boxes file, beside the capture of the same slug. */
export const BOXES_SUFFIX = ".boxes.json";

/** A rectangle in the page's coordinates, its origin the page's top left, in CSS pixels. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where a development build says an element was written. */
export interface SourceHint {
  /** The file as the build names it; a path from the repository root where it could be made one. */
  readonly file: string;
  readonly line: number | null;
  readonly column: number | null;
  /** The hint read: React's debug source, react-dev-inspector's, Vue's, or Svelte's. */
  readonly via: "react" | "react-inspector" | "vue" | "svelte";
}

/** One element the page rendered at one width. */
export interface BoxedElement {
  readonly selector: string;
  readonly tag: string;
  /** Its role, the one it states or the one its tag gives; null where neither gives one. */
  readonly role: string | null;
  /** Its visible text or its accessible name, collapsed and cut at 120 characters. */
  readonly text: string;
  readonly box: Box;
  readonly source: SourceHint | null;
}

/** One captured width: the page's size, the full-page image's height and the elements. */
export interface WidthBoxes {
  readonly width: number;
  /** The viewport's height at this width. */
  readonly height: number;
  readonly page: { readonly width: number; readonly height: number };
  /** The full-page image's height: the page down to three screens. */
  readonly image: { readonly height: number };
  readonly elements: readonly BoxedElement[];
  /** Whether the page held more elements than the reader records, 4,000. */
  readonly truncated: boolean;
}

/** A capture's boxes file. */
export interface CaptureBoxes {
  readonly generatedBy: string;
  readonly address: string;
  readonly commit: string;
  readonly at: string;
  readonly widths: readonly WidthBoxes[];
}

const boxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
  })
  .strict();

const sourceSchema = z
  .object({
    file: z.string().min(1),
    line: z.number().int().nullable(),
    column: z.number().int().nullable(),
    via: z.enum(["react", "react-inspector", "vue", "svelte"]),
  })
  .strict();

/** One element's schema, which the inspector's contract serves too. */
export const boxedElementSchema: z.ZodType<BoxedElement> = z
  .object({
    selector: z.string().min(1),
    tag: z.string().min(1),
    role: z.string().nullable(),
    text: z.string(),
    box: boxSchema,
    source: sourceSchema.nullable(),
  })
  .strict();

/** What the page's reader returns at one width, before the shell adds the width and the image. */
export interface PageBoxes {
  readonly page: { readonly width: number; readonly height: number };
  readonly elements: readonly BoxedElement[];
  readonly truncated: boolean;
}

/** The page's reader's answer's schema. */
export const pageBoxesSchema: z.ZodType<PageBoxes> = z
  .object({
    page: z.object({ width: z.number(), height: z.number() }).strict(),
    elements: z.array(boxedElementSchema),
    truncated: z.boolean(),
  })
  .strict();

const widthSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    page: z.object({ width: z.number(), height: z.number() }).strict(),
    image: z.object({ height: z.number().min(0) }).strict(),
    elements: z.array(boxedElementSchema),
    truncated: z.boolean(),
  })
  .strict();

/** The boxes file's schema, which the inspector's contract serves too. */
const captureBoxesSchema: z.ZodType<CaptureBoxes> = z
  .object({
    generatedBy: z.string().min(1),
    address: z.string().regex(/^\//, "an address starts with '/'"),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/, "a commit's hash"),
    at: z.string().min(1),
    widths: z.array(widthSchema),
  })
  .strict();

/**
 * Parse a boxes file.
 * @param text the file's text
 * @param source where it was read, for the refusal
 * @returns the boxes, or every field they get wrong
 */
export function parseCaptureBoxes(
  text: string,
  source: string,
): Result<CaptureBoxes, ContractParseFailed> {
  const json = parseJson(text);
  if (json === undefined) return contractFailure(source, [{ path: "", message: "not JSON" }]);
  const parsed = captureBoxesSchema.safeParse(json);
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(source, issuesFrom(parsed.error.issues));
}

/**
 * A source file as a path from the repository root, or undefined where it
 * names no file inside it: an absolute path under the root, a bundler's
 * `webpack:///./` or `file://` prefix, a leading `./` or `/@fs/`.
 * @param file the file as the build named it
 * @param root the repository root, absolute and `/`-separated
 * @returns the path from the root, or undefined
 */
export function repositoryPathOf(file: string, root: string): string | undefined {
  let path = file
    .replace(/^webpack:\/\/[^/]*\//, "")
    .replace(/^file:\/\//, "")
    .replace(/^\/@fs\//, "/")
    .replace(/[?#].*$/, "");
  const base = root.replace(/\/+$/, "");
  if (path.startsWith(`${base}/`)) path = path.slice(base.length + 1);
  else if (path.startsWith("/")) return undefined;
  path = path.replace(/^(?:\.\/)+/, "");
  if (path === "" || path.split("/").some((part) => part === ".." || part === "")) return undefined;
  return path;
}
