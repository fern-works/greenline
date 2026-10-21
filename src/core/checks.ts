import { z } from "zod";
import { isRepositoryPath } from "../commons/repository-path.ts";

/**
 * The declared checks (`docs/SPEC.md` §5, the manifest's `checks`): the
 * commands this workspace runs as its tests, linters and builds, each with a
 * name and the directory it runs in. No hook parses a command to tell a test
 * from anything else (the operator's ruling of 2026-10-19): the workspace
 * declares its checks once, `init` proposes them from the project's own
 * files, the agent declares one it adds with `greenline check --declare`,
 * and a recorded command counts as a check's run only when its text equals
 * the declared command or starts with it and a space, in the same directory.
 * A command no declaration matches is recorded and nothing more. A
 * declared check's directory is where `greenline check` runs it and where the
 * close reads its runs from (J-98 S1).
 */

/** One declared check: its name, the command as one line of text, and the directory it runs in, `.` for the root. */
export interface DeclaredCheck {
  readonly name: string;
  readonly command: string;
  readonly dir: string;
}

/** The repository root as a check's directory. */
export const ROOT_DIR = ".";

const NAME = /^[a-z][a-z0-9-]*$/;

/** The schema of one declared check, which the manifest's `checks` list holds. */
export const declaredCheckSchema: z.ZodType<DeclaredCheck> = z
  .object({
    name: z.string().regex(NAME, "a check's name is lower case, digits and hyphens"),
    command: z
      .string()
      .min(1)
      .refine((text) => text.trim() === text && !text.includes("\n"), {
        message: "a check's command is one line with no space around it",
      }),
    dir: z.string().refine((dir) => dir === ROOT_DIR || isRepositoryPath(dir), {
      message: "a check's dir is '.' or a path inside the repository",
    }),
  })
  .strict();

/**
 * The declared check a recorded command is a run of: the first whose command
 * the text equals, or begins with followed by a space, run in the same
 * directory. Matching reads the text as a whole and splits nothing.
 * @param checks the declared checks, in the manifest's order
 * @param text the command's text as the harness or `check` recorded it
 * @param dir the directory it ran in, relative to the root, `.` for the root
 * @returns the check it matched, or undefined
 */
export function matchedCheck(
  checks: readonly DeclaredCheck[],
  text: string,
  dir: string,
): DeclaredCheck | undefined {
  return checks.find((check) => check.dir === dir && textMatches(check, text));
}

/**
 * Whether a recorded text is a run of a declared check by its words alone:
 * the command itself, or the command and a space and more.
 * @param check the declared check
 * @param text the recorded text, a run's arguments joined as given
 * @returns true when the text is the check's
 */
function textMatches(check: DeclaredCheck, text: string): boolean {
  return text === check.command || text.startsWith(`${check.command} `);
}

/** What `greenline check` records of a run that a declared check is read from. */
export interface RecordedRun {
  readonly arguments: readonly string[];
  /** The declared check's name the run was taken as; absent when no declaration matched. */
  readonly check?: string | undefined;
  /** The directory it ran in, from the root; absent for a run at the root. */
  readonly dir?: string | undefined;
}

/**
 * Whether a run `greenline check` recorded is a run of a declared check, read
 * by its name, its command and its directory: its text matches the command,
 * it ran in the check's directory, and the name it records, where it records
 * one, is the check's. A run that records no directory ran at the root.
 * @param check the declared check
 * @param run the recorded run
 * @returns true when the run is the check's
 */
export function isRunOf(check: DeclaredCheck, run: RecordedRun): boolean {
  return (
    textMatches(check, run.arguments.join(" ")) &&
    (run.dir ?? ROOT_DIR) === check.dir &&
    (run.check === undefined || run.check === check.name)
  );
}

/** The declared check a run of `greenline check` is, none, or the several it could be. */
export type RunDeclaration =
  | { readonly kind: "declared"; readonly check: DeclaredCheck }
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly checks: readonly DeclaredCheck[] };

/**
 * The declared check a command run through `greenline check` is, which
 * decides the directory it runs in: of the checks whose command the text
 * matches, those declared in the directory `check` was started from, else
 * those of the one directory that declares a match, and among them the one
 * whose command the text equals, else the longest, so a narrower declared
 * check is never taken for a broader one; where several directories
 * declare one and `check` was started in none of them, it names them all,
 * so the run is refused rather than guessed.
 * @param checks the declared checks, in the manifest's order
 * @param text the run's arguments joined as given
 * @param from the directory `check` was started from, relative to the root, `.` for the root
 * @returns the check, none, or the checks it could be
 */
export function declaredForRun(
  checks: readonly DeclaredCheck[],
  text: string,
  from: string,
): RunDeclaration {
  const matches = checks.filter((check) => textMatches(check, text));
  const here = matches.filter((check) => check.dir === from);
  const [first] = matches;
  if (first === undefined) return { kind: "none" };
  if (here.length > 0) return { kind: "declared", check: mostSpecific(here, text) };
  return matches.every((check) => check.dir === first.dir)
    ? { kind: "declared", check: mostSpecific(matches, text) }
    : { kind: "ambiguous", checks: matches };
}

/** Of checks whose command a text matches, one non-empty list, the one it equals, else the longest, else the first declared. */
function mostSpecific(matches: readonly DeclaredCheck[], text: string): DeclaredCheck {
  return matches.reduce((best, check) =>
    best.command === text || best.command.length >= check.command.length ? best : check,
  );
}

/**
 * A declared check as status and the refusals name it: its command, and its
 * directory where that is not the root.
 * @param check the declared check
 * @returns the text, such as `npm test in apps/web`
 */
export function checkWhere(check: DeclaredCheck): string {
  return check.dir === ROOT_DIR ? check.command : `${check.command} in ${check.dir}`;
}

