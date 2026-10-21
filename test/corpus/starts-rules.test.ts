/** The starts, the habits and the router (J-84 S4): the sentences the block, the ledger guide, the manifest's rows and the router, architecture-survey, secrets, ponytail and diagnose skills give an agent, read from the corpus as it ships. The public tree carries this test and the corpus, never docs/ or workshop/, so it reads the corpus alone. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repository = join(import.meta.dirname, "..", "..");

/** A file's text with its line breaks and runs of spaces read as one space, as an agent reads the prose. */
function page(path: string): string {
  return readFileSync(join(repository, "corpus", path), "utf8").replace(/\s+/g, " ");
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
    expect(page("skills/frame/references/greenline.md")).toContain(
      "Load a start only at the orientation, when the request begins in its row's situation in AGENTS.md, or when the owner names it: it runs until it hands the job to a mode.",
    );
    expect(block).toContain("Load a habit when its row's situation arises.");
    expect(block).not.toContain(
      "When the request begins in the situation of a start, below, load that start",
    );
  });

  it("the router matches a start's row or the orientation's start, runs a start the owner names, and loads no other", () => {
    expect(router).toContain(
      "When no open or stopped change is the request's, load the one start whose row in AGENTS.md names the situation the request begins in, or at an orientation the start AGENTS.md names for it, and no other; a start the owner names runs.",
    );
  });

  it("architecture-survey is an orientation only where no change record exists, and runs otherwise only when asked", () => {
    expect(router).toContain(
      "`architecture-survey` loads at an orientation, a repository with documents and no change record on any branch, local or remote-tracking, or when the request asks for a survey or the owner names it; where a change record exists, it is never an orientation.",
    );
    expect(survey).toContain(
      "Where a change record exists on any branch, the survey is no orientation: it runs only when the request asks for a survey or the owner names it.",
    );
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

  it("ponytail loads in its own rows, for code the request leaves open, never for code the request plainly asks for", () => {
    expect(router).toContain(
      "`ponytail` loads only in its own rows: before writing code the request leaves open, a refactor or a simplification of code that works, a new internal API replacing an old one that still has callers, or a question about what was deferred; writing code the request plainly asks for is none of them.",
    );
    expect(ponytail).toContain(
      "ponytail is the habit for the moment code the request leaves open is about to be written, a refactor or a simplification of code that works begun, a new internal API introduced while old callers remain, or the owner asks what was deferred, at whatever step the work is in, most often build; code the request plainly asks for does not load it.",
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
  it("the report stays in the working files and is never opened, its path told to the owner", () => {
    expect(survey).toContain(
      "Never open it: no `open`, `xdg-open` or `start`, no browser, nothing that reaches the owner's desktop. Tell the owner its absolute path; opening it is the owner's.",
    );
    expect(survey).not.toContain("Open it for the user");
    expect(survey).not.toContain("open it with network access disabled");
  });

  it("the offline check is a read of the file, never a browser", () => {
    expect(survey).toContain(
      "Before handing the report over, read the file for any network-loaded reference, a `src` or a `<link>`'s `href` naming a host, an `@import`, or a `url()` that leaves the file, and remove each; the check is that read, never a browser, and where it could not run, say so and call the report unverified offline.",
    );
  });

  it("at an orientation the survey's result goes into the knowledge homes and the report itself never moves there", () => {
    expect(survey).toContain(
      "At an orientation, a repository with documents and no change record on any branch, local or remote-tracking, the survey runs before the first change, as AGENTS.md says, and opens a quick record before it writes its result into the knowledge homes the workspace's work guide names; the report itself stays in the working files.",
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
  it("the ranked list comes before the first probe and stays ranked once a probe confirms one", () => {
    expect(diagnose).toContain(
      "Write the ranked list before the first probe runs, even when one cause looks certain: a probe that maps to no ranked prediction is a guess. When a probe confirms one hypothesis, the list stays ranked: say which rank it held and what the probe showed of the others, and name that rank beside the cause in the record's start section.",
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
