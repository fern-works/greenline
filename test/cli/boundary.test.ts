import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The architectural boundary (`docs/SPEC.md` §1): no CLI module may
 * reference skill selection, request classification, or workflow
 * progression. The tokens below are the vocabulary of those acts; the
 * CLI's own file-state words (create/update/conflict/orphan) are not,
 * and the planner keeps using them. The literal skill name
 * `project-router` is exempt from the routing token: the working laws
 * the renderer carries are corpus prose that must name their method
 * owners (ADR 0020), and a law naming a skill is not the CLI routing.
 */

const FORBIDDEN: readonly { token: RegExp; act: string }[] = [
  { token: /(?<!project-)\brout(es?|ing|er)\b/, act: "routing" },
  { token: /\bschedul(e|es|ed|ing|er)\b/, act: "scheduling" },
  { token: /\brecommend(ed|ation|s)?\b/, act: "recommending" },
  { token: /\bprioriti[sz]e[sd]?\b/, act: "prioritizing" },
  { token: /\bselect(ed|ion|ing)?\s+(a |the )?skill\b/, act: "skill selection" },
  { token: /\bworkflow\b/, act: "workflow progression" },
  { token: /\bphase[sd]?\b/, act: "phase progression" },
];

function sourceFiles(dir: string): readonly string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (name.endsWith(".ts")) files.push(path);
  }
  return files;
}

function boundaryViolations(
  sources: readonly { readonly file: string; readonly text: string }[],
): readonly string[] {
  const violations: string[] = [];
  for (const { file, text } of sources) {
    for (const rule of FORBIDDEN) {
      const match = text.match(rule.token);
      if (match !== null) violations.push(`${file}: ${JSON.stringify(match[0])} (${rule.act})`);
    }
  }
  return violations;
}

describe("architectural boundary", () => {
  it("keeps skill selection, request classification, and workflow progression out of the CLI", () => {
    const violations = boundaryViolations(
      sourceFiles(join(process.cwd(), "src")).map((file) => ({
        file,
        text: readFileSync(file, "utf8"),
      })),
    );
    expect(violations).toEqual([]);
  });

  it("finds each act's token in any module, across a line break included", () => {
    expect(
      boundaryViolations([
        { file: join("src", "shell", "cli", "consumer.ts"), text: "const phase = 'run';" },
        {
          file: join("src", "shell", "cli", "multiline-consumer.ts"),
          text: "select\nskill",
        },
      ]),
    ).toEqual([
      `${join("src", "shell", "cli", "consumer.ts")}: "phase" (phase progression)`,
      `${join("src", "shell", "cli", "multiline-consumer.ts")}: ${JSON.stringify("select\nskill")} (skill selection)`,
    ]);
  });
});
