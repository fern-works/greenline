import { describe, expect, it } from "vitest";
import {
  codeMoved,
  pastCap,
  pictureLine,
  pictureOffers,
  picturesOf,
  promptTextOf,
  replyLacks,
  replyPastCap,
  replyTextOf,
  widestDrawn,
  type ReplyOwed,
} from "../../src/core/pictures.ts";
import { isModelFile } from "../../src/core/atlas.ts";

/**
 * The reply's pictures counted at the turn's end (J-129 S6): each fenced
 * picture's nodes and columns, the one past its cap, the reply's text by the
 * harness's own field, and the mirror's line at the next turn.
 */

/** A box drawing of the given boxes in one row of three, `┌──┐` each. */
function boxes(count: number): string {
  const rows: string[] = [];
  for (let start = 0; start < count; start += 3) {
    const here = Math.min(3, count - start);
    rows.push(Array.from({ length: here }, () => "┌────┐").join(" "));
    rows.push(
      Array.from({ length: here }, (_, i) => `│ n${String(start + i).padStart(2, "0")}│`).join(" "),
    );
    rows.push(Array.from({ length: here }, () => "└────┘").join(" "));
  }
  return rows.join("\n");
}

describe("J-129 S6 the reply's pictures counted against their caps", () => {
  it("counts a box drawing's boxes and its widest line", () => {
    const reply = ["The parts:", "", "```text", boxes(13), "```", "", "Done."].join("\n");
    expect(picturesOf(reply)).toEqual([{ nodes: 13, columns: 20 }]);
    expect(pastCap(picturesOf(reply))).toEqual({ nodes: 13, columns: 20 });
    const small = ["```", boxes(4), "```"].join("\n");
    expect(pastCap(picturesOf(small))).toBeUndefined();
  });

  it("counts a tree's lines and a mermaid picture's nodes, and a line past 72 columns", () => {
    const tree = ["```text", "src/", "├── a.ts", "├── b.ts", "└── c/", "    └── d.ts", "```"].join(
      "\n",
    );
    expect(picturesOf(tree)).toEqual([{ nodes: 5, columns: 12 }]);
    const mermaid = [
      "```mermaid",
      "flowchart LR",
      "  A[start] --> B[read]",
      "  B --> C{ok?}",
      "  C -->|yes| D",
      "```",
    ].join("\n");
    expect(picturesOf(mermaid)).toEqual([{ nodes: 4, columns: 22 }]);
    const wide = ["```", `┌${"─".repeat(78)}┐`, "```"].join("\n");
    expect(pastCap(picturesOf(wide))).toEqual({ nodes: 1, columns: 80 });
  });

  it("counts twelve stacked boxes as twelve, their bottom corners and dividers no tree, and a chained mermaid edge's every node", () => {
    const stacked = Array.from({ length: 12 }, (_, i) =>
      ["┌──────┐", `│ n${String(i).padStart(2, "0")}  │`, "├──────┤", "│      │", "└──────┘"].join(
        "\n",
      ),
    ).join("\n");
    expect(pastCap(picturesOf(["```", stacked, "```"].join("\n")))).toBeUndefined();
    expect(picturesOf(["```", stacked, "```"].join("\n"))[0]?.nodes).toBe(12);
    const chain = ["```mermaid", "flowchart LR", "  A --> B --> C", "  C -.-> D", "```"].join("\n");
    expect(picturesOf(chain)[0]?.nodes).toBe(4);
  });

  it("counts no code block in a language and no fenced text without a picture's glyphs", () => {
    const code = ["```ts", boxes(20), "```", "```text", "npm test", "```"].join("\n");
    expect(picturesOf(code)).toEqual([]);
  });

  it("reads the reply's text from the harness's own field, and none where it hands none", () => {
    expect(replyTextOf("claude-code", { last_assistant_message: "hi" })).toBe("hi");
    expect(replyTextOf("codex", { last_assistant_message: "hi" })).toBe("hi");
    expect(replyTextOf("gemini", { prompt_response: "hi" })).toBe("hi");
    expect(replyTextOf("claude-code", {})).toBeUndefined();
    expect(replyTextOf("opencode", { last_assistant_message: "hi" })).toBeUndefined();
  });

  it("names the previous turn's picture past its cap at the next turn, and nothing for unrun or an older turn", () => {
    const note = { turn: 3, state: "counted", nodes: 13, columns: 20 } as const;
    expect(pictureLine(note, 4)).toBe(
      "picture: one past its cap at turn 3 (13 nodes, 20 columns; the caps are 12 and 72); draw the next within them, the part that decides",
    );
    expect(pictureLine(note, 5)).toBeUndefined();
    expect(pictureLine({ turn: 3, state: "unrun" }, 4)).toBeUndefined();
    expect(pictureLine(undefined, 4)).toBeUndefined();
  });
});

