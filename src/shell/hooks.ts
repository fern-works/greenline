import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { isChangeId } from "../core/change.ts";
import type { DeclaredCheck, ProjectFiles } from "../core/checks.ts";
import { parseChecksFile } from "../core/facts.ts";
import {
  changeOfBranch,
  GIT_HOOK_NAMES,
  gitVersionOf,
  HOOKS_DIRECTORY,
  manualLine,
  recordFacts,
  recordPath,
  registrationFor,
  type BranchChange,
  type BranchFacts,
  type RecordEntry,
  type RecordedFact,
  type RecordFacts,
  type Registration,
} from "../core/git-hooks.ts";
import { parseLock } from "../core/lock.ts";
import { parseManifest, type HookSettings, type Manifest } from "../core/manifest.ts";
import {
  FILE_ADAPTERS,
  HARNESSES,
  JSON_ADAPTERS,
  PRESENCE_MARKERS,
  type Harness,
  type HooksReport,
} from "../core/adapters.ts";
import type { DesiredFile } from "../core/render.ts";
import { gitExitCode, readGit } from "./code-tree.ts";
import { setLocalConfig, unsetLocalConfig } from "./git.ts";
import { onLastingPath } from "./process.ts";

/**
 * What the git hooks and `greenline event` read on the disk and from git,
 * and the hooks' registration (`workshop/components/installation-payload.md`,
 * "The git hooks"). Both run on every commit or every tool call, so nothing
 * here loads the installation: a record is read for the front-matter lines
 * the hooks need, never judged against the modes, and every git command is
 * read-only but the registration's local configuration.
 */

const LEDGER = ".greenline/ledger";
const MANAGED_GUIDE = "README.md";

/**
 * The branch HEAD names, undefined when it is detached or git cannot say.
 * @param root the repository root
 * @returns the branch's short name
 */
export function currentBranch(root: string): string | undefined {
  const read = readGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (read._tag === "err") return undefined;
  const branch = read.value.trim();
  return branch === "" ? undefined : branch;
}

/**
 * Whether a merge is under way: git's `MERGE_HEAD` stands, as it does while
 * a commit concludes a merge that stopped on a conflict, the landing's
 * merge among them.
 * @param root the repository root
 * @returns true while git holds a merge to conclude
 */
export function merging(root: string): boolean {
  return gitExitCode(root, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]) === 0;
}

/**
 * The records the working tree holds, each with its lines, sorted by id.
 * @param root the repository root
 * @returns the records; none when the ledger is absent or unreadable
 */
function workingRecords(root: string): readonly RecordEntry[] {
  let names: readonly string[];
  try {
    names = readdirSync(join(root, LEDGER)).filter(
      (name) => name.endsWith(".md") && name !== MANAGED_GUIDE,
    );
  } catch {
    return [];
  }
  return names
    .map((name) => name.slice(0, -".md".length))
    .filter((id) => isChangeId(id))
    .sort()
    .flatMap((id) => {
      const facts = workingRecord(root, id);
      return facts === undefined ? [] : [{ id, facts }];
    });
}

/**
 * The repository's default branch, as its remote's HEAD or git's
 * `init.defaultBranch` names it; undefined when nothing names one.
 * @param root the repository root
 * @returns the branch's short name
 */
function defaultBranch(root: string): string | undefined {
  const remote = readGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remote._tag === "ok" && remote.value.trim().startsWith("origin/"))
    return remote.value.trim().slice("origin/".length);
  const configured = readGit(root, ["config", "--get", "init.defaultBranch"]);
  return configured._tag === "ok" && configured.value.trim() !== ""
    ? configured.value.trim()
    : undefined;
}

/**
 * Whether the repository names a remote, read from its configuration alone,
 * never by contacting one. Where git cannot say, it is taken as having one,
 * so the default branch is held for no change on a fact git did not give.
 * @param root the repository root
 * @returns true when `git remote` lists one, or git cannot say
 */
function hasRemote(root: string): boolean {
  const read = readGit(root, ["remote"]);
  return read._tag === "err" || read.value.trim() !== "";
}

/**
 * The changes the commit being made finishes or stops: a record HEAD holds
 * open whose staged version is no longer open, so the commit that closes or
 * stops a change is still that change's.
 * @param root the repository root
 * @returns their ids, sorted; none when git cannot say
 */
