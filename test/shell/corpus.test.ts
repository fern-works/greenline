import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadCorpus, loadCorpusManifest } from "../../src/shell/corpus.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const corpusRoot = join(import.meta.dirname, "..", "..", "corpus");
/** The ten roster names the merged habits retired at S18a. */
const RETIRED_HABITS = [
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
/** The habits S18a built: the six merged ones and the two kept under their names. */
const MERGED_HABITS = [
  "tdd",
  "ponytail",
  "deep-modules",
  "domain-and-types",
  "boundaries",
  "concurrency",
  "secrets",
  "prose",
];

it("refuses source bytes that cannot be preserved by the text-only corpus transport", () => {
  const root = mkdtempSync(join(tmpdir(), "greenline-source-bytes-"));
  try {
    writeFileSync(join(root, "manifest.json"), new Uint8Array([0xff, 0xfe, 0x61]));
    expect(loadCorpusManifest(root)).toMatchObject({
      _tag: "err",
      error: { message: expect.stringContaining("UTF-8") },
    });
    writeFileSync(join(root, "manifest.json"), "a\u0000b");
    expect(loadCorpusManifest(root)._tag).toBe("err");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadCorpus (real vendored corpus)", () => {
  it("composes the default engineering skill roster", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const manifest = loadCorpusManifest(corpusRoot);
    expect(manifest._tag).toBe("ok");
    if (manifest._tag !== "ok") return;
    // The composed roster is the manifest's roster, not a fixed count.
    expect(result.value).toHaveLength(manifest.value.skills.length);
    const names = result.value.map((skill) => skill.name).sort();
    expect(names).toContain("groundwork");
    expect(names).toContain("router");
    expect(names).not.toContain("project-router");
    expect(names).toContain("diagnose");
    expect(names).not.toContain("diagnosing-bugs");
    expect(names).toContain("architecture-survey");
    expect(names).not.toContain("improve-codebase-architecture");
    expect(names).toContain("review");
    expect(names).not.toContain("delivery-review");
    expect(names).not.toContain("review-lens");
    expect(names).not.toContain("planner");
    expect(names).not.toContain("builder");
    expect(names).toContain("ponytail");
    expect(names).not.toContain("ponytail-review");
    expect(names).toContain("progress-check");
    expect(names).toContain("verify");
    expect(names).not.toContain("verify-this");
    expect(names).not.toContain("control-cli");
    expect(names).not.toContain("control-ui");
    for (const habit of MERGED_HABITS) expect(names).toContain(habit);
    for (const retired of RETIRED_HABITS) expect(names).not.toContain(retired);
    expect(names).toContain("product-description");
    expect(names).toContain("sweep-tests");
    expect(names).toContain("close");
    expect(names).not.toContain("record-architecture-decisions");
    expect(names).toContain("show-me");
    expect(names).toContain("diagram-design");
    expect(names).toContain("architecture-map");
    expect(names).not.toContain("principle-model-the-domain");
    expect(names).not.toContain("ask-matt");
  });

  it("reads ponytail as a copy of the vendored rule body under greenline frontmatter", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const ponytail = result.value.find((skill) => skill.name === "ponytail");
    expect(ponytail).toBeDefined();
    if (ponytail === undefined) return;
    expect(ponytail.activation).toBe("implicit");
    // The vendored rule file is the body, byte-identical, no frontmatter.
    expect(ponytail.body).toContain("# Ponytail, lazy senior dev mode");
    // The copy carries greenline frontmatter; the upstream rule file had none.
    expect(ponytail.description.length).toBeGreaterThan(0);
    // ponytail-review is review's excess lens since S15: a reference file the
    // review step's reviewer reads, its scoring line unchanged.
    const review = result.value.find((skill) => skill.name === "review");
    expect(review).toBeDefined();
    expect(review?.activation).toBe("explicit");
    const excess = (review?.supportFiles ?? []).find(
      (file) => file.path === "references/excess.md",
    );
    expect(excess?.content).toContain("Lean already. Ship.");
  });

  it("composes review with its lens, register and excess lens as reference files, its reviewers one after another and never in parallel", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const review = result.value.find((skill) => skill.name === "review");
    expect(review).toBeDefined();
    if (review === undefined) return;
    expect(review.body).toMatch(/^Next: the next step of the change's mode$/m);
    expect(review.body).toContain("## The reviewer's brief");
    expect(review.body).toContain("## The builder's half");
    // J-93 S2: the depths, the reviewers one after another among them, stand on the references page.
    const mechanics = (review.supportFiles ?? []).find(
      (file) => file.path === "references/greenline.md",
    );
    expect(mechanics?.content).toContain("one after another");
    // R20 and R21: no parallel dispatch, no worktree, no harness's own
    // subagent settings or forked turns.
    expect(review.body).not.toMatch(/parallel|worktree|subagent_type|fork_turns/i);
    const paths = (review.supportFiles ?? []).map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "references/lens.md",
        "references/REGISTER.md",
        "references/excess.md",
      ]),
    );
  });

  it("loads verify, implicit as verify-this was, with its handoff and control-cli and control-ui as its reference files", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const verify = result.value.find((skill) => skill.name === "verify");
    expect(verify).toBeDefined();
    if (verify === undefined) return;
    expect(verify.activation).toBe("implicit");
    expect(verify.body).toContain("NOT VERIFIED");
    expect(verify.body).toMatch(/^Next: the next step of the change's mode$/m);
    const paths = (verify.supportFiles ?? []).map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining(["references/control-cli.md", "references/control-ui.md"]),
    );
  });

  it("S18a loads prose with its catalog of tells as a page, and domain-and-types with both halves", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const prose = result.value.find((skill) => skill.name === "prose");
    expect(prose?.activation).toBe("implicit");
    const tells = (prose?.supportFiles ?? []).find((file) => file.path === "tells.md");
    expect(tells?.content).toContain("Mannered prose");
    expect((prose?.supportFiles ?? []).map((file) => file.path)).toContain("documents.md");
    const domain = result.value.find((skill) => skill.name === "domain-and-types");
    expect(domain?.body).toContain("state machine");
    expect(domain?.body).toContain("unrepresentable");
    expect(domain?.body).toContain("Redesign from first principles");
  });

  it("composes product-description with its reference templates as support files", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const pd = result.value.find((skill) => skill.name === "product-description");
    expect(pd).toBeDefined();
    if (pd === undefined) return;
    expect(pd.activation).toBe("explicit");
    expect(pd.body).toContain("state chart");
    expect(pd.body).toContain("## Handoff");
    const paths = (pd.supportFiles ?? []).map((file) => file.path);
    expect(paths).toContain("references/product-kinds.md");
    expect(paths).toContain("references/check-links.py");
    // J-93 S2: its references page holds the workspace's own folder its front names by its noun.
    expect(paths).toContain("references/greenline.md");
    expect(paths).toHaveLength(9);
  });

  it("composes diagram-design with its full reference and asset catalog", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const dd = result.value.find((skill) => skill.name === "diagram-design");
    expect(dd).toBeDefined();
    if (dd === undefined) return;
    expect(dd.activation).toBe("implicit");
    expect(dd.body).toContain("Durable output:");
    const paths = (dd.supportFiles ?? []).map((file) => file.path);
    expect(paths).toContain("references/style-guide.md");
    expect(paths).toContain("assets/template-dark.html");
    expect(paths).toContain("scripts/self_check.py");
    expect(paths.length).toBeGreaterThan(200);
  });

  it("reads architecture-map with its vendored assets and the greenline-built shell asset", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const map = result.value.find((skill) => skill.name === "architecture-map");
    expect(map).toBeDefined();
    if (map === undefined) return;
    expect(map.activation).toBe("explicit");
    expect(map.body).toContain("Durable output:");
    const paths = (map.supportFiles ?? []).map((file) => file.path);
    expect(paths).toContain("scripts/architecture-sync.mjs");
    expect(paths).toContain("assets/core/types.ts");
    // The greenline-built shell is a file in the copy, a dependency edit in the ledger.
    expect(paths).toContain("assets/gl-shell.html");
    const shell = (map.supportFiles ?? []).find((file) => file.path === "assets/gl-shell.html");
    expect(shell?.content).toContain("__GL_MAP_DATA__");
  });

  it("composes the freddie-northam four with sweep-tests shipping its mutation tool", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const sweep = result.value.find((skill) => skill.name === "sweep-tests");
    expect(sweep?.activation).toBe("explicit");
    expect(sweep?.body).toContain("mutation");
    expect((sweep?.supportFiles ?? []).map((file) => file.path)).toContain("bin/mutate.mjs");
    const loud = result.value.find((skill) => skill.name === "boundaries");
    expect(loud?.activation).toBe("implicit");
    expect(loud?.body).toContain("success-shaped");
    const plain = result.value.find((skill) => skill.name === "prose");
    expect(plain?.body).not.toContain("## Handoff");
  });

  it("composes close with its ADR seed pages and its glossary format as support files", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const close = result.value.find((skill) => skill.name === "close");
    expect(close).toBeDefined();
    if (close === undefined) return;
    // record-architecture-decisions fired on its own when a change settled
    // something durable; close keeps that activation.
    expect(close.activation).toBe("implicit");
    expect(close.description).not.toContain("monorepo");
    expect(close.body).toContain("Supersedes");
    expect(close.body).toMatch(/^Next: none when the change is done/m);
    const paths = (close.supportFiles ?? []).map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining(["adr/template.md", "adr/README.md", "references/GLOSSARY-FORMAT.md"]),
    );
  });

  it("S17 reads the native router, project-router renamed, from corpus/skills like any other copy", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const router = result.value.find((skill) => skill.name === "router");
    expect(router).toBeDefined();
    if (router === undefined) return;
    expect(router.activation).toBe("implicit");
    expect(router.body).toContain("# Router");
    // J-93 S2: the status command stands on the router's references page, its front naming it by its noun.
    expect(router.body).toContain("the workspace's status");
    expect(
      (router.supportFiles ?? []).find((file) => file.path === "references/greenline.md")?.content,
    ).toContain("greenline status");
    // The renamed upstream foundation said "Ask Matt"; the native body does not.
    expect(router.body).not.toContain("Ask Matt");
  });

  it("carries no bookend above or below any body: the copy says what greenline means (ADR 0039)", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    for (const skill of result.value) {
      expect(skill.body, `${skill.name} still carries a prelude`).not.toMatch(/greenline prelude/);
      expect(skill.body, `${skill.name} still carries a completion`).not.toMatch(
        /greenline completion/,
      );
    }
    const plan = result.value.find((skill) => skill.name === "plan");
    expect(plan?.body).toContain("## Handoff");
    expect(plan?.body).toMatch(/^Next: the next step of the change's mode$/m);
  });

  it("rewrites every cross-reference to renamed skills", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    for (const skill of result.value) {
      const texts = [skill.body, ...(skill.supportFiles ?? []).map((file) => file.content)];
      for (const text of texts) {
        expect(text, `${skill.name} still references setup-matt-pocock-skills`).not.toMatch(
          /(?<![\w-])setup-matt-pocock-skills(?![\w-])/,
        );
        expect(text, `${skill.name} still references code-review`).not.toMatch(
          /(?<![\w-])code-review(?![\w-])/,
        );
      }
    }
  });

  it("projects support files and carries no upstream openai.yaml", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const spine = result.value.find((skill) => skill.name === "router");
    expect(spine).toBeDefined();
    const paths = (spine?.supportFiles ?? []).map((file) => file.path);
    expect(paths).not.toContain("references/python.md");
    expect(paths).toContain("ROUTING.md");
    expect(paths).not.toContain("agents/openai.yaml");
    for (const skill of result.value) {
      expect(
        (skill.supportFiles ?? []).map((file) => file.path),
        `${skill.name} projects upstream openai.yaml`,
      ).not.toContain("agents/openai.yaml");
    }
  });

  it("fails closed when the corpus root does not exist", () => {
    const result = loadCorpus(join(corpusRoot, "does-not-exist"));
    expect(result._tag).toBe("err");
  });
});