describe("J-147 S3 the readings the replay corrected, and the owner's words from the payload", () => {
  const aligned = ["```text", `loan   member   due        ${"x".repeat(60)}`, "```"].join("\n");

  it("reads every drawn fence's widest line against the 72-column cap, an aligned text block with no glyph among them", () => {
    expect(widestDrawn(aligned)).toBe(87);
    expect(replyPastCap(aligned)).toEqual({ nodes: 0, columns: 87 });
    expect(replyPastCap(["```ts", "x".repeat(90), "```"].join("\n"))).toBeUndefined();
    expect(replyPastCap("```text\nshort\n```")).toBeUndefined();
  });

  it("reads the owner's words from the payload, and none where it hands none", () => {
    expect(promptTextOf({ prompt: "yes" })).toBe("yes");
    expect(promptTextOf({})).toBeUndefined();
  });

  it("reads a file that holds a shape the map draws by its path", () => {
    expect(isModelFile("db/migrations/002_add_year.sql")).toBe(true);
    expect(isModelFile("src/order-state.ts")).toBe(true);
    expect(isModelFile("schema.prisma")).toBe(true);
    expect(isModelFile("src/shelf.js")).toBe(false);
    expect(isModelFile(".github/workflows/ci.yml")).toBe(true);
    expect(isModelFile("data/us-states.csv")).toBe(false);
    expect(isModelFile("src/overflow.ts")).toBe(false);
    expect(isModelFile(".greenline/ledger/schema.md")).toBe(false);
  });
});

/** The box drawing of turn 003 of j196c-pictures-home, which the hook counted as no node (note 8). */
const SHELF_PATH = [
  " desk app        Shelf (src/shelf.js)              nightly job",
  " ────────        ────────────────────              ───────────",
  " lend ────────►  check on shelf, not lent",
  "                 store {isbn, member, on}",
  "                          │",
  "                          ▼",
  "                 #loans (Map by ISBN)",
  "                          │",
  " loans() ─┴──────────────────────►  not in this repo:",
  "                                    due = on + 14 days (D3)",
  " giveBack ► delete record           overdue if today > due",
  "                                    letter",
].join("\n");

describe("J-204 S1 the counter reads every text form, an arrow chain and a sequence among them (j196c-pictures-home note 8)", () => {
  it("counts an arrow chain of nine labels as nine, each label once", () => {
    const chain = [
      "```text",
      "parse ──► plan ──► lend ──► store ──► loans",
      "  ──► due ──► overdue ──► letter ──► send",
      "```",
    ].join("\n");
    expect(picturesOf(chain)).toEqual([{ nodes: 9, columns: 43 }]);
    const repeated = ["```", "a ──▶ b ──▶ c ──▶ a", "```"].join("\n");
    expect(picturesOf(repeated)[0]?.nodes).toBe(3);
  });

  it("counts the run's drawing of labels joined by arrows by its labels, its lane titles aside, never as zero", () => {
    const counted = picturesOf(["```", SHELF_PATH, "```"].join("\n"));
    expect(counted[0]?.nodes).toBe(11);
  });

  it("counts a sequence by its lifelines, the messages between them no node", () => {
    const sequence = [
      "```text",
      " client        server         db",
      "   │             │             │",
      "   │── GET ─────►│             │",
      "   │             │── query ───►│",
      "   │             │◄── rows ────│",
      "   │◄── 200 ─────│             │",
      "   │             │             │",
      "```",
    ].join("\n");
    expect(picturesOf(sequence)[0]?.nodes).toBe(3);
  });

  it("keeps the box and tree counts as they were, and reads the new counts against the caps", () => {
    expect(picturesOf(["```", boxes(4), "```"].join("\n"))[0]?.nodes).toBe(4);
    const long = [
      "```",
      Array.from({ length: 13 }, (_, i) => `s${String(i)}`).join(" ──► "),
      "```",
    ].join("\n");
    expect(pastCap(picturesOf(long))?.nodes).toBe(13);
    expect(replyPastCap(long)?.nodes).toBe(13);
  });
});