function finishingChanges(root: string): readonly string[] {
  return stagedRecordIds(root).filter(
    (id) =>
      committedRecord(root, "HEAD", id)?.state === "open" &&
      stagedRecord(root, id)?.state !== "open",
  );
}

/**
 * The change records the index holds changed from HEAD, added, modified or renamed.
 * @param root the repository root
 * @returns their ids, sorted; none when git cannot say
 */
export function stagedRecordIds(root: string): readonly string[] {
  const staged = readGit(root, [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=AMR",
    "--",
    LEDGER,
  ]);
  if (staged._tag === "err") return [];
  return staged.value
    .split("\n")
    .flatMap((path) => /^\.greenline\/ledger\/([^/]+)\.md$/.exec(path.trim())?.[1] ?? [])
    .filter((id) => isChangeId(id))
    .sort();
}

/**
 * What decides the change of a branch, read from the repository as it stands.
 * @param root the repository root
 * @returns the branch HEAD names, the default branch, whether a remote exists, the working tree's records and the changes the commit being made finishes
 */
export function branchFacts(root: string): BranchFacts {
  const records = workingRecords(root);
  return {
    current: currentBranch(root),
    defaultBranch: defaultBranch(root),
    hasRemote: hasRemote(root),
    records,
    // Only a record the working tree no longer holds open can be one a commit finishes.
    finishing: records.every((entry) => entry.facts.state === "open") ? [] : finishingChanges(root),
  };
}

