import { z } from "zod";
import { parseJson } from "./contract.ts";
import type { Framework, Platform } from "./interface-facets.ts";

/**
 * The interface a workspace already has, detected from its files (J-123 S1;
 * N-62, "How the agent knows which facets are in play"): the roots that hold
 * its interface files and the extensions under them, the platform and the
 * frameworks, each with the evidence that named it. init and sync write the
 * detection into the manifest's interface block, and the owner confirms it
 * through cards once. The module is pure: the shell lists the files and reads
 * the two configuration files.
 */

/** What the detection reads: the repository's files from the root, and the text of the two files that name a stack. */
export interface DetectionInput {
  /** Every file of the repository, from the root, `/`-separated. */
  readonly files: readonly string[];
  /** `package.json` at the root, where it stands. */
  readonly packageJson?: string | undefined;
  /** `pubspec.yaml` at the root, where it stands. */
  readonly pubspec?: string | undefined;
}

/** The interface found: its roots, the extensions under them, its platform and frameworks, and why each was named. */
export interface InterfaceDetection {
  readonly roots: readonly string[];
  readonly extensions: readonly string[];
  readonly platform: Platform;
  readonly frameworks: readonly Framework[];
  /** One line per fact, `<fact>: <what named it>`, in the order the facts were found. */
  readonly evidence: readonly string[];
}

/** The extensions of the files an interface is made of: markup, styles and the components that render them. */
const INTERFACE_EXTENSIONS = [
  "astro",
  "css",
  "dart",
  "html",
  "jsx",
  "kt",
  "less",
  "sass",
  "scss",
  "svelte",
  "swift",
  "tsx",
  "vue",
] as const;

/** Directories no interface root lies in: dependencies, builds, the tests and greenline's own. */
const SKIPPED = new Set([
  ".git",
  ".greenline",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "test",
  "tests",
  "vendor",
  "__tests__",
]);

/** The dependency names that name a framework, in the order the frameworks are listed. */
const DEPENDENCY_FRAMEWORKS: readonly (readonly [string, Framework])[] = [
  ["next", "next"],
  ["nuxt", "nuxt"],
  ["astro", "astro"],
  ["@sveltejs/kit", "svelte"],
  ["svelte", "svelte"],
  ["react-native", "react-native"],
  ["expo", "react-native"],
  ["react", "react"],
  ["vue", "vue"],
  ["tailwindcss", "tailwind"],
  ["unocss", "unocss"],
];

const TAILWIND_CONFIG = /^tailwind\.config\.(?:js|cjs|mjs|ts)$/;
const TOKENS_FILE = /(?:^|\/)(?:design-)?tokens\.json$|\.tokens\.json$/;
const COMPONENTS_DIRECTORY = /(?:^|\/)components\//;

const packageSchema = z.looseObject({
  dependencies: z.record(z.string(), z.string()).optional().catch(undefined),
  devDependencies: z.record(z.string(), z.string()).optional().catch(undefined),
});

/** The names a `package.json` depends on, development dependencies included. */
function dependencyNames(text: string | undefined): ReadonlySet<string> {
  if (text === undefined) return new Set();
  const parsed = packageSchema.safeParse(parseJson(text));
  if (!parsed.success) return new Set();
  return new Set([
    ...Object.keys(parsed.data.dependencies ?? {}),
    ...Object.keys(parsed.data.devDependencies ?? {}),
  ]);
}

/** A file's extension, lower case, or undefined where it has none. */
function extensionOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? undefined : name.slice(dot + 1).toLowerCase();
}

/**
 * Whether a path lies in a skipped directory or a dot-directory, where
 * dependencies, builds, tests, greenline's own files and the harnesses'
 * installed skills live, never the workspace's interface.
 * @param path the path from the root
 * @returns whether a directory on its way is one of them
 */
export function inSkippedFolder(path: string): boolean {
  return path
    .split("/")
    .slice(0, -1)
    .some((segment) => SKIPPED.has(segment) || segment.startsWith("."));
}

/**
 * Whether a file is an interface file by its extension, outside the skipped
 * directories and outside every dot-directory.
 */
function isInterfaceFile(path: string): boolean {
  const extension = extensionOf(path);
  if (extension === undefined || !INTERFACE_EXTENSIONS.some((known) => known === extension))
    return false;
  return !inSkippedFolder(path);
}

/** The root a file belongs to: its directory cut to two segments, `.` for a file at the root. */
function rootOf(path: string): string {
  const segments = path.split("/").slice(0, -1);
  return segments.length === 0 ? "." : segments.slice(0, 2).join("/");
}

/** The roots that hold the interface files, an inner root dropped where its parent is a root too. */
function rootsOf(files: readonly string[]): readonly string[] {
  const found = [...new Set(files.map(rootOf))].sort();
  // A file at the root makes the whole repository one root.
  if (found.includes(".")) return ["."];
  return found.filter(
    (root) => !found.some((other) => other !== root && root.startsWith(`${other}/`)),
  );
}

