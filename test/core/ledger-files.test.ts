import { describe, expect, it } from "vitest";
import {
  ledgerFileOf,
  ledgerWriteRefusal,
  MACHINE_FILES,
  pictureInLedger,
} from "../../src/core/ledger-files.ts";

/**
 * The ledger's machine-written files (J-173 S1; the register's row of
 * 2026-10-31, "The ledger's files are the CLI's to write"): the files a
 * command or the hooks write beside the records, each with the command that
 * owns it, and a picture under a change's ledger folder, which the visual
 * home holds instead. The before-write hook and the shell guard read this
 * one list.
 */

const ID = "2026-10-31-filter-search";

describe("J-173 S1 the ledger's machine-written files, each with its owning command", () => {
  it("names each file class the CLI writes, and the command or hook that owns it", () => {
    const cases: readonly (readonly [string, string])[] = [
      [".greenline/ledger/interface/marks.jsonl", "greenline mark"],
      [`.greenline/ledger/${ID}/marks.jsonl`, "greenline mark"],
      [`.greenline/ledger/${ID}/visuals.json`, "the hooks"],
      [`.greenline/ledger/${ID}/frame-map.json`, "the hooks"],
      [`.greenline/ledger/${ID}/checks/20261031T125942292Z-64a9ae.json`, "greenline check"],
      [
        `.greenline/ledger/${ID}/interface/20261031T130840811Z-5e65f4.json`,
        "greenline check interface",
      ],
      [`.greenline/ledger/${ID}/skills/2026-10-31.jsonl`, "the hooks"],
      [".greenline/ledger/sessions/2026-10-31-abc.jsonl", "the hooks"],
      [".greenline/ledger/interface/paths.json", "greenline check interface"],
      [`.greenline/ledger/${ID}/design-pick.json`, "the viewer"],
      [".greenline/ledger/receipts/2026-10-31.json", "greenline connectors"],
      [`.greenline/visuals/${ID}/capture-home.boxes.json`, "greenline check interface"],
      [".greenline/visuals/interface/capture-home-2.boxes.json", "greenline check interface"],
      [".git/greenline/lifts.jsonl", "the hooks"],
      // J-176 S1: a change's folder of the visual home is the picture command's alone, a check
      // instrument left there among them (j109t-skills-upstream), and a research report its own.
      [`.greenline/visuals/${ID}/request-path.svg`, "greenline picture keep"],
      [`.greenline/visuals/${ID}/capture-home.visual.json`, "greenline picture keep"],
      [`.greenline/visuals/${ID}/loan-journey.check.json`, "greenline picture keep"],
      [`.greenline/ledger/${ID}/frame-research-1.md`, "greenline research report"],
    ];
    for (const [path, owner] of cases)
      expect([path, ledgerFileOf(path)?.owner]).toEqual([path, owner]);
    // Every class the list states is met by a case above.
    expect(MACHINE_FILES.length).toBe(14);
  });

  it("leaves the agent's own files alone: the record, its reports, the survey, the kept list and the atlas's pages", () => {
    for (const path of [
      `.greenline/ledger/${ID}.md`,
      `.greenline/ledger/${ID}/review-1.md`,
      `.greenline/ledger/${ID}/brief-review-1.md`,
      `.greenline/ledger/${ID}/kept.json`,
      ".greenline/ledger/interface/survey.json",
      ".greenline/ledger/discussions/2026-10-31-naming.md",
      ".greenline/visuals/atlas.json",
      ".greenline/visuals/subsystems/loans.md",
      `.greenline/ledger/${ID}/frame-research-notes.md`,
      `.greenline/tmp/${ID}/marks.jsonl`,
      "src/marks.jsonl",
      "public/visuals.json",
    ])
      expect([path, ledgerFileOf(path)]).toEqual([path, undefined]);
  });

  it("reads a path written with backslashes or a leading ./ as the same file", () => {
    expect(ledgerFileOf(".\\.greenline\\ledger\\interface\\marks.jsonl")?.owner).toBe(
      "greenline mark",
    );
    expect(ledgerFileOf(`./.greenline/ledger/${ID}/visuals.json`)?.owner).toBe("the hooks");
  });
});

