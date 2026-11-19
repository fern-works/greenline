import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import {
  countsOf,
  KEPT_RULE,
  withWaivers,
  type InterfaceFinding,
  type RecordWaiver,
  type Unmeasured,
} from "../core/interface-check.ts";
import type { Component, FacetsInPlay, Register } from "../core/interface-facets.ts";
import {
  BOXES_SUFFIX,
  repositoryPathOf,
  type CaptureBoxes,
  type WidthBoxes,
} from "../core/interface-boxes.ts";
import {
  parsePaths,
  PATHS_FILE,
  serializeHomeFile,
  type PathEntry,
} from "../core/interface-home.ts";
import {
  fidelityOf,
  KEPT_FILE,
  keptMissing,
  parseKept,
  unionInventory,
  withKeptRoute,
  withPathEntry,
  type KeptList,
} from "../core/interface-kept.ts";
import {
  allUnmeasured,
  CAPTURE_SIZES,
  FLOOR_SIZE,
  homeDeclaresDark,
  homeLadder,
  judgeRender,
  type RenderRun,
} from "../core/interface-render.ts";
import type { InterfaceRulings } from "../core/interface-rulings.ts";
import type { InterfaceSetting } from "../core/manifest.ts";
import {
  INTERFACE_VISUALS,
  MANIFEST_SUFFIX,
  parseVisualManifest,
  VISUAL_SCHEMA,
  VISUALS_HOME,
  type VisualManifest,
} from "../core/visuals.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { pageHome } from "./interface.ts";
import { driveRoute, type CapturedImage, type DriveResult } from "./interface-render.ts";
import { captureLimitOf, type CaptureLimit, type LimitStage } from "../core/interface-check.ts";

/**
 * A address checked as it renders (J-123 S5; design's capture page): the
 * render engine's judges on the address, the captures kept as a visual of the
 * form `capture` under the change's folder in the visual home with its
 * manifest, the path index's entry for the address with its scores and the
 * fidelity read, and on a redesign the kept list, written from the before
 * and checked against the after. A missing kept entry is the finding
 * `kept-list`, red as a floor, since the owner records a loss the redesign
 * means in the list itself.
 */

/** The finding a missing kept entry is. */
/** What the home files this writes name as their writer. */
const GENERATED_BY = "greenline check interface";

/** What a address's check needs. */
export interface RouteRequest {
  readonly root: string;
  /** The open change, whose folder takes the captures and the kept list; undefined writes neither, unless the owner captures. */
  readonly change: string | undefined;
  /**
   * Whether the owner asked for this capture from the viewer (J-124 S1):
   * with no change open it is kept under `interface/` in the visual home,
   * as the owner's own act, and the kept list is never written.
   */
  readonly owner?: boolean;
  /** The capture ids a mark names, which a new capture never overwrites (J-124 S2). */
  readonly marked?: ReadonlySet<string>;
  readonly setting: InterfaceSetting;
  readonly rulings: InterfaceRulings;
  readonly components: readonly Component[] | undefined;
  readonly waivers: readonly RecordWaiver[];
  /** The running page's origin, such as http://localhost:3000. */
  readonly origin: string;
  /** The page's address under the origin, starting with '/'. */
  readonly address: string;
  /** The interface files the change touched, which the capture covers. */
  readonly files: readonly string[];
  /** The commit HEAD names, or undefined where none. */
  readonly commit: string | undefined;
  readonly at: string;
  readonly environment: NodeJS.ProcessEnv;
}

/** What a address's check found and wrote. */
export interface RouteResult {
  /** The render's findings and the kept check's, with the waivers applied. */
  readonly findings: readonly InterfaceFinding[];
  readonly unmeasured: readonly Unmeasured[];
  readonly widths: readonly number[];
  /** Why no browser ran, where none did. */
  readonly browser: string | undefined;
  /** The capture's limit, where none was made: its cause, the origin tried and the time (J-191 S1). */
  readonly limit?: CaptureLimit | undefined;
  /** One line per file written or check made. */
  readonly lines: readonly string[];
  /** The capture kept, by its visual id, where one was (J-124 S1). */
  readonly capture?: string | undefined;
}