describe("S18a the merged habits", () => {
  const result = loadCorpus(corpusRoot);
  if (result._tag !== "ok") throw new Error("the corpus does not load");
  const habits = MERGED_HABITS.map((name) => {
    const skill = result.value.find((entry) => entry.name === name);
    if (skill === undefined) throw new Error(`${name} is not on the roster`);
    return skill;
  });
  const pages = (skill: (typeof habits)[number]) => [
    skill.body,
    ...(skill.supportFiles ?? []).map((file) => file.content),
  ];

  it("S18a every habit is a habit, implicit, with no handoff, and writes no record of its own", () => {
    for (const habit of habits) {
      expect(habit.kind, habit.name).toBe("habit");
      expect(habit.activation, habit.name).toBe("implicit");
      expect(habit.body, habit.name).not.toMatch(/^## Handoff$/m);
      expect(habit.body, habit.name).toContain("writes no record of its own");
    }
  });

  it("S18a no habit names a mode, a retired skill, a parallel agent or a worktree", () => {
    for (const habit of habits)
      for (const text of pages(habit)) {
        for (const retired of RETIRED_HABITS)
          expect(text, `${habit.name} names ${retired}`).not.toMatch(
            new RegExp(`(?<![\\w-])${retired}(?![\\w-])`),
          );
        expect(text, `${habit.name} names a mode`).not.toMatch(
          /\b(fast|medium|high|max) mode\b|\bmode (fast|medium|high|max)\b|\bat least (fast|medium|high|max)\b/i,
        );
        expect(text, `${habit.name} names a worktree`).not.toMatch(/worktree/i);
        expect(text, `${habit.name} runs agents in parallel`).not.toMatch(
          /(sub-?agents?|agents) in parallel|parallel (sub-?agents?|agents)/i,
        );
      }
  });

  it("S18a deep-modules designs twice in turn, one design after another, never in parallel", () => {
    const deep = habits.find((habit) => habit.name === "deep-modules");
    const twice = (deep?.supportFiles ?? []).find((file) => file.path === "DESIGN-IT-TWICE.md");
    expect(twice?.content).toContain("one design after another");
    expect(twice?.content).toContain("Never run them in parallel.");
    expect(twice?.content).not.toMatch(/[Ss]pawn/);
  });

  it("S18a tdd runs the affected tests and leaves wider runs to the build and verify steps", () => {
    const tdd = habits.find((habit) => habit.name === "tdd");
    expect(tdd?.body).toContain(
      "wider runs are the build step's increment check and the verify step's",
    );
    // J-93 S2: the recorder stands on tdd's references page, its front naming the runs as checks.
    expect(tdd?.body).toContain("Record the focused command's runs during the loop as checks");
    expect(
      (tdd?.supportFiles ?? []).find((file) => file.path === "references/greenline.md")?.content,
    ).toContain("greenline check");
    expect((tdd?.supportFiles ?? []).map((file) => file.path).sort()).toEqual([
      "bug-fix.md",
      "mocking.md",
      "references/greenline.md",
      "tests.md",
    ]);
  });
});
