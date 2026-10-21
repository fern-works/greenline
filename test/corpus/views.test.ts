/** The views (`src/corpus/views.ts`): the index, the sources register, the notices and the line view rendered from the fixture chain, the credit lines apart, and the formatter leaving each as rendered. */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import { parseChain, type Chain } from "../../src/corpus/chain.ts";
import { renderViews, type NoticeSource, type ViewsInput } from "../../src/corpus/views.ts";
import {
  chainTexts,
  ENTRY_SCHEMA,
  EXPECTED_CORPUS_NOTICE,
  EXPECTED_INDEX,
  EXPECTED_LINE,
  EXPECTED_NOTICES,
  EXPECTED_REGISTER,
  fixtureEntries,
  fixturePlacement,
  fixtureRetirement,
  FIXTURE_MODES,
  RECIPE_DIGEST,
  STUB_SOURCES,
  type FixtureEntry,
  type FixtureObject,
} from "../fixtures/chain.ts";
import { COMMIT, CREDITED, REPOSITORY, SOURCE, UPSTREAM_LICENCE } from "../fixtures/recipe.ts";

const repository = join(import.meta.dirname, "..", "..");
const encoder = new TextEncoder();

function fixtureChain(): Chain {
  const chain = parseChain(
    chainTexts(fixtureEntries()).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
  );
  if (chain._tag === "err") throw chain.error;
  return chain.value;
}

const PINNED: NoticeSource = {
  name: SOURCE,
  repo: REPOSITORY,
  commit: COMMIT,
  snapshot: `upstream/${SOURCE}/${COMMIT}`,
  licence: UPSTREAM_LICENCE,
};
const HELD: NoticeSource = {
  name: CREDITED,
  repo: "https://example.com/fixture-credited",
  commit: "c".repeat(40),
  snapshot: `upstream/${CREDITED}/${"c".repeat(40)}`,
  holder: "Copyright (c) 2026 Credited Author",
};

