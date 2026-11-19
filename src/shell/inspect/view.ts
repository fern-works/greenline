import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pageAddress } from "../../core/inspect-address.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "../cli/output.ts";
import { dealPath } from "../deal-view.ts";
import { findGitRoot } from "../git.ts";
import { readVisualsHome } from "../visuals.ts";
import { readServing } from "./address-file.ts";
import { pathOf } from "./app/addresses.ts";

/*
 * `greenline view <artefact>` (J-142 S1; `docs/SPEC.md` §4): print the
 * viewer's address of one artefact, so the agent pastes what it prints and
 * composes nothing. It reads the inspector's address file and, where no
 * viewer serves, starts `greenline inspect` detached on a free local port,
 * waits for its first answer, then prints. Every address is local.
 */

/** One kind of artefact the command names, with its arguments, as the SPEC lists them. */
export interface ViewKind {
  readonly kind: string;
  readonly args: readonly string[];
  /** What the address shows. */
  readonly shows: string;
}

/** Every artefact `greenline view` prints an address for, in the SPEC's order. */
export const VIEW_KINDS: readonly ViewKind[] = [
  {
    kind: "now",
    args: [],
    shows: "the desk: what waits on you, what is in progress, what changed",
  },
  { kind: "change", args: ["<change>"], shows: "the change page" },
  { kind: "waiting", args: ["<change>"], shows: "what the change waits on from you" },
  { kind: "step", args: ["<change>", "<step>"], shows: "one step of the change" },
  { kind: "frame", args: ["<change>"], shows: "the change's frame map" },
  {
    kind: "question",
    args: ["<change>", "<node>"],
    shows: "a node of the frame map, its questions",
  },
  { kind: "deal", args: ["<change>"], shows: "the deal view, with the ask of the last deal" },
  {
    kind: "specimen",
    args: ["<change>", "<name>"],
    shows: "one direction of the deal by its name",
  },
  {
    kind: "report",
    args: ["<change>", "<name>"],
    shows: "a report of the change's folder: design-1, review-1 (the critique), verify-1",
  },
  { kind: "visuals", args: [], shows: "every picture" },
  { kind: "visual", args: ["<change>", "<name>"], shows: "one durable picture of the change" },
  { kind: "captures", args: ["<change>"], shows: "the change's captures" },
  {
    kind: "capture",
    args: ["<change>", "<page>", "<width>"],
    shows: "the change's newest capture of a page, at a width",
  },
  { kind: "interfaces", args: [], shows: "the interface: its pages, its notes and its home" },
  { kind: "marks", args: [], shows: "every note on the captures by state" },
  { kind: "mark", args: ["<id>"], shows: "one note" },
  { kind: "discussion", args: ["<id>"], shows: "a discussion's page" },
  { kind: "loads", args: ["<change>"], shows: "the change's skill loads" },
  { kind: "roster", args: [], shows: "the roster and its use" },
];

const USAGE = [
  "Usage: greenline view <artefact> [<argument>...]",
  "",
  "Print the viewer's address of one artefact. Where greenline inspect is not",
  "serving, it starts one detached on a free local port first. Paste what it",
  "prints; never compose an address.",
  "",
  ...VIEW_KINDS.map((kind) => `  ${[kind.kind, ...kind.args].join(" ").padEnd(32)} ${kind.shows}`),
  "",
].join("\n");

/** A path, or why the arguments name none. */
type Resolved = { readonly path: string; readonly note?: string } | { readonly refused: string };

/** The newest capture of a page the change holds, by its visual id. */
function captureOf(root: string, change: string, page: string): string | undefined {
  return readVisualsHome(root)
    .flatMap((entry) => {
      if (entry.manifest._tag === "err") return [];
      const manifest = entry.manifest.value;
      return manifest.change === change &&
        manifest.form === "capture" &&
        manifest.capture?.address === page
        ? [{ id: entry.id, made: manifest.made }]
        : [];
    })
    .sort((a, b) => (a.made < b.made ? 1 : a.made > b.made ? -1 : 0))[0]?.id;
}

/**
 * The path one artefact shows at.
 * @param root the repository root
 * @param kind the artefact's kind
 * @param args its arguments
 * @returns the path, or why it names none
 */
