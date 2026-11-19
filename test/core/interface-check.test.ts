import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doneVerdict, type RecordedFact } from "../../src/core/git-hooks.ts";
import {
  captureLimitOf,
  captureLimitText,
  checkInterface,
  checksOfChange,
  countsOf,
  facetsOfFile,
  INTERFACE_CHECK_COMMAND,
  interfaceChecksLine,
  limitCauseOf,
  parseInterfaceCheckFact,
  recordWaivers,
  renderFindings,
  viewerOriginRefusal,
  waiverAsks,
  withWaivers,
  type CheckInput,
  type InterfaceCheckFact,
  type InterfaceFinding,
} from "../../src/core/interface-check.ts";
import { interfaceRules, rulePage } from "../../src/core/interface-registry.ts";
import { NO_RULINGS, type InterfaceRulings } from "../../src/core/interface-rulings.ts";
import type { InterfaceSetting } from "../../src/core/manifest.ts";
import { declaredApp, recordedLimits } from "../../src/core/record-interface.ts";
import { finishedFacts, startedFacts, type CheckFacts } from "../../src/core/facts.ts";

/**
 * The interface check (J-123 S4): the static engines' rules selected by the
 * facets in play, the findings by tier, a floor red until the owner rules on it, a
 * reflex cleared by the record's waiver or a standing one, a finish listed
 * and never red; the automatic declaration under the opt-in, whose red run
 * holds done; and the registry paired with its sentences on their pages.
 */

const WEB: InterfaceSetting = {
  roots: ["src"],
  extensions: [".tsx", ".css", ".html"],
  platform: "web",
  frameworks: ["react"],
  evidence: [],
  confirmed: true,
  check: true,
};

const FLOOR_FILE = { path: "src/A.tsx", text: `<div onClick={open}>Open</div>\n` };
const REFLEX_FILE = { path: "src/a.css", text: `.a { transition: all .2s; }\n` };
const FINISH_FILE = { path: "src/B.tsx", text: `<p>Loading...</p>\n` };

function input(overrides: Partial<CheckInput>): CheckInput {
  return {
    files: [],
    homes: [],
    setting: WEB,
    rulings: NO_RULINGS,
    components: undefined,
    waivers: [],
    ...overrides,
  };
}

const rulesOf = (findings: readonly InterfaceFinding[]): readonly string[] =>
  findings.map((finding) => finding.rule);

describe("the tiers", () => {
  it("a floor finding makes the run red", () => {
    const outcome = checkInterface(input({ files: [FLOOR_FILE] }));
    expect(rulesOf(outcome.findings)).toContain("keyboard-operable");
    expect(outcome.counts.floor).toBeGreaterThan(0);
    expect(outcome.red).toBe(true);
  });

  it("a floor is never waived by the build section's line or a standing waiver (J-148 S3 leaves its clearing to the owner's ruling)", () => {
    const rulings: InterfaceRulings = {
      ...NO_RULINGS,
      waivers: [{ rule: "keyboard-operable", reason: "a demo" }],
    };
    const outcome = checkInterface(
      input({
        files: [FLOOR_FILE],
        rulings,
        waivers: [{ rule: "keyboard-operable", reason: "a demo", words: "yes" }],
      }),
    );
    const finding = outcome.findings.find((entry) => entry.rule === "keyboard-operable");
    expect(finding?.waived).toBeUndefined();
    expect(outcome.red).toBe(true);
  });

  it("an unwaived reflex is red, and the record's waiver clears it", () => {
    expect(checkInterface(input({ files: [REFLEX_FILE] })).red).toBe(true);
    const waived = checkInterface(
      input({
        files: [REFLEX_FILE],
        waivers: [{ rule: "transition-all", reason: "the legacy menu", words: "fine, keep it" }],
      }),
    );
    expect(waived.findings.find((entry) => entry.rule === "transition-all")?.waived).toBe("record");
    expect(waived.counts).toMatchObject({ reflex: 0, waived: 1 });
    expect(waived.red).toBe(false);
  });

  it("a standing waiver in the rulings clears a reflex", () => {
    const rulings: InterfaceRulings = {
      ...NO_RULINGS,
      waivers: [{ rule: "transition-all", reason: "the kit's own menus" }],
    };
    const outcome = checkInterface(input({ files: [REFLEX_FILE], rulings }));
    expect(outcome.findings.find((entry) => entry.rule === "transition-all")?.waived).toBe(
      "standing",
    );
    expect(outcome.red).toBe(false);
  });

  it("a finish finding is listed and never red", () => {
    const outcome = checkInterface(input({ files: [FINISH_FILE] }));
    expect(rulesOf(outcome.findings)).toContain("typographic-glyphs");
    expect(outcome.counts.finish).toBeGreaterThan(0);
    expect(outcome.red).toBe(false);
  });

  it("withWaivers marks only reflexes", () => {
    const findings: InterfaceFinding[] = [
      { rule: "a", tier: "floor", path: "x", line: 1 },
      { rule: "a", tier: "reflex", path: "x", line: 2 },
      { rule: "a", tier: "finish", path: "x", line: 3 },
    ];
    const marked = withWaivers(findings, [{ rule: "a", reason: "r", words: "w" }], NO_RULINGS);
    expect(marked.map((finding) => finding.waived)).toEqual([undefined, "record", undefined]);
    expect(countsOf(marked)).toEqual({ floor: 1, reflex: 0, waived: 1, finish: 1 });
  });
});

