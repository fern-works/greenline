import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { designDrift, designDriftLine, type DesignDrift } from "../core/design-drift.ts";
import type { CheckHome } from "../core/interface-check.ts";
import {
  DESIGN_FILE,
  governingHome,
  parseDesign,
  type DesignDocument,
} from "../core/design-file.ts";
import {
  detectInterface,
  interfaceRootOf,
  type InterfaceDetection,
} from "../core/interface-detection.ts";
import type { InterfaceSetting } from "../core/manifest.ts";
import { catalogPin, parseCatalog, type CatalogEntry } from "../core/interface-catalog.ts";
import {
  NO_RULINGS,
  parseInterfaceRulings,
  type InterfaceRulings,
} from "../core/interface-rulings.ts";
import { marksLine } from "../core/marks.ts";
import { readGit } from "./code-tree.ts";
import { openMarks, readMarksFiles } from "./marks.ts";

/**
 * The interface on the disk (J-123 S1): the repository's files listed for
 * the detection, the decisions book's `## Interface` rulings, the DESIGN.md
 * homes and the drift between them and the code under the roots, and the
 * lines `greenline status` prints of them. Every read here only reads.
 */

/** Directories the walk of a repository with no git never enters. */
const WALK_SKIPS = new Set([".git", ".greenline", "node_modules", "dist", "build", "coverage"]);
/** The walk's depth and its count, so a repository with no git cannot hold the command long. */
const WALK_DEPTH = 8;
const WALK_FILES = 20_000;

/** A repository's files by a walk, where git cannot list them. */
function walkedFiles(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string, prefix: string, depth: number): void => {
    if (depth > WALK_DEPTH || found.length >= WALK_FILES) return;
    let names: readonly string[];
    try {
      names = readdirSync(directory);
    } catch {
      return;
    }
    for (const name of [...names].sort()) {
      if (WALK_SKIPS.has(name)) continue;
      const path = join(directory, name);
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      let directoryEntry = false;
      try {
        directoryEntry = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (directoryEntry) walk(path, relative, depth + 1);
      else found.push(relative);
    }
  };
  walk(root, "", 0);
  return found;
}

/**
 * The repository's files from its root: every file git tracks and every
 * untracked one it would add, or, where git cannot list them, a bounded walk
 * that leaves out the dependencies and the builds.
 * @param root the repository root
 * @returns the paths, `/`-separated
 */
export function repositoryFiles(root: string): readonly string[] {
  const listed = readGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  if (listed._tag === "ok")
    return listed.value
      .split("\0")
      .filter((path) => path !== "" && !path.startsWith(".greenline/"));
  return walkedFiles(root);
}

