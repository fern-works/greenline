/**
 * The inspector's answers (J-154 S2): each document a `GET /api/...`
 * address serves, built from the repository as it stands, and the settings
 * state the saves answer with. Synchronous: the server never builds one on
 * its request loop, but in its readers (`./readers.ts`), behind its cache.
 */
import { discussionView, researchFile } from "./discussions.ts";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { sha256Hex } from "../../commons/hash.ts";
import { NO_PROCEED, parseManifest, trialSkillNames } from "../../core/manifest.ts";
import { isConnectorSkill } from "../../core/connectors/registry.ts";
import { parseDecisionDocument } from "../../core/root-statements.ts";
import { parseHouseRulings } from "../../core/house-rulings.ts";
import { lineDiff } from "../../core/inspect.ts";
import { parseLock } from "../../core/lock.ts";
import { renderProjection } from "../../core/render.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { rosterOf } from "../repository-state.ts";
import type { Installation } from "../../core/installation.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import { readInstalledFile } from "./repository-read.ts";
import {
  changeChecks,
  changeCommits,
  changeCommitViews,
  changeHead,
  changesList,
  type CommitLog,
} from "./ledger.ts";
import { isChangeId } from "../../core/change.ts";
import { planDetail, plansList } from "./plans.ts";
import { knowledgeHome, knowledgeList } from "./knowledge.ts";
import { notesReading } from "./captures.ts";
import { changedFilesOf, commitFiles, installedTest, noFiles } from "./changed-files.ts";
import { deskDocument, sinceOf } from "./desk.ts";
import { fileAcrossCommits } from "./diff.ts";
import { discussionSummaries } from "./discussions.ts";
import { changeRef } from "./refs.ts";
import {
  catalogDocument,
  dealAskOf,
  dealDocument,
  interfaceChecksDocument,
  interfaceDocument,
} from "./interface.ts";
import type {
  ChangeListEntry,
  InspectorDocument,
  InstalledFileDocument,
  Read,
  SettingsDocument,
  SourceDocument,
  StateCounts,
  Unread,
} from "../../core/inspector/documents.ts";
import type { Manifest } from "../../core/manifest.ts";
import { landingText } from "../landing.ts";
import {
  CONTRACT_DOCUMENTS,
  GENERATED_FILES,
  INSPECT_SCHEMA,
  REMAINING_DOCUMENTS,
} from "../../core/inspector/contract.ts";
import {
  atlasDocument,
  documentPage,
  pictureDocument,
  picturesDocument,
  subsystemDocument,
} from "./visuals.ts";
import {
  discussionsDocument,
  frameMapDocument,
  practiceDocument,
  rosterDocument,
  searchDocument,
  skillDocument,
  skillLoadsDocument,
} from "./readings.ts";

export const editable = [
  ".greenline/manifest.json",
  ".greenline/DECISIONS.md",
  "AGENTS.md",
] as const;
/** The texts a save may change, with the revision it checks against. */
export interface EditableTexts {
  readonly manifest: string;
  readonly decisions: string;
  readonly agents: string;
  /** Each file's revision, the digest of its text, which a save of that file names (J-165 S1). */
  readonly revisions: {
    readonly manifest: string;
    readonly decisions: string;
    readonly agents: string;
  };
}

