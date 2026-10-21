/**
 * The inspector's Markdown renderer: the subset a change record, a report
 * and a brief use (headings, paragraphs, lists, tables, quotes, fenced and
 * inline code, emphasis and links), rendered to HTML on the server and
 * shown in the page.
 *
 * It is the house's own rather than a package because the page it feeds
 * holds the inspector's write endpoints on the same origin: a record from a
 * cloned repository must never run a script there. Every byte of the source
 * is escaped by construction, raw HTML is shown as text, an image is never
 * loaded (the page contacts no service), and a link's target passes through
 * the caller's resolver, which alone decides what may be followed.
 */

/** Where a link in the source leads, as the caller resolves it. */
export type LinkTarget =
  /** An address inside the page, such as a report of the same change, built by the caller. */
  | { readonly kind: "page"; readonly href: string }
  /** A web address the owner may open in a new tab; the page itself never fetches it. */
  | { readonly kind: "external"; readonly href: string }
  /** A target the page cannot follow: the link's text is shown with the target beside it. */
  | { readonly kind: "text" };

/** Resolves a link's written target, exactly as the source gives it. */
export type LinkResolver = (target: string) => LinkTarget;

/**
 * Escape text for an HTML element or a quoted attribute.
 * @param text any text
 * @returns the text with every markup character escaped
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( {0,12})([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const TASK = /^\[( |x|X)\]\s+/;

/**
 * Render Markdown to HTML.
 * @param source the Markdown text
 * @param resolve decides where each link leads
 * @returns HTML holding only the elements this renderer writes
 */
export function renderMarkdown(source: string, resolve: LinkResolver): string {
  return blocks(source.replace(/\r\n?/g, "\n").split("\n"), resolve, false, null);
}

/** One heading of a whole document's outline, at the page's second or third level. */
export interface OutlineEntry {
  readonly level: number;
  readonly text: string;
  readonly anchor: string;
}

/** A whole document rendered: its title, taken out of the body, its HTML and its outline. */
export interface RenderedDocument {
  /** The text of a first-level heading that opens the document; null when none does. */
  readonly title: string | null;
  readonly html: string;
  readonly outline: readonly OutlineEntry[];
}

/**
 * A fence's language the caller renders through a component of its own,
 * given the fence's text and the document's resolver, so a link the
 * component writes resolves as the document's own links do.
 */
export type FenceComponents = Readonly<
  Record<string, (body: string, resolve: LinkResolver) => string>
>;

/** What rendering a whole document adds to rendering a record's section. */
interface DocumentContext {
  readonly anchors: Anchors;
  readonly outline: OutlineEntry[];
  readonly fences: FenceComponents;
}

