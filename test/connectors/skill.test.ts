import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseLedgerRecord } from "../../src/core/execution-ledger.ts";
import { splitManagedBlock } from "../../src/core/managed-block.ts";
import type { Manifest } from "../../src/core/manifest.ts";
import { POLICY_BLOCK_KEY, renderProjection } from "../../src/core/render.ts";
import { compileInstallation } from "../../src/shell/installation.ts";
import { startInspector, type InspectorHandle } from "../../src/shell/inspect/server.ts";
import { fixtureConfiguration } from "../fixtures/corpus.ts";
import { makeRepository, read, removeRepository, run, tree } from "./workspace.ts";

/**
 * The opt-in use-garden skill as the corpus ships it (the decoupling plan's
 * Phase 5 step 3, D-15 and D-17): installed and pointed to only while garden
 * is enabled, absent from every normal setup, and never a duty before every
 * edit. Every case runs on the installation compiled from the real corpus.
 */

const compiled = compileInstallation(join(import.meta.dirname, "..", "..", "corpus"));
if (compiled._tag === "err") throw compiled.error;
const installation = compiled.value;

/** The one sentence the block carries for garden, and only while garden is enabled. */
const POINTER =
  "An open engineering choice the repository does not settle, made in a change or only recommended, where garden's published guidance would inform it";
const URL = "https://garden.example/";
/** Every file the skill installs across both harness trees. */
const SKILL_FILES: readonly string[] = [
  ".agents/skills/use-garden/SKILL.md",
  ".agents/skills/use-garden/agents/openai.yaml",
  ".agents/skills/use-garden/operations.md",
  ".claude/skills/use-garden/SKILL.md",
  ".claude/skills/use-garden/operations.md",
];
const ENABLED: Manifest = {
  ...fixtureConfiguration,
  connectors: { garden: { endpoint: URL, executable: "garden" } },
};

const roots: string[] = [];
const inspectors: InspectorHandle[] = [];
afterEach(async () => {
  for (const handle of inspectors.splice(0)) await handle.close();
  for (const root of roots.splice(0)) removeRepository(root);
});

/** An initialized workspace from the real corpus, garden disabled. */
function workspace(prefix: string): string {
  const root = makeRepository(prefix);
  roots.push(root);
  expect(run(root, ["init", "--yes"], { installation }).code).toBe(0);
  return root;
}

/** Run a connectors command on the real corpus. */
function connectors(root: string, ...args: readonly string[]) {
  return run(root, ["connectors", ...args], { installation });
}

/** The block a projection renders into AGENTS.md. */
function renderedBlock(manifest: Manifest): string {
  const agents = renderProjection(manifest, installation).find((file) => file.path === "AGENTS.md");
  return agents?.content ?? "";
}

/** The managed block a workspace's AGENTS.md holds. */
function installedBlock(root: string): string {
  return splitManagedBlock(read(root, "AGENTS.md"), POLICY_BLOCK_KEY).block ?? "";
}

/** The installed text of one of the skill's files, as a harness reads it. */
function installedText(name: string): string {
  const file = renderProjection(ENABLED, installation).find(
    (entry) => entry.path === `.claude/skills/use-garden/${name}`,
  );
  return file?.content ?? "";
}

/** The installed text of the skill, whitespace folded. */
function skillText(): string {
  return installedText("SKILL.md").replace(/\s+/g, " ");
}

