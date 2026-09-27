import type { GuidanceRequest, ReceiptUnit, RequestBinding } from "./guidance-receipts.ts";
import { splitManagedBlock } from "./managed-block.ts";
import { HEADING } from "./markdown.ts";
import { POLICY_BLOCK_KEY } from "./render.ts";

/**
 * The inspector's views (ADR 0028): pure builders over what the CLI
 * already holds, so the page served on localhost shows the same
 * truth sync and doctor act on. Nothing here reads a file or decides
 * anything; the shell feeds these and serves what they return.
 */

const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["js", "typescript"],
  ["jsx", "typescript"],
  ["mjs", "typescript"],
  ["cjs", "typescript"],
  ["go", "go"],
  ["rs", "rust"],
  ["java", "java"],
  ["py", "python"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["cs", "c#"],
  ["cpp", "c++"],
  ["cc", "c++"],
  ["cxx", "c++"],
  ["hpp", "c++"],
  ["c", "c"],
  ["rb", "ruby"],
  ["php", "php"],
  ["swift", "swift"],
  ["ex", "elixir"],
  ["exs", "elixir"],
]);

/** The roster language a path's extension speaks, or `all` for anything else. */
export function languageOfPath(path: string): string | "all" {
  const dot = path.lastIndexOf(".");
  const extension = dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
  return EXTENSIONS.get(extension) ?? "all";
}

/** One line of a diff: kept, removed, or added. */
export interface DiffLine {
  readonly kind: "same" | "del" | "add";
  readonly line: string;
}

/** Past this many cells the diff is stated whole rather than computed. */
const DIFF_CELLS = 4_000_000;

/**
 * A line diff by the longest common subsequence, removals before
 * additions inside each changed run. Two texts too large to compare
 * are stated as one removal and one addition, never guessed.
 */
export function lineDiff(before: string, after: string): readonly DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a[a.length - 1] === "") a.pop();
  if (b[b.length - 1] === "") b.pop();
  if (a.length * b.length > DIFF_CELLS) {
    return [
      ...a.map((line): DiffLine => ({ kind: "del", line })),
      ...b.map((line): DiffLine => ({ kind: "add", line })),
    ];
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = table[i] ?? [];
      const next = table[i + 1] ?? [];
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = (): void => {
    out.push(...dels, ...adds);
    dels = [];
    adds = [];
  };
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      flush();
      out.push({ kind: "same", line: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      dels.push({ kind: "del", line: a[i] ?? "" });
      i += 1;
    } else {
      adds.push({ kind: "add", line: b[j] ?? "" });
      j += 1;
    }
  }
  while (i < a.length) dels.push({ kind: "del", line: a[i++] ?? "" });
  while (j < b.length) adds.push({ kind: "add", line: b[j++] ?? "" });
  flush();
  return out;
}

const STANZA = "## House rulings";

/**
 * AGENTS.md with its House rulings stanza replaced by `body` (the dash
 * lines), in the user region only: the managed block is carried byte
 * for byte, and a file without the stanza gains it above the block.
 */
export function withStanza(agentsMd: string, body: string): string {
  const split = splitManagedBlock(agentsMd, POLICY_BLOCK_KEY);
  const stanza = `${STANZA}\n\n${body.trim()}\n\n`;
  const replaced =
    replaceStanza(split.head, stanza, "head") ?? replaceStanza(split.tail, stanza, "tail");
  if (split.block === undefined) {
    return replaced === undefined ? `${withTrailingBlank(agentsMd)}${stanza}` : replaced.text;
  }
  const head = replaced?.where === "head" ? replaced.text : split.head;
  const tail = replaced?.where === "tail" ? replaced.text : split.tail;
  const headWithStanza = replaced === undefined ? `${withTrailingBlank(head)}${stanza}` : head;
  const marker = agentsMd.slice(split.head.length, agentsMd.length - split.tail.length);
  return `${headWithStanza}${marker}${tail}`;
}