/** The editable files' texts and their revision, or why one cannot be read. */
export function editableTexts(
  root: string,
  io: FileIo,
):
  | Extract<ReturnType<FileIo["read"]>, { readonly _tag: "err" }>
  | {
      readonly _tag: "ok";
      readonly value: EditableTexts;
    } {
  const values: string[] = [];
  for (const path of editable) {
    const result = readInstalledFile(root, io, path);
    if (result._tag === "err" && (result.error.step !== "absent" || path === editable[0]))
      return result;
    values.push(result._tag === "ok" ? result.value : "");
  }
  const [manifest = "", decisions = "", agents = ""] = values;
  return {
    _tag: "ok" as const,
    value: {
      manifest,
      decisions,
      agents,
      revisions: {
        manifest: sha256Hex(manifest),
        decisions: sha256Hex(decisions),
        agents: sha256Hex(agents),
      },
    },
  };
}
/** Pin one readable Git tree for the whole comparison. */
function gitBaseline(
  root: string,
): { readonly revision: string; readonly paths: ReadonlySet<string> } | undefined {
  try {
    const options: ExecFileSyncOptionsWithStringEncoding = {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    } as const;
    const revision = execFileSync(
      "git",
      ["rev-parse", "--verify", "HEAD^{commit}"],
      options,
    ).trim();
    const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", revision], options);
    return { revision, paths: new Set(paths.split("\0").filter(Boolean)) };
  } catch {
    return undefined;
  }
}

