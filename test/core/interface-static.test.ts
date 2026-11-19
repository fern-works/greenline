import { describe, expect, it } from "vitest";
import { parseDesign, type DesignDocument } from "../../src/core/design-file.ts";
import { interfaceRules } from "../../src/core/interface-registry.ts";
import {
  homeOrphans,
  runStaticRule,
  staticRuleIds,
  type StaticContext,
} from "../../src/core/interface-static.ts";

/**
 * The static engines (J-123 S4): every rule of the pattern, cascade and
 * drift engines fails the fixture its test names and passes its fix, read
 * with no browser and no model.
 */

const HOME = `---
name: Fixture
colors:
  primary: "#1f3a5f"
  ink: "#1c1c1a"
  surface: "#ffffff"
typography:
  body:
    fontFamily: Source Serif 4
    fontSize: 16px
rounded:
  md: 8px
  lg: 12px
spacing:
  md: 16px
---

## Overview

A fixture.
`;

function design(text = HOME): DesignDocument {
  const parsed = parseDesign(text, "DESIGN.md");
  if (parsed._tag === "err") throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.value;
}

const BARE: StaticContext = { reducedMotionAnywhere: false, viewportCoverAnywhere: false };
const HOMED: StaticContext = { ...BARE, design: design() };

/** A rule's failing source and its fix, each a file with its path; the context the pair is read with. */
interface Fixture {
  readonly path: string;
  readonly fail: string;
  readonly pass: string;
  readonly context?: StaticContext | undefined;
}

const tsx = (fail: string, pass: string): Fixture => ({ path: "src/components/A.tsx", fail, pass });
const css = (fail: string, pass: string, context?: StaticContext): Fixture => ({
  path: "src/styles/a.css",
  fail,
  pass,
  context,
});
const html = (fail: string, pass: string): Fixture => ({ path: "src/app/index.html", fail, pass });
const swift = (fail: string, pass: string): Fixture => ({ path: "ios/App/View.swift", fail, pass });

const homeFixture = (fail: string, pass: string): Fixture => ({
  path: "DESIGN.md",
  fail,
  pass,
});