/** A file's text, or undefined where it cannot be read. */
function textAt(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Detect the workspace's interface on the disk.
 * @param root the repository root
 * @returns the interface, or undefined where the workspace has none
 */
export function detectWorkspaceInterface(root: string): InterfaceDetection | undefined {
  return detectInterface({
    files: repositoryFiles(root),
    packageJson: textAt(root, "package.json"),
    pubspec: textAt(root, "pubspec.yaml"),
  });
}

/**
 * The manifest's interface block for a detection, unconfirmed and with the
 * check's opt-in off, as init and sync first write it.
 * @param detection what the detection found
 * @returns the block
 */
export function detectedSetting(detection: InterfaceDetection): InterfaceSetting {
  return {
    roots: detection.roots,
    extensions: detection.extensions,
    platform: detection.platform,
    frameworks: detection.frameworks,
    evidence: detection.evidence,
    confirmed: false,
    check: false,
  };
}

/**
 * The interface block sync writes: a confirmed block is the owner's and
 * stays; an unconfirmed one follows the detection, keeping the owner's
 * opt-in; none is written where nothing is detected and none stood.
 * @param current the manifest's block as it stands
 * @param detection what the detection finds now
 * @returns the block to write, or undefined for none
 */
export function syncedSetting(
  current: InterfaceSetting | undefined,
  detection: InterfaceDetection | undefined,
): InterfaceSetting | undefined {
  if (current?.confirmed === true || detection === undefined) return current;
  const detected = detectedSetting(detection);
  if (current === undefined) return detected;
  return { ...detected, check: current.check };
}

/**
 * The decisions book's interface rulings.
 * @param root the repository root
 * @returns the rulings, none where the book or its section stands nowhere
 */
export function readInterfaceRulings(root: string): InterfaceRulings {
  const book = textAt(root, ".greenline/DECISIONS.md");
  return book === undefined ? NO_RULINGS : parseInterfaceRulings(book).rulings;
}

/** A DESIGN.md home: its directory, and its document or why it does not read. */
export type DesignHome =
  | { readonly directory: string; readonly ok: true; readonly document: DesignDocument }
  | { readonly directory: string; readonly ok: false; readonly reason: string };

/**
 * The DESIGN.md homes of the workspace: the root's and each nested one, in
 * the repository's order.
 * @param root the repository root
 * @param files the repository's files, listed once by the caller
 * @returns each home read
 */
export function designHomes(root: string, files: readonly string[]): readonly DesignHome[] {
  return files
    .filter((path) => path === DESIGN_FILE || path.endsWith(`/${DESIGN_FILE}`))
    .filter((path) => !path.split("/").some((segment) => segment === "node_modules"))
    .flatMap((path): DesignHome[] => {
      const directory = path === DESIGN_FILE ? "." : path.slice(0, -DESIGN_FILE.length - 1);
      const text = textAt(root, path);
      if (text === undefined) return [];
      const parsed = parseDesign(text, path);
      return [
        parsed._tag === "ok"
          ? { directory, ok: true, document: parsed.value }
          : {
              directory,
              ok: false,
              reason: parsed.error.issues.map((issue) => issue.message).join("; "),
            },
      ];
    });
}

/** The interface files under the roots, each with its text. */
function interfaceFiles(
  root: string,
  setting: InterfaceSetting,
  files: readonly string[],
): readonly { readonly path: string; readonly text: string }[] {
  return files.flatMap((path) => {
    if (interfaceRootOf(path, setting.roots, setting.extensions) === undefined) return [];
    const text = textAt(root, path);
    return text === undefined ? [] : [{ path, text }];
  });
}

/**
 * The drift between the code under the roots and the homes that govern it,
 * each file read against its nearest DESIGN.md.
 * @param root the repository root
 * @param setting the manifest's interface block
 * @param files the repository's files
 * @param homes the homes, read
 * @returns the drift, summed over the homes
 */
export function workspaceDrift(
  root: string,
  setting: InterfaceSetting,
  files: readonly string[],
  homes: readonly DesignHome[],
): DesignDrift {
  const readable = homes.flatMap((home) => (home.ok ? [home] : []));
  const directories = readable.map((home) => home.directory);
  const governed = interfaceFiles(root, setting, files);
  const drifts = readable.map((home) =>
    designDrift(
      home.document,
      governed.filter((file) => governingHome(file.path, directories) === home.directory),
    ),
  );
  return {
    undeclared: drifts.flatMap((drift) => drift.undeclared),
    unused: drifts.flatMap((drift) => drift.unused),
  };
}

/**
 * The lines init and sync print of a detected interface: the facts the owner
 * confirms through cards in the first interface change, and the home's
 * offer where no DESIGN.md stands.
 * @param root the repository root
 * @param setting the manifest's interface block, undefined where none was detected
 * @returns the lines, each ending with a newline, empty where the workspace has no interface
 */
export function interfaceOfferText(root: string, setting: InterfaceSetting | undefined): string {
  if (setting === undefined || setting.confirmed) return "";
  const facets = [setting.platform, ...setting.frameworks].join(" · ");
  const lines = [
    `Interface detected: ${facets}, under ${setting.roots.join(", ")}; your agent confirms it with you through cards in the first interface change.`,
  ];
  if (designHomes(root, repositoryFiles(root)).length === 0)
    lines.push(
      "No DESIGN.md: the home is offered; ask your agent to survey the interface, and it writes DESIGN.md and the rulings with you.",
    );
  return `${lines.join("\n")}\n`;
}

/**
 * The lines `greenline status` prints of the interface: what the workspace
 * has and whether its home is read or offered, and the drift line.
 * @param root the repository root
 * @param setting the manifest's interface block, undefined where the workspace has none
 * @returns the lines, each ending with a newline, empty where the workspace has no interface
 */
export function interfaceStatusText(root: string, setting: InterfaceSetting | undefined): string {
  if (setting === undefined) return "";
  const files = repositoryFiles(root);
  const homes = designHomes(root, files);
  const rulings = readInterfaceRulings(root);
  const registers =
    rulings.registers.length === 0
      ? "register not ruled"
      : rulings.registers.map((entry) => `${entry.register} at ${entry.root}`).join(", ");
  const facets = [setting.platform, ...setting.frameworks].join(" · ");
  const confirmed = setting.confirmed ? "confirmed" : "detected, not confirmed";
  const broken = homes.find((home) => !home.ok);
  const home =
    homes.length === 0
      ? "no DESIGN.md: the home is offered"
      : broken !== undefined && !broken.ok
        ? `${broken.directory === "." ? "" : `${broken.directory}/`}DESIGN.md does not read: ${broken.reason}`
        : `DESIGN.md read${homes.length > 1 ? `, ${String(homes.length)} homes, the nearest governing` : ""}`;
  const lines = [
    `interface: yes, ${registers}; ${facets} (${confirmed}); roots ${setting.roots.join(", ")}; ${home}`,
  ];
  if (homes.some((entry) => entry.ok)) {
    const drift = designDriftLine(workspaceDrift(root, setting, files, homes));
    if (drift !== undefined) lines.push(drift);
  }
  const marks = marksLine(openMarks(root, readMarksFiles(root)));
  if (marks !== undefined) lines.push(marks);
  return `${lines.join("\n")}\n`;
}

/**
 * The DESIGN.md homes that govern paths: each one found walking up from a
 * path's directory to the root, read and parsed; a home that does not read
 * is left out, since status names it.
 * @param root the repository root
 * @param paths the paths from the root
 * @returns the homes, each once
 */
export function homesNear(root: string, paths: readonly string[]): readonly CheckHome[] {
  const directories = new Set<string>();
  for (const path of paths) {
    let directory = path.includes("/") ? dirname(path) : ".";
    for (;;) {
      directories.add(directory);
      if (directory === ".") break;
      directory = directory.includes("/") ? dirname(directory) : ".";
    }
  }
  return [...directories].sort().flatMap((directory): CheckHome[] => {
    const path = directory === "." ? DESIGN_FILE : `${directory}/${DESIGN_FILE}`;
    if (!existsSync(join(root, path))) return [];
    const text = textAt(root, path);
    if (text === undefined) return [];
    const parsed = parseDesign(text, path);
    return parsed._tag === "ok" ? [{ directory, document: parsed.value, text }] : [];
  });
}

/**
 * The home a rendered page is read against: the root's DESIGN.md, else the
 * first nested one that reads, since a page's address names no file.
 * @param root the repository root
 * @returns the home's document, or undefined where none reads
 */
export function pageHome(root: string): DesignDocument | undefined {
  const atRoot = homesNear(root, [DESIGN_FILE])[0];
  if (atRoot?.directory === ".") return atRoot.document;
  for (const home of designHomes(root, repositoryFiles(root))) if (home.ok) return home.document;
  return undefined;
}

/** Where an installed extra's catalog stands, by harness. */
const CATALOG_PATHS = [
  ".claude/skills/interface-catalog/catalog/entries.json",
  ".agents/skills/interface-catalog/catalog/entries.json",
];

/** The installed catalog's entries, or why none can be read. */
export type InstalledCatalog =
  | { readonly kind: "installed"; readonly entries: readonly CatalogEntry[]; readonly pin: string }
  | { readonly kind: "absent"; readonly reason: string };

/**
 * The interface catalog the workspace installed (J-123 S6): the extra
 * skill's entries, from the first harness folder that holds them.
 * @param root the repository root
 * @returns the entries, or why there are none
 */
export function installedCatalog(root: string): InstalledCatalog {
  const text = CATALOG_PATHS.map((path) => textAt(root, path)).find((found) => found !== undefined);
  if (text === undefined)
    return {
      kind: "absent",
      reason:
        "The interface catalog is not installed: it is an extra skill, interface-catalog, installed on the owner's request.",
    };
  const entries = parseCatalog(text);
  return entries === undefined
    ? { kind: "absent", reason: "The installed catalog does not read; run greenline sync." }
    : { kind: "installed", entries, pin: catalogPin(text) };
}
