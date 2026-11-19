/**
 * The interface fact and its home on real workspaces (J-123 S1): init and
 * sync detect the roots and offer the home, status prints the interface and
 * its drift, the harness hook returns the finding on a write under a root
 * while the record says `interface: no` and admits DESIGN.md as the record's
 * own write, and the mirror prints the facets in play.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { hookRunFileName } from "../../src/core/facts.ts";
import { parseManifest } from "../../src/core/manifest.ts";
import { parseInterfaceCheckFact } from "../../src/core/interface-check.ts";
import { parseSurvey } from "../../src/core/interface-home.ts";
import { ok } from "../../src/commons/result.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { pageHome } from "../../src/shell/interface.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const ID = "2026-10-25-pricing-table";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A command's exit code and everything it printed. */
interface Ran {
  readonly code: number;
  readonly out: string;
}

interface Workspace {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, text: string) => void;
  readonly cli: (...argv: string[]) => Ran;
}

/** A Next app with a Tailwind configuration and a components directory, initialised. */
function workspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), "interface-workspace-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const cli = (...argv: string[]): Ran => {
    const recording = new RecordingWriter();
    const code = runCli(argv, recording.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    });
    return { code, out: recording.out + recording.err };
  };
  git("init", "--quiet", "-b", "main");
  write(
    "package.json",
    JSON.stringify({
      dependencies: { next: "15.0.0", react: "19.0.0" },
      devDependencies: { tailwindcss: "4.0.0" },
    }),
  );
  write("tailwind.config.ts", "export default {};\n");
  write("src/app/page.tsx", "export default function Page() { return null; }\n");
  write("src/components/Price.tsx", '<div className="rounded-[10px] text-[#e11]" />\n');
  write("src/lib/fetch.ts", "export const x = 1;\n");
  const init = cli("init", "--yes");
  if (init.code !== 0) throw new Error(`init failed: ${init.out}`);
  return { root, git, write, cli };
}

function manifestOf(root: string): ReturnType<typeof parseManifest> {
  return parseManifest(readFileSync(join(root, ".greenline", "manifest.json"), "utf8"), "manifest");
}

/** What one event's run printed and returned. */
interface Fired {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** Fire one Claude Code payload at the workspace. */
function fire(root: string, payload: JsonValue): Fired {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", "claude-code"], writer.writer, {
    cwd: root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-10-25T12:00:00.000Z"),
    factsFile: (startedAt) => hookRunFileName(startedAt, "hook01"),
  });
  return { code, out: writer.out, err: writer.err };
}

const CONTEXT = z.object({
  hookSpecificOutput: z.object({ additionalContext: z.string() }),
});

function openChange(here: Workspace, lines: readonly string[], body = ""): void {
  here.git("add", "--all");
  here.git("commit", "--quiet", "--no-verify", "-m", "start");
  here.git("checkout", "--quiet", "-b", `greenline/${ID}`);
  here.write(
    `.greenline/ledger/${ID}.md`,
    ["---", "mode: quick", 'why: "w"', "state: open", ...lines, "---", "", body].join("\n"),
  );
}

describe("J-123 S1 the interface detected and its home offered", () => {
  it("writes the detected roots into the manifest at init, unconfirmed, and offers the home", () => {
    const here = workspace();
    const manifest = manifestOf(here.root);
    expect(manifest._tag === "ok" && manifest.value.interface).toEqual({
      roots: ["src/app", "src/components"],
      extensions: ["tsx"],
      platform: "web",
      frameworks: ["next", "react", "tailwind"],
      evidence: [
        "platform web: no native target or cross-platform stack is named",
        "next: package.json names next",
        "react: package.json names react",
        "tailwind: package.json names tailwindcss",
        "roots src/app, src/components: the interface files stand there",
      ],
      confirmed: false,
      check: false,
    });
    const status = here.cli("status");
    expect(status.out).toContain(
      "interface: yes, register not ruled; web · next · react · tailwind (detected, not confirmed); roots src/app, src/components; no DESIGN.md: the home is offered\n",
    );
  });

  it("reads DESIGN.md and the rulings once written, and prints the planted drift", () => {
    const here = workspace();
    here.write(
      "DESIGN.md",
      '---\nname: Prices\ncolors:\n  accent: "#dc2626"\nrounded:\n  md: 8px\n---\n\n## Overview\n\nPrices.\n',
    );
    here.write(
      ".greenline/DECISIONS.md",
      "# Decisions\n\n## Interface\n\n- register: site at src\n",
    );
    const status = here.cli("status");
    expect(status.out).toContain(
      "interface: yes, site at src; web · next · react · tailwind (detected, not confirmed); roots src/app, src/components; DESIGN.md read\n",
    );
    expect(status.out).toContain(
      "interface drift: 1 colour, 1 radius the code uses that DESIGN.md does not name; 2 tokens the code no longer uses\n",
    );
  });

  it("follows the detection at sync until the owner confirms the block, and keeps a confirmed one", () => {
    const here = workspace();
    here.write("src/styles/site.css", ".a { color: red; }\n");
    expect(here.cli("sync").code).toBe(0);
    const synced = manifestOf(here.root);
    expect(synced._tag === "ok" && synced.value.interface?.extensions).toEqual(["css", "tsx"]);
    const path = join(here.root, ".greenline", "manifest.json");
    const confirmed = readFileSync(path, "utf8").replace('"confirmed": false', '"confirmed": true');
    writeFileSync(path, confirmed);
    here.write("src/views/Home.vue", "<template />\n");
    expect(here.cli("sync").code).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(confirmed);
  });
});