describe("J-173 S1 a picture under a change's ledger folder", () => {
  it("finds a PNG, a JPEG, a WebP or an SVG under the ledger, and names its change", () => {
    expect(pictureInLedger(`.greenline/ledger/${ID}/verify/screens/home.png`)).toBe(ID);
    expect(pictureInLedger(`.greenline/ledger/${ID}/shot.JPG`)).toBe(ID);
    expect(pictureInLedger(`.greenline/ledger/${ID}/a.jpeg`)).toBe(ID);
    expect(pictureInLedger(`.greenline/ledger/${ID}/a.webp`)).toBe(ID);
    expect(pictureInLedger(`.greenline/ledger/${ID}/flow.svg`)).toBe(ID);
    expect(pictureInLedger(".greenline/ledger/interface/home.png")).toBe("interface");
  });

  it("leaves a picture in the visual home, the working folder or the code alone", () => {
    for (const path of [
      `.greenline/visuals/${ID}/capture-home-1440.png`,
      `.greenline/tmp/${ID}/screens/home.png`,
      "public/logo.svg",
      `.greenline/ledger/${ID}/review-1.md`,
    ])
      expect([path, pictureInLedger(path)]).toEqual([path, undefined]);
  });
});

describe("J-173 S1 the refusal names the owning command and the way forward", () => {
  it("refuses the marks file in the marks' own words", () => {
    expect(ledgerWriteRefusal(".greenline/ledger/interface/marks.jsonl")).toBe(
      "the owner's marks are not edited by hand, so the write to .greenline/ledger/interface/marks.jsonl is stopped; change them through greenline mark (list, add, propose, close), which records whose act each line is, and close a mark only on the owner's word; marks-by-hand",
    );
  });

  it("refuses the links file with the visual home named", () => {
    expect(ledgerWriteRefusal(`.greenline/ledger/${ID}/visuals.json`)).toBe(
      `.greenline/ledger/${ID}/visuals.json is the change's links to its visuals, which the hooks write after each write under the visual home, so it is not written by hand or by a script; keep the picture with greenline picture keep <file> --change ${ID}, which writes it and its manifest under .greenline/visuals/${ID}/, and the hooks list it; ledger-by-hand`,
    );
  });

  it("refuses a check fact with its command named", () => {
    expect(ledgerWriteRefusal(`.greenline/ledger/${ID}/checks/a.json`)).toContain(
      "which greenline check writes",
    );
    expect(ledgerWriteRefusal(`.greenline/ledger/${ID}/checks/a.json`)).toMatch(
      /run the check through greenline check -- <command>; ledger-by-hand$/,
    );
  });

  it("refuses a picture under the ledger with the visual home named", () => {
    expect(ledgerWriteRefusal(`.greenline/ledger/${ID}/verify/screens/home.png`)).toBe(
      `a picture is no record, so .greenline/ledger/${ID}/verify/screens/home.png is not written under the ledger; a lasting visual stands in the visual home, .greenline/visuals/${ID}/, beside its manifest, kept with greenline picture keep on the owner's ask or by greenline check interface --url --path for a capture, and a working screenshot stays under .greenline/tmp/${ID}/; picture-in-ledger`,
    );
  });

  it("refuses the visual home's change folder with its one door named (J-176 S1)", () => {
    expect(ledgerWriteRefusal(`.greenline/visuals/${ID}/loan-journey.check.json`)).toBe(
      `.greenline/visuals/${ID}/loan-journey.check.json is a kept picture or its manifest in the visual home, which greenline picture keep alone writes, so it is not written by hand or by a script; draw the picture under .greenline/tmp/${ID}/ and, on the owner's ask, keep it with greenline picture keep <file> --change ${ID} --ask "<the owner's words>" --title "<title>" --form <form> --skill <skill> --summary "<what it shows and why>" --files <path>,<path>, which writes it and its manifest together; visuals-by-hand`,
    );
    expect(ledgerWriteRefusal(`.greenline/ledger/${ID}/frame-research-2.md`)).toMatch(
      /is a research report, which greenline research report writes, so it is not written by hand or by a script; write the report under .+ --topic R<n>, which writes it into the change's folder; ledger-by-hand$/,
    );
  });

  it("names nothing for the agent's own files", () => {
    expect(ledgerWriteRefusal(`.greenline/ledger/${ID}.md`)).toBeUndefined();
    expect(ledgerWriteRefusal("src/app.ts")).toBeUndefined();
  });
});
