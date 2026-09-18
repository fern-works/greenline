import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadCorpus, loadCorpusManifest } from "../../src/shell/corpus.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const corpusRoot = join(import.meta.dirname, "..", "..", "corpus");

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
    expect(names).toContain("project-router");
    expect(names).toContain("delivery-review");
    expect(names).not.toContain("planner");
    expect(names).not.toContain("builder");
    expect(names).toContain("ponytail");
    expect(names).toContain("ponytail-review");
    expect(names).toContain("progress-check");
    expect(names).toContain("verify-this");
    expect(names).toContain("control-cli");
    expect(names).toContain("control-ui");
    expect(names).toContain("unslop");
    expect(names).toContain("technical-writing");
    expect(names).toContain("model-the-domain");
    expect(names).toContain("type-system-discipline");
    expect(names).toContain("boundary-discipline");
    expect(names).toContain("product-description");
    expect(names).toContain("fail-loud");
    expect(names).toContain("airgap-secrets");
    expect(names).toContain("answer-plainly");
    expect(names).toContain("sweep-tests");
    expect(names).toContain("record-architecture-decisions");
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
    const review = result.value.find((skill) => skill.name === "ponytail-review");
    expect(review).toBeDefined();
    expect(review?.activation).toBe("explicit");
    expect(review?.body).toContain("Lean already. Ship.");
  });

  it("loads verify-this as an edited copy with its handoff and implicit support", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const verify = result.value.find((skill) => skill.name === "verify-this");
    expect(verify).toBeDefined();
    if (verify === undefined) return;
    expect(verify.activation).toBe("implicit");
    expect(verify.body).toContain("NOT VERIFIED");
    expect(verify.body).toContain("## Handoff");
    const cli = result.value.find((skill) => skill.name === "control-cli");
    const ui = result.value.find((skill) => skill.name === "control-ui");
    expect(cli?.activation).toBe("implicit");
    expect(ui?.activation).toBe("implicit");
  });

  it("loads unslop and the renamed domain trio from the pstack family", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const unslop = result.value.find((skill) => skill.name === "unslop");
    expect(unslop?.activation).toBe("implicit");
    expect(unslop?.body).toContain("Mannered prose");
    const domain = result.value.find((skill) => skill.name === "model-the-domain");
    expect(domain?.body).toContain("state machine");
    const types = result.value.find((skill) => skill.name === "type-system-discipline");
    expect(types?.body).toContain("unrepresentable");
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
    expect(paths).toHaveLength(8);
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
    const loud = result.value.find((skill) => skill.name === "fail-loud");
    expect(loud?.activation).toBe("implicit");
    expect(loud?.body).toContain("success-shaped");
    const plain = result.value.find((skill) => skill.name === "answer-plainly");
    expect(plain?.body).not.toContain("## Handoff");
  });

  it("composes record-architecture-decisions with its seed templates as support files", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const adr = result.value.find((skill) => skill.name === "record-architecture-decisions");
    expect(adr).toBeDefined();
    if (adr === undefined) return;
    expect(adr.activation).toBe("implicit");
    // The copy's description drops upstream's "in this monorepo" framing.
    expect(adr.description).not.toContain("monorepo");
    expect(adr.body).toContain("Supersedes");
    expect(adr.body).toContain("## Handoff");
    const paths = (adr.supportFiles ?? []).map((file) => file.path);
    expect(paths).toContain("template.md");
    expect(paths).toContain("README.md");
  });

  it("reads the native project-router from corpus/skills like any other copy", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const router = result.value.find((skill) => skill.name === "project-router");
    expect(router).toBeDefined();
    if (router === undefined) return;
    expect(router.activation).toBe("implicit");
    expect(router.body).toContain("# Project router");
    expect(router.body).toContain("greenline status");
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
    const toSpec = result.value.find((skill) => skill.name === "to-spec");
    expect(toSpec?.body).toContain("## Handoff");
    expect(toSpec?.body).toMatch(/^Next: .*to-tickets/m);
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

  it("never installs the generated provenance page beside a copy", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    for (const skill of result.value)
      expect(
        (skill.supportFiles ?? []).map((file) => file.path),
        `${skill.name} installs PROVENANCE.md`,
      ).not.toContain("PROVENANCE.md");
  });

  it("projects support files and carries no upstream openai.yaml", () => {
    const result = loadCorpus(corpusRoot);
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const spine = result.value.find((skill) => skill.name === "project-router");
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
