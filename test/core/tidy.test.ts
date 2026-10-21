import { describe, expect, it } from "vitest";
import { citationsInto, linkTargets, tidyVerdict } from "../../src/core/tidy.ts";

/**
 * What `greenline tidy` decides about one change's working folder before it
 * touches the disk (J-73 S4): it removes only a done or dropped change's
 * folder that no file of the ledger links into.
 */

const ID = "2026-10-14-retry";
const FOLDER = `.greenline/tmp/${ID}`;

function record(
  state: string,
  extra: readonly string[] = [],
  body: readonly string[] = [],
): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "the retry deadline"',
    `state: ${state}`,
    ...extra,
    "---",
    "",
    ...body,
  ].join("\n");
}

const done = record("done");
const ledger = (text: string): readonly { path: string; text: string }[] => [
  { path: `.greenline/ledger/${ID}.md`, text },
];

describe("J-73 S4 the links a ledger file holds", () => {
  it("J-73 S4 reads inline, image, angle-bracketed, reference and HTML links, in fences and code spans too", () => {
    const text = [
      "[a](one.md) and ![b](two.png) and [c](<three four.md>)",
      '[d](five.md "a title")',
      "[e]: six.md",
      '  [f]: <seven eight.md> "title"',
      '<a href="nine.md">x</a> <img src="ten.png">',
      "```",
      "[g](eleven.md)",
      "```",
      "`[h](twelve.md)`",
    ].join("\n");
    expect([...linkTargets(text)].sort()).toEqual(
      [
        "one.md",
        "two.png",
        "three four.md",
        "five.md",
        "six.md",
        "seven eight.md",
        "nine.md",
        "ten.png",
        "eleven.md",
        "twelve.md",
      ].sort(),
    );
  });

  it("J-73 S4 a link resolving into the folder, onto it or onto a folder above it cites it; one beside it does not", () => {
    const cites = (target: string, from = `.greenline/ledger/${ID}.md`): boolean =>
      citationsInto({ folder: FOLDER }, [{ path: from, text: `[x](${target})` }]).length > 0;
    expect(cites(`../tmp/${ID}/brief-review-1.md`)).toBe(true);
    expect(cites(`../tmp/${ID}`)).toBe(true);
    expect(cites(`../tmp/${ID}/`)).toBe(true);
    expect(cites(`/.greenline/tmp/${ID}/probe.txt`)).toBe(true);
    expect(cites("../tmp")).toBe(true);
    expect(cites("..")).toBe(true);
    expect(cites("../..")).toBe(true);
    expect(cites(`../../.greenline/tmp/${ID}/x`)).toBe(true);
    expect(cites(`../tmp/./${ID}/../${ID}/x`)).toBe(true);
    expect(cites(`../tmp/${ID.toUpperCase()}/x`)).toBe(true);
    expect(cites(`..\\tmp\\${ID}\\x`)).toBe(true);
    expect(cites(`../tmp/${ID.replace("retry", "%72etry")}/x`)).toBe(true);
    expect(cites(`../tmp/${ID}/x#part`)).toBe(true);
    expect(cites(`../tmp/${ID}/x?raw=1`)).toBe(true);
    expect(cites(`file:///home/me/repo/.greenline/tmp/${ID}/x`)).toBe(true);
    expect(cites(`https://example.com/o/r/blob/main/.greenline/tmp/${ID}/x`)).toBe(true);
    expect(cites(`../../tmp/${ID}/x`, `.greenline/ledger/${ID}/review-1.md`)).toBe(true);
    expect(cites(`${ID}/review-1.md`)).toBe(false);
    expect(cites(`../tmp/2026-10-14-other/x`)).toBe(false);
    expect(cites(`../tmp/${ID}-more/x`)).toBe(false);
    expect(cites("#frame")).toBe(false);
    expect(cites("https://example.com/")).toBe(false);
  });
});

