import { contrastRatio, parseColour } from "./colour.ts";
import type { DesignDocument } from "./design-file.ts";
import { safeColour, safeLength, safeWeight } from "./style-values.ts";
import {
  roleFields,
  sketchRows,
  type CatalogEntry,
  type CatalogTokens,
  type ContrastPair,
  type Direction,
  type TokenFields,
  type TokenValue,
} from "./interface-catalog.ts";
import type { Register } from "./interface-facets.ts";

/**
 * The deal's composites and the home's specimen (J-123 S7;
 * `workshop/components/interface-catalog.md`, "The deal"): a direction drawn
 * on its register's specimen page, a site's nav, hero, sections, form and
 * footer or an app's shell, KPI strip, table, form and settings, in its
 * palette's and its type's tokens with its composition's and its job's
 * sketches as the wireframe; and DESIGN.md read as a catalog entry, so the
 * workspace's own system renders as a specimen. Each is a whole page from
 * the data alone: no script, no font or image fetched, every value from the
 * data checked before it enters a style.
 */

/** The colour roles a composite paints with. */
interface Roles {
  readonly ground: string;
  readonly raised: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly rule: string;
}

/** The names a role is read from, in order. */
const ROLE_NAMES: ReadonlyMap<keyof Roles, readonly string[]> = new Map<
  keyof Roles,
  readonly string[]
>([
  ["ground", ["ground", "page", "paper", "canvas", "ground-light", "background", "surface"]],
  ["raised", ["raised", "surface", "card", "surface-2", "tint", "subtle", "ground-2"]],
  ["ink", ["ink", "body", "text", "foreground"]],
  ["muted", ["muted", "ink-2", "grey", "ink-70", "subtle-ink", "secondary"]],
  ["accent", ["accent", "primary", "action", "highlight", "orange"]],
  ["onAccent", ["on-accent", "ink-on-accent", "accent-ink"]],
  ["rule", ["rule", "border", "line", "hairline"]],
]);

/** The generic family a described face reads as, since no face is fetched. */
function familyOf(description: TokenValue | undefined): string {
  const text = String(description ?? "").toLowerCase();
  if (/mono/.test(text)) return "ui-monospace, monospace";
  if (/serif/.test(text) && !/sans/.test(text)) return "Georgia, 'Times New Roman', serif";
  return "system-ui, -apple-system, 'Segoe UI', sans-serif";
}

