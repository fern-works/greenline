import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mismatches, parseChangeRecord, parseRecordForm } from "../../src/core/change.ts";
import { recordFacts } from "../../src/core/git-hooks.ts";
import { parseManifest, serializeManifest } from "../../src/core/manifest.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import {
  parsePaths,
  parseSurvey,
  serializeHomeFile,
  withMeasuredRows,
} from "../../src/core/interface-home.ts";

/**
 * The interface's contracts a workspace keeps (J-123 S1): the manifest's
 * interface block, the record's `interface` field, and the interface ledger
 * home's survey sheet and path index.
 */

const modesPath = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");

function definition(): ModesDefinition {
  const parsed = parseModes(readFileSync(modesPath, "utf8"), modesPath);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const BLOCK = {
  roots: ["src/app"],
  extensions: ["css", "tsx"],
  platform: "web",
  frameworks: ["react"],
  evidence: ["react: package.json names react"],
  confirmed: true,
  check: true,
};

describe("J-123 S1 the manifest's interface block", () => {
  it("round-trips the block after the hooks, and refuses a root that leaves the repository or a platform off the list", () => {
    const text = JSON.stringify({ schemaVersion: 6, targets: ["codex"], interface: BLOCK });
    const parsed = parseManifest(text, "m");
    if (parsed._tag === "err") throw parsed.error;
    const written = serializeManifest(parsed.value);
    expect(Object.keys(JSON.parse(written))).toEqual([
      "schemaVersion",
      "targets",
      "skills",
      "proceed",
      "trials",
      "checks",
      "hooks",
      "interface",
    ]);
    expect(parseManifest(written, "m")).toEqual(parsed);
    for (const [field, value] of [
      ["roots", ["../outside"]],
      ["roots", ["/abs"]],
      ["platform", "watch"],
      ["frameworks", ["jquery"]],
    ] as const) {
      const refused = parseManifest(
        JSON.stringify({
          schemaVersion: 6,
          targets: ["codex"],
          interface: { ...BLOCK, [field]: value },
        }),
        "m",
      );
      expect([field, refused._tag]).toEqual([field, "err"]);
    }
  });
});

describe("J-123 S1 the record's interface field", () => {
  const record = (line: string) =>
    ["---", "mode: quick", "choice: accepted", 'why: "w"', "state: open", line, "---", ""].join(
      "\n",
    );

  it("reads no and yes with its register into the record, and refuses another form with the guide's words", () => {
    const yes = parseChangeRecord(definition(), "2026-10-25-a.md", record('interface: "yes, app"'));
    expect(yes._tag === "ok" && yes.value.interface).toEqual({ touches: true, registers: ["app"] });
    const no = parseRecordForm("2026-10-25-a.md", record("interface: no"));
    expect(no._tag === "ok" && no.value.interface).toEqual({ touches: false });
    const refused = parseRecordForm("2026-10-25-a.md", record("interface: maybe"));
    expect(refused._tag === "err" && refused.error.issues).toEqual([
      {
        path: "interface",
        message:
          'the interface line is no, or "yes, <register>" with site or app (.greenline/ledger/README.md)',
      },
    ]);
  });

  it("gives the hooks the line as written and the design section", () => {
    const facts = recordFacts(`${record("interface: yes")}## design\n\ncomponents: table\n`);
    expect([facts.interface, facts.design]).toEqual(["yes", "components: table"]);
  });
});

describe("J-123 S2 the design step applies by the record's interface fact", () => {
  const body = (design: readonly string[]): string =>
    [
      "## frame",
      "Goal.",
      ...design,
      "## plan",
      "Plan.",
      "## anticipate",
      "none at quick",
      "## build",
      "Built.",
      "## review",
      "none at quick",
      "## verify",
      "Verified.",
      "## close",
      "Closed.",
      "",
    ].join("\n");
  const parsed = (line: string | undefined, design: readonly string[]) => {
    const front = ["---", "mode: quick", "choice: accepted", 'why: "w"', "state: done"];
    const text = [...front, ...(line === undefined ? [] : [line]), "---", "", body(design)].join(
      "\n",
    );
    const read = parseChangeRecord(definition(), "2026-10-25-a.md", text);
    if (read._tag === "err") throw read.error;
    return mismatches(definition(), read.value, { ticketsFile: "absent" });
  };

  it("takes the one line, or no section, where the record says no or states nothing, and refuses work there", () => {
    expect(parsed("interface: no", ["## design", "none, no interface"])).toEqual([]);
    expect(parsed(undefined, [])).toEqual([]);
    expect(parsed("interface: no", ["## design", "Lock read."])).toEqual([
      {
        kind: "inapplicable-section",
        step: "design",
        fact: "interface",
        line: "none, no interface",
      },
    ]);
  });

  it("runs the step at the mode's depth where the record says yes", () => {
    expect(
      parsed('interface: "yes, app"', ["## design", "lock read: DESIGN.md; components: form"]),
    ).toEqual([]);
    expect(parsed("interface: yes", [])).toEqual([{ kind: "missing-section", step: "design" }]);
    expect(parsed("interface: yes", ["## design", "One.", "Two."])).toEqual([
      { kind: "inline-over-one-line", step: "design" },
    ]);
  });
});

describe("J-123 S1 the interface ledger home", () => {
  it("reads the survey sheet, one source per row, and keeps the agent's and the owner's rows when a measure runs again", () => {
    const sheet = {
      generatedBy: "greenline check interface --survey",
      rows: [
        {
          fact: "colours",
          value: "40 distinct colours",
          source: {
            kind: "measured",
            command: "greenline check interface --survey",
            commit: "abc1234",
          },
        },
        {
          fact: "type",
          value: "three faces",
          source: { kind: "read", from: "src/app/globals.css" },
        },
        {
          fact: "register",
          value: "app at src",
          source: { kind: "confirmed", date: "2026-10-25" },
        },
      ],
    } as const;
    const parsed = parseSurvey(serializeHomeFile(sheet));
    expect(parsed).toEqual({ _tag: "ok", value: sheet });
    const again = withMeasuredRows(
      parsed._tag === "ok" ? parsed.value : undefined,
      sheet.generatedBy,
      [
        {
          fact: "colours",
          value: "12 distinct colours",
          source: {
            kind: "measured",
            command: "greenline check interface --survey",
            commit: "def5678",
          },
        },
      ],
    );
    expect(again.rows.map((row) => row.value)).toEqual([
      "12 distinct colours",
      "three faces",
      "app at src",
    ]);
    expect(
      parseSurvey(
        JSON.stringify({
          generatedBy: "x",
          rows: [{ fact: "a", value: "b", source: { kind: "guessed" } }],
        }),
      )._tag,
    ).toBe("err");
  });

  it("reads the path index by address, and refuses an address that is no path", () => {
    const index = {
      generatedBy: "greenline check interface",
      paths: [
        {
          address: "/pricing",
          register: "site",
          capture: {
            visual: "2026-10-25-pricing-table/pricing",
            widths: [1440, 768, 390],
            commit: "abc1234",
            at: "2026-10-25",
          },
          scores: { floor: 0, reflex: 2, finish: 1 },
          fidelity: { inPalette: 0.94, offPalette: ["#ee1111"] },
        },
      ],
    } as const;
    expect(parsePaths(serializeHomeFile(index))).toEqual({ _tag: "ok", value: index });
    expect(
      parsePaths(JSON.stringify({ generatedBy: "x", paths: [{ address: "pricing" }] }))._tag,
    ).toBe("err");
  });
});
