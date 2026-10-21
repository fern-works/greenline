import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCorpus } from "../../src/shell/corpus.ts";
import { compileInstallation } from "../../src/shell/installation.ts";
import { renderProjection } from "../../src/core/render.ts";
import { fixtureConfiguration } from "../fixtures/corpus.ts";

const corpusRoot = join(import.meta.dirname, "..", "..", "corpus");
const loaded = loadCorpus(corpusRoot);
if (loaded._tag !== "ok") throw new Error("the corpus does not load");
const roster = loaded.value;
const compiled = compileInstallation(corpusRoot);
if (compiled._tag === "err") throw compiled.error;
const installation = compiled.value;

/** The habits S18b re-cut in place, kept under their names. */
const KEPT = ["show-me", "progress-check", "use-garden"];
/** The five trial habits the intake placed, gated by the workspace's trials. */
const TRIALS = [
  "build-the-lever",
  "guard-the-context-window",
  "pr-writing",
  "to-questionnaire",
  "benchmark-checklist",
];
/** The three extras, two habits and a start, installed on request. */
const EXTRAS = ["diagram-design", "architecture-map", "product-description"];
/** Every roster name the re-cut retired or renamed, S13 to S18a. */
const RETIRED = [
  "grilling",
  "grill-with-docs",
  "research",
  "prototype",
  "to-spec",
  "to-tickets",
  "implement",
  "record-architecture-decisions",
  "domain-modeling",
  "delivery-review",
  "review-lens",
  "ponytail-review",
  "verify-this",
  "control-cli",
  "control-ui",
  "project-router",
  "diagnosing-bugs",
  "improve-codebase-architecture",
  "codebase-design",
  "model-the-domain",
  "type-system-discipline",
  "boundary-discipline",
  "fail-loud",
  "concurrency-method",
  "airgap-secrets",
  "unslop",
  "technical-writing",
  "answer-plainly",
];
const skill = (name: string) => {
  const found = roster.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`${name} is not on the roster`);
  return found;
};
/** A skill's prose pages: its body and its Markdown support files. */
const pages = (name: string) => [
  skill(name).body,
  ...(skill(name).supportFiles ?? [])
    .filter((file) => file.path.endsWith(".md"))
    .map((file) => file.content),
];
const blockOf = (trials: readonly string[]) =>
  renderProjection({ ...fixtureConfiguration, trials: [...trials] }, installation).find(
    (file) => file.path === "AGENTS.md",
  )?.content ?? "";

