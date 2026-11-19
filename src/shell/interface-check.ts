import { declaredApp, declaredPages, recordedLimits } from "../core/record-interface.ts";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { factsFileName } from "../core/facts.ts";
import { designDriftLine } from "../core/design-drift.ts";
import { DESIGN_FILE } from "../core/design-file.ts";
import { DESIGN_PICK_FILE, designPickLine, parseDesignPick } from "../core/design-pick.ts";
import {
  checkInterface,
  checksOfChange,
  componentsOn,
  countsOf,
  interfaceChecksLine,
  interfaceFactsFolder,
  INTERFACE_CHECK_COMMAND,
  parseInterfaceCheckFact,
  recordWaivers,
  REDESIGN_RULE,
  renderFindings,
  type CheckOutcome,
  type InterfaceCheckFact,
  type InterfaceFinding,
} from "../core/interface-check.ts";
import { inSkippedFolder, interfaceRootOf } from "../core/interface-detection.ts";
import type { Component } from "../core/interface-facets.ts";
import { declaredComponents, parseInterfaceFact } from "../core/interface-fact.ts";
import {
  captureLimitText,
  platformLimit,
  viewerOriginRefusal,
  type CaptureLimit,
} from "../core/interface-check.ts";
import {
  pageMatches,
  pagesOf,
  renderOwed,
  renderOwedLine,
  touchedFiles,
  unservedLine,
  type TouchedPages,
} from "../core/interface-pages.ts";
import type { InterfaceRulings } from "../core/interface-rulings.ts";
import {
  SURVEY_FILE,
  parseSurvey,
  serializeHomeFile,
  withMeasuredRows,
} from "../core/interface-home.ts";
import { SURVEY_COMMAND, surveyRows } from "../core/interface-survey.ts";
import type { SourceFile } from "../core/interface-static.ts";
import { changeOfBranch, recordPath, TRAILER_KEY } from "../core/git-hooks.ts";
import { isChangeId } from "../core/change.ts";
import type { InterfaceSetting, Manifest } from "../core/manifest.ts";
import { headCommit, readGit } from "./code-tree.ts";
import { filesInPlay } from "./file-tokens.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { branchFacts, workingRecord, workspaceManifest } from "./hooks.ts";
import {
  designHomes,
  homesNear,
  readInterfaceRulings,
  repositoryFiles,
  workspaceDrift,
} from "./interface.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./cli/output.ts";
import { checkRoute, redesigning, type RouteResult } from "./interface-capture.ts";
import { changeLoads } from "./skill-loads.ts";
import { KEPT_FILE } from "../core/interface-kept.ts";
import { MANIFEST_SUFFIX, VISUALS_HOME } from "../core/visuals.ts";
import { allUnmeasured } from "../core/interface-render.ts";
import { markedCaptures } from "./marks.ts";
import { readServing } from "./inspect/address-file.ts";

/**
 * `greenline check interface [--change <id>] [--survey] [<path>...]` on the
 * disk (J-123 S4; `src/core/interface-check.ts`): the interface files named,
 * or those the change touched, its commits' and the working tree's, checked
 * against the registry's rules by tier; the findings printed, the tiered
 * fact written in the change's folder where a change is open, and the run
 * red on a floor finding or an unwaived reflex. Run through `greenline
 * check -- greenline check interface`, its red holds `done` as any declared
 * check's does. `--survey` measures the survey sheet's rows instead. The
 * harness hook's findings after an interface write come from here too.
 */

/** The fact's `generatedBy`. */
const GENERATED_BY = "greenline check interface";