describe("J-123 S1 the hook reads the interface fact", () => {
  const write = (root: string, path: string) => ({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    cwd: root,
    tool_input: { file_path: join(root, path), content: "x" },
  });

  it("returns the finding on a write under a root while the record says interface: no, and lets other writes through", () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', "interface: no"]);
    const refused = fire(here.root, write(here.root, "src/components/Price.tsx"));
    expect(refused.code).toBe(2);
    expect(refused.err).toBe(
      `this change was proposed as touching no interface, so src/components/Price.tsx, under the interface root src/components, is not written: .greenline/ledger/${ID}.md says interface: no; propose interface: "yes, <register>" and wait for the owner's yes, or keep the write out of the interface; interface-fact, greenline's harness hook\n`,
    );
    expect(fire(here.root, write(here.root, "src/lib/fetch.ts")).code).toBe(0);
    here.write(
      `.greenline/ledger/${ID}.md`,
      '---\nmode: quick\nwhy: "w"\nstate: open\nchoice: accepted\nyes: "Yes."\ninterface: "yes, site"\n---\n',
    );
    expect(fire(here.root, write(here.root, "src/components/Price.tsx")).code).toBe(0);
  });

  it("admits DESIGN.md before the owner's yes, as the record's own write", () => {
    const here = workspace();
    openChange(here, []);
    expect(fire(here.root, write(here.root, "DESIGN.md")).code).toBe(0);
    expect(fire(here.root, write(here.root, "src/app/DESIGN.md")).code).toBe(0);
    expect(fire(here.root, write(here.root, "src/app/page.tsx")).code).toBe(2);
  });

  it("prints the facets in play on the mirror, with the components the design section declares", () => {
    const here = workspace();
    here.write(".greenline/DECISIONS.md", "## Interface\n\n- register: app at src\n");
    openChange(
      here,
      ["choice: accepted", 'yes: "Yes."', "interface: yes"],
      "## design\n\ncomponents: table, pricing\n",
    );
    const turn = fire(here.root, { hook_event_name: "UserPromptSubmit" });
    expect(CONTEXT.parse(JSON.parse(turn.out)).hookSpecificOutput.additionalContext).toContain(
      "\n  interface: yes; facets: app · web · next · react · tailwind; this change: table, pricing\n",
    );
  });
});

/** `greenline check` as the entry point dispatches it, before the workspace's own parsing. */
async function check(here: Workspace, ...argv: string[]): Promise<Ran> {
  const recording = new RecordingWriter();
  const code = await runCheckCli(argv, recording.writer, {
    cwd: here.root,
    installation: () => ok(fixtureInstallation()),
    environment: process.env,
    stdio: "ignore",
  });
  return { code, out: recording.out + recording.err };
}

