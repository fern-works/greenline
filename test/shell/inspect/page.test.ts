import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VIEWS } from "../../../src/shell/inspect/app/addresses.ts";
import {
  COMPONENT_STYLE,
  HOUSE_COLOURS,
  renderShellPage,
} from "../../../src/shell/inspect/page.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { homesWorkspace } from "./homes-fixture.ts";

/**
 * The shell's page as the server answers it: one document carrying the
 * house tokens, the fonts embedded and the client app's one script from the
 * server's own origin, never another host; the client asset served beside
 * it; the seven views in the bar's order; and the declared checks and
 * hooks in the state the settings read.
 */

let root = "";
let url = "";
let handle: InspectorHandle | undefined;
let env: ReturnType<typeof homesWorkspace>["env"] | undefined;
const CLIENT = "// the client app\n";

beforeAll(async () => {
  const workspace = homesWorkspace();
  root = workspace.root;
  const path = join(root, ".greenline/manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.checks = [{ name: "test", command: "npm test", dir: "." }];
  manifest.hooks = { git: false, adapters: true };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  env = workspace.env;
  handle = await startInspector(root, workspace.env, 0, () => CLIENT);
  url = handle.url;
});

afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("the shell's page", () => {
  it("J-164 S1 holds the five places in the bar's order, each with its address and its key", () => {
    expect(VIEWS.map((view) => [view.label, view.path, view.key])).toEqual([
      ["Desk", "/", "d"],
      ["Changes", "/changes", "c"],
      ["Interface", "/interface", "i"],
      ["Knowledge", "/knowledge", "k"],
      ["Practice", "/practice", "p"],
    ]);
  });

  it("stays one local page: its one script from its own origin, no inline script, nothing from another host", async () => {
    const response = await fetch(url);
    const page = await response.text();
    expect(page).toContain('<script type="module" src="/inspector.mjs"></script>');
    expect(page.match(/<script/g)).toHaveLength(1);
    expect(page).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(page).not.toMatch(/url\((?!data:)/);
    expect(page).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[a-z]/);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("serves the client asset beside the page, and says so plainly where the checkout has none", async () => {
    const asset = await fetch(`${url}inspector.mjs`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(await asset.text()).toBe(CLIENT);
    if (env === undefined) throw new Error("the workspace was not built");
    const bare = await startInspector(root, env, 0, () => undefined);
    try {
      const missing = await fetch(`${bare.url}inspector.mjs`);
      expect(missing.status).toBe(503);
      expect(await missing.text()).toContain("pnpm build");
    } finally {
      await bare.close();
    }
  });

  it("carries the house tokens in both looks, the first following the system, on Geist at the study's sizes", async () => {
    const page = await (await fetch(url)).text();
    const light = /:root, \.look-light \{([^}]*)\}/.exec(page)?.[1] ?? "";
    const dark = /:root\[data-theme="dark"\], \.look-dark \{([^}]*)\}/.exec(page)?.[1] ?? "";
    const system = /:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(page)?.[1] ?? "";
    // The picked accent: one fill in both looks, its text darker in light and lighter in dark.
    expect(light).toContain("--accent: #5e6ad2;");
    expect(dark).toContain("--accent: #5e6ad2;");
    expect(light).toContain("--accent-ink: #4f5ac4;");
    expect(dark).toContain("--accent-ink: #828fff;");
    // Done and passed keep green.
    expect(light).toContain("--pass: #1d7f35;");
    expect(dark).toContain("--pass: #27a644;");
    // Every colour in both looks, and the system's dark the same as the switched dark.
    for (const token of HOUSE_COLOURS) {
      expect(light).toContain(`--${token.name}: ${token.light};`);
      expect(dark).toContain(`--${token.name}: ${token.dark};`);
    }
    expect(system.trim()).toBe(dark.trim());
    expect(page).toContain("@media (prefers-color-scheme: dark)");
    for (const scale of [
      "--size-desk: 24px; --size-title: 20px; --size-reading: 15px; --size-ui: 13px; --size-meta: 12px; --size-key: 11px;",
      "--weight-read: 400; --weight-name: 510; --weight-title: 590;",
      "--radius-chip: 4px; --radius: 6px; --radius-card: 8px; --radius-float: 12px;",
      "--height-row: 36px; --height-bar: 48px; --height-foot: 56px;",
      "--quick: 120ms ease-out; --fold: 200ms ease-out;",
    ])
      expect(page).toContain(scale);
    expect(page).toContain(
      "@media (prefers-reduced-motion: reduce) { :root { --quick: 0ms; --fold: 0ms; } }",
    );
    expect(page).toContain('--sans: "Geist", system-ui');
    expect(page).toContain('font-family: "Geist"; src: url(data:font/woff2;base64,');
  });

  it("draws every component on the tokens: no colour of its own, a shadow only under what floats, the faintest ink never as text", () => {
    // Every colour the components use is a token; the literal values live in the token table alone.
    expect(COMPONENT_STYLE).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(COMPONENT_STYLE).not.toMatch(/\b(rgba?|hsla?)\(/);
    // A shadow that floats sits under the palette and the keys alone; an inset edge marks a row or a line (J-164 S1).
    const shadowed = [...COMPONENT_STYLE.matchAll(/^([^{\n]+)\{[^}]*box-shadow: (?!inset)/gm)].map(
      (rule) => (rule[1] ?? "").trim(),
    );
    expect(shadowed).toEqual([".palette", ".keys"]);
    expect(COMPONENT_STYLE).not.toMatch(/(^|[^-])color: var\(--ink-4\)/);
    // Every token a component reads is one the tables define: the colours, the ones drawn from them, and the rest.
    const page = renderShellPage().replace(/@font-face[^}]*\}/g, "");
    const declared = (block: string): (string | undefined)[] =>
      [...block.matchAll(/--([a-z0-9-]+):/g)].map((match) => match[1]);
    const defined = new Set([
      ...HOUSE_COLOURS.map((token) => token.name),
      ...declared(/:root \{([^}]*)\}/.exec(page)?.[1] ?? ""),
      ...declared(/:root, \.look-light \{([^}]*)\}/.exec(page)?.[1] ?? ""),
      // A component's own variable, such as a state word's tone, set from the tokens where it is declared.
      ...declared(COMPONENT_STYLE),
    ]);
    for (const used of COMPONENT_STYLE.matchAll(/var\(--([a-z0-9-]+)\)/g))
      expect(defined, used[1]).toContain(used[1]);
  });

  it("keeps every ink above the text floor on its ground, in both looks", () => {
    const value = (name: string, look: "light" | "dark"): string => {
      const token = HOUSE_COLOURS.find((entry) => entry.name === name);
      if (token === undefined) throw new Error(`no token ${name}`);
      return token[look];
    };
    const luminance = (hex: string): number => {
      const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
      const [r = 0, g = 0, b = 0] = channels.map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (ink: string, ground: string): number => {
      const [high, low] = [luminance(ink), luminance(ground)].sort((a, b) => b - a);
      return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
    };
    // The design's floor table, each ink on the ground it is drawn on.
    const pairs = [
      ["ink", "canvas"],
      ["ink-2", "canvas"],
      ["ink-3", "canvas"],
      ["ink-3", "sunk"],
      ["ink-3", "raised-2"],
      ["accent-ink", "canvas"],
      ["on-accent", "accent"],
      ["need", "canvas"],
      ["need", "need-wash"],
      ["ink", "need-wash"],
      ["pass", "canvas"],
      ["fail", "canvas"],
      ["warn", "canvas"],
      ["info", "canvas"],
      ["idle", "canvas"],
      ["accent-ink", "accent-wash"],
      // J-164 S1: the lines added and removed, the group's band, the lifted light page.
      ["add", "canvas"],
      ["del", "canvas"],
      ["add", "raised"],
      ["del", "raised"],
      ["ink-2", "group"],
      ["ink-3", "group"],
      ["ink-3", "raised"],
      ["ink-2", "sunk"],
    ] as const;
    for (const look of ["light", "dark"] as const)
      for (const [ink, ground] of pairs)
        expect(
          contrast(value(ink, look), value(ground, look)),
          `${ink} on ${ground} in ${look}`,
        ).toBeGreaterThanOrEqual(4.5);
    // The faintest grey is decoration only: it falls under the floor in both looks.
    for (const look of ["light", "dark"] as const)
      expect(contrast(value("ink-4", look), value("canvas", look))).toBeLessThan(4.5);
  });

  it("carries the declared checks and the hooks' registration as the manifest and the clone hold them", async () => {
    const state = await (await fetch(`${url}api/practice`)).json();
    expect(state.hooks).toEqual({
      settings: { git: false, adapters: true },
      git: { state: "off" },
      checks: [{ name: "test", command: "npm test", dir: "." }],
      adapters: expect.any(Array),
    });
  });
});