/** The kept check's count: the entries checked and the ones missing. */
interface KeptCount {
  readonly checked: number;
  readonly missing: number;
}

/** A address as a slug: `/` is `home`, `/pricing/plans` is `pricing-plans`. */
function routeSlug(address: string): string {
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "home" : slug;
}

/**
 * The slug a new capture of an address takes in its folder: the address's
 * own, unless a capture a mark names or another address's capture stands
 * there, which is never overwritten, so the next free take is used
 * (`-2`, `-3`, ...) (J-124 S2: a mark's capture stays its before).
 */
function freeSlug(
  root: string,
  home: string,
  address: string,
  base: string,
  marked: ReadonlySet<string> | undefined,
): string {
  for (let take = 1; ; take += 1) {
    const slug = take === 1 ? base : `${base}-${String(take)}`;
    const text = textAt(root, `${VISUALS_HOME}/${home}/${slug}${MANIFEST_SUFFIX}`);
    if (text === undefined) return slug;
    const standing = parseVisualManifest(text, slug);
    const same = standing._tag === "ok" && standing.value.capture?.address === address;
    if (same && marked?.has(`${home}/${slug}`) !== true) return slug;
  }
}

/** A width's boxes with each source file made a path from the root where it names one inside it. */
function withRepositorySources(entry: WidthBoxes, root: string): WidthBoxes {
  const base = root.split(sep).join("/");
  return {
    ...entry,
    elements: entry.elements.map((element) => {
      if (element.source === null) return element;
      const path = repositoryPathOf(element.source.file, base);
      return path === undefined
        ? element
        : { ...element, source: { ...element.source, file: path } };
    }),
  };
}

/** The files a capture covers: the change's interface files and every source file its boxes name that the repository holds. */
function coveredFiles(
  root: string,
  files: readonly string[],
  boxes: readonly WidthBoxes[],
): readonly string[] {
  const covered = new Set(files);
  for (const entry of boxes)
    for (const element of entry.elements) {
      const file = element.source?.file;
      if (file !== undefined && !file.startsWith("/") && existsSync(join(root, file)))
        covered.add(file);
    }
  return [...covered].sort();
}

/** The register in play at a address: the one the rulings give every root, where they agree. */
function registerOf(rulings: InterfaceRulings): Register | undefined {
  const registers = [...new Set(rulings.registers.map((entry) => entry.register))];
  return registers.length === 1 ? registers[0] : undefined;
}