describe("the waiver lines", () => {
  it("reads each waived line of the record's build section, and none elsewhere", () => {
    const body = [
      "## frame",
      "",
      `waived: focus-visible: quoted in the frame; the owner's yes: "not a waiver"`,
      "",
      "## build",
      "",
      `waived: transition-all: the legacy menu animates its height; the owner's yes: "keep it for now"`,
      `waived: style-eyebrow: the brand's kicker; the owner's yes: "yes, that one stays"`,
      "waived: no-quote: missing the owner's words",
      "",
      "## verify",
      "",
      `waived: hover-only: after build; the owner's yes: "not a waiver either"`,
    ].join("\n");
    expect(recordWaivers(body)).toEqual([
      {
        rule: "transition-all",
        reason: "the legacy menu animates its height",
        words: "keep it for now",
      },
      { rule: "style-eyebrow", reason: "the brand's kicker", words: "yes, that one stays" },
    ]);
  });
});

describe("J-148 S3 a floor finding cleared only by the change record's ruling in the owner's words", () => {
  it("reads the ## Interface section's waived floor as the record's, and clears that floor alone", () => {
    const body = [
      "## build",
      "",
      `waived: target-size: in the build section; the owner's yes: "no floor clears here"`,
      "",
      "## Interface",
      "",
      `- floor target-size at the remove button: waived, "keep it small, it is a dense table"`,
      "- floor focus-visible: fixed",
      `- floor kept-list: waived, "no ruling clears the kept list"`,
    ].join("\n");
    const waivers = recordWaivers(body);
    expect(waivers.filter((waiver) => waiver.floor === true).map((waiver) => waiver.rule)).toEqual([
      "target-size",
      "kept-list",
    ]);
    const findings: InterfaceFinding[] = [
      { rule: "target-size", tier: "floor", path: "x", line: 1 },
      { rule: "focus-visible", tier: "floor", path: "x", line: 2 },
      { rule: "kept-list", tier: "floor", path: "/", line: 0 },
      { rule: "target-size", tier: "reflex", path: "x", line: 3 },
    ];
    const marked = withWaivers(findings, waivers, {
      ...NO_RULINGS,
      waivers: [{ rule: "focus-visible", reason: "a standing waiver never clears a floor" }],
    });
    expect(marked.map((finding) => finding.waived)).toEqual([
      "record",
      undefined,
      undefined,
      "record",
    ]);
    expect(countsOf(marked)).toEqual({ floor: 2, reflex: 0, waived: 2, finish: 0 });
  });
});