describe("use-garden in the corpus", () => {
  it("the corpus carries use-garden as an implicit discipline with its support page and one pointer row", () => {
    const skill = installation.skills.find((entry) => entry.name === "use-garden");
    expect(skill?.class).toBe("discipline");
    expect(skill?.activation).toBe("implicit");
    expect(skill?.optIn).toBeUndefined();
    expect(skill?.supportFiles?.map((file) => file.path)).toEqual(["operations.md"]);
    expect(installation.intents.filter((row) => row.skills.includes("use-garden"))).toEqual([
      { intent: POINTER, skills: ["use-garden"] },
    ]);
  });

  it("normal setup installs nothing for garden: init writes no use-garden file, pointer or roster name", () => {
    const root = workspace("setup");
    for (const [path] of tree(root)) expect(path).not.toContain("use-garden");
    expect(installedBlock(root)).not.toMatch(/garden/i);
    expect(read(root, "CLAUDE.md")).not.toMatch(/garden/i);
    expect(read(root, "agents/openai.yaml")).not.toContain("use-garden");
    expect(read(root, ".greenline/lock.json")).not.toContain("use-garden");
  });

  it("with garden disabled the block has no garden duty, pointer or advertised skill, and no other method names it", () => {
    const projection = renderProjection(fixtureConfiguration, installation);
    expect(projection.some((file) => file.path.includes("use-garden"))).toBe(false);
    expect(renderedBlock(fixtureConfiguration)).not.toMatch(/garden/i);
    const methods = projection.filter(
      (file) => file.path.startsWith(".agents/") || file.path.startsWith(".claude/"),
    );
    for (const file of methods) expect(file.content, file.path).not.toMatch(/garden/i);
    // Generic documentation may describe the optional integration, as the owner's step.
    const work = projection.find((file) => file.path === ".greenline/WORK.md")?.content ?? "";
    expect(work.replace(/\s+/g, " ")).toContain(
      "Enabling and disabling garden are the owner's steps, never the agent's.",
    );
  });

  it("with garden enabled the block adds exactly the roster name and the one pointer row", () => {
    const disabled = renderedBlock(fixtureConfiguration).split("\n");
    const enabled = renderedBlock(ENABLED).split("\n");
    const gardenLines = enabled.filter((line) => /garden/i.test(line));
    expect(gardenLines).toEqual([
      expect.stringMatching(/^- discipline: .*\buse-garden$/),
      `| ${POINTER} | use-garden |`,
    ]);
    // Every other line of the block is the disabled block's own, in its order.
    expect(enabled.filter((line) => !/garden/i.test(line))).toEqual(
      disabled.filter((line) => !line.startsWith("- discipline: ")),
    );
    expect(disabled.find((line) => line.startsWith("- discipline: "))).toBe(
      gardenLines[0]?.replace(/, use-garden$/, ""),
    );
  });
});