function withTrailingBlank(text: string): string {
  if (text === "") return "";
  return text.endsWith("\n\n") ? text : text.endsWith("\n") ? `${text}\n` : `${text}\n\n`;
}

/** The region with its stanza swapped, or undefined when it carries none. */
function replaceStanza(
  region: string,
  stanza: string,
  where: "head" | "tail",
): { readonly text: string; readonly where: "head" | "tail" } | undefined {
  const lines = region.split("\n");
  const start = lines.findIndex((line) => line.trim() === STANZA);
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < lines.length && !HEADING.test(lines[end] ?? "")) end += 1;
  const before = lines.slice(0, start).join("\n");
  const after = lines.slice(end).join("\n");
  const text = `${before === "" ? "" : `${before}\n`}${stanza}${after}`;
  return { text, where };
}

/** One call of a request as the inspector shows it: what was asked and what came back, body-free. */
export interface ReceiptCallView {
  readonly sequence: number;
  readonly operation: string;
  /** `pending` while the call runs; `received`, `partial` or `failed` once it ended. */
  readonly outcome: string;
  /** The units delivered whole, each with its revision. */
  readonly full: readonly { readonly id: string; readonly revision: string }[];
  /** The units listed by their metadata alone. */
  readonly metadata: readonly string[];
  /** A failed call's kind, as the bridge recorded it; never a body. */
  readonly error: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/** One schema-4 request collection as the inspector shows it. */
export interface ReceiptRequestView {
  readonly id: string;
  /** Who answered the calls: the garden connector. */
  readonly source: string;
  /** What the calls read, nothing yet, one publication or a comparison pair, and where. */
  readonly binding: string;
  readonly owner: string;
  readonly createdAt: string;
  readonly calls: readonly ReceiptCallView[];
  /** Read-only consultations another contributor dispatched under this request. */
  readonly advisories: number;
}

/** The binding in words: the publication or the pair, and the origin it was read from. */
function bindingText(binding: RequestBinding): string {
  switch (binding.state) {
    case "unresolved":
      return `unresolved, at ${binding.origin}`;
    case "publication":
      return `publication ${binding.snapshot.id} (published ${binding.snapshot.publishedAt}), at ${binding.origin}`;
    case "comparison":
      return `comparison of ${binding.from.id} with ${binding.to.id}, at ${binding.origin}`;
  }
}

/** A call's units, split by what the receipt says was delivered. */
function unitsOf(units: readonly ReceiptUnit[]): Pick<ReceiptCallView, "full" | "metadata"> {
  return {
    full: units.flatMap((unit) =>
      unit.coverage === "full" ? [{ id: unit.id, revision: unit.revision }] : [],
    ),
    metadata: units.flatMap((unit) => (unit.coverage === "metadata" ? [unit.id] : [])),
  };
}

/**
 * The request collections under `.greenline/ledger/receipts/` as the
 * inspector's evidence view reads them: each request's source, its binding,
 * its owner and every call's operation, outcome, units and failure kind, in
 * the order the calls were made. A receipt keeps no body, so neither does
 * the view; it shows what a request received, never what was applied.
 */
export function receiptView(requests: readonly GuidanceRequest[]): readonly ReceiptRequestView[] {
  return [...requests]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((request) => ({
      id: request.id,
      source: request.source,
      binding: bindingText(request.binding),
      owner:
        [request.owner.record, request.owner.context, request.owner.role]
          .filter((part): part is string => part !== null)
          .join(", ") || "no record named",
      createdAt: request.createdAt,
      calls: [...request.receipts]
        .sort((a, b) => a.sequence - b.sequence)
        .map((receipt) => ({
          sequence: receipt.sequence,
          operation: receipt.operation,
          outcome: receipt.outcome,
          ...unitsOf(receipt.units),
          error: receipt.error === null ? null : receipt.error.kind,
          startedAt: receipt.startedAt,
          finishedAt: receipt.finishedAt,
        })),
      advisories: request.advisories.length,
    }));
}
