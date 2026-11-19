/**
 * The situation `greenline status` prints above the changes
 * (`workshop/components/cli-contracts.md`, "status"): what the agent reads
 * once before a session's first proposal. The repository's commits, how many
 * change records it holds, the knowledge homes it keeps, the languages at
 * its roots, the changes stopped on its other local branches with the
 * worktree that holds each one's branch, the branches cut before the
 * install, the orientation a first request
 * for a change takes, the remote and whether it is a forge, and the ground
 * of the change open on the branch HEAD names, each a fact read from the
 * tree and `.git` alone
 * and stored nowhere. No time of
 * installation is part of it. The shell gathers it (`src/shell/situation.ts`);
 * this module names its parts and prints it.
 */

import { groundLine, groundSettingLine, type GroundSetting } from "./ground.ts";

/** The commits HEAD reaches and the branch it names, or why git cannot say. */
export type CommitsReading =
  | {
      readonly kind: "known";
      readonly count: number;
      /** The branch HEAD names, a branch with no commit yet included; null at a detached HEAD. */
      readonly branch: string | null;
    }
  | { readonly kind: "unknown"; readonly why: string };

/** The kinds of memory a repository keeps a home for, as the work guide's homes table names them. */
export type HomeKind = "decisions" | "adr" | "glossary" | "contributing";

/** A knowledge home found: its kind and its path from the root, a folder's ending in a slash. */
export interface KnowledgeHome {
  readonly kind: HomeKind;
  readonly path: string;
}

/**
 * Where each knowledge home is looked for, in the order the situation lists
 * them: the decisions book, the ADR home and the glossary and its map as the
 * installed work guide's homes table names them, and a contributing guide in
 * the three places a forge reads one. A name matches only as written.
 */
export const KNOWLEDGE_HOMES: readonly {
  readonly kind: HomeKind;
  readonly path: string;
  readonly folder: boolean;
}[] = [
  { kind: "decisions", path: ".greenline/DECISIONS.md", folder: false },
  { kind: "adr", path: "docs/adr", folder: true },
  { kind: "glossary", path: "GLOSSARY.md", folder: false },
  { kind: "glossary", path: "GLOSSARY-MAP.md", folder: false },
  { kind: "contributing", path: "CONTRIBUTING.md", folder: false },
  { kind: "contributing", path: ".github/CONTRIBUTING.md", folder: false },
  { kind: "contributing", path: "docs/CONTRIBUTING.md", folder: false },
];

/** One language and the roots that hold its files: `.` for the top of the tree, a top-level folder with its slash. */
export interface LanguageRoots {
  readonly language: string;
  readonly roots: readonly string[];
}

/** The languages at the roots, or why the files could not be listed. */
export type LanguagesReading =
  | { readonly kind: "known"; readonly languages: readonly LanguageRoots[] }
  | { readonly kind: "unknown"; readonly why: string };

/**
 * The ids of the changes stopped on other local `greenline/*` branches, and
 * for each whose branch a worktree has checked out, that worktree's path,
 * from the main checkout's root where it stands inside it, or why git cannot
 * say.
 */
export type StoppedElsewhere =
  | {
      readonly kind: "known";
      readonly changes: readonly string[];
      readonly worktrees: readonly { readonly id: string; readonly path: string }[];
    }
  | { readonly kind: "unknown"; readonly why: string };

/**
 * The branches cut before the install (J-213 S1, the run
 * j196t-wait-proceed-1c, whose request named a file only such a branch held
 * and whose agent, on main, found it and asked the owner for direction
 * before it asked for the merge): the local branches, and the
 * remote-tracking ones no local branch names, whose tree holds no
 * `.greenline/manifest.json` where the default branch holds one, the
 * default branch's own copies and the branch HEAD names left out; `base`
 * is that default branch, null where none holds the manifest; `proceed` is
 * the manifest's mode where it names one, null otherwise. Unknown where git
 * cannot say.
 */
export type PredatingBranches =
  | {
      readonly kind: "known";
      readonly base: string | null;
      readonly branches: readonly string[];
      readonly proceed: string | null;
    }
  | { readonly kind: "unknown"; readonly why: string };

/** How many branches the line names before it counts the rest. */
const PREDATING_NAMED = 10;

/**
 * The line naming the branches cut before the install, which `status` and
 * the mirror print (J-213 S1): their names, the first ten and a count of the
 * rest, or none; where `proceed` names a mode, what a request for their
 * files owes, the merge of the default branch into the branch proposed as
 * the one yes with no direction asked first, and a new session there once
 * it is done, as J-206 S1's status line says of the session
 * (`./ground.ts`, `predatesStatusLine`).
 * @param reading the branches
 * @returns the line, unindented
 */