function fixtureDefinition(): ModesDefinition {
  const parsed = parseModes(FIXTURE_MODES, "corpus/runtime/modes.json");
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

function input(change: Partial<ViewsInput> = {}): ViewsInput {
  return {
    chain: fixtureChain(),
    definition: fixtureDefinition(),
    recipeSources: new Map([["tiny-skill", STUB_SOURCES]]),
    sources: [PINNED, HELD],
    skills: [
      { name: "fixture-skill", kind: "step", slot: "check" },
      {
        name: "tiny-skill",
        kind: "habit",
        extra: true,
        credits: "icon catalog credits the Fixture Icons (MIT).",
      },
    ],
    ...change,
  };
}

describe("the views of the fixture chain", () => {
  it("render the index newest first, the register with its credit lines apart, both notices and the line", () => {
    expect(renderViews(input())).toEqual({
      _tag: "ok",
      value: [
        { path: "corpus/ledger/INDEX.md", text: EXPECTED_INDEX },
        { path: "docs/SOURCES.md", text: EXPECTED_REGISTER },
        { path: "THIRD_PARTY_NOTICES.md", text: EXPECTED_NOTICES },
        { path: "corpus/NOTICE.md", text: EXPECTED_CORPUS_NOTICE },
        { path: "corpus/ledger/LINE.md", text: EXPECTED_LINE },
      ],
    });
  });

  it("lists a stub's source under credits, not under tracked sources", () => {
    const views = renderViews(input());
    const register = views._tag === "ok" ? (views.value[1]?.text ?? "") : "";
    const [tracked = "", credits = ""] = register.split("## Credit lines");
    expect(credits).toContain(
      "| `fixture-credited` | https://example.com/fixture-credited at `cccccccccccc` | `tiny-skill` |",
    );
    expect(tracked).not.toContain("`tiny-skill`");
  });

  it("lists a measured source the skill takes no text of exactly under credits (C14)", () => {
    const [read, change] = fixtureEntries();
    if (read === undefined || change === undefined) throw new Error("the fixture holds a change");
    change["measure"] = {
      stub: false,
      sources: [
        {
          source: SOURCE,
          segments: 12,
          taken: 11,
          exact: 10,
          retention: 10 / 11,
          coverage: 11 / 12,
          meetsMinimum: true,
          creditLine: false,
        },
        {
          source: CREDITED,
          segments: 0,
          taken: 0,
          exact: 0,
          retention: null,
          coverage: null,
          meetsMinimum: null,
          creditLine: true,
        },
      ],
      growth: 7,
    };
    const chain = parseChain(
      chainTexts([read, change]).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
    );
    if (chain._tag === "err") throw chain.error;
    const views = renderViews(input({ chain: chain.value }));
    const register = views._tag === "ok" ? (views.value[1]?.text ?? "") : "";
    const [tracked = "", credits = ""] = register.split("## Credit lines");
    expect(credits).toContain(
      "| `fixture-credited` | https://example.com/fixture-credited at `cccccccccccc` | `fixture-skill` |",
    );
    expect(tracked).not.toContain("`fixture-credited`");
  });

  it.each<[string, string, boolean]>([
    ["copy", "mit", true],
    ["combine", "mit", true],
    ["lift", "ideas-only", true],
    ["hand-off", "permissive-other", false],
    ["hold", "refused", false],
    ["decline", "mit", false],
  ])(
    "renders %s in the register's verdict column, with a placed method's catches and modes",
    (verdict, licence, placed) => {
      const [read] = fixtureEntries();
      if (read === undefined) throw new Error("the fixture holds a source read");
      read["verdict"] = verdict;
      read["licence"] = licence;
      read["reason"] = "The fixture's reason.";
      if (!placed) delete read["placement"];
      if (verdict === "hand-off")
        read["handoff"] = { recipient: "garden", parts: [{ part: "its rules", locator: "." }] };
      const chain = parseChain(
        chainTexts([read]).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
      );
      if (chain._tag === "err") throw chain.error;
      const views = renderViews(input({ chain: chain.value }));
      const register = views._tag === "ok" ? (views.value[1]?.text ?? "") : "";
      const row = register
        .split("\n")
        .find((line) => line.includes("`2026-10-04-fixture-upstream-read`"));
      const cells = row?.split(" | ").map((cell) => cell.trim());
      expect(cells?.[1]).toBe(`\`${licence}\``);
      expect(cells?.[2]).toBe(`\`${verdict}\``);
      expect(cells?.[3]).toBe(
        placed
          ? "A fixture change whose check cannot fail. A step by `strengthen` of `fixture-skill`, placed at `quick` (`check`, inline) and `careful` (`check`, independent), a trial."
          : "none",
      );
    },
  );

  it("names a placement that runs at no mode, closing a catch written without its full stop", () => {
    const [read] = fixtureEntries();
    if (read === undefined) throw new Error("the fixture holds a source read");
    read["placement"] = {
      ...fixturePlacement(),
      catches: "A fixture change whose check cannot fail",
      modes: [
        { mode: "quick", step: "check", depth: "none", cost: 0 },
        { mode: "careful", step: "check", depth: "none", cost: 0 },
      ],
      ships: "default",
    };
    const chain = parseChain(
      chainTexts([read]).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
    );
    if (chain._tag === "err") throw chain.error;
    const views = renderViews(input({ chain: chain.value }));
    const register = views._tag === "ok" ? (views.value[1]?.text ?? "") : "";
    expect(register).toContain(
      "| A fixture change whose check cannot fail. A step by `strengthen` of `fixture-skill`, placed at no mode, a default. |",
    );
  });

  it("carries the frozen rows verbatim after the register while they are given", () => {
    const frozen = "| Source | Verdict |\n| ------ | ------- |\n| A book | read    |\n";
    const register = renderViews(input({ frozenRows: frozen }));
    expect(register._tag === "ok" && register.value[1]?.text).toBe(
      `${EXPECTED_REGISTER}\n## Before the ledger, frozen on 2026-09-16\n\nThese rows are the register as it stood before the old ledger, kept byte for byte.\n\n${frozen}`,
    );
  });

  it("are left as rendered by the gate's formatter", () => {
    const formatter = join(repository, "node_modules", ".bin", "oxfmt");
    for (const [path, text] of [
      ["corpus/ledger/INDEX.md", EXPECTED_INDEX],
      ["docs/SOURCES.md", EXPECTED_REGISTER],
      ["THIRD_PARTY_NOTICES.md", EXPECTED_NOTICES],
      ["corpus/NOTICE.md", EXPECTED_CORPUS_NOTICE],
      ["corpus/ledger/LINE.md", EXPECTED_LINE],
    ] as const) {
      const formatted = spawnSync(formatter, ["--stdin-filepath", path], {
        cwd: repository,
        input: text,
        encoding: "utf8",
      });
      expect([path, formatted.stdout]).toEqual([path, text]);
    }
  });

  it("say that nothing is recorded yet for an empty chain", () => {
    const views = renderViews(input({ chain: { entries: [] } }));
    expect(views._tag === "ok" && views.value.map((view) => view.text)).toEqual([
      expect.stringContaining("No entry is recorded yet."),
      expect.stringContaining("## Sources read\n\nNone yet."),
      expect.not.stringContaining("## MIT License"),
      expect.stringContaining("No skill takes from or credits a source yet."),
      expect.stringContaining(
        "| `check`   | inline | independent, 1 agent | `fixture-skill` | none   | none",
      ),
    ]);
  });
});

describe("the notices' terms", () => {
  it("refuse a source with a licence file and a holder, and one with neither", () => {
    expect(
      renderViews(input({ sources: [{ ...PINNED, holder: "Copyright (c) 2026 Someone" }, HELD] })),
    ).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [
          "fixture-upstream: the snapshot carries a licence file; its copyright line is the file's",
        ],
      }),
    });
    const { holder: _holder, ...bare } = HELD;
    expect(renderViews(input({ sources: [PINNED, bare] }))).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [
          "fixture-credited: the snapshot carries no licence file and the manifest names no holder",
        ],
      }),
    });
  });

  it("refuse a source the manifest does not pin, and notices with no MIT text", () => {
    expect(renderViews(input({ sources: [PINNED] }))).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: ["fixture-credited: the manifest pins no such source"],
      }),
    });
    expect(
      renderViews(
        input({
          sources: [{ ...PINNED, licence: undefined, holder: "Copyright (c) 2026 A" }, HELD],
        }),
      ),
    ).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: ["no snapshot's licence file carries the MIT permission text"],
      }),
    });
  });
});