describe("J-123 S4 greenline check interface on a workspace", () => {
  const FLOOR = "export const Open = () => <div onClick={open}>Open</div>;\n";
  const factsOf = (root: string): readonly string[] => {
    try {
      return readdirSync(join(root, ".greenline", "ledger", ID, "interface"));
    } catch {
      return [];
    }
  };

  it("finds a planted floor on the files the change touched, red, and writes the tiered fact", async () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    here.write("src/components/Open.tsx", FLOOR);
    const ran = await check(here, "interface");
    expect(ran.code).toBe(1);
    expect(ran.out).toContain("floor:\n  src/components/Open.tsx:1 keyboard-operable: ");
    const [name] = factsOf(here.root);
    expect(name).toBeDefined();
    const text = readFileSync(
      join(here.root, ".greenline", "ledger", ID, "interface", name ?? ""),
      "utf8",
    );
    const fact = parseInterfaceCheckFact(text, name ?? "");
    expect(fact._tag === "ok" && fact.value.counts.floor).toBeGreaterThan(0);
    expect(fact._tag === "ok" && fact.value.paths).toEqual(["src/components/Open.tsx"]);
    expect(text.startsWith('{\n  "generatedBy": "greenline check interface"')).toBe(true);
  });

  it("writes the fact under the branch's change while another record is open too", async () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    here.write(
      ".greenline/ledger/2026-10-25-other-change.md",
      ["---", "mode: quick", 'why: "w"', "state: open", "---", ""].join("\n"),
    );
    here.write("src/components/Open.tsx", FLOOR);
    expect((await check(here, "interface")).code).toBe(1);
    expect(factsOf(here.root)).toHaveLength(1);
  });

  it("clears a reflex the record's build section waives, and the floor stays red", async () => {
    const here = workspace();
    here.write("src/components/menu.css", ".menu { transition: all .2s; }\n");
    expect(here.cli("sync").code).toBe(0);
    openChange(
      here,
      ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"'],
      `## build\n\nwaived: transition-all: the menu's height animates; the owner's yes: "keep it"\n`,
    );
    here.write("src/components/menu.css", ".menu { transition: all .25s; }\n");
    const waived = await check(here, "interface");
    expect(waived.out).toContain("transition-all (waived, on the record)");
    expect(waived.code, waived.out).toBe(0);
    here.write("src/components/Open.tsx", FLOOR);
    expect((await check(here, "interface")).code).toBe(1);
  });

  it("J-144 S3 asks the owner once for the workspace about a reflex read as a false alarm, and the standing waiver their yes writes holds on the next change", async () => {
    const here = workspace();
    const css = ".menu { transition: all .2s; }\n";
    here.write("src/components/menu.css", css);
    expect(here.cli("sync").code).toBe(0);
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    const wrote = (): string => {
      const after = fire(here.root, {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        cwd: here.root,
        tool_input: { file_path: join(here.root, "src/components/menu.css"), content: css },
      });
      return CONTEXT.parse(JSON.parse(after.out)).hookSpecificOutput.additionalContext;
    };
    const asked = wrote();
    expect(asked).toContain(
      "to ask the owner once for this workspace, only where you read it as a false alarm:\n  transition-all, 1 line: one question in the owner's words, never the rule's name,",
    );
    expect(asked).toContain(
      "their yes is the line `waiver: transition-all: <what it protects>` under ## Interface in .greenline/DECISIONS.md, and no later change asks again",
    );
    expect(asked).not.toMatch(/don't edit|do not edit/i);
    // The owner's yes, written as a standing waiver; the change closes and the next one opens.
    here.write(
      ".greenline/DECISIONS.md",
      "## Interface\n\n- waiver: transition-all: the menu's height animates on purpose\n",
    );
    here.git("add", "--all");
    here.git("commit", "--quiet", "--no-verify", "-m", "the first change");
    here.git("checkout", "--quiet", "-b", "greenline/2026-10-26-menu-two");
    here.write(
      ".greenline/ledger/2026-10-26-menu-two.md",
      [
        "---",
        "mode: quick",
        'why: "w"',
        "state: open",
        "choice: accepted",
        'yes: "Yes."',
        'interface: "yes, app"',
        "---",
        "",
      ].join("\n"),
    );
    const held = wrote();
    expect(held).toContain("transition-all (waived, standing)");
    expect(held).not.toContain("to ask the owner once");
    here.write("src/components/menu.css", ".menu { transition: all .25s; }\n");
    const ran = await check(here, "interface");
    expect(ran.out).toContain("transition-all (waived, standing)");
    expect(ran.out).not.toContain("to ask the owner once");
  });

  it("J-143 S3 leaves the visual home's captures out of the check and the drift with the root `.`", async () => {
    const here = workspace();
    const manifestPath = join(here.root, ".greenline", "manifest.json");
    const manifest = z
      .object({ interface: z.record(z.string(), z.unknown()) })
      .passthrough()
      .parse(JSON.parse(readFileSync(manifestPath, "utf8")));
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          ...manifest,
          interface: {
            ...manifest.interface,
            roots: ["."],
            extensions: ["tsx", "html", "css"],
            confirmed: true,
          },
        },
        null,
        2,
      )}\n`,
    );
    here.write(
      "DESIGN.md",
      '---\nname: Prices\ncolors:\n  accent: "#dc2626"\nrounded:\n  md: 8px\n---\n\n## Overview\n\nPrices.\n',
    );
    const before = here.cli("status").out;
    expect(before).toContain("interface drift: ");
    const driftOf = (out: string): string | undefined =>
      out.split("\n").find((line) => line.startsWith("interface drift: "));
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    // A capture the session kept, its colours the browser computed, under the visual home.
    here.write(
      `.greenline/visuals/${ID}/capture-index-html.html`,
      '<html><body style="color:#1c1c1a;background:#f6f6f4"><div style="border-color:#d4d4d0;border-radius:3px;font-size:14px">x</div></body></html>\n',
    );
    here.write(`.greenline/visuals/${ID}/theme.css`, ".x { color: #4a4a46; }\n");
    expect(driftOf(here.cli("status").out)).toBe(driftOf(before));
    const ran = await check(here, "interface");
    expect(ran.out).not.toContain(".greenline/visuals/");
    const [name] = readdirSync(join(here.root, ".greenline", "ledger", ID, "interface"));
    const fact = parseInterfaceCheckFact(
      readFileSync(join(here.root, ".greenline", "ledger", ID, "interface", name ?? ""), "utf8"),
      name ?? "",
    );
    expect(
      fact._tag === "ok" && fact.value.paths.filter((path) => path.startsWith(".greenline/")),
    ).toEqual([]);
  });

  it("J-143 S3 records the browser limit for a screen named alone on a platform no browser renders, and refuses it on the web", async () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    const web = await check(here, "interface", "--path", "/members");
    expect(web.code).toBe(2);
    expect(web.out).toContain(
      "--path alone reads the app's origin from the record's ## Interface line `- app <origin>`, and the record names none",
    );
    expect(web.out).toContain("on a platform no browser renders --path alone names a screen");
    const manifestPath = join(here.root, ".greenline", "manifest.json");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace('"platform": "web"', '"platform": "cross"'),
    );
    here.write("src/components/Members.tsx", "export const Members = () => null;\n");
    const screen = await check(here, "interface", "--path", "/members");
    expect(screen.code, screen.out).toBe(0);
    expect(screen.out).toContain(
      "interface render: the platform is cross, and no browser renders the screen /members",
    );
    const [name] = readdirSync(join(here.root, ".greenline", "ledger", ID, "interface"));
    const fact = parseInterfaceCheckFact(
      readFileSync(join(here.root, ".greenline", "ledger", ID, "interface", name ?? ""), "utf8"),
      name ?? "",
    );
    expect(fact._tag === "ok" && [fact.value.address, fact.value.browser]).toEqual([
      "/members",
      "the platform is cross, and no browser renders the screen /members; the floor stands as checked statically",
    ]);
    // J-191 S1: the platform's limit, which settles the screen alone.
    expect(fact._tag === "ok" && fact.value.limit).toMatchObject({
      cause: "platform",
      origin: null,
      address: "/members",
    });
  });

  it("checks the paths named, from where it was started", async () => {
    const here = workspace();
    here.write("src/components/Open.tsx", FLOOR);
    const ran = await check(here, "interface", "src/app/page.tsx");
    expect(ran.code).toBe(0);
    expect(ran.out).toContain("interface checks: floor 0 red, reflex 0 red (0 waived), finish 0\n");
  });

  it("returns the findings after an interface write as Claude Code's context, and the mirror prints the latest run", async () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    here.write("src/components/Open.tsx", FLOOR);
    const after = fire(here.root, {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: here.root,
      tool_input: { file_path: join(here.root, "src/components/Open.tsx"), content: FLOOR },
    });
    expect(after.code).toBe(0);
    const context = CONTEXT.parse(JSON.parse(after.out)).hookSpecificOutput.additionalContext;
    expect(context).toContain("greenline interface rules on src/components/Open.tsx:\n");
    expect(context).toContain("src/components/Open.tsx:1 keyboard-operable: ");
    const quiet = fire(here.root, {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: here.root,
      tool_input: { file_path: join(here.root, "src/lib/fetch.ts"), content: "x" },
    });
    expect(quiet.out).toBe("");
    await check(here, "interface");
    const turn = fire(here.root, { hook_event_name: "UserPromptSubmit" });
    expect(CONTEXT.parse(JSON.parse(turn.out)).hookSpecificOutput.additionalContext).toMatch(
      /\n {2}interface checks: floor [1-9]\d* red, reflex \d+ red \(0 waived\), finish \d+\n/,
    );
  });

  it("records a direct run of the interface check as the declared check's run under the opt-in", () => {
    const here = workspace();
    const path = join(here.root, ".greenline", "manifest.json");
    const manifest = z
      .object({ interface: z.record(z.string(), z.json()) })
      .passthrough()
      .parse(JSON.parse(readFileSync(path, "utf8")));
    writeFileSync(
      path,
      `${JSON.stringify({ ...manifest, interface: { ...manifest.interface, check: true } }, null, 2)}\n`,
    );
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    const call = {
      tool_name: "Bash",
      tool_use_id: "t1",
      cwd: here.root,
      tool_input: { command: "greenline check interface" },
    };
    expect(fire(here.root, { hook_event_name: "PreToolUse", ...call }).code).toBe(0);
    expect(fire(here.root, { hook_event_name: "PostToolUse", ...call }).code).toBe(0);
    const folder = join(here.root, ".greenline", "ledger", ID, "checks");
    const [name] = readdirSync(folder);
    expect(readFileSync(join(folder, name ?? ""), "utf8")).toContain('"check": "interface"');
  });

  it("J-133 S1 records the pages the change touched and the address rendered, and the mirror names the render owed until the limit is named, in the record too (J-191 S1)", async () => {
    const here = workspace();
    const path = join(here.root, ".greenline", "manifest.json");
    const manifest = z
      .object({ interface: z.record(z.string(), z.json()) })
      .passthrough()
      .parse(JSON.parse(readFileSync(path, "utf8")));
    writeFileSync(
      path,
      `${JSON.stringify({ ...manifest, interface: { ...manifest.interface, check: true } }, null, 2)}\n`,
    );
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    here.write("src/app/members/page.tsx", "export default function Page() { return null; }\n");
    await check(here, "interface");
    const facts = readdirSync(join(here.root, ".greenline", "ledger", ID, "interface"));
    const first = parseInterfaceCheckFact(
      readFileSync(
        join(here.root, ".greenline", "ledger", ID, "interface", facts[0] ?? ""),
        "utf8",
      ),
      "fact",
    );
    expect(first._tag === "ok" ? first.value : undefined).toMatchObject({ pages: ["/members"] });
    expect(first._tag === "ok" ? first.value.address : "absent").toBeUndefined();
    const mirror = (): string =>
      CONTEXT.parse(JSON.parse(fire(here.root, { hook_event_name: "UserPromptSubmit" }).out))
        .hookSpecificOutput.additionalContext;
    expect(mirror()).toContain(
      "\n  interface render: owed for /members; run greenline check interface --url <address> --path <page>, or greenline check interface --path <screen> on a platform no browser renders, before done\n",
    );
    const recording = new RecordingWriter();
    await runCheckCli(
      ["interface", "--url", "http://127.0.0.1:9", "--path", "/members"],
      recording.writer,
      {
        cwd: here.root,
        installation: () => ok(fixtureInstallation()),
        environment: { ...process.env, GREENLINE_CHROME: join(here.root, "no-such-browser") },
        stdio: "ignore",
      },
    );
    // J-191 S1: the limit stands in its fact; the mirror asks for the record's line, which then settles it.
    expect(mirror()).toContain(
      "interface render: owed for /members; the capture of /members met its limit, no browser ran at http://127.0.0.1:9/members",
    );
    here.write(
      `.greenline/ledger/${ID}.md`,
      `${readFileSync(join(here.root, ".greenline", "ledger", `${ID}.md`), "utf8")}\n## Interface\n\n- limit /members: the members page was not captured; no browser runs on this machine\n`,
    );
    expect(mirror()).not.toContain("interface render:");
  });

  it("reads a rendered page against the root home, else the first nested one", () => {
    const here = workspace();
    expect(pageHome(here.root)).toBeUndefined();
    const home = (name: string): string =>
      `---\nname: ${name}\ncolors:\n  accent: "#dc2626"\n---\n\n## Overview\n\n${name}.\n`;
    here.write("src/app/DESIGN.md", home("App"));
    expect(pageHome(here.root)?.name).toBe("App");
    here.write("DESIGN.md", home("Root"));
    expect(pageHome(here.root)?.name).toBe("Root");
  });

  it("measures the survey's rows at the commit and keeps the rows read", async () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    here.write(
      ".greenline/ledger/interface/survey.json",
      `${JSON.stringify({
        generatedBy: "the agent",
        rows: [{ fact: "voice", value: "plain", source: { kind: "read", from: "README.md" } }],
      })}\n`,
    );
    const ran = await check(here, "interface", "--survey");
    expect(ran.code, ran.out).toBe(0);
    const sheet = parseSurvey(
      readFileSync(join(here.root, ".greenline/ledger/interface/survey.json"), "utf8"),
    );
    const rows = sheet._tag === "ok" ? sheet.value.rows : [];
    expect(rows.map((row) => row.fact)).toContain("interface files");
    expect(rows.find((row) => row.fact === "colours in use")?.value).toContain("#e11 (1)");
    expect(rows.find((row) => row.fact === "voice")?.source).toEqual({
      kind: "read",
      from: "README.md",
    });
    expect(rows.find((row) => row.fact === "platform")?.source).toMatchObject({
      kind: "measured",
      command: "greenline check interface --survey",
    });
  });
});