export function predatingText(reading: PredatingBranches): string {
  if (reading.kind === "unknown") return `branches before the practice: unknown (${reading.why})`;
  const { base, branches, proceed } = reading;
  if (base === null || branches.length === 0) return "branches before the practice: none";
  const rest = branches.length - PREDATING_NAMED;
  const named = `${branches.slice(0, PREDATING_NAMED).join(", ")}${rest > 0 ? ` and ${String(rest)} more` : ""}`;
  const owed =
    proceed === null
      ? ""
      : `; a request for their files under proceed ${proceed} proposes the merge of ${base} into the branch as the one yes, asks no direction first, and once it is done the owner starts a new session there`;
  return `branches before the practice: ${named}${owed}`;
}

/**
 * The ground: the change open on the branch HEAD names, with the record's
 * `ground` and `agent` lines as it states them, or, while none is open, the
 * manifest's standing preference and the local facts the ground follows
 * without one: the branch HEAD names, and whether the proposal offers a
 * branch of its own or a worktree (J-143 S1).
 */
export type GroundReading =
  | {
      readonly kind: "change";
      readonly id: string;
      readonly branch: string | null;
      readonly ground: string | null;
      readonly agent: string | null;
    }
  | {
      readonly kind: "none";
      readonly setting: GroundSetting | null;
      readonly branch?: string | null;
      readonly offered?: boolean;
    };

/** How many change records the ledger holds, or why that cannot be said. */
export type RecordsReading =
  | { readonly kind: "known"; readonly count: number }
  | { readonly kind: "unknown"; readonly why: string };

/**
 * The orientation a first request for a change takes (J-129 S1), classified
 * once here for `status` and the mirror: `groundwork` on an empty tree, no
 * commit, no language and no document; the survey otherwise, its reason
 * `documents, no code` where documents stand and no language; none where a
 * change record exists, on disk or committed on any branch, local or
 * remote-tracking; unknown where a fact it rests on is.
 */
export type Orientation =
  | { readonly kind: "groundwork"; readonly reason: "empty tree" }
  | { readonly kind: "survey"; readonly reason: "documents, no code" | null }
  | { readonly kind: "none" }
  | { readonly kind: "unknown"; readonly why: string };

/**
 * Whether a remote's URL names a forge (J-130 S1): a forge by its host, or
 * no forge with the reason, a local path, a file URL, an unknown host or no
 * URL at all.
 */
export type RemoteKind =
  | { readonly kind: "forge"; readonly host: string }
  | { readonly kind: "not-forge"; readonly why: string };

/**
 * The remote a landing goes to and its kind (J-130 S1), classified once here
 * for `status` and the mirror from the remote's URL as the repository holds
 * it, never from the network: `origin`, or the first remote git lists where
 * none is named so; none where the repository names no remote; unknown where
 * git cannot say.
 */
export type RemoteReading =
  | { readonly kind: "none" }
  | { readonly kind: "forge"; readonly name: string; readonly host: string }
  | { readonly kind: "not-forge"; readonly name: string; readonly why: string }
  | { readonly kind: "unknown"; readonly why: string };

/** The situation as `status` prints it and `--json` carries it. */
export interface Situation {
  readonly commits: CommitsReading;
  /** How many change records the ledger holds; none means the first request is the orientation. */
  readonly records: RecordsReading;
  readonly homes: readonly KnowledgeHome[];
  readonly languages: LanguagesReading;
  /** The orientation the facts above call for, which the agent reads rather than derives. */
  readonly orientation: Orientation;
  readonly stoppedElsewhere: StoppedElsewhere;
  /** The branches cut before the install (J-213 S1); the reader always gives it, a situation built without it prints no line. */
  readonly predating?: PredatingBranches;
  /** The changes open in another checkout git lists, each with its path (J-143 S2); none where none is. */
  readonly openElsewhere?: readonly OpenElsewhere[];
  /** The remote and whether it is a forge, which the close's landing offer reads (J-130 S1). */
  readonly remote: RemoteReading;
  readonly ground: GroundReading;
}

/** A change whose record stands open in another checkout git lists, and that checkout's path from the main checkout's root. */
export interface OpenElsewhere {
  readonly id: string;
  readonly path: string;
  /** This checkout's state of the record where it holds it done or dropped: the other checkout's open record is a copy left behind, never an open change (J-228 S1). */
  readonly left?: "done" | "dropped";
}

