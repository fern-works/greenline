import { GEIST_MONO_BASE64, GEIST_SANS_BASE64 } from "./fonts.ts";

/*
 * The shell's document: the one HTML page the server answers for every
 * path the app shows. It carries the house tokens and the components'
 * style inline, with Geist and Geist Mono embedded, and loads the client
 * app, one script from the server's own origin; every reading comes from
 * the contract under /api/. Nothing here reaches another host.
 */

/** The tab's icon: none, given inline, so the browser asks the server for no file. */
const ICON = "data:,";

/** The client app's file beside the CLI's bundle, and its address on the server. */
export const CLIENT_ASSET = "inspector.mjs";

/**
 * The house colours, one row per token: greenline's own names, each with its
 * value in the light look and in the dark. The values are the design's study
 * of 2026-10-28 (`docs/work/jobs/J-156/evidence/design.md`, "The tokens,
 * under greenline's names"), greenline's adjustments among them where a
 * measured value fell under the text floor, and `shade`, the shadow under
 * what floats, greenline's own. The second cut (J-164 S1) lifts the light
 * page a step off its cards (`canvas` #fbfbfb under a white `raised`, the
 * wells on #f4f4f5), raises the dark cards to #151618 so they part from the
 * page, and adds `group`, the band a group's head sits on, and the pair
 * `add` and `del`, the only hue besides the states', for lines added and
 * removed. The stylesheet is written from this table, so both looks are
 * settled in one place and every component reads them.
 */
export const HOUSE_COLOURS: readonly {
  readonly name: string;
  readonly light: string;
  readonly dark: string;
}[] = [
  { name: "canvas", light: "#fbfbfb", dark: "#0f1011" },
  { name: "sunk", light: "#f4f4f5", dark: "#08090a" },
  { name: "raised", light: "#ffffff", dark: "#151618" },
  { name: "raised-2", light: "#f4f2f4", dark: "#1c1c1f" },
  { name: "raised-3", light: "#eeedef", dark: "#232326" },
  { name: "group", light: "#f4f2f4", dark: "#1c1c1f" },
  { name: "wash", light: "#0000000a", dark: "#ffffff0a" },
  { name: "wash-2", light: "#00000012", dark: "#ffffff12" },
  { name: "line", light: "#e9e8ea", dark: "#23252a" },
  { name: "line-2", light: "#dcdbdd", dark: "#34343a" },
  { name: "line-3", light: "#cfced2", dark: "#3e3e44" },
  { name: "ink", light: "#282a30", dark: "#f7f8f8" },
  { name: "ink-2", light: "#3c4149", dark: "#d0d6e0" },
  { name: "ink-3", light: "#66656e", dark: "#8a8f98" },
  { name: "ink-4", light: "#a3a1aa", dark: "#62666d" },
  { name: "accent", light: "#5e6ad2", dark: "#5e6ad2" },
  { name: "accent-ink", light: "#4f5ac4", dark: "#828fff" },
  { name: "accent-wash", light: "#f1f1ff", dark: "#18182f" },
  { name: "on-accent", light: "#ffffff", dark: "#ffffff" },
  { name: "need", light: "#a8491b", dark: "#fc7840" },
  { name: "need-wash", light: "#fdf1ea", dark: "#2a1a12" },
  { name: "pass", light: "#1d7f35", dark: "#27a644" },
  { name: "fail", light: "#c93c3c", dark: "#eb5757" },
  { name: "add", light: "#1d7f35", dark: "#27a644" },
  { name: "del", light: "#c93c3c", dark: "#eb5757" },
  { name: "warn", light: "#8a6d00", dark: "#f0bf00" },
  { name: "info", light: "#1f6fbf", dark: "#4ea7fc" },
  { name: "idle", light: "#6f6e77", dark: "#8a8f98" },
  { name: "shade", light: "#0000001f", dark: "#00000099" },
];

/**
 * One look's colours as custom properties.
 * @param look the look
 * @returns the declarations
 */
const colours = (look: "light" | "dark"): string =>
  `${HOUSE_COLOURS.map((token) => `--${token.name}: ${token[look]};`).join(" ")} ${DERIVED}`;

/**
 * The colours drawn from the table, declared with each look so a part held
 * in one look derives them from that look's own: the washes and the edges of
 * a line added or removed, the washes of a drifting group and of the owner's
 * note, and the neutral meter a quantity is drawn on, never the done green.
 */
const DERIVED = [
  "--pass-wash: color-mix(in srgb, var(--pass) 14%, transparent);",
  "--fail-wash: color-mix(in srgb, var(--fail) 14%, transparent);",
  "--add-wash: color-mix(in srgb, var(--add) 12%, transparent);",
  "--del-wash: color-mix(in srgb, var(--del) 12%, transparent);",
  "--add-edge: color-mix(in srgb, var(--add) 45%, transparent);",
  "--del-edge: color-mix(in srgb, var(--del) 45%, transparent);",
  "--warn-wash: color-mix(in srgb, var(--warn) 12%, transparent);",
  "--info-wash: color-mix(in srgb, var(--info) 12%, transparent);",
  "--meter: var(--ink-3);",
  "--meter-track: var(--raised-3);",
].join(" ");

/**
 * The house tokens: the colours of both looks, then the type, the space,
 * the shapes, the heights and the motion, which no look changes. The first
 * look follows the system until the owner switches it; a part of a page can
 * hold one look whatever the page's (`look-light`, `look-dark`), which the
 * catalogue draws a component in both looks side by side with. A state is
 * always a word; its tone and its mark only sit beside it.
 */
const TOKENS = String.raw`
:root, .look-light { color-scheme: light; ${colours("light")} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${colours("dark")} }
}
:root[data-theme="dark"], .look-dark { color-scheme: dark; ${colours("dark")} }
:root {
  --sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --size-desk: 24px; --size-title: 20px; --size-reading: 15px; --size-ui: 13px; --size-meta: 12px; --size-key: 11px;
  --weight-read: 400; --weight-name: 510; --weight-title: 590;
  --track-desk: -0.018em; --track-title: -0.012em; --track-reading: -0.011em; --track-ui: -0.01em;
  --radius-chip: 4px; --radius: 6px; --radius-card: 8px; --radius-float: 12px; --radius-pill: 999px;
  --space-1: 2px; --space-2: 4px; --space-3: 6px; --space-4: 8px; --space-5: 12px; --space-6: 16px; --space-7: 24px; --space-8: 32px; --space-9: 48px;
  --height-small: 24px; --height-button: 28px; --height-input: 32px; --height-row: 36px; --height-bar: 48px; --height-foot: 56px;
  --size-section: 14px; --weight-section: 590; --size-group: 12px; --weight-group: 510;
  --measure: 72ch; --gap-section: 32px; --gap-head: 12px; --height-group: 32px;
  --icon: 16px; --icon-small: 14px; --safe-bottom: env(safe-area-inset-bottom, 0px);
  --quick: 120ms ease-out; --fold: 200ms ease-out;
  --gutter: 16px;
}
@media (prefers-reduced-motion: reduce) { :root { --quick: 0ms; --fold: 0ms; } }`;

/**
 * The components' style: the base and the shell, the few shared parts, then
 * one block per artefact kind. Every colour, size, space and radius is a
 * token above; depth is a surface step and a hairline, and a shadow sits
 * only under what floats, the palette and the keys; an inset edge marks the
 * row in focus and the place lit in the foot bar.
 *
 * The colour rules (J-164 S1), written once here and in the visual system's
 * page: hue means a state, or a line added (`add`) or removed (`del`), and
 * nothing else; a kind, a mode, a name or a count takes no hue. In a dense
 * row the mark carries the state's tone and its word is ink-3, except
 * waiting and failed, whose words keep their tone; in a head, a summary or
 * a single fact the word carries the tone too. A quantity is drawn on the
 * neutral meter, never the done green. A link inside a row or a card is ink
 * and underlines on hover; the accent's ink is kept for a link in prose and
 * for the current thing. A plain fact, such as installed, is a word with no
 * mark.
 */