/** A heading's text without its inline marks, as the outline and the anchor read it. */
function plainText(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

/** The anchors of a document's headings, in order, a repeated one numbered as a forge numbers it. */
class Anchors {
  private readonly used = new Map<string, number>();
  next(text: string): string {
    const base =
      plainText(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    const seen = this.used.get(base);
    this.used.set(base, (seen ?? -1) + 1);
    return seen === undefined ? base : `${base}-${seen + 1}`;
  }
}

/** The anchors a document's headings take, read before rendering so a link may point ahead. */
function anchorsOf(lines: readonly string[]): ReadonlySet<string> {
  const anchors = new Anchors();
  const found = new Set<string>();
  let fence: RegExp | null = null;
  for (const written of lines) {
    // A quote's own lines are read as the renderer reads them, its markers taken off.
    let line = written;
    for (let quoted = QUOTE.exec(line); quoted !== null; quoted = QUOTE.exec(line))
      line = quoted[1] ?? "";
    if (fence !== null) {
      if (fence.test(line)) fence = null;
      continue;
    }
    const opening = FENCE.exec(line);
    if (opening !== null) {
      const marker = opening[1] ?? "```";
      fence = new RegExp(`^ {0,3}${marker.startsWith("~") ? "~" : "`"}{${marker.length},}\\s*$`);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) found.add(anchors.next(heading[2] ?? ""));
  }
  return found;
}

/**
 * Render a whole document, a knowledge home or a plan document, as one
 * page of its own: a first-level heading that opens it becomes the title
 * the caller shows, its sections stand at the page's second level with an
 * anchor each, and a link to one of its own headings opens that heading in
 * the page.
 * @param source the Markdown text
 * @param resolve decides where each other link leads
 * @param address the document's own page address, after which a heading's anchor follows
 * @param options the fences the caller renders through components of its own
 * @returns the title, the HTML and the outline
 */
export function renderDocument(
  source: string,
  resolve: LinkResolver,
  address: string,
  options: { readonly fences?: FenceComponents } = {},
): RenderedDocument {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => !isBlank(line));
  const opening = first === -1 ? null : /^ {0,3}# +(.+?)(?:\s+#+)?\s*$/.exec(lines[first] ?? "");
  const body = opening === null ? lines : lines.filter((_, index) => index !== first);
  const anchors = anchorsOf(body);
  const own: LinkResolver = (target) => {
    if (!target.startsWith("#")) return resolve(target);
    const anchor = target.slice(1);
    return anchors.has(anchor) ? { kind: "page", href: `${address}/${anchor}` } : { kind: "text" };
  };
  const document: DocumentContext = {
    anchors: new Anchors(),
    outline: [],
    fences: options.fences ?? {},
  };
  const html = blocks(body, own, false, document);
  return {
    title: opening === null ? null : plainText(opening[1] ?? ""),
    html,
    outline: document.outline,
  };
}

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

/** Whether a line opens a block that ends a paragraph. */
function opensBlock(line: string, next: string | undefined): boolean {
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)) return true;
  const item = ITEM.exec(line);
  if (item !== null && (item[4] ?? "").trim() !== "") return true;
  return line.includes("|") && next !== undefined && TABLE_RULE.test(next) && next.includes("-");
}

function blocks(
  lines: readonly string[],
  resolve: LinkResolver,
  tight: boolean,
  document: DocumentContext | null,
): string {
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (isBlank(line)) {
      index++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? "```";
      // The fence closes on a line of the same character, at least as long.
      const closing = new RegExp(
        `^ {0,3}${marker.startsWith("~") ? "~" : "`"}{${marker.length},}\\s*$`,
      );
      const body: string[] = [];
      index++;
      while (index < lines.length && !closing.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index++;
      }
      index++;
      const language = fence[2] ?? "";
      const component = document?.fences[language];
      if (component !== undefined) {
        out.push(component(body.join("\n"), resolve));
        continue;
      }
      out.push(
        `<pre class="code"${language === "" ? "" : ` data-language="${escapeHtml(language)}"`}><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const marks = (heading[1] ?? "#").length;
      const text = heading[2] ?? "";
      if (document === null) {
        // A record's own headings sit below the component's: `#` is the third level of the page.
        const level = Math.min(6, marks + 2);
        out.push(`<h${level}>${inline(text, resolve)}</h${level}>`);
      } else {
        // A whole document's sections stand at the page's second level, its title being the page's own.
        const level = Math.max(2, marks);
        const anchor = document.anchors.next(text);
        if (level <= 3) document.outline.push({ level, text: plainText(text), anchor });
        // The anchor is an attribute, not an id, so several documents on one page never clash.
        out.push(`<h${level} data-anchor="${anchor}">${inline(text, resolve)}</h${level}>`);
      }
      index++;
      continue;
    }
    if (RULE.test(line)) {
      out.push("<hr>");
      index++;
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && !isBlank(lines[index])) {
        const inner = lines[index] ?? "";
        quoted.push(QUOTE.exec(inner)?.[1] ?? inner);
        index++;
      }
      out.push(`<blockquote>${blocks(quoted, resolve, false, document)}</blockquote>`);
      continue;
    }
    const next = lines[index + 1];
    if (line.includes("|") && next !== undefined && TABLE_RULE.test(next) && next.includes("-")) {
      index = table(lines, index, resolve, out);
      continue;
    }
    if (ITEM.test(line) && (ITEM.exec(line)?.[4] ?? "").trim() !== "") {
      index = list(lines, index, resolve, out, document);
      continue;
    }
    const paragraph: string[] = [line];
    index++;
    while (index < lines.length) {
      const inner = lines[index] ?? "";
      if (isBlank(inner) || opensBlock(inner, lines[index + 1])) break;
      paragraph.push(inner);
      index++;
    }
    const text = paragraphText(paragraph, resolve);
    out.push(tight ? text : `<p>${text}</p>`);
  }
  return out.join("\n");
}

/** A paragraph's lines as inline HTML: a line ending in two spaces or a backslash breaks. */
function paragraphText(lines: readonly string[], resolve: LinkResolver): string {
  return lines
    .map((line, position) => {
      const last = position === lines.length - 1;
      const hard = !last && (/ {2,}$/.test(line) || /\\$/.test(line));
      const trimmed = line.trim().replace(/\\$/, "");
      return inline(trimmed, resolve) + (hard ? "<br>" : "");
    })
    .join("\n");
}

