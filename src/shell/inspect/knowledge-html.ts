import type { RootExclusion, RootStatement } from "../../core/root-statements.ts";
import type { DecisionRecord, HomeSummary, KnowledgeHome, KnowledgeList } from "./knowledge.ts";
import { repositoryResolver } from "./links.ts";
import {
  escapeHtml as e,
  link,
  renderDocument,
  type LinkResolver,
  type OutlineEntry,
  type RenderedDocument,
} from "./markdown.ts";

/*
 * The knowledge view's components, one per shape of a home: the home's
 * card in the list, a whole document with its outline beside it, the
 * decisions book's root statements as a card per root in place of their
 * fence, and the ADR home as one entry per record with its status and
 * date. Each renders to HTML on the server, escaped by construction.
 */

const ROOTS_FENCE = "greenline-roots";

function homeCard(home: HomeSummary): string {
  return (
    `<li class="home-card" data-home="${e(home.id)}"><a href="#knowledge/${e(home.id)}">` +
    `<span class="home-title">${e(home.title)}</span>` +
    `<span class="home-role">${e(home.role)}</span>` +
    `<span class="row-meta"><span class="mono">${e(home.path)}</span>${home.holds === null ? "" : `<span>${e(home.holds)}</span>`}</span>` +
    `</a></li>`
  );
}

/** How each home comes to be, in the work guide's words, for a home the repository does not keep yet. */
const CREATED = {
  work: '<span class="mono">greenline init</span> and <span class="mono">greenline sync</span> install it.',
  decisions:
    "It is created when the first lasting choice is settled, beside any decisions home the repository keeps.",
  adr: "The close step seeds it on first use, only where the repository keeps no decisions of its own.",
  glossary: "The close step creates it when the first term is settled.",
} satisfies Readonly<Record<HomeSummary["id"], string>>;

/**
 * The homes the repository keeps, and one line for each it does not.
 * @param list the homes
 * @returns the view's HTML
 */
export function knowledgeListHtml(list: KnowledgeList): string {
  const kept = list.homes.filter((home) => home.present);
  const absent = list.homes.filter((home) => !home.present);
  const missing =
    absent.length === 0
      ? ""
      : `<ul class="plain absent-homes">${absent
          .map(
            (home) =>
              `<li class="secondary">${e(home.title)} (<span class="mono">${e(home.path)}</span>): not kept here yet. ${CREATED[home.id]}</li>`,
          )
          .join("")}</ul>`;
  return `<ul class="home-list">${kept.map(homeCard).join("")}</ul>${missing}`;
}

function tags(values: readonly string[], none: string): string {
  return values.length === 0
    ? `<span class="unset">${none}</span>`
    : values.map((value) => `<span class="tag">${e(value)}</span>`).join(" ");
}

function exclusionText(exclusion: RootExclusion): string {
  return exclusion.kind === "unit"
    ? `<span class="tag">unit <span class="mono">${e(exclusion.id)}</span></span>`
    : `<span class="tag">responsibility ${e(exclusion.responsibility)}</span>`;
}

function rootCard(statement: RootStatement, resolve: LinkResolver): string {
  return (
    `<li class="root-card" data-root="${e(statement.root)}">` +
    `<div class="root-head"><span class="mono root-path">${e(statement.root)}</span>${statement.purpose === null ? "" : `<span class="root-purpose">${e(statement.purpose)}</span>`}</div>` +
    `<dl class="card-fields">` +
    `<div class="field"><dt>Languages</dt><dd>${tags(statement.languages, "none settled")}</dd></div>` +
    `<div class="field"><dt>Technologies</dt><dd>${tags(statement.technologies, "none settled")}</dd></div>` +
    `<div class="field"><dt>Decision</dt><dd>${link(e(statement.decision), statement.decision, resolve)}</dd></div>` +
    `<div class="field"><dt>Exclusions</dt><dd>${statement.exclusions.length === 0 ? `<span class="unset">none</span>` : statement.exclusions.map(exclusionText).join(" ")}</dd></div>` +
    `</dl></li>`
  );
}