/** The frameworks, each once with its evidence, from the dependencies and the files. */
function frameworksOf(
  input: DetectionInput,
  dependencies: ReadonlySet<string>,
  interfaceFiles: readonly string[],
): readonly (readonly [Framework, string])[] {
  const found: (readonly [Framework, string])[] = [];
  const add = (framework: Framework, why: string): void => {
    if (!found.some(([name]) => name === framework)) found.push([framework, why]);
  };
  for (const [dependency, framework] of DEPENDENCY_FRAMEWORKS)
    if (dependencies.has(dependency)) add(framework, `package.json names ${dependency}`);
  // A meta-framework renders through its library.
  if (found.some(([name]) => name === "next" || name === "react-native"))
    add("react", "the framework renders with react");
  if (found.some(([name]) => name === "nuxt")) add("vue", "nuxt renders with vue");
  const config = input.files.find((path) => TAILWIND_CONFIG.test(path));
  if (config !== undefined) add("tailwind", `${config} stands at the root`);
  const swift = interfaceFiles.find((path) => path.endsWith(".swift"));
  if (swift !== undefined) add("swiftui", `${swift} is a Swift view`);
  const kotlin = interfaceFiles.find((path) => path.endsWith(".kt"));
  if (kotlin !== undefined) add("compose", `${kotlin} is a Kotlin view`);
  const module = interfaceFiles.find((path) => /\.module\.(?:css|scss|sass|less)$/.test(path));
  if (module !== undefined) add("css-modules", `${module} is a CSS module`);
  const style = interfaceFiles.find((path) => /\.(?:css|scss|sass|less)$/.test(path));
  const layered = found.some(
    ([name]) => name === "tailwind" || name === "unocss" || name === "css-modules",
  );
  if (style !== undefined && !layered) add("vanilla", `${style} is plain stylesheet`);
  return found;
}

/** The platform with its evidence: native targets and cross-platform stacks first, the web where nothing else names one. */
function platformOf(
  input: DetectionInput,
  dependencies: ReadonlySet<string>,
): readonly [Platform, string] {
  if (dependencies.has("react-native") || dependencies.has("expo"))
    return ["cross", "package.json names react-native or expo"];
  if (input.pubspec !== undefined && /^\s*flutter\s*:/m.test(input.pubspec))
    return ["cross", "pubspec.yaml names flutter"];
  if (dependencies.has("electron")) return ["desktop", "package.json names electron"];
  if (
    dependencies.has("@tauri-apps/api") ||
    input.files.some((path) => path.startsWith("src-tauri/"))
  )
    return ["desktop", "the workspace holds a Tauri app"];
  const ios = input.files.some((path) => path.startsWith("ios/") || path.includes(".xcodeproj/"));
  const android = input.files.some(
    (path) => path.startsWith("android/") || path.endsWith("AndroidManifest.xml"),
  );
  if (ios && android) return ["cross", "the workspace holds an iOS and an Android target"];
  if (ios) return ["ios", "the workspace holds an iOS target"];
  if (android) return ["android", "the workspace holds an Android target"];
  return ["web", "no native target or cross-platform stack is named"];
}

/**
 * Detect the workspace's interface: the roots holding its interface files,
 * the extensions there, its platform and frameworks. An interface exists only
 * where interface files stand and a framework, a style configuration, a
 * tokens file or a components directory says the files are one.
 * @param input the repository's files and its stack files
 * @returns the interface, or undefined where the workspace has none
 */
export function detectInterface(input: DetectionInput): InterfaceDetection | undefined {
  const interfaceFiles = input.files.filter(isInterfaceFile);
  if (interfaceFiles.length === 0) return undefined;
  const dependencies = dependencyNames(input.packageJson);
  const frameworks = frameworksOf(input, dependencies, interfaceFiles);
  const signals =
    frameworks.some(([name]) => name !== "vanilla") ||
    input.files.some((path) => TOKENS_FILE.test(path)) ||
    interfaceFiles.some((path) => COMPONENTS_DIRECTORY.test(path)) ||
    input.pubspec !== undefined;
  if (!signals) return undefined;
  const [platform, platformWhy] = platformOf(input, dependencies);
  const roots = rootsOf(interfaceFiles);
  const extensions = [...new Set(interfaceFiles.flatMap((path) => extensionOf(path) ?? []))].sort();
  return {
    roots,
    extensions,
    platform,
    frameworks: frameworks.map(([name]) => name),
    evidence: [
      `platform ${platform}: ${platformWhy}`,
      ...frameworks.map(([name, why]) => `${name}: ${why}`),
      `roots ${roots.join(", ")}: the interface files stand there`,
    ],
  };
}

/** The practice's own home, which no interface root covers: its captures are never page code. */
const PRACTICE_HOME = ".greenline";

/**
 * Whether a path is an interface file of the workspace: under one of its
 * roots, with one of its extensions, and outside `.greenline/` whole, the
 * visual home's captures among it, whatever the root (J-143 S3).
 * @param path the path from the root
 * @param roots the interface roots, `.` for the whole repository
 * @param extensions the interface extensions
 * @returns the root it lies under, or undefined
 */
export function interfaceRootOf(
  path: string,
  roots: readonly string[],
  extensions: readonly string[],
): string | undefined {
  if (path === PRACTICE_HOME || path.startsWith(`${PRACTICE_HOME}/`)) return undefined;
  const extension = extensionOf(path);
  if (extension === undefined || !extensions.includes(extension)) return undefined;
  return roots.find((root) => root === "." || path === root || path.startsWith(`${root}/`));
}