function cells(row: string): readonly string[] {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const found: string[] = [];
  let current = "";
  for (let position = 0; position < text.length; position++) {
    const character = text[position];
    if (character === "\\" && text[position + 1] === "|") {
      current += "|";
      position++;
    } else if (character === "|") {
      found.push(current.trim());
      current = "";
    } else current += character;
  }
  found.push(current.trim());
  return found;
}

function table(
  lines: readonly string[],
  start: number,
  resolve: LinkResolver,
  out: string[],
): number {
  const head = cells(lines[start] ?? "");
  const aligns = cells(lines[start + 1] ?? "").map((cell) =>
    cell.startsWith(":") && cell.endsWith(":")
      ? "center"
      : cell.endsWith(":")
        ? "right"
        : cell.startsWith(":")
          ? "left"
          : "",
  );
  const cell = (tag: "th" | "td", text: string, column: number): string => {
    const align = aligns[column] ?? "";
    return `<${tag}${align === "" ? "" : ` style="text-align:${align}"`}>${inline(text, resolve)}</${tag}>`;
  };
  let index = start + 2;
  const rows: string[] = [];
  while (index < lines.length && !isBlank(lines[index]) && (lines[index] ?? "").includes("|")) {
    const row = cells(lines[index] ?? "");
    rows.push(
      `<tr>${head.map((_, column) => cell("td", row[column] ?? "", column)).join("")}</tr>`,
    );
    index++;
  }
  out.push(
    `<div class="table-wrap"><table><thead><tr>${head.map((text, column) => cell("th", text, column)).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`,
  );
  return index;
}

/**
 * One list: its items at one indent and of one kind, each item's further
 * lines those indented past its marker, or a lazy line straight after it.
 */
function list(
  lines: readonly string[],
  start: number,
  resolve: LinkResolver,
  out: string[],
  document: DocumentContext | null,
): number {
  const first = ITEM.exec(lines[start] ?? "");
  const base = first?.[1]?.length ?? 0;
  const ordered = /\d/.test(first?.[2] ?? "");
  const startsAt = ordered ? Number.parseInt(first?.[2] ?? "1", 10) : 1;
  const items: { lines: string[]; indent: number }[] = [];
  let loose = false;
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const item = ITEM.exec(line);
    const sameList =
      item !== null &&
      (item[1]?.length ?? 0) === base &&
      /\d/.test(item[2] ?? "") === ordered &&
      (item[4] ?? "").trim() !== "";
    if (sameList) {
      const marker = (item[1] ?? "") + (item[2] ?? "") + (item[3] ?? "");
      items.push({
        lines: [item[4] ?? ""],
        indent: Math.min(marker.length, base + (item[2]?.length ?? 1) + 4),
      });
      index++;
      continue;
    }
    const current = items.at(-1);
    if (current === undefined) break;
    if (isBlank(line)) {
      const after = lines.slice(index + 1).find((entry) => !isBlank(entry));
      const marker = after === undefined ? null : ITEM.exec(after);
      const continues =
        after !== undefined &&
        (indentOf(after) >= current.indent ||
          (marker !== null &&
            (marker[1]?.length ?? 0) === base &&
            /\d/.test(marker[2] ?? "") === ordered));
      if (!continues) break;
      // A blank line inside a list makes it loose: its items' paragraphs keep their own blocks.
      loose = true;
      current.lines.push("");
      index++;
      continue;
    }
    if (indentOf(line) >= current.indent) {
      current.lines.push(line.slice(current.indent));
      index++;
      continue;
    }
    // A lazy continuation: a plain line straight after the item's own text.
    if (
      indentOf(line) > base ||
      (!isBlank(lines[index - 1]) && !opensBlock(line, lines[index + 1]))
    ) {
      current.lines.push(line.trim());
      index++;
      continue;
    }
    break;
  }
  const rendered = items.map((item) => {
    const lead = item.lines[0] ?? "";
    const task = TASK.exec(lead);
    const body = task === null ? item.lines : [lead.slice(task[0].length), ...item.lines.slice(1)];
    const inner = blocks(body, resolve, !loose, document);
    if (task === null) return `<li>${inner}</li>`;
    const done = task[1] !== " ";
    return `<li class="task" data-done="${done ? "yes" : "no"}"><span class="task-mark" aria-label="${done ? "done" : "not done"}">${done ? "&#10003;" : "&#9675;"}</span> ${inner}</li>`;
  });
  const tag = ordered ? "ol" : "ul";
  out.push(
    `<${tag}${ordered && startsAt !== 1 ? ` start="${startsAt}"` : ""}>${rendered.join("")}</${tag}>`,
  );
  return index;
}

