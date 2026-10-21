import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import {
  parsePlanDocument,
  parseTicketsFile,
  readyFrontier,
  ticketProgress,
  type TicketsFile,
} from "../../src/core/plan-documents.ts";

const modesPath = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");

function corpus(): ModesDefinition {
  const modes = parseModes(readFileSync(modesPath, "utf8"), modesPath);
  if (modes._tag === "err") throw modes.error;
  return modes.value;
}

const definition = corpus();

function entry(id: string, mode: string, after: readonly string[] = []): readonly string[] {
  return [
    `## ${id}`,
    "",
    `intent: "the ${id} work"`,
    "scope:",
    `  - src/${id.toLowerCase()}.ts`,
    "acceptance:",
    '  - "the focused tests pass"',
    ...(after.length === 0 ? [] : [`after: [${after.join(", ")}]`]),
    `mode: ${mode}`,
    "",
  ];
}

function tickets(...entries: readonly (readonly string[])[]): string {
  return ["---", "status: complete", "---", "", "# Tickets", "", ...entries.flat()].join("\n");
}

function parsed(input: string): TicketsFile {
  const result = parseTicketsFile(definition, "tickets.md", input);
  if (result._tag === "err") throw result.error;
  return result.value;
}

function refused(path: string, message: string) {
  return { _tag: "err", error: expect.objectContaining({ issues: [{ path, message }] }) };
}

describe("a plan document", () => {
  it("S3 a plan document carries its draft or complete mark and nothing else", () => {
    expect(parsePlanDocument("spec.md", "---\nstatus: draft\n---\n\n# Spec\n")).toEqual({
      _tag: "ok",
      value: { status: "draft", body: "\n# Spec\n" },
    });
  });

  it("S3 refuses a revision field on a plan document", () => {
    expect(parsePlanDocument("spec.md", "---\nstatus: draft\nrevision: 2\n---\n")).toEqual(
      refused("", 'Unrecognized key: "revision"'),
    );
  });

  it("S3 refuses a mark other than draft or complete", () => {
    expect(parsePlanDocument("spec.md", "---\nstatus: final\n---\n")).toEqual(
      refused("status", 'Invalid option: expected one of "draft"|"complete"'),
    );
  });
});

describe("a tickets file parses", () => {
  it("S3 each entry carries its id, intent, scope, acceptance, the entries it comes after and its mode", () => {
    expect(parsed(tickets(entry("T1", "regular"), entry("T2", "quick", ["T1"])))).toEqual({
      status: "complete",
      tickets: [
        {
          id: "T1",
          intent: "the T1 work",
          scope: ["src/t1.ts"],
          acceptance: ["the focused tests pass"],
          after: [],
          mode: "regular",
        },
        {
          id: "T2",
          intent: "the T2 work",
          scope: ["src/t2.ts"],
          acceptance: ["the focused tests pass"],
          after: ["T1"],
          mode: "quick",
        },
      ],
    });
  });
});

