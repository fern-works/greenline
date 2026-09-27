import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { compileInstallation } from "../../src/shell/installation.ts";
import { renderProjection } from "../../src/core/render.ts";
import { findBrokenReferences } from "../../src/core/links.ts";
import { fixtureConfiguration, gardenEnabledConfiguration } from "../fixtures/corpus.ts";
import type { Manifest } from "../../src/core/manifest.ts";

// One roster, full preserved support trees, explicit optional integrations, and no guidance payload.
const compiled = compileInstallation(join(import.meta.dirname, "../../corpus"));
if (compiled._tag === "err") throw compiled.error;
const release = compiled.value;
const optional = release.skills.filter((skill) => skill.optIn).map((skill) => skill.name);
const configurations: readonly Manifest[] = [
  ...(["codex", "claude-code"] as const).flatMap((target) =>
    [[], optional].map((include) => ({
      ...fixtureConfiguration,

      targets: [target],
      skills: { include, exclude: [] },
    })),
  ),
  {
    ...fixtureConfiguration,

    skills: { include: optional, exclude: ["ponytail"] },
  },
  gardenEnabledConfiguration,
  { ...gardenEnabledConfiguration, skills: { include: optional, exclude: ["ponytail"] } },
];
/** garden's skill installs only through its connector: while garden is enabled and not excluded. */
const CONNECTOR_SKILL = "use-garden";

function markerHolds(content: string, name: string, marker: string): boolean {
  const referenced =
    content.includes(`/${name}`) ||
    content.includes(`\`${name}\``) ||
    content.includes(`"${name}"`);
  if (!referenced) return true;
  return new RegExp(`[/\`"]${name}[\`"*]*\\s*\\(([^)]*,\\s*)?${marker}`).test(content);
}

describe("projection closure", () => {
  it("preserves installed support trees and deterministic bytes across harness and integration choices", () => {
    for (const configuration of configurations) {
      const files = renderProjection(configuration, release);
      expect(renderProjection(configuration, release)).toEqual(files);
      for (const skill of release.skills) {
        const included =
          !configuration.skills.exclude.includes(skill.name) &&
          (skill.name === CONNECTOR_SKILL
            ? configuration.connectors.garden !== undefined
            : !skill.optIn || configuration.skills.include.includes(skill.name));
        for (const target of configuration.targets) {
          const prefix = `${target === "codex" ? ".agents" : ".claude"}/skills/${skill.name}/`;
          expect(files.some((file) => file.path === prefix + "SKILL.md")).toBe(included);
          for (const support of skill.supportFiles ?? [])
            expect(files.find((file) => file.path === prefix + support.path)?.content).toBe(
              included ? support.content : undefined,
            );
        }
      }
    }
  });
  it("keeps every same-directory pointer inside the complete installed support tree", () => {
    for (const configuration of configurations)
      expect(
        findBrokenReferences(
          renderProjection(configuration, release).filter((file) => file.kind === "file"),
        ),
      ).toEqual([]);
  });
  it("names absent optional integrations as optional in installed instructions", () => {
    for (const configuration of configurations)
      for (const file of renderProjection(configuration, release).filter(
        (file) => file.path.endsWith(".md") && !file.path.endsWith("/ROUTING.md"),
      ))
        for (const name of optional) {
          if (configuration.skills.include.includes(name)) continue;
          expect(markerHolds(file.content, name, "opt-in"), `${file.path} names ${name}`).toBe(
            true,
          );
        }
  });
});