/** A file's text, or undefined. */
function textAt(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Drive the page; a browser that starts and then cannot read it leaves the
 * render rules unmeasured, with why, as a missing one does.
 * @param url the page's whole address
 * @param dark whether the dark reads run
 * @param environment the process environment
 * @returns what the browser read, or why it read nothing
 */
async function driveOrWhy(
  url: string,
  dark: boolean,
  environment: NodeJS.ProcessEnv,
): Promise<DriveResult> {
  try {
    return await driveRoute(url, dark, environment);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { kind: "no-browser", stage: "read", reason: why };
  }
}

/** A drive's limit and the browser's words for it, which the fact keeps side by side. */
interface DriveLimit {
  readonly limit: CaptureLimit;
  readonly browser: string;
}

/**
 * The capture's limit and the browser's words for it, from a drive that read nothing.
 * @param driven the drive's failure
 * @param request the address and its origin
 * @param url the page's whole address
 * @returns the limit, and the words the fact's browser field keeps
 */
function limitOfDrive(
  driven: { readonly stage: LimitStage; readonly reason: string },
  request: RouteRequest,
  url: string,
): DriveLimit {
  const limit = captureLimitOf({
    stage: driven.stage,
    reason: driven.reason,
    origin: request.origin,
    address: request.address,
    at: request.at,
  });
  const browser =
    driven.stage === "find"
      ? driven.reason
      : driven.stage === "launch"
        ? `the browser did not start: ${driven.reason}`
        : `the browser could not read ${url}: ${driven.reason}`;
  return { limit, browser };
}

/**
 * The commit the path index goes in (J-228 S1, the run j217c-roster-use,
 * whose close's commit left the index out and whose tree stayed dirty): the
 * change's record's, which git's pre-commit admits it beside, before done
 * and after.
 */
const PATHS_COMMIT =
  "it is the workspace's record, never ignored: commit it with the change's record or its folder, before done or after, and never beside code after done";

/**
 * Write the capture's limit into the address's entry of the path index
 * (J-191 S1), so the Interface view shows it beside the captures; a later
 * capture of the address clears it.
 * @returns the line naming what was written
 */
function writeLimitEntry(
  root: string,
  address: string,
  register: Register | undefined,
  limit: CaptureLimit,
): string {
  const pathsText = textAt(root, PATHS_FILE);
  const index = pathsText === undefined ? undefined : parsePaths(pathsText);
  if (index?._tag === "err")
    return `path index: ${PATHS_FILE} does not read, so it is left as it is`;
  const standing = index?.value.paths.find((entry) => entry.address === address);
  const entry: PathEntry = {
    ...standing,
    address,
    register: standing?.register ?? register,
    limit,
  };
  const written = atomicWriteFile(
    join(root, PATHS_FILE),
    serializeHomeFile(withPathEntry(index?.value, entry, GENERATED_BY)),
  );
  return written._tag === "ok"
    ? `path index: the limit on ${address} in ${PATHS_FILE}; ${PATHS_COMMIT}`
    : `path index: ${PATHS_FILE} could not be written`;
}

/** Whether the change's record starts from the redesign, so its before writes the kept list. */
export function redesigning(root: string, change: string): boolean {
  const record = textAt(root, `.greenline/ledger/${change}.md`) ?? "";
  // The start section alone, from its heading to the next second-level one.
  const start = /^## start\b[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(record);
  return start !== null && /\bredesign\b/.test(start[1] ?? "");
}

/** HTML's special characters escaped. */
function escaped(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One image a capture's page holds, as its figure names it. */
export interface PageImage {
  readonly width: number;
  readonly part: string;
  readonly scheme: string;
  readonly motion: string;
  readonly dataUrl: string;
}

/**
 * The images a capture's page holds, each by the figure that names its
 * width, part, scheme and motion (J-124 S1: the capture view shows the full
 * page at a width under its boxes); a page written before the figures named
 * them holds none this reads.
 * @param html the capture's page
 * @returns its images in order
 */
export function captureImages(html: string): readonly PageImage[] {
  const figure =
    /<figure data-width="(\d+)" data-part="([^"]+)" data-scheme="([^"]+)" data-motion="([^"]+)"><img src="(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)"/g;
  return [...html.matchAll(figure)].map((found) => ({
    width: Number(found[1]),
    part: found[2] ?? "",
    scheme: found[3] ?? "",
    motion: found[4] ?? "",
    dataUrl: found[5] ?? "",
  }));
}