describe("J-148 S4 the check reads a template's address from the served addresses", () => {
  it("records the page a declared page line names and names a template no page line names, never its file's path", async () => {
    const here = workspace();
    const path = join(here.root, ".greenline", "manifest.json");
    const manifest = z
      .object({ interface: z.record(z.string(), z.unknown()) })
      .passthrough()
      .parse(JSON.parse(readFileSync(path, "utf8")));
    here.write(
      ".greenline/manifest.json",
      `${JSON.stringify({
        ...manifest,
        interface: {
          ...manifest.interface,
          roots: ["tally/templates"],
          extensions: ["html"],
          confirmed: true,
        },
      })}\n`,
    );
    here.write("tally/templates/tally/home.html", "<main><h1>Tally</h1></main>\n");
    openChange(
      here,
      ["choice: accepted", 'yes: "Yes."', "interface: yes"],
      "## Interface\n\n- page /: tally/templates/tally/home.html\n",
    );
    here.write("tally/templates/tally/home.html", "<main><h1>Tally, today</h1></main>\n");
    here.write("tally/templates/tally/list.html", "<ul></ul>\n");
    const ran = await check(here, "interface");
    expect(ran.out).toContain(
      "not checked: tally/templates/tally/list.html, a template no page line names;",
    );
    const folder = join(here.root, ".greenline", "ledger", ID, "interface");
    const [name] = readdirSync(folder);
    const fact = z
      .object({ pages: z.array(z.string()) })
      .passthrough()
      .parse(JSON.parse(readFileSync(join(folder, name ?? ""), "utf8")));
    expect(fact.pages).toEqual(["/"]);
    expect(ran.out).not.toContain("/tally/home.html");
  });
});