describe("S18b the kept habits, the trial habits and the extras", () => {
  it("S18b every habit of the slice is a habit with no handoff that writes no record of its own", () => {
    for (const name of [...KEPT, ...TRIALS, "diagram-design", "architecture-map"]) {
      expect(skill(name).kind, name).toBe("habit");
      expect(skill(name).body, name).not.toMatch(/^## Handoff$/m);
      expect(skill(name).body, name).toContain("writes no record of its own");
    }
    expect(skill("architecture-map").activation).toBe("explicit");
    expect(skill("show-me").activation).toBe("implicit");
    expect(skill("product-description").kind).toBe("start");
    expect(skill("product-description").body).toMatch(/^## Handoff$/m);
  });

  it("S18b flags the five trials and the three extras, and nothing else of the slice", () => {
    for (const name of TRIALS) {
      expect(skill(name).trial, name).toBe(true);
      expect(skill(name).extra, name).toBeUndefined();
    }
    for (const name of EXTRAS) {
      expect(skill(name).extra, name).toBe(true);
      expect(skill(name).trial, name).toBeUndefined();
    }
    for (const name of KEPT) {
      expect(skill(name).trial, name).toBeUndefined();
      expect(skill(name).extra, name).toBeUndefined();
    }
  });

  it("S18b no skill of the slice names a retired skill, a ticket's account, an old guide section, a parallel agent or a worktree", () => {
    for (const name of [...KEPT, ...TRIALS, ...EXTRAS])
      for (const text of pages(name)) {
        for (const retired of RETIRED)
          expect(text, `${name} names ${retired}`).not.toMatch(
            new RegExp(`(?<![\\w-])${retired}(?![\\w-])`),
          );
        expect(text, `${name} names the old records`).not.toMatch(
          /execution account|planning account|\binitiative|\bTKT-|\.greenline\/work\/|greenline doctor|annotative edit/i,
        );
        expect(text, `${name} names a worktree`).not.toMatch(/worktree/i);
        expect(text, `${name} runs agents in parallel`).not.toMatch(
          /(sub-?agents?|agents|delegates) in parallel|parallel (sub-?agents?|agents)|fan out with subagents|fan work out to subagents/i,
        );
      }
  });

  it("S18b product-description drafts one document after another and writes its entry file without an include syntax", () => {
    const body = skill("product-description").body;
    expect(body).toContain("## Phase 3: draft the rest, one after another");
    expect(body).toContain(
      "Draft them one after another, one document or small cluster at a time.",
    );
    expect(body).not.toContain("@AGENTS.md");
    expect(body).toContain("not one harness's include syntax");
  });

  it("S18b guard-the-context-window keeps payloads out of the thread and spends no agent", () => {
    const body = skill("guard-the-context-window").body;
    expect(body).toContain("Read a large output by excerpt");
    expect(body).toContain("starts no agent");
    expect(body).not.toMatch(/to subagents/);
    expect(body).toContain("a summary is not a full read");
  });

  it("S18b pr-writing links the change record and opens a PR only on the owner's word", () => {
    const body = skill("pr-writing").body;
    expect(body).toContain("Change record: `.greenline/ledger/<id>.md`");
    expect(body).toContain("The body is a projection of the change record");
    // J-73 S3: the push and the PR are the close step's landing; the habit offers only the forge edit.
    expect(body).toContain(
      "Pushing the branch and opening the PR are the close step's landing, offered there in one line and never here.",
    );
    expect(body).toContain("offer it, and do it on the owner's word");
    expect(body).not.toMatch(/Closes ABC-123|pr-lint/);
  });
});

describe("S18b the five trial habits are gated by trials", () => {
  const rows = new Map<string, string>([
    [
      "build-the-lever",
      "| Many similar edits, a migration, or an analysis or a check over many files | `build-the-lever` (trial) |",
    ],
    [
      "guard-the-context-window",
      "| A large output or a long file about to fill the thread, or a thread grown long mid-task | `guard-the-context-window` (trial) |",
    ],
    ["pr-writing", "| Writing a commit message, a PR title or a PR body | `pr-writing` (trial) |"],
    [
      "to-questionnaire",
      "| A decision only someone other than the owner can answer | `to-questionnaire` (trial) |",
    ],
    [
      "benchmark-checklist",
      "| A performance or eval number about to be reported, or deciding a choice | `benchmark-checklist` (trial) |",
    ],
  ]);

  it("S18b a trial habit the workspace has not named is neither installed nor listed", () => {
    const files = renderProjection({ ...fixtureConfiguration, trials: [] }, installation);
    const block = blockOf([]);
    for (const name of TRIALS) {
      expect(
        files.some((file) => file.path.includes(`/skills/${name}/`)),
        name,
      ).toBe(false);
      expect(block, name).not.toContain(`\`${name}\``);
    }
  });

  it("S18b a trial habit the workspace names is installed and its row marked a trial in the habit table", () => {
    const files = renderProjection({ ...fixtureConfiguration, trials: [...TRIALS] }, installation);
    const block = blockOf(TRIALS);
    const habits = block.slice(block.indexOf("## Habit skills"));
    for (const name of TRIALS) {
      for (const tree of [".claude", ".agents"])
        expect(
          files.some((file) => file.path === `${tree}/skills/${name}/SKILL.md`),
          `${tree} ${name}`,
        ).toBe(true);
      expect(habits, name).toContain(rows.get(name));
    }
  });

  it("S18b naming one trial habit installs that one alone", () => {
    const files = renderProjection(
      { ...fixtureConfiguration, trials: ["pr-writing"] },
      installation,
    );
    for (const name of TRIALS)
      expect(
        files.some((file) => file.path === `.claude/skills/${name}/SKILL.md`),
        name,
      ).toBe(name === "pr-writing");
  });
});

describe("S18b the line view holds the whole roster", () => {
  const line = readFileSync(join(corpusRoot, "ledger", "LINE.md"), "utf8");
  // The slot sections stand above "The pages", which names every roster skill again with its latest change (J-66).
  const slots = (line.split("\n## The pages\n")[0] ?? "")
    .split("\n")
    .map((row) => /^\| `([a-z0-9-]+)`/.exec(row)?.[1])
    .filter((slot) => slot !== undefined);

  it("S18b names every roster skill's slot on exactly one row, and no retired name", () => {
    for (const entry of roster) {
      const at = entry.kind === "step" ? (entry.slot ?? entry.name) : entry.name;
      expect(
        slots.filter((slot) => slot === at),
        entry.name,
      ).toHaveLength(1);
    }
    for (const retired of RETIRED) expect(slots, retired).not.toContain(retired);
    expect(slots.some((slot) => slot.startsWith("principle-"))).toBe(false);
  });
});
