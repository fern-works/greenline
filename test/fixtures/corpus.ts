import {
  buildInstallation,
  type Installation,
  type InstallationInput,
} from "../../src/core/installation.ts";
import type { Manifest } from "../../src/core/manifest.ts";
import type { SkillSource } from "../../src/core/skill.ts";
export const fixtureSkills: readonly SkillSource[] = [
  {
    name: "delivery-review",
    description: "Review committed work against the ticket contract.",
    class: "stage",
    activation: "explicit",
    body: [
      "# Delivery Review",
      "",
      "Read the commit range and the ticket, then report findings.",
      "",
    ].join("\n"),
  },
  {
    name: "grilling",
    description: "Grill the operator about a plan before building it.",
    class: "discipline",
    activation: "implicit",
    body: [
      "# Grilling",
      "",
      "Interview relentlessly until the design tree is settled.",
      "",
      "## The rounds",
      "",
      "One round or less; the artifact only when a ruling must outlive the session.",
      "",
    ].join("\n"),
  },
];

/** A small real installation without any guidance data. */
export function fixtureInstallation(overrides: Partial<InstallationInput> = {}): Installation {
  const result = buildInstallation({
    skills: fixtureSkills,
    intents: [],
    upstreams: [],
    agentGuide: "# Guide\nUse repository evidence.\n",
    ledgerGuide: "# Ledger\nSeparate delivery and application.\n",
    workGuide: "# Work\nOne ticket records intent.\n",
    notices: "# Notices\nFixture methods and their source terms.\n",
    ...overrides,
  });
  if (result._tag === "err") throw result.error;
  return result.value;
}
export const fixtureConfiguration: Manifest = {
  schemaVersion: 6,
  targets: ["codex", "claude-code"],
  skills: { include: [], exclude: [] },
  connectors: {},
};
/** The same workspace with the garden connector enabled: the goldens' second state. */
export const gardenEnabledConfiguration: Manifest = {
  ...fixtureConfiguration,
  connectors: { garden: { endpoint: "https://garden.example/", executable: "garden" } },
};