describe("relevant against unnecessary lookups, on the installed text", () => {
  // Each case is a situation an agent meets with garden enabled, and the text
  // the block or the skill carries that decides whether garden is read.
  const relevant: readonly (readonly [string, string])[] = [
    [
      "an open choice between approaches the repository does not settle",
      "a choice between approaches, libraries or patterns for a technology a governed root declares",
    ],
    [
      "a pitfall or a security rule for a concern the change touches",
      "a known pitfall, a security or data-handling rule, or a verification practice for a concern the change touches",
    ],
    [
      "a unit a repository decision names",
      "a unit or an anchor that a repository decision or an earlier consultation names by its id",
    ],
  ];
  const unnecessary: readonly (readonly [string, string])[] = [
    [
      "a factual question about this repository",
      "a factual question about this repository: inspect its files and answer",
    ],
    [
      "a settled local change, the light path",
      "a change whose choices are already settled, the light path among them",
    ],
    [
      "a question the repository's decisions already answer",
      "a question the repository's own decisions already answer",
    ],
    [
      "every edit, as a ritual",
      "It never makes a read due before every edit, at the start of a session or as a ritual before a handoff.",
    ],
  ];

  /** The skill's two lists: what makes a consultation relevant, and what triggers no read. */
  interface SkillLists {
    readonly consult: string;
    readonly skip: string;
  }
  function lists(): SkillLists {
    const text = skillText();
    const consult = text.slice(
      text.indexOf("Consult garden when"),
      text.indexOf("These trigger no read:"),
    );
    const skip = text.slice(
      text.indexOf("These trigger no read:"),
      text.indexOf("## What must be in place"),
    );
    return { consult, skip };
  }

  it.each(relevant)("relevant: %s", (_situation, text) => {
    const { consult, skip } = lists();
    expect(consult).toContain(text);
    expect(skip).not.toContain(text);
  });

  it.each(unnecessary)("no read: %s", (_situation, text) => {
    const { consult, skip } = lists();
    expect(skip).toContain(text);
    expect(consult).not.toContain(text);
  });

  it("no sentence of the skill makes a consultation a duty: its one mention of every edit is the never-sentence", () => {
    const sentences = skillText().split(/(?<=[.:;])\s+/);
    const duty = sentences.filter((sentence) =>
      /\b(must|always|required to|have to)(\s+\w+){0,2}\s+(consult|read|call)\b|\bbefore (every|each|any) edit|\bconsult\w* (first|before)/i.test(
        sentence,
      ),
    );
    expect(duty).toEqual([
      "It never makes a read due before every edit, at the start of a session or as a ritual before a handoff.",
    ]);
  });

  it("the enabled block carries no garden duty: its only garden text is the roster name and the pointer, which asks nothing", () => {
    const block = renderedBlock(ENABLED);
    const lines = block.split("\n").filter((line) => /garden/i.test(line));
    expect(lines).toHaveLength(2);
    for (const line of lines)
      expect(line).not.toMatch(/\b(must|always|before every|required|ask|retrieve)\b/i);
    // A factual question about the repository reads nothing, by the block's own general rule.
    expect(block.replace(/\s+/g, " ")).toContain(
      "For a factual question about this repository, inspect its files and answer: never retrieve guidance or create accounting merely to answer it.",
    );
  });

  it("the skill permits relevant consultation without a per-lookup question, and never enables or runs garden itself", () => {
    const text = skillText();
    expect(text).toContain(
      "you may consult it whenever a question below is relevant, without asking each time",
    );
    expect(text).toContain("You never enable, disable, install or reconfigure garden yourself.");
    expect(text).toContain("You never run the garden command yourself either");
  });

  it("the skill meets private-data as a credential that nearly left, never as refused access", () => {
    const text = skillText();
    const row = text.slice(text.indexOf("| `private-data`"), text.indexOf("| `protocol`"));
    expect(row).toContain("Nothing carrying it was sent or written.");
    expect(row).toContain("Never put the key, or anything derived from it, into a flag value.");
    expect(row).toContain("Do not repeat the same call.");
    const access = text.slice(text.indexOf("| `unauthorized`"), text.indexOf("| `private-data`"));
    expect(access).not.toContain("private-data");
  });
});

