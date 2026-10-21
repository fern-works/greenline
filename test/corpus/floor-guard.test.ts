/** The trial start constraint-driven-development as it renders: its floor guard, run from the fenced block of `references/floor-guard.md` on fixture repositories, and the sentences its `SKILL.md` carries for frame and CI (J-65 S1). */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GIT_ENVIRONMENT } from "../fixtures/refresh.ts";

const start = join(
  import.meta.dirname,
  "..",
  "..",
  "corpus",
  "skills",
  "constraint-driven-development",
);
const skill = readFileSync(join(start, "SKILL.md"), "utf8");
const guardPage = readFileSync(join(start, "references", "floor-guard.md"), "utf8");

// The repository's own sweep refuses these tokens in a test file's text, so the
// fixtures assemble them.
const TS_IGNORE = ["@ts", "ignore"].join("-");
const LINT_OFF = ["eslint", "disable"].join("-");
const SKIPPED = ["it", "skip("].join(".");

/** The body of the page's one fenced block in the language named. */
function fenced(markdown: string, language: string): string {
  const match = new RegExp("^```" + language + "\\n([\\s\\S]*?)\\n```$", "m").exec(markdown);
  if (match?.[1] === undefined) throw new Error(`no ${language} block`);
  return match[1];
}

const GUARD = fenced(guardPage, "js");
// The bar's template, its example exception row left out: a row of the
// Exceptions table is a new exception on any change, flagged by design.
const BAR = fenced(skill, "markdown")
  .split("\n")
  .filter((line) => !/^\| *W\d+ *\|/.test(line))
  .join("\n");

const made: string[] = [];
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", ...args],
    { cwd, encoding: "utf8", env: GIT_ENVIRONMENT },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** A repository whose `main` holds a small project and whose `change` branch, checked out, adds the guard and the bar. */
function introducingChange(): string {
  const root = mkdtempSync(join(tmpdir(), "floor-guard-"));
  made.push(root);
  git(root, "init", "--quiet", "--initial-branch=main");
  write(root, {
    "README.md": "# A project\n",
    "src/app.ts": "export const answer = 42;\n",
    "src/app.test.ts": 'it("answers", () => expect(answer).toBe(42));\n',
  });
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "A project");
  git(root, "checkout", "--quiet", "-b", "change");
  write(root, {
    "scripts/floor-guard.mjs": GUARD + "\n",
    ".greenline/DECISIONS.md": "# Decisions\n\n" + BAR + "\n",
  });
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "The bar and its guard");
  return root;
}

/** One run of the guard: its exit status and what it printed, standard output then standard error. */
interface GuardRun {
  readonly status: number | null;
  readonly out: string;
}

function guard(cwd: string, ...args: string[]): GuardRun {
  const result = spawnSync("node", ["scripts/floor-guard.mjs", ...args], {
    cwd,
    encoding: "utf8",
    env: GIT_ENVIRONMENT,
  });
  return { status: result.status, out: result.stdout + result.stderr };
}

describe("the floor guard as constraint-driven-development renders it", () => {
  it("J-65 S1: the change that introduces the bar and the guard passes the guard", () => {
    const root = introducingChange();
    expect(guard(root, "--base", "main")).toEqual({ status: 0, out: "floor-guard: clean\n" });
  });

  it("J-65 S1: the same change uncommitted, the guard and the bar untracked, passes too", () => {
    const root = introducingChange();
    git(root, "reset", "--quiet", "--mixed", "main");
    expect(guard(root, "--base", "main")).toEqual({ status: 0, out: "floor-guard: clean\n" });
  });

  it("J-65 S1: a suppression, a stub or a skip outside the bar's section and the guard's file is refused", () => {
    const root = introducingChange();
    write(root, {
      "src/app.ts": `// ${TS_IGNORE}\nexport const answer = 42;\n`,
      "src/stub.ts": 'export function later(): never {\n  throw new Error("Not implemented");\n}\n',
      "src/app.test.ts":
        'it("answers", () => expect(answer).toBe(42));\n' +
        `${SKIPPED}"waits", () => expect(answer).toBe(42));\n`,
      ".greenline/DECISIONS.md":
        "# Decisions\n\n" + BAR + `\n\n## Tooling\n\nWe allow ${LINT_OFF} in generated code.\n`,
      "scripts/copy-of-the-patterns.mjs":
        GUARD.split("\n")
          .filter((l) => l.includes(TS_IGNORE))
          .join("\n") + "\n",
    });
    const run = guard(root, "--base", "main");
    expect(run.status).toBe(1);
    expect(run.out).toContain("floor-guard: 5 floor violation(s):");
    expect(run.out).toContain(`[silenced-checker] src/app.ts: // ${TS_IGNORE}`);
    expect(run.out).toContain('[unfinished-work] src/stub.ts: throw new Error("Not implemented");');
    expect(run.out).toContain(`[test-made-easier] src/app.test.ts: ${SKIPPED}"waits"`);
    expect(run.out).toContain(`[silenced-checker] .greenline/DECISIONS.md: We allow ${LINT_OFF}`);
    expect(run.out).toContain(
      "[silenced-checker] scripts/copy-of-the-patterns.mjs: const SUPPRESSIONS",
    );
    expect(run.out).not.toContain("scripts/floor-guard.mjs");
  });

  it("J-65 S1: on a shallow checkout it bails with exit 2, and passes once the whole history is fetched", () => {
    const origin = introducingChange();
    const clone = mkdtempSync(join(tmpdir(), "floor-guard-clone-"));
    made.push(clone);
    git(
      clone,
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--no-single-branch",
      "--branch",
      "change",
      pathToFileURL(origin).href,
      ".",
    );
    const shallow = guard(clone);
    expect(shallow.status).toBe(2);
    expect(shallow.out).toBe("floor-guard: no merge base against origin/main\n");
    git(clone, "fetch", "--quiet", "--unshallow", "origin");
    expect(guard(clone)).toEqual({ status: 0, out: "floor-guard: clean\n" });
  });
});

describe("the start's sentences for frame and CI", () => {
  it("J-65 S1: its pointer to frame's interview is a link that resolves beside the start", () => {
    expect(skill).toContain("[../frame/references/interview.md](../frame/references/interview.md)");
    expect(existsSync(resolve(start, "../frame/references/interview.md"))).toBe(true);
  });

  it("J-65 S1: it says in one sentence how frame runs its four questions and where the answers go", () => {
    const sentence = skill
      .split(/(?<=\.)\s+/)
      .find((s) => s.includes("ask all four in one round, each with its guess, and wait"));
    expect(sentence).toContain("the change record's frame section");
  });

  it("J-65 S1: it says how CI calls the guard: the whole history, the base and the bar, and a shallow checkout's exit 2", () => {
    const ci = /In CI, [^\n]*/.exec(skill)?.[0] ?? "";
    expect(ci).toMatch(/whole history/);
    expect(ci).toMatch(/`--base`/);
    expect(ci).toMatch(/`--bar`/);
    expect(ci).toMatch(/shallow checkout holds no merge base, so the guard bails with exit `2`/);
  });
});
