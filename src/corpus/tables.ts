/**
 * The prose and table helpers the views share (`src/corpus/views.ts`,
 * `src/corpus/line.ts`). Every table is padded as the formatter pads it, so
 * a written view stays as rendered.
 */

/**
 * A table cell's text, its pipes escaped.
 * @param text the cell's text
 * @returns the text a table cell carries
 */
export function cell(text: string): string {
  return text.replaceAll("|", "\\|");
}

/**
 * A Markdown table, each column as wide as its widest cell and at least three.
 * @param head the header's cells
 * @param body each row's cells
 * @returns the table's lines joined, without a trailing newline
 */
export function table(head: readonly string[], body: readonly (readonly string[])[]): string {
  const widths = head.map((_, column) =>
    [head, ...body].reduce((widest, row) => Math.max(widest, (row[column] ?? "").length), 3),
  );
  const render = (row: readonly string[]): string =>
    `| ${widths.map((width, column) => (row[column] ?? "").padEnd(width)).join(" | ")} |`;
  const rule = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  return [render(head), rule, ...body.map(render)].join("\n");
}

/**
 * Items joined as prose: "a", "a and b", "a, b and c", or with "or".
 * @param items the items in order
 * @param conjunction the word before the last item
 * @returns the prose list
 */
export function listed(items: readonly string[], conjunction: "and" | "or" = "and"): string {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1) ?? ""}`;
}

/**
 * A line of prose closed as a sentence: a full stop added where it ends without one.
 * @param text the line
 * @returns the line ending in a full stop, a question mark or an exclamation mark
 */
export function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