/**
 * A check's name made from any text: lower case, digits and hyphens.
 * @param text the command or the name asked for
 * @returns a name that opens with a letter
 */
export function checkName(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") return "check";
  return /^[a-z]/.test(slug) ? slug : `check-${slug}`;
}

/** The checks list after a declaration, and the check the command is declared as. */
export interface Declaration {
  readonly checks: readonly DeclaredCheck[];
  readonly check: DeclaredCheck;
  /** False when the command was declared in that directory already, so the list is as it was. */
  readonly added: boolean;
}

/**
 * The checks list with one more declared: a command already declared in the
 * same directory leaves the list as it is, and a name already taken gains a
 * number.
 * @param checks the declared checks
 * @param command the command as one line of text
 * @param dir its directory
 * @param name the name asked for; made from the command when absent
 * @returns the list and the check the command is declared as
 */
export function declaredWith(
  checks: readonly DeclaredCheck[],
  command: string,
  dir: string,
  name?: string,
): Declaration {
  const standing = checks.find((check) => check.command === command && check.dir === dir);
  if (standing !== undefined) return { checks, check: standing, added: false };
  const wanted = checkName(name ?? command);
  const taken = new Set(checks.map((check) => check.name));
  let chosen = wanted;
  for (let index = 2; taken.has(chosen); index += 1) chosen = `${wanted}-${String(index)}`;
  const check = { name: chosen, command, dir };
  return { checks: [...checks, check], check, added: true };
}

/** The project files `init` reads for its proposal, each with its text when it stands at the root. */
export interface ProjectFiles {
  readonly packageJson?: string | undefined;
  readonly makefile?: string | undefined;
  readonly cargoToml?: string | undefined;
  readonly pyprojectToml?: string | undefined;
  readonly goMod?: string | undefined;
  /** The lock files at the root, which name the package manager a package.json's scripts run under. */
  readonly lockFiles: readonly string[];
}

/** The scripts and targets a proposal takes, in the order it lists them: what a project runs before it calls work done. */
const PROPOSED_SCRIPTS = ["test", "lint", "typecheck", "build"] as const;

/** How a package manager runs a script: its test script in the conventional short form, any other through `run`. */
interface ScriptRunner {
  readonly lock: string;
  readonly test: string;
  readonly run: string;
}

/** Each lock file's package manager; the default form where none stands. Bun's own `bun test` is its test runner, not the script. */
const SCRIPT_RUNNERS: readonly ScriptRunner[] = [
  { lock: "pnpm-lock.yaml", test: "pnpm test", run: "pnpm run" },
  { lock: "yarn.lock", test: "yarn test", run: "yarn run" },
  { lock: "bun.lock", test: "bun run test", run: "bun run" },
  { lock: "bun.lockb", test: "bun run test", run: "bun run" },
];
const NPM_RUNNER: ScriptRunner = { lock: "package-lock.json", test: "npm test", run: "npm run" };

function scriptRunner(lockFiles: readonly string[]): ScriptRunner {
  return SCRIPT_RUNNERS.find((runner) => lockFiles.includes(runner.lock)) ?? NPM_RUNNER;
}

const PACKAGE = z.object({ scripts: z.record(z.string(), z.unknown()).optional() });

function packageScripts(text: string): readonly string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // A package.json that does not parse proposes nothing; the agent declares by reasoning.
    return [];
  }
  const parsed = PACKAGE.safeParse(raw);
  return parsed.success ? Object.keys(parsed.data.scripts ?? {}) : [];
}

/** A Makefile's targets, read as the lines that open a rule: a name, a colon, and no assignment. */
function makeTargets(text: string): readonly string[] {
  return text
    .split("\n")
    .flatMap((line) => /^([A-Za-z][A-Za-z0-9_-]*)\s*:(?!=)/.exec(line)?.[1] ?? []);
}

/**
 * The checks `init` proposes from the project's own files: a package.json's
 * test, lint, typecheck and build scripts under the package manager its lock
 * file names, the test script in its short form, a Makefile's targets of those names, `cargo test` for
 * a Cargo.toml, pytest and ruff where a pyproject names them, and
 * `go test ./...` and `go vet ./...` for a go.mod, every one at the root. It
 * is a proposal the agent confirms or corrects in the first change: a
 * project whose checks run otherwise declares them by reasoning, never by a
 * guess here.
 * @param files the project files read at the root
 * @returns the proposed checks, each name once
 */
export function proposedChecks(files: ProjectFiles): readonly DeclaredCheck[] {
  let checks: readonly DeclaredCheck[] = [];
  const add = (command: string, name: string): void => {
    checks = declaredWith(checks, command, ROOT_DIR, name).checks;
  };
  const scripts = files.packageJson === undefined ? [] : packageScripts(files.packageJson);
  const runner = scriptRunner(files.lockFiles);
  for (const script of PROPOSED_SCRIPTS)
    if (scripts.includes(script))
      add(script === "test" ? runner.test : `${runner.run} ${script}`, script);
  const targets = files.makefile === undefined ? [] : makeTargets(files.makefile);
  for (const target of PROPOSED_SCRIPTS)
    if (targets.includes(target)) add(`make ${target}`, `make-${target}`);
  if (files.cargoToml !== undefined) add("cargo test", "cargo-test");
  const pyproject = files.pyprojectToml;
  if (pyproject !== undefined && /\bpytest\b/.test(pyproject)) add("python -m pytest", "pytest");
  if (pyproject !== undefined && /\bruff\b/.test(pyproject)) add("ruff check .", "ruff");
  if (files.goMod !== undefined) {
    add("go test ./...", "go-test");
    add("go vet ./...", "go-vet");
  }
  return checks;
}