export const COMPONENT_STYLE: string = String.raw`
* { box-sizing: border-box; }
html, body { margin: 0; }
html { background: var(--canvas); }
body { background: var(--canvas); color: var(--ink-2); font: var(--weight-read) var(--size-ui)/1.5 var(--sans); letter-spacing: var(--track-ui); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; overflow-wrap: anywhere; }
a { color: var(--accent-ink); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-chip); }
::selection { background: var(--accent-wash); color: var(--ink); }
code, pre, .mono, kbd { font-family: var(--mono); letter-spacing: 0; }
code, .mono { font-size: var(--size-meta); }
h1 { font-size: var(--size-title); line-height: 1.33; font-weight: var(--weight-title); letter-spacing: var(--track-title); color: var(--ink); margin: 0 0 var(--space-3); }
.desk-title { font-size: var(--size-desk); letter-spacing: var(--track-desk); }
h2 { font-size: var(--size-section); line-height: 1.43; font-weight: var(--weight-section); letter-spacing: -0.011em; color: var(--ink); margin: var(--gap-section) 0 var(--gap-head); }
h3 { font-size: var(--size-ui); line-height: 1.5; font-weight: var(--weight-name); color: var(--ink); margin: var(--space-6) 0 var(--space-3); }
.section-label { font-size: var(--size-group); line-height: 1.4; font-weight: var(--weight-group); letter-spacing: 0; color: var(--ink-2); }
.section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); margin: var(--gap-section) 0 var(--gap-head); }
.section-head h2 { margin: 0; }
.section-head h2 .count { margin-left: var(--space-1); }
.section-head .aside { margin-left: auto; font-size: var(--size-meta); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.listbox { margin: 0 0 var(--space-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; }
.listbox > .rows { border-top: 0; }
.listbox > .rows > li:last-child { border-bottom: 0; }
.listbox > .group + .group { border-top: 1px solid var(--line); }
p { margin: 0 0 var(--space-4); }
ul.plain { list-style: none; padding: 0; margin: 0; }
.meta { font-size: var(--size-meta); line-height: 1.4; letter-spacing: 0; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.muted, .unset { color: var(--ink-3); }
.unset { font-style: italic; }
.lede { color: var(--ink-3); max-width: var(--measure); }
.title { color: var(--ink); font-weight: var(--weight-name); }
.count { display: inline-block; font-size: var(--size-key); line-height: 16px; font-weight: var(--weight-name); letter-spacing: 0; color: var(--ink-3); background: var(--wash-2); border-radius: var(--radius-pill); padding: 0 var(--space-3); margin-left: var(--space-3); font-variant-numeric: tabular-nums; vertical-align: 1px; }
kbd { display: inline-block; min-width: 18px; font-size: var(--size-key); line-height: 18px; font-weight: var(--weight-name); text-align: center; border-radius: var(--radius-chip); padding: 0 var(--space-2); color: var(--ink-3); background: var(--wash-2); }
.bar { position: sticky; top: 0; z-index: 5; background: var(--sunk); border-bottom: 1px solid var(--line); }
.bar-inner { max-width: 1280px; margin: 0 auto; padding: 0 var(--gutter); display: flex; align-items: center; gap: var(--space-6); min-height: var(--height-bar); }
.brand { font-weight: var(--weight-title); color: var(--ink); display: flex; align-items: center; gap: var(--space-4); }
.brand:hover { text-decoration: none; }
.brand::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--accent); }
.views { display: flex; gap: var(--space-1); overflow-x: auto; scrollbar-width: none; flex: 1; }
.views a { display: inline-flex; align-items: center; height: var(--height-button); padding: 0 var(--space-4); border-radius: var(--radius); font-weight: var(--weight-name); color: var(--ink-3); white-space: nowrap; transition: background var(--quick), color var(--quick); }
.views a:hover { color: var(--ink); background: var(--wash); text-decoration: none; }
.views a[aria-current="page"] { color: var(--ink); background: var(--wash-2); }
.tools { display: flex; gap: var(--space-2); align-items: center; margin-left: auto; }
.tools .icon-button { width: var(--height-button); padding: 0; justify-content: center; }
.icon { width: var(--icon); height: var(--icon); flex: none; display: block; }
.live { display: inline-flex; align-items: center; gap: var(--space-3); font-size: var(--size-meta); color: var(--ink-3); white-space: nowrap; font-variant-numeric: tabular-nums; padding: 0 var(--space-3); }
.live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--idle); }
.live[data-live="live"]::before { background: var(--pass); }
.live[data-live="behind"]::before { background: var(--warn); }
.live[data-live="stopped"]::before { background: var(--fail); }
.foot-bar { display: none; grid-template-columns: repeat(var(--places, 5), minmax(0, 1fr)); background: var(--sunk); border-top: 1px solid var(--line); }
.foot-bar a { display: grid; place-items: center; align-content: center; gap: var(--space-1); min-width: 0; font-size: var(--size-key); line-height: 1; font-weight: var(--weight-name); color: var(--ink-3); text-decoration: none; }
.foot-bar a:hover { color: var(--ink); text-decoration: none; }
.foot-bar a .icon { width: 20px; height: 20px; }
.foot-bar a[aria-current="page"] { color: var(--ink); box-shadow: inset 0 2px var(--accent); }
.foot-bar.in-place { display: grid; height: var(--height-foot); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; }
button, .button { font: inherit; font-size: var(--size-ui); font-weight: var(--weight-name); min-height: var(--height-button); padding: 0 var(--space-5); border: 1px solid var(--line-2); border-radius: var(--radius); background: var(--raised); color: var(--ink); display: inline-flex; align-items: center; gap: var(--space-3); cursor: pointer; transition: background var(--quick), border-color var(--quick), color var(--quick); }
button:hover, .button:hover { background: var(--raised-2); border-color: var(--line-3); text-decoration: none; }
button.primary, .button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
button.primary:hover, .button.primary:hover { background: var(--accent); filter: brightness(1.08); }
button.ghost, .button.ghost { background: transparent; border-color: transparent; color: var(--ink-3); }
button.ghost:hover, .button.ghost:hover { background: var(--wash); color: var(--ink); }
button.small, .button.small { min-height: var(--height-small); padding: 0 var(--space-4); font-size: var(--size-meta); }
button[aria-pressed="true"] { background: var(--wash-2); border-color: var(--line-3); }
button:disabled, button:disabled:hover { opacity: 0.5; cursor: default; filter: none; }
.page { max-width: 1280px; margin: 0 auto; padding: var(--space-7) var(--gutter) var(--space-9); }
.foot { max-width: 1280px; margin: 0 auto; padding: var(--space-6) var(--gutter) var(--space-8); font-size: var(--size-meta); color: var(--ink-3); border-top: 1px solid var(--line); }
.notice { margin: 0 0 var(--space-6); padding: var(--space-4) var(--space-5); border: 1px solid var(--line-2); border-radius: var(--radius); background: var(--raised-2); color: var(--ink); white-space: pre-wrap; }
.notice:empty { display: none; }
.crumb { color: var(--ink-3); margin-bottom: var(--space-4); }
.view-head { margin-bottom: var(--space-4); }
/* Above 768 px the five places stand as words in the bar; below it they move to the foot bar of five, and the search keeps its icon alone. */
@media (max-width: 1023px) {
  .bar-inner { gap: var(--space-4); }
  .live .live-words { display: none; }
  .tools .label { display: none; }
}
@media (max-width: 767px) {
  .views { display: none; }
  .bar-inner { gap: var(--space-3); }
  .foot-bar:not(.in-place) { position: fixed; inset: auto 0 0 0; z-index: 5; display: grid; height: calc(var(--height-foot) + var(--safe-bottom)); padding-bottom: var(--safe-bottom); }
  .page { padding-bottom: calc(var(--height-foot) + var(--safe-bottom) + var(--space-7)); }
  .foot { padding-bottom: calc(var(--height-foot) + var(--safe-bottom) + var(--space-6)); }
}
.tabs { display: flex; gap: 0 var(--space-2); border-bottom: 1px solid var(--line); margin: var(--space-6) 0; overflow-x: auto; scrollbar-width: none; }
.tabs a .count { margin-left: var(--space-3); }
.tabs a[data-empty="yes"] { color: var(--ink-3); }
.tabs a { padding: var(--space-3) var(--space-4); margin-bottom: -1px; font-weight: var(--weight-name); color: var(--ink-3); white-space: nowrap; border-bottom: 2px solid transparent; transition: color var(--quick); }
.tabs a:hover { color: var(--ink); text-decoration: none; }
.tabs a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent); }
.panel { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); padding: var(--space-5) var(--space-6); min-width: 0; margin: 0 0 var(--space-6); }
.panel > h2:first-child, .panel > h3:first-child { margin-top: 0; font-size: var(--size-group); line-height: 1.4; font-weight: var(--weight-group); letter-spacing: 0; color: var(--ink-2); }
.grid { display: grid; gap: var(--space-6); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) {
  .grid.two { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  .grid.halves { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
}
.rows { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); container-type: inline-size; }
.rows > li { min-height: var(--height-row); border-bottom: 1px solid var(--line); padding: var(--space-4) var(--space-4); display: grid; align-content: center; gap: var(--space-1); min-width: 0; transition: background var(--quick); }
.rows > li:hover { background: var(--wash); }
/* The row j and k reach: the selected wash and the accent's inset edge, in place of a ring around its link. */
.rows > li:focus-within { background: var(--wash-2); box-shadow: inset 2px 0 var(--accent); }
.rows > li [data-item]:focus-visible { outline: none; }
/* In a dense row the mark keeps the tone and the word goes quiet, but for waiting and failed; a link is ink. */
.rows .word, tbody .word, .fold > summary .word { color: var(--ink-3); }
.rows .word[data-tone="need"], tbody .word[data-tone="need"], .fold > summary .word[data-tone="need"] { color: var(--need); }
.rows .word[data-tone="fail"], tbody .word[data-tone="fail"], .fold > summary .word[data-tone="fail"] { color: var(--fail); }
.rows a, tbody a, .card a, .skill-card a, .panel .card-eyebrow a, .gallery a { color: var(--ink); }
.rows a:hover, tbody a:hover, .card a:hover, .skill-card a:hover, .gallery a:hover { text-decoration: underline; }
.rows > li.change-row { display: grid; grid-template-columns: 104px minmax(0, 1fr) 176px 64px 88px 80px; grid-template-areas: "state main strip mode ticket age"; align-items: center; column-gap: var(--space-5); row-gap: var(--space-2); padding: var(--space-2) var(--space-4); }
.change-row .cell-state { grid-area: state; }
.change-row .cell-main { grid-area: main; display: flex; align-items: baseline; gap: var(--space-4); min-width: 0; white-space: nowrap; overflow: hidden; }
.change-row .cell-main .title { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
.change-row .sentence { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink-3); }
.change-row .cell-strip { grid-area: strip; }
.change-row .cell-age { grid-area: age; text-align: right; white-space: nowrap; }
/* The row turns card where its list is narrow: a phone, or a narrow column on a wide screen. */
@container (max-width: 860px) {
  .rows > li.change-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "state age" "main main" "strip strip" "mode ticket"; padding: var(--space-4); }
  .change-row .cell-main { display: block; white-space: normal; }
  .change-row .cell-main .title { display: block; max-width: none; }
  .change-row .sentence { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }
}
.strip-dots { display: inline-flex; align-items: center; gap: var(--space-3); white-space: nowrap; }
.strip-dots .dots { display: inline-flex; align-items: center; gap: 3px; }
.strip-dots .dot { width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid var(--ink-3); }
.strip-dots .dot[data-ahead="yes"] { border-color: var(--line-3); }
.strip-dots .dot[data-state="written"] { background: var(--pass); border-color: var(--pass); }
.strip-dots .dot[data-state="skipped"], .strip-dots .dot[data-state="in-plan"] { border-style: dashed; border-color: var(--ink-4); }
.strip-dots .dot[data-current="yes"] { width: 9px; height: 9px; background: var(--accent); border-color: var(--accent); }
.strip-now { font-size: var(--size-meta); color: var(--ink-3); }
.strip-dots:has(.dot[data-current="yes"]) .strip-now { color: var(--accent-ink); font-weight: var(--weight-name); }
.filter-bar { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: 0 0 var(--space-5); }
button.chip { min-height: var(--height-small); padding: 0 var(--space-4); border-radius: var(--radius-pill); font-size: var(--size-meta); gap: var(--space-3); }
button.chip[aria-pressed="true"] { background: var(--accent-wash); border-color: var(--accent); color: var(--accent-ink); }
.chip-count { font-size: var(--size-key); color: var(--ink-3); font-variant-numeric: tabular-nums; }
button.chip[aria-pressed="true"] .chip-count { color: var(--accent-ink); }
button.chip[data-count="zero"]:not([aria-pressed="true"]) { color: var(--ink-3); border-style: dashed; }
.roster-cards { list-style: none; margin: 0 0 var(--space-6); padding: 0; display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.skill-card { display: grid; gap: var(--space-2); align-content: start; min-width: 0; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--raised); padding: var(--space-5); }
.skill-card p { margin: 0; }
.skill-use { display: grid; gap: var(--space-2); }
.skill-use .progress { max-width: none; }
[data-view="roster"] .roster-table { display: none; }
@media (min-width: 1024px) {
  [data-view="roster"] .roster-table { display: block; }
  [data-view="roster"] .roster-cards { display: none; }
}
.row-top { display: flex; gap: var(--space-5); align-items: baseline; flex-wrap: wrap; }
.row-meta { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); font-size: var(--size-meta); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.word { --tone: var(--ink-2); display: inline-flex; align-items: center; gap: var(--space-3); font-size: var(--size-meta); font-weight: var(--weight-name); letter-spacing: 0; white-space: nowrap; color: var(--tone); }
.word::before { content: ""; flex: none; width: 9px; height: 9px; border-radius: 3px; border: 1.5px solid var(--tone); }
.word[data-settled="yes"]::before { background: var(--tone); }
.word[data-fact="yes"]::before { display: none; }
.word[data-tone="need"] { --tone: var(--need); }
.word[data-tone="accent"] { --tone: var(--accent-ink); }
.word[data-tone="pass"] { --tone: var(--pass); }
.word[data-tone="fail"] { --tone: var(--fail); }
.word[data-tone="warn"] { --tone: var(--warn); }
.word[data-tone="info"] { --tone: var(--info); }
.word[data-tone="idle"] { --tone: var(--idle); }
.tag { display: inline-block; font-family: var(--mono); font-size: var(--size-meta); line-height: 20px; letter-spacing: 0; border-radius: var(--radius-chip); padding: 0 var(--space-3); background: var(--wash-2); color: var(--ink-2); white-space: nowrap; margin: 0 var(--space-2) var(--space-1) 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--space-5) var(--space-7); margin: 0; }
.facts dt { font-size: var(--size-meta); color: var(--ink-3); }
.facts dd { margin: 0; color: var(--ink); font-variant-numeric: tabular-nums; }
.facts .note { display: block; font-size: var(--size-meta); color: var(--ink-3); }
.callout { border: 1px solid var(--need); background: var(--need-wash); color: var(--ink); padding: var(--space-4) var(--space-5); border-radius: var(--radius); margin: 0 0 var(--space-5); }
.callout.quiet { border-color: var(--line); background: var(--raised-2); color: var(--ink-2); }
/* One empty state everywhere: a quiet line in the place of the content, an act after it where one helps, no box. */
.empty { padding: var(--space-4) 0; color: var(--ink-3); font-size: var(--size-meta); line-height: 1.5; max-width: var(--measure); }
.empty > p { margin: 0 0 var(--space-2); }
.empty .actions { margin-top: var(--space-3); }
.read-state { padding: var(--space-5) 0; }
.read-state.failed { border: 1px solid var(--fail); background: var(--fail-wash); border-radius: var(--radius-card); padding: var(--space-5) var(--space-6); color: var(--ink); margin: 0 0 var(--space-5); }
.read-state.failed .actions { margin: var(--space-4) 0 0; }
/* A skeleton of the section's shape: rows of a mark, a name and a fact, cards, or lines of text. */
.skeleton { display: grid; margin-top: var(--space-4); }
.skeleton[data-form="rows"] { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; }
.skeleton[data-form="rows"] .bone-row { height: var(--height-row); display: grid; grid-template-columns: 9px minmax(0, 40%) minmax(0, 1fr) 20%; gap: var(--space-5); align-items: center; padding: 0 var(--space-5); border-top: 1px solid var(--line); }
.skeleton[data-form="rows"] .bone-row:first-child { border-top: 0; }
.skeleton[data-form="cards"] { grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: var(--space-5); }
.skeleton[data-form="cards"] .bone-card { display: grid; gap: var(--space-4); align-content: start; height: 112px; padding: var(--space-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); }
.skeleton[data-form="text"] { gap: var(--space-4); max-width: var(--measure); }
.bone { display: block; height: 10px; border-radius: var(--radius-chip); background: var(--raised-3); animation: breathe 1.4s ease-in-out infinite; }
.bone.mark { width: 9px; height: 9px; border-radius: 3px; }
.bone.fact { grid-column: 4; }
.bone.short { width: 64%; }
.bone.half { width: 40%; }
@keyframes breathe { 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .bone { animation: none; } }
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-5); margin: 0 0 var(--space-5); font-variant-numeric: tabular-nums; }
.summary-state { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--size-meta); color: var(--ink-2); }
.record-name { font-weight: var(--weight-name); }
table { border-collapse: collapse; width: 100%; font-size: var(--size-ui); font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: var(--weight-name); color: var(--ink-3); font-size: var(--size-meta); }
tbody tr { transition: background var(--quick); }
tbody tr:hover { background: var(--wash); }
.table-wrap { overflow-x: auto; }
pre { white-space: pre-wrap; font-size: var(--size-meta); line-height: 1.55; color: var(--ink-2); background: var(--sunk); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-4) var(--space-5); margin: 0 0 var(--space-4); }
details > summary { cursor: pointer; }
details > summary::-webkit-details-marker { display: none; }
.chev { width: var(--icon-small); height: var(--icon-small); flex: none; color: var(--ink-3); transition: transform var(--fold); }
details[open] > summary .chev { transform: rotate(90deg); }
summary:hover .chev { color: var(--ink); }
/* A group: a band on the group surface with its chevron, title, count, tally and quantity; closed, its worst state's mark leads. */
.group { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; margin: 0 0 var(--space-4); }
.group[data-flat="yes"] { background: none; border: 0; border-radius: 0; overflow: visible; }
.listbox > .group { border: 0; border-radius: 0; margin: 0; }
.group > .group-head { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-4); min-height: var(--height-group); padding: var(--space-1) var(--space-5); background: var(--group); font-size: var(--size-group); line-height: 1.4; font-weight: var(--weight-group); letter-spacing: 0; color: var(--ink-2); }
.group > .group-head:hover { color: var(--ink); }
.group[open] > .group-head { border-bottom: 1px solid var(--line); }
.group-head .group-title { color: var(--ink); }
.group-head .count { margin-left: 0; }
.group-head .worst { display: none; }
.group:not([open]) > .group-head .worst { display: inline-flex; }
.group-head .worst::before { margin: 0; }
.group-head .tally { display: inline-flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-weight: var(--weight-read); }
.group-head .quantity { margin-left: auto; font-weight: var(--weight-read); }
.group-body > .rows { border-top: 0; }
.group-body > .rows > li:last-child { border-bottom: 0; }
.group:not(.box) > .group-body > :not(.rows):not(.fold):not(.group) { margin: var(--space-4) var(--space-5); }
.group-body > .fold { padding: 0 var(--space-5); }
.group-body > .fold:first-child { border-top: 0; }
/* A region of the frame map is a group drawn as its box. */
.group.box { border: 1px solid var(--line-2); border-radius: var(--radius); overflow: visible; margin: 0; }
.group.box > .group-head { display: block; background: none; padding: 0; min-height: 0; font-size: var(--size-ui); color: var(--ink); border: 0; }
details.file { border-top: 1px solid var(--line); padding: var(--space-4) 0; }
details.file > summary { display: flex; gap: var(--space-5); flex-wrap: wrap; align-items: baseline; }
.flash { outline: 2px solid var(--accent); outline-offset: 4px; }
.prose { font-size: var(--size-reading); line-height: 1.6; letter-spacing: var(--track-reading); max-width: var(--measure); color: var(--ink-2); }
.prose h1, .prose h2, .prose h3, .prose h4 { font-size: var(--size-reading); font-weight: var(--weight-title); color: var(--ink); margin: var(--space-6) 0 var(--space-3); }
.prose code { font-size: 0.85em; background: var(--wash-2); border-radius: var(--radius-chip); padding: 0 var(--space-2); }
.prose pre code { background: none; padding: 0; font-size: inherit; }
.prose table { margin: var(--space-4) 0; font-size: var(--size-ui); letter-spacing: var(--track-ui); }
.prose blockquote { margin: 0 0 var(--space-4); padding-left: var(--space-5); border-left: 2px solid var(--line-2); color: var(--ink-3); }
.prose .link-text { color: var(--ink-3); }
.document { display: grid; gap: var(--space-7); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1000px) { .document.with-outline { grid-template-columns: minmax(0, 1fr) 240px; } }
.outline { font-size: var(--size-meta); position: sticky; top: 64px; align-self: start; }
.outline ol { list-style: none; padding: 0; margin: 0; }
.outline li { padding: var(--space-1) 0; }
.outline li[data-level="3"] { padding-left: var(--space-5); }
.lineage { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-4) 0; border-bottom: 1px solid var(--line); margin-bottom: var(--space-6); }
.lineage .hop { display: inline-flex; gap: var(--space-3); align-items: baseline; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: 1px var(--space-5); background: var(--raised); color: var(--ink); }
.lineage .hop.here { border-color: var(--accent); background: var(--accent-wash); }
.lineage .kind { font-size: var(--size-meta); color: var(--ink-3); }
.lineage .arrow { color: var(--ink-3); }
.strip-rail { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); list-style: none; padding: 0; margin: 0 0 var(--space-6); }
.strip-rail li { position: relative; padding-top: 18px; font-size: var(--size-meta); text-align: center; min-width: 0; }
.strip-rail li::before { content: ""; position: absolute; top: 6px; left: 0; right: 0; height: 1px; background: var(--line-2); }
.strip-rail li::after { content: ""; position: absolute; top: 1px; left: calc(50% - 5px); width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--ink-3); background: var(--canvas); }
.strip-rail li[data-state="written"]::after { border-color: var(--pass); background: var(--pass); }
.strip-rail li[data-current="yes"]::after { border-color: var(--accent); background: var(--accent); }
.strip-rail li[data-state="skipped"]::after, .strip-rail li[data-state="in-plan"]::after { border-style: dashed; border-color: var(--ink-4); }
.strip-rail a, .strip-rail .name { display: block; font-weight: var(--weight-name); font-size: var(--size-ui); color: var(--ink); }
.strip-rail .state { display: block; color: var(--ink-3); }
.strip-rail li[data-current="yes"] .state { color: var(--accent-ink); }
@media (max-width: 560px) {
  .strip-rail { grid-auto-flow: row; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
  .strip-rail li { text-align: left; padding: 0 0 0 20px; }
  .strip-rail li::before { display: none; }
  .strip-rail li::after { top: 5px; left: 0; }
  .strip-rail a, .strip-rail .name, .strip-rail .state { display: inline; margin-right: var(--space-4); }
}
.strip-segments { display: flex; gap: 3px; list-style: none; padding: 0; margin: 0; }
.strip-segments li { flex: 1; border-top: 3px solid var(--ink-3); padding-top: var(--space-2); font-size: var(--size-meta); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
.strip-segments li[data-state="written"] { border-color: var(--pass); }
.strip-segments li[data-current="yes"] { border-color: var(--accent); color: var(--accent-ink); font-weight: var(--weight-name); }
.strip-segments li[data-ahead="yes"] { border-color: var(--line-2); color: var(--ink-3); }
.strip-segments li[data-state="skipped"], .strip-segments li[data-state="in-plan"] { border-top-style: dotted; border-color: var(--ink-4); color: var(--ink-3); }
.strip-segments .name, .strip-segments .state { display: block; overflow: hidden; text-overflow: ellipsis; }
.strip-segments .state { font-weight: var(--weight-read); color: var(--ink-3); }
.desk > section { display: grid; gap: var(--space-5); }
.desk h2 { margin: var(--space-6) 0 0; }
.desk-head h1 { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: baseline; }
.desk-head .lede { margin: 0; }
.card-change, .close { display: grid; gap: var(--space-5); margin: 0; }
.card-change[data-state="waiting"] { border-color: var(--need); }
.card-eyebrow { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); align-items: baseline; margin: 0; }
.card-title { margin: 0; font-size: var(--size-reading); font-weight: var(--weight-name); line-height: 1.4; }
.card-title a, .card-eyebrow a { color: var(--ink); }
.close-why { margin: 0; color: var(--ink-3); }
.waiting { background: var(--need-wash); border-radius: var(--radius); padding: var(--space-3) var(--space-5); display: grid; gap: var(--space-2); }
.waiting p { margin: 0; }
.waiting-label { font-size: var(--size-meta); color: var(--ink-2); }
.waiting-question { color: var(--ink); }
.waiting-options { margin: 0; padding-left: 18px; }
.changed { display: grid; gap: var(--space-2); }
.changed p { margin: 0; }
.changed .folders { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.changed .folders li { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); font-size: var(--size-meta); }
.changed .folder { color: var(--ink); }
.changed .files { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); color: var(--ink-3); }
/* Lines added and removed: +n in add, −n in del, mono and tabular, with a bar of five blocks on the meter's track. */
.delta { display: inline-flex; align-items: center; gap: var(--space-3); font-family: var(--mono); font-size: var(--size-meta); letter-spacing: 0; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink-3); }
.add { color: var(--add); }
.del { color: var(--del); }
.delta-bar { display: inline-flex; gap: 1px; }
.delta-bar i { display: block; width: 6px; height: 6px; border-radius: 1px; background: var(--meter-track); }
.delta-bar i[data-kind="add"] { background: var(--add); }
.delta-bar i[data-kind="del"] { background: var(--del); }
.files-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); margin: 0; }
.files-line .folder-chip { font-family: var(--mono); font-size: var(--size-meta); letter-spacing: 0; color: var(--ink-2); background: var(--wash-2); border-radius: var(--radius-chip); padding: 0 var(--space-3); white-space: nowrap; }
.file-row { display: grid; grid-template-columns: minmax(0, 1fr) 56px 56px 40px; align-items: center; gap: var(--space-4); min-width: 0; flex: 1; font-variant-numeric: tabular-nums; }
.file-row .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: var(--size-meta); color: var(--ink); }
.file-row .add, .file-row .del { text-align: right; font-family: var(--mono); font-size: var(--size-meta); }
@media (max-width: 560px) { .file-row { grid-template-columns: minmax(0, 1fr) auto auto; } .file-row .delta-bar { display: none; } }
/* A quantity on the neutral meter, never the done green. */
.meter { display: inline-flex; height: 6px; width: 120px; max-width: 100%; border-radius: var(--radius-pill); background: var(--meter-track); overflow: hidden; vertical-align: middle; }
.meter > span { display: block; height: 100%; background: var(--meter); }
.offer { margin: 0; }
.three { display: grid; gap: var(--space-2); margin: 0; }
.three > div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: var(--space-4); }
.three dt { color: var(--ink-3); font-size: var(--size-meta); padding-top: var(--space-1); }
.three dd { margin: 0; }
.three dd a { color: var(--ink); }
.three > div[data-tone="fail"] dd a { color: var(--fail); }
.drift-line { margin: 0; }
.ideas { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-2); }
.ideas li { display: flex; gap: var(--space-5); align-items: baseline; }
.change-head { display: grid; gap: var(--space-4); margin-bottom: var(--space-5); }
.change-head h1 { margin: 0; }
.change-meta { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); align-items: baseline; margin: 0; color: var(--ink-3); font-size: var(--size-meta); }
.change-summary { display: grid; gap: var(--space-2); max-width: 72ch; }
.change-summary p { margin: 0; }
.summary-text { font-size: var(--size-reading); line-height: 1.6; color: var(--ink-2); }
.change-tabs a { display: inline-flex; gap: var(--space-3); align-items: center; }
/* A fold of one artefact: its head of facts, and once open its view, Read, Source or JSON, turned by the switch in the head. */
.fold { border-top: 1px solid var(--line); }
.fold > summary { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); align-items: center; padding: var(--space-3) var(--space-3) var(--space-3) 0; min-height: var(--height-row); color: var(--ink); border-radius: var(--radius); transition: background var(--quick); }
.fold > summary:hover { background: var(--wash); }
.fold > summary:focus-visible { outline: none; background: var(--wash-2); box-shadow: inset 2px 0 var(--accent); }
.fold-head { display: contents; }
.fold-line { color: var(--ink-3); font-size: var(--size-meta); }
.fold-open { padding: 0 0 var(--space-6) calc(var(--icon-small) + var(--space-5)); }
.fold-views { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: flex-end; margin: 0 0 var(--space-4); }
@media (min-width: 768px) {
  .fold[open] { position: relative; }
  .fold[open]:has(> .fold-open > .fold-views) > summary { padding-right: 216px; }
  .fold[open] > .fold-open > .fold-views { position: absolute; top: var(--space-2); right: 0; margin: 0; }
}
.fold-body { padding: 0 0 var(--space-4); }
.fold-open > .fold-body { padding: 0; }
/* The raw views: the source in mono on the well with its line numbers and Copy, the JSON pretty-printed with its address. */
.source-view, .json-view { display: grid; gap: var(--space-3); }
.source-view .source-tools, .json-view .source-tools { display: flex; gap: var(--space-4); align-items: center; font-size: var(--size-meta); color: var(--ink-3); }
.source-lines { margin: 0; padding: var(--space-4) var(--space-5); background: var(--sunk); border: 1px solid var(--line); border-radius: var(--radius); overflow-x: auto; white-space: pre; font-size: var(--size-meta); line-height: 1.55; color: var(--ink-2); counter-reset: line; }
.source-lines > span { display: block; counter-increment: line; }
.source-lines > span::before { content: counter(line); display: inline-block; width: 4ch; margin-right: var(--space-5); text-align: right; color: var(--ink-3); user-select: none; }
.folder-group { margin-top: var(--space-5); }
.folder-group .rows > li { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); align-items: baseline; }
.folder-group .rows > li[aria-current="true"] { background: var(--accent-wash); }
.diff-file { display: grid; gap: var(--space-4); margin-bottom: var(--space-5); }
.diff-file h3 { margin: 0; }
.diff-lines { margin: 0; padding: var(--space-4) 0; background: var(--sunk); border: 1px solid var(--line); border-radius: var(--radius); overflow-x: auto; white-space: pre; font-size: var(--size-meta); }
.diff-line { display: block; padding: 0 var(--space-5); }
.diff-line.add { background: var(--add-wash); box-shadow: inset 2px 0 var(--add-edge); color: var(--ink); }
.diff-line.del { background: var(--del-wash); box-shadow: inset 2px 0 var(--del-edge); color: var(--ink); }
.diff-line .sign { display: inline-block; width: 2ch; }
.diff-line.add .sign { color: var(--add); }
.diff-line.del .sign { color: var(--del); }
.record-fold { margin-top: var(--space-8); }
.next-line { margin: 0; }
.rail-block + .rail-block { margin-top: var(--space-7); }
.spine { display: grid; gap: var(--space-7); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1000px) { .spine { grid-template-columns: minmax(0, 1fr) 300px; } .spine-aside { position: sticky; top: 64px; align-self: start; } }
.step-block { border-top: 1px solid var(--line); padding: var(--space-5) 0; }
.step-block h3 { margin: 0 0 var(--space-3); display: flex; gap: var(--space-5); align-items: baseline; flex-wrap: wrap; }
.commit { display: grid; grid-template-columns: minmax(80px, auto) minmax(0, 1fr); gap: var(--space-1) var(--space-5); padding: var(--space-4) 0; border-bottom: 1px solid var(--line); }
.commit > .trailers, .commit > .runs, .commit > .commit-meta { grid-column: 2; }
.trailers { font-family: var(--mono); font-size: var(--size-meta); color: var(--ink-3); }
.runs { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-2); font-size: var(--size-meta); }
.runs li { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: baseline; }
.bands { display: grid; gap: var(--space-5); }
.band { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: var(--space-5); align-items: center; border-top: 1px solid var(--line); padding-top: var(--space-5); }
.band-name { font-family: var(--mono); font-size: var(--size-meta); color: var(--ink-3); }
.band-boxes { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.box { border: 1px solid var(--line-2); border-radius: var(--radius); padding: var(--space-3) var(--space-5); background: var(--raised); color: var(--ink); min-width: 0; }
.box .sub { display: block; font-size: var(--size-meta); color: var(--ink-3); }
.frame-map { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-4); align-items: start; }
.frame-map .node b { display: block; font-size: var(--size-meta); font-weight: var(--weight-title); font-family: var(--mono); }
.frame-map details.node[open] { grid-column: 1 / -1; border-color: var(--accent); background: var(--accent-wash); }
.frame-map .node.faint { border-style: dashed; border-color: var(--line-2); background: transparent; color: var(--ink-3); }
.frame-map .questions { margin: var(--space-4) 0 0; padding-left: 18px; display: grid; gap: var(--space-4); }
.frame-map .answers { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0 var(--space-4); margin: var(--space-2) 0; }
.frame-map .answers dt { color: var(--ink-3); }
.frame-map .answers dd { margin: 0; }
.frame-map .research { list-style: none; margin: var(--space-2) 0 0; padding: 0 0 0 var(--space-5); border-left: 2px solid var(--line-2); font-size: var(--size-meta); }
.restatement { white-space: pre-wrap; max-width: var(--measure); margin-top: var(--space-5); border-top: 1px solid var(--line); padding-top: var(--space-5); }
.map-outline { display: none; padding-left: 18px; }
@media (max-width: 560px) { .bands { display: none; } .map-outline { display: block; } }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-5); }
.filters { display: flex; flex-wrap: wrap; gap: var(--space-5); margin: var(--space-5) 0; }
.filter { display: grid; gap: var(--space-2); font-size: var(--size-meta); color: var(--ink-3); }
.entry-specimen { margin-bottom: var(--space-4); }
.gl-specimen { margin: 0; display: grid; gap: var(--space-3); }
.gl-specimen figcaption { font-size: var(--size-meta); color: var(--ink-3); }
.gl-pair { padding: var(--space-3) var(--space-4); border-radius: var(--radius); border: 1px solid var(--line); }
.gl-swatches { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.gl-swatch { width: 22px; height: 22px; border-radius: var(--radius-chip); border: 1px solid var(--line); }
.gl-type { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.gl-row { display: grid; gap: var(--space-2); }
.gl-slot { border: 1px dashed var(--line-2); border-radius: var(--radius-chip); padding: var(--space-3); font-size: var(--size-meta); color: var(--ink-3); min-height: var(--height-input); overflow-wrap: anywhere; }
.gl-tokens { margin: 0; padding-left: var(--space-6); font-size: var(--size-meta); color: var(--ink-3); }
.deal { display: grid; gap: var(--space-6); }
@media (min-width: 1100px) { .deal { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.direction.picked { outline: 2px solid var(--accent); outline-offset: 2px; }
.composites { display: flex; flex-wrap: wrap; gap: var(--space-4); margin: var(--space-4) 0; }
.composite { margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); position: relative; background: var(--canvas); }
.composite iframe { border: 0; display: block; }
.composite figcaption { position: absolute; left: var(--space-2); bottom: var(--space-1); font-size: var(--size-meta); color: var(--ink-3); background: var(--raised); padding: 0 var(--space-2); border-radius: var(--radius-chip); }
.tiles { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-4); }
.tile { border: 1px solid var(--line); border-radius: var(--radius-card); padding: var(--space-4); display: grid; gap: var(--space-2); background: var(--raised); overflow-wrap: anywhere; }
.swatch { display: block; height: 28px; border-radius: var(--radius-chip); border: 1px solid var(--line); }
.history { font-size: var(--size-meta); color: var(--ink-3); padding-left: 18px; }
.capture-tools { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; margin: var(--space-4) 0; }
.capture-stage { position: relative; width: 100%; margin: 0 0 var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--raised); overflow: hidden; }
.capture-stage img { display: block; width: 100%; height: auto; }
.capture-blank { width: 100%; background: var(--raised-2); }
.capture-layer { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
.capture-box { position: absolute; border: 1px solid var(--info); background: color-mix(in srgb, var(--info) 8%, transparent); pointer-events: none; }
.capture-box.selected { border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.capture-mark { position: absolute; border: 2px dashed var(--accent); pointer-events: none; }
.capture-stroke { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.capture-stroke polyline { fill: none; stroke: var(--accent); stroke-width: 3; vector-effect: non-scaling-stroke; }
.mark-form { display: grid; gap: var(--space-4); max-width: 640px; }
.mark-form label { display: grid; gap: var(--space-2); }
.mark-form textarea { font: inherit; min-height: 72px; }
.capture-now { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: end; }
.capture-now input { font: inherit; min-width: 0; width: min(100%, 360px); }
.before-after { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); margin: 0 0 var(--space-6); }
.before-after-side { margin: 0; }
.capture-window { position: absolute; left: 0; width: 100%; }
.capture-window img { width: 100%; height: 100%; }
.excerpt { white-space: pre-wrap; max-height: 240px; overflow: auto; }
.visual { margin: var(--space-6) 0; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--raised); padding: var(--space-5); }
.visual-image { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.visual-frame { display: block; width: 100%; height: 70vh; border: 0; background: var(--canvas); }
.progress { display: flex; height: 6px; border-radius: var(--radius-pill); overflow: hidden; background: var(--raised-3); max-width: 240px; }
.progress span[data-progress="done"] { background: var(--pass); }
.progress span[data-progress="meter"] { background: var(--meter); }
.progress span[data-progress="in progress"] { background: var(--accent); }
.ticket { border-top: 1px solid var(--line); padding: var(--space-5) 0; }
.ticket-fields { display: grid; gap: var(--space-5); }
@media (min-width: 760px) { .ticket-fields { grid-template-columns: 1fr 1fr; } }
.root-card { border: 1px solid var(--line); border-radius: var(--radius-card); padding: var(--space-5) var(--space-5); background: var(--raised); margin-bottom: var(--space-4); }
.roots-note { font-size: var(--size-meta); color: var(--ink-3); }
textarea, select, input[type="text"], input[type="search"], input:not([type]) { font: var(--weight-read) var(--size-ui)/1.6 var(--mono); letter-spacing: 0; color: var(--ink); background: var(--raised); border: 1px solid var(--line-2); border-radius: var(--radius); padding: var(--space-4) var(--space-5); min-height: var(--height-input); transition: border-color var(--quick); }
textarea:hover, select:hover, input:hover { border-color: var(--line-3); }
textarea:focus, select:focus, input:focus { border-color: var(--line-3); }
textarea { width: 100%; min-height: 200px; }
select { font-family: var(--sans); padding: 0 var(--space-4); }
.choices { display: flex; flex-wrap: wrap; gap: var(--space-3) 18px; }
.choices label { display: inline-flex; gap: var(--space-3); align-items: center; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--accent); }
.actions { display: flex; gap: var(--space-4); align-items: center; margin-top: var(--space-5); flex-wrap: wrap; }
.overlay { position: fixed; inset: 0; z-index: 20; background: color-mix(in srgb, var(--sunk) 70%, transparent); display: flex; align-items: flex-start; justify-content: center; padding: 12vh var(--gutter) var(--gutter); }
.palette { width: 100%; max-width: 640px; background: var(--raised); border: 1px solid var(--line-2); border-radius: var(--radius-float); box-shadow: 0 16px 48px var(--shade); overflow: hidden; }
.palette input { width: 100%; height: var(--height-bar); font: var(--weight-read) var(--size-reading) var(--sans); letter-spacing: var(--track-reading); border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 0 var(--space-6); background: transparent; color: var(--ink); }
.palette ul { list-style: none; margin: 0; padding: var(--space-3); max-height: 60vh; overflow: auto; }
.palette li { display: flex; gap: var(--space-5); align-items: center; min-height: var(--height-row); padding: 0 var(--space-4); border-radius: var(--radius); cursor: pointer; color: var(--ink); }
.palette li[aria-selected="true"] { background: var(--wash-2); }
.palette .group { min-height: 0; font-size: var(--size-meta); font-weight: var(--weight-name); color: var(--ink-3); padding: var(--space-4) var(--space-4) var(--space-1); cursor: default; }
.palette .kind { font-size: var(--size-meta); color: var(--ink-3); margin-left: auto; font-family: var(--mono); white-space: nowrap; }
.keys { width: 100%; max-width: 480px; background: var(--raised); border: 1px solid var(--line-2); border-radius: var(--radius-float); box-shadow: 0 16px 48px var(--shade); padding: var(--space-6); }
.catalogue { display: grid; gap: var(--space-7); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) { .catalogue { grid-template-columns: 200px minmax(0, 1fr); } .catalogue > nav { position: sticky; top: 64px; align-self: start; } }
.catalogue > nav a { display: block; padding: var(--space-1) 0; }
.specimen { border-top: 1px solid var(--line); padding: var(--space-5) 0 var(--space-2); }
.specimen-head { display: flex; gap: var(--space-5); align-items: baseline; flex-wrap: wrap; margin-bottom: var(--space-4); }
.specimen-head h2 { margin: 0; font-family: var(--mono); font-size: var(--size-ui); letter-spacing: 0; }
.fixture { border: 1px dashed var(--line-2); border-radius: var(--radius-card); padding: var(--space-5); margin-bottom: var(--space-5); overflow-x: auto; }
.fixture > .meta { display: block; margin-bottom: var(--space-3); }
.looks { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
.look-light, .look-dark { background: var(--canvas); color: var(--ink-2); border: 1px solid var(--line); border-radius: var(--radius-card); padding: var(--space-5); min-width: 0; }
.token-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.token-list li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-4); align-items: center; }
.token-chip { width: 32px; height: 20px; border-radius: var(--radius-chip); border: 1px solid var(--line); }
.token-list .mono { color: var(--ink); }
.type-scale { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-4); }
.type-scale li { display: grid; gap: var(--space-1); border-bottom: 1px solid var(--line); padding-bottom: var(--space-4); }
.type-scale li > :first-child { margin: 0; }
/* The second cut's pages (J-166 S1): one vocabulary of parts across the desk, the changes, the change page, interface, knowledge and practice. */
.when { font-variant-numeric: tabular-nums; white-space: nowrap; }
.meter-line { display: inline-flex; align-items: center; gap: var(--space-4); min-width: 0; }
.meter-line .meter { width: 96px; flex: none; }
.meter-count { min-width: 3ch; text-align: right; font-family: var(--mono); font-size: var(--size-meta); color: var(--ink-2); font-variant-numeric: tabular-nums; }
.sparkline { width: 60px; height: 16px; flex: none; vertical-align: middle; }
.sparkline polyline { fill: none; stroke: var(--ink-3); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.score-chips { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.score-chip { display: inline-flex; align-items: baseline; gap: var(--space-2); font-size: var(--size-meta); line-height: 20px; padding: 0 var(--space-3); border-radius: var(--radius-chip); background: var(--wash-2); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.score-chip .score-count { color: var(--ink); font-family: var(--mono); }
.score-chip[data-tone="fail"] { background: var(--fail-wash); }
.score-chip[data-tone="fail"] .score-count, .score-chip[data-tone="fail"] .score-name { color: var(--fail); }
.score-chip[data-tone="warn"] { background: var(--warn-wash); }
.score-chip[data-tone="warn"] .score-count, .score-chip[data-tone="warn"] .score-name { color: var(--warn); }
.check-badge { display: inline-flex; align-items: center; font-family: var(--mono); font-size: var(--size-meta); line-height: 20px; padding: 0 var(--space-3); border-radius: var(--radius-chip); background: var(--wash-2); color: var(--ink-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.check-badge[data-tone="pass"] { background: var(--pass-wash); color: var(--pass); }
.check-badge[data-tone="fail"] { background: var(--fail-wash); color: var(--fail); }
.step-cells { display: inline-grid; grid-template-columns: repeat(9, 6px); gap: 2px; height: 18px; align-items: end; flex: none; }
.step-cells .cell { height: max(2px, var(--h, 0%)); background: var(--ink-4); border-radius: 1px; }
.step-cells .cell[data-empty="yes"] { height: 2px; background: var(--line-2); }
.step-cells .cell[data-own="yes"] { background: var(--accent); }
.step-cells .cell[data-own="yes"][data-empty="yes"] { background: var(--accent); opacity: 0.4; }
.step-cells .cell.before { background: transparent; border: 1px dashed var(--line-3); }
.step-cells .cell.before[data-empty="yes"] { border-style: dotted; }
.choice { display: grid; gap: var(--space-4); }
.choice-tiles { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); }
.choice-tile { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: var(--raised); border: 1px solid var(--line-2); border-radius: var(--radius-card); color: var(--ink); cursor: default; }
label.choice-tile { cursor: pointer; grid-template-columns: auto auto minmax(0, 1fr); }
.choice-tile[data-picked="yes"] { border-color: var(--accent); background: var(--accent-wash); }
.choice-number { font-family: var(--mono); font-size: var(--size-meta); color: var(--ink-3); min-width: 2ch; }
.choice-act { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; margin: 0; }
.dot-sep { color: var(--ink-3); }
.fact-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); margin: 0; font-size: var(--size-meta); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.fact-line .fact { display: inline-flex; align-items: center; gap: var(--space-3); }
/* The desk: the briefing in one column, beside it at 1200 px and wider what moved, what needs care and the discussions. */
.desk { display: grid; gap: var(--space-7); grid-template-columns: minmax(0, 1fr); max-width: none; }
.desk-brief, .desk-aside { display: grid; gap: var(--space-6); align-content: start; min-width: 0; }
.desk-brief > section { display: grid; gap: var(--space-5); }
.desk-aside > section > .section-head:first-child { margin-top: 0; }
@media (min-width: 1200px) {
  .desk { grid-template-columns: minmax(0, 760px) minmax(0, 320px); justify-content: start; column-gap: var(--space-8); }
  .desk-aside { position: sticky; top: calc(var(--height-bar) + var(--space-6)); align-self: start; }
}
.desk-head h1.desk-title { font-size: var(--size-desk); letter-spacing: var(--track-desk); }
.desk-cards { display: grid; gap: var(--space-5); }
.close-list { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; }
.close-list > .fold { border-top: 1px solid var(--line); padding: 0 var(--space-5); }
.close-list > .fold:first-child { border-top: 0; }
.close-card > summary { flex-wrap: nowrap; min-height: var(--height-row); }
.close-card > summary .fold-head { display: contents; }
.close-card .title { flex: none; }
.close-card .close-why { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
.close-card .close-facts { display: inline-flex; align-items: center; gap: var(--space-4); flex: none; margin-left: auto; }
.close-card .close-facts .fact { display: inline-flex; gap: var(--space-3); align-items: center; font-size: var(--size-meta); color: var(--ink-3); }
.close-card[open] > summary .close-why { visibility: hidden; }
.care .group { margin: 0; }
.care .group-head .group-title { font-weight: var(--weight-read); }
.close-open { display: grid; gap: var(--space-3); }
.close-open p { margin: 0; }
.close-checked[data-tone="fail"] { color: var(--fail); }
@container (max-width: 640px) { .close-card > summary { flex-wrap: wrap; } .close-card .close-why { flex-basis: 100%; order: 3; } }
@media (max-width: 640px) { .close-card > summary { flex-wrap: wrap; } .close-card .close-why { flex-basis: 100%; order: 3; white-space: normal; } .close-card .close-facts { margin-left: 0; } }
.since-words { margin: 0 0 var(--space-4); color: var(--ink-2); }
.care-lines { list-style: none; margin: var(--space-4) 0 0; padding: 0; display: grid; gap: var(--space-3); }
.care-lines li { display: flex; gap: var(--space-4); align-items: baseline; }
.care-lines li a { color: var(--ink); }
.care-lines .word::before { margin-top: 2px; }
.card-change .group { margin: 0; }
/* The changes list: a row's mark, name and sentence, its steps or its size, its commits and its time. */
.list-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4) var(--space-6); margin: 0 0 var(--space-5); }
.list-tools .filter-bar { margin: 0; }
.rows > li.change-row { grid-template-columns: 120px minmax(0, 1fr) 184px 84px 112px; grid-template-areas: "state main strip commits age"; }
/* In a group of finished changes, already headed by its day, the mark alone carries the state; the word stays for a reader of the page. */
.rows > li.change-row[data-state="done"], .rows > li.change-row[data-state="dropped"] { grid-template-columns: 22px minmax(0, 1fr) 184px 84px 112px; }
.change-row[data-state="done"] .cell-state .word, .change-row[data-state="dropped"] .cell-state .word { font-size: 0; gap: 0; }
.change-row .cell-commits { grid-area: commits; text-align: right; white-space: nowrap; }
.row-size { display: inline-flex; align-items: center; gap: var(--space-4); white-space: nowrap; }
@container (max-width: 860px) {
  .rows > li.change-row, .rows > li.change-row[data-state="done"], .rows > li.change-row[data-state="dropped"] { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "state age" "main main" "strip commits"; }
  .change-row[data-state="done"] .cell-state .word, .change-row[data-state="dropped"] .cell-state .word { font-size: var(--size-meta); gap: var(--space-3); }
}
button.chip[data-count="zero"]:not([aria-pressed="true"]) { color: var(--ink-3); border-color: transparent; border-style: solid; background: transparent; opacity: 0.7; }
/* The change page: the head's facts as chips, its times, the sentence it opens on, the outcome card, the banner, the tabs' parts. */
.fact-chip { display: inline-flex; align-items: center; font-size: var(--size-meta); line-height: 20px; padding: 0 var(--space-3); border-radius: var(--radius-chip); background: var(--wash-2); color: var(--ink-2); white-space: nowrap; }
.fact-chip[data-tone="warn"] { background: var(--warn-wash); color: var(--warn); }
.change-times { margin: 0; }
.change-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-5); align-items: baseline; max-width: var(--measure); }
.summary-label { font-size: var(--size-key); font-weight: var(--weight-title); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); }
.change-summary .summary-text .prose { font-size: var(--size-reading); }
.change-summary .summary-text p { margin: 0; }
.outcome-card { display: grid; background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; margin: var(--space-5) 0; }
.outcome-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: var(--space-5); align-items: center; min-height: var(--height-row); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--line); color: var(--ink); }
.outcome-row:first-child { border-top: 0; }
.outcome-row:hover { background: var(--wash); text-decoration: none; }
.outcome-label { font-size: var(--size-meta); color: var(--ink-3); }
.outcome-body { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); min-width: 0; }
.outcome-go { color: var(--ink-3); }
.waiting-banner { margin: var(--space-5) 0; padding: var(--space-5) var(--space-6); border: 1px solid var(--need); }
.glyph { display: inline-block; width: 1.2em; text-align: center; color: var(--ink-3); font-size: var(--size-meta); }
.glyph[data-state="written"] { color: var(--pass); }
.glyph[data-state="now"] { color: var(--accent-ink); }
.chip-depth { font-size: var(--size-meta); line-height: 18px; padding: 0 var(--space-3); border-radius: var(--radius-chip); background: var(--wash-2); color: var(--ink-3); white-space: nowrap; }
.step-folds > .fold:first-child { border-top: 0; }
.step-evidence { margin: var(--space-5) 0 0; border-left: 2px solid var(--line); padding-left: var(--space-5); }
.skill-chip { display: inline-flex; gap: var(--space-2); align-items: baseline; font-family: var(--mono); font-size: var(--size-meta); padding: 0 var(--space-3); border-radius: var(--radius-chip); background: var(--wash-2); color: var(--ink-2); margin-right: var(--space-2); font-weight: var(--weight-read); }
.skill-count { color: var(--ink-3); }
.fold-open .group { margin-top: var(--space-5); }
.commit-row .hash { color: var(--ink-3); }
.commit-more > summary { margin-top: var(--space-1); }
.commit-same { margin: var(--space-2) 0; font-size: var(--size-meta); color: var(--ink-3); }
.command-line { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; }
.command-line code { overflow-wrap: anywhere; }
.diff-head { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; justify-content: space-between; }
.diff-head .fold-views { margin: 0; }
.diff-lines.numbered .num { display: inline-block; width: 4ch; margin-right: var(--space-3); text-align: right; color: var(--ink-3); user-select: none; }
.diff-gap { display: block; }
.diff-gap > summary { display: block; padding: 0 var(--space-5); color: var(--ink-3); background: var(--wash); }
.decided .decisions > li { gap: var(--space-2); }
.owner-words q { color: var(--ink); }
.owner-words { margin: 0; }
.restatement { white-space: normal; }
.close-rows > li .title { min-width: 7ch; }
/* Interface: a card per page, its picture or the wireframe its boxes draw, its scores and its history folded. */
.page-cards { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); margin: var(--space-4) 0 var(--space-6); }
.page-card { display: grid; gap: var(--space-4); align-content: start; min-width: 0; padding: var(--space-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); }
.page-card-head { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: baseline; justify-content: space-between; }
.page-card-head .title { color: var(--ink); }
.page-card a, .home-card a, .tile a, .outcome-card a, .care-lines a, .close-list a { color: var(--ink); }
.page-card a:hover, .home-card a:hover, .tile a:hover, .care-lines a:hover, .close-list a:hover { text-decoration: underline; }
.prose th { white-space: nowrap; }
/* On a phone the rail stays one line of stations, each name small, the step now's word under it. */
@media (max-width: 560px) {
  .strip-rail { grid-auto-flow: column; grid-template-columns: none; gap: 0; }
  .strip-rail li { text-align: center; padding: 18px 0 0; }
  .strip-rail li::before { display: block; }
  .strip-rail li::after { top: 1px; left: calc(50% - 5px); }
  .strip-rail a, .strip-rail .name { display: block; margin: 0; font-size: var(--size-key); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .strip-rail .state { display: none; }
  .strip-rail li[data-current="yes"] .state { display: block; margin: 0; }
}
.page-card p { margin: 0; }
.page-card .group { margin: 0; }
.thumb { aspect-ratio: 16 / 10; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--sunk); }
.thumb img { display: block; width: 100%; height: auto; }
.thumb.pending { background: var(--raised-2); }
.thumb.facts-card { display: grid; align-content: center; gap: var(--space-2); padding: var(--space-5); aspect-ratio: auto; min-height: 120px; }
.box-wire { margin: 0; display: grid; gap: var(--space-3); }
.box-wire svg { display: block; width: 100%; height: auto; background: var(--canvas); }
.box-wire rect.page { fill: var(--canvas); stroke: none; }
.box-wire rect[data-kind="box"] { fill: none; stroke: var(--line-2); stroke-width: 1; vector-effect: non-scaling-stroke; }
.box-wire rect[data-kind="landmark"] { fill: var(--raised-2); stroke: var(--line-2); stroke-width: 1; vector-effect: non-scaling-stroke; }
.box-wire rect[data-kind="control"] { fill: none; stroke: var(--accent-ink); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.box-wire rect[data-kind="text"] { fill: var(--line-2); stroke: none; }
.thumb .box-wire svg { height: 100%; }
.behind { display: inline-flex; gap: var(--space-2); align-items: baseline; flex-wrap: wrap; }
.history-rows > li { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); align-items: baseline; }
.captures-pointer { margin-top: var(--space-5); }
.capture-work { display: grid; gap: var(--space-6); grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 1024px) { .capture-work { grid-template-columns: minmax(0, 1fr) 320px; } .capture-side { position: sticky; top: calc(var(--height-bar) + var(--space-6)); } }
.capture-side .section-head:first-child { margin-top: 0; }
.capture-picture, .capture-wire { position: relative; width: 100%; overflow: hidden; background: var(--canvas); }
.capture-picture img { display: block; width: 100%; height: auto; }
.capture-wire .box-wire svg { height: 100%; }
.capture-layer { touch-action: pan-y; }
.capture-layer.drawing { touch-action: none; }
.capture-mark .pin, .note-pins .pin { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--accent); color: var(--on-accent); font-size: var(--size-key); font-weight: var(--weight-title); }
.capture-mark .pin { position: absolute; top: -9px; left: -9px; }
.capture-views { margin-left: auto; }
.capture-again { display: grid; gap: var(--space-3); margin: var(--space-5) 0; }
/* Knowledge: a card per home, the policy read and edited in place. */
.home-cards { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
.home-card { display: grid; gap: var(--space-2); align-content: start; padding: var(--space-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-card); }
.home-card .title { color: var(--ink); }
.home-card p { margin: 0; }
.home-card[data-present="no"] { background: transparent; border-style: dashed; }
.home-card[data-present="no"] .title, .home-card[data-present="no"] .home-question { color: var(--ink-3); }
.home-question { color: var(--ink-2); }
.policy-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); justify-content: space-between; }
.policy-head .section-head { flex: 1; }
.policy-head .fold-views { margin: var(--gap-section) 0 var(--gap-head); }
.policy-panes { display: grid; gap: var(--space-5); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) { .policy-panes { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.policy-panes textarea { min-height: 320px; }
.policy-preview { border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-4) var(--space-5); background: var(--raised); overflow: auto; max-height: 520px; }
.consequence { margin: var(--space-5) 0 0; color: var(--ink-2); }
.rulings > li { display: block; }
/* Practice: one sentence of health, its groups with the act that clears each, the two tiles. */
.health-sentence { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: baseline; font-size: var(--size-reading); color: var(--ink); }
.health-act { margin: var(--space-4) var(--space-5); }
.tiles-two { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); margin: var(--space-6) 0; }
.tile .section-head { margin-top: 0; }
.kind-bars { display: grid; gap: var(--space-2); margin: var(--space-4) 0; }
.kind-bars > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: var(--space-4); align-items: center; }
.kind-bars dt { font-size: var(--size-meta); color: var(--ink-3); }
.kind-bars dd { margin: 0; display: flex; gap: var(--space-4); align-items: center; }
.tile-facts { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
/* The roster: a row per skill, its sentence, its loads on the meter, its cells over the line, off its step and its last load. */
.roster-kind .listbox { container-type: inline-size; }
.kind-sentence { max-width: var(--measure); }
.roster-kind .listbox > .fold { padding: 0 var(--space-5); border-top: 1px solid var(--line); }
.roster-kind .listbox > .fold:first-child { border-top: 0; }
.roster-row { display: grid; grid-template-columns: minmax(120px, 160px) minmax(0, 1fr) 140px 74px 100px 92px; gap: var(--space-5); align-items: center; flex: 1; min-width: 0; }
.roster-name { display: inline-flex; gap: var(--space-3); align-items: baseline; min-width: 0; overflow: hidden; }
.roster-sentence { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-3); }
.roster-off, .roster-last { text-align: right; white-space: nowrap; }
@container (max-width: 760px) {
  .roster-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name last" "sentence sentence" "meter cells" "off off"; }
  .roster-name { grid-area: name; } .roster-last { grid-area: last; } .roster-sentence { grid-area: sentence; white-space: normal; } .roster-row .meter-line { grid-area: meter; } .roster-row .step-cells { grid-area: cells; justify-self: end; } .roster-off { grid-area: off; text-align: left; }
}
.never-list { display: grid; gap: var(--space-2); }
.by-step { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: end; }
/* The installation as a form: a label beside each setting, the skills by kind, the sticky bar of pending changes. */
.form-rows { display: grid; gap: var(--space-6); }
.form-row { display: grid; gap: var(--space-3) var(--space-6); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 768px) { .form-row { grid-template-columns: 200px minmax(0, 1fr); } }
.form-label { font-weight: var(--weight-name); color: var(--ink); }
.skill-picks > li { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); align-items: baseline; }
.skill-choices .group { margin: 0 0 var(--space-3); }
.sync-banner { display: grid; gap: var(--space-3); padding: var(--space-5); margin: 0 0 var(--space-6); border: 1px solid var(--need); background: var(--need-wash); border-radius: var(--radius-card); color: var(--ink); }
.sync-banner p { margin: 0; }
.pending-bar { position: sticky; bottom: 0; z-index: 4; display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: center; justify-content: space-between; margin: var(--space-6) calc(-1 * var(--space-2)) 0; padding: var(--space-4) var(--space-5); background: var(--raised); border: 1px solid var(--line-2); border-radius: var(--radius-card); }
.pending-bar p { margin: 0; }
.pending-bar .actions { margin: 0; }
@media (max-width: 767px) { .pending-bar { bottom: calc(var(--height-foot) + var(--safe-bottom)); } }
/* The map: a drifted box's warn edge, its summary on hover and focus; a journey as a numbered path. */
.box[data-tier="drifting"], .box[data-tier="stale"] { box-shadow: inset 3px 0 var(--warn); }
.box .box-summary { display: none; font-size: var(--size-meta); color: var(--ink-2); max-width: 32ch; margin-top: var(--space-2); }
.box:hover .box-summary, .box:focus-visible .box-summary { display: block; }
.journey-path { margin: 0 0 var(--space-5); padding-left: 22px; display: grid; gap: var(--space-2); }
.promoted-strip { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; padding: var(--space-3) var(--space-5); background: var(--pass-wash); border-radius: var(--radius); }
.discussion-section .prose { margin-bottom: var(--space-5); }
`;

/**
 * The shell's page: the tokens, the fonts embedded, the components' style
 * and the client app's one script.
 * @returns the HTML document
 */
export function renderShellPage(): string {
  const fonts =
    `@font-face { font-family: "Geist"; src: url(data:font/woff2;base64,${GEIST_SANS_BASE64}) format("woff2"); font-weight: 100 900; font-display: block; }\n` +
    `@font-face { font-family: "Geist Mono"; src: url(data:font/woff2;base64,${GEIST_MONO_BASE64}) format("woff2"); font-weight: 100 900; font-display: block; }`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>greenline</title><link rel="icon" href="${ICON}"><style>${fonts}${TOKENS}${COMPONENT_STYLE}</style></head>` +
    `<body><div id="app"><noscript><p class="page">The inspector is an app: it needs JavaScript, which runs from this local server only.</p></noscript></div>` +
    `<script type="module" src="/${CLIENT_ASSET}"></script></body></html>`
  );
}
