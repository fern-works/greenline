import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { watch, type Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { isChangeId } from "../../core/change.ts";
import type { Built } from "./builder.ts";

/**
 * The inspector's cache (J-154 S2; workshop/components/inspector.md, "The
 * cache"). A document is built once for the state it reads and answered from
 * the cache until that state moves. The state is the ledger folder's files,
 * each by its time and size, grouped as the documents read them, the first
 * two levels of its scratch folder, the installation's files, git's HEAD with
 * its branch, every ref and the worktrees, its index, the edition serving
 * and the date, and a count for every other write in the working tree. A
 * change's documents read the records, the homes beside the ledger, the
 * installation and that change's own folder; every other document reads it
 * all. So a write to one change's folder builds that change's documents and
 * the lists again, and no other change's page: a reload is a diff, not a
 * rebuild. Every answer carries its state's tag, and a read that sends the
 * tag back is answered "not modified" without a body.
 *
 * The ledger, the installation and git's own files are read at each
 * request, a few milliseconds and no process started, so a write there is seen by the very next read. The rest of
 * the working tree would cost a walk of every file, so the watcher raises its
 * count at each write there instead, and the server raises it at each write
 * of its own. Where the platform gives no watcher, an edit outside the
 * ledger and the installation that moves no ref and not the index is seen at
 * the server's next write, or when the server starts again.
 */

/** One read's answer: the status, the body, the tag, how long it took and where it came from. */
export interface Reading {
  readonly status: number;
  readonly body: string;
  readonly tag: string;
  readonly ms: number;
  readonly source: "cache" | "built";
  /** The builder thread that built it, 0 for the server's own; undefined from the cache. */
  readonly thread: number | undefined;
}

/** The state a document is built for. */
interface WorkspaceState {
  /** Git's own files: HEAD, the index, every ref and the worktrees, as one line. */
  readonly git: string;
  readonly worktree: number;
  /** Each group of files by its digest: the ledger's `records`, `homes` and `change:<id>`, and the `installation`. */
  readonly groups: ReadonlyMap<string, string>;
  /** Every input at once: the state a document that reads it all is built for. */
  readonly all: string;
}

/** A change's documents: its page and each aspect of it, its interface and deal, and a step, a file or a changed file's lines (J-155 S2). */
const CHANGE_ADDRESS = /^\/api\/changes\/([^/]+)(?:\/.+)?$/;

/** The most documents kept at once; the oldest goes first past it. */
const KEPT = 500;

/**
 * The group a file of the ledger folder belongs to, by its path under
 * `.greenline/`: a change's own folder, and its scratch folder's files, its
 * change's; the records; and every other file a home beside them.
 */
function groupOf(path: string): string {
  const parts = path.split("/");
  const [top = "", folder = ""] = parts;
  if (top === "tmp") return parts.length === 3 && isChangeId(folder) ? `change:${folder}` : "homes";
  if (top !== "ledger") return "homes";
  if (parts.length === 2) return "records";
  return isChangeId(folder) ? `change:${folder}` : "homes";
}

/** A digest of some text. */
const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

/**
 * Every file under a folder, as paths relative to the base, to a depth; a
 * folder named in `skip` is not entered.
 */
async function filesIn(
  base: string,
  path: string,
  depth: number,
  skip: readonly string[],
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(base, path), { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = path === "" ? entry.name : `${path}/${entry.name}`;
      if (entry.isFile()) return [child];
      if (!entry.isDirectory() || depth <= 1 || skip.includes(child)) return [];
      return filesIn(base, child, depth - 1, skip);
    }),
  );
  return nested.flat();
}

/** Each file's line: its path, its time and its size; none for a file gone between the listing and its stat. */
async function stamped(base: string, paths: readonly string[]): Promise<Map<string, string>> {
  const lines = new Map<string, string>();
  await Promise.all(
    paths.map(async (path) => {
      try {
        const file = await stat(join(base, path));
        if (file.isFile()) lines.set(path, `${path}\0${file.mtimeMs}\0${file.size}`);
      } catch {
        // A file removed between the listing and its stat is no longer part of the state.
      }
    }),
  );
  return lines;
}

/**
 * Every file of the ledger folder with its time and size, grouped; its
 * scratch folder read to two levels, the address file and a change's events
 * among them, and never below, where a browser's profile may lie.
 * @param root the repository root
 * @returns each group's digest
 */
async function ledgerGroups(root: string): Promise<Map<string, string>> {
  const base = join(root, ".greenline");
  const paths = [
    ...(await filesIn(base, "", Number.POSITIVE_INFINITY, ["tmp"])),
    ...(await filesIn(base, "tmp", 2, [])),
  ];
  const groups = new Map<string, string[]>();
  for (const [path, line] of await stamped(base, paths)) {
    const group = groupOf(path);
    groups.set(group, [...(groups.get(group) ?? []), line]);
  }
  return new Map([...groups].map(([group, lines]) => [group, digest(lines.sort().join("\n"))]));
}