describe("J-73 S4 the link forms a renderer resolves are read too", () => {
  const cited = (text: string, root?: string): boolean =>
    citationsInto(root === undefined ? { folder: FOLDER } : { folder: FOLDER, root }, [
      { path: `.greenline/ledger/${ID}.md`, text },
    ]).length > 0;

  it("J-73 S4 reads a reference definition in a blockquote, deep in a list, across a line, or with an escaped bracket", () => {
    expect(cited(`[probe][p]\n\n> [p]: ../tmp/${ID}/probe.txt`)).toBe(true);
    expect(cited(`- a\n  - b\n\n        [p]: ../tmp/${ID}/probe.txt`)).toBe(true);
    expect(cited(`[p]:\n  ../tmp/${ID}/probe.txt`)).toBe(true);
    expect(cited(`[a\\]b]: ../tmp/${ID}/probe.txt`)).toBe(true);
  });

  it("J-73 S4 reads a reference definition behind a list marker, and one whose label spans lines", () => {
    for (const marker of ["- ", "* ", "+ ", "1. ", "2) ", "> - "])
      expect(cited(`[probe][p]\n\n${marker}[p]: ../tmp/${ID}/probe.txt`), marker).toBe(true);
    expect(cited(`[probe][a b]\n\n[a\nb]: ../tmp/${ID}/probe.txt`)).toBe(true);
  });

  it("J-73 S4 an attribute that links to one address keeps its spaces, so it still reaches a folder above", () => {
    expect(
      cited('<a href="file:///Users/me/My Repo/.greenline/tmp/">t</a>', "/Users/me/My Repo"),
    ).toBe(true);
  });

  it("J-73 S4 reads autolinks and the HTML attributes that link, a srcset's every address", () => {
    expect(cited(`<file:///home/me/repo/.greenline/tmp/${ID}/log.txt>`)).toBe(true);
    expect(cited(`<https://example.com/r/blob/main/.greenline/tmp/${ID}/x>`)).toBe(true);
    expect(cited(`<img srcset="a.png 1x, ../tmp/${ID}/b.png 2x">`)).toBe(true);
    expect(cited(`<object data="../tmp/${ID}/x.svg"></object>`)).toBe(true);
    expect(cited(`<video poster='../tmp/${ID}/x.png'></video>`)).toBe(true);
  });

  it("J-73 S4 reads character references, a stray percent beside a good escape, and dot segments in any address", () => {
    expect(cited(`[log](../tmp&#47;${ID}/log.txt)`)).toBe(true);
    expect(cited(`[log](../tmp&sol;${ID}/log.txt)`)).toBe(true);
    expect(cited(`[log](../tm%70/${ID}/50%.txt)`)).toBe(true);
    expect(cited(`[log](file:///home/me/repo/.greenline/tmp/./${ID}/log.txt)`)).toBe(true);
    expect(cited(`[log](/home/me/repo/.greenline/tmp/./${ID}/x)`)).toBe(true);
  });

  it("J-73 S4 an absolute or file address onto a folder above counts once the root is known, and a root-relative path without a slash counts", () => {
    expect(cited("[tmp](file:///home/me/repo/.greenline/tmp/)", "/home/me/repo")).toBe(true);
    expect(cited("[g](/home/me/repo/.greenline/)", "/home/me/repo")).toBe(true);
    expect(cited("[g](/home/me/other/.greenline/)", "/home/me/repo")).toBe(false);
    expect(cited(`[x](.greenline/tmp/./${ID}/x)`)).toBe(true);
    expect(cited("[tmp](.greenline/tmp/)")).toBe(true);
  });

  it("J-73 S4 a disk that resolves a local target into the folder makes it a citation", () => {
    const viaDisk = citationsInto(
      { folder: FOLDER },
      [{ path: `.greenline/ledger/${ID}.md`, text: `[r](${ID}/review-1.md)` }],
      (from, path) => from.endsWith(".md") && path.segments.join("/") === `${ID}/review-1.md`,
    );
    expect(viaDisk).toEqual([{ path: `.greenline/ledger/${ID}.md`, target: `${ID}/review-1.md` }]);
  });
});

describe("J-73 S4 tidy's verdict on one change", () => {
  it("J-73 S4 a done or dropped change whose folder no ledger file cites is removed", () => {
    expect(tidyVerdict(ID, done, ledger(done))).toEqual({ kind: "remove" });
    const dropped = record("dropped");
    expect(tidyVerdict(ID, dropped, ledger(dropped))).toEqual({ kind: "remove" });
  });

  it("J-73 S4 an open or stopped change is kept", () => {
    const open = record("open");
    expect(tidyVerdict(ID, open, ledger(open))).toEqual({
      kind: "keep",
      reason: { kind: "unfinished", state: "open" },
    });
    const stopped = record("stopped", ['next: "build: carry on"']);
    expect(tidyVerdict(ID, stopped, ledger(stopped))).toEqual({
      kind: "keep",
      reason: { kind: "unfinished", state: "stopped" },
    });
  });

  it("J-73 S4 a folder with no record, or a record that does not parse, is kept", () => {
    expect(tidyVerdict(ID, undefined, [])).toEqual({ kind: "keep", reason: { kind: "no-record" } });
    const broken = "no front matter\n";
    const verdict = tidyVerdict(ID, broken, ledger(broken));
    expect(verdict.kind).toBe("keep");
    expect(verdict.kind === "keep" ? verdict.reason.kind : undefined).toBe("unparsed");
    // A stopped record without its next line does not parse, and is kept whatever it says.
    expect(tidyVerdict(ID, record("stopped"), ledger(record("stopped"))).kind).toBe("keep");
  });

  it("J-73 S4 a done change whose record, or another ledger file, cites a path in its folder is kept", () => {
    const citing = record("done", [], [`See [the probe](../tmp/${ID}/probe.txt).`]);
    expect(tidyVerdict(ID, citing, ledger(citing))).toEqual({
      kind: "keep",
      reason: { kind: "cited", by: `.greenline/ledger/${ID}.md`, target: `../tmp/${ID}/probe.txt` },
    });
    const other = {
      path: ".greenline/ledger/2026-10-14-plan.md",
      text: `[the brief](<../tmp/${ID}/brief-review-1.md>)`,
    };
    expect(tidyVerdict(ID, done, [...ledger(done), other])).toEqual({
      kind: "keep",
      reason: {
        kind: "cited",
        by: ".greenline/ledger/2026-10-14-plan.md",
        target: `../tmp/${ID}/brief-review-1.md`,
      },
    });
  });

  it("J-73 S4 a plain mention of the folder in prose is no citation", () => {
    const mention = record("done", [], [`## close`, `Deleted .greenline/tmp/${ID}/ at close.`]);
    expect(tidyVerdict(ID, mention, ledger(mention))).toEqual({ kind: "remove" });
  });
});
