/** The starts, the habits and the router (J-84 S4): the sentences the block, the ledger guide, the manifest's rows and the router, architecture-survey, secrets, ponytail and diagnose skills give an agent, read from the corpus as it ships. The public tree carries this test and the corpus, never docs/ or workshop/, so it reads the corpus alone. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRONT_WORDS, frontWords } from "../../src/corpus/fronts.ts";
import { parseRecipe } from "../../src/corpus/recipe.ts";
import { corpusPage } from "./skill-text.ts";

const repository = join(import.meta.dirname, "..", "..");

/** A file's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return corpusPage(repository, path);
}

const block = page("runtime/agent.md");
const ledger = page("runtime/ledger.md");
const router = page("skills/router/SKILL.md");
const survey = page("skills/architecture-survey/SKILL.md");
const secrets = page("skills/secrets/SKILL.md");
const ponytail = page("skills/ponytail/SKILL.md");
const diagnose = page("skills/diagnose/SKILL.md");

/** The manifest's intent rows, the block's start and habit tables, as situation to skills. */
const rows: { intent: string; skills: string[] }[] = JSON.parse(
  readFileSync(join(repository, "corpus", "manifest.json"), "utf8"),
).intents;

/** The situations the rows key one skill by. */
function situations(skill: string): string[] {
  return rows.filter((row) => row.skills.includes(skill)).map((row) => row.intent);
}

/** A skill's shipped description, which the harness loads on every turn. */
function description(skill: string): string {
  const front = page(`skills/${skill}/SKILL.md`).match(/description: "((?:[^"\\]|\\.)*)"/);
  if (!front?.[1]) throw new Error(`no description in ${skill}`);
  return front[1];
}

describe("J-84 S4 a start or a habit loads only in its row's situation", () => {
  it("frame's page loads a start only in its row's situation or by the owner's name, and the block a habit only when its row's situation arises", () => {
    // J-175 S1: the orientation is a habit of the first change's frame, so no start loads "at the orientation".
    expect(page("skills/frame/references/greenline.md")).toContain(
      "Load a start only when the request begins in its row's situation in AGENTS.md, or when the owner names it: it runs until it hands the job to a mode.",
    );
    expect(block).toContain("Load a habit when its row's situation arises.");
    expect(block).not.toContain(
      "When the request begins in the situation of a start, below, load that start",
    );
  });

  it("the router matches a start's row, runs a start the owner names, and loads no other", () => {
    expect(router).toContain(
      "When no open or stopped change is the request's, load the one start whose row in AGENTS.md names the situation the request begins in, and no other; a start the owner names runs.",
    );
  });

  it("J-175 S1 architecture-survey is never an orientation put before a change, and runs only when asked", () => {
    expect(router).toContain(
      "The orientation is a habit of the first change's frame, never a start put before that change: `groundwork` runs inside it on an empty tree, and `architecture-survey` loads only when the request asks for a survey or the owner names it.",
    );
    expect(survey).toContain(
      "It runs only when the request asks for a survey or the owner names it, never as a step put before a change the owner asked for: a first change's orientation is a habit of that change's frame.",
    );
    expect(survey).not.toContain("At an orientation, a repository with documents");
  });

  it("the router loads a habit only when its row's situation arises in the work, never ahead of it", () => {
    expect(router).toContain(
      "Load a habit only when the situation its row in AGENTS.md names arises in the work at hand, never ahead of it or beside another habit in case it might.",
    );
  });

  it("secrets loads only with a secret in reach, its row, its page and its description saying what in reach means", () => {
    expect(router).toContain(
      "`secrets` loads only where a secret is in reach: a key, a token, a credential or a `.env` file that the work reads, writes, stages in a commit or builds into an image, or a credential that may have leaked; a commit or an image with none in reach loads nothing.",
    );
    expect(secrets).toContain(
      "secrets is the habit for the moment a secret is in reach: a key, a token, a credential or a `.env` file that the work reads, writes, stages in a commit or builds into an image, or a credential that may have leaked, at whatever step the work is in. A commit staged or an image built with no secret in reach does not load it.",
    );
    expect(situations("secrets")).toContain(
      "Staging a commit or building an image with a secret in reach",
    );
    expect(situations("secrets")).not.toContain("Staging a commit or building a container image");
    expect(description("secrets")).toContain(
      "A commit or an image with no secret in reach does not call for it.",
    );
    expect(description("secrets")).not.toMatch(/^Use whenever a task touches/);
    expect(situations("secrets")).toContain("A credential may have leaked");
  });

  it("ponytail loads in its own rows, for code the request leaves open and a request to simplify working code, never for new code the request plainly asks for", () => {
    expect(router).toContain(
      "`ponytail` loads only in its own rows: before writing code the request leaves open, a refactor or a simplification of code that works, a new internal API replacing an old one that still has callers, or a question about what was deferred; writing code the request plainly asks for is none of them.",
    );
    expect(ponytail).toContain(
      "ponytail is the habit for the moment code the request leaves open is about to be written, a refactor or a simplification of code that works begun, a new internal API introduced while old callers remain, or the owner asks what was deferred, at whatever step the work is in, most often build; a request to simplify, refactor or clean up working code loads it, and new code the request plainly asks for does not.",
    );
    expect(situations("ponytail")).toContain(
      "Before writing code the request leaves open: does it need to exist",
    );
    expect(situations("ponytail")).not.toContain("Before writing code, does it need to exist");
    expect(description("ponytail")).toContain("Use before writing code the request leaves open,");
  });
});

