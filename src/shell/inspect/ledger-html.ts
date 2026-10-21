import { posix } from "node:path";
import { changeHref, pageAddress, planHref } from "./links.ts";
import { escapeHtml as e, renderMarkdown, type LinkResolver, type LinkTarget } from "./markdown.ts";
import type {
  BriefFile,
  ChangeDetail,
  ChangeListEntry,
  ChangesList,
  CodeTargetView,
  FolderFile,
  RecordCard,
  RunView,
  SectionView,
} from "./ledger.ts";

/*
 * The changes view's components, one per shape of the ledger: a change's
 * row, the record card, the line of sections, the check facts against the
 * commits, and the folder's reports and briefs. Each renders to HTML on the
 * server, escaped by construction, and the page places it as it is.
 */

const LEDGER = ".greenline/ledger";
const CHANGE_FILE = /^\.greenline\/ledger\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/**
 * Where a link in a change's documents leads: a file of its folder or
 * another change opens in the page, and so does a plan or a knowledge home
 * the page renders; a web address opens in a new tab; anything else is
 * shown, never followed.
 */
function resolverFor(detail: ChangeDetail, directory: string): LinkResolver {
  const folder = new Set(detail.folder);
  return (target): LinkTarget => {
    if (/^https?:\/\//i.test(target)) {
      try {
        return { kind: "external", href: new URL(target).href };
      } catch {
        return { kind: "text" };
      }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/"))
      return { kind: "text" };
    let path: string;
    try {
      path = posix.normalize(
        posix.join(directory, decodeURIComponent(target.split(/[?#]/)[0] ?? "")),
      );
    } catch {
      return { kind: "text" };
    }
    const own = `${LEDGER}/${detail.id}/`;
    if (path.startsWith(own) && folder.has(path.slice(own.length)))
      return { kind: "page", href: changeHref(detail.id, path.slice(own.length)) };
    const other = CHANGE_FILE.exec(path);
    if (other?.[1] !== undefined) return { kind: "page", href: changeHref(other[1]) };
    // Another change's folder is left to its own page, which knows its files.
    if (path.startsWith(`${LEDGER}/`)) return { kind: "text" };
    const elsewhere = pageAddress(path, target.split("#", 2)[1] ?? "");
    return elsewhere === undefined ? { kind: "text" } : { kind: "page", href: elsewhere };
  };
}

/**
 * A change's state as a coloured word, the one the list, the card and the plans show.
 * @param state the state, null for a record that does not parse
 * @returns the word's HTML
 */
export function stateWord(state: string | null): string {
  const word = state ?? "unreadable";
  return `<span class="state-word" data-state="${e(word)}">${e(word)}</span>`;
}

function ago(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** The step and the action of a "next" line, `<step>: <action>`. */
function nextParts(next: string): { step: string | null; action: string } {
  const split = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(next);
  return split === null
    ? { step: null, action: next }
    : { step: split[1] ?? null, action: split[2] ?? "" };
}

function row(entry: ChangeListEntry): string {
  const title = entry.why ?? `The record does not parse: ${entry.problem ?? "it cannot be read"}`;
  const next =
    entry.next === null
      ? ""
      : (() => {
          const parts = nextParts(entry.next);
          return `<span class="row-next"><span class="row-next-label">Next${parts.step === null ? "" : `, ${e(parts.step)}`}:</span> ${e(parts.action)}</span>`;
        })();
  const plan =
    entry.plan === null
      ? ""
      : `<span class="row-plan">${e(entry.plan)}${entry.ticket === null ? "" : ` · ${e(entry.ticket)}`}</span>`;
  const problem =
    entry.problem === null || entry.why === null
      ? ""
      : `<span class="row-problem">Does not parse: ${e(entry.problem)}</span>`;
  return (
    `<li class="change-row" data-state="${e(entry.state ?? "unreadable")}"><a href="${e(changeHref(entry.id))}">` +
    `<span class="row-top">${stateWord(entry.state)}<span class="row-why">${e(title)}</span></span>` +
    next +
    problem +
    `<span class="row-meta"><span class="mono">${e(entry.id)}</span>` +
    (entry.mode === null ? "" : `<span class="row-mode">${e(entry.mode)}</span>`) +
    plan +
    `<span title="opened ${e(entry.opened)}">${e(ago(entry.ageDays))}</span></span>` +
    `</a></li>`
  );
}

const FILTERS = [
  ["all", "All"],
  ["open", "Open"],
  ["stopped", "Stopped"],
  ["done", "Done"],
  ["dropped", "Dropped"],
] as const;

/**
 * The list of changes: those in progress first, then the finished, with a
 * filter by state.
 * @param list the changes
 * @returns the view's HTML
 */
export function changesListHtml(list: ChangesList): string {
  if (list.unavailable !== null)
    return `<p class="callout bad">The ledger cannot be read: ${e(list.unavailable)}</p>`;
  if (list.changes.length === 0)
    return `<div class="empty"><p>No change recorded yet.</p><p class="secondary">The practice opens a record in <span class="mono">.greenline/ledger/</span> for each change it makes, and each one is listed here.</p></div>`;
  const count = (state: string): number =>
    state === "all"
      ? list.changes.length
      : list.changes.filter((entry) => entry.state === state).length;
  const filters = FILTERS.filter(([state]) => state === "all" || count(state) > 0)
    .map(
      ([state, label]) =>
        `<button type="button" data-filter="${state}" aria-pressed="${state === "all"}">${label} <span class="count">${count(state)}</span></button>`,
    )
    .join("");
  const current = list.changes.filter(
    (entry) => entry.state === null || entry.state === "open" || entry.state === "stopped",
  );
  const finished = list.changes.filter(
    (entry) => entry.state === "done" || entry.state === "dropped",
  );
  const group = (name: string, title: string, entries: readonly ChangeListEntry[]): string =>
    entries.length === 0
      ? ""
      : `<section class="change-group" data-group="${name}"><h2>${title} <span class="count">${entries.length}</span></h2><ul class="change-list">${entries.map(row).join("")}</ul></section>`;
  return (
    `<div class="filters" role="group" aria-label="Show changes by state">${filters}</div>` +
    group("current", "In progress", current) +
    group("finished", "Finished", finished)
  );
}

/** How the mode was chosen, in the owner's words. */
function choiceWords(choice: NonNullable<RecordCard["choice"]>): string {
  switch (choice) {
    case "owner":
      return "the owner named it";
    case "accepted":
      return "the owner accepted the proposal";
    case "standing":
      return "taken without waiting";
  }
}

function field(name: string, label: string, value: string | null, note = ""): string {
  const shown = value === null || value === "" ? `<span class="unset">not stated</span>` : value;
  return `<div class="field" data-field="${name}"><dt>${label}</dt><dd>${shown}${note === "" ? "" : `<span class="field-note">${note}</span>`}</dd></div>`;
}

function listOrNull(items: readonly string[]): string | null {
  return items.length === 0
    ? null
    : items.map((item) => `<span class="tag">${e(item)}</span>`).join(" ");
}

function cardHtml(card: RecordCard): string {
  const raises =
    card.raises.length === 0
      ? null
      : `<ul class="raises">${card.raises.map((raise) => `<li><span class="mono">from ${e(raise.from)}</span> ${e(raise.reason)}</li>`).join("")}</ul>`;
  const planTicket =
    card.plan === null
      ? null
      : `<a href="${e(planHref(card.plan))}">${e(card.plan)}</a>${card.ticket === null ? "" : `, ticket <span class="mono">${e(card.ticket)}</span>`}`;
  // The owner's words for a push and for a rewrite; absent, the hooks refuse the act.
  const words = (value: string | null): string | null =>
    value === null ? null : `<q>${e(value)}</q>`;
  return (
    `<aside class="record-card" aria-labelledby="card-title"><h2 id="card-title">The record</h2><dl class="card-fields">` +
    field(
      "mode",
      "Mode",
      card.mode === null ? null : `<span class="mode-word">${e(card.mode)}</span>`,
    ) +
    field(
      "choice",
      "Choice",
      card.choice === null ? null : e(card.choice),
      card.choice === null ? "" : e(choiceWords(card.choice)),
    ) +
    field("proposed", "Proposed", card.proposed === null ? null : e(card.proposed)) +
    field("why", "Why", card.why === null ? null : e(card.why)) +
    field("state", "State", card.state === null ? null : stateWord(card.state)) +
    field("next", "Next", card.next === null ? null : e(card.next)) +
    field("floors", "Floors", listOrNull(card.floors)) +
    field("raises", "Raises", raises) +
    field("reviewed", "Reviewed", card.reviewed === null ? null : e(card.reviewed)) +
    field("plan", "Plan and ticket", planTicket) +
    field("agents", "Agents", card.agents === null ? null : String(card.agents)) +
    field("rounds", "Rounds", card.rounds === null ? null : String(card.rounds)) +
    field("starts", "Starts", card.starts === null ? null : listOrNull(card.starts)) +
    field(
      "landing",
      "Landing",
      words(card.landing),
      card.landing === null ? "no push: the pre-push hook refuses one" : "",
    ) +
    field(
      "rebase",
      "Rebase",
      words(card.rebase),
      card.rebase === null ? "no rewrite: the hooks refuse one" : "",
    ) +
    card.lines.map((line) => field(`line-${e(line.field)}`, e(line.field), e(line.text))).join("") +
    `</dl></aside>`
  );
}

function stripHtml(detail: ChangeDetail): string {
  const steps = detail.sections.filter((section) => section.kind === "step");
  return `<ol class="step-strip" aria-label="The steps of the line">${steps
    .map(
      (section) =>
        `<li data-state="${section.state}"${section.current ? ' aria-current="step"' : ""}><a href="#section-${e(section.heading)}"><span class="dot"></span><span class="step-name">${e(section.heading)}</span></a></li>`,
    )
    .join("")}</ol>`;
}

function sectionHtml(detail: ChangeDetail, section: SectionView): string {
  const current = section.current ? `<span class="current-mark">current step</span>` : "";
  const depth = section.depth === null ? "" : `<span class="depth">${e(section.depth)}</span>`;
  const rounds =
    section.rounds > 0
      ? `<span class="depth">${section.rounds} round${section.rounds === 1 ? "" : "s"}</span>`
      : "";
  const attributes = `id="section-${e(section.heading)}" class="section" data-step="${e(section.heading)}" data-kind="${section.kind}" data-state="${section.state}"${section.current ? ' aria-current="step"' : ""}`;
  if (section.state === "skipped")
    return `<li ${attributes}><div class="section-head"><h3>${e(section.heading)}</h3><span class="none-line">${e(section.text.trim())}</span>${current}</div></li>`;
  if (section.state === "elsewhere")
    return `<li ${attributes}><div class="section-head"><h3>${e(section.heading)}</h3><span class="none-line">${section.heldBy === "plan" ? "held by the planning record" : "held by the tickets' records"}</span></div></li>`;
  const body =
    section.state === "written"
      ? `<div class="md">${renderMarkdown(section.text, resolverFor(detail, LEDGER))}</div>`
      : `<p class="unset">${section.state === "missing" ? "The record has no section for this step yet." : "Not written yet."}</p>`;
  return `<li ${attributes}><div class="section-head"><h3>${e(section.heading)}</h3>${depth}${rounds}${current}</div>${body}</li>`;
}

function shortHash(hash: string | null): string {
  return hash === null ? "none" : hash.slice(0, 7);
}

function when(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function duration(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * One run. Under its code it needs no commit named; on other code it names
 * the commit it started on, the one fact that places it.
 */
function runHtml(run: RunView, where: "under-its-code" | "on-other-code"): string {
  const meta = [
    run.step === null ? "" : `step ${e(run.step)}`,
    e(when(run.startedAt)),
    e(duration(run.durationMs)),
    run.ended === null ? "" : e(run.ended),
    where === "under-its-code"
      ? ""
      : `started on <span class="mono">${e(shortHash(run.commit))}</span>`,
    `tree <span class="mono" title="${e(run.tree ?? "unknown")}">${e(shortHash(run.tree))}</span>`,
  ].filter((part) => part !== "");
  return (
    `<li class="run" data-outcome="${run.outcome}" data-file="${e(run.file)}"${run.latest ? ' data-latest="yes"' : ""}>` +
    `<span class="outcome" data-outcome="${run.outcome}">${run.outcome}</span>` +
    `<code class="command">${e(run.command.join(" "))}</code>` +
    (run.probe ? `<span class="tag">probe</span>` : "") +
    `<span class="run-meta">${meta.join(" · ")}</span>` +
    (run.verdict === null ? "" : `<span class="verdict">Latest run: ${e(run.verdict)}</span>`) +
    `</li>`
  );
}

function targetHtml(target: CodeTargetView): string {
  const head =
    target.kind === "working-tree"
      ? `<span class="hash">working tree</span><span class="subject">The code as it stands, not yet committed</span>`
      : `<span class="hash mono" title="${e(target.hash ?? "")}">${e(shortHash(target.hash))}</span><span class="subject">${target.subject === null ? `<span class="unset">subject unknown</span>` : e(target.subject)}</span>`;
  const meta = [
    target.date === null ? "" : e(when(target.date)),
    target.shared ? "shared with another change" : "",
    target.tree === null
      ? ""
      : `tree <span class="mono" title="${e(target.tree)}">${e(shortHash(target.tree))}</span>`,
  ].filter((part) => part !== "");
  const runs =
    target.runs.length === 0
      ? `<p class="no-run">No check ran on this code.</p>`
      : `<ul class="runs">${target.runs.map((run) => runHtml(run, "under-its-code")).join("")}</ul>`;
  return (
    `<li class="target" data-target="${target.kind}"${target.hash === null ? "" : ` data-hash="${e(target.hash)}"`}>` +
    `<div class="target-head">${head}${meta.length === 0 ? "" : `<span class="target-meta">${meta.join(" · ")}</span>`}</div>${runs}</li>`
  );
}

function checksHtml(detail: ChangeDetail): string {
  const checks = detail.checks;
  const parts: string[] = [];
  if (checks.runs === 0 && checks.problems.length === 0)
    parts.push(
      `<p class="secondary">No check recorded. <span class="mono">greenline check</span> records each run in the change's folder.</p>`,
    );
  if (checks.commitsUnknown !== null)
    parts.push(
      `<p class="callout warn">The change's commits cannot be listed: ${e(checks.commitsUnknown)}.</p>`,
    );
  else if (checks.targets.length === 0 && checks.runs > 0)
    parts.push(`<p class="secondary">The change has no commit yet.</p>`);
  if (checks.targets.length > 0)
    parts.push(`<ol class="timeline">${checks.targets.map(targetHtml).join("")}</ol>`);
  if (checks.elsewhere.length > 0)
    parts.push(
      `<h3>On other code</h3><p class="secondary">These runs ran on code that none of the change's commits holds, such as work changed after the run.</p><ul class="runs elsewhere">${checks.elsewhere.map((run) => runHtml(run, "on-other-code")).join("")}</ul>`,
    );
  if (checks.problems.length > 0)
    parts.push(
      `<ul class="problems">${checks.problems.map((problem) => `<li class="callout bad"><span class="mono">${e(problem.file)}</span> cannot be read: ${e(problem.message)}</li>`).join("")}</ul>`,
    );
  const since =
    detail.sinceCheck === null ? "" : `<span class="count">${e(detail.sinceCheck)}</span>`;
  return `<section class="checks" aria-labelledby="checks-title"><h2 id="checks-title">Checks against the commits ${since}</h2>${parts.join("")}</section>`;
}

/** A report's title from its name: `review-2.md` reads `review 2`. */
function reportTitle(file: string): string {
  const brief = /^brief-([a-z][a-z0-9-]*)-(\d+)\.md$/.exec(file);
  if (brief !== null) return `brief for ${brief[1] ?? ""} ${brief[2] ?? ""}`;
  const named = /^([a-z][a-z0-9-]*)-(\d+)\.md$/.exec(file);
  return named === null ? file : `${named[1] ?? ""} ${named[2] ?? ""}`;
}

function fileBody(detail: ChangeDetail, file: FolderFile): string {
  if (file.text === null) return `<p class="unset">${e(file.problem ?? "cannot be shown")}</p>`;
  if (!file.file.endsWith(".md")) return `<pre class="code"><code>${e(file.text)}</code></pre>`;
  // A brief's first line is the command's mark, an HTML comment the card below names instead.
  const text = file.text.replace(/^<!-- greenline brief [^\n]*-->\n?/, "");
  const directory = posix.dirname(`${LEDGER}/${detail.id}/${file.file}`);
  return `<div class="md">${renderMarkdown(text, resolverFor(detail, directory))}</div>`;
}

function fileHtml(detail: ChangeDetail, file: FolderFile, note: string): string {
  return (
    `<details class="file" data-file="${e(file.file)}" id="file-${e(encodeURIComponent(file.file))}">` +
    `<summary><span class="file-title">${e(reportTitle(file.file))}</span><span class="mono file-name">${e(file.file)}</span>${note}</summary>` +
    `${fileBody(detail, file)}</details>`
  );
}

function briefNote(brief: BriefFile): string {
  if (!brief.written) return `<span class="tag warn">not written by greenline brief</span>`;
  return `<span class="tag">for ${e(brief.step ?? "")} ${brief.round ?? ""}</span>`;
}

/** The findings and notices `greenline status` gives, counted, behind one line the owner opens. */
function notesSummary(notes: ChangeDetail["notes"]): string {
  const errors = notes.filter((note) => note.severity === "error").length;
  const others = notes.length - errors;
  const parts = [
    errors === 0
      ? ""
      : `<span class="notes-bad">${errors} finding${errors === 1 ? "" : "s"}</span>`,
    others === 0
      ? ""
      : `<span class="notes-warn">${others} notice${others === 1 ? "" : "s"}</span>`,
  ].filter((part) => part !== "");
  return `${parts.join(" and ")} from <span class="mono">greenline status</span>`;
}

/**
 * One change's page: the front matter as a card, a stopped change's next
 * line first, the sections in the line's order, the check facts against the
 * commits, and the folder's reports and briefs.
 * @param detail the change
 * @returns the page's HTML
 */
export function changeHtml(detail: ChangeDetail): string {
  const card = detail.card;
  const title = card.why ?? detail.problem ?? "The record cannot be read.";
  const next =
    card.next === null
      ? ""
      : (() => {
          const parts = nextParts(card.next);
          const label =
            card.state === "stopped"
              ? `Stopped${parts.step === null ? "" : ` at ${e(parts.step)}`}. Next:`
              : `Next${parts.step === null ? "" : `, ${e(parts.step)}`}:`;
          return `<div class="next-callout" data-state="${e(card.state ?? "")}" role="note"><span class="next-label">${label}</span><p class="next-action">${e(parts.action)}</p></div>`;
        })();
  const notes =
    detail.notes.length === 0
      ? ""
      : `<details class="notes"><summary>${notesSummary(detail.notes)}</summary><ul>${detail.notes
          .map(
            (note) =>
              `<li class="callout ${note.severity === "error" ? "bad" : "warn"}"><span class="mono">${e(note.code)}</span> ${e(note.message)}</li>`,
          )
          .join("")}</ul></details>`;
  // A record whose form parses keeps its sections below; only one whose form fails is shown as written.
  const unparsed =
    detail.problem === null
      ? ""
      : detail.sections.length > 0
        ? `<p class="callout bad">The record does not parse against the modes: ${e(detail.problem)}</p>`
        : `<section class="raw"><h2>The record as written</h2><p class="callout bad">It does not parse: ${e(detail.problem)}</p>${detail.text === null ? "" : `<pre class="code"><code>${e(detail.text)}</code></pre>`}</section>`;
  const line =
    detail.sections.length === 0
      ? ""
      : `<section class="the-line" aria-labelledby="line-title"><h2 id="line-title">The line</h2>${stripHtml(detail)}<ol class="sections">${detail.sections.map((section) => sectionHtml(detail, section)).join("")}</ol></section>`;
  const reports =
    detail.reports.length === 0
      ? ""
      : `<section class="reports" aria-labelledby="reports-title"><h2 id="reports-title">Reports <span class="count">${detail.reports.length}</span></h2>${detail.reports.map((file) => fileHtml(detail, file, "")).join("")}</section>`;
  const briefs =
    detail.briefs.length === 0
      ? ""
      : `<section class="briefs" aria-labelledby="briefs-title"><h2 id="briefs-title">Briefs <span class="count">${detail.briefs.length}</span></h2>${detail.briefs.map((brief) => fileHtml(detail, brief, briefNote(brief))).join("")}</section>`;
  const consultations =
    detail.consultations.length === 0
      ? ""
      : `<section class="consultations"><h2>Garden consultations</h2><ul class="plain">${detail.consultations
          .map(
            (item) =>
              `<li><span class="mono">${e(item.request)}</span> ${e(item.binding)} · ${item.calls} call${item.calls === 1 ? "" : "s"}</li>`,
          )
          .join("")}</ul></section>`;
  return (
    `<article class="change" data-change="${e(detail.id)}" data-reading="${detail.reading}">` +
    `<nav class="crumb"><a href="#changes">&larr; All changes</a></nav>` +
    `<header class="change-head"><p class="eyebrow"><span class="mono">${e(detail.id)}</span>` +
    `<span>opened ${e(detail.opened)}, ${e(ago(detail.ageDays))}</span></p>` +
    `<h1 class="change-title">${e(title)}</h1>` +
    `<p class="head-meta">${stateWord(card.state)}${card.mode === null ? "" : `<span class="mode-word">${e(card.mode)}</span>`}${card.step === null || card.step === "none" ? "" : `<span>at ${e(card.step)}</span>`}</p></header>` +
    next +
    notes +
    `<div class="change-grid"><div class="change-main">${unparsed}${line}${checksHtml(detail)}${reports}${briefs}${consultations}</div>${cardHtml(card)}</div>` +
    `</article>`
  );
}