describe("J-39 S1: a recommendation consults under an answer's account, the hold stays narrow, and a consultation that cannot run is still attempted", () => {
  /** The folded installed text from one marker up to the next, or to the end. */
  function section(from: string, to?: string): string {
    const text = skillText();
    const start = text.indexOf(from);
    expect(start, from).toBeGreaterThanOrEqual(0);
    return text.slice(start, to === undefined ? text.length : text.indexOf(to, start));
  }
  const relevant = () => section("## When a consultation is relevant", "These trigger no read:");
  const failing = () => section("## When a consultation fails");

  it("the routing row and the skill's rule carry one condition: a request for a recommendation alone is consultable", () => {
    const row = installation.intents.find((entry) => entry.skills.includes("use-garden"));
    expect(row?.intent).toContain("made in a change or only recommended");
    expect(relevant()).toContain(
      "A request that asks only for a recommendation on such a choice is consultable like a change that makes it",
    );
    // The factual question, the settled change and the light path still read nothing.
    const skip = section("These trigger no read:", "## What must be in place");
    expect(skip).toContain(
      "a factual question about this repository: inspect its files and answer",
    );
    expect(skip).toContain("a change whose choices are already settled, the light path among them");
  });

  it("the block's rule against accounting merely to answer covers a factual question only, and a recommendation is still not acted on", () => {
    expect(relevant()).toContain(
      "The block's rule against retrieving guidance or creating accounting merely to answer covers a factual question about this repository only.",
    );
    expect(relevant()).toContain("It is still answered, not acted on");
  });

  it("a consultation that was not made is never announced", () => {
    expect(
      section("Enabling permits relevant consultation.", "## What must be in place"),
    ).toContain("Never announce or imply a consultation that was not made.");
  });

  it("the skill names the minimal recorded request, a planning account with no work artifact, and no longer turns an answer away", () => {
    const account = section("**An execution account.**", "You never enable");
    expect(account).toContain("a planning account with no work artifact");
    expect(account).toContain('`"role": "planning"`, `"work": null`');
    expect(account).toContain(
      "doctor reports as an error any observed file change under it beyond the account and its receipts",
    );
    expect(skillText()).not.toContain(
      "Work with no account, an answer or a light fix, consults nothing",
    );
  });

  it("the answer's account the operations page shows is one the ledger admits: planning, no work", () => {
    const page = installedText("operations.md");
    const example = /## An answer's account[\s\S]*?```json\n([\s\S]*?)```/.exec(page)?.[1];
    expect(example).toBeDefined();
    const parsed = parseLedgerRecord(example ?? "", "operations.md");
    if (parsed._tag === "err") throw parsed.error;
    expect(parsed.value).toMatchObject({ role: "planning", work: null });
  });

  it("the hold covers only the action the missing guidance governs, the harness rule's own example stated, and ordinary local work continues", () => {
    const text = failing();
    expect(text).toContain("hold only the action that guidance governs");
    expect(text).toContain(
      "a rule that conditions a harness change on garden's guidance holds that harness change, never a test case added under the existing harness",
    );
    expect(text).toContain("ordinary local work never waits for garden");
    expect(text).not.toContain("hold the action that depends on it");
  });

  it("a relevant consultation that cannot run is still attempted through the connector, with or without an account before it, so its failure is a receipt", () => {
    const text = failing();
    expect(text).toContain(
      "A relevant consultation is attempted even when garden looks unavailable.",
    );
    expect(text).toContain(
      "under the work's account, or an answer's planning account created for it",
    );
    expect(text).toContain("so the failure is recorded as a receipt with its kind");
    expect(text).toContain("with one notice and no permission question");
  });
});