describe("J-84 S4 a start is named in the record only when it ran", () => {
  it("the ledger guide names a start in its section only when it was loaded and followed in the change's session", () => {
    expect(ledger).toContain(
      "A start's section is `## start`; it is never required, it names a start only when that start was loaded and followed in this change's session, never one only considered, and a start that resumes an open or stopped change, as the router does, writes none in it;",
    );
  });

  it("the router says the same of the start it chose", () => {
    expect(router).toContain("A start that did not run is never named in the record.");
  });
});

describe("J-84 S4 the survey never opens its report", () => {
  it("the report stays in the working files and is never opened, its path and J-175 S1's viewer address told to the owner", () => {
    expect(survey).toContain(
      "Never open it: no `open`, `xdg-open` or `start`, no browser, nothing that reaches the owner's desktop. Tell the owner its absolute path and the viewer's address in the reply that hands the report over; opening it is the owner's.",
    );
    expect(survey).not.toContain("Open it for the user");
    expect(survey).not.toContain("open it with network access disabled");
  });

  it("the offline check is a read of the file, never a browser", () => {
    expect(survey).toContain(
      "Before handing the report over, read the file for any network-loaded reference, a `src` or a `<link>`'s `href` naming a host, an `@import`, or a `url()` that leaves the file, and remove each; the check is that read, never a browser, and where it could not run, say so and call the report unverified offline.",
    );
  });

  it("J-175 S1 the survey hands its report over and writes its result into the knowledge homes before it ends, never tidied away unpresented", () => {
    expect(survey).toContain(
      "Before the survey ends, hand its report over in the reply, its path and the viewer's address, and write what it found into the knowledge homes the workspace's work guide names under a quick record opened first; the report is never tidied away before the owner has had it.",
    );
  });
});

describe("J-84 S4 a session with nothing to resume asks for the request", () => {
  it("the router says there is nothing to resume, proposes nothing and asks for the request", () => {
    expect(router).toContain(
      'A session that resumes, or is asked "what were we doing?", with no open or stopped change on any branch says there is nothing to resume, proposes nothing and asks the owner for the request.',
    );
  });
});

describe("J-84 S4 diagnose ranks its hypotheses before the first probe", () => {
  it("the ranked list stands in the reply before the first probe, a prediction on each line (J-175 S1), and stays ranked once a probe confirms one", () => {
    expect(diagnose).toContain(
      "Write the ranked list in the reply before the first probe runs, one numbered line per hypothesis with the prediction that would refute it, even when one cause looks certain: a probe that maps to no ranked prediction is a guess. When a probe confirms one hypothesis, the list stays ranked: say which rank it held and what the probe showed of the others, and name that rank beside the cause in the record's start section.",
    );
  });
});

describe("J-84 S4 ponytail builds only on a measured need and reads simplify.md before a refactor", () => {
  it("a measurement showing no need builds nothing, a choice left to the agent taking that answer", () => {
    expect(ponytail).toContain(
      "Build only on a need you measured. Where the first rung turns on a measurement, take it before building; where it shows no need, say so with the numbers and build nothing. A choice the owner leaves to you takes that answer; the owner, told the numbers, may still ask for the build.",
    );
  });

  it("replacing working code is a refactor, and simplify.md is read whole before its first edit", () => {
    expect(ponytail).toContain(
      "Replacing code that already works is a refactor, a scan by an index or a loop by a library call included: before its first edit, read [simplify.md](simplify.md) whole:",
    );
  });
});