/** The first colour a palette holds under a role's names, for a scheme. */
function roleColour(
  colours: { readonly [name: string]: string },
  role: keyof Roles,
  dark: boolean,
): string | undefined {
  for (const name of ROLE_NAMES.get(role) ?? []) {
    const candidates = dark ? [`dark-${name}`, `${name}-dark`] : [name];
    for (const candidate of candidates) {
      const found = safeColour(colours[candidate]);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Whether a palette holds a dark scheme beside its light one. */
function holdsDarkScheme(colours: { readonly [name: string]: string }): boolean {
  return (
    roleColour(colours, "ground", true) !== undefined &&
    roleColour(colours, "ink", true) !== undefined
  );
}

/** The ink that reads best on a ground, black or white. */
function inkOn(ground: string): string {
  const colour = parseColour(ground);
  if (colour === undefined) return "#111111";
  const white = parseColour("#ffffff");
  const black = parseColour("#111111");
  if (white === undefined || black === undefined) return "#111111";
  return contrastRatio(white, colour) >= contrastRatio(black, colour) ? "#ffffff" : "#111111";
}

/** The roles of a palette for a scheme, the neutral defaults filling what it does not name. */
function rolesOf(colours: { readonly [name: string]: string }, dark: boolean): Roles {
  const ground = roleColour(colours, "ground", dark) ?? (dark ? "#121212" : "#ffffff");
  const ink = roleColour(colours, "ink", dark) ?? inkOn(ground);
  const accent = roleColour(colours, "accent", dark) ?? ink;
  return {
    ground,
    raised: roleColour(colours, "raised", dark) ?? ground,
    ink,
    muted: roleColour(colours, "muted", dark) ?? ink,
    accent,
    onAccent: roleColour(colours, "onAccent", dark) ?? inkOn(accent),
    rule:
      roleColour(colours, "rule", dark) ?? (dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)"),
  };
}

/** A typography role's fields, where it is a group of them. */
function fieldsOf(group: TokenFields | undefined): { readonly [field: string]: TokenValue } {
  return group === undefined ? {} : (roleFields(group) ?? {});
}

/** The type a composite sets: the display and the body, size, weight, leading and face. */
interface TypeRoles {
  readonly displaySize: string;
  readonly displayWeight: string;
  readonly displayLeading: string;
  readonly bodySize: string;
  readonly family: string;
}

function typeOf(tokens: CatalogTokens | undefined): TypeRoles {
  const typography = tokens?.typography ?? {};
  const display = fieldsOf(
    typography["display"] ?? typography["h1"] ?? typography["title"] ?? typography["heading"],
  );
  const body = fieldsOf(typography["body"]);
  const face =
    display["fontFamily"] ??
    body["fontFamily"] ??
    (String(typography["family"] ?? "") || undefined);
  return {
    displaySize: safeLength(display["fontSize"], "48px"),
    displayWeight: safeWeight(display["fontWeight"], 600),
    displayLeading: String(Number(display["lineHeight"]) > 0 ? Number(display["lineHeight"]) : 1.1),
    bodySize: safeLength(body["fontSize"], "16px"),
    family: familyOf(face),
  };
}

/** The corner a material rounds its controls to. */
function radiusOf(tokens: CatalogTokens | undefined): string {
  const rounded = tokens?.rounded ?? {};
  return safeLength(
    rounded["control"] ?? rounded["md"] ?? rounded["card"] ?? Object.values(rounded)[0],
    "6px",
  );
}

/** HTML's special characters escaped. */
function escaped(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One slot of a wireframe drawn as what it holds. */
function slotHtml(slot: string): string {
  const name = slot.toLowerCase();
  const label = `<span class="label">${escaped(slot)}</span>`;
  if (/claim/.test(name))
    return `<div class="slot claim"><h1>A claim in one line</h1><p class="lead">What it does for whom, in a sentence.</p>${/action/.test(name) ? '<a class="action">Start</a>' : ""}${label}</div>`;
  if (/form/.test(name))
    return `<div class="slot"><form><label>Email<input value="name@example.com" /></label><a class="action">Continue</a></form>${label}</div>`;
  if (/action/.test(name)) return `<div class="slot"><a class="action">Start</a>${label}</div>`;
  if (/image|photo|picture|mark|visual/.test(name))
    return `<div class="slot picture">${label}</div>`;
  if (/list|proof|pricing|navigation|table/.test(name))
    return `<div class="slot"><ul><li>First item</li><li>Second item</li><li>Third item</li></ul>${label}</div>`;
  return `<div class="slot"><h2>A heading</h2><p>A short paragraph of plain words.</p>${label}</div>`;
}

/** A sketch's rows as wireframe rows. */
function rowsHtml(sketch: readonly string[]): string {
  return sketchRows(sketch)
    .map((row) => {
      const columns = row.spans.map((span) => `${String(span)}fr`).join(" ");
      const slots =
        row.slots.length === row.spans.length
          ? row.slots
          : [
              ...row.slots,
              ...Array.from(
                { length: Math.max(0, row.spans.length - row.slots.length) },
                () => "content",
              ),
            ];
      return `<section class="row" style="grid-template-columns:${columns}">${slots.slice(0, Math.max(row.spans.length, 1)).map(slotHtml).join("")}</section>`;
    })
    .join("\n");
}

/** The site's specimen page around a direction's wireframe. */
function siteBody(sketch: readonly string[]): string {
  return `<nav><strong>Name</strong><span class="links">Product · Pricing · Docs</span><a class="action">Start</a></nav>
<main>
${rowsHtml(sketch)}
<section class="row" style="grid-template-columns:1fr"><div class="slot"><h2>Stay in touch</h2><form><label>Email<input value="name@example.com" /></label><a class="action">Subscribe</a></form></div></section>
</main>
<footer><span>Name</span><span class="links">About · Careers · Legal</span></footer>`;
}

/** The app's specimen page around a direction's wireframe. */
function appBody(sketch: readonly string[]): string {
  return `<div class="shell"><aside><strong>Name</strong><ul><li class="on">Overview</li><li>Projects</li><li>Reports</li><li>Settings</li></ul></aside>
<main>
<header><h1>Overview</h1><a class="action">New project</a></header>
<section class="kpis"><div><span>Active</span><b>128</b></div><div><span>Due</span><b>14</b></div><div><span>Late</span><b>3</b></div><div><span>Done</span><b>412</b></div></section>
${rowsHtml(sketch)}
<table><thead><tr><th>Project</th><th>Owner</th><th>Due</th><th class="n">Hours</th></tr></thead><tbody><tr><td>Billing</td><td>Ana</td><td>12 May</td><td class="n">32</td></tr><tr><td>Search</td><td>Ben</td><td>20 May</td><td class="n">18</td></tr><tr><td>Exports</td><td>Chi</td><td>2 Jun</td><td class="n">7</td></tr></tbody></table>
<section class="settings"><h2>Settings</h2><label>Name<input value="Billing" /></label><label class="switch"><input type="checkbox" checked /> Notify the owner</label><a class="action">Save</a></section>
</main></div>`;
}

/**
 * A page drawn in a palette, a type and a material's tokens around a wireframe.
 * @param tokens the tokens it paints with, the parts' merged
 * @param sketch the wireframe's lines
 * @param register the register, whose specimen page it is
 * @param dark whether the dark scheme is drawn
 * @param title the page's title
 * @returns the whole page
 */
function pageHtml(
  tokens: CatalogTokens,
  sketch: readonly string[],
  register: Register,
  dark: boolean,
  title: string,
): string {
  const roles = rolesOf(tokens.colors ?? {}, dark);
  const type = typeOf(tokens);
  const radius = radiusOf(tokens);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escaped(title)}</title>
<style>
:root { --ground: ${roles.ground}; --raised: ${roles.raised}; --ink: ${roles.ink}; --muted: ${roles.muted}; --accent: ${roles.accent}; --on-accent: ${roles.onAccent}; --rule: ${roles.rule}; --radius: ${radius}; color-scheme: ${dark ? "dark" : "light"}; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font-family: ${type.family}; font-size: ${type.bodySize}; line-height: 1.5; }
h1 { font-size: ${type.displaySize}; font-weight: ${type.displayWeight}; line-height: ${type.displayLeading}; margin: 0 0 12px; }
h2 { font-size: 1.4em; margin: 0 0 8px; }
nav, footer, header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; }
nav { border-bottom: 1px solid var(--rule); }
footer { border-top: 1px solid var(--rule); color: var(--muted); margin-top: 32px; }
.links { color: var(--muted); }
main { padding: 0 24px; }
.row { display: grid; gap: 16px; padding: 24px 0; }
.slot { position: relative; background: var(--raised); border: 1px solid var(--rule); border-radius: var(--radius); padding: 16px; min-height: 96px; }
.slot.picture { min-height: 220px; background: repeating-linear-gradient(45deg, var(--raised), var(--raised) 12px, var(--ground) 12px, var(--ground) 24px); }
.slot .label { position: absolute; right: 8px; bottom: 6px; font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.lead { color: var(--muted); font-size: 1.15em; }
.action { display: inline-block; background: var(--accent); color: var(--on-accent); padding: 10px 18px; border-radius: var(--radius); font-weight: 600; text-decoration: none; }
form, .settings { display: grid; gap: 12px; max-width: 420px; }
label { display: grid; gap: 4px; color: var(--muted); font-size: 0.9em; }
input { font: inherit; color: var(--ink); background: var(--ground); border: 1px solid var(--rule); border-radius: var(--radius); padding: 10px 12px; }
.shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
aside { border-right: 1px solid var(--rule); padding: 16px; }
aside ul { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 4px; }
aside li { padding: 6px 10px; border-radius: var(--radius); color: var(--muted); }
aside li.on { background: var(--raised); color: var(--ink); }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.kpis div { border: 1px solid var(--rule); border-radius: var(--radius); padding: 12px; display: grid; }
.kpis span { color: var(--muted); font-size: 0.85em; }
.kpis b { font-size: 1.6em; font-variant-numeric: tabular-nums; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--rule); }
th { color: var(--muted); font-weight: 500; }
.n { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 700px) {
  .row { grid-template-columns: 1fr !important; }
  .shell { grid-template-columns: 1fr; }
  aside { border-right: 0; border-bottom: 1px solid var(--rule); }
  .kpis { grid-template-columns: repeat(2, 1fr); }
  nav .links, footer .links { display: none; }
}
</style>
</head>
<body>
${register === "app" ? appBody(sketch) : siteBody(sketch)}
</body>
</html>
`;
}

/** The tokens of a direction's parts merged, a later part's group adding to an earlier one's. */
function mergedTokens(entries: readonly CatalogEntry[]): CatalogTokens {
  const merge = <T>(
    pick: (tokens: CatalogTokens) => { readonly [name: string]: T } | undefined,
  ): { readonly [name: string]: T } =>
    Object.assign(
      {},
      ...entries.map((entry) => (entry.tokens === undefined ? {} : (pick(entry.tokens) ?? {}))),
    );
  return {
    colors: merge((tokens) => tokens.colors),
    typography: merge((tokens) => tokens.typography),
    rounded: merge((tokens) => tokens.rounded),
    spacing: merge((tokens) => tokens.spacing),
    components: merge((tokens) => tokens.components),
    motion: merge((tokens) => tokens.motion),
  };
}

/** A direction's composite in one scheme or both. */
export interface Composite {
  readonly light: string;
  /** The dark scheme, where the palette holds one; null where it does not. */
  readonly dark: string | null;
}

/**
 * A direction drawn on its register's specimen page: the material's and
 * the type's tokens first, the palette's over them, the composition's
 * sketch and then the job's anatomy as the wireframe.
 * @param direction the direction dealt
 * @param register the register
 * @returns the page in light and, where the palette holds one, dark
 */
export function compositeOf(direction: Direction, register: Register): Composite {
  const order = ["material", "type", "motion", "palette"] as const;
  const painted = order.flatMap((role) =>
    direction.parts.filter((part) => part.role === role).map((part) => part.entry),
  );
  const tokens = mergedTokens(painted);
  const sketch = [
    ...direction.parts
      .filter((part) => part.role === "composition")
      .flatMap((part) => part.entry.sketch ?? []),
    ...direction.parts
      .filter((part) => part.role === "anatomy")
      .flatMap((part) => (part.entry.sketch ?? []).slice(1)),
  ];
  const title = `Direction: ${direction.name}`;
  return {
    light: pageHtml(tokens, sketch, register, false, title),
    dark: holdsDarkScheme(tokens.colors ?? {})
      ? pageHtml(tokens, sketch, register, true, title)
      : null,
  };
}

/** The pairs a home's specimen shows: each ink role on each ground role it names. */
function homePairs(colours: { readonly [name: string]: string }): readonly ContrastPair[] {
  const grounds = ["ground", "page", "paper", "surface", "background"].filter(
    (name) => colours[name] !== undefined,
  );
  const inks = ["ink", "body", "text", "muted", "accent", "primary"].filter(
    (name) => colours[name] !== undefined,
  );
  return grounds.flatMap((ground) =>
    inks.flatMap((ink): ContrastPair[] => {
      const one = parseColour(colours[ink] ?? "");
      const other = parseColour(colours[ground] ?? "");
      return one === undefined || other === undefined
        ? []
        : [{ ink, ground, use: "text", ratio: contrastRatio(one, other) }];
    }),
  );
}

/**
 * DESIGN.md read as a catalog entry, so the workspace's own system renders
 * as a specimen and on its register's page.
 * @param design the home
 * @returns the entry
 */
export function homeEntry(design: DesignDocument): CatalogEntry {
  const pairs = (
    list: readonly { readonly name: string; readonly value: string }[],
  ): { readonly [name: string]: string } =>
    Object.fromEntries(list.map((token) => [token.name, token.value]));
  const groups = (
    list: readonly {
      readonly name: string;
      readonly fields: readonly { readonly name: string; readonly value: string }[];
    }[],
  ): { readonly [name: string]: TokenFields } =>
    Object.fromEntries(list.map((token) => [token.name, pairs(token.fields)]));
  const colors = pairs(design.tokens.colors);
  return {
    id: "design-md",
    kind: "material",
    register: "both",
    platform: [],
    facets: {},
    tokens: {
      colors,
      typography: groups(design.tokens.typography),
      rounded: pairs(design.tokens.rounded),
      spacing: pairs(design.tokens.spacing),
      components: groups(design.tokens.components),
    },
    contrast: homePairs(colors),
    words: design.name ?? "DESIGN.md",
    provenance: {
      site: "https://localhost/",
      pages: ["/"],
      seen: "1970-01-01",
      capture: "DESIGN.md",
      sha256: "0".repeat(64),
      licence: "the workspace's own",
      basis: "DESIGN.md as it stands",
    },
  };
}

/**
 * The workspace's own page: its home's tokens on its register's specimen page.
 * @param design the home
 * @param register the register the rulings give, site where they give none
 * @returns the page in light and, where the home holds one, dark
 */
export function homeComposite(design: DesignDocument, register: Register): Composite {
  const entry = homeEntry(design);
  const tokens = entry.tokens ?? {};
  const sketch =
    register === "app"
      ? []
      : [
          "row 1: columns 7/5; slot claim+action | slot proof-image",
          "row 2: columns 4/4/4; slot proof | slot proof | slot proof",
        ];
  const title = `${design.name ?? "DESIGN.md"} on its specimen page`;
  return {
    light: pageHtml(tokens, sketch, register, false, title),
    dark: holdsDarkScheme(tokens.colors ?? {})
      ? pageHtml(tokens, sketch, register, true, title)
      : null,
  };
}