/** The capture's page: each image with what it shows, no browser bar and no device frame. */
function capturePage(
  address: string,
  commit: string,
  images: readonly CapturedImage[],
  summary: string,
): string {
  const figures = images
    .map((image) => {
      const caption = `${String(image.width)} wide, ${image.part}, ${image.scheme}${image.motion === "reduce" ? ", reduced motion" : ""}`;
      return `<figure data-width="${String(image.width)}" data-part="${image.part}" data-scheme="${image.scheme}" data-motion="${image.motion}"><img src="${image.dataUrl}" alt="${escaped(`${address} at ${caption}`)}" width="${String(image.width)}" /><figcaption>${escaped(caption)}</figcaption></figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escaped(`Capture of ${address}`)}</title>
<style>
body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, sans-serif; color: #1c1c1a; background: #f6f6f4; }
figure { margin: 0 0 32px; }
img { display: block; max-width: 100%; height: auto; border: 1px solid #d4d4d0; }
figcaption { margin-top: 8px; font-size: 14px; color: #4a4a46; }
</style>
</head>
<body>
<h1>${escaped(`Capture of ${address} at ${commit.slice(0, 12)}`)}</h1>
<p>${escaped(summary)}</p>
${figures}
</body>
</html>
`;
}

/**
 * Check one address as it renders, and keep what it captured.
 * @param request the address and what reads it
 * @returns the findings with the waivers applied, the rules unmeasured and the files written
 */
export async function checkRoute(request: RouteRequest): Promise<RouteResult> {
  const { root, change, address } = request;
  const design = pageHome(root);
  const register = registerOf(request.rulings);
  const play: FacetsInPlay = {
    register: register === undefined ? undefined : [register],
    platform: request.setting.platform,
    frameworks: request.setting.frameworks,
    components: request.components,
  };
  const url = `${request.origin.replace(/\/+$/, "")}${address}`;
  const dark = homeDeclaresDark(design);
  const driven = await driveOrWhy(url, dark, request.environment);
  if (driven.kind === "no-browser") {
    const { limit, browser } = limitOfDrive(driven, request, url);
    return {
      findings: [],
      unmeasured: allUnmeasured(
        play,
        `no browser ran: ${browser}; the floor stands as checked statically`,
      ),
      widths: [],
      browser,
      limit,
      lines: [
        `interface render: ${browser}; the render rules are unmeasured and the floor stands as checked statically`,
        writeLimitEntry(root, address, register, limit),
      ],
    };
  }
  const { drive } = driven;
  const run: RenderRun = {
    address,
    variants: drive.variants,
    focus: drive.focus,
    focusables: drive.focusables,
    console: drive.console,
    homeDark: dark,
    register,
    ladder: homeLadder(design),
  };
  const judged = judgeRender(run, play);
  const lines: string[] = [];
  const kept: InterfaceFinding[] = [];
  let keptCount: KeptCount | undefined;
  let before = false;
  if (change !== undefined) {
    const keptPath = `.greenline/ledger/${change}/${KEPT_FILE}`;
    const keptText = textAt(root, keptPath);
    const parsed = keptText === undefined ? undefined : parseKept(keptText, keptPath);
    const list: KeptList | undefined = parsed?._tag === "ok" ? parsed.value : undefined;
    if (parsed?._tag === "err")
      lines.push(
        `kept list: ${keptPath} does not read, so no kept check ran: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    const inventory = unionInventory(
      drive.variants
        .filter((variant) => variant.kind === "base")
        .map((variant) => variant.snapshot.inventory),
    );
    const standing = list?.addresses.find((entry) => entry.address === address);
    if (standing !== undefined) {
      const missing = keptMissing(standing, inventory);
      for (const entry of missing)
        kept.push({
          rule: KEPT_RULE,
          tier: "floor",
          path: address,
          line: 0,
          detail: `the kept ${entry.kind} entry "${entry.entry}" is gone`,
        });
      const checked = [
        standing.links,
        standing.fields,
        standing.actions,
        standing.handlers,
        standing.testHooks,
        standing.ids,
        standing.headings,
      ].reduce((sum, entries) => sum + entries.length, 0);
      keptCount = { checked, missing: missing.length };
      lines.push(
        `kept check: ${String(checked - missing.length)} of ${String(checked)} kept entries stand on ${address}`,
      );
    } else if (parsed?._tag !== "err" && (list !== undefined || redesigning(root, change))) {
      before = true;
      const written = atomicWriteFile(
        join(root, keptPath),
        `${JSON.stringify(withKeptRoute(list, address, inventory, GENERATED_BY), null, 2)}\n`,
      );
      lines.push(
        written._tag === "ok"
          ? `kept list: the before of ${address} written to ${keptPath}`
          : `kept list: ${keptPath} could not be written: ${written.error.message}`,
      );
    }
  }
  const findings = withWaivers([...judged.findings, ...kept], request.waivers, request.rulings);
  const counts = countsOf(findings);
  const scores = { floor: counts.floor, reflex: counts.reflex, finish: counts.finish };
  const widths = [...CAPTURE_SIZES.map((size) => size.width), FLOOR_SIZE.width];
  const capturedWidths = CAPTURE_SIZES.map((size) => size.width);
  let capture: PathEntry["capture"] = undefined;
  let keptId: string | undefined;
  const home = change ?? (request.owner === true ? INTERFACE_VISUALS : undefined);
  if (home !== undefined && request.commit !== undefined) {
    const folder = `${VISUALS_HOME}/${home}`;
    const slug = freeSlug(
      root,
      home,
      address,
      `capture-${routeSlug(address)}${before ? "-before" : ""}`,
      request.marked,
    );
    const summary = `${address} at ${capturedWidths.join(", ")}: floor ${String(scores.floor)} red, reflex ${String(scores.reflex)} red, finish ${String(scores.finish)}`;
    const widthBoxes = drive.boxes.map((entry) => withRepositorySources(entry, root));
    const manifest: VisualManifest = {
      schema: VISUAL_SCHEMA,
      title: `Capture of ${address}${before ? ", before" : ""}`,
      form: "capture",
      skill: before ? "redesign" : change === undefined ? "design" : "verify",
      change: change ?? null,
      commit: request.commit,
      files: coveredFiles(root, request.files, widthBoxes),
      made: request.at,
      summary,
      capture: { address, widths: capturedWidths, scores, kept: keptCount },
    };
    const boxes: CaptureBoxes = {
      generatedBy: request.owner === true ? "greenline inspect" : GENERATED_BY,
      address,
      commit: request.commit,
      at: request.at,
      widths: widthBoxes,
    };
    const page = atomicWriteFile(
      join(root, folder, `${slug}.html`),
      capturePage(address, request.commit, drive.images, summary),
    );
    const facts = atomicWriteFile(
      join(root, folder, `${slug}${MANIFEST_SUFFIX}`),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const boxed = atomicWriteFile(
      join(root, folder, `${slug}${BOXES_SUFFIX}`),
      `${JSON.stringify(boxes)}\n`,
    );
    if (page._tag === "ok" && facts._tag === "ok" && boxed._tag === "ok") {
      keptId = `${home}/${slug}`;
      capture = {
        visual: keptId,
        widths: capturedWidths,
        commit: request.commit,
        at: request.at,
      };
      lines.push(
        `capture: ${folder}/${slug}.html, ${String(drive.images.length)} images, with the boxes of ${String(widthBoxes.reduce((sum, entry) => sum + entry.elements.length, 0))} elements beside it`,
      );
    } else lines.push(`capture: the visual under ${folder} could not be written`);
  }
  const pathsText = textAt(root, PATHS_FILE);
  const index = pathsText === undefined ? undefined : parsePaths(pathsText);
  if (index?._tag === "err")
    lines.push(`path index: ${PATHS_FILE} does not read, so it is left as it is`);
  else {
    const entry: PathEntry = {
      address: address,
      register,
      capture,
      scores,
      fidelity: fidelityOf(design, drive.samples),
    };
    const written = atomicWriteFile(
      join(root, PATHS_FILE),
      serializeHomeFile(withPathEntry(index?.value, entry, GENERATED_BY)),
    );
    lines.push(
      written._tag === "ok"
        ? `path index: ${address} in ${PATHS_FILE}; ${PATHS_COMMIT}`
        : `path index: ${PATHS_FILE} could not be written`,
    );
  }
  return {
    findings,
    unmeasured: judged.unmeasured,
    widths,
    browser: undefined,
    lines,
    capture: keptId,
  };
}
