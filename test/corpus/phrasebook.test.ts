/** The phrasebook of 2026-11-07 (J-195): the operator's phrases as the words source holds them, each at its home, lifted as written. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { wordsOf } from "../../src/corpus/segments.ts";
import { verifyVerb } from "../../src/corpus/instrument.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

interface Phrase {
  readonly id: string;
  readonly text: string;
  readonly date: string;
  readonly where?: readonly string[];
  readonly dismissed?: { readonly failure: string };
}

// SAFETY: corpus/manifest.json is the manifest the installation compiles and checks; only the words source is read.
const manifest = JSON.parse(read("corpus/manifest.json")) as {
  sources: { name: string; kind?: string; phrases?: Phrase[] }[];
};
const phrasebook = manifest.sources.find((source) => source.name === "phrasebook");
const phrases = phrasebook?.phrases ?? [];
const phrase = (id: string): Phrase => {
  const found = phrases.find((each) => each.id === id);
  if (found === undefined) throw new Error(`no phrase '${id}'`);
  return found;
};

/** The phrases as the operator gave them, numbered as the job cites them; the eleventh split at its sentences. */
const GIVEN: readonly (readonly [string, string, "placed" | "dismissed"])[] = [
  ["state-machines", "find all of the implicit state machines in my app", "placed"],
  ["invariants", "find every invariant my app relies on but doesn't explicitly enforce", "placed"],
  [
    "irreducible-constraints",
    "Reduce this problem to its irreducible constraints and rebuild it from zero.",
    "placed",
  ],
  [
    "principal-architect",
    "What would a principal architect immediately rewrite before even starting this?",
    "placed",
  ],
  [
    "higher-abstraction",
    "What higher-level abstraction would make this entire problem disappear?",
    "placed",
  ],
  ["day-one-test", "Design the single test that breaks this design on day one.", "placed"],
  ["abstract-thinking", "Exercise abstract thinking when considering this task", "dismissed"],
  [
    "rabbithole",
    "are you in a rabbithole duct taping custom fixes together? is there a native way of doing this that would be cleaner?",
    "placed",
  ],
  [
    "high-standard",
    "You are responsible for maintaining a high standard of excellence and demanding the same of any subagents",
    "placed",
  ],
  ["thorough-and-bold", "Be thorough in your analysis and bold in your recommendations", "placed"],
  ["godspeed-role", "You are a Godspeed-enabled subagent.", "dismissed"],
  [
    "godspeed-axes",
    "1. Name the axes. 2. Iterate cheap, in parallel. 3. Keep moves that improve any axis and harm none. 4. Don't aim \u2014 let the frontier walk itself.",
    "placed",
  ],
  ["godspeed-stop-asking", "IMMEDIATELY STOP ASKING CLARIFYING QUESTIONS.", "dismissed"],
  [
    "godspeed-batching",
    "Execute tool calls concurrently in large batches. Do not serialize what can run in parallel.",
    "placed",
  ],
  ["godspeed-no-reasoning", "Do not output philosophical reasoning or verbose plans.", "dismissed"],
  ["godspeed-act", "Act directly via tool calls.", "dismissed"],
];

describe("J-195 S1 the phrasebook, the words source of 2026-11-07", () => {
  it("holds every phrase as the operator wrote it, dated, with its home or its dismissal", () => {
    expect(phrasebook?.kind).toBe("words");
    expect(
      phrases.map((each) => [
        each.id,
        each.text,
        each.where === undefined ? "dismissed" : "placed",
      ]),
    ).toEqual(GIVEN.map((each) => [...each]));
    for (const each of phrases) {
      expect(each.date, each.id).toBe("2026-11-07");
      if (each.dismissed !== undefined)
        expect(each.dismissed.failure.length, each.id).toBeGreaterThan(20);
    }
  });

  it("verifies every recipe that takes a phrase: each passage verbatim, or as its recorded edit leaves it", () => {
    const skills = ["state-machines", "invariants", "frame", "anticipate", "tdd", "build"];
    const verified = verifyVerb(join(ROOT, "corpus"), skills);
    expect(verified.output.refused).toEqual([]);
    expect(verified.output.differences).toEqual([]);
    expect(verified.output.verified).toEqual(skills);
  });

  it("opens each start's front on its phrase as a line of its own, the front under 300 words", () => {
    for (const id of ["state-machines", "invariants"]) {
      const front = read(`corpus/skills/${id}/SKILL.md`);
      expect(front.split("\n")).toContain(phrase(id).text);
      expect(wordsOf(front).length, id).toBeLessThan(300);
    }
  });
});

describe("J-195 S2 the moment sentences", () => {
  it("stands each stance at its step's method page, lifted as written", () => {
    for (const id of [
      "irreducible-constraints",
      "principal-architect",
      "higher-abstraction",
      "day-one-test",
    ])
      for (const home of phrase(id).where ?? [])
        expect(read(home), `${id} at ${home}`).toContain(phrase(id).text);
  });

  it("lifts the four numbered lines onto build's page with the one recorded edit, the dash made a comma", () => {
    const page = read("corpus/skills/build/method.md");
    expect(page).toContain(phrase("godspeed-axes").text.replace(" \u2014 ", ", "));
    expect(page).not.toContain("\u2014 let the frontier");
  });
});

describe("J-195 S3 and S4 the phrases outside a recipe", () => {
  it("opens every brief on the standard and prints the nudge from the files the phrasebook names", () => {
    expect(phrase("high-standard").where).toContain("src/core/brief.ts");
    expect(read("src/core/brief.ts")).toContain(phrase("high-standard").text);
    expect(phrase("rabbithole").where).toEqual(["src/core/rabbithole.ts"]);
    expect(read("src/core/rabbithole.ts")).toContain(phrase("rabbithole").text);
  });

  it("holds the stances paragraph in the block, each phrase a line of its own, verbatim, and under sixty words", () => {
    const block = read("corpus/runtime/agent.md");
    const stances = block.slice(
      block.indexOf("## The stances"),
      block.indexOf("## When this happens"),
    );
    expect(stances).toBe(
      [
        "## The stances",
        "",
        `- ${phrase("thorough-and-bold").text}`,
        `- ${phrase("high-standard").text}`,
        `- ${phrase("godspeed-batching").text}`,
        "",
        "",
      ].join("\n"),
    );
    expect(wordsOf(stances).length).toBeLessThan(60);
    for (const id of ["thorough-and-bold", "high-standard", "godspeed-batching"])
      expect(phrase(id).where).toContain("corpus/runtime/agent.md");
  });
});