const USAGE = [
  "Usage: greenline check interface [--change <id>] [--url <address> --path <page>] [<path>...]",
  "       greenline check interface [--change <id>] --path <screen>",
  "       greenline check interface --survey",
  "",
  "Check the interface files named, else those the change touched (its commits",
  "and the working tree), against the interface rules whose facets match the",
  "workspace's, the file's and the components the change's design section",
  "names. Findings print by tier: a floor finding makes the run red and is",
  "never waived; a reflex finding is red unless the record's build section",
  "waives it with 'waived: <rule>: <reason>; the owner's yes: \"<words>\"' or",
  "the rulings' '## Interface' holds a standing waiver; a finish finding is",
  "listed and never red. Where a change is open the tiered findings are",
  "written to .greenline/ledger/<id>/interface/. Record a run with",
  "greenline check -- greenline check interface, so a red run holds done.",
  "",
  "--url <address> --path <page> also renders that page of the running app",
  "in a local Chrome or Chromium (GREENLINE_CHROME, the Playwright Chromium, or",
  "the usual places) at 1440, 768 and 390, with reduced motion, dark where",
  "DESIGN.md declares it, and at 320 for the floor alone, and runs the render",
  "rules. With a change open it keeps the captures as a visual of the form",
  "capture under .greenline/visuals/<id>/, writes the page's entry in",
  ".greenline/ledger/interface/paths.json, and on a redesign writes the kept",
  "list from the before and checks the after against it. With no browser the",
  "render rules are listed unmeasured and the floor stands as checked",
  "statically.",
  "",
  "--path <screen> alone, on a platform no browser renders (the manifest's",
  "platform is not web), records that browser limit as the screen's run, which",
  "the close waits on where the manifest's interface block sets check.",
  "",
  "--survey measures the survey sheet's rows at the current commit and writes",
  `them to ${SURVEY_FILE}, keeping every row read or confirmed.`,
  "",
].join("\n");

/** An address of a running page to render, or a screen no browser renders, named alone (J-143 S3). */
interface RouteToRender {
  /** The running app's origin; undefined for a screen of a platform no browser renders. */
  readonly origin: string | undefined;
  readonly address: string;
}

/** A parsed invocation. */
type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "survey" }
  | {
      readonly kind: "check";
      readonly change: string | undefined;
      readonly paths: readonly string[];
      /** The running page's origin and the address to render, or a screen's address alone. */
      readonly render: RouteToRender | undefined;
    }
  | { readonly kind: "refused"; readonly message: string };

function parseArgs(argv: readonly string[]): Parsed {
  let change: string | undefined;
  let survey = false;
  let origin: string | undefined;
  let address: string | undefined;
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--survey") survey = true;
    else if (arg === "--change" || arg === "--url" || arg === "--path") {
      const value = argv[index + 1];
      if (value === undefined || value === "")
        return { kind: "refused", message: `${arg} needs a value` };
      if (arg === "--change") change = value;
      else if (arg === "--url") origin = value;
      else address = value;
      index += 1;
    } else if (arg.startsWith("-"))
      return { kind: "refused", message: `unknown argument '${arg}'` };
    else paths.push(arg);
  }
  if (survey && (change !== undefined || paths.length > 0))
    return {
      kind: "refused",
      message: "--survey measures the whole interface; give it no --change and no path",
    };
  if (survey && (origin !== undefined || address !== undefined))
    return { kind: "refused", message: "--survey renders nothing; give it no --url and no --path" };
  if (origin !== undefined && address === undefined)
    return {
      kind: "refused",
      message:
        "--url and --path are given together: the running app's origin and the page to render",
    };
  if (origin !== undefined && !/^https?:\/\/[^/\s]+\/?$/.test(origin))
    return {
      kind: "refused",
      message: `--url is the running page's origin, such as http://localhost:3000, not '${origin}'`,
    };
  if (address !== undefined && !address.startsWith("/"))
    return {
      kind: "refused",
      message: `--path is a page's path starting with '/', not '${address}'`,
    };
  const render = address === undefined ? undefined : { origin, address };
  return survey ? { kind: "survey" } : { kind: "check", change, paths, render };
}