/** The decisions book's root statements, one card per root, in place of the fence that holds them. */
function rootsHtml(roots: readonly RootStatement[], resolve: LinkResolver): string {
  return `<div class="roots" role="group" aria-label="Root statements"><p class="roots-caption">Root statements <span class="count">${roots.length}</span></p>${
    roots.length === 0
      ? `<p class="secondary">The block names no root.</p>`
      : `<ul class="root-list">${roots.map((statement) => rootCard(statement, resolve)).join("")}</ul>`
  }</div>`;
}

function outlineHtml(home: string, outline: readonly OutlineEntry[]): string {
  if (outline.length < 2) return "";
  return `<nav class="outline" aria-label="On this page"><p class="outline-title">On this page</p><ol>${outline
    .map(
      (entry) =>
        `<li data-level="${entry.level}"><a href="#knowledge/${e(home)}/${e(entry.anchor)}">${e(entry.text)}</a></li>`,
    )
    .join("")}</ol></nav>`;
}

/** The status of a record as a coloured word: accepted reads as settled, anything else as it is written. */
function statusWord(status: string | null): string {
  if (status === null) return "";
  const word = status.toLowerCase();
  const tone = /^accepted|^approved|^adopted/.test(word)
    ? "good"
    : /^rejected/.test(word)
      ? "bad"
      : /^(superseded|deprecated|retired)/.test(word)
        ? "muted"
        : "open";
  return `<span class="status-word" data-tone="${tone}">${e(status)}</span>`;
}

function recordHtml(record: DecisionRecord): string {
  const rendered =
    record.body === null
      ? null
      : renderDocument(
          record.body,
          repositoryResolver("docs/adr"),
          `#knowledge/adr/${encodeURIComponent(record.file)}`,
        );
  return (
    `<details class="file adr" data-file="${e(record.file)}" data-anchor="${e(record.file)}">` +
    `<summary><span class="file-title">${e(record.title)}</span>${statusWord(record.status)}` +
    `<span class="file-name">${record.date === null ? "" : `${e(record.date)} · `}<span class="mono">${e(record.file)}</span></span></summary>` +
    (record.problem === null ? "" : `<p class="callout bad">${e(record.problem)}</p>`) +
    (rendered === null ? "" : `<div class="md document-body">${rendered.html}</div>`) +
    `</details>`
  );
}

function headHtml(home: KnowledgeHome, title: string): string {
  return (
    `<nav class="crumb"><a href="#knowledge">&larr; Knowledge</a></nav>` +
    `<header class="home-head"><p class="eyebrow"><span>${e(home.title)}</span><span class="mono">${e(home.path)}</span>${home.holds === null ? "" : `<span>${e(home.holds)}</span>`}</p>` +
    `<h1>${e(title)}</h1><p class="lede">${e(home.role)}</p></header>`
  );
}

/**
 * One knowledge home's page.
 * @param home the home
 * @returns the page's HTML
 */
export function knowledgeHomeHtml(home: KnowledgeHome): string {
  const problem = home.problem === null ? "" : `<p class="callout bad">${e(home.problem)}</p>`;
  if (home.kind === "records")
    return (
      `<article class="home" data-home="adr">${headHtml(home, home.title)}${problem}` +
      `<div class="adr-list">${home.records.map(recordHtml).join("")}</div></article>`
    );
  const address = `#knowledge/${home.id}`;
  const directory = home.path.includes("/") ? home.path.slice(0, home.path.lastIndexOf("/")) : "";
  const rendered: RenderedDocument | null =
    home.text === null
      ? null
      : renderDocument(home.text, repositoryResolver(directory), address, {
          fences:
            home.kind === "decisions" && home.roots !== null
              ? { [ROOTS_FENCE]: (_body, resolve) => rootsHtml(home.roots ?? [], resolve) }
              : {},
        });
  const edit =
    home.kind === "decisions"
      ? `<p class="secondary edit-note">This page reads the book; the <a href="#policy">repository policy</a> view edits it.</p>`
      : "";
  return (
    `<article class="home" data-home="${e(home.id)}">${headHtml(home, rendered?.title ?? home.title)}${problem}${edit}` +
    (rendered === null
      ? ""
      : `<div class="document-grid"><div class="md document-body">${rendered.html}</div>${outlineHtml(home.id, rendered.outline)}</div>`) +
    `</article>`
  );
}