describe("selection by the facets", () => {
  it("never runs a native rule on a web file, nor a web rule on a native file", () => {
    const swift = {
      path: "ios/View.swift",
      text: `Button { Image(systemName: "trash") }\n<meta name="viewport" content="width=device-width, maximum-scale=1" />\n`,
    };
    const html = {
      path: "src/index.html",
      text: `<meta name="viewport" content="width=device-width, maximum-scale=1" />\n`,
    };
    const native: InterfaceSetting = {
      ...WEB,
      roots: ["src", "ios"],
      extensions: [...WEB.extensions, ".swift"],
      platform: "ios",
      frameworks: ["swiftui"],
    };
    expect(rulesOf(checkInterface(input({ files: [html] })).findings)).toContain("viewport-zoom");
    const onSwift = rulesOf(checkInterface(input({ files: [swift], setting: native })).findings);
    expect(onSwift).toContain("control-named-native");
    expect(onSwift).not.toContain("viewport-zoom");
    const onWeb = rulesOf(
      checkInterface(input({ files: [{ path: "src/A.tsx", text: swift.text }] })).findings,
    );
    expect(onWeb).not.toContain("control-named-native");
  });

  it("runs a component's rules only where the change declares that component", () => {
    const table = { path: "src/T.tsx", text: `<table><tr><td>1</td></tr></table>\n` };
    expect(rulesOf(checkInterface(input({ files: [table] })).findings)).toContain("table-headers");
    expect(
      rulesOf(checkInterface(input({ files: [table], components: ["form"] })).findings),
    ).not.toContain("table-headers");
    expect(
      rulesOf(checkInterface(input({ files: [table], components: ["table"] })).findings),
    ).toContain("table-headers");
  });

  it("gives a file the register the rulings rule for its root", () => {
    const rulings: InterfaceRulings = {
      ...NO_RULINGS,
      registers: [{ register: "site", root: "src/site" }],
    };
    expect(
      facetsOfFile("src/site/index.html", { setting: WEB, rulings, components: undefined }),
    ).toMatchObject({ register: ["site"], platform: "web" });
    expect(
      facetsOfFile("src/app/A.tsx", { setting: WEB, rulings, components: undefined }).register,
    ).toBeUndefined();
  });
});

describe("the report and the mirror's line", () => {
  it("prints the counts first and the findings by tier", () => {
    const outcome = checkInterface(
      input({
        files: [FLOOR_FILE, REFLEX_FILE, FINISH_FILE],
        waivers: [{ rule: "transition-all", reason: "r", words: "w" }],
      }),
    );
    const text = renderFindings(outcome);
    expect(text.split("\n")[0]).toBe(interfaceChecksLine(outcome.counts));
    expect(text).toContain("floor:\n  src/A.tsx:1 keyboard-operable: ");
    expect(text).toContain("transition-all (waived, on the record)");
    expect(interfaceChecksLine({ floor: 0, reflex: 2, waived: 1, finish: 3 })).toBe(
      "interface checks: floor 0 red, reflex 2 red (1 waived), finish 3",
    );
  });

  it("J-144 S3 names each reflex rule left to clear once, for one plain question to the owner, and none a waiver clears", () => {
    const asks = waiverAsks([
      { rule: "tokens-not-raw", tier: "reflex", path: "a.css", line: 1 },
      { rule: "tokens-not-raw", tier: "reflex", path: "a.css", line: 2 },
      { rule: "transition-all", tier: "reflex", path: "a.css", line: 3, waived: "standing" },
      { rule: "keyboard-operable", tier: "floor", path: "a.tsx", line: 1 },
    ]);
    expect(asks).toHaveLength(2);
    expect(asks[1]).toContain(
      "  tokens-not-raw, 2 lines: one question in the owner's words, never the rule's name",
    );
    expect(asks[1]).toContain('Shall I tell it to ignore them for this site?", yes offered first');
    expect(waiverAsks([{ rule: "a", tier: "finish", path: "x", line: 1 }])).toEqual([]);
  });

  it("prints the kept check sentence, the one floor finding outside the registry", () => {
    const text = renderFindings({
      findings: [
        {
          rule: "kept-list",
          tier: "floor",
          path: "/login",
          line: 0,
          detail: 'the kept link entry "/pricing Pricing" is gone',
        },
      ],
      counts: { floor: 1, reflex: 0, waived: 0, finish: 0 },
      red: true,
    });
    expect(text).toContain(
      "  /login:0 kept-list: What the page carried before the redesign stays: ",
    );
    expect(text).toContain('[the kept link entry "/pricing Pricing" is gone]');
  });
});