/** The closing position of a run of `marker` after `from`, its neighbours obeying the emphasis rule. */
function closer(text: string, marker: string, from: number): number {
  let position = text.indexOf(marker, from);
  while (position !== -1) {
    const before = text[position - 1] ?? "";
    const after = text[position + marker.length] ?? "";
    const intraword = marker.startsWith("_") && /[A-Za-z0-9]/.test(after);
    if (before.trim() !== "" && before !== "\\" && !intraword) return position;
    position = text.indexOf(marker, position + 1);
  }
  return -1;
}

/** The position of the bracket that closes the one at `open`, or -1. */
function matching(text: string, open: number, left: string, right: string): number {
  let depth = 0;
  for (let position = open; position < text.length; position++) {
    const character = text[position];
    if (character === "\\") position++;
    else if (character === "`") {
      const end = text.indexOf("`", position + 1);
      if (end !== -1) position = end;
    } else if (character === left) depth++;
    else if (character === right && --depth === 0) return position;
  }
  return -1;
}

/**
 * One link, followed only as the resolver allows; a component writes its links through it.
 * @param label the link's text, already HTML
 * @param target the target as written
 * @param resolve decides where it leads
 * @returns the link's HTML, or its text with the target beside it
 */
export function link(label: string, target: string, resolve: LinkResolver): string {
  const destination = target
    .trim()
    .replace(/\s+(?:"[^"]*"|'[^']*')$/, "")
    .replace(/^<(.*)>$/, "$1");
  const resolved = resolve(destination);
  if (resolved.kind === "page") return `<a href="${escapeHtml(resolved.href)}">${label}</a>`;
  if (resolved.kind === "external")
    return `<a href="${escapeHtml(resolved.href)}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  return `<span class="link-text" title="${escapeHtml(destination)}">${label}</span>`;
}

/** Inline Markdown: every character not consumed by a construct is escaped. */
function inline(text: string, resolve: LinkResolver): string {
  let out = "";
  let position = 0;
  while (position < text.length) {
    const character = text[position] ?? "";
    const rest = text.slice(position);
    if (character === "\\" && /[!-/:-@[-`{-~]/.test(text[position + 1] ?? "")) {
      out += escapeHtml(text[position + 1] ?? "");
      position += 2;
      continue;
    }
    if (character === "`") {
      const run = /^`+/.exec(rest)?.[0] ?? "`";
      const end = text.indexOf(run, position + run.length);
      if (end !== -1) {
        out += `<code>${escapeHtml(text.slice(position + run.length, end).trim())}</code>`;
        position = end + run.length;
        continue;
      }
      out += escapeHtml(run);
      position += run.length;
      continue;
    }
    if (character === "!" && text[position + 1] === "[") {
      const close = matching(text, position + 1, "[", "]");
      if (close !== -1 && text[close + 1] === "(") {
        const end = matching(text, close + 1, "(", ")");
        if (end !== -1) {
          // An image is named, never fetched: the page contacts no service.
          out += `<span class="image-text">[image: ${inline(text.slice(position + 2, close), resolve)}]</span>`;
          position = end + 1;
          continue;
        }
      }
    }
    if (character === "[") {
      const close = matching(text, position, "[", "]");
      if (close !== -1 && text[close + 1] === "(") {
        const end = matching(text, close + 1, "(", ")");
        if (end !== -1) {
          out += link(
            inline(text.slice(position + 1, close), resolve),
            text.slice(close + 2, end),
            resolve,
          );
          position = end + 1;
          continue;
        }
      }
    }
    if (character === "<") {
      const auto = /^<(https?:\/\/[^\s<>]+)>/.exec(rest);
      if (auto !== null) {
        out += link(escapeHtml(auto[1] ?? ""), auto[1] ?? "", resolve);
        position += auto[0].length;
        continue;
      }
    }
    const marker = ["**", "__", "~~", "*", "_"].find((candidate) => rest.startsWith(candidate));
    const opens =
      marker !== undefined &&
      (text[position + marker.length] ?? " ").trim() !== "" &&
      !(marker.startsWith("_") && /[A-Za-z0-9]/.test(text[position - 1] ?? ""));
    if (marker !== undefined && opens) {
      const end = closer(text, marker, position + marker.length + 1);
      if (end !== -1) {
        const tag = marker === "~~" ? "del" : marker.length === 2 ? "strong" : "em";
        out += `<${tag}>${inline(text.slice(position + marker.length, end), resolve)}</${tag}>`;
        position = end + marker.length;
        continue;
      }
    }
    out += escapeHtml(character);
    position++;
  }
  return out;
}
