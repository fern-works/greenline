import { expect, it } from "vitest";
import { renderCodexSkillMetadata } from "../../src/core/render.ts";

it.each([
  ["tdd", "TDD"],
  ["control-cli", "Control CLI"],
  ["control-ui", "Control UI"],
])("G3 preserves the acronym in the displayed %s method label", (name, label) => {
  const metadata = renderCodexSkillMetadata({
    name,
    description: "Method fixture",
    class: "discipline",
    activation: "implicit",
    body: "Use the method.",
  });
  expect(metadata).toContain(`  display_name: "${label}"\n`);
});