export function viewPath(root: string, kind: string, args: readonly string[]): Resolved {
  const entry = VIEW_KINDS.find((candidate) => candidate.kind === kind);
  if (entry === undefined)
    return { refused: `'${kind}' is no artefact greenline view names; see greenline view --help` };
  if (args.length !== entry.args.length || args.some((arg) => arg.trim() === ""))
    return { refused: `greenline view ${[kind, ...entry.args].join(" ")}` };
  const [first = "", second = "", third = ""] = args;
  switch (kind) {
    case "now":
      return { path: pathOf({ page: "now" }) };
    case "change":
      return { path: pathOf({ page: "change", id: first, part: null }) };
    case "waiting":
      return { path: pathOf({ page: "change", id: first, part: "waiting" }) };
    case "step":
      return { path: pathOf({ page: "change", id: first, part: second }) };
    // The frame map's part is frame-map, so the frame step's own part, frame, keeps its section.
    case "frame":
      return { path: pathOf({ page: "change", id: first, part: "frame-map" }) };
    case "captures":
    case "loads":
      return { path: pathOf({ page: "change", id: first, part: kind }) };
    case "question":
      return { path: pathOf({ page: "change", id: first, part: "frame-map", anchor: second }) };
    case "deal":
      return { path: dealPath(root, first) };
    case "specimen":
      return { path: dealPath(root, first, second) };
    case "report":
      return {
        path: pathOf({
          page: "change",
          id: first,
          part: null,
          file: second.endsWith(".md") ? second : `${second}.md`,
        }),
      };
    case "visuals":
      return { path: pathOf({ page: "atlas", tab: "visuals" }) };
    case "visual":
      return { path: pathOf({ page: "picture", id: `${first}/${second}` }) };
    case "capture": {
      if (!/^[1-9]\d{1,4}$/.test(third))
        return {
          refused: `'${third}' is not a width; greenline view capture <change> <page> <width>`,
        };
      const id = captureOf(root, first, second);
      return id === undefined
        ? {
            path: pathOf({ page: "change", id: first, part: "captures" }),
            note: `no capture of ${second} under ${first}; the address shows the change's captures`,
          }
        : { path: `${pathOf({ page: "picture", id })}?width=${third}` };
    }
    case "interfaces":
      return { path: pathOf({ page: "atlas", tab: "interfaces" }) };
    case "marks":
      return { path: pathOf({ page: "marks" }) };
    case "mark":
      return { path: pathOf({ page: "mark", id: first }) };
    case "discussion":
      return { path: pathOf({ page: "discussion", id: first }) };
    default:
      return { path: pathOf({ page: "roster" }) };
  }
}

/** Where `greenline view` runs, and how it starts a viewer where none serves. */
export interface ViewEnvironment {
  readonly cwd: string;
  /** Start `greenline inspect` detached in the repository, on a free local port. */
  readonly start: (root: string) => void;
  /** How long to wait for the started viewer's first answer, and how often to look. */
  readonly wait?: { readonly timeoutMs: number; readonly stepMs: number };
}

/**
 * A starter that runs a CLI entry detached: `<node> <entry> inspect --port
 * 0`, its streams closed, so the viewer outlives the command.
 * @param entry the CLI's entry script
 * @returns the starter
 */
export function detachedStarter(entry: string): (root: string) => void {
  return (root) => {
    const child = spawn(process.execPath, [entry, "inspect", "--port", "0"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    // A start that fails leaves no address file, so the wait reports it and the command exits 1.
    child.on("error", () => undefined);
    child.unref();
  };
}

const settle = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Whether the viewer at a base address answers within two seconds. */
async function answers(base: string): Promise<boolean> {
  try {
    await fetch(base, { cache: "no-store", signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

/** The serving viewer's base address, once its file stands and it answers; undefined at the timeout. */
async function served(
  root: string,
  wait: { readonly timeoutMs: number; readonly stepMs: number },
): Promise<string | undefined> {
  const until = Date.now() + wait.timeoutMs;
  while (Date.now() < until) {
    const file = readServing(root);
    if (file !== undefined && (await answers(file.address))) return file.address;
    await settle(wait.stepMs);
  }
  return undefined;
}

/**
 * Run `greenline view`.
 * @param argv the arguments after `view`
 * @param writer the address to stdout, a refusal to stderr
 * @param env where it runs and how it starts a viewer
 * @returns 0 with the address printed, 2 for a usage error, 1 otherwise
 */
export async function runViewCli(
  argv: readonly string[],
  writer: CliWriter,
  env: ViewEnvironment,
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    (argv.length === 0 ? writer.stderr : writer.stdout).write(USAGE);
    return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
  }
  const root = findGitRoot(env.cwd);
  if (root === undefined || !existsSync(join(root, ".greenline", "manifest.json"))) {
    writer.stderr.write("greenline view: not a greenline workspace; run 'greenline init' first\n");
    return EXIT_FAILURE;
  }
  const [kind = "", ...args] = argv;
  const resolved = viewPath(root, kind, args);
  if ("refused" in resolved) {
    writer.stderr.write(`greenline view: ${resolved.refused}\n`);
    return EXIT_USAGE;
  }
  // A file whose process runs but whose address does not answer, a reused process id, counts as none serving.
  const standing = readServing(root)?.address;
  let base = standing !== undefined && (await answers(standing)) ? standing : undefined;
  if (base === undefined) {
    env.start(root);
    base = await served(root, env.wait ?? { timeoutMs: 15_000, stepMs: 100 });
  }
  if (base === undefined) {
    writer.stderr.write(
      "greenline view: the inspector did not answer within its wait; start it with 'greenline inspect' and run this again\n",
    );
    return EXIT_FAILURE;
  }
  if (resolved.note !== undefined) writer.stderr.write(`greenline view: ${resolved.note}\n`);
  writer.stdout.write(`${pageAddress(base, resolved.path)}\n`);
  return EXIT_OK;
}
