/**
 * The inspector page's style. The house style is the audit viewer's: three
 * type sizes (17px body, 14px secondary, 13px metadata), a grey scale with
 * colour only where it means something (met, not met, a reference, a
 * warning), flat 6px shapes with a 1px border and no shadow, dark and light
 * following the system unless the owner flips it. Every view draws from the
 * same tokens and the same few components: a row, a card, a callout, a tag,
 * a coloured word.
 */
export const STYLE: string = String.raw`
@font-face { font-family: "Geist"; src: url(data:font/woff2;base64,__SANS__) format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "Geist Mono"; src: url(data:font/woff2;base64,__MONO__) format("woff2"); font-weight: 100 900; font-display: block; }
:root {
  color-scheme: light;
  --bg: #ffffff; --card: #ffffff; --fg: #1b1b1b; --muted: #6f6f6f; --subtle: #f3f3f3; --hover: #efefef;
  --border: #e6e6e6; --input: #e2e2e2; --ring: #a3a3a3;
  --good: oklch(0.53 0.14 150); --bad: oklch(0.55 0.19 27); --reference: oklch(0.52 0.15 255); --warning: oklch(0.6 0.13 70);
  --font-sans: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --body: 17px; --secondary: 14px; --meta: 13px; --radius: 6px;
  --top: 57px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  color-scheme: dark;
  --bg: #181818; --card: #1c1c1c; --fg: #ececec; --muted: #8e8e8e; --subtle: #242424; --hover: #252525;
  --border: #2a2a2a; --input: #303030; --ring: #5a5a5a;
  --good: oklch(0.72 0.15 150); --bad: oklch(0.68 0.17 25); --reference: oklch(0.72 0.12 250); --warning: oklch(0.8 0.13 80);
} }
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #181818; --card: #1c1c1c; --fg: #ececec; --muted: #8e8e8e; --subtle: #242424; --hover: #252525;
  --border: #2a2a2a; --input: #303030; --ring: #5a5a5a;
  --good: oklch(0.72 0.15 150); --bad: oklch(0.68 0.17 25); --reference: oklch(0.72 0.12 250); --warning: oklch(0.8 0.13 80);
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--fg); font-family: var(--font-sans); font-size: var(--body); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
:where(a, button, input, textarea, select, summary):focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: var(--radius); }
.mono, code, pre { font-family: var(--font-mono); }
.secondary, .lede { color: var(--muted); font-size: var(--secondary); line-height: 1.5; }
.lede { font-size: var(--body); line-height: 1.55; margin: 0; max-width: 68ch; }
.unset { color: var(--muted); font-style: italic; }
.label { font-size: var(--meta); color: var(--muted); margin-right: 8px; }
[hidden] { display: none !important; }

/* The top bar: the brand, every view in one row, and the two page actions. */
.top { position: sticky; top: 0; z-index: 10; background: var(--bg); border-bottom: 1px solid var(--border); }
.top-inner { max-width: 1280px; margin: 0 auto; height: 56px; padding: 0 32px; display: flex; align-items: center; gap: 28px; }
.brand { display: flex; align-items: center; gap: 9px; font-weight: 600; font-size: var(--body); text-decoration: none; flex: none; }
.brand svg { width: 10px; height: 20px; flex: none; }
.views { flex: 1 1 auto; min-width: 0; }
.views ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
.views ul::-webkit-scrollbar { display: none; }
.views a { display: block; padding: 6px 11px; border-radius: var(--radius); font-size: var(--secondary); color: var(--muted); text-decoration: none; white-space: nowrap; }
.views a:hover { background: var(--hover); color: var(--fg); }
.views a[aria-current="page"] { background: var(--subtle); color: var(--fg); font-weight: 500; }
.tools { display: flex; align-items: center; gap: 8px; flex: none; }
.tools .version { font-size: var(--meta); color: var(--muted); margin-right: 4px; white-space: nowrap; }
.tools button { height: 30px; padding: 0 10px; }
.main { max-width: 1280px; margin: 0 auto; padding: 40px 32px 72px; }
.main > section > header, .view-head { margin-bottom: 24px; }
.foot { max-width: 1280px; margin: 0 auto; padding: 16px 32px 32px; font-size: var(--meta); color: var(--muted); border-top: 1px solid var(--border); }
.notice { margin: 0 0 20px; padding: 10px 14px; border: 1px solid color-mix(in oklch, var(--warning) 45%, var(--border)); border-radius: var(--radius); font-size: var(--secondary); white-space: pre-wrap; }
.notice:empty { display: none; }

h1 { font-size: 26px; line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 8px; text-wrap: balance; overflow-wrap: anywhere; }
h2 { font-size: var(--body); line-height: 1.3; font-weight: 600; margin: 36px 0 12px; }
h3 { font-size: var(--body); line-height: 1.3; font-weight: 600; margin: 20px 0 8px; }
h4 { font-size: var(--meta); line-height: 1.4; font-weight: 500; color: var(--muted); margin: 0 0 4px; }
.count { font-size: var(--meta); font-weight: 400; color: var(--muted); margin-left: 6px; }
button, .btn { font: inherit; font-size: var(--secondary); font-weight: 500; height: 34px; padding: 0 14px; border: 1px solid var(--input); border-radius: var(--radius); background: var(--bg); color: var(--fg); cursor: pointer; }
button:hover { background: var(--hover); }
button.primary { background: var(--fg); border-color: var(--fg); color: var(--bg); }
button.primary:hover { opacity: 0.88; background: var(--fg); }
textarea, select { font: 14px/1.6 var(--font-mono); color: var(--fg); background: var(--bg); border: 1px solid var(--input); border-radius: var(--radius); padding: 12px; }
textarea { width: 100%; min-height: 260px; resize: vertical; }
select { height: 34px; padding: 0 10px; font-family: var(--font-sans); }
.check { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: var(--secondary); }
.check input { margin: 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--meta); line-height: 1.55; background: var(--subtle); border-radius: var(--radius); padding: 12px 14px; margin: 0 0 12px; }
details > summary { cursor: pointer; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 0; }
.problem { color: var(--bad); }
.callout { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; font-size: var(--secondary); margin: 0 0 8px; list-style: none; overflow-wrap: anywhere; }
.callout.bad { border-color: color-mix(in oklch, var(--bad) 45%, var(--border)); }
.callout.warn { border-color: color-mix(in oklch, var(--warning) 45%, var(--border)); }
.callout .mono { font-size: var(--meta); margin-right: 6px; }
.empty { border: 1px dashed var(--border); border-radius: var(--radius); padding: 24px; max-width: 680px; }
.empty p { margin: 0 0 6px; }
.tag { display: inline-block; font-size: var(--meta); font-family: var(--font-mono); border: 1px solid var(--border); border-radius: var(--radius); padding: 0 6px; margin: 0 4px 2px 0; color: var(--fg); line-height: 1.6; }
.tag.warn { color: var(--warning); }
.state-word { font-size: var(--meta); font-weight: 500; white-space: nowrap; }
.state-word[data-state="open"] { color: var(--reference); }
.state-word[data-state="stopped"] { color: var(--warning); }
.state-word[data-state="done"] { color: var(--good); }
.state-word[data-state="dropped"] { color: var(--muted); }
.state-word[data-state="unreadable"] { color: var(--bad); }
.mode-word { font-size: var(--meta); font-family: var(--font-mono); }
.panel { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 6px 20px 20px; margin: 0 0 16px; }
.panel > h2 { margin: 14px 0 6px; }
.panel > p { max-width: 72ch; }
.panel-note { font-size: var(--secondary); color: var(--muted); margin: 0 0 12px; max-width: 72ch; }
.table-wrap { overflow-x: auto; }
table.grid, table.receipt { border-collapse: collapse; width: 100%; font-size: var(--secondary); }
table.grid th, table.grid td, table.receipt th, table.receipt td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
table.grid th, table.receipt th { font-size: var(--meta); font-weight: 500; color: var(--muted); background: var(--subtle); }

/* A list of records: one row each, the reason first, the state as a coloured word. */
.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 4px; }
.filters button { height: 30px; padding: 0 10px; }
.filters button[aria-pressed="true"] { background: var(--subtle); border-color: var(--ring); }
.change-group h2 { margin-top: 28px; }
.change-list, .plan-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.change-row a, .plan-row a { display: flex; flex-direction: column; gap: 4px; padding: 14px 12px; border-bottom: 1px solid var(--border); text-decoration: none; }
.change-row a:hover, .plan-row a:hover { background: var(--hover); }
.row-top { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.change-row .row-top .state-word { flex: none; width: 76px; }
.row-why { font-size: var(--body); line-height: 1.4; overflow-wrap: anywhere; }
.change-row :is(.row-next, .row-meta, .row-problem) { padding-left: 88px; }
.row-problem { font-size: var(--secondary); color: var(--bad); }
.row-next { font-size: var(--secondary); line-height: 1.5; }
.row-next-label { color: var(--muted); }
.change-row[data-state="stopped"] .row-next-label { color: var(--warning); font-weight: 500; }
.row-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: var(--meta); color: var(--muted); }
.row-meta .mono { overflow-wrap: anywhere; }
.plan-name { font-size: var(--meta); color: var(--muted); }
.mark { font-size: var(--meta); font-weight: 500; white-space: nowrap; }
.mark[data-mark="complete"] { color: var(--good); }
.mark[data-mark="draft"] { color: var(--warning); }
.row-progress { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 4px 0 2px; }
.progress { display: flex; width: 168px; height: 6px; border-radius: 3px; overflow: hidden; background: var(--subtle); gap: 2px; }
.segment[data-progress="done"] { background: var(--good); }
.segment[data-progress="in-progress"] { background: var(--reference); }
.segment[data-progress="not-started"] { background: var(--border); }
.progress-words { font-size: var(--meta); color: var(--muted); }

/* A record's page: the crumb back, the eyebrow, the title and its facts. */
.crumb { font-size: var(--secondary); margin-bottom: 20px; }
.crumb a { color: var(--muted); text-decoration: none; }
.crumb a:hover { color: var(--fg); }
.eyebrow { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: var(--meta); color: var(--muted); margin: 0 0 6px; }
.eyebrow .mono { overflow-wrap: anywhere; }
.head-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 14px; margin: 0; font-size: var(--meta); color: var(--muted); }
.next-callout { margin: 20px 0 0; border: 1px solid color-mix(in oklch, var(--reference) 40%, var(--border)); border-radius: var(--radius); padding: 12px 16px; max-width: 820px; }
.next-callout[data-state="stopped"] { border-color: color-mix(in oklch, var(--warning) 55%, var(--border)); background: color-mix(in oklch, var(--warning) 7%, var(--bg)); }
.next-label { font-size: var(--secondary); font-weight: 600; color: var(--reference); }
.next-callout[data-state="stopped"] .next-label { color: var(--warning); }
.next-action { margin: 2px 0 0; font-size: var(--body); overflow-wrap: anywhere; }
.notes { max-width: 820px; margin: 16px 0 0; border: 0; padding: 0; }
.notes > summary { font-size: var(--secondary); color: var(--muted); }
.notes-bad { color: var(--bad); font-weight: 500; }
.notes-warn { color: var(--warning); font-weight: 500; }
.notes ul { margin: 10px 0 0; padding: 0; }
.change-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; grid-template-areas: "main card"; gap: 48px; align-items: start; margin-top: 8px; }
.change-main { grid-area: main; min-width: 0; }
.record-card { grid-area: card; position: sticky; top: calc(var(--top) + 24px); border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 4px 18px 16px; margin-top: 24px; }
.record-card h2 { margin: 14px 0 8px; font-size: var(--secondary); }
.card-fields { margin: 0; display: flex; flex-direction: column; }
.card-fields .field { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; padding: 7px 0; border-top: 1px solid var(--border); }
.card-fields dt { font-size: var(--meta); color: var(--muted); line-height: 1.6; }
.card-fields dd { margin: 0; font-size: var(--secondary); line-height: 1.5; overflow-wrap: anywhere; }
.card-fields a { color: var(--reference); text-underline-offset: 2px; }
.field-note { display: block; font-size: var(--meta); color: var(--muted); }
.raises { list-style: none; margin: 0; padding: 0; }
.raises .mono { font-size: var(--meta); color: var(--muted); margin-right: 6px; }
.step-strip { list-style: none; display: flex; margin: 0 0 8px; padding: 4px 0 8px; overflow-x: auto; }
.step-strip li { flex: 1 0 auto; position: relative; }
.step-strip li + li::before { content: ""; position: absolute; top: 9px; left: -50%; width: 100%; height: 1px; background: var(--border); }
.step-strip a { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 6px; text-decoration: none; font-size: var(--meta); color: var(--muted); }
.step-strip .dot { width: 11px; height: 11px; margin-top: 4px; border-radius: 50%; border: 1.5px solid var(--muted); background: var(--bg); z-index: 1; }
.step-strip [data-state="written"] .dot { background: var(--fg); border-color: var(--fg); }
.step-strip [data-state="written"] a { color: var(--fg); }
.step-strip [data-state="skipped"] .dot { border-style: dashed; }
.step-strip [aria-current="step"] .dot { width: 13px; height: 13px; margin-top: 3px; border: 3px solid var(--reference); }
.step-strip [aria-current="step"] a { color: var(--reference); font-weight: 500; }
.sections { list-style: none; margin: 0; padding: 0; }
.section { border-top: 1px solid var(--border); padding: 14px 0 6px; scroll-margin-top: calc(var(--top) + 16px); }
.section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 6px; }
.section-head h3 { margin: 0; }
.depth { font-size: var(--meta); color: var(--muted); }
.current-mark { font-size: var(--meta); color: var(--reference); font-weight: 500; }
.section:is([data-state="skipped"], [data-state="elsewhere"]) { padding: 10px 0; }
.section:is([data-state="skipped"], [data-state="elsewhere"]) .section-head { margin: 0; }
.section:is([data-state="skipped"], [data-state="elsewhere"]) h3 { color: var(--muted); font-weight: 500; }
.step-strip [data-state="elsewhere"] .dot { border-style: dotted; }
.none-line { font-family: var(--font-mono); font-size: var(--meta); color: var(--muted); }

/* Rendered Markdown: a record's sections, its reports, and whole documents. */
.md { overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; }
.md p, .md ul, .md ol, .md blockquote, .md .table-wrap { margin: 0 0 12px; }
.md ul, .md ol { padding-left: 22px; }
.md ul { list-style: disc; }
.md ul ul { list-style: circle; }
.md ol { list-style: decimal; }
.md li { margin: 2px 0; }
.md li.task { list-style: none; margin-left: -20px; }
.md h3, .md h4, .md h5, .md h6 { font-size: var(--body); margin: 20px 0 6px; color: var(--fg); }
.md h5, .md h6 { font-size: var(--secondary); }
.md code { font-size: 0.86em; background: var(--subtle); border-radius: var(--radius); padding: 1px 5px; }
.md pre code { background: none; padding: 0; font-size: inherit; }
.md pre { white-space: pre; overflow-x: auto; }
.md blockquote { border-left: 2px solid var(--border); padding-left: 14px; color: var(--muted); }
.md hr { border: 0; border-top: 1px solid var(--border); margin: 16px 0; }
.md a { color: var(--reference); text-decoration: underline; text-underline-offset: 2px; }
.md .link-text { border-bottom: 1px dotted var(--ring); }
.md .image-text { color: var(--muted); }
.md table { border-collapse: collapse; font-size: var(--secondary); }
.md th, .md td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
.md th { background: var(--subtle); font-weight: 600; }
.document-body { max-width: 72ch; }
.document-body > h2 { font-size: 20px; line-height: 1.3; margin: 40px 0 10px; letter-spacing: -0.005em; scroll-margin-top: calc(var(--top) + 16px); }
.document-body > h3 { font-size: var(--body); margin: 28px 0 8px; scroll-margin-top: calc(var(--top) + 16px); }
.document-body > h2:first-child, .document-body > h3:first-child { margin-top: 0; }
.document-grid { display: grid; grid-template-columns: minmax(0, 72ch) minmax(200px, 260px); gap: 56px; align-items: start; margin-top: 28px; }
.outline { position: sticky; top: calc(var(--top) + 24px); max-height: calc(100vh - var(--top) - 48px); overflow-y: auto; border-left: 1px solid var(--border); padding-left: 16px; }
.outline-title { font-size: var(--meta); color: var(--muted); margin: 0 0 8px; font-weight: 500; }
.outline ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.outline a { display: block; font-size: var(--secondary); line-height: 1.4; padding: 3px 0; color: var(--muted); text-decoration: none; }
.outline a:hover { color: var(--fg); }
.outline [data-level="3"] a { padding-left: 12px; font-size: var(--meta); }
.flash { animation: flash 1.2s ease-out; }
@keyframes flash { from { background: color-mix(in oklch, var(--reference) 14%, transparent); } to { background: transparent; } }

/* The check facts against the commits: each code the change holds, the runs on exactly that code beneath it. */
.timeline { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--border); }
.target { position: relative; padding: 0 0 18px 20px; }
.target::before { content: ""; position: absolute; left: -5px; top: 9px; width: 9px; height: 9px; border-radius: 50%; background: var(--bg); border: 1.5px solid var(--muted); }
.target[data-target="working-tree"]::before { border-style: dashed; }
.target-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.target-head .hash { font-size: var(--meta); font-family: var(--font-mono); color: var(--muted); }
.target-head .subject { font-size: var(--body); overflow-wrap: anywhere; }
.target-meta { width: 100%; font-size: var(--meta); color: var(--muted); }
.runs { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.run { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); }
.outcome { font-size: var(--meta); font-weight: 600; }
.outcome[data-outcome="passed"] { color: var(--good); }
.outcome[data-outcome="failed"] { color: var(--bad); }
.outcome[data-outcome="unfinished"] { color: var(--warning); }
.command { font-size: var(--secondary); overflow-wrap: anywhere; }
.run-meta, .verdict { width: 100%; font-size: var(--meta); color: var(--muted); }
.no-run { margin: 4px 0 0; font-size: var(--secondary); color: var(--muted); }
.problems { margin: 12px 0 0; padding: 0; }

/* A file shown in place: a report, a brief, a plan document, a decision record, an installed file. */
.file { border: 1px solid var(--border); border-radius: var(--radius); padding: 0; margin: 0 0 8px; background: var(--card); }
.file > summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 10px 14px; list-style: none; }
.file > summary::-webkit-details-marker { display: none; }
.file > summary::before { content: "\25B8"; color: var(--muted); font-size: var(--meta); }
.file[open] > summary::before { content: "\25BE"; }
.file[open] > summary { border-bottom: 1px solid var(--border); }
.file-title { font-weight: 500; }
.file-name { font-size: var(--meta); color: var(--muted); overflow-wrap: anywhere; }
.file > .md, .file > pre, .file > p, .file > .table-wrap { margin: 14px; }
.file > .document-body { margin: 16px 20px 18px; }
.plain { list-style: none; margin: 0; padding: 0; font-size: var(--secondary); }

/* A plan: its planning change, the tickets ready to start, each ticket's entry, the plan documents. */
.plan > section { max-width: 980px; }
.planning { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin-top: 12px; }
.record-link { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; text-decoration: none; padding: 4px 10px; margin-left: -10px; border-radius: var(--radius); }
.record-link:hover { background: var(--hover); }
.record-why { font-size: var(--secondary); overflow-wrap: anywhere; }
.record-meta { display: inline-flex; gap: 10px; font-size: var(--meta); color: var(--muted); }
.ready { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-width: 820px; }
.ready a { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; padding: 12px 16px; border: 1px solid color-mix(in oklch, var(--good) 40%, var(--border)); border-radius: var(--radius); text-decoration: none; }
.ready a:hover { background: var(--hover); }
.ready .mono { font-size: var(--meta); color: var(--muted); }
.ready .mode-word { margin-left: auto; color: var(--muted); }
.ticket-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; max-width: 980px; }
.ticket { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 14px 18px 12px; scroll-margin-top: calc(var(--top) + 16px); }
.ticket[data-progress="ready"] { border-color: color-mix(in oklch, var(--good) 40%, var(--border)); }
.ticket-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.ticket-id { font-size: var(--meta); color: var(--muted); }
.progress-word { font-size: var(--meta); font-weight: 600; color: var(--muted); }
.progress-word[data-progress="done"] { color: var(--good); }
.progress-word[data-progress="in progress"] { color: var(--reference); }
.progress-word[data-progress="ready"] { color: var(--fg); }
.ticket-head .mode-word { margin-left: auto; color: var(--muted); }
.ticket-intent { font-size: var(--body); line-height: 1.45; margin: 4px 0 10px; overflow-wrap: anywhere; }
.ticket-after { margin: 0 0 10px; font-size: var(--meta); }
.tag[data-progress="done"] { color: var(--good); }
.ticket-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 8px 32px; margin: 0 0 10px; }
.ticket-fields ul { margin: 0; padding-left: 18px; list-style: disc; font-size: var(--secondary); line-height: 1.5; }
.ticket-fields .scope { list-style: none; padding: 0; }
.ticket-fields .scope li { font-size: var(--meta); overflow-wrap: anywhere; }
.ticket-records { list-style: none; margin: 0; padding: 8px 0 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
.ticket-records.none { font-size: var(--meta); color: var(--muted); }
.ticket-records li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
.override { font-size: var(--meta); color: var(--warning); }

/* The knowledge homes: a card per home, a document with its outline, the roots, the decision records. */
.home-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.home-card a { display: flex; flex-direction: column; gap: 6px; height: 100%; padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); text-decoration: none; }
.home-card a:hover { background: var(--hover); }
.home-title { font-weight: 600; }
.home-role { font-size: var(--secondary); color: var(--muted); line-height: 1.5; flex: 1; }
.absent-homes { margin-top: 20px; max-width: 72ch; }
.edit-note { margin: 12px 0 0; }
.edit-note a { color: var(--reference); }
.roots { border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 16px 12px; margin: 4px 0 16px; background: var(--card); }
.roots-caption { font-size: var(--meta); color: var(--muted); font-weight: 500; margin: 8px 0; }
.root-list { list-style: none !important; margin: 0 !important; padding: 0 !important; display: flex; flex-direction: column; gap: 12px; }
.root-card { margin: 0; }
.root-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 4px; }
.root-path { font-weight: 600; font-size: var(--secondary); }
.root-purpose { font-size: var(--secondary); color: var(--muted); }
.status-word { font-size: var(--meta); font-weight: 600; }
.status-word[data-tone="good"] { color: var(--good); }
.status-word[data-tone="bad"] { color: var(--bad); }
.status-word[data-tone="muted"] { color: var(--muted); }
.status-word[data-tone="open"] { color: var(--reference); }
.adr-list { max-width: 900px; }

/* The workspace views: the diagnostics, the receipts, the policy editors and the installation. */
.diagnostics { list-style: none; margin: 0; padding: 0; max-width: 900px; }
.diagnostic { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 2px 12px; padding: 12px 0; border-top: 1px solid var(--border); }
.severity { font-size: var(--meta); font-weight: 600; }
.severity[data-severity="error"] { color: var(--bad); }
.severity[data-severity="warning"] { color: var(--warning); }
.diagnostic-message { font-size: var(--secondary); line-height: 1.5; overflow-wrap: anywhere; }
.diagnostic-meta { grid-column: 2; font-size: var(--meta); color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 12px; }
.receipt-meta { font-size: var(--meta); color: var(--muted); }
.settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0 20px; }
.facts { margin: 0; display: flex; flex-direction: column; max-width: 760px; }
.facts .field { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); }
.facts dt { font-size: var(--meta); color: var(--muted); }
.facts dd { margin: 0; font-size: var(--secondary); overflow-wrap: anywhere; }
.facts .good { color: var(--good); font-weight: 500; }
.facts .warn { color: var(--warning); font-weight: 500; }
.diff { white-space: pre; overflow-x: auto; padding: 8px 0; }
.diff span { display: block; padding: 0 14px; }
.diff .add { background: color-mix(in oklch, var(--good) 12%, transparent); }
.diff .del { background: color-mix(in oklch, var(--bad) 12%, transparent); }

@media (max-width: 1180px) {
  .change-grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "card" "main"; gap: 0; }
  .record-card { position: static; }
  .document-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .outline { display: none; }
}
@media (max-width: 860px) {
  .top { position: static; }
  :root { --top: 0px; }
  .top-inner { height: auto; flex-wrap: wrap; gap: 6px 12px; padding: 10px 16px 6px; }
  .views { order: 3; flex: 1 1 100%; margin: 0 -16px; padding: 0 12px; }
  .tools { margin-left: auto; }
  .tools .version { display: none; }
  .main { padding: 24px 16px 48px; }
  .foot { padding: 16px; }
  .change-row :is(.row-next, .row-meta, .row-problem) { padding-left: 0; }
  .change-row .row-top { flex-direction: column; gap: 2px; }
  .card-fields .field { grid-template-columns: 84px minmax(0, 1fr); }
  .ticket-fields { grid-template-columns: minmax(0, 1fr); }
  .ticket-head .mode-word, .ready .mode-word { margin-left: 0; }
  .diagnostic { grid-template-columns: minmax(0, 1fr); }
  .diagnostic-meta { grid-column: 1; }
  .facts .field { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .panel { padding: 4px 14px 16px; }
}
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
@media (prefers-reduced-motion: reduce) { .flash { animation: none; } }
`;