/** The folders the installation writes beside the ledger, each read whole. */
const INSTALLED = [".agents", ".claude", ".codex"];

/**
 * The installation's files as they stand, each by its time and size: the
 * root's own files, such as AGENTS.md, and every file under the folders the
 * installation writes, which the settings, the status and the deal read.
 * @param root the repository root
 * @returns their digest
 */
async function installationGroup(root: string): Promise<string> {
  const top = await filesIn(root, "", 1, []);
  const under = await Promise.all(
    INSTALLED.map((folder) => filesIn(root, folder, Number.POSITIVE_INFINITY, [])),
  );
  const lines = await stamped(root, [...top, ...under.flat()]);
  return digest([...lines.values()].sort().join("\n"));
}

/** git's answer, trimmed, or the empty string where git gives none. */
function gitAnswer(root: string, args: readonly string[]): Promise<string> {
  return new Promise((done) => {
    execFile(
      "git",
      [...args],
      { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, maxBuffer: 1 << 28 },
      (error, stdout) => {
        done(error === null ? stdout.trim() : "");
      },
    );
  });
}

/** Where git keeps this checkout's HEAD and index and the refs every checkout shares. */
interface GitPlaces {
  readonly gitDir: string;
  readonly commonDir: string;
  readonly index: string;
}

/**
 * Git's own files as they stand, read without starting git: HEAD's text, so
 * a branch renamed or switched shows; the index's time and size; and the
 * time and size of every loose ref, the packed refs and each worktree's HEAD.
 * @param places where git keeps them
 * @returns their state, as one line
 */
async function gitState(places: GitPlaces): Promise<string> {
  let head = "";
  try {
    head = await readFile(join(places.gitDir, "HEAD"), "utf8");
  } catch {
    // A repository with no HEAD file reads as one.
  }
  const shared = [
    "packed-refs",
    ...(await filesIn(places.commonDir, "refs", Number.POSITIVE_INFINITY, [])),
    ...(await filesIn(places.commonDir, "worktrees", 2, [])),
  ];
  const [refs, index] = await Promise.all([
    stamped(places.commonDir, shared),
    stamped(dirname(places.index), [basename(places.index)]),
  ]);
  return digest([head, ...index.values(), ...[...refs.values()].sort()].join("\n"));
}

/**
 * Where a reader hears of writes in the working tree: it calls back with each
 * changed path, relative to the root, and returns how to stop; undefined where
 * the platform gives no watcher.
 */
export type WatchSource = (
  root: string,
  changed: (path: string) => void,
) => (() => void) | undefined;

/** The platform's watcher, `fs.watch` over the root and every folder under it. */
export const fsWatchSource: WatchSource = (root, changed) => {
  try {
    const watcher = watch(root, { recursive: true, persistent: false }, (_event, name) =>
      changed((name ?? "").split(sep).join("/")),
    );
    watcher.on("error", () => watcher.close());
    return () => watcher.close();
  } catch {
    return undefined;
  }
};

/** What a reader of the inspector's documents is given. */
export interface ReaderOptions {
  /**
   * Build one document; the pool's, or the server's own thread where no pool
   * starts. `state` names the whole state the build reads, so the readings a
   * build shares with another, the status among them, are made once for it.
   */
  readonly build: (address: string, query: string, state: string) => Promise<Built>;
  /** Where the reader hears of writes elsewhere in the working tree, or undefined for nowhere. */
  readonly watch: WatchSource | undefined;
  /** Each read's line for `greenline inspect --timing`, or undefined for none. */
  readonly timing: ((line: string) => void) | undefined;
  /** The edition serving: the CLI's version and its installation's revision, so an upgrade answers anew. */
  readonly edition: string;
}

/** The documents a server answers, each built once for the state it reads. */
export class DocumentReader {
  private readonly root: string;
  private readonly options: ReaderOptions;
  private readonly answers = new Map<string, { readonly key: string; readonly reading: Reading }>();
  private readonly building = new Map<string, Promise<Built>>();
  private state: Promise<WorkspaceState> | undefined;
  private worktree = 0;
  private stopWatching: (() => void) | undefined;
  private closed = false;
  /** Where git keeps its files, asked of git once. */
  private readonly places: Promise<GitPlaces>;