/** A record's lines as the working tree holds it; undefined when it stands nowhere there. */
export function workingRecord(root: string, id: string): RecordFacts | undefined {
  try {
    return recordFacts(readFileSync(join(root, recordPath(id)), "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * A record's lines as a commit would carry them: its staged version when the
 * index holds it, else the working tree's.
 * @param root the repository root
 * @param id the change
 * @returns the lines, or undefined when it stands nowhere
 */
export function stagedRecord(root: string, id: string): RecordFacts | undefined {
  const staged = readGit(root, ["show", `:${recordPath(id)}`]);
  return staged._tag === "ok" ? recordFacts(staged.value) : workingRecord(root, id);
}

/**
 * A record's lines as a commit holds it.
 * @param root the repository root
 * @param commit the commit
 * @param id the change
 * @returns the lines, or undefined when the commit holds no record of it
 */
export function committedRecord(root: string, commit: string, id: string): RecordFacts | undefined {
  const read = readGit(root, ["show", `${commit}:${recordPath(id)}`]);
  return read._tag === "ok" ? recordFacts(read.value) : undefined;
}

/**
 * The change a branch belongs to, read from the repository as it stands.
 * @param root the repository root
 * @returns a reader from a branch to its change
 */
export function changeReader(root: string): (branch: string) => BranchChange | undefined {
  const facts = branchFacts(root);
  return (branch) => changeOfBranch(branch, facts);
}

/**
 * Whether git holds the first commit as an ancestor of the second.
 * @param root the repository root
 * @returns a reader that answers true, false, or undefined when git cannot say
 */
export function ancestry(root: string): (old: string, next: string) => boolean | undefined {
  return (old, next) => {
    const code = gitExitCode(root, ["merge-base", "--is-ancestor", old, next]);
    return code === 0 ? true : code === 1 ? false : undefined;
  };
}

/**
 * The workspace's manifest, read without the installation; undefined when
 * there is none or it does not read, so a hook that needs it lets git go on.
 * @param root the repository root
 * @returns the manifest
 */
export function workspaceManifest(root: string): Manifest | undefined {
  try {
    const parsed = parseManifest(
      readFileSync(join(root, ".greenline", "manifest.json"), "utf8"),
      ".greenline/manifest.json",
    );
    return parsed._tag === "ok" ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The installation's revision the lock names, which a hook-recorded run carries.
 * @param root the repository root
 * @returns the revision, or null when the lock cannot be read
 */
export function lockedRevision(root: string): string | null {
  try {
    const lock = parseLock(
      readFileSync(join(root, ".greenline", "lock.json"), "utf8"),
      ".greenline/lock.json",
    );
    return lock._tag === "ok" ? lock.value.installationRevision : null;
  } catch {
    return null;
  }
}

/** A change's `checks/` folder from the root. */
export function checksFolder(id: string): string {
  return `${LEDGER}/${id}/checks`;
}

/**
 * The facts `greenline check` recorded for a change, each with its file;
 * a hook-recorded run and a file that does not parse are left out, since
 * neither is a run `check` vouches for.
 * @param root the repository root
 * @param id the change
 * @returns the facts
 */
export function recordedFacts(root: string, id: string): readonly RecordedFact[] {
  const folder = join(root, checksFolder(id));
  let names: readonly string[];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      const read = parseChecksFile(readFileSync(join(folder, name), "utf8"), name);
      return read.kind === "check" && read.parsed._tag === "ok"
        ? [{ file: `checks/${name}`, facts: read.parsed.value }]
        : [];
    } catch {
      return [];
    }
  });
}

/** The keys of greenline's config-based registration of one hook. */
interface ConfigKeys {
  readonly event: string;
  readonly command: string;
}

function configKeys(name: string): ConfigKeys {
  return { event: `hook.greenline-${name}.event`, command: `hook.greenline-${name}.command` };
}

/** The command a config-based hook runs: the script through sh, so its file mode never matters. */
function configCommand(name: string): string {
  return `sh ${HOOKS_DIRECTORY}/${name}`;
}

function configValue(root: string, key: string): string | undefined {
  const read = readGit(root, ["config", "--local", "--get", key]);
  if (read._tag === "err") return undefined;
  const value = read.value.trim();
  return value === "" ? undefined : value;
}

/**
 * The hooks in the repository's hook directory that are not git's samples,
 * the owner's or a manager's.
 * @param root the repository root
 * @returns their names, sorted
 */
function ownerHooks(root: string): readonly string[] {
  const read = readGit(root, ["rev-parse", "--git-path", "hooks"]);
  if (read._tag === "err") return [];
  // git gives the path from the root, or whole in a linked worktree.
  const directory = resolve(root, read.value.trim());
  try {
    return readdirSync(directory)
      .filter((name) => !name.endsWith(".sample") && statSync(join(directory, name)).isFile())
      .sort();
  } catch {
    return [];
  }
}

/**
 * The registration this repository's git calls for.
 * @param root the repository root
 * @returns the registration, read from git's version, `core.hooksPath` and the hook directory
 */
function registrationHere(root: string): Registration {
  const version = readGit(root, ["--version"]);
  return registrationFor(
    version._tag === "ok" ? gitVersionOf(version.value) : undefined,
    configValue(root, "core.hooksPath"),
    ownerHooks(root),
  );
}

/**
 * How the git hooks stand in this repository: registered as config-based
 * hooks, through `core.hooksPath`, absent, or off by the manifest's setting.
 * Given the environment greenline runs with, a registration also says when
 * greenline is not on the `PATH` the hooks run under, where every hook lets
 * git go on without reading a fact (J-98 S1).
 * @param root the repository root
 * @param settings the manifest's hooks settings
 * @param environment the environment whose `PATH` is read; left out, the `PATH` is not read
 * @returns the state, with the line to add when they are absent
 */
export function gitHooksState(
  root: string,
  settings: HookSettings,
  environment?: NodeJS.ProcessEnv,
): HooksReport["git"] {
  if (!settings.git) return { state: "off" };
  const missing =
    environment !== undefined && !onLastingPath("greenline", environment)
      ? { greenline: "missing" as const }
      : {};
  const registered = GIT_HOOK_NAMES.every(
    (name) => configValue(root, configKeys(name).command) === configCommand(name),
  );
  if (registered) return { state: "config", ...missing };
  if (configValue(root, "core.hooksPath") === HOOKS_DIRECTORY)
    return { state: "hooks-path", ...missing };
  const registration = registrationHere(root);
  return {
    state: "absent",
    reason:
      registration.kind === "manual"
        ? registration.reason
        : "they are not registered in this clone's local configuration; run greenline sync",
    line: manualLine(),
  };
}

/**
 * Register the git hooks, or take greenline's registration out when the
 * manifest turns them off: config-based hooks on git 2.54 or later, which
 * also lets go of a `core.hooksPath` greenline set before; `core.hooksPath`
 * on an older git where nothing else holds the hooks, which runs the scripts
 * directly, the projection having written them executable; nothing where the
 * owner's hooks or a manager's stand. The local configuration is the one git write here, and
 * it reaches no remote.
 * @param root the repository root
 * @param settings the manifest's hooks settings
 * @returns the state afterwards, or why a write failed
 */
export function registerGitHooks(root: string, settings: HookSettings): HooksReport["git"] {
  const failed = (message: string): HooksReport["git"] => ({
    state: "absent",
    reason: `git could not record the registration: ${message}`,
    line: manualLine(),
  });
  if (!settings.git) {
    for (const name of GIT_HOOK_NAMES)
      for (const key of Object.values(configKeys(name))) {
        const removed = unsetLocalConfig(root, key);
        if (removed._tag === "err") return failed(removed.error.message);
      }
    if (configValue(root, "core.hooksPath") === HOOKS_DIRECTORY) {
      const removed = unsetLocalConfig(root, "core.hooksPath");
      if (removed._tag === "err") return failed(removed.error.message);
    }
    return { state: "off" };
  }
  const registration = registrationHere(root);
  if (registration.kind === "manual")
    return { state: "absent", reason: registration.reason, line: manualLine() };
  if (registration.kind === "config") {
    // Both ways at once would run each hook twice: the configured one and the hookdir's.
    if (configValue(root, "core.hooksPath") === HOOKS_DIRECTORY) {
      const removed = unsetLocalConfig(root, "core.hooksPath");
      if (removed._tag === "err") return failed(removed.error.message);
    }
    for (const name of GIT_HOOK_NAMES) {
      const keys = configKeys(name);
      if (configValue(root, keys.event) !== name) {
        const set = setLocalConfig(root, keys.event, name);
        if (set._tag === "err") return failed(set.error.message);
      }
      if (configValue(root, keys.command) !== configCommand(name)) {
        const set = setLocalConfig(root, keys.command, configCommand(name));
        if (set._tag === "err") return failed(set.error.message);
      }
    }
    return { state: "config" };
  }
  if (configValue(root, "core.hooksPath") !== HOOKS_DIRECTORY) {
    const set = setLocalConfig(root, "core.hooksPath", HOOKS_DIRECTORY);
    if (set._tag === "err") return failed(set.error.message);
  }
  return { state: "hooks-path" };
}

/**
 * The harnesses the repository shows besides the installation's targets, by
 * the files their configuration keeps at the root.
 * @param root the repository root
 * @returns the harnesses found
 */
export function presentHarnesses(root: string): ReadonlySet<Harness> {
  return new Set(
    HARNESSES.filter((harness) =>
      PRESENCE_MARKERS[harness].some((marker) => existsSync(join(root, marker))),
    ),
  );
}

/**
 * The project files `init` reads for its proposal of the checks.
 * @param root the repository root
 * @returns each file's text where it stands, and the lock files at the root
 */
export function projectFiles(root: string): ProjectFiles {
  const text = (name: string): string | undefined => {
    try {
      return readFileSync(join(root, name), "utf8");
    } catch {
      return undefined;
    }
  };
  return {
    packageJson: text("package.json"),
    makefile: text("Makefile"),
    cargoToml: text("Cargo.toml"),
    pyprojectToml: text("pyproject.toml"),
    goMod: text("go.mod"),
    lockFiles: ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "package-lock.json"].filter(
      (name) => existsSync(join(root, name)),
    ),
  };
}

/**
 * What init, sync and status report of the hooks.
 * @param manifest the workspace's settings
 * @param desired the files the projection holds, whose adapters are named
 * @param git the git hooks' state
 * @returns the report
 */
export function hooksReport(
  manifest: Manifest,
  desired: readonly DesiredFile[],
  git: HooksReport["git"],
): HooksReport {
  const paths = new Set(desired.map((file) => file.path));
  const adapters = HARNESSES.filter((harness) =>
    [...JSON_ADAPTERS, ...FILE_ADAPTERS].some(
      (adapter) => adapter.harness === harness && paths.has(adapter.path),
    ),
  );
  return { git, checks: manifest.checks, adapters };
}

/** The checks a manifest declares, none without one. */
export function declaredChecks(manifest: Manifest | undefined): readonly DeclaredCheck[] {
  return manifest?.checks ?? [];
}