describe("a tickets file refuses", () => {
  it("S3 refuses a duplicate ticket id", () => {
    expect(
      parseTicketsFile(
        definition,
        "tickets.md",
        tickets(entry("T1", "quick"), entry("T1", "careful")),
      ),
    ).toEqual(refused("T1", "duplicate ticket 'T1'"));
  });

  it("S3 refuses a key an entry does not define", () => {
    const owned = [...entry("T1", "quick").slice(0, -1), "owner: sam", ""];
    expect(parseTicketsFile(definition, "tickets.md", tickets(owned))).toEqual(
      refused("T1", 'Unrecognized key: "owner"'),
    );
  });

  it("S3 refuses a key the tickets file's front matter does not define", () => {
    const input = tickets(entry("T1", "quick")).replace(
      "status: complete",
      "status: complete\nowner: sam",
    );
    expect(parseTicketsFile(definition, "tickets.md", input)).toEqual(
      refused("", 'Unrecognized key: "owner"'),
    );
  });

  it("S3 refuses an entry that comes after an entry the file does not hold", () => {
    expect(
      parseTicketsFile(definition, "tickets.md", tickets(entry("T1", "quick", ["T9"]))),
    ).toEqual(refused("T1.after", "'T9' is not an entry"));
  });

  it("S3 refuses an entry that comes after itself", () => {
    expect(
      parseTicketsFile(definition, "tickets.md", tickets(entry("T1", "quick", ["T1"]))),
    ).toEqual(refused("T1.after", "'T1' comes after itself"));
  });

  it("S3 refuses entries that come after one another in a cycle", () => {
    const input = tickets(
      entry("T1", "quick", ["T3"]),
      entry("T2", "quick", ["T1"]),
      entry("T3", "quick", ["T2"]),
      entry("T4", "quick", ["T3"]),
    );
    expect(parseTicketsFile(definition, "tickets.md", input)).toEqual(
      refused("after", "these entries come after one another in a cycle: T1, T2, T3"),
    );
  });

  it("S3 refuses a mode the definition does not hold", () => {
    expect(parseTicketsFile(definition, "tickets.md", tickets(entry("T1", "turbo")))).toEqual(
      refused("T1.mode", "'turbo' is not a mode"),
    );
  });

  it("S3 refuses a heading that is not a ticket id", () => {
    expect(parseTicketsFile(definition, "tickets.md", tickets(entry("2 more", "quick")))).toEqual(
      refused("", "line 7: '2 more' is not a ticket id"),
    );
  });

  it("S3 refuses an entry missing a field, located by its id", () => {
    const bare = ["## T1", "", 'intent: "x"', "scope: [src]", "mode: quick"];
    expect(parseTicketsFile(definition, "tickets.md", tickets(bare))).toEqual(
      refused("T1.acceptance", "Invalid input: expected array, received undefined"),
    );
  });

  it("S3 refuses a dialect error inside an entry, at its line in the file", () => {
    const broken = ["## T1", "", 'intent: "x"', "", "mode: quick"];
    expect(parseTicketsFile(definition, "tickets.md", tickets(broken))).toEqual(
      refused("T1", "line 10: blank lines are not allowed in frontmatter"),
    );
  });
});

describe("a ticket's progress", () => {
  const file = parsed(
    tickets(
      entry("T1", "regular"),
      entry("T2", "quick", ["T1"]),
      entry("T3", "careful"),
      entry("T4", "quick", ["T2", "T3"]),
    ),
  );

  it("S3 a ticket is not started, in progress or done from the records that name it", () => {
    expect(
      ticketProgress(file, [
        { ticket: "T1", state: "dropped" },
        { ticket: "T1", state: "done" },
        { ticket: "T2", state: "stopped" },
        { ticket: "T3", state: "dropped" },
        { ticket: "T9", state: "open" },
      ]),
    ).toEqual([
      { ticket: "T1", progress: "done" },
      { ticket: "T2", progress: "in progress" },
      { ticket: "T3", progress: "not started" },
      { ticket: "T4", progress: "not started" },
    ]);
  });

  it("S3 the ready frontier is every ticket not started whose earlier entries are done", () => {
    expect(readyFrontier(file, [])).toEqual(["T1", "T3"]);
    expect(readyFrontier(file, [{ ticket: "T1", state: "done" }])).toEqual(["T2", "T3"]);
    expect(
      readyFrontier(file, [
        { ticket: "T1", state: "done" },
        { ticket: "T2", state: "done" },
        { ticket: "T3", state: "open" },
      ]),
    ).toEqual([]);
    expect(
      readyFrontier(file, [
        { ticket: "T1", state: "done" },
        { ticket: "T2", state: "done" },
        { ticket: "T3", state: "done" },
      ]),
    ).toEqual(["T4"]);
  });

  it("S3 a tickets file marked draft has no ready ticket until it is marked complete", () => {
    const draft = parsed(
      tickets(entry("T1", "regular"), entry("T2", "quick", ["T1"])).replace(
        "status: complete",
        "status: draft",
      ),
    );
    expect(readyFrontier(draft, [])).toEqual([]);
    expect(readyFrontier(draft, [{ ticket: "T1", state: "done" }])).toEqual([]);
  });

  it("S3 a heading inside a fenced block in a tickets file starts no entry", () => {
    const input = tickets(
      [
        "An entry looks like this:",
        "```md",
        "## T9",
        "mode: careful",
        "```",
        "~~~",
        "## T8",
        "~~~",
        "",
      ],
      entry("T1", "quick"),
    );
    expect(parsed(input).tickets.map((ticket) => ticket.id)).toEqual(["T1"]);
  });
});