describe("enable and disable with the real skill", () => {
  it("enabling installs use-garden in both harness trees with its pointer; disabling removes them and leaves the workspace exactly as it was", () => {
    const root = workspace("cycle");
    writeFileSync(
      join(root, "AGENTS.md"),
      `# House notes\n\n${read(root, "AGENTS.md")}\nKeep this line.\n`,
    );
    mkdirSync(join(root, ".claude/skills/house-notes"), { recursive: true });
    writeFileSync(join(root, ".claude/skills/house-notes/NOTES.md"), "The owner's own file.\n");
    const before = tree(root);
    expect(connectors(root, "enable", "garden", "--url", URL).code).toBe(0);
    for (const path of SKILL_FILES) expect(existsSync(join(root, path)), path).toBe(true);
    expect(read(root, ".claude/skills/use-garden/SKILL.md")).toContain('name: "use-garden"');
    expect(installedBlock(root)).toContain(`| ${POINTER} | use-garden |`);
    expect(read(root, "AGENTS.md")).toMatch(/^# House notes\n/);
    expect(read(root, "AGENTS.md").endsWith("\nKeep this line.\n")).toBe(true);
    expect(connectors(root, "disable", "garden").code).toBe(0);
    // Files and directories alike: no use-garden directory is left behind empty.
    expect(tree(root)).toEqual(before);
  });

  it("a file the owner added inside the skill's directory keeps that directory when disabling removes the skill", () => {
    const root = workspace("kept");
    expect(connectors(root, "enable", "garden", "--url", URL).code).toBe(0);
    writeFileSync(join(root, ".claude/skills/use-garden/notes.md"), "Mine.\n");
    expect(connectors(root, "disable", "garden").code).toBe(0);
    expect(read(root, ".claude/skills/use-garden/notes.md")).toBe("Mine.\n");
    expect(existsSync(join(root, ".claude/skills/use-garden/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".agents/skills/use-garden"))).toBe(false);
  });

  it("sync's forced removal of an orphaned skill leaves no empty directory either", () => {
    const root = workspace("orphan");
    const path = join(root, ".greenline/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(
      path,
      `${JSON.stringify({ ...manifest, skills: { include: [], exclude: ["grilling"] } }, null, 2)}\n`,
    );
    expect(run(root, ["sync"], { installation }).code).toBe(0);
    expect(existsSync(join(root, ".claude/skills/grilling/SKILL.md"))).toBe(true);
    const forced = run(
      root,
      [
        "sync",
        "--force-managed",
        ".claude/skills/grilling/SKILL.md",
        "--force-managed",
        ".agents/skills/grilling/SKILL.md",
        "--force-managed",
        ".agents/skills/grilling/agents/openai.yaml",
      ],
      { installation },
    );
    expect(forced.code).toBe(0);
    expect(existsSync(join(root, ".claude/skills/grilling"))).toBe(false);
    expect(existsSync(join(root, ".agents/skills/grilling"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills"))).toBe(true);
  });
});

describe("the inspector and garden's skill", () => {
  /** Serve the inspector over a workspace on the real corpus. */
  async function inspector(root: string): Promise<string> {
    const handle = await startInspector(root, { cwd: root, version: "0.1.0", installation }, 0);
    inspectors.push(handle);
    return handle.url;
  }
  /** Save the inspector's settings the way its page does, with these skill choices. */
  async function saveSkills(url: string, skills: { include: string[]; exclude: string[] }) {
    const state = await (await fetch(`${url}api/state`)).json();
    return fetch(`${url}api/manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: state.editRevision, skills }),
    });
  }
  const manifestOf = (root: string) => JSON.parse(read(root, ".greenline/manifest.json"));

  it("the inspector never lists use-garden, and a save with garden disabled writes no exclusion that would block enabling", async () => {
    const root = workspace("inspect-off");
    const url = await inspector(root);
    const state = await (await fetch(`${url}api/state`)).json();
    const names = state.skills.map((skill: { name: string }) => skill.name);
    expect(names).toContain("grilling");
    expect(names).not.toContain("use-garden");
    // Even a request naming it, as a page that listed it would send, writes nothing for it.
    const saved = await saveSkills(url, { include: [], exclude: ["grilling", "use-garden"] });
    expect(saved.status).toBe(200);
    expect(manifestOf(root).skills).toEqual({ include: [], exclude: ["grilling"] });
    expect(connectors(root, "enable", "garden", "--url", URL).code).toBe(0);
  });

  it("a save with garden enabled keeps garden and its skill, and a hand-written exclusion survives a save", async () => {
    const root = workspace("inspect-on");
    expect(connectors(root, "enable", "garden", "--url", URL).code).toBe(0);
    const url = await inspector(root);
    const saved = await saveSkills(url, { include: ["use-garden"], exclude: [] });
    expect(saved.status).toBe(200);
    expect(manifestOf(root).skills).toEqual({ include: [], exclude: [] });
    expect(manifestOf(root).connectors).toEqual({
      garden: { endpoint: URL, executable: "garden" },
    });
    expect(connectors(root, "disable", "garden").code).toBe(0);
    const path = join(root, ".greenline/manifest.json");
    writeFileSync(
      path,
      `${JSON.stringify({ ...manifestOf(root), skills: { include: [], exclude: ["use-garden"] } }, null, 2)}\n`,
    );
    expect((await saveSkills(url, { include: [], exclude: ["grilling"] })).status).toBe(200);
    expect(manifestOf(root).skills).toEqual({ include: [], exclude: ["grilling", "use-garden"] });
  });
});
