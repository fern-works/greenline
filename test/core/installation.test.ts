import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  buildInstallation,
  parseInstallation,
  SKELETONS_LINE,
  type InstallationInput,
} from "../../src/core/installation.ts";
import type { SkillSource } from "../../src/core/skill.ts";
import { compileInstallation } from "../../src/shell/installation.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

it("G3 refuses guidance payloads and content corruption in the installation asset", () => {
  const installation = fixtureInstallation();
  expect(parseInstallation(JSON.stringify(installation), "asset")).toEqual({
    _tag: "ok",
    value: installation,
  });
  expect(
    parseInstallation(
      JSON.stringify({ ...installation, units: [{ content: "guidance body" }] }),
      "asset",
    )._tag,
  ).toBe("err");
  expect(
    parseInstallation(JSON.stringify({ ...installation, agentGuide: "tampered" }), "asset")._tag,
  ).toBe("err");
});

it("S2 the compiled payload carries corpus/runtime/modes.json beside the intents, at schema version 2", () => {
  const compiled = compileInstallation("corpus");
  if (compiled._tag === "err") throw compiled.error;
  expect(compiled.value.schemaVersion).toBe(2);
  expect(compiled.value.modes).toEqual(
    JSON.parse(readFileSync("corpus/runtime/modes.json", "utf8")),
  );
  expect(Object.keys(compiled.value).slice(0, 3)).toEqual(["skills", "intents", "modes"]);
});

it("S2 the payload refuses modes its definition refuses", () => {
  const installation = fixtureInstallation();
  const floors = [{ name: "security", risk: "secrets or security", mode: "turbo" }];
  expect(
    parseInstallation(
      JSON.stringify({ ...installation, modes: { ...installation.modes, floors } }),
      "asset",
    ),
  ).toEqual({
    _tag: "err",
    error: expect.objectContaining({
      issues: [
        {
          path: "modes.floors[0].mode",
          message: "floor 'security' names 'turbo', which is not a mode",
        },
      ],
    }),
  });
});

it("S2 the payload refuses the schema version that carried no modes", () => {
  const { modes: _modes, ...earlier } = fixtureInstallation();
  expect(parseInstallation(JSON.stringify({ ...earlier, schemaVersion: 1 }), "asset")).toEqual({
    _tag: "err",
    error: expect.objectContaining({
      issues: [
        { path: "modes", message: "Invalid input: expected object, received undefined" },
        { path: "schemaVersion", message: "Invalid input: expected 2" },
      ],
    }),
  });
});

it("S16a the payload carries each skill's kind, slot and flags, and no class", () => {
  const compiled = compileInstallation("corpus");
  if (compiled._tag === "err") throw compiled.error;
  const byName = new Map(compiled.value.skills.map((skill) => [skill.name, skill]));
  expect(byName.get("anticipate")).toMatchObject({
    kind: "step",
    slot: "anticipate",
    activation: "explicit",
  });
  // J-93 S1: no step is a trial; a trial start keeps its flag.
  expect(byName.get("anticipate")).not.toHaveProperty("trial");
  expect(byName.get("idea-refine")).toMatchObject({ kind: "start", trial: true });
  expect(byName.get("diagram-design")).toMatchObject({ kind: "habit", extra: true });
  expect(compiled.value.skills.some((skill) => "class" in skill || "optIn" in skill)).toBe(false);
  const installation = fixtureInstallation();
  const [first, ...rest] = installation.skills;
  if (first === undefined) throw new Error("the fixture installs a skill");
  expect(
    parseInstallation(
      JSON.stringify({ ...installation, skills: [{ ...first, class: "stage" }, ...rest] }),
      "asset",
    )._tag,
  ).toBe("err");
});

/** A habit of the corpus's own definition, the payload's plainest skill. */
const plainSkill: SkillSource = {
  name: "fixture",
  description: "A fixture skill.",
  kind: "habit",
  activation: "implicit",
  body: "Body.",
};

/** The fixture installation's input, without its identity. */
function fixtureInput(): InstallationInput {
  const { schemaVersion: _schema, revision: _revision, ...input } = fixtureInstallation();
  return input;
}

it("S16a the payload refuses a skill whose kind or slot its modes refuse", () => {
  const refusal = (skill: Partial<SkillSource>) =>
    buildInstallation({ ...fixtureInput(), skills: [{ ...plainSkill, ...skill }] });
  const refusedFor = (message: string) => ({
    _tag: "err",
    error: expect.objectContaining({ issues: [{ path: "skills.fixture", message }] }),
  });
  expect(refusal({ kind: "gate" })).toEqual(
    refusedFor("the kind 'gate' is no kind of the modes definition"),
  );
  expect(refusal({ kind: "habit", slot: "build" })).toEqual(
    refusedFor("a habit is placed beside the line, so it is its own slot and names none"),
  );
  expect(refusal({ kind: "step" })).toEqual(
    refusedFor(
      "a step is placed on the line, so it names its slot, a step of the modes definition",
    ),
  );
  expect(refusal({ kind: "step", slot: "build", trial: true })).toEqual(
    refusedFor(
      "a step is placed on the line, where every slot runs as its mode reaches it, so it is never a trial",
    ),
  );
  expect(refusal({ kind: "step", slot: "ship" })).toEqual(
    refusedFor("the slot 'ship' names no step of the modes definition"),
  );
  expect(refusal({ kind: "step", slot: "build" })._tag).toBe("ok");
});

it("S16a the payload refuses an intent row that names skills of more than one kind", () => {
  const habit = { ...plainSkill, name: "habit-one" };
  const start: SkillSource = { ...plainSkill, name: "start-one", kind: "start" };
  expect(
    buildInstallation({
      ...fixtureInput(),
      skills: [habit, start],
      intents: [{ intent: "Two kinds at once", skills: ["habit-one", "start-one"] }],
    }),
  ).toEqual({
    _tag: "err",
    error: expect.objectContaining({
      issues: [{ path: "Two kinds at once", message: "An intent row names skills of one kind." }],
    }),
  });
});

it("S16b refuses a ledger guide that does not hold the skeletons line exactly once", () => {
  const refusal = {
    _tag: "err",
    error: expect.objectContaining({
      issues: [
        {
          path: "ledgerGuide",
          message: `The ledger guide holds the line '${SKELETONS_LINE}' exactly once, where the skeleton of each mode is rendered.`,
        },
      ],
    }),
  };
  expect(buildInstallation({ ...fixtureInput(), ledgerGuide: "# Ledger\n" })).toEqual(refusal);
  expect(
    buildInstallation({
      ...fixtureInput(),
      ledgerGuide: `# Ledger\n${SKELETONS_LINE}\n${SKELETONS_LINE}\n`,
    }),
  ).toEqual(refusal);
});