describe("the tiered fact", () => {
  it("round-trips through its schema and refuses an unknown field", () => {
    const fact: InterfaceCheckFact = {
      generatedBy: "greenline check interface",
      at: "2026-10-25T12:00:00.000Z",
      commit: null,
      paths: ["src/A.tsx"],
      counts: { floor: 1, reflex: 0, waived: 0, finish: 0 },
      findings: [{ rule: "keyboard-operable", tier: "floor", path: "src/A.tsx", line: 1 }],
      unmeasured: [],
      widths: [],
    };
    const parsed = parseInterfaceCheckFact(JSON.stringify(fact), "fact.json");
    expect(parsed._tag === "ok" ? parsed.value : parsed.error.issues).toEqual(fact);
    expect(parseInterfaceCheckFact(JSON.stringify({ ...fact, extra: 1 }), "f")._tag).toBe("err");
  });
});

describe("the automatic declaration", () => {
  const YES = { touches: true, registers: ["app"] } as const;

  it("holds an interface change to the interface check only under the opt-in", () => {
    expect(checksOfChange([], WEB, YES)).toEqual([
      { name: "interface", command: INTERFACE_CHECK_COMMAND, dir: "." },
    ]);
    expect(checksOfChange([], { ...WEB, check: false }, YES)).toEqual([]);
    expect(checksOfChange([], WEB, { touches: false })).toEqual([]);
    expect(checksOfChange([], undefined, YES)).toEqual([]);
    expect(checksOfChange([], WEB, undefined)).toEqual([]);
  });

  it("keeps the workspace's own declaration of the command, and never takes a name in use", () => {
    const own = [{ name: "ui", command: INTERFACE_CHECK_COMMAND, dir: "." }];
    expect(checksOfChange(own, WEB, YES)).toEqual(own);
    const taken = [{ name: "interface", command: "pnpm run interface", dir: "." }];
    expect(checksOfChange(taken, WEB, YES).at(-1)?.name).toBe("interface-2");
  });

  const run = (code: number): RecordedFact => {
    const started: CheckFacts = startedFacts({
      arguments: ["greenline", "check", "interface"],
      step: "verify",
      startedAt: "2026-10-25T12:00:00.000Z",
      commit: null,
      tree: null,
      installation: "r1",
      previous: undefined,
      check: "interface",
      dir: undefined,
    });
    return {
      file: "checks/20261025T120000000Z-aaaaaa.json",
      facts: finishedFacts(started, { kind: "exited", code }, 10),
    };
  };

  it("a planted floor's red run holds done, and a green one lets it through", () => {
    const held = checksOfChange([], WEB, YES);
    expect(doneVerdict("c1", held, [run(1)]).kind).toBe("refuse");
    expect(doneVerdict("c1", held, []).kind).toBe("refuse");
    expect(doneVerdict("c1", held, [run(0)]).kind).toBe("allow");
  });
});

describe("the registry", () => {
  const DESIGN = join(import.meta.dirname, "../../corpus/skills/design");

  it("pairs every rule with its sentence and its tier on the page its facets give it", () => {
    for (const rule of interfaceRules()) {
      const page = readFileSync(join(DESIGN, rulePage(rule)), "utf8");
      expect(page, rule.id).toContain(`- \`${rule.id}\`, ${rule.tier}: ${rule.sentence}`);
    }
  });
});

/**
 * The capture the interface check could not make (J-191 S1): its limit is a
 * fact with its cause, the origin tried and the time, never a silence; the
 * record names it in the agent's words; the check captures the app's own
 * origin, never the viewer's. The Codex replay's captures timed out on
 * `Page.navigate` while the tester's pane loaded the app
 * (j109t-linearc F1, j109t-conduct-interfaced finding 5), and the Claude
 * replay's check was pointed at the viewer (j179c-conduct-interfaceb
 * finding 4).
 */