/** One fixture per static rule, from the rule's own test sentence. */
const FIXTURES: ReadonlyMap<string, Fixture> = new Map([
  [
    "keyboard-operable",
    tsx(`<div onClick={open}>Open</div>`, `<button onClick={open}>Open</button>`),
  ],
  [
    "role-widget-keys",
    tsx(`<div role="tab">One</div>`, `<div role="tab" onKeyDown={arrows}>One</div>`),
  ],
  [
    "control-named-native",
    swift(
      `Button { Image(systemName: "trash") }`,
      `Button { Image(systemName: "trash") }.accessibilityLabel("Delete")`,
    ),
  ],
  [
    "label-bound",
    tsx(`<label>Name</label><input id="n" />`, `<label htmlFor="n">Name</label><input id="n" />`),
  ],
  ["autocomplete-valid", tsx(`<input autocomplete="mail" />`, `<input autocomplete="email" />`)],
  [
    "paste-allowed",
    tsx(
      `<input type="password" onPaste={(e) => e.preventDefault()} />`,
      `<input type="password" />`,
    ),
  ],
  ["img-alt-present", tsx(`<img src="a.png" />`, `<img src="a.png" alt="" />`)],
  [
    "svg-decorative-hidden",
    tsx(
      `<svg viewBox="0 0 10 10"><path d="M0 0" /></svg>`,
      `<svg aria-hidden="true" viewBox="0 0 10 10"><path d="M0 0" /></svg>`,
    ),
  ],
  [
    "html-lang",
    html(
      `<html><head><title>A</title></head></html>`,
      `<html lang="en"><head><title>A</title></head></html>`,
    ),
  ],
  ["page-title", html(`<title></title>`, `<title>Billing</title>`)],
  [
    "viewport-zoom",
    html(
      `<meta name="viewport" content="width=device-width, maximum-scale=1" />`,
      `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    ),
  ],
  [
    "viewport-device-width",
    html(
      `<meta name="viewport" content="width=1024" />`,
      `<meta name="viewport" content="width=device-width" />`,
    ),
  ],
  [
    "table-headers",
    tsx(
      `<table><tr><td>1</td></tr></table>`,
      `<table><tr><th scope="col">N</th></tr><tr><td>1</td></tr></table>`,
    ),
  ],
  [
    "target-size-native",
    swift(
      `Button("Go") {}.frame(width: 30, height: 30)`,
      `Button("Go") {}.frame(width: 44, height: 44)`,
    ),
  ],
  ["autoplay-muted", tsx(`<video autoPlay src="a.mp4" />`, `<video autoPlay muted src="a.mp4" />`)],
  [
    "captions-track",
    tsx(
      `<video src="a.mp4"></video>`,
      `<video src="a.mp4"><track kind="captions" src="a.vtt" /></video>`,
    ),
  ],
  ["nav-uses-links", tsx(`<div onClick={() => router.push("/a")}>A</div>`, `<a href="/a">A</a>`)],
  [
    "drag-alternative",
    tsx(
      `<li draggable onDragStart={start}>A</li>`,
      `<li draggable onDragStart={start}>A<button>Move up</button><button>Move down</button></li>`,
    ),
  ],
  ["no-placeholder-copy", tsx(`<p>Lorem ipsum dolor</p>`, `<p>Invoices due this week</p>`)],
  ["no-invented-metric", tsx(`<p>Trusted by 10,000+ teams</p>`, `<p>Used by our customers</p>`)],
  [
    "no-fake-send",
    tsx(
      `<form onSubmit={() => setDone(true)}>{done && <p>Thanks!</p>}</form>`,
      `<form onSubmit={() => fetch("/api", { method: "POST" })}>{done && <p>Thanks!</p>}</form>`,
    ),
  ],
  [
    "no-fake-faces",
    tsx(`<img alt="" src="https://i.pravatar.cc/80" />`, `<img alt="Ada" src="/team/ada.jpg" />`),
  ],
  [
    "consent-not-preselected",
    tsx(
      `<input type="checkbox" checked name="newsletter" />`,
      `<input type="checkbox" name="newsletter" />`,
    ),
  ],
  [
    "rn-sheet-fit-height",
    tsx(
      `<Stack.Screen options={{ sheetAllowedDetents: "fitToContents" }} />\nconst s = { root: { flex: 1 } };`,
      `<Stack.Screen options={{ sheetAllowedDetents: "fitToContents" }} />\nconst s = { root: { padding: 16 } };`,
    ),
  ],
  [
    "rn-native-tabs-five",
    tsx(
      Array.from({ length: 6 }, (_, i) => `<Tabs.Screen name="t${i}" />`).join("\n"),
      Array.from({ length: 5 }, (_, i) => `<Tabs.Screen name="t${i}" />`).join("\n"),
    ),
  ],
  [
    "reduced-duration-not-zero",
    css(
      `@media (prefers-reduced-motion: reduce) { .a { animation-duration: 0s; } }`,
      `@media (prefers-reduced-motion: reduce) { .a { animation-duration: 0.01ms; animation-iteration-count: 1; } }`,
    ),
  ],
  [
    "overlay-transitioned",
    tsx(
      `{open && <Dialog title="A" />}`,
      `{open && <Dialog className="transition-opacity" title="A" />}`,
    ),
  ],
  [
    "gsap-scoped",
    tsx(
      `useEffect(() => { gsap.to(".x", { x: 1 }); }, []);`,
      `useGSAP(() => { gsap.to(".x", { x: 1 }); }, { scope: ref });`,
    ),
  ],
  [
    "scrolltrigger-rules",
    tsx(
      `ScrollTrigger.create({ trigger: ".a", markers: true });`,
      `ScrollTrigger.create({ trigger: ".a" });`,
    ),
  ],
  [
    "rn-reduced-motion",
    tsx(
      `const s = useAnimatedStyle(() => ({ opacity: withTiming(1) }));`,
      `const reduced = useReducedMotion();\nconst s = useAnimatedStyle(() => ({ opacity: withTiming(1) }));`,
    ),
  ],
  [
    "rn-motion-ui-thread",
    tsx(
      `const pan = PanResponder.create({});`,
      `const pan = Gesture.Pan().onUpdate((e) => { x.value = e.translationX; });`,
    ),
  ],
  ["typographic-glyphs", tsx(`<p>Loading...</p>`, `<p>Loading…</p>`)],
  ["dynamic-type", swift(`Text("Hi").font(.system(size: 14))`, `Text("Hi").font(.body)`)],
  [
    "pending-label-kept",
    tsx(
      `<button>{saving ? "Saving" : "Save"}</button>`,
      `<button aria-busy={saving}>{saving && <Spinner />}Save</button>`,
    ),
  ],
  [
    "dialog-buttons-specific",
    tsx(
      `<div role="dialog" aria-label="Delete"><button>Yes</button><button>No</button></div>`,
      `<div role="dialog" aria-label="Delete"><button>Delete project</button><button>Keep it</button></div>`,
    ),
  ],
  ["error-copy", tsx(`<p>Oops!</p>`, `<p>Couldn't save. Check your connection and retry.</p>`)],
  [
    "link-text-specific",
    tsx(`<a href="/r">click here</a>`, `<a href="/r">Download the Q4 report</a>`),
  ],
  [
    "intl-format",
    tsx(
      `const d = when.toLocaleDateString();`,
      `const d = new Intl.DateTimeFormat(locale).format(when);`,
    ),
  ],
  [
    "controlled-input-handler",
    tsx(`<input value={name} />`, `<input value={name} onChange={change} />`),
  ],
  ["full-height-unit", tsx(`<main className="h-screen" />`, `<main className="min-h-dvh" />`)],
  [
    "safe-area-needs-cover",
    html(
      `<style>.bar { padding-bottom: env(safe-area-inset-bottom); }</style>`,
      `<meta name="viewport" content="width=device-width, viewport-fit=cover" /><style>.bar { padding-bottom: env(safe-area-inset-bottom); }</style>`,
    ),
  ],
  [
    "container-query-ancestor",
    tsx(
      `<div className="@md:flex" />`,
      `<div className="@container"><div className="@md:flex" /></div>`,
    ),
  ],
  ["z-index-scale", tsx(`<div className="z-[9999]" />`, `<div className="z-modal" />`)],
  [
    "collection-key-stable",
    tsx(
      `{rows.map((row, index) => <Row key={index} />)}`,
      `{rows.map((row) => <Row key={row.id} />)}`,
    ),
  ],
  [
    "long-list-virtualised",
    tsx(
      `<ScrollView>{items.map((item) => <Row key={item.id} />)}</ScrollView>`,
      `<FlashList data={items} renderItem={row} />`,
    ),
  ],
  [
    "rn-safe-area-hook",
    tsx(
      `<SafeAreaView><NavigationContainer /></SafeAreaView>`,
      `const insets = useSafeAreaInsets();`,
    ),
  ],
  [
    "control-not-gesture",
    swift(`Image("logo").onTapGesture { open() }`, `Button(action: open) { Image("logo") }`),
  ],
  [
    "colour-literal-native",
    swift(
      `Text("Hi").foregroundColor(Color.white)`,
      `Text("Hi").foregroundColor(Color(.systemBackground))`,
    ),
  ],
  [
    "style-default-face",
    css(`h1 { font-family: Inter, sans-serif; }`, `h1 { font-family: "Source Serif 4", serif; }`),
  ],
  [
    "style-emoji-icon",
    tsx(`<div className="tile">\u{1F680}</div>`, `<div className="tile"><RocketIcon /></div>`),
  ],
  [
    "style-stock-phrases",
    tsx(`<h1>Unleash seamless workflows</h1>`, `<h1>Invoices that reconcile themselves</h1>`),
  ],
  [
    "style-template-punctuation",
    tsx(`<p>Fast · Simple · Secure</p>`, `<p>Fast to set up and kept secure.</p>`),
  ],
  [
    "style-drawn-chrome",
    tsx(`<span className="traffic-light" />`, `<img alt="The dashboard" src="/capture.png" />`),
  ],
  [
    "meta-description",
    html(
      `<html lang="en"><head><meta name="description" content="A" /><meta property="og:image" content="/og.png" /></head></html>`,
      `<html lang="en"><head><meta name="description" content="A" /><meta property="og:image" content="https://a.example/og.png" /></head></html>`,
    ),
  ],
  [
    "focus-outline-removed",
    css(`button:focus { outline: none; }`, `button:focus-visible { outline: 2px solid; }`),
  ],
  [
    "focus-ring-instant",
    css(
      `a:focus-visible { outline: 2px solid; transition: outline .3s; }`,
      `a:focus-visible { outline: 2px solid; }`,
    ),
  ],
  [
    "control-named",
    tsx(
      `<button><svg aria-hidden="true" /></button>`,
      `<button aria-label="Search"><svg aria-hidden="true" /></button>`,
    ),
  ],
  [
    "input-labelled",
    tsx(`<input placeholder="Email" />`, `<label htmlFor="e">Email</label><input id="e" />`),
  ],
  [
    "autocomplete-personal",
    tsx(`<input type="email" id="e" />`, `<input type="email" id="e" autoComplete="email" />`),
  ],
  [
    "aria-hidden-focusable",
    tsx(
      `<div aria-hidden="true"><button>Go</button></div>`,
      `<div inert><button>Go</button></div>`,
    ),
  ],
  [
    "aria-ref-resolves",
    tsx(
      `<input aria-describedby="missing" />`,
      `<p id="hint">Hint</p><input aria-describedby="hint" />`,
    ),
  ],
  [
    "aria-required-state",
    tsx(`<div><div role="tab">A</div></div>`, `<div role="tablist"><div role="tab">A</div></div>`),
  ],
  [
    "reduced-motion-path",
    css(
      `@keyframes rise { from { opacity: 0; } }\n.a { animation: rise .2s; }`,
      `@keyframes rise { from { opacity: 0; } }\n.a { animation: rise .2s; }\n@media (prefers-reduced-motion: reduce) { .a { animation: none; } }`,
    ),
  ],
  [
    "reduced-motion-form",
    css(
      `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`,
      `@media (prefers-reduced-motion: reduce) { .slide { transform: none; } }`,
    ),
  ],
  [
    "dialog-named",
    tsx(
      `<div role="dialog"><p>A</p></div>`,
      `<div role="dialog" aria-labelledby="t"><h2 id="t">A</h2></div>`,
    ),
  ],
  [
    "live-region-status",
    tsx(`<div className="toast">Saved</div>`, `<div className="toast" role="status">Saved</div>`),
  ],
  [
    "link-not-colour-only",
    css(
      `p a { color: #3b5; text-decoration: none; }`,
      `p a { color: #3b5; text-decoration: underline; }`,
    ),
  ],
  [
    "jsonld-honest",
    html(
      `<script type="application/ld+json">{"aggregateRating": {"ratingValue": "4.9"}}</script><p>Our app</p>`,
      `<script type="application/ld+json">{"aggregateRating": {"ratingValue": "4.9"}}</script><p>Rated 4.9 by 120 people</p>`,
    ),
  ],
  [
    "transition-all",
    css(`.a { transition: all .2s; }`, `.a { transition: opacity .2s, transform .2s; }`),
  ],
  [
    "animate-compositor-only",
    css(`.a { transition: height .3s; }`, `.a { transition: transform .3s; }`),
  ],
  [
    "entrance-ease-out",
    css(
      `.modal[open] { transition: opacity .2s ease-in; }`,
      `.modal[open] { transition: opacity .2s cubic-bezier(0.16, 1, 0.3, 1); }`,
    ),
  ],
  [
    "exit-easing",
    css(
      `.menu[open] { transition: opacity 300ms ease-out; }\n.menu.leave { transition: opacity 300ms ease-out; }`,
      `.menu[open] { transition: opacity 300ms ease-out; }\n.menu.leave { transition: opacity 220ms ease-in; }`,
    ),
  ],
  [
    "no-exit-overshoot",
    css(
      `.menu.leave { transition: transform .2s cubic-bezier(.34,1.56,.64,1); }`,
      `.menu.leave { transition: transform .2s ease-in; }`,
    ),
  ],
  [
    "no-exit-delay",
    css(
      `.menu.leave { transition: opacity .2s ease-in .1s; }`,
      `.menu.leave { transition: opacity .2s ease-in; }`,
    ),
  ],
  [
    "app-motion-300",
    css(`.dropdown { transition: opacity 450ms; }`, `.dropdown { transition: opacity 200ms; }`),
  ],
  [
    "site-section-motion",
    css(
      `section.reveal { transition: opacity 1600ms; }`,
      `section.reveal { transition: opacity 600ms; }`,
    ),
  ],
  [
    "motion-over-one-second",
    css(
      `:root { --slow: 3s; }\n.menu { transition: opacity var(--slow); }`,
      `:root { --slow: 250ms; }\n.menu { transition: opacity var(--slow); }`,
    ),
  ],
  [
    "no-scale-zero",
    css(
      `@keyframes pop { from { transform: scale(0); } }`,
      `@keyframes pop { from { transform: scale(0.95); } }`,
    ),
  ],
  [
    "no-bounce-easing",
    css(
      `.a { transition: transform .2s cubic-bezier(.3,1.6,.4,1); }`,
      `.a { transition: transform .2s ease-out; }`,
    ),
  ],
  [
    "will-change-transient",
    css(`* { will-change: transform; }`, `.card:hover { will-change: transform; }`),
  ],
  [
    "hover-motion-gated",
    css(
      `.card:hover { transform: translateY(-2px); }`,
      `@media (hover: hover) and (pointer: fine) { .card:hover { transform: translateY(-2px); } }`,
    ),
  ],
  [
    "hover-no-layout-shift",
    css(`.chip:hover { padding: 12px; }`, `.chip:hover { transform: translateY(-1px); }`),
  ],
  [
    "stagger-offset",
    tsx(
      `<li style={{ animationDelay: \`\${i * 150}ms\` }} />`,
      `<li style={{ animationDelay: \`\${i * 50}ms\` }} />`,
    ),
  ],
  [
    "duration-scale",
    css(`.a { transition: opacity 150ms; }`, `.a { transition: opacity 160ms; }`, {
      ...BARE,
      design: design(
        HOME.replace("spacing:", "components:\n  menu:\n    duration: 160ms\nspacing:"),
      ),
    }),
  ],
  ["tight-leading", css(`p { line-height: 1.1; }`, `p { line-height: 1.5; }`)],
  ["heading-levels", tsx(`<h1>A</h1><h3>B</h3>`, `<h1>A</h1><h2>B</h2>`)],
  ["one-h1", tsx(`<h1>A</h1><h1>B</h1>`, `<h1>A</h1><h2>B</h2>`)],
  [
    "tabular-figures",
    tsx(
      `<table><tr><th>Price</th></tr><tr><td>$1,200.00</td></tr></table>`,
      `<table className="tabular-nums"><tr><th>Price</th></tr><tr><td>$1,200.00</td></tr></table>`,
    ),
  ],
  [
    "font-display",
    css(
      `@font-face { font-family: X; src: url(x.woff2); }`,
      `@font-face { font-family: X; src: url(x.woff2); font-display: swap; }`,
    ),
  ],
  [
    "caps-tracking",
    css(
      `.label { text-transform: uppercase; letter-spacing: 0; }`,
      `.label { text-transform: uppercase; letter-spacing: 0.08em; }`,
    ),
  ],
  [
    "heading-balance",
    css(`h1 { font-size: 48px; }`, `h1 { font-size: 48px; text-wrap: balance; }`),
  ],
  [
    "tokens-not-raw",
    {
      path: "src/components/A.css",
      fail: `.a { color: #1c1c1a; }`,
      pass: `.a { color: var(--ink); }`,
      context: HOMED,
    },
  ],
  [
    "colour-drift",
    {
      path: "src/components/A.css",
      fail: `.a { color: #e11; }`,
      pass: `.a { color: #1f3a5f; }`,
      context: HOMED,
    },
  ],
  [
    "font-drift",
    {
      path: "src/components/A.css",
      fail: `.a { font-family: "Comic Neue"; }`,
      pass: `.a { font-family: "Source Serif 4"; }`,
      context: HOMED,
    },
  ],
  [
    "radius-drift",
    {
      path: "src/components/A.css",
      fail: `.a { border-radius: 10px; }`,
      pass: `.a { border-radius: 12px; }`,
      context: HOMED,
    },
  ],
  [
    "size-drift",
    {
      path: "src/components/A.css",
      fail: `.a { font-size: 15px; }`,
      pass: `.a { font-size: 16px; }`,
      context: HOMED,
    },
  ],
  ["home-primary", homeFixture(HOME.replace("primary:", "brand:"), HOME)],
  [
    "home-section-order",
    homeFixture(
      `${HOME}\n## Components\n\nA.\n\n## Colors\n\nB.\n`,
      `${HOME}\n## Colors\n\nB.\n\n## Components\n\nA.\n`,
    ),
  ],
  [
    "home-dropped-tokens",
    homeFixture(HOME.replace("rounded:", 'brandColours:\n  red: "#cc0000"\nrounded:'), HOME),
  ],
  [
    "home-ref-resolves",
    homeFixture(
      HOME.replace('ink: "#1c1c1a"', 'ink: "{colors.brand}"'),
      HOME.replace('ink: "#1c1c1a"', 'ink: "{colors.primary}"'),
    ),
  ],
  [
    "gamut-fallback",
    css(`.a { color: oklch(70% 0.3 140); }`, `.a { color: #22aa44; color: oklch(70% 0.3 140); }`),
  ],
  [
    "status-hue-accent",
    homeFixture(
      HOME.replace('surface: "#ffffff"', 'surface: "#ffffff"\n  error: "#1f3060"'),
      HOME.replace('surface: "#ffffff"', 'surface: "#ffffff"\n  error: "#b42318"'),
    ),
  ],
  [
    "no-shadow-plus-border",
    css(
      `.card { border: 1px solid #ddd; box-shadow: 0 4px 8px rgba(0,0,0,.1); }`,
      `.card { box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 4px 8px rgba(0,0,0,.1); border: 1px solid transparent; }`,
    ),
  ],
  [
    "shadow-ring-forced-colors",
    css(
      `.card { box-shadow: 0 0 0 1px rgba(0,0,0,.05); }`,
      `.card { box-shadow: 0 0 0 1px rgba(0,0,0,.05); border: 1px solid transparent; }`,
    ),
  ],
  [
    "submit-not-predisabled",
    tsx(
      `<button type="submit" disabled={!isValid}>Send</button>`,
      `<button type="submit">Send</button>`,
    ),
  ],
  [
    "overlay-overscroll",
    css(
      `.dialog { overflow-y: auto; }`,
      `.dialog { overflow-y: auto; overscroll-behavior: contain; }`,
    ),
  ],
  ["user-select-root", css(`body { user-select: none; }`, `button { user-select: none; }`)],
  [
    "img-dimensions",
    tsx(`<img src="a.png" alt="" />`, `<img src="a.png" alt="" width="640" height="480" />`),
  ],
  ["style-eyebrow", tsx(`<p>FEATURES</p>\n<h2>What it does</h2>`, `<h2>What it does</h2>`)],
  [
    "style-nested-cards",
    tsx(
      `<div className="card"><div className="card">A</div></div>`,
      `<div className="card"><div className="row">A</div></div>`,
    ),
  ],
  [
    "style-glow",
    css(`.a { box-shadow: 0 0 20px #3b82f6; }`, `.a { box-shadow: 0 2px 4px rgba(0,0,0,.12); }`),
  ],
  [
    "concentric-radius",
    css(
      `.card { border-radius: 12px; padding: 4px; }\n.card .inner { border-radius: 12px; }`,
      `.card { border-radius: 12px; padding: 4px; }\n.card .inner { border-radius: 8px; }`,
    ),
  ],
  [
    "hover-state-present",
    css(
      `.btn { background: #1f3a5f; }`,
      `.btn { background: #1f3a5f; }\n.btn:hover { background: #2a4d7d; }`,
    ),
  ],
]);

describe("J-123 S4 the static engines", () => {
  const rules = interfaceRules().filter((rule) => rule.engine !== "render");

  it("hold one detector and one fixture for every rule of the pattern, cascade and drift engines", () => {
    const ids = rules.map((rule) => rule.id).sort();
    expect([...staticRuleIds()].sort()).toEqual(ids);
    expect([...FIXTURES.keys()].filter((id) => id !== "home-orphans").sort()).toEqual(
      ids.filter((id) => id !== "home-orphans"),
    );
  });

  it.each(
    rules.filter((rule) => rule.id !== "home-orphans").map((rule) => [rule.id, rule.tier] as const),
  )("%s (%s) fails its fixture and passes its fix", (id) => {
    const fixture = FIXTURES.get(id);
    if (fixture === undefined) throw new Error(`no fixture for ${id}`);
    const context =
      fixture.context ??
      (fixture.path === "DESIGN.md" ? { ...BARE, design: design(fixture.fail) } : BARE);
    expect(
      runStaticRule(id, { path: fixture.path, text: fixture.fail }, context).length,
    ).toBeGreaterThan(0);
    const passing =
      fixture.context ??
      (fixture.path === "DESIGN.md" ? { ...BARE, design: design(fixture.pass) } : BARE);
    expect(runStaticRule(id, { path: fixture.path, text: fixture.pass }, passing)).toEqual([]);
  });

  it("home-orphans lists a token no interface file uses, once for the workspace", () => {
    const home = design();
    const used = [
      { path: "src/a.css", text: ".a { color: #1f3a5f; background: #fff; color: #1c1c1a; }" },
    ];
    expect(homeOrphans(home, HOME, used)).toEqual([]);
    expect(
      homeOrphans(home, HOME, [{ path: "src/a.css", text: ".a { color: #1f3a5f; }" }]).map(
        (hit) => hit.detail,
      ),
    ).toEqual(["ink", "surface"]);
  });
});

describe("J-226 S1 the static name rule leaves a braced expression to the rendered check (j217c-conduct-interface finding 11)", () => {
  const named = (text: string, path = "src/components/button.tsx"): number =>
    runStaticRule("control-named", { path, text }, BARE).length;

  it("raises no floor on the run's component, whose anchor forwards its children", () => {
    // The run's src/components/button.tsx, which its one caller fills with "Sign a member up".
    const button = [
      'import type { ReactNode } from "react";',
      "",
      "/** The page's one action: the primary button, a link where it goes somewhere. */",
      "export function Button({ href, children }: { href: string; children: ReactNode }) {",
      "  return (",
      "    <a",
      '      className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 text-primary-ink"',
      "      href={href}",
      "    >",
      "      {children}",
      "    </a>",
      "  );",
      "}",
      "",
    ].join("\n");
    expect(named(button)).toBe(0);
    // An expression beside an icon, or a runtime choice of words, is measured at render too.
    expect(named(`<button><svg aria-hidden="true" />{label}</button>`)).toBe(0);
    expect(named(`<button>{busy ? "Removing" : "Remove"}</button>`)).toBe(0);
  });

  it("still finds a control with no content, an icon alone, and braces only in a child's attributes", () => {
    expect(named(`<button></button>`)).toBe(1);
    expect(named(`<button><svg/></button>`)).toBe(1);
    expect(named(`<a href="/"><svg className={icon} aria-hidden="true" /></a>`)).toBe(1);
    // A comment in braces renders nothing.
    expect(named(`<button>{/* the icon */}<svg /></button>`)).toBe(1);
  });

  it("keeps control-named-native's reading of a native control's content", () => {
    expect(
      runStaticRule(
        "control-named-native",
        { path: "src/components/Row.tsx", text: `<Pressable onPress={go}>{children}</Pressable>` },
        BARE,
      ).length,
    ).toBe(1);
  });
});
