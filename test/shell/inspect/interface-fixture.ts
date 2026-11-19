import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../../fixtures/corpus.ts";
import { RecordingWriter } from "../../helpers/writer.ts";

/**
 * A workspace for the inspector's interface views (J-123 S7): a site with
 * DESIGN.md, the interface rulings, the catalog installed, a change on its
 * own branch whose record says it touches the interface, a tiered check
 * fact, two captures of one address and the path index. The views' test and
 * the render check (`scripts/check-inspect-render.mjs`) read the same one.
 */

const VERSION = "0.1.0";

/** The change the workspace holds, on the branch `greenline/<id>`. */
export const INTERFACE_CHANGE = "2026-10-25-pricing-table";

/** The catalog the workspace installs: the shipped entries. */
export const CATALOG: string = readFileSync(
  join(import.meta.dirname, "../../../corpus/interface/catalog/entries.json"),
  "utf8",
);

/** The workspace: its root, the environment the inspector starts with, and git in it. */
export interface InterfaceWorkspace {
  readonly root: string;
  readonly env: {
    readonly cwd: string;
    readonly version: string;
    readonly installation: ReturnType<typeof fixtureInstallation>;
  };
  readonly git: (...args: string[]) => string;
}

/**
 * Make the workspace in a fresh temporary folder.
 * @returns the workspace
 */