/** A file's text, or undefined where it cannot be read. */
function textAt(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/** Whether a path from the root is a DESIGN.md home. */
function isHome(path: string): boolean {
  return path === DESIGN_FILE || path.endsWith(`/${DESIGN_FILE}`);
}

/**
 * The interface files among paths, each read: under a root with an
 * interface extension, or a DESIGN.md.
 * @param root the repository root
 * @param setting the manifest's interface block
 * @param paths the paths from the root
 * @returns the files read, each once
 */
function interfaceFilesAmong(
  root: string,
  setting: InterfaceSetting,
  paths: readonly string[],
): readonly SourceFile[] {
  return [...new Set(paths)].flatMap((path) => {
    if (!isHome(path) && interfaceRootOf(path, setting.roots, setting.extensions) === undefined)
      return [];
    const text = textAt(root, path);
    return text === undefined ? [] : [{ path, text }];
  });
}

/** The paths the commits carrying a change's trailer added, copied, modified or renamed. */
function committedPaths(root: string, id: string): readonly string[] {
  const read = readGit(root, [
    "log",
    "--format=",
    "--name-only",
    "--diff-filter=ACMR",
    "--fixed-strings",
    `--grep=${TRAILER_KEY}: ${id}`,
  ]);
  return read._tag === "ok" ? read.value.split("\n").filter((path) => path.trim() !== "") : [];
}

/**
 * The paths a change touched: those its commits changed, found by the
 * change's trailer, and the working tree's changed and added files.
 * @param root the repository root
 * @param id the change, or undefined where none is open
 * @returns the paths from the root, sorted, each once
 */
function touchedPaths(root: string, id: string | undefined): readonly string[] {
  const committed = id === undefined ? [] : committedPaths(root, id);
  return [...new Set([...committed, ...filesInPlay(root)])].sort();
}

/**
 * The change a run belongs to: the one named, else the change of the branch
 * HEAD names, as the hooks resolve it; none off a change's branch.
 * @param root the repository root
 * @param named the change `--change` names
 * @returns the change's id, or undefined
 */
function openChangeOf(root: string, named: string | undefined): string | undefined {
  if (named !== undefined) return named;
  const facts = branchFacts(root);
  return changeOfBranch(facts.current, facts)?.id;
}

/** The components a change's design section declares, undefined where it declares none. */
function changeComponents(
  root: string,
  change: string | undefined,
): readonly Component[] | undefined {
  const design = changeReading(root, change).design;
  const named = design === undefined ? [] : declaredComponents(design);
  return named.length === 0 ? undefined : componentsOn(named);
}

/** What a run reads of a change: its waivers and its components. */
interface ChangeReading {
  readonly body: string;
  readonly design: string | undefined;
}

function changeReading(root: string, id: string | undefined): ChangeReading {
  if (id === undefined) return { body: "", design: undefined };
  return { body: textAt(root, recordPath(id)) ?? "", design: workingRecord(root, id)?.design };
}

/**
 * Run the static check on files.
 * @param root the repository root
 * @param setting the manifest's interface block
 * @param files the files
 * @param change the change whose record's waivers and components apply
 * @param rulings the rulings
 * @returns the outcome
 */
function checkFiles(
  root: string,
  setting: InterfaceSetting,
  files: readonly SourceFile[],
  change: string | undefined,
  rulings: InterfaceRulings,
): CheckOutcome {
  return checkInterface({
    files,
    homes: homesNear(
      root,
      files.map((file) => file.path),
    ),
    setting,
    rulings,
    components: changeComponents(root, change),
    waivers: recordWaivers(changeReading(root, change).body),
  });
}

/** Where a fact was written, or why it was not. */
interface FactWritten {
  readonly path: string | undefined;
  readonly error: string | undefined;
}

/**
 * Write a run's fact in the change's folder.
 * @param root the repository root
 * @param id the change
 * @param fact the fact
 * @returns the fact's path from the root, or why it could not be written
 */
function writeFact(root: string, id: string, fact: InterfaceCheckFact): FactWritten {
  const folder = interfaceFactsFolder(id);
  const name = factsFileName(fact.at, randomBytes(3).toString("hex"));
  const path = `${folder}/${name}`;
  const written = atomicWriteFile(join(root, path), `${JSON.stringify(fact, null, 2)}\n`);
  return written._tag === "ok"
    ? { path, error: undefined }
    : { path: undefined, error: written.error.message };
}

/**
 * Every interface fact a change's folder holds that reads, oldest first.
 * @param root the repository root
 * @param id the change
 * @returns the facts, in their names' order, which is their times'
 */
function interfaceFacts(root: string, id: string): readonly InterfaceCheckFact[] {
  const folder = join(root, interfaceFactsFolder(id));
  let names: readonly string[];
  try {
    names = readdirSync(folder)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const text = textAt(root, `${interfaceFactsFolder(id)}/${name}`);
    const parsed = text === undefined ? undefined : parseInterfaceCheckFact(text, name);
    return parsed?._tag === "ok" ? [parsed.value] : [];
  });
}

/**
 * The latest interface fact a change's folder holds.
 * @param root the repository root
 * @param id the change
 * @returns the fact, or undefined where none reads
 */
export function latestInterfaceFact(root: string, id: string): InterfaceCheckFact | undefined {
  return interfaceFacts(root, id).at(-1);
}