/**
 * The line naming the changes open in other checkouts, which `status` and
 * the mirror print (J-143 S2): each change with its worktree, whose session
 * works on it there; and apart, each copy of a record this checkout holds
 * done or dropped that another checkout still holds open, a copy left
 * behind and no open change, with the command that removes its worktree on
 * the owner's word; nothing is removed (J-228 S1).
 * @param open the changes and their checkouts
 * @returns the line, unindented, or undefined where none is open elsewhere
 */
export function openElsewhereText(open: readonly OpenElsewhere[]): string | undefined {
  const opened = open.filter((entry) => entry.left === undefined);
  const left = open.filter((entry) => entry.left !== undefined);
  const parts = [
    ...(opened.length === 0
      ? []
      : [
          `open in other worktrees: ${opened.map((entry) => `${entry.id} (in the worktree ${entry.path})`).join(", ")}; each is worked on in its own checkout`,
        ]),
    ...(left.length === 0
      ? []
      : [
          `left in other worktrees: ${left.map((entry) => `${entry.id} (in the worktree ${entry.path}, its record ${entry.left ?? ""} here)`).join(", ")}; each is a copy of a closed record and no open change, and ${left.map((entry) => `\`greenline tidy --change ${entry.id} --worktree\``).join(", ")} removes its worktree on the owner's word`,
        ]),
  ];
  return parts.length === 0 ? undefined : parts.join("; ");
}

/** The forges a host or a scheme can name: the four public ones, and their self-hosted forms by name. */
const FORGE_HOSTS: readonly string[] = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
];
const FORGE_NAMES: ReadonlySet<string> = new Set(["github", "gitlab", "bitbucket", "codeberg"]);

/** Whether a host names a forge: a public forge's host or one under it, or a host with a forge's name as one of its labels. */
function namesForge(host: string): boolean {
  if (FORGE_HOSTS.some((forge) => host === forge || host.endsWith(`.${forge}`))) return true;
  return host.split(".").some((label) => FORGE_NAMES.has(label));
}

/** A URL's host, lower case, its user and port left out; undefined where the authority holds none. */
function hostOf(authority: string): string | undefined {
  const at = authority.lastIndexOf("@");
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  const host = hostPort.startsWith("[")
    ? hostPort.slice(0, hostPort.indexOf("]") + 1)
    : (hostPort.split(":")[0] ?? "");
  return host === "" ? undefined : host.toLowerCase();
}

/** Where a URL points: a host, a file URL, or a local path. */
type UrlPlace =
  | { readonly kind: "host"; readonly host: string }
  | { readonly kind: "file" }
  | { readonly kind: "path" };

const PATH: UrlPlace = { kind: "path" };

/** Where a URL points, as git reads its forms: a scheme's authority, the scp-like `[user@]host:path`, or a path. */
function placeOf(text: string): UrlPlace {
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/]*)/.exec(text);
  if (scheme !== null) {
    const [, name = "", authority = ""] = scheme;
    if (name.toLowerCase() === "file") return { kind: "file" };
    const host = hostOf(authority);
    return host === undefined ? PATH : { kind: "host", host };
  }
  // git reads `host:path` as scp-like only where no slash comes before the colon; a drive letter is a path.
  // A bracketed host's own colons are its address's, so its separating colon follows the bracket.
  const bracket = text.startsWith("[") ? text.indexOf("]") : -1;
  const colon = text.indexOf(":", Math.max(bracket, 0));
  const slash = text.indexOf("/");
  if (colon > 1 && (slash === -1 || colon < slash)) {
    const host = hostOf(text.slice(0, colon));
    return host === undefined ? PATH : { kind: "host", host };
  }
  return PATH;
}

/**
 * Whether a remote's URL names a forge, read from its text alone (J-130 S1):
 * a URL with a scheme by its host, a `file://` URL as no forge, a remote
 * helper's `<transport>::<address>` a forge where the transport names one
 * and otherwise by its address, the scp-like `[user@]host:path` by its host,
 * and anything else, an absolute or a relative path, a `~` path or a Windows
 * drive's, as a local path. A host names a forge where it is github.com,
 * gitlab.com, bitbucket.org or codeberg.org or a host under one, or where one
 * of its labels is github, gitlab, bitbucket or codeberg, a self-hosted
 * forge's form; any other host is unknown, and an unknown host is no forge.
 * @param url the URL as `git remote get-url` gives it
 * @returns the kind
 */
