import { describe, expect, it } from "vitest";
import {
  POLICY_BLOCK_KEY,
  renderAgentsPolicyBlock,
  renderClaudePolicyBlock,
  renderCodexCatalog,
  renderCodexSkillMetadata,
  renderLedgerGuide,
  renderProjection,
  renderSkillFile,
} from "../../src/core/render.ts";
import { renderRecordSkeleton } from "../../src/core/change.ts";
import { SKELETONS_LINE } from "../../src/core/installation.ts";
import { displayName, type SkillSource } from "../../src/core/skill.ts";
import type { Manifest } from "../../src/core/manifest.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { FIXTURE_MODES } from "../fixtures/chain.ts";
import { fixtureConfiguration, fixtureSkills, fixtureInstallation } from "../fixtures/corpus.ts";

function manifestWith(overrides: Partial<Manifest>): Manifest {
  return { ...fixtureConfiguration, ...overrides };
}

function fixtureSkillAt(index: number): SkillSource {
  const skill = fixtureSkills[index];
  if (skill === undefined) throw new Error(`fixture skill at index ${index} is missing`);
  return skill;
}

const deliveryReview = (): SkillSource => fixtureSkillAt(0);
const grilling = (): SkillSource => fixtureSkillAt(1);

describe("renderSkillFile", () => {
  it("renders frontmatter and body with one trailing newline", () => {
    const file = renderSkillFile(fixtureSkillAt(0));
    expect(file).toBe(
      [
        "---",
        'name: "delivery-review"',
        'description: "Review committed work against the ticket contract."',
        "---",
        "",
        "# Delivery Review",
        "",
        "Read the commit range and the ticket, then report findings.",
        "",
      ].join("\n"),
    );
  });

  it("normalizes the trailing newline regardless of input body", () => {
    const file = renderSkillFile({
      name: "x",
      description: "d",
      kind: "habit",
      activation: "implicit",
      body: "body",
    });
    expect(file.endsWith("body\n")).toBe(true);
  });
});

describe("renderCodexSkillMetadata", () => {
  it("expresses the activation policy once per harness convention", () => {
    expect(renderCodexSkillMetadata(grilling())).toBe(
      [
        "interface:",
        '  display_name: "Grilling"',
        '  short_description: "Grill the operator about a plan before building it."',
        "",
      ].join("\n"),
    );
    expect(renderCodexSkillMetadata(deliveryReview())).toBe(
      [
        "interface:",
        '  display_name: "Delivery Review"',
        '  short_description: "Review committed work against the ticket contract."',
        "policy:",
        "  allow_implicit_invocation: false",
        "",
      ].join("\n"),
    );
  });
});

describe("renderCodexCatalog", () => {
  it("S16a lists installed skills sorted by name with their kind and activation", () => {
    // Input order is the caller's selection; the projection sorts first.
    expect(renderCodexCatalog([deliveryReview(), grilling()])).toBe(
      [
        "version: 1",
        "skills:",
        '  - name: "delivery-review"',
        '    path: ".agents/skills/delivery-review"',
        '    kind: "step"',
        '    activation: "explicit"',
        '  - name: "grilling"',
        '    path: ".agents/skills/grilling"',
        '    kind: "habit"',
        '    activation: "implicit"',
        "",
      ].join("\n"),
    );
  });
});

