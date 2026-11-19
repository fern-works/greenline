import { z } from "zod";
import { parseJson } from "./contract.ts";

/*
 * The inspector's address file (J-142 S1; `docs/SPEC.md` §4, "The
 * inspector's address"): `greenline inspect` writes it once it serves and
 * removes it when it stops, so the mirror, `greenline status` and `greenline
 * view` read where the viewer is instead of composing an address. It is a
 * working file under `.greenline/tmp/`, which git ignores; a file whose
 * process is gone reads as not serving.
 */

/** The address file's path from the repository root. */
export const INSPECT_ADDRESS_FILE = ".greenline/tmp/inspect.json";

/** What the address file holds. */
export interface InspectAddress {
  readonly generatedBy: "greenline inspect";
  /** The base address the viewer answers at, always local: `http://127.0.0.1:<port>/`. */
  readonly address: string;
  readonly port: number;
  /** When it started serving. */
  readonly started: string;
  /** The process serving it, which the reader checks is still running. */
  readonly pid: number;
}

const BASE = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/$/;

const addressSchema: z.ZodType<InspectAddress> = z
  .object({
    generatedBy: z.literal("greenline inspect"),
    address: z.string().regex(BASE, "a local base address, http://127.0.0.1:<port>/"),
    port: z.number().int().min(1).max(65535),
    started: z.iso.datetime(),
    pid: z.number().int().min(1),
  })
  .strict()
  .refine((file) => BASE.exec(file.address)?.[1] === String(file.port), {
    message: "the address names the port the file states",
  });

/**
 * Read an address file's text.
 * @param text the file's text
 * @returns the address, or undefined where it does not read
 */
export function parseInspectAddress(text: string): InspectAddress | undefined {
  const parsed = addressSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The address file's text for a viewer serving at a port.
 * @param port the port it listens on
 * @param pid the process serving it
 * @param started when it started serving
 * @returns the file's text, its `generatedBy` key first
 */
export function inspectAddressText(port: number, pid: number, started: string): string {
  const file: InspectAddress = {
    generatedBy: "greenline inspect",
    address: `http://127.0.0.1:${String(port)}/`,
    port,
    started,
    pid,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * A page's full address on a serving viewer: its base without the last
 * slash, then the page's path.
 * @param base the base address, ending in `/`
 * @param path the page's path, starting with `/`
 * @returns the address
 */
export function pageAddress(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}