/** The text at the pinned commit, or undefined when its blob cannot be read. */
function atHead(root: string, revision: string, path: string): string | undefined {
  try {
    return execFileSync("git", ["show", revision + ":" + path], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

/** The trailers git printed for one commit, one `Key: value` per line. */
function trailersOf(text: string): readonly { key: string; value: string }[] {
  return text.split("\n").flatMap((line) => {
    const trailer = /^([A-Za-z0-9][A-Za-z0-9-]*):\s*(.*)$/.exec(line.trim());
    return trailer?.[1] === undefined ? [] : [{ key: trailer[1], value: trailer[2] ?? "" }];
  });
}

/** A commit id as git prints it; nothing else reaches git's arguments. */
const COMMIT = /^[0-9a-f]{7,64}$/;

/**
 * The subject and date of each commit, in one read of git; a commit git
 * cannot describe is left out, and the page shows its subject as unknown.
 */
function commitLog(root: string): CommitLog {
  return (hashes) => {
    const found = new Map<
      string,
      { subject: string; date: string; trailers: readonly { key: string; value: string }[] }
    >();
    const asked = hashes.filter((hash) => COMMIT.test(hash));
    if (asked.length === 0) return found;
    let text: string;
    try {
      text = execFileSync(
        "git",
        [
          "log",
          "--no-walk=unsorted",
          "--format=%H%x00%s%x00%cI%x00%(trailers:only,unfold)%x1e",
          ...asked,
        ],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      return found;
    }
    for (const record of text.split("\x1e")) {
      const [hash, subject, date, trailerText] = record.trim().split("\0");
      if (hash !== undefined && subject !== undefined && date !== undefined)
        found.set(hash, { subject, date, trailers: trailersOf(trailerText ?? "") });
    }
    return found;
  };
}

/** The files the installation writes: the manifest's projection and every file its lock lists. */
function installedPaths(
  root: string,
  io: FileIo,
  manifest: Manifest,
  installation: Installation,
): Set<string> {
  const paths = new Set(renderProjection(manifest, installation).map((file) => file.path));
  const lockText = readInstalledFile(root, io, ".greenline/lock.json");
  const lock =
    lockText._tag === "ok" ? parseLock(lockText.value, ".greenline/lock.json") : undefined;
  if (lock?._tag === "ok") for (const path of lock.value.files.keys()) paths.add(path);
  return paths;
}

/**
 * One installed file's text (J-154 S3), looked up among the files the
 * installation writes and never built from the address alone.
 * @param root the repository root
 * @param env the environment, for the installation
 * @param path the file's path from the root
 * @returns the document, or undefined for a path the installation does not write
 */
function installedFile(
  root: string,
  env: CliEnvironment,
  path: string,
): Unread<InstalledFileDocument> | undefined {
  const io = createNodeFileIo();
  const text = readInstalledFile(root, io, ".greenline/manifest.json");
  const manifest =
    text._tag === "ok"
      ? parseManifest(text.value, ".greenline/manifest.json", rosterOf(env.installation))
      : undefined;
  if (
    manifest?._tag !== "ok" ||
    !installedPaths(root, io, manifest.value, env.installation).has(path)
  )
    return undefined;
  const actual = readInstalledFile(root, io, path);
  return {
    schema: INSPECT_SCHEMA,
    kind: "installed-file",
    path,
    size: actual._tag === "ok" ? Buffer.byteLength(actual.value) : null,
    content: actual._tag === "ok" ? actual.value : null,
    problem: actual._tag === "err" ? actual.error.message : null,
  };
}

/** The installed files by folder with their sizes, and those that cannot be read apart. */
function installedListing(
  files: readonly {
    readonly path: string;
    readonly size: number | null;
    readonly error: string | null;
  }[],
): Pick<SettingsDocument, "files" | "unreadable"> {
  const folders = new Map<string, { name: string; size: number }[]>();
  const unreadable: { path: string; error: string }[] = [];
  for (const file of files) {
    if (file.size === null) {
      // An absent file is the installation's to write again; status names it, and the page lists it unread.
      unreadable.push({ path: file.path, error: file.error ?? "not on disk" });
      continue;
    }
    const folder = posix.dirname(file.path);
    folders.set(folder, [
      ...(folders.get(folder) ?? []),
      { name: posix.basename(file.path), size: file.size },
    ]);
  }
  return {
    files: [...folders.entries()].map(([folder, held]) => ({ folder, files: held })),
    unreadable,
  };
}

function inspectorState(
  root: string,
  env: CliEnvironment,
): Unread<SettingsDocument> | { error: string } {
  const io = createNodeFileIo(),
    texts = editableTexts(root, io);
  if (texts._tag === "err") return { error: texts.error.message };
  const manifest = parseManifest(
      texts.value.manifest,
      ".greenline/manifest.json",
      rosterOf(env.installation),
    ),
    decisions = parseDecisionDocument(texts.value.decisions, ".greenline/DECISIONS.md");
  if (manifest._tag === "err" || decisions._tag === "err")
    return { error: "No readable repository configuration or decisions." };
  const paths = installedPaths(root, io, manifest.value, env.installation);
  const baseline = gitBaseline(root);
  const files: {
      readonly path: string;
      readonly size: number | null;
      readonly error: string | null;
    }[] = [],
    changes: SettingsDocument["changes"]["files"][number][] = [],
    unavailable: string[] = [];
  for (const path of [...paths].sort()) {
    const actual = readInstalledFile(root, io, path);
    files.push({
      path,
      size: actual._tag === "ok" ? Buffer.byteLength(actual.value) : null,
      error: actual._tag === "err" ? actual.error.message : null,
    });
    if (actual._tag === "err" && actual.error.step !== "absent") {
      unavailable.push(path);
      continue;
    }
    if (baseline === undefined) continue;
    const before = baseline.paths.has(path) ? atHead(root, baseline.revision, path) : "";
    if (before === undefined) {
      unavailable.push(path);
      continue;
    }
    const after = actual._tag === "ok" ? actual.value : "";
    if (before !== after) changes.push({ path, diff: lineDiff(before, after) });
  }
  const markerText = readInstalledFile(root, io, ".greenline/policy-changes.json");
  if (markerText._tag === "err" && markerText.error.step !== "absent")
    return { error: markerText.error.message };
  const markerData = markers.safeParse(
    markerText._tag === "ok" ? parseJson(markerText.value) : { schemaVersion: 1, changes: [] },
  );
  if (!markerData.success) return { error: "Policy change evidence is invalid." };
  const rulings = parseHouseRulings(texts.value.agents);
  return {
    schema: INSPECT_SCHEMA,
    kind: "settings",
    manifest: manifest.value,
    installation: env.installation.revision,
    revisions: texts.value.revisions,
    cliVersion: env.version,
    roots: decisions.value.roots,
    policyChanges: markerData.data.changes,
    decisions: texts.value.decisions,
    houseRulings: { stanza: rulings.map((r) => `- ${r}`).join("\n"), rulings },
    ...installedListing(files),
    changes: { baseline: baseline?.revision ?? null, files: changes, unavailable },
    settings: {
      proceed: [NO_PROCEED, ...env.installation.modes.modes.map((mode) => mode.name)],
      // The trial skills beside the line, which `trials` names, so a save keeps an enabled one.
      trials: trialSkillNames(env.installation.modes, env.installation.skills),
    },
    // A connector's skill is its connector's to install, and a trial skill the trials
    // setting's, so neither is offered as a choice.
    skills: env.installation.skills
      .filter((skill) => !unlisted(env.installation, skill.name))
      .map((skill) => ({
        name: skill.name,
        installed: files.some(
          (file) => file.path.endsWith(`/skills/${skill.name}/SKILL.md`) && file.size !== null,
        ),
        extra: skill.extra === true,
      })),
  };
}
/** A file's revision, the digest a save checks. */
export const revision: z.ZodString = z.string().regex(/^[a-f0-9]{64}$/);

/** The policy changes recorded beside the saves, `.greenline/policy-changes.json`. */
export interface PolicyChanges {
  readonly schemaVersion: 1;
  readonly changes: readonly {
    readonly path: (typeof editable)[number];
    readonly before: string;
    readonly after: string;
    readonly at: string;
  }[];
}

export const markers: z.ZodType<PolicyChanges> = z
  .object({
    schemaVersion: z.literal(1),
    changes: z.array(
      z
        .object({ path: z.enum(editable), before: revision, after: revision, at: z.iso.datetime() })
        .strict(),
    ),
  })
  .strict();
/**
 * Whether the page leaves a skill out of its choices: a connector's skill,
 * which its connector installs, and a trial skill beside the line, which the
 * trials setting installs (S17 of the plan modes-records-recipes).
 */
export function unlisted(installation: Installation, name: string): boolean {
  return (
    isConnectorSkill(name) ||
    trialSkillNames(installation.modes, installation.skills).includes(name)
  );
}
/** A path segment decoded; a malformed escape stays as written, so it names no change and is answered 404. */
export function decodedPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
/** A visual's id from the segments after its prefix, each decoded; undefined when one does not decode or steps out. */
export function visualIdOf(rest: string): string | undefined {
  const parts = rest.split("/").map(decodedPart);
  return parts.every((part) => part !== "" && part !== "." && part !== ".." && !part.includes("/"))
    ? parts.join("/")
    : undefined;
}

/** An address's answer: a document, or why there is none. */
export interface Answer {
  readonly status: number;
  readonly body: InspectorDocument | { error: string };
}

/** A document as a builder makes it, each kind before the server stamps it with its reading. */
type UnreadDocument = InspectorDocument extends infer D
  ? D extends { readonly read: Read }
    ? Omit<D, "read">
    : never
  : never;

const NO_CHANGE = { status: 404, body: { error: "No such change record." } } as const;

/** How many changes stand in each state. */
function countsOf(changes: readonly ChangeListEntry[]): StateCounts {
  const count = (state: ChangeListEntry["state"]): number =>
    changes.filter((entry) => entry.state === state).length;
  return {
    waiting: count("waiting"),
    inProgress: count("in-progress"),
    stopped: count("stopped"),
    done: count("done"),
    dropped: count("dropped"),
    proposed: count("proposed"),
    unreadable: count(null),
  };
}

/** The ledger's path of a change's record. */
const recordPath = (id: string): string => `.greenline/ledger/${id}.md`;

/** Whether a change's record stands directly under the ledger, by its id alone. */
function recordStands(root: string, id: string): boolean {
  if (!isChangeId(id)) return false;
  try {
    return statSync(join(root, recordPath(id))).isFile();
  } catch {
    return false;
  }
}

/** A change's record as written, with its path and when it was last written (J-165 S1). */
function recordSource(
  root: string,
  id: string,
): Pick<Unread<SourceDocument>, "change" | "path" | "text" | "at" | "problem"> {
  const path = recordPath(id);
  try {
    const full = join(root, path);
    return {
      change: changeRef(id),
      path,
      text: readFileSync(full, "utf8"),
      at: statSync(full).mtime.toISOString(),
      problem: null,
    };
  } catch (error) {
    return {
      change: changeRef(id),
      path,
      text: null,
      at: null,
      problem: `It cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** The reading a document carries when its caller names none: read now, of a state it does not name. */
function readNow(): Read {
  return { at: new Date().toISOString(), revision: "unnamed" };
}

/**
 * The document a `GET /api/...` address serves, read as the repository
 * stands (`CONTRACT_DOCUMENTS` names each address), stamped with when it was
 * read and the revision of the state it read. A record's address looks its
 * name up among those its home holds and never builds a path from it.
 * @param root the repository root
 * @param env the environment it reads under
 * @param path the address's path under /api/
 * @param query the address's query
 * @param read when it was read and the revision of the state, the server's cache key
 * @returns the answer
 */
export function documentAt(
  root: string,
  env: CliEnvironment,
  path: string,
  query: URLSearchParams = new URLSearchParams(),
  read: Read = readNow(),
): Answer {
  const today = new Date(read.at);
  const ok = (body: UnreadDocument): Answer => ({ status: 200, body: { ...body, read } });
  const missing = (error: string): Answer => ({ status: 404, body: { error } });
  const part = (pattern: RegExp): readonly string[] | undefined => {
    const found = pattern.exec(path);
    return found === null ? undefined : found.slice(1).map((value) => decodedPart(value ?? ""));
  };
  switch (path) {
    case "/api/contract":
      return ok({
        schema: INSPECT_SCHEMA,
        kind: "contract",
        version: 2,
        documents: CONTRACT_DOCUMENTS,
        remaining: REMAINING_DOCUMENTS,
        generatedFiles: GENERATED_FILES,
      });
    case "/api/desk":
      return ok(deskDocument(root, env, today, sinceOf(query)));
    case "/api/changes": {
      const list = changesList(root, env, today);
      return ok({
        schema: INSPECT_SCHEMA,
        kind: "changes",
        ...list,
        counts: countsOf(list.changes),
        plans: plansList(root, env).plans.length,
        discussions: discussionSummaries(root).length,
      });
    }
    case "/api/plans":
      return ok({ schema: INSPECT_SCHEMA, kind: "plans", ...plansList(root, env) });
    case "/api/knowledge":
      return ok({ schema: INSPECT_SCHEMA, kind: "homes", ...knowledgeList(root) });
    case "/api/discussions":
      return ok(discussionsDocument(root));
    case "/api/pictures":
      return ok(picturesDocument(root));
    case "/api/atlas":
      return ok(atlasDocument(root));
    case "/api/roster":
      return ok(rosterDocument(root, env));
    case "/api/practice":
      return ok(practiceDocument(root, env));
    case "/api/settings": {
      const state = inspectorState(root, env);
      return "error" in state ? { status: 409, body: state } : ok(state);
    }
    case "/api/catalog":
      return ok(catalogDocument(root));
    case "/api/interface":
      return ok(interfaceDocument(root, notesReading(root)));
    case "/api/search":
      return ok(searchDocument(root, env, today));
    default:
      break;
  }
  // A change's interface and its deal read the record and the catalog, not the change's whole detail (J-123 S7).
  const facing = part(/^\/api\/changes\/([^/]+)\/(interface|deal)$/);
  if (facing !== undefined) {
    const [id = "", aspect = ""] = facing;
    const found =
      aspect === "deal"
        ? dealDocument(root, id, dealAskOf(query))
        : interfaceChecksDocument(root, id);
    return found === undefined ? NO_CHANGE : ok(found);
  }
  // One step or one file of the folder, each its own document read from the record alone (J-155 S2, J-165 S1).
  const piece = part(/^\/api\/changes\/([^/]+)\/(steps|files)\/(.+)$/);
  if (piece !== undefined) {
    const [id = "", kind = "", name = ""] = piece;
    const head = changeHead(root, env, id, today);
    if (head === undefined) return NO_CHANGE;
    const ref = changeRef(id);
    if (kind === "steps") {
      const section = head.section(name);
      return section === undefined
        ? missing("No such step in this change's record.")
        : ok({ schema: INSPECT_SCHEMA, kind: "step", change: ref, section });
    }
    const file = head.file(name);
    return file === undefined
      ? missing("No such file in this change's folder.")
      : ok({ schema: INSPECT_SCHEMA, kind: "file", change: ref, file });
  }
  // One changed file's lines across the change's commits and its net change (J-155 S2, J-165 S1).
  const lines = part(/^\/api\/changes\/([^/]+)\/changed\/(.+)$/);
  if (lines !== undefined) {
    const [id = "", name = ""] = lines;
    if (!recordStands(root, id)) return NO_CHANGE;
    const ref = changeRef(id);
    const commits = changeCommits(root, env, id);
    if ("unknown" in commits)
      return ok({
        schema: INSPECT_SCHEMA,
        kind: "diff",
        change: ref,
        path: name,
        commits: [],
        net: null,
        unknown: commits.unknown,
      });
    // Only a path the change's commits touched is read, as the change's files list it.
    const files = commitFiles(root, commits);
    const touched =
      !("unknown" in files) &&
      [...files.values()].some((commit) => commit.files.some((file) => file.path === name));
    if (!touched) return missing("The change's commits did not touch that file.");
    return ok({
      schema: INSPECT_SCHEMA,
      kind: "diff",
      change: ref,
      path: name,
      ...fileAcrossCommits(root, commits, name),
    });
  }
  const change = part(
    /^\/api\/changes\/([^/]+)(?:\/(checks|commits|loads|frame|changed|pictures|notes|source))?$/,
  );
  if (change !== undefined) {
    const [id = "", aspect = ""] = change;
    if (!recordStands(root, id)) return NO_CHANGE;
    const envelope = { schema: INSPECT_SCHEMA, change: id } as const;
    switch (aspect) {
      case "checks": {
        const checks = changeChecks(root, env, id, commitLog(root));
        return checks === undefined
          ? NO_CHANGE
          : // The landing's state the mirror and the status print, once the close has run (J-202 S1).
            ok({
              ...envelope,
              kind: "check-facts",
              ...checks,
              landing: landingText(root, id) ?? null,
            });
      }
      case "commits":
        return ok({
          ...envelope,
          kind: "commits",
          ...changeCommitViews(root, env, id, commitLog(root)),
        });
      case "changed": {
        const commits = changeCommits(root, env, id);
        const files = "unknown" in commits ? commits : commitFiles(root, commits);
        return ok({
          ...envelope,
          kind: "changed-files",
          changedFiles:
            "unknown" in files
              ? noFiles(files.unknown)
              : changedFilesOf([...files.values()], installedTest(root)),
        });
      }
      case "loads":
        return ok(skillLoadsDocument(root, id, env));
      case "frame":
        return ok(frameMapDocument(root, id));
      case "pictures":
        return ok(picturesDocument(root, id));
      case "notes": {
        const notes = notesReading(root);
        return ok({
          ...envelope,
          kind: "notes",
          notes: { ...notes, notes: notes.notes.filter((view) => view.change === id) },
        });
      }
      case "source":
        return ok({ schema: INSPECT_SCHEMA, kind: "source", ...recordSource(root, id) });
      default: {
        // The change's head: its record and its folder alone, each part at its own address (J-165 S1).
        const head = changeHead(root, env, id, today);
        if (head === undefined) return NO_CHANGE;
        return ok({
          schema: INSPECT_SCHEMA,
          kind: "change",
          ref: changeRef(id),
          state: head.state,
          waitingOn: head.waitingOn,
          strip: head.strip,
          change: head.detail,
        });
      }
    }
  }
  // One skill of the roster with its use, the changes that loaded it and its loads (J-165 S1).
  const skill = part(/^\/api\/roster\/([^/]+)$/);
  if (skill !== undefined) {
    const found = skillDocument(root, env, skill[0] ?? "");
    return found === undefined ? missing("No such skill in the roster.") : ok(found);
  }
  const plan = part(/^\/api\/plans\/([^/]+)$/);
  if (plan !== undefined) {
    const found = planDetail(root, env, plan[0] ?? "");
    return found === undefined
      ? missing("No such plan directory.")
      : ok({ schema: INSPECT_SCHEMA, kind: "plan", plan: found });
  }
  const home = part(/^\/api\/knowledge\/([^/]+)$/);
  if (home !== undefined) {
    const found = knowledgeHome(root, home[0] ?? "");
    return found === undefined
      ? missing("No such knowledge home here.")
      : ok({ schema: INSPECT_SCHEMA, kind: "home", home: found });
  }
  // One research report of a discussion, its text rendered (J-166 S1), a name its folder lists and no other.
  const report = part(/^\/api\/discussions\/([^/]+)\/research\/([^/]+)$/);
  if (report !== undefined) {
    const [id = "", name = ""] = report;
    const found = discussionView(root, id);
    const file = found === undefined ? undefined : researchFile(root, id, name);
    return found === undefined || file === undefined
      ? missing("No such research report in this discussion.")
      : ok({ schema: INSPECT_SCHEMA, kind: "file", change: found.ref, file });
  }
  const discussion = part(/^\/api\/discussions\/([^/]+)$/);
  if (discussion !== undefined) {
    const found = discussionView(root, discussion[0] ?? "");
    return found === undefined
      ? missing("No such discussion.")
      : ok({ schema: INSPECT_SCHEMA, kind: "discussion", discussion: found });
  }
  const mark = part(/^\/api\/marks\/([^/]+)$/);
  if (mark !== undefined) {
    const notes = notesReading(root);
    const found = notes.notes.find((view) => view.mark.id === mark[0]);
    return found === undefined
      ? missing("No such note.")
      : ok({ schema: INSPECT_SCHEMA, kind: "mark", note: found, revision: notes.revision });
  }
  // A picture, a visual or a capture with its boxes and its notes (J-154 S3); its id is a visual's, `<home>/<slug>`.
  const picture = /^\/api\/pictures\/(.+)$/.exec(path)?.[1];
  if (picture !== undefined) {
    const id = visualIdOf(picture);
    const found = id === undefined ? undefined : pictureDocument(root, id, notesReading(root));
    return found === undefined ? missing("No such picture.") : ok(found);
  }
  // An installed file's text, looked up among the files the installation writes (J-154 S3).
  const installed = /^\/api\/practice\/files\/(.+)$/.exec(path)?.[1];
  if (installed !== undefined) {
    const named = visualIdOf(installed);
    const found = named === undefined ? undefined : installedFile(root, env, named);
    return found === undefined ? missing("No such installed file.") : ok(found);
  }
  // An indexed document's page (J-147 S5), looked up among the index's paths alone.
  const document = /^\/api\/atlas\/documents\/(.+)$/.exec(path)?.[1];
  if (document !== undefined) {
    let named: string | undefined;
    try {
      named = decodeURIComponent(document);
    } catch {
      named = undefined;
    }
    const found = named === undefined ? undefined : documentPage(root, named);
    return found === undefined ? missing("No such document.") : ok(found);
  }
  const subsystem = part(/^\/api\/atlas\/subsystems\/([^/]+)$/);
  if (subsystem !== undefined) {
    const found = subsystemDocument(root, subsystem[0] ?? "");
    return found === undefined ? missing("No such subsystem page.") : ok(found);
  }
  return missing("No such path.");
}
