import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { dealAskQuery } from "../core/deal-ask.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { pathOf } from "./inspect/app/addresses.ts";

/*
 * The deal a change last dealt, kept for its address (J-142 S1): `greenline
 * deal` writes the deal view's ask to the change's working folder,
 * `.greenline/tmp/<id>/deal.json`, and `greenline view deal` and the view
 * line read it back, so the address shows the three directions the command
 * dealt rather than a deal of their own. A working file, which tidy removes
 * with the folder.
 */

/** The file's name in the change's working folder. */
const DEAL_FILE = "deal.json";

const DEAL_RECORD = z
  .object({ generatedBy: z.literal("greenline deal"), ask: z.string() })
  .strict();

/**
 * Keep the ask of the deal a change dealt.
 * @param root the repository root
 * @param change the change's id
 * @param view the deal view's path the command printed, its ask in the query
 */
export function recordDeal(root: string, change: string, view: string): void {
  const ask = dealAskQuery(view.includes("?") ? view.slice(view.indexOf("?")) : "");
  atomicWriteFile(
    join(root, ".greenline", "tmp", change, DEAL_FILE),
    `${JSON.stringify({ generatedBy: "greenline deal", ask }, null, 2)}\n`,
  );
}

/**
 * The ask of the deal a change last dealt, kept by `greenline deal`.
 * @param root the repository root
 * @param change the change's id
 * @returns the ask's query, or undefined where the change dealt none
 */
export function keptDealAsk(root: string, change: string): string | undefined {
  try {
    const read = DEAL_RECORD.safeParse(
      parseJson(readFileSync(join(root, ".greenline", "tmp", change, DEAL_FILE), "utf8")),
    );
    return read.success ? dealAskQuery(read.data.ask) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * When `greenline deal` kept the change's last deal (J-149 S4), which the
 * pick from the owner's words reads to answer only the turn that dealt.
 * @param root the repository root
 * @param change the change's id
 * @returns the time in milliseconds, or undefined where none is kept
 */
export function keptDealAt(root: string, change: string): number | undefined {
  try {
    return statSync(join(root, ".greenline", "tmp", change, DEAL_FILE)).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * The deal view's path for a change, or one of its directions, with the ask
 * of the deal it last dealt; with none kept, the view's address carries no
 * ask, and the page shows the deal the pick was made from or none.
 * @param root the repository root
 * @param change the change's id
 * @param direction a direction's name, its specimen in the deal
 * @returns the path, its ask in the query
 */
export function dealPath(root: string, change: string, direction?: string): string {
  let ask = "";
  try {
    const read = DEAL_RECORD.safeParse(
      parseJson(readFileSync(join(root, ".greenline", "tmp", change, DEAL_FILE), "utf8")),
    );
    if (read.success) ask = dealAskQuery(read.data.ask);
  } catch {
    ask = "";
  }
  const path = pathOf(
    direction === undefined
      ? { page: "change", id: change, part: "deal" }
      : { page: "change", id: change, part: "deal", anchor: direction },
  );
  return ask === "" ? path : `${path}?${ask}`;
}