const AT = "2026-11-07T10:00:00.000Z";

describe("J-191 S1 the capture's limit", () => {
  it("names its cause from the stage that failed and the browser's own words", () => {
    expect(limitCauseOf("find", "no browser found")).toBe("no-browser");
    expect(limitCauseOf("launch", "the browser printed no DevTools port")).toBe("browser-start");
    expect(limitCauseOf("read", "Page.navigate timed out")).toBe("timeout");
    expect(
      limitCauseOf(
        "read",
        "http://127.0.0.1:3000/ did not load in 30 s: the browser had no answer to its navigation",
      ),
    ).toBe("timeout");
    expect(
      limitCauseOf("read", "http://127.0.0.1:3000/ did not load: net::ERR_CONNECTION_REFUSED"),
    ).toBe("refused");
    expect(limitCauseOf("read", "http://127.0.0.1:3000/ did not load: net::ERR_ABORTED")).toBe(
      "load-failed",
    );
  });

  it("keeps the cause, the origin tried, the address and the time, and says them in words", () => {
    const limit = captureLimitOf({
      stage: "read",
      reason: "Page.navigate timed out",
      origin: "http://127.0.0.1:3000/",
      address: "/",
      at: AT,
    });
    expect(limit).toEqual({
      cause: "timeout",
      origin: "http://127.0.0.1:3000",
      address: "/",
      at: AT,
      detail: "Page.navigate timed out",
    });
    expect(captureLimitText(limit)).toBe(
      "the page did not load in time at http://127.0.0.1:3000/ (Page.navigate timed out)",
    );
    const refused = captureLimitOf({
      stage: "read",
      reason: "http://127.0.0.1:3000/members did not load: net::ERR_CONNECTION_REFUSED",
      origin: "http://127.0.0.1:3000",
      address: "/members",
      at: AT,
    });
    expect(captureLimitText(refused)).toBe(
      "nothing answers at http://127.0.0.1:3000/members: the app is not running there (http://127.0.0.1:3000/members did not load: net::ERR_CONNECTION_REFUSED)",
    );
  });

  it("refuses the viewer's own origin in one line, on any loopback name for its port", () => {
    const viewer = "http://127.0.0.1:51658/";
    expect(viewerOriginRefusal("http://127.0.0.1:51658", viewer)).toBe(
      "http://127.0.0.1:51658 is the viewer's own address, where greenline inspect serves, not the app's; give the origin the app serves, from its start command or the record's `- app <origin>` line",
    );
    expect(viewerOriginRefusal("http://localhost:51658/", viewer)).toBeDefined();
    expect(viewerOriginRefusal("http://127.0.0.1:3000", viewer)).toBeUndefined();
    expect(viewerOriginRefusal("http://127.0.0.1:51658", undefined)).toBeUndefined();
    expect(viewerOriginRefusal("http://example.com:51658", viewer)).toBeUndefined();
  });
});

describe("J-191 S1 the record's limit and app lines", () => {
  const body = [
    "## frame",
    "",
    "- limit /outside: not in the section",
    "",
    "## Interface",
    "",
    "- page /members: templates/members.html",
    "- limit /: the board was not captured; the capture browser timed out at http://127.0.0.1:3000",
    "- limit /settings:",
    "- app http://127.0.0.1:3000",
    "",
    "## build",
  ].join("\n");

  it("reads each limit line with the agent's words, a line with no words not one", () => {
    expect(recordedLimits(body)).toEqual([
      {
        address: "/",
        words: "the board was not captured; the capture browser timed out at http://127.0.0.1:3000",
      },
    ]);
  });

  it("reads the app's origin from the app line", () => {
    expect(declaredApp(body)).toBe("http://127.0.0.1:3000");
    expect(declaredApp("## Interface\n\n- app localhost:3000\n")).toBeUndefined();
    expect(declaredApp("")).toBeUndefined();
  });
});