export function remoteKindOf(url: string): RemoteKind {
  const text = url.trim();
  if (text === "") return { kind: "not-forge", why: "no URL" };
  const helper = /^([A-Za-z][A-Za-z0-9+.-]*)::(.*)$/.exec(text);
  const transport = helper?.[1]?.toLowerCase();
  const place = placeOf(helper?.[2] ?? text);
  const host = place.kind === "host" ? place.host : undefined;
  if (transport !== undefined && FORGE_NAMES.has(transport))
    return { kind: "forge", host: host ?? transport };
  if (host !== undefined)
    return namesForge(host)
      ? { kind: "forge", host }
      : { kind: "not-forge", why: `an unknown host, ${host}` };
  return { kind: "not-forge", why: place.kind === "file" ? "a file URL" : "a local path" };
}

/**
 * The remote as the situation's line prints it, unindented.
 * @param remote the reading
 * @returns the line, such as `remote: origin, not a forge (a local path)`
 */
export function remoteText(remote: RemoteReading): string {
  switch (remote.kind) {
    case "none":
      return "remote: none";
    case "forge":
      return `remote: ${remote.name}, a forge (${remote.host})`;
    case "not-forge":
      return `remote: ${remote.name}, not a forge (${remote.why})`;
    case "unknown":
      return `remote: unknown (${remote.why})`;
  }
}

/** A file's language by its extension; a file of no listed language counts for none. */
const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["js", "javascript"],
  ["jsx", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["py", "python"],
  ["go", "go"],
  ["rs", "rust"],
  ["java", "java"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["cs", "c#"],
  ["cpp", "c++"],
  ["cc", "c++"],
  ["cxx", "c++"],
  ["hpp", "c++"],
  ["c", "c"],
  ["h", "c"],
  ["rb", "ruby"],
  ["php", "php"],
  ["swift", "swift"],
  ["ex", "elixir"],
  ["exs", "elixir"],
  ["scala", "scala"],
  ["dart", "dart"],
]);

/**
 * The languages at the roots: each file's language by its extension, under
 * the root it stands in, `.` for a file at the top of the tree and the
 * top-level folder otherwise; the workspace's own `.greenline/` and the files
 * greenline installed are left out.
 * @param files the repository's files, from its root, forward slashes
 * @param installed the paths greenline installed, from the lock
 * @returns each language found with its roots, both sorted
 */
export function languagesAt(
  files: readonly string[],
  installed: ReadonlySet<string>,
): readonly LanguageRoots[] {
  const found = new Map<string, Set<string>>();
  for (const file of files) {
    if (file.startsWith(".greenline/") || installed.has(file)) continue;
    const extension = extensionOf(file);
    const language = extension === undefined ? undefined : EXTENSIONS.get(extension);
    if (language === undefined) continue;
    const slash = file.indexOf("/");
    const root = slash === -1 ? "." : `${file.slice(0, slash)}/`;
    found.set(language, (found.get(language) ?? new Set()).add(root));
  }
  return [...found.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([language, roots]) => ({ language, roots: [...roots].sort() }));
}

/**
 * A document's extensions: Markdown, plain text and the common markup and
 * office kinds a planning document is written in. A file of one is a
 * document, never code.
 */
const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "markdown",
  "txt",
  "text",
  "rst",
  "adoc",
  "asciidoc",
  "org",
  "tex",
  "rtf",
  "pdf",
  "doc",
  "docx",
  "odt",
]);

/** A file's extension, lower case; undefined for a name with none or a dot file's name. */
function extensionOf(file: string): string | undefined {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? undefined : name.slice(dot + 1).toLowerCase();
}

/**
 * How many documents the tree holds, by extension, with `.greenline/` and the
 * files greenline installed left out as {@link languagesAt} leaves them.
 * @param files the repository's files, from its root, forward slashes
 * @param installed the paths greenline installed, from the lock
 * @returns the count
 */
export function documentsAt(files: readonly string[], installed: ReadonlySet<string>): number {
  return files.filter((file) => {
    if (file.startsWith(".greenline/") || installed.has(file)) return false;
    const extension = extensionOf(file);
    return extension !== undefined && DOCUMENT_EXTENSIONS.has(extension);
  }).length;
}

/** What the orientation is classified from: the situation's facts and the documents counted, undefined where the files could not be listed. */
export interface OrientationFacts {
  readonly commits: CommitsReading;
  readonly records: RecordsReading;
  readonly stoppedElsewhere: StoppedElsewhere;
  /** Whether a commit any ref reaches, a local or a remote-tracking branch's, holds a change record; undefined where git cannot say. */
  readonly recordsElsewhere?: boolean | undefined;
  readonly languages: LanguagesReading;
  readonly documents: number | undefined;
}