/** The fixture definition: two steps; two floors at one mode; and a fourth kind, a ritual, which no code knows. */
function blockDefinition(): ModesDefinition {
  // SAFETY: FIXTURE_MODES is the fixture's own definition, written as the file would be.
  const raw = JSON.parse(FIXTURE_MODES) as { kinds: readonly object[] };
  const parsed = parseModes(
    JSON.stringify({
      ...raw,
      kinds: [
        ...raw.kinds,
        {
          name: "ritual",
          mechanism: "arise",
          record: "none",
          place: "beside",
          budget: "free",
          when: "A fixture ritual runs when its hour comes.",
        },
      ],
      floors: [
        { name: "contract", risk: "a public contract", mode: "careful" },
        { name: "secrets", risk: "secrets", mode: "careful" },
      ],
    }),
    "modes.json",
  );
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

/** A fixture skill of a kind, with its facts. */
function kindSkill(name: string, facts: Partial<SkillSource>): SkillSource {
  return {
    name,
    description: `The ${name} fixture.`,
    kind: "habit",
    activation: "implicit",
    body: "Body.",
    ...facts,
  };
}

const outline = kindSkill("outline", { kind: "step", slot: "outline", activation: "explicit" });
const check = kindSkill("check", { kind: "step", slot: "check", activation: "explicit" });
const opener = kindSkill("fixture-start", { kind: "start", activation: "explicit" });
const habit = kindSkill("fixture-habit", {});
const installedExtra = kindSkill("installed-extra", { extra: true });
const absentExtra = kindSkill("absent-extra", { extra: true });
const excluded = kindSkill("excluded-habit", {});
const trialHabit = kindSkill("trial-habit", { trial: true });
const ritual = kindSkill("fixture-ritual", { kind: "ritual" });

const blockIntents = [
  { intent: "Outline the change", skills: ["outline"] },
  { intent: "Begin from a loose request", skills: ["fixture-start"] },
  { intent: "A test is written", skills: ["fixture-habit", "excluded-habit"] },
  { intent: "Only the excluded habit applies", skills: ["excluded-habit"] },
  { intent: "A large drawing is wanted", skills: ["absent-extra"] },
  { intent: "An installed drawing is wanted", skills: ["installed-extra"] },
  { intent: "A new idea is tried", skills: ["trial-habit"] },
  { intent: "The hour comes", skills: ["fixture-ritual"] },
];

describe("S16a renderAgentsPolicyBlock: the loop's prose, the modes and the roster by kind", () => {
  const installed = [outline, check, opener, habit, installedExtra, trialHabit, ritual];
  const available = [...installed, absentExtra, excluded];
  const block = renderAgentsPolicyBlock({
    guide: "# Guide\nUse repository evidence.\n",
    modes: blockDefinition(),
    installed,
    available,
    intents: blockIntents,
  });

  it("composes the block from the definition, the installed skills and the intent rows", () => {
    expect(block).toBe(
      [
        "> Owned region, generated by the greenline CLI. Do not edit.",
        "",
        "# Guide",
        "Use repository evidence.",
        "",
        "## The modes",
        "",
        "| Mode | quick | careful |",
        "| --- | --- | --- |",
        "| Promise | a quick fixture change | a careful fixture change |",
        "| Typical request | a one-line fixture fix | a fixture change with a contract |",
        "| Agents, at most | 1 | 2 |",
        "| outline | none | written |",
        "| check | inline | independent, 1 agent |",
        "| Fix rounds, per step | 0 | 1 |",
        "",
        "The agents count the builder; check takes the mode's fix rounds.",
        "",
        "A floor raises your proposal to at least the mode it names: careful for a public contract or secrets.",
        "",
        "## Step skills",
        "",
        "A fixture step runs where the fixture mode reaches it.",
        "",
        "1. `outline`",
        "2. `check`",
        "",
        "## Start skills",
        "",
        "A fixture start is chosen when a fixture request begins.",
        "",
        "| The situation | Start |",
        "| --- | --- |",
        "| Begin from a loose request | `fixture-start` |",
        "",
        "## Habit skills",
        "",
        "A fixture habit loads when its situation arises.",
        "",
        "| The situation | Habit |",
        "| --- | --- |",
        "| A test is written | `fixture-habit` |",
        "| A large drawing is wanted | `absent-extra` (extra, installs on request) |",
        "| An installed drawing is wanted | `installed-extra` (extra) |",
        "| A new idea is tried | `trial-habit` (trial) |",
        "",
        "## Ritual skills",
        "",
        "A fixture ritual runs when its hour comes.",
        "",
        "| The situation | Ritual |",
        "| --- | --- |",
        "| The hour comes | `fixture-ritual` |",
      ].join("\n"),
    );
  });

  it("introduces each kind once, by the when-sentence its definition states", () => {
    for (const kind of blockDefinition().kinds)
      expect(block.split(kind.when).length - 1, kind.name).toBe(1);
  });

  it("drops the steps' intent rows, since the line lists the steps, and the rows of skills not installed", () => {
    expect(block).not.toContain("Outline the change");
    expect(block).not.toContain("Only the excluded habit applies");
    expect(block).not.toContain("excluded-habit");
  });

  it("lists every step of the line in its order, saying so where no skill serves one", () => {
    const bare = renderAgentsPolicyBlock({
      guide: "# Guide",
      modes: blockDefinition(),
      installed: [check],
      available: [check],
      intents: [],
    });
    expect(bare).toContain("1. outline: no skill installed\n2. `check`");
    // A kind beside the line with no row to list leaves no section.
    expect(bare).not.toContain("## Start skills");
    expect(bare).not.toContain("## Habit skills");
  });

  it("names a step's skill beside the step when it differs from the step's name", () => {
    const named = renderAgentsPolicyBlock({
      guide: "# Guide",
      modes: blockDefinition(),
      installed: [outline, kindSkill("checker", { kind: "step", slot: "check" })],
      available: [],
      intents: [],
    });
    expect(named).toContain("2. check: `checker`");
  });

  it("J-73 S2 prints each mode's agents derived from its depths", () => {
    // careful runs the step check with one independent agent beside the builder.
    expect(block.split("\n").find((line) => line.startsWith("| Agents, at most"))).toBe(
      "| Agents, at most | 1 | 2 |",
    );
  });

  it("carries no description, which each harness's per-skill metadata already ships", () => {
    expect(block).not.toContain("The fixture-habit fixture.");
  });
});

describe("renderClaudePolicyBlock", () => {
  it("imports the shared AGENTS.md policy", () => {
    expect(renderClaudePolicyBlock()).toBe(
      "> Owned region, generated by the greenline CLI. Do not edit.\n\n@AGENTS.md",
    );
  });
});

/** The git hooks' scripts and dsh's adapter, which every default workspace holds (J-93 S3). */
const HOOK_FILES = [
  ".greenline/hooks/commit-msg",
  ".greenline/hooks/dsh.json",
  ".greenline/hooks/post-rewrite",
  ".greenline/hooks/pre-commit",
  ".greenline/hooks/pre-push",
  ".greenline/hooks/pre-rebase",
  ".greenline/hooks/prepare-commit-msg",
  ".greenline/hooks/reference-transaction",
];

describe("renderProjection (golden)", () => {
  it("renders the fixture corpus byte-exactly for both targets", () => {
    const projection = renderProjection(fixtureConfiguration, fixtureInstallation());
    expect(projection.map((file) => file.path)).toEqual([
      ".agents/skills/delivery-review/SKILL.md",
      ".agents/skills/delivery-review/agents/openai.yaml",
      ".agents/skills/grilling/SKILL.md",
      ".agents/skills/grilling/agents/openai.yaml",
      ".claude/settings.json",
      ".claude/skills/delivery-review/SKILL.md",
      ".claude/skills/grilling/SKILL.md",
      ".codex/hooks.json",
      ".greenline/THIRD_PARTY_NOTICES.md",
      ".greenline/WORK.md",
      ...HOOK_FILES,
      ".greenline/ledger/README.md",
      ".greenline/tmp/.gitignore",
      "AGENTS.md",
      "CLAUDE.md",
      "agents/openai.yaml",
    ]);
    const byPath = new Map(projection.map((file) => [file.path, file.kind]));
    expect(byPath.get("AGENTS.md")).toBe("block");
    expect(byPath.get("CLAUDE.md")).toBe("block");
    expect(byPath.get("agents/openai.yaml")).toBe("file");
    const agentsTarget = projection.find((file) => file.path === "AGENTS.md");
    expect(agentsTarget?.key).toBe(POLICY_BLOCK_KEY);
  });

  it("is byte-stable across platforms: LF only, forward-slash paths", () => {
    const projection = renderProjection(fixtureConfiguration, fixtureInstallation());
    for (const file of projection) {
      expect(file.content).not.toContain("\r");
      expect(file.path).not.toContain("\\");
      if (file.kind !== "block") {
        expect(file.content.endsWith("\n")).toBe(true);
      } else {
        // Block bodies are embedded between markers; the marker join
        // owns the surrounding newlines.
        expect(file.content.endsWith("\n")).toBe(false);
      }
    }
  });

  it("renders only the selected harness", () => {
    const projection = renderProjection(
      manifestWith({ targets: ["claude-code"] }),
      fixtureInstallation(),
    );
    const paths = projection.map((file) => file.path);
    expect(paths.some((path) => path.startsWith(".agents/"))).toBe(false);
    expect(paths.some((path) => path.startsWith(".claude/"))).toBe(true);
    expect(paths).not.toContain("agents/openai.yaml");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
  });

  it("installs every default skill without a profile or language prerequisite", () => {
    const release = fixtureInstallation({
      skills: [
        ...fixtureSkills,
        {
          name: "ponytail-review",
          description: "Review minimalism.",
          kind: "start",
          activation: "explicit",
          body: "Review.",
        },
      ],
    });
    const paths = renderProjection(manifestWith({}), release).map((file) => file.path);
    expect(paths).toContain(".agents/skills/ponytail-review/SKILL.md");
    expect(paths).toContain(".claude/skills/grilling/SKILL.md");
  });

  it("honors skill excludes everywhere at once", () => {
    const projection = renderProjection(
      manifestWith({ skills: { exclude: ["grilling"], include: [] } }),
      fixtureInstallation(),
    );
    const anyGrilling = projection.some((file) => file.path.includes("grilling"));
    expect(anyGrilling).toBe(false);
    const block = projection.find((file) => file.path === "AGENTS.md")?.content ?? "";
    // The exclusion contract governs the roster by kind; the guide's prose
    // above it keeps naming its method owners.
    const roster = block.slice(block.indexOf("## Step skills"));
    expect(roster).not.toContain("grilling");
    expect(roster).toContain("review: `delivery-review`");
  });

  it("keeps both policy blocks and the tmp gitignore even with an empty corpus", () => {
    const projection = renderProjection(fixtureConfiguration, fixtureInstallation({ skills: [] }));
    expect(projection.map((file) => file.path)).toEqual([
      ".claude/settings.json",
      ".codex/hooks.json",
      ".greenline/THIRD_PARTY_NOTICES.md",
      ".greenline/WORK.md",
      ...HOOK_FILES,
      ".greenline/ledger/README.md",
      ".greenline/tmp/.gitignore",
      "AGENTS.md",
      "CLAUDE.md",
    ]);
  });

  it("renders the self-ignoring tmp workspace gitignore for every target", () => {
    // The ephemeral home (operator ruling, 2026-08-29): skills scratch in
    // .greenline/tmp/<skill>/ instead of host temp dirs; the directory
    // ignores itself and only the ignore file survives a clone.
    const projection = renderProjection(fixtureConfiguration, fixtureInstallation());
    const tmp = projection.find((file) => file.path === ".greenline/tmp/.gitignore");
    expect(tmp?.kind).toBe("file");
    expect(tmp?.content).toContain("*\n!.gitignore\n");
    const claudeOnly = renderProjection(
      manifestWith({ targets: ["claude-code"] }),
      fixtureInstallation(),
    );
    expect(claudeOnly.some((file) => file.path === ".greenline/tmp/.gitignore")).toBe(true);
  });

  it("emits a deterministic projection for identical inputs", () => {
    const first = JSON.stringify(renderProjection(fixtureConfiguration, fixtureInstallation()));
    const second = JSON.stringify(renderProjection(fixtureConfiguration, fixtureInstallation()));
    expect(first).toBe(second);
  });
});

describe("displayName", () => {
  it("humanizes kebab-case skill names", () => {
    expect(displayName("grilling")).toBe("Grilling");
    expect(displayName("delivery-review")).toBe("Delivery Review");
    expect(displayName("tdd")).toBe("TDD");
  });
});

describe("S17 renderProjection: a trial skill beside the line installs only where trials names it", () => {
  const trialStart: SkillSource = {
    name: "idea-sharpener",
    description: "a trial start",
    kind: "start",
    activation: "explicit",
    trial: true,
    body: "Sharpen the idea.",
  };
  const plainStart: SkillSource = {
    name: "plain-start",
    description: "a default start",
    kind: "start",
    activation: "explicit",
    body: "Start plainly.",
  };
  const intents = [
    { intent: "An idea is still vague", skills: ["idea-sharpener"] },
    { intent: "A plain start applies", skills: ["plain-start"] },
  ];
  const installation = fixtureInstallation({ skills: [trialStart, plainStart], intents });

  it("S17 leaves a trial start unlisted in trials off the disk and out of the block", () => {
    const files = renderProjection(manifestWith({}), installation);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain(".claude/skills/idea-sharpener/SKILL.md");
    expect(paths).not.toContain(".agents/skills/idea-sharpener/SKILL.md");
    expect(paths).toContain(".claude/skills/plain-start/SKILL.md");
    const block = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(block).not.toContain("idea-sharpener");
    expect(block).not.toContain("An idea is still vague");
    expect(files.find((f) => f.path === "agents/openai.yaml")?.content).not.toContain(
      "idea-sharpener",
    );
  });

  it("S17 installs a trial start that trials names and marks its row as a trial", () => {
    const files = renderProjection(manifestWith({ trials: ["idea-sharpener"] }), installation);
    const paths = files.map((f) => f.path);
    expect(paths).toContain(".claude/skills/idea-sharpener/SKILL.md");
    expect(paths).toContain(".agents/skills/idea-sharpener/SKILL.md");
    const block = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(block).toContain("| An idea is still vague | `idea-sharpener` (trial) |");
    expect(block).toContain("| A plain start applies | `plain-start` |");
  });

  it("J-93 S1 installs a step's skill with no trial mark, whatever trials names", () => {
    const premise: SkillSource = {
      name: "anticipate",
      description: "the premise review's skill",
      kind: "step",
      slot: "anticipate",
      activation: "explicit",
      body: "Attack the plan.",
    };
    const files = renderProjection(
      manifestWith({ trials: [] }),
      fixtureInstallation({ skills: [premise] }),
    );
    expect(files.map((f) => f.path)).toContain(".claude/skills/anticipate/SKILL.md");
    const block = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(block).toContain("3. `anticipate`\n");
    expect(block).not.toContain("(trial, runs only where enabled)");
  });
});

describe("S16a renderProjection: an extra skill installs on request", () => {
  const assetSkill: SkillSource = {
    name: "map-maker",
    description: "carries a code-shaped asset tree",
    kind: "start",
    activation: "explicit",
    extra: true,
    body: "Draw the map.",
    supportFiles: [{ path: "viewer/app.tsx", content: "export const App = () => null;" }],
  };
  const plainSkill: SkillSource = {
    name: "plain",
    description: "markdown only",
    kind: "habit",
    activation: "implicit",
    body: "Plain.",
  };
  const intents = [{ intent: "Draw the map", skills: ["map-maker"] }];

  it("leaves an extra skill off the disk unless the manifest includes it, and marks its row as installing on request", () => {
    const files = renderProjection(
      manifestWith({}),
      fixtureInstallation({ skills: [assetSkill, plainSkill], intents }),
    );
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain(".claude/skills/map-maker/SKILL.md");
    expect(paths).not.toContain(".claude/skills/map-maker/viewer/app.tsx");
    expect(paths).toContain(".claude/skills/plain/SKILL.md");
    const block = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(block).toContain("| Draw the map | `map-maker` (extra, installs on request) |");
  });

  it("installs an extra skill, assets and all, when the manifest's include list names it", () => {
    const files = renderProjection(
      manifestWith({ skills: { exclude: [], include: ["map-maker"] } }),
      fixtureInstallation({ skills: [assetSkill, plainSkill], intents }),
    );
    const paths = files.map((f) => f.path);
    expect(paths).toContain(".claude/skills/map-maker/SKILL.md");
    expect(paths).toContain(".agents/skills/map-maker/viewer/app.tsx");
    const block = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(block).toContain("| Draw the map | `map-maker` (extra) |");
  });

  it("S16a offers no extra the manifest excludes, since an exclusion wins over an include", () => {
    const files = renderProjection(
      manifestWith({ skills: { exclude: ["map-maker"], include: [] } }),
      fixtureInstallation({ skills: [assetSkill, plainSkill], intents }),
    );
    const block = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(block).not.toContain("map-maker");
  });

  it("keeps exclude above include: an included skill that is also excluded stays out", () => {
    const files = renderProjection(
      manifestWith({ skills: { exclude: ["map-maker"], include: ["map-maker"] } }),
      fixtureInstallation({ skills: [assetSkill] }),
    );
    expect(files.map((f) => f.path)).not.toContain(".claude/skills/map-maker/SKILL.md");
  });
});

describe("preserved support trees and external guidance", () => {
  it("keeps a selected method's complete support tree regardless of repository language", () => {
    const release = fixtureInstallation({
      skills: [
        {
          name: "method",
          description: "A coherent method.",
          kind: "habit",
          activation: "implicit",
          body: "Read the examples.",
          supportFiles: [
            { path: "references/go.md", content: "Go example.\n" },
            { path: "references/typescript.md", content: "TypeScript example.\n" },
          ],
        },
      ],
    });
    const files = renderProjection(manifestWith({}), release);
    expect(
      files.find((file) => file.path === ".agents/skills/method/references/go.md")?.content,
    ).toBe("Go example.\n");
    expect(
      files.find((file) => file.path === ".claude/skills/method/references/typescript.md")?.content,
    ).toBe("TypeScript example.\n");
  });
});

describe("S16b the ledger guide carries the skeleton of each mode", () => {
  const installation = fixtureInstallation();
  const guideOf = (manifest: Manifest): string =>
    renderProjection(manifest, installation).find(
      (file) => file.path === ".greenline/ledger/README.md",
    )?.content ?? "";

  it("S16b replaces the skeletons line with one skeleton per mode, generated from the definition", () => {
    const guide = guideOf(fixtureConfiguration);
    expect(guide).not.toContain(SKELETONS_LINE);
    expect(guide.startsWith("# Ledger\nSeparate delivery and application.\n\n")).toBe(true);
    for (const mode of installation.modes.modes)
      expect(guide).toContain(
        [
          `### ${mode.name}`,
          "",
          "```markdown",
          renderRecordSkeleton(installation.modes, mode).trimEnd(),
          "```",
        ].join("\n"),
      );
    expect(guide).not.toContain("trial");
    // J-93 S1: every mode keeps the whole record, a skipped step saying so.
    expect(guide.split("\n").filter((line) => line === "## anticipate")).toHaveLength(3);
    expect(guide).toContain("## anticipate\n\nnone at regular");
    expect(guide).toContain(
      "When the work is split into tickets, the planning record holds the sections of `frame`, `plan`, `anticipate`, `verify` and `close`, and each ticket's record those of `build`, `review`, `verify` and `close`. Each record holds its share whole, a step its mode does not run saying `none at <mode>`.",
    );
    expect(guide).toContain(
      "The `floors` field names each floor you found by its name: `security` for secrets or security; `data-migration` for a data migration; `concurrency` for concurrency; `public-contract` for a public contract; `unchecked-behavior` for a behavior change with no check that could fail.",
    );
  });

  it("J-93 S1 the guide depends on the definition alone, never on the trials a workspace names", () => {
    expect(guideOf(manifestWith({ trials: [] }))).toBe(
      renderLedgerGuide(installation.ledgerGuide, installation.modes),
    );
  });
});