/**
 * What the render still owes a change (J-133 S1; `../core/interface-pages.ts`):
 * where its record says `interface: yes` and the declared interface check
 * holds it, each page its interface files name that no run captured at the
 * three widths or rendered to the browser limit the engine named since the
 * files last changed, by their modification times, and the files no page
 * names while no render ran since. The paths it touched are its commits'
 * and the working tree's, as the check reads them.
 * @param root the repository root
 * @param id the change
 * @param manifest the workspace's manifest
 * @param stated the record's `interface` line, undefined where it states none
 * @returns what is owed, or undefined where nothing is or the change is not held
 */
export function renderOwedOf(
  root: string,
  id: string,
  manifest: Manifest,
  stated: string | undefined,
): TouchedPages | undefined {
  const setting = manifest.interface;
  const fact = stated === undefined ? undefined : parseInterfaceFact(stated);
  if (setting === undefined || fact?.touches !== true) return undefined;
  const held = checksOfChange(manifest.checks, setting, fact).some(
    (check) =>
      check.command === INTERFACE_CHECK_COMMAND ||
      check.command.startsWith(`${INTERFACE_CHECK_COMMAND} `),
  );
  if (!held) return undefined;
  const body = changeReading(root, id).body;
  return renderOwed(
    touchedFiles(touchedPaths(root, id), setting, declaredPages(body)),
    interfaceFacts(root, id),
    (path) => modifiedAt(root, path),
    recordedLimits(body),
  );
}