/**
 * The orientation the facts call for, the rule of frame's references ("The
 * orientation") in one place: none where a change record exists, on disk or
 * on any branch, local or remote-tracking; otherwise
 * the survey where code is found, the survey of the documents where only
 * documents are, `groundwork` where the tree is empty and holds no commit,
 * and the survey on a tree with commits and neither.
 * @param facts the commits, the records, the changes stopped elsewhere, the languages and the documents
 * @returns the orientation, unknown with the first reason a fact it needs gives
 */
export function orientationOf(facts: OrientationFacts): Orientation {
  const { commits, records, stoppedElsewhere, languages, documents } = facts;
  if (records.kind === "unknown") return { kind: "unknown", why: records.why };
  if (records.count > 0 || facts.recordsElsewhere === true) return { kind: "none" };
  if (stoppedElsewhere.kind === "known" && stoppedElsewhere.changes.length > 0)
    return { kind: "none" };
  if (languages.kind === "unknown") return { kind: "unknown", why: languages.why };
  if (languages.languages.length > 0) return { kind: "survey", reason: null };
  if (documents === undefined) return { kind: "unknown", why: "the files could not be listed" };
  if (documents > 0) return { kind: "survey", reason: "documents, no code" };
  if (commits.kind === "unknown") return { kind: "unknown", why: commits.why };
  return commits.count === 0
    ? { kind: "groundwork", reason: "empty tree" }
    : { kind: "survey", reason: null };
}

/**
 * The orientation as the situation's line prints it, unindented.
 * @param orientation the orientation
 * @returns the line, such as `orientation: survey (documents, no code)`
 */
export function orientationText(orientation: Orientation): string {
  switch (orientation.kind) {
    case "groundwork":
      return `orientation: groundwork (${orientation.reason})`;
    case "survey":
      return orientation.reason === null
        ? "orientation: survey"
        : `orientation: survey (${orientation.reason})`;
    case "none":
      return "orientation: none (a change record exists)";
    case "unknown":
      return `orientation: unknown (${orientation.why})`;
  }
}

function commitsText(commits: CommitsReading): string {
  if (commits.kind === "unknown") return `unknown (${commits.why})`;
  const where = commits.branch === null ? "at a detached HEAD" : `on ${commits.branch}`;
  return commits.count === 0 ? `none, ${where}` : `${commits.count} ${where}`;
}

function recordsText(records: RecordsReading): string {
  if (records.kind === "unknown") return `unknown (${records.why})`;
  return records.count === 0 ? "none" : String(records.count);
}

function languagesText(languages: LanguagesReading): string {
  if (languages.kind === "unknown") return `unknown (${languages.why})`;
  if (languages.languages.length === 0) return "none found";
  return languages.languages
    .map((entry) => `${entry.language} (${entry.roots.join(", ")})`)
    .join(", ");
}

function stoppedText(stopped: StoppedElsewhere): string {
  if (stopped.kind === "unknown") return `unknown (${stopped.why})`;
  if (stopped.changes.length === 0) return "none";
  return stopped.changes
    .map((id) => {
      const worktree = stopped.worktrees.find((entry) => entry.id === id);
      return worktree === undefined ? id : `${id} (in the worktree ${worktree.path})`;
    })
    .join(", ");
}

function groundOf(ground: GroundReading): string {
  return ground.kind === "none"
    ? groundSettingLine(
        ground.setting ?? undefined,
        ground.branch === undefined
          ? undefined
          : { branch: ground.branch ?? undefined, offered: ground.offered === true },
      )
    : groundLine({
        branch: ground.branch ?? undefined,
        ground: ground.ground ?? undefined,
        agent: ground.agent ?? undefined,
      });
}

/**
 * The situation as text: deterministic, facts only.
 * @param situation the situation
 * @returns the text, ending with a newline
 */
export function renderSituationText(situation: Situation): string {
  return [
    "situation",
    `  commits: ${commitsText(situation.commits)}`,
    `  change records: ${recordsText(situation.records)}`,
    `  knowledge homes: ${situation.homes.length === 0 ? "none" : situation.homes.map((home) => home.path).join(", ")}`,
    `  languages: ${languagesText(situation.languages)}`,
    `  ${orientationText(situation.orientation)}`,
    `  stopped on other branches: ${stoppedText(situation.stoppedElsewhere)}`,
    ...(situation.predating === undefined ? [] : [`  ${predatingText(situation.predating)}`]),
    ...[openElsewhereText(situation.openElsewhere ?? [])].flatMap((text) =>
      text === undefined ? [] : [`  ${text}`],
    ),
    `  ${remoteText(situation.remote)}`,
    `  ${groundOf(situation.ground)}`,
    "",
  ].join("\n");
}
