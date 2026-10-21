import { describe, expect, it } from "vitest";
import {
  renderDocument,
  renderMarkdown,
  type LinkResolver,
} from "../../../src/shell/inspect/markdown.ts";

/**
 * The inspector's Markdown renderer: the subset the ledger's documents use,
 * and the safety the page's same-origin write endpoints need.
 */

const followNothing: LinkResolver = () => ({ kind: "text" });
const render = (source: string, resolve: LinkResolver = followNothing): string =>
  renderMarkdown(source, resolve);

describe("the inspector's Markdown", () => {
  it("shows raw HTML as text, so a record can never run a script in the page", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("names an image and never loads it, so the page contacts no service", () => {
    const html = render("![the chart](https://example.com/chart.png)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("example.com");
    expect(html).toContain('<span class="image-text">[image: the chart]</span>');
  });

  it("follows a link only as the resolver allows, and escapes its target", () => {
    const resolve: LinkResolver = (target) =>
      target === "review-1.md"
        ? { kind: "page", href: "#change/x/review-1.md" }
        : target.startsWith("https://")
          ? { kind: "external", href: target }
          : { kind: "text" };
    expect(render("[review](review-1.md)", resolve)).toBe(
      '<p><a href="#change/x/review-1.md">review</a></p>',
    );
    expect(render('[docs](https://example.com/?a="b")', resolve)).toContain(
      'href="https://example.com/?a=&quot;b&quot;" target="_blank" rel="noreferrer noopener"',
    );
    expect(render("[run](javascript:alert(1))", resolve)).toBe(
      '<p><span class="link-text" title="javascript:alert(1)">run</span></p>',
    );
  });

  it("renders the record's shapes: headings below the page's, lists, tables, quotes and fenced code", () => {
    const html = render(
      [
        "### round 1",
        "",
        "- first",
        "- second with `code`",
        "  - nested",
        "",
        "1. one",
        "2. two",
        "",
        "| Finding | Severity | Done |",
        "| --- | :---: | ---: |",
        "| a \\| b | high | fixed |",
        "",
        "> a quoted line",
        "",
        "```ts",
        "const a = 1 < 2;",
        "```",
        "",
        "---",
      ].join("\n"),
    );
    expect(html).toContain("<h5>round 1</h5>");
    expect(html).toContain(
      "<ul><li>first</li><li>second with <code>code</code>\n<ul><li>nested</li></ul></li></ul>",
    );
    expect(html).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(html).toContain("<th>Finding</th>");
    expect(html).toContain('<td style="text-align:center">high</td>');
    expect(html).toContain("<td>a | b</td>");
    expect(html).toContain("<blockquote><p>a quoted line</p></blockquote>");
    expect(html).toContain(
      '<pre class="code" data-language="ts"><code>const a = 1 &lt; 2;</code></pre>',
    );
    expect(html).toContain("<hr>");
  });

  it("emphasises words and leaves a snake_case name and a lone star alone", () => {
    expect(render("**strong** and *em* and ~~gone~~")).toBe(
      "<p><strong>strong</strong> and <em>em</em> and <del>gone</del></p>",
    );
    expect(render("the file snake_case_name.ts and 2 * 3 * 4")).toBe(
      "<p>the file snake_case_name.ts and 2 * 3 * 4</p>",
    );
  });

  it("marks a task item done or not", () => {
    expect(render("- [x] shipped\n- [ ] owed")).toContain('data-done="yes"');
    expect(render("- [x] shipped\n- [ ] owed")).toContain('data-done="no"');
  });
});

describe("the inspector's Markdown for a whole document", () => {
  it("S2 takes the document's title out, sets its sections at the page's second level and outlines them", () => {
    const document = renderDocument(
      [
        "# Work in this workspace",
        "",
        "Intro.",
        "",
        "## Plans and tickets",
        "",
        "```text",
        "# Tickets",
        "```",
        "",
        "### House rulings",
        "",
        "## Plans and tickets",
      ].join("\n"),
      followNothing,
      "#knowledge/work",
    );
    expect(document.title).toBe("Work in this workspace");
    expect(document.html).not.toContain("Work in this workspace");
    expect(document.html).toContain('<h2 data-anchor="plans-and-tickets">Plans and tickets</h2>');
    expect(document.html).toContain('<h3 data-anchor="house-rulings">');
    // A heading inside a fence is text, and a repeated heading takes its own anchor.
    expect(document.outline).toEqual([
      { level: 2, text: "Plans and tickets", anchor: "plans-and-tickets" },
      { level: 3, text: "House rulings", anchor: "house-rulings" },
      { level: 2, text: "Plans and tickets", anchor: "plans-and-tickets-1" },
    ]);
  });

  it("S2 follows a link to one of the document's own headings into the page, and no other fragment", () => {
    const document = renderDocument(
      "## API\n\nSee [the API](#api) and [nowhere](#missing).",
      followNothing,
      "#knowledge/decisions",
    );
    expect(document.html).toContain('<a href="#knowledge/decisions/api">the API</a>');
    expect(document.html).toContain('<span class="link-text" title="#missing">nowhere</span>');
  });

  it("S2 counts a heading inside a quote as the renderer does, so a link to it and to a later twin resolves", () => {
    const document = renderDocument(
      "See [quoted](#note) and [twin](#note-1).\n\n> ## Note\n\n## Note",
      followNothing,
      "#knowledge/work",
    );
    expect(document.html).toContain('<a href="#knowledge/work/note">quoted</a>');
    expect(document.html).toContain('<a href="#knowledge/work/note-1">twin</a>');
    expect(document.html).toContain('<h2 data-anchor="note-1">Note</h2>');
  });

  it("S2 renders a fence its caller names through the caller's component, and any other as code", () => {
    const document = renderDocument(
      "```greenline-roots\n[]\n```\n\n```json\n{}\n```",
      followNothing,
      "#knowledge/decisions",
      { fences: { "greenline-roots": () => '<div class="roots">the roots</div>' } },
    );
    expect(document.html).toContain('<div class="roots">the roots</div>');
    expect(document.html).toContain('<pre class="code" data-language="json"><code>{}</code></pre>');
  });
});