/** The bare build reply the judge graded owed (j196t-conduct-empty F4; j196t-conduct-interface F6 alike). */
const BARE_BUILD =
  "The greeting module and its passing test are committed, and the change is paused after the build.\n\nWaiting on: your instruction to resume the review.\n\nhttp://127.0.0.1:60684/changes/2026-11-08-greeting-module";

const DRAWN_BUILD = [
  "The members table replaces the cards, and its test passes.",
  "",
  "```text",
  "MembersPage ──► SearchBox",
  "            ──► MembersTable ──► MemberRow",
  "```",
  "",
  "Waiting on: your review.",
  "",
  "http://127.0.0.1:64024/changes/2026-11-08-members-table",
].join("\n");

const OWED: ReplyOwed = { turn: 3, printed: null, proceed: null };

describe("J-204 S1 a turn that moved code and drew no shape is named at the next turn (j196t-conduct-empty F4, j196t-linear F10, j196t-conduct-interface F6)", () => {
  it("reads the code a turn changed, tests, documents and greenline's own folder aside", () => {
    expect(
      codeMoved([
        "greeting.py",
        "test_greeting.py",
        "README.md",
        "src/members/MembersTable.tsx",
        "src/members/MembersTable.test.tsx",
        "docs/decisions.md",
        ".greenline/ledger/2026-11-08-greeting-module.md",
        "package-lock.json",
      ]),
    ).toEqual(["greeting.py", "src/members/MembersTable.tsx"]);
  });

  it("names a code-moving turn whose reply drew nothing, and not one that drew its shape", () => {
    expect(replyLacks(OWED, BARE_BUILD, [], { moved: 2, offeredBefore: 0, lost: [] })).toEqual([
      "picture: the turn changed 2 files and drew no shape; draw the resulting shape where one moved, in show-me's form for it",
    ]);
    expect(replyLacks(OWED, DRAWN_BUILD, [], { moved: 2, offeredBefore: 0, lost: [] })).toEqual([]);
    expect(replyLacks(OWED, BARE_BUILD, [], { moved: 0, offeredBefore: 0, lost: [] })).toEqual([]);
    expect(replyLacks(OWED, BARE_BUILD, [])).toEqual([]);
  });
});

describe("J-204 S1 one offer of a kept picture per change, never a lost picture's remake (the register's row of 2026-11-08)", () => {
  const OFFER =
    "Picture offered: the whole request path, a sequence of eighteen nodes, branded SVG; say keep";

  it("reads the reply's offer lines in their one form", () => {
    expect(pictureOffers(`Done.\n\n${OFFER}\n\nWaiting on: you.`)).toEqual([
      "the whole request path, a sequence of eighteen nodes, branded SVG; say keep",
    ]);
    expect(
      pictureOffers("- **Picture offered:** the map, an architecture diagram, text; say keep"),
    ).toEqual(["the map, an architecture diagram, text; say keep"]);
    expect(pictureOffers("I could draw a picture if you like.")).toEqual([]);
  });

  it("keeps the change's first offer, and names a second one in the change or in the same reply", () => {
    expect(replyLacks(OWED, OFFER, [], { moved: 0, offeredBefore: 0, lost: [] })).toEqual([]);
    expect(replyLacks(OWED, OFFER, [], { moved: 0, offeredBefore: 1, lost: [] })).toEqual([
      "offer: a second picture offer in this change at turn 3; a change offers a kept picture once, where the shape passes twelve nodes or 72 columns",
    ]);
    expect(
      replyLacks(OWED, `${OFFER}\n${OFFER}`, [], { moved: 0, offeredBefore: 0, lost: [] }),
    ).toHaveLength(1);
  });

  it("names an offer of a picture status names drifting, stale or deleted, a remake the owner's ask alone", () => {
    const lost = [
      { id: "2026-11-08-find-by-year/shelf-methods", title: "Shelf methods", state: "drifting" },
    ] as const;
    const remake = "Picture offered: the shelf methods again, a call tree, branded SVG; say keep";
    expect(replyLacks(OWED, remake, [], { moved: 0, offeredBefore: 0, lost })).toEqual([
      "offer: the offer at turn 3 remakes 2026-11-08-find-by-year/shelf-methods, which status names drifting; a lost picture's remake is the owner's ask alone, never offered",
    ]);
    const worded = "Picture offered: a remake of the parts picture, a box drawing, text; say keep";
    expect(replyLacks(OWED, worded, [], { moved: 0, offeredBefore: 0, lost: [] })).toEqual([
      "offer: the offer at turn 3 offers a remake; a lost picture's remake is the owner's ask alone, never offered",
    ]);
  });
});