describe("S13: the views of a chain that retires a skill", () => {
  function retiringChain(): Chain {
    const chain = parseChain(
      chainTexts([...fixtureEntries(), fixtureRetirement()]).map(({ name, text }) => ({
        name,
        bytes: encoder.encode(text),
      })),
    );
    if (chain._tag === "err") throw chain.error;
    return chain.value;
  }
  const views = renderViews(
    input({
      chain: retiringChain(),
      skills: [
        { name: "fixture-heir", kind: "step", slot: "check" },
        {
          name: "tiny-skill",
          kind: "habit",
          extra: true,
          credits: "icon catalog credits the Fixture Icons (MIT).",
        },
      ],
    }),
  );
  const text = (path: string): string =>
    views._tag === "ok" ? (views.value.find((view) => view.path === path)?.text ?? "") : "";

  it("show the retirement in the index, with its slice, its replacement and the recipe it leaves", () => {
    expect(text("corpus/ledger/INDEX.md")).toContain(
      `## 2026-10-08-fixture-skill-retired\n\nA retirement of the skill \`fixture-skill\`, by S13 of the fixture plan; \`fixture-heir\` takes its place. It leaves the recipe \`${RECIPE_DIGEST.slice(0, 12)}\`: The fixture heir takes the fixture skill's place, as the fixture ruling says.\n`,
    );
  });

  it("list the retired skill apart in the register, and no longer among the tracked sources", () => {
    const register = text("docs/SOURCES.md");
    const [, retired = ""] = register.split("## Retired skills");
    expect(retired).toContain(
      "| `fixture-skill` | `fixture-heir` | S13 of the fixture plan | The fixture heir takes the fixture skill's place, as the fixture ruling says. | `2026-10-08-fixture-skill-retired` |",
    );
    const [, tracked = ""] = register.split("## Tracked sources");
    expect(tracked.split("## Credit lines")[0]).toContain("None yet.");
  });

  it("name in the notices only the skills that ship, so a source only the retired skill took leaves them", () => {
    const notices = text("THIRD_PARTY_NOTICES.md");
    expect(notices).not.toContain("fixture-skill");
    expect(notices).not.toContain("`fixture-upstream`");
    expect(notices).toContain("`tiny-skill` (extra) (credit)");
  });

  it("stand the retired skill's candidate on its replacement's row, and the retired name on no row", () => {
    const line = text("corpus/ledger/LINE.md");
    const row = line.split("\n").find((each) => each.startsWith("| `check`"));
    expect(row).toContain("`fixture-heir`");
    expect(row).toContain("`fixture-upstream/fixture` (`copy`, `strengthen`)");
    expect(line).not.toContain("| `fixture-skill`");
  });
});