export function interfaceWorkspace(): InterfaceWorkspace {
  const root = mkdtempSync(join(tmpdir(), "interface-views-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=QA",
        "-c",
        "user.email=qa@invalid.local",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const ID = INTERFACE_CHANGE;
  git("init", "--quiet", "-b", "main");
  write("package.json", JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } }));
  write("src/components/Price.tsx", '<p className="text-[#e11]">Ten</p>\n');
  const writer = new RecordingWriter();
  const env = { cwd: root, version: VERSION, installation: fixtureInstallation() };
  if (runCli(["init", "--yes"], writer.writer, VERSION, env) !== 0) throw new Error(writer.err);
  write(
    "DESIGN.md",
    '---\nname: Prices\ncolors:\n  ground: "#ffffff"\n  ink: "#1c1c1a"\n  accent: "#1f3a5f"\nrounded:\n  md: 6px\n---\n\n## Overview\n\nPrices.\n',
  );
  write(".greenline/DECISIONS.md", "# Decisions\n\n## Interface\n\n- register: site at src\n");
  write(".claude/skills/interface-catalog/catalog/entries.json", CATALOG);
  git("add", "--all");
  git("commit", "--quiet", "-m", "start");
  git("checkout", "--quiet", "-b", `greenline/${ID}`);
  const commit = git("rev-parse", "HEAD");
  write(
    `.greenline/ledger/${ID}.md`,
    [
      "---",
      "mode: regular",
      'why: "w"',
      "state: open",
      "choice: accepted",
      'interface: "yes, site"',
      "---",
      "",
      "## design",
      "",
      "components: pricing",
      "",
    ].join("\n"),
  );
  write(
    `.greenline/ledger/${ID}/interface/20261025T120000000Z-aaaaaa.json`,
    `${JSON.stringify({ generatedBy: "greenline check interface", at: "2026-10-25T12:00:00.000Z", commit, paths: ["src/components/Price.tsx"], counts: { floor: 1, reflex: 0, waived: 0, finish: 0 }, findings: [{ rule: "keyboard-operable", tier: "floor", path: "src/components/Price.tsx", line: 1 }], unmeasured: [], widths: [] }, null, 2)}\n`,
  );
  for (const [slug, made, floor] of [
    ["capture-pricing-before", "2026-10-24T10:00:00.000Z", 2],
    ["capture-pricing", "2026-10-25T12:00:00.000Z", 0],
  ] as const) {
    write(
      `.greenline/visuals/${ID}/${slug}.html`,
      "<!doctype html><title>Capture</title><p>Capture</p>\n",
    );
    write(
      `.greenline/visuals/${ID}/${slug}.visual.json`,
      `${JSON.stringify({ schema: "greenline.visual/v1", title: "Capture of /pricing", form: "capture", skill: "verify", change: ID, commit, files: ["src/components/Price.tsx"], made, summary: "/pricing", capture: { address: "/pricing", widths: [1440, 768, 390], scores: { floor, reflex: 1, finish: 2 } } }, null, 2)}\n`,
    );
  }
  // Each capture's boxes (J-124 S1): the heading and the button at three widths.
  for (const slug of ["capture-pricing-before", "capture-pricing"])
    write(
      `.greenline/visuals/${ID}/${slug}.boxes.json`,
      `${JSON.stringify({
        generatedBy: "greenline check interface",
        address: "/pricing",
        commit,
        at: "2026-10-25T12:00:00.000Z",
        widths: [1440, 768, 390].map((width) => ({
          width,
          height: 900,
          page: { width, height: 1200 },
          image: { height: 1200 },
          elements: [
            {
              selector: "main > h1",
              tag: "h1",
              role: "heading",
              text: "Prices",
              box: { x: 24, y: 24, width: width - 48, height: 40 },
              source: null,
            },
            {
              selector: "#start",
              tag: "button",
              role: "button",
              text: "Start",
              box: { x: 24, y: slug.endsWith("before") ? 900 : 120, width: 160, height: 48 },
              source: { file: "src/components/Price.tsx", line: 1, column: 1, via: "react" },
            },
          ],
          truncated: false,
        })),
      })}\n`,
    );
  // The marks (J-124 S2): one addressed on the before, its after the later capture, and one open.
  const element = (y: number) => ({
    selector: "#start",
    tag: "button",
    role: "button",
    text: "Start",
    box: { x: 24, y, width: 160, height: 48 },
    source: { file: "src/components/Price.tsx", line: 1, column: 1, via: "react" },
  });
  const mark = (id: string, capture: string, y: number, at: string) => ({
    id,
    address: "/pricing",
    width: 390,
    capture: { id: `${ID}/${capture}`, commit },
    element: element(y),
    region: null,
    crop: { x: 0, y: y - 24, width: 208, height: 96 },
    note: "The start button sits below the fold.",
    intent: "fix",
    state: "open",
    by: "owner",
    words: null,
    at,
    proposed: null,
    closed: null,
  });
  const addressed = mark("m1a2b3c4", "capture-pricing-before", 900, "2026-10-24T11:00:00.000Z");
  const open = {
    ...mark("m5d6e7f8", "capture-pricing", 120, "2026-10-25T12:30:00.000Z"),
    note: "Try the button in the accent.",
    intent: "options",
  };
  const proposedLine = {
    ...addressed,
    proposed: {
      as: "addressed",
      capture: `${ID}/capture-pricing`,
      diff: null,
      note: "Moved above the fold.",
      at: "2026-10-25T12:10:00.000Z",
    },
  };
  write(
    `.greenline/ledger/${ID}/marks.jsonl`,
    [
      addressed,
      proposedLine,
      {
        ...proposedLine,
        state: "addressed",
        closed: { by: "owner", via: "viewer", words: null, at: "2026-10-25T12:20:00.000Z" },
      },
      open,
    ]
      .map((line) => JSON.stringify(line))
      .join("\n") + "\n",
  );
  write(
    ".greenline/ledger/interface/paths.json",
    `${JSON.stringify(
      {
        generatedBy: "greenline check interface",
        paths: [
          {
            address: "/pricing",
            register: "site",
            capture: {
              visual: `${ID}/capture-pricing`,
              widths: [1440, 768, 390],
              commit,
              at: "2026-10-25T12:00:00.000Z",
            },
            scores: { floor: 0, reflex: 1, finish: 2 },
            fidelity: { inPalette: 0.9, offPalette: ["#e01010"] },
          },
          {
            address: "/plans",
            register: "site",
            limit: {
              cause: "timeout",
              origin: "http://127.0.0.1:3000",
              address: "/plans",
              at: "2026-10-25T12:10:00.000Z",
              detail: "Page.navigate timed out",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { root, env, git };
}