/** A file's last write, in milliseconds since the epoch, or undefined where it stands nowhere. */
function modifiedAt(root: string, path: string): number | undefined {
  try {
    return statSync(join(root, path)).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * The lines naming each capture a change's check could not make (J-191 S1):
 * per address, where its latest render run met a limit, the limit with its
 * cause, the origin tried and the time, and whether the record's
 * `## Interface` section names it yet.
 * @param root the repository root
 * @param id the change
 * @returns the lines, none where every latest render captured its page
 */
export function captureLimitLines(root: string, id: string): readonly string[] {
  const latest = new Map<string, InterfaceCheckFact>();
  for (const fact of interfaceFacts(root, id))
    if (fact.address !== undefined && (fact.limit !== undefined || fact.widths.length > 0))
      latest.set(fact.address, fact);
  const recorded = recordedLimits(changeReading(root, id).body);
  return [...latest.values()].flatMap((fact) => {
    const limit = fact.limit;
    if (limit === undefined) return [];
    const named = recorded.some((line) => pageMatches(line.address, limit.address));
    return [
      `interface capture: not made for ${limit.address}, ${limit.at}: ${captureLimitText(limit)}; ${named ? "the record names it" : "the record does not name it yet"}`,
    ];
  });
}

/**
 * The mirror's line of a change's latest interface check, or undefined
 * where none ran.
 * @param root the repository root
 * @param id the change
 * @returns the line
 */
export function interfaceChecksMirrorLine(root: string, id: string): string | undefined {
  const fact = latestInterfaceFact(root, id);
  return fact === undefined ? undefined : interfaceChecksLine(fact.counts);
}

/** Measure the survey's rows and write the sheet. */
function runSurvey(root: string, setting: InterfaceSetting, writer: CliWriter): number {
  const commit = headCommit(root);
  if (commit.kind !== "commit") {
    writer.stderr.write(
      "greenline check: the survey measures at a commit, and HEAD names none yet; commit first\n",
    );
    return EXIT_USAGE;
  }
  const files = repositoryFiles(root);
  const homes = designHomes(root, files);
  const interfaceFiles = interfaceFilesAmong(root, setting, files).filter(
    (file) => !isHome(file.path),
  );
  const drift = homes.some((home) => home.ok)
    ? designDriftLine(workspaceDrift(root, setting, files, homes))
    : undefined;
  const rows = surveyRows({
    setting,
    files: interfaceFiles,
    homes: homes.map((home) =>
      home.directory === "." ? DESIGN_FILE : `${home.directory}/${DESIGN_FILE}`,
    ),
    drift,
    commit: commit.id,
  });
  const standing = textAt(root, SURVEY_FILE);
  const parsed = standing === undefined ? undefined : parseSurvey(standing);
  if (parsed?._tag === "err") {
    writer.stderr.write(
      `greenline check: ${SURVEY_FILE} does not read, so nothing is written over it: ${parsed.error.issues.map((issue) => issue.message).join("; ")}\n`,
    );
    return EXIT_FAILURE;
  }
  const sheet = withMeasuredRows(parsed?.value, SURVEY_COMMAND, rows);
  const written = atomicWriteFile(join(root, SURVEY_FILE), serializeHomeFile(sheet));
  if (written._tag === "err") {
    writer.stderr.write(
      `greenline check: ${SURVEY_FILE} cannot be written: ${written.error.message}\n`,
    );
    return EXIT_FAILURE;
  }
  writer.stdout.write(rows.map((row) => `${row.fact}: ${row.value}`).join("\n") + "\n");
  writer.stderr.write(
    `greenline check: ${String(rows.length)} measured rows written to ${SURVEY_FILE} at ${commit.id.slice(0, 12)}\n`,
  );
  return EXIT_OK;
}

/** What capture now answers: the capture kept by its id, or the limit that kept none. */
export type CapturedNow =
  | { readonly kind: "captured"; readonly capture: string; readonly lines: readonly string[] }
  | { readonly kind: "limit"; readonly limit: string; readonly detail?: CaptureLimit };

/**
 * Capture an address of a running page now, as the owner asks from the
 * viewer (J-124 S1): the same render the check's `--url --path` runs, kept
 * in the open change's folder of the visual home, or under `interface/`
 * while none is open, with its boxes beside it. A missing browser, a
 * workspace with no interface and a page that does not load are limits the
 * answer names, never failures.
 * @param root the repository root
 * @param origin the running page's origin
 * @param address the page's path under it
 * @param environment the process environment, where the browser is looked for
 * @param marked the capture ids a mark names, never overwritten
 * @param now the capture's time
 * @returns the capture kept, or the limit
 */
export async function captureNow(
  root: string,
  origin: string,
  address: string,
  environment: NodeJS.ProcessEnv,
  marked: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<CapturedNow> {
  const setting = workspaceManifest(root)?.interface;
  if (setting === undefined)
    return {
      kind: "limit",
      limit: "The manifest names no interface roots, so nothing is captured here.",
    };
  const change = openChangeOf(root, undefined);
  const head = headCommit(root);
  const commit = head.kind === "commit" && /^[0-9a-f]{40}$/.test(head.id) ? head.id : undefined;
  if (commit === undefined)
    return { kind: "limit", limit: "The repository has no commit yet, so a capture names none." };
  const files = interfaceFilesAmong(root, setting, touchedPaths(root, change));
  const result = await checkRoute({
    root,
    change,
    owner: true,
    marked,
    setting,
    rulings: readInterfaceRulings(root),
    components: changeComponents(root, change),
    waivers: recordWaivers(changeReading(root, change).body),
    origin,
    address,
    files: files.map((file) => file.path),
    commit,
    at: now.toISOString(),
    environment,
  });
  // The capture's limit, in the words and with the cause the check's own run keeps; the path index holds it for the Interface view (J-191 S1).
  if (result.limit !== undefined)
    return { kind: "limit", limit: captureLimitText(result.limit), detail: result.limit };
  if (result.browser !== undefined) return { kind: "limit", limit: result.browser };
  return result.capture === undefined
    ? {
        kind: "limit",
        limit: result.lines.join("; ") || "The capture could not be kept.",
      }
    : { kind: "captured", capture: result.capture, lines: result.lines };
}

/**
 * The run of a screen no browser renders (J-143 S3): on a platform that is
 * not the web, `--path <screen>` alone records the browser limit as the
 * screen's run, its render rules unmeasured and its floor standing as the
 * static engines checked it, so the render hold engages on every class and
 * a native class settles it with the limit named.
 * @param setting the manifest's interface block
 * @param address the screen named
 * @returns the run, its browser field the limit
 */
function screenLimit(setting: InterfaceSetting, address: string, at: string): RouteResult {
  const why = `the platform is ${setting.platform}, and no browser renders the screen ${address}; the floor stands as checked statically`;
  return {
    limit: platformLimit(address, at, why),
    findings: [],
    unmeasured: allUnmeasured(
      {
        register: undefined,
        platform: setting.platform,
        frameworks: setting.frameworks,
        components: [],
      },
      why,
    ),
    widths: [],
    browser: why,
    lines: [`interface render: ${why}`],
  };
}

/**
 * Run `greenline check interface`.
 * @param root the repository root
 * @param cwd the directory it was started from, which named paths are read from
 * @param argv the arguments after `interface`
 * @param writer greenline's own streams
 * @param now the run's time, for its fact
 * @returns 0 green, 1 red or failed, 2 refused
 */
export async function runCheckInterface(
  root: string,
  cwd: string,
  argv: readonly string[],
  writer: CliWriter,
  environment: NodeJS.ProcessEnv,
  now: () => Date = () => new Date(),
): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.kind === "help") {
    writer.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (parsed.kind === "refused") {
    writer.stderr.write(`greenline check: ${parsed.message}\n`);
    return EXIT_USAGE;
  }
  const setting = workspaceManifest(root)?.interface;
  if (setting === undefined) {
    writer.stdout.write(
      "interface checks: the manifest names no interface roots, so nothing is checked\n",
    );
    return EXIT_OK;
  }
  if (parsed.kind === "survey") return runSurvey(root, setting, writer);
  // A screen named alone is a platform's no browser renders; on the web the app's origin comes with it, from --url or the record's app line (J-191 S1).
  const change = openChangeOf(root, parsed.change);
  const appLine =
    parsed.render !== undefined && parsed.render.origin === undefined && setting.platform === "web"
      ? declaredApp(changeReading(root, change).body)
      : undefined;
  if (
    parsed.render !== undefined &&
    parsed.render.origin === undefined &&
    setting.platform === "web" &&
    appLine === undefined
  ) {
    writer.stderr.write(
      "greenline check: --path alone reads the app's origin from the record's ## Interface line `- app <origin>`, and the record names none; give --url the origin the app serves with --path, or name it on that line; on a platform no browser renders --path alone names a screen\n",
    );
    return EXIT_USAGE;
  }
  const render: RouteToRender | undefined =
    parsed.render === undefined
      ? undefined
      : { origin: parsed.render.origin ?? appLine, address: parsed.render.address };
  // The app's origin, never the viewer's: the check refuses the address greenline inspect serves at (j179c-conduct-interfaceb finding 4).
  const viewerRefused =
    render?.origin === undefined
      ? undefined
      : viewerOriginRefusal(render.origin, readServing(root)?.address);
  if (viewerRefused !== undefined) {
    writer.stderr.write(`greenline check: ${viewerRefused}\n`);
    return EXIT_USAGE;
  }
  const named = parsed.paths.map((path) =>
    relative(root, isAbsolute(path) ? path : resolve(cwd, path)),
  );
  const outside = named.find((path) => path.startsWith("..") || isAbsolute(path));
  if (outside !== undefined) {
    writer.stderr.write(`greenline check: '${outside}' lies outside the repository\n`);
    return EXIT_USAGE;
  }
  if (
    parsed.change !== undefined &&
    (!isChangeId(parsed.change) || !existsSync(join(root, recordPath(parsed.change))))
  ) {
    writer.stderr.write(
      `greenline check: no change record '${parsed.change}' in .greenline/ledger/\n`,
    );
    return EXIT_USAGE;
  }
  const paths =
    named.length > 0 ? named.map((path) => path.split(sep).join("/")) : touchedPaths(root, change);
  const files = interfaceFilesAmong(root, setting, paths);
  const rulings = readInterfaceRulings(root);
  const statics = checkFiles(root, setting, files, change, rulings);
  const at = now().toISOString();
  const head = headCommit(root);
  const commit = head.kind === "commit" && /^[0-9a-f]{40}$/.test(head.id) ? head.id : undefined;
  const rendered =
    render === undefined
      ? undefined
      : render.origin === undefined
        ? screenLimit(setting, render.address, at)
        : await checkRoute({
            root,
            change,
            marked: markedCaptures(root),
            setting,
            rulings,
            components: changeComponents(root, change),
            waivers: recordWaivers(changeReading(root, change).body),
            origin: render.origin,
            address: render.address,
            files: files.map((file) => file.path),
            commit,
            at,
            environment,
          });
  // A redesign's verify runs only with its start loaded, a before capture and the kept list (J-148 S3).
  const evidence = change === undefined ? undefined : redesignEvidence(root, change);
  const findings = [
    ...statics.findings,
    ...(rendered?.findings ?? []),
    ...(evidence === undefined ? [] : [evidence]),
  ];
  const counts = countsOf(findings);
  const outcome: CheckOutcome = { findings, counts, red: counts.floor > 0 || counts.reflex > 0 };
  writer.stdout.write(renderFindings(outcome));
  if (rendered !== undefined) {
    if (rendered.unmeasured.length > 0)
      writer.stdout.write(
        `unmeasured: ${rendered.unmeasured.map((entry) => entry.rule).join(", ")}${rendered.browser === undefined ? "" : `; ${rendered.browser}`}\n`,
      );
    for (const line of rendered.lines) writer.stderr.write(`greenline check: ${line}\n`);
    // The capture the check could not make, named as status names it (J-191 S1).
    const limit = rendered.limit;
    if (limit !== undefined && limit.cause !== "platform")
      writer.stdout.write(
        `interface capture: not made for ${limit.address}, ${limit.at}: ${captureLimitText(limit)}; name it in the record's ## Interface section as \`- limit ${limit.address}: <what was not captured, in your words>\` before done, or capture it\n`,
      );
  }
  // The pages from the addresses the app serves, never a template's path; a template no page line names is named, not checked (J-148 S4).
  const touched = pagesOf(
    touchedFiles(
      touchedPaths(root, change),
      setting,
      declaredPages(changeReading(root, change).body),
    ),
  );
  const unserved = unservedLine(touched.unserved ?? []);
  if (unserved !== undefined) writer.stdout.write(`${unserved}\n`);
  if (change !== undefined) {
    const fact: InterfaceCheckFact = {
      generatedBy: GENERATED_BY,
      at,
      commit: commit ?? null,
      paths: files.map((file) => file.path),
      counts: outcome.counts,
      findings: outcome.findings,
      unmeasured: rendered?.unmeasured ?? [],
      widths: rendered?.widths ?? [],
      browser: rendered?.browser,
      limit: rendered?.limit,
      address: render?.address,
      pages: touched.pages,
    };
    const written = writeFact(root, change, fact);
    writer.stderr.write(
      written.path === undefined
        ? `greenline check: the interface fact could not be written: ${written.error ?? ""}\n`
        : `greenline check: ${String(files.length)} interface file${files.length === 1 ? "" : "s"} checked; findings in ${written.path}\n`,
    );
  }
  return outcome.red ? EXIT_FAILURE : EXIT_OK;
}

/**
 * The redesign's evidence (J-148 S3, the Linear replay's F5): a change
 * whose record says a redesign holds the floor finding `redesign-evidence`
 * until the redesign start was loaded, a before capture stands among its
 * visuals and its kept list stands in its folder, each missing one named.
 * @param root the repository root
 * @param change the change the run belongs to
 * @returns the finding, or undefined where the change is no redesign or holds all three
 */
function redesignEvidence(root: string, change: string): InterfaceFinding | undefined {
  if (!redesigning(root, change)) return undefined;
  const missing: string[] = [];
  // Where the harness records no load, as with the adapters off, the start is not read, so done never waits on it.
  const loads = changeLoads(root, change);
  if (loads.length > 0 && !loads.some((load) => load.skill === "redesign"))
    missing.push("the redesign start, never loaded");
  let visuals: readonly string[];
  try {
    visuals = readdirSync(join(root, VISUALS_HOME, change));
  } catch {
    visuals = [];
  }
  if (!visuals.some((name) => name.endsWith(MANIFEST_SUFFIX) && name.includes("-before")))
    missing.push(
      "a before capture, the first greenline check interface --url <address> --path <page> run before the page changes",
    );
  if (!existsSync(join(root, ".greenline", "ledger", change, KEPT_FILE)))
    missing.push(
      `the kept list, .greenline/ledger/${change}/${KEPT_FILE}, which that before writes`,
    );
  return missing.length === 0
    ? undefined
    : {
        rule: REDESIGN_RULE,
        tier: "floor",
        path: recordPath(change),
        line: 0,
        detail: `missing: ${missing.join("; ")}`,
      };
}

/**
 * The harness hook's findings after a write to interface files (J-123 S4):
 * the static engines run on the files written, in code, with no model, and
 * their findings return to the agent as context. None where the workspace
 * names no interface or the write touched no interface file.
 * @param root the repository root
 * @param paths the written paths from the root
 * @param change the open change, whose waivers and components apply
 * @param shell whether a shell command wrote them, which the text names (J-133 S1)
 * @returns the text to return, or undefined
 */
export function findingsAfterWrite(
  root: string,
  paths: readonly string[],
  change: string | undefined,
  shell = false,
): string | undefined {
  const setting = workspaceManifest(root)?.interface;
  if (setting === undefined) return undefined;
  const all = interfaceFilesAmong(root, setting, paths);
  // A broad command, a checkout or a formatter, is read on its first files and its count named.
  const files = shell ? all.slice(0, SHELL_FILES) : all;
  if (files.length === 0) return undefined;
  // Every write under an interface root gets its findings by tier, none found included (J-148 S3, F12).
  const outcome = checkFiles(root, setting, files, change, readInterfaceRulings(root));
  const more =
    all.length > files.length
      ? ` (and ${String(all.length - files.length)} more, which greenline check interface reads)`
      : "";
  return `greenline interface rules on ${files.map((file) => file.path).join(", ")}${shell ? `, written by a shell command${more}` : ""}:\n${renderFindings(outcome)}`;
}

/** The most files a shell command's findings read at once. */
const SHELL_FILES = 20;

/** How far before a command's start a file's time still counts as its write, for a file system that keeps whole seconds. */
const WRITE_SLACK_MS = 1000;

/** What a shell command wrote, read from the files changed since it started (J-133 S1, J-135 S2). */
export interface ShellWrites {
  /** The files under greenline's homes, the ledger and the visual home, in every workspace. */
  readonly homes: readonly string[];
  /** The interface files, under an interface root or a DESIGN.md; none where the workspace names no interface. */
  readonly interface: readonly string[];
}

/** The homes a shell command's writes are read under in every workspace (J-135 S2). */
const SHELL_HOMES = [".greenline/ledger", VISUALS_HOME] as const;

/**
 * The files a shell command wrote: tracked or new and not ignored, whose
 * modification time falls at or after the command's start, whatever wrote
 * them, a redirection, an editor in place or a script. Under greenline's
 * homes, the ledger and the visual home, in every workspace, so a record,
 * a visual's manifest or a frame section the command wrote is a fact of
 * the hooks as a write tool's is (J-135 S2); and the interface files, under
 * an interface root or a DESIGN.md outside the skipped and dot folders,
 * where the workspace names an interface (J-133 S1).
 * @param root the repository root
 * @param since the command's start, in milliseconds since the epoch
 * @returns the paths from the root, each list sorted
 */
export function writtenByShell(root: string, since: number): ShellWrites {
  const setting = workspaceManifest(root)?.interface;
  const scope =
    setting === undefined
      ? ["--", ...SHELL_HOMES]
      : setting.roots.includes(".")
        ? []
        : ["--", ...SHELL_HOMES, ...setting.roots, DESIGN_FILE, `:(glob)**/${DESIGN_FILE}`];
  const read = readGit(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    ...scope,
  ]);
  if (read._tag === "err") return { homes: [], interface: [] };
  const inHome = (path: string): boolean => SHELL_HOMES.some((home) => path.startsWith(`${home}/`));
  const isInterface = (path: string): boolean =>
    setting !== undefined &&
    !inSkippedFolder(path) &&
    (isHome(path) || interfaceRootOf(path, setting.roots, setting.extensions) !== undefined);
  // Only a path under a home or an interface root is read for its time.
  const changed = [...new Set(read.value.split("\0"))]
    .filter((path) => path !== "" && (inHome(path) || isInterface(path)))
    .filter((path) => {
      try {
        return statSync(join(root, path)).mtimeMs >= since - WRITE_SLACK_MS;
      } catch {
        return false;
      }
    })
    .sort();
  return { homes: changed.filter(inHome), interface: changed.filter(isInterface) };
}

/**
 * The mirror's line while an open interface change owes a render (J-133 S1).
 * @param root the repository root
 * @param id the change
 * @param manifest the workspace's manifest
 * @returns the line, or undefined where nothing is owed
 */
export function renderMirrorLine(root: string, id: string, manifest: Manifest): string | undefined {
  const record = workingRecord(root, id);
  if (record?.state !== "open") return undefined;
  const owed = renderOwedOf(root, id, manifest, record.interface);
  return owed === undefined ? undefined : renderOwedLine(owed);
}

/**
 * The mirror's line of the deal view's pick while the design section does
 * not name it (J-123 S7).
 * @param root the repository root
 * @param id the change
 * @param design the record's design section
 * @returns the line, or undefined where no pick waits
 */
export function designPickMirrorLine(
  root: string,
  id: string,
  design: string | undefined,
): string | undefined {
  const text = textAt(root, `.greenline/ledger/${id}/${DESIGN_PICK_FILE}`);
  const pick = text === undefined ? undefined : parseDesignPick(text);
  return pick === undefined ? undefined : designPickLine(pick, design);
}