describe("S8b: the views of each entry's gist, rulings and handoff, and the outbox of handoffs", () => {
  /** A chain of the given entries, oldest first. */
  function chainOf(entries: readonly FixtureEntry[]): Chain {
    const chain = parseChain(
      chainTexts(entries).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
    );
    if (chain._tag === "err") throw chain.error;
    return chain.value;
  }
  /** The text of one view of `entries`, the outbox rendered when asked. */
  function viewOf(
    entries: readonly FixtureEntry[],
    path: string,
    outbox = true,
  ): string | undefined {
    const views = renderViews(input({ chain: chainOf(entries), outbox }));
    if (views._tag === "err") throw views.error;
    return views.value.find((view) => view.path === path)?.text;
  }
  /** A table's text with its padding and its rules' widths left out, so a case reads as its cells. */
  const cells = (text: string | undefined): string =>
    (text ?? "").replace(/-{3,}/g, "---").replace(/ {2,}/g, " ");

  const [read, recipe, stub, declined] = fixtureEntries();
  if (read === undefined || recipe === undefined || stub === undefined || declined === undefined)
    throw new Error("the fixture holds four entries");

  /** An unpinned source entry, on an ideas-only licence unless it combines, with the fields given. */
  function sourceEntry(
    id: string,
    path: string,
    verdict: string,
    reason: string,
    fields: FixtureObject = {},
  ): FixtureEntry {
    const entry: FixtureEntry = {
      schema: ENTRY_SCHEMA,
      id,
      kind: "source",
      source: { repository: "https://example.com/upstream", commit: "a".repeat(40), path },
      licence: verdict === "combine" ? "mit" : "ideas-only",
      verdict,
      gist: "An upstream source, read and ruled",
      reason,
      authorisedBy: null,
      ruling: [],
      ...fields,
    };
    // J-66: an entry with a ruling names it as the one that authorised it.
    const [first] = Array.isArray(entry["ruling"]) ? entry["ruling"] : [];
    if (fields["authorisedBy"] === undefined && first !== undefined) entry["authorisedBy"] = first;
    if (verdict === "combine") entry["placement"] = fixturePlacement();
    return entry;
  }
  const where = (path: string) => `https://example.com/upstream at \`aaaaaaaaaaaa\`, \`${path}\``;
  const garden = (part: string, locator: string) => ({
    recipient: "garden",
    parts: [{ part, locator }],
  });

  const combined = sourceEntry(
    "2026-10-12-new-combined",
    "skills/new-combined",
    "combine",
    "Its core joins.",
    {
      handoff: {
        recipient: "craft-writing-for-agents",
        parts: [{ part: "its prompt line", locator: "SKILL.md, line 12" }],
      },
    },
  );
  // SAFETY: a combine carries its placement, an object.
  (combined["placement"] as FixtureObject)["loads"] = [
    { file: "references/check.md", depth: "independent" },
  ];
  const entries: readonly FixtureEntry[] = [
    read,
    sourceEntry(
      "2026-10-08-garden-bound",
      "skills/caching",
      "hand-off",
      "Its caching rules are knowledge.",
      { handoff: garden("its caching rules", "skills/caching") },
    ),
    sourceEntry("2026-10-08-superseded", "skills/later", "hand-off", "Its rules are knowledge.", {
      handoff: garden("its rules", "skills/later"),
    }),
    sourceEntry("2026-10-12-later", "skills/later", "decline", "It restates the fixture.", {
      ruling: [{ date: "2026-10-12", words: "Decline it after all" }],
    }),
    sourceEntry("2026-10-12-new-bound", "skills/new", "hand-off", "Its two parts are knowledge.", {
      gist: "Two parts handed to garden",
      ruling: [{ date: "2026-10-12", words: '"yes", hand both off' }],
      handoff: {
        recipient: "garden",
        parts: [
          { part: "its cache rules", locator: "SKILL.md, the caching section" },
          { part: "its cache table", locator: "references/table.md" },
        ],
      },
    }),
    combined,
  ];

  it("render the outbox from each source's latest entry, every part of its handoff with its recipient and locator, and a source whose latest entry hands nothing off left out", () => {
    expect(cells(viewOf(entries, "docs/HANDOFFS.md"))).toBe(
      cells(`# Handoffs

Generated by \`node scripts/corpus.mjs views\` from the entries under \`corpus/ledger/entries/\`, and never edited by hand. It lists every part the ledger hands to another owner, garden or a workshop craft, as each source's latest entry records it, oldest first. The receiving owner reads it from its own checkout and takes a part by recording its own entry naming the entry here.

## Handed off

| Source | Recipient | Part | Locator | Entry |
| --- | --- | --- | --- | --- |
| ${where("skills/caching")} | \`garden\` | its caching rules | skills/caching | \`2026-10-08-garden-bound\` |
| ${where("skills/new")} | \`garden\` | its cache rules | SKILL.md, the caching section | \`2026-10-12-new-bound\` |
| ${where("skills/new")} | \`garden\` | its cache table | references/table.md | \`2026-10-12-new-bound\` |
| ${where("skills/new-combined")} | \`craft-writing-for-agents\` | its prompt line | SKILL.md, line 12 | \`2026-10-12-new-combined\` |
`),
    );
  });

  it("say that nothing is handed off yet for a chain without a handoff", () => {
    expect(viewOf([read, recipe], "docs/HANDOFFS.md")).toMatch(/## Handed off\n\nNone yet\.\n$/);
  });

  it("render no outbox where the repository holds no workshop, and the other views as before", () => {
    const views = renderViews(input({ chain: chainOf(entries) }));
    expect(views._tag === "ok" && views.value.map((view) => view.path)).toEqual([
      "corpus/ledger/INDEX.md",
      "docs/SOURCES.md",
      "THIRD_PARTY_NOTICES.md",
      "corpus/NOTICE.md",
      "corpus/ledger/LINE.md",
    ]);
    expect(viewOf(fixtureEntries(), "docs/HANDOFFS.md", true)).toBeDefined();
    expect(viewOf(fixtureEntries(), "corpus/ledger/INDEX.md", true)).toBe(EXPECTED_INDEX);
  });

  it("show an entry's gist, its rulings, its handoff and its loads fact in the index", () => {
    const index = viewOf(
      [read, recipe, stub, declined, ...entries.slice(4)],
      "corpus/ledger/INDEX.md",
    );
    expect(index).toContain(
      `## 2026-10-12-new-bound\n\nA source read: https://example.com/upstream at \`aaaaaaaaaaaa\`, path \`skills/new\`. Licence \`ideas-only\`, verdict \`hand-off\`: Its two parts are knowledge.\n\nGist: Two parts handed to garden\n\nAuthorised by: 2026-10-12: "yes", hand both off\n\nRulings:\n\n- 2026-10-12: "yes", hand both off\n\nHanded to \`garden\`:\n\n- its cache rules, at SKILL.md, the caching section\n- its cache table, at references/table.md\n\n`,
    );
    expect(index).toContain(
      "Handed to `craft-writing-for-agents`:\n\n- its prompt line, at SKILL.md, line 12\n\nA `step` by `strengthen` of `fixture-skill`",
    );
    expect(index).toContain(
      "| `careful` | `check` | `independent` | 120           |\n\nIt loads `references/check.md` at the depth `independent`.\n",
    );
    expect(index).toContain(
      "## 2026-10-06-tiny-skill-stub\n\nA change to the skill `tiny-skill`: The tiny skill is written here and credits its source.\n\nPages: `SKILL.md`.\n\nGist: The tiny skill is written here, crediting its source\n\nThe skill is a stub: its sources are credited, not measured.\n\nWritten words, the whole skill's: 9.\n\nAuthorised by: 2026-10-06: Tiny only delegates, so it is a stub\n\nRulings, cumulative:\n\n- 2026-10-06: Tiny only delegates, so it is a stub\n",
    );
    expect(index).toContain(
      "## 2026-10-05-fixture-skill-recipe\n\nA change to the skill `fixture-skill`: The fixture skill moves to its recipe, byte for byte.\n\nPages: `SKILL.md`, `notes.md`, `scripts/run.sh`.\n\nGist: The fixture skill moves to its recipe\n\n",
    );
    expect(index).toContain(
      "Written words, the whole skill's: 7.\n\nAuthorised by: no ruling of its own.\n\nNo ruling is recorded.\n",
    );
  });

  it("are left as rendered by the gate's formatter, the outbox and the index among them", () => {
    const formatter = join(repository, "node_modules", ".bin", "oxfmt");
    for (const path of ["docs/HANDOFFS.md", "corpus/ledger/INDEX.md"]) {
      const text = viewOf(entries, path) ?? "";
      const formatted = spawnSync(formatter, ["--stdin-filepath", path], {
        cwd: repository,
        input: text,
        encoding: "utf8",
      });
      expect([path, formatted.stdout]).toEqual([path, text]);
    }
  });
});