describe("J-148 S3 the findings by tier after every write, and the redesign's evidence", () => {
  it("returns the counts by tier after an interface write that finds nothing, never silence (F12)", () => {
    const here = workspace();
    openChange(here, ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"']);
    const clean = "export const Note = () => <p>Saved.</p>;\n";
    here.write("src/components/Note.tsx", clean);
    const after = fire(here.root, {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: here.root,
      tool_input: { file_path: join(here.root, "src/components/Note.tsx"), content: clean },
    });
    expect(after.code).toBe(0);
    const context = CONTEXT.parse(JSON.parse(after.out)).hookSpecificOutput.additionalContext;
    expect(context).toContain("greenline interface rules on src/components/Note.tsx:\n");
    expect(context).toMatch(/interface checks: floor 0 red, reflex 0 red \(0 waived\), finish \d+/);
  });

  it("holds a redesign's check red until its before capture and kept list stand, the start read where loads are recorded (F5)", async () => {
    const here = workspace();
    openChange(
      here,
      ["choice: accepted", 'yes: "Yes."', 'interface: "yes, app"'],
      "## start\n\nA redesign of the members page.\n",
    );
    here.write("src/app/page.tsx", "export default function Page() { return <main>New</main>; }\n");
    const ran = await check(here, "interface");
    expect(ran.code).toBe(1);
    expect(ran.out).toContain(`.greenline/ledger/${ID}.md:0 redesign-evidence: `);
    // No load is recorded on this workspace, so the start is not read; the capture and the list are.
    expect(ran.out).toContain("missing: a before capture");
    expect(ran.out).not.toContain("the redesign start, never loaded");
    expect(ran.out).toContain(`the kept list, .greenline/ledger/${ID}/kept.json`);
  });
});