describe("J-185 S1 ponytail's simplify page takes back the code-simplification passages its first cut dropped", () => {
  const simplify = page("skills/ponytail/simplify.md");
  /** The re-admitted passages, in the source's words and in its order, as an agent reads the page. */
  const passages = [
    // The overview's goal and the new team member test (ruling 24).
    'The goal is not fewer lines — it\'s code that is easier to read, understand, modify, and debug. Every simplification must pass a simple test: "Would a new team member understand this faster than the original?"',
    // When NOT to use, four bullets.
    "**When NOT to use:** - Code is already clean and readable — don't simplify for the sake of it - You don't understand what the code does yet — comprehend before you simplify - The code is performance-critical and the \"simpler\" version would be measurably slower - You're about to rewrite the module entirely — simplifying throwaway code wastes effort",
    // Clarity over cleverness with its two examples.
    "Explicit code is better than compact code when the compact version requires a mental pause to parse. ```typescript // UNCLEAR: Dense ternary chain",
    "// CLEAR: Named intermediate step",
    // The balance traps as ruling 25 admits them.
    'Simplification has a failure mode: over-simplification. Watch for these traps: - **Inlining too aggressively** — removing a helper that gave a concept a name makes the call site harder to read - **Combining unrelated logic** — two simple functions merged into one complex function is not simpler - **Removing "unnecessary" abstraction** — some abstractions exist for testability or for an extension a declared plan names, not complexity',
    // The two qualifiers of the scan, and the why comment's moment (ruling 4).
    "| Comments explaining \"why\" | `// Retry because the API is flaky under load` | Keep these — they carry intent the code can't express | | Dead code | Unreachable branches, unused variables, commented-out blocks | Remove (after confirming it's truly dead) |",
    "While you simplify, a comment that says why stays unless the why now stands in the code; at review, the review step's excess lens reads comments by its own rule.",
    "Prop drilling through intermediate components: consider whether context or composition solves this better. This is a judgment call: flag it, don't auto-refactor.",
    // The Rule of 500 under step 3 (ruling 26).
    "**The Rule of 500:** If a refactoring would touch more than 500 lines, invest in automation (codemods, sed scripts, AST transforms) rather than making the changes by hand. Manual edits at that scale are error-prone and exhausting to review.",
    // Step 4 with its revert, its red flag and the no-dead-code check.
    "After all simplifications, step back and evaluate the whole:",
    'If the "simplified" version is harder to understand or review, revert. Not every simplification attempt succeeds.',
    '## Red Flags - "Simplified" code that is longer and harder to follow than the original',
    "After completing a simplification pass: - [ ] No dead code was left behind (unused imports, unreachable branches)",
  ];

  it("states each passage in the source's words, in the source's order", () => {
    let from = 0;
    for (const passage of passages) {
      const at = simplify.indexOf(passage, from);
      expect(at, passage).toBeGreaterThanOrEqual(from);
      from = at + passage.length;
    }
  });

  it("leaves the extensibility trap out, a seam a declared plan names being kept (ruling 25)", () => {
    expect(simplify).not.toContain("extensibility");
    expect(simplify).not.toContain("**Optimizing for line count**");
  });

  it("sends a request to simplify, refactor or clean up working code from the front to the page, the front under its ceiling", () => {
    const front = readFileSync(
      join(repository, "corpus", "skills", "ponytail", "SKILL.md"),
      "utf8",
    );
    expect(front.replace(/\s+/g, " ")).toContain(
      "before simplifying, refactoring or cleaning up code that works, read [simplify.md](simplify.md) whole.",
    );
    expect(front).not.toContain("code the request plainly asks for does not load it");
    expect(frontWords(front)).toBeLessThan(FRONT_WORDS);
  });

  it("gives every drop of the source the load test's verdict, a load-bearing or scaffolding one its failure, and drops none of the passages it takes back", () => {
    const parsed = parseRecipe(
      readFileSync(join(repository, "corpus", "recipes", "ponytail.json"), "utf8"),
      "ponytail.json",
    );
    if (parsed._tag === "err") throw parsed.error;
    const drops = parsed.value.drops.filter((drop) => drop.source === "addyosmani");
    expect(drops.filter((drop) => drop.verdict === undefined)).toEqual([]);
    expect(
      drops.filter(
        (drop) =>
          (drop.verdict === "load-bearing" || drop.verdict === "scaffolding") &&
          drop.failure === undefined,
      ),
    ).toEqual([]);
    // The first segment of each passage taken back: the goal, when not to use, clarity, the traps,
    // the why row, the dead-code row, the Rule of 500, the verify step, the red flag and the check.
    const readmitted = [
      "355d2434794a",
      "4e9dc1e16d49",
      "705b30f6a245",
      "ed5f9f6a95cc",
      "15bf4a3c1cea",
      "3bfc550fa2e9",
      "25a336a97f76",
      "2164e782cc9b",
      "ee814f9723b1",
      "977f47427531",
    ];
    expect(drops.filter((drop) => readmitted.includes(drop.segment))).toEqual([]);
  });

  it("lists the source's dismissals in the dismissal view as read by the load test", () => {
    const view = readFileSync(join(repository, "corpus", "ledger", "DISMISSALS.md"), "utf8");
    const [, read = "", before = ""] = view.split(/## (?:Read by|Before) the load test/);
    expect(read).toContain("`addyosmani/code-simplification/SKILL.md`");
    expect(before).not.toContain("`addyosmani/code-simplification/SKILL.md`");
  });
});