  constructor(root: string, options: ReaderOptions) {
    this.root = resolve(root);
    this.options = options;
    this.places = gitAnswer(this.root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir",
      "--git-path",
      "index",
    ]).then((answer) => {
      const [gitDir = join(this.root, ".git"), commonDir = gitDir, index = join(gitDir, "index")] =
        answer === "" ? [] : answer.split("\n");
      return { gitDir, commonDir, index };
    });
  }

  /**
   * A document as the workspace stands: from the cache when its state has
   * not moved since it was built, else built again.
   * @param address the document's address under /api/
   * @param query the address's query
   * @returns the reading
   */
  async read(address: string, query: URLSearchParams): Promise<Reading> {
    const started = performance.now();
    const search = query.toString();
    const at = search === "" ? address : `${address}?${search}`;
    const state = await this.current();
    const key = digest(`${at}\n${this.inputsOf(address, state)}`);
    const known = this.answers.get(at);
    if (known !== undefined && known.key === key) {
      const reading: Reading = {
        ...known.reading,
        ms: performance.now() - started,
        source: "cache",
        thread: undefined,
      };
      this.options.timing?.(`read ${at} ${reading.ms.toFixed(1)} ms from the cache`);
      return reading;
    }
    let pending = this.building.get(key);
    if (pending === undefined) {
      pending = this.options.build(address, search, state.all);
      this.building.set(key, pending);
      void pending.then(
        () => this.building.delete(key),
        () => this.building.delete(key),
      );
    }
    const built = await pending;
    const reading: Reading = {
      status: built.status,
      body: built.body,
      tag: `"${key.slice(0, 32)}"`,
      ms: performance.now() - started,
      source: "built",
      thread: built.thread,
    };
    // A refusal is answered and not kept: the next read asks again.
    if (built.status === 200) this.keep(at, key, reading);
    this.options.timing?.(
      `read ${at} ${reading.ms.toFixed(1)} ms, built in ${built.ms.toFixed(1)} ms on thread ${built.thread}`,
    );
    return reading;
  }

  /** Mark the state moved, as after a write the server made itself. */
  moveState(): void {
    this.worktree += 1;
  }

  /**
   * Start the watcher, where the reader was given one: the server calls it
   * once it listens, since a watcher can take seconds to start where the
   * platform's file events are busy, and the address file must not wait on it.
   * Until it starts, a write elsewhere in the working tree is seen at the
   * server's next write.
   */
  startWatching(): void {
    if (this.closed) return;
    this.stopWatching ??= this.options.watch?.(this.root, (path) => this.changed(path));
  }

  /** Stop watching. */
  close(): void {
    this.closed = true;
    this.stopWatching?.();
    this.stopWatching = undefined;
  }

  /** Keep a document, the oldest let go past the cap. */
  private keep(at: string, key: string, reading: Reading): void {
    this.answers.delete(at);
    if (this.answers.size >= KEPT) {
      const oldest = this.answers.keys().next().value;
      if (oldest !== undefined) this.answers.delete(oldest);
    }
    this.answers.set(at, { key, reading });
  }

  /** The inputs a document reads, as one line. */
  private inputsOf(address: string, state: WorkspaceState): string {
    const change = CHANGE_ADDRESS.exec(address)?.[1];
    if (change === undefined) return state.all;
    return [
      this.options.edition,
      new Date().toDateString(),
      state.git,
      state.worktree,
      ...["records", "homes", "installation", `change:${change}`].map(
        (group) => state.groups.get(group) ?? "",
      ),
    ].join("\0");
  }

  /**
   * The state as it stands: the ledger folder, the installation and git read
   * at each request, a read already under way shared by the requests that
   * arrive during it; the rest of the working tree by the watcher's count.
   */
  private current(): Promise<WorkspaceState> {
    this.state ??= this.readState().finally(() => {
      this.state = undefined;
    });
    return this.state;
  }

  private async readState(): Promise<WorkspaceState> {
    const [git, groups, installation] = await Promise.all([
      this.places.then(gitState),
      ledgerGroups(this.root),
      installationGroup(this.root),
    ]);
    groups.set("installation", installation);
    const all = digest(
      [
        this.options.edition,
        new Date().toDateString(),
        git,
        String(this.worktree),
        ...[...groups]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([group, value]) => `${group}=${value}`),
      ].join("\n"),
    );
    return { git, worktree: this.worktree, groups, all };
  }

  /**
   * A write the watcher reported: one outside git's own folder and the ledger
   * folder moves the working tree's count; git's objects and logs and the
   * dependencies are ignored, and the ledger, the installation, HEAD, the refs
   * and the index are read at every request anyway.
   */
  private changed(path: string): void {
    if (/^(?:\.git\/objects\/|\.git\/logs\/|node_modules\/)/.test(path)) return;
    if (path === ".git" || path.startsWith(".git/") || path.startsWith(".greenline/")) return;
    this.worktree += 1;
  }
}
