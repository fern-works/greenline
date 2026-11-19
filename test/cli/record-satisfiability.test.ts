/**
 * The record satisfiability matrix (J-211 S3; the register's row of
 * 2026-11-05, "The keeper over the oracle"): for every mode the line ships
 * and for the interface fact both ways, a change opened with `greenline
 * open`, its skeleton's every placeholder replaced as an agent replaces it,
 * its fresh agents' reports, the interface check's runs where the change has
 * an interface and its check facts written where a real change writes them,
 * and set done in a commit carrying its trailer, passes both readers: the
 * record lint, the form git's hooks refuse done on, and `greenline status`,
 * which fails on a finding. No combination is unreachable, as
 * j196t-roster-use's careful interface change was until J-199 S1 (N-66, the
 * blocking table): the lint demanded the interface check's link beside the
 * verifier's reports and read the link as a report.
 *
 * The modes are read from the shipped definition, so a mode added to it
 * joins the matrix, and each cell names its mode and its interface answer.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ok } from "../../src/commons/result.ts";
import { parseModes, type Mode, type ModesDefinition } from "../../src/core/modes.ts";
import { recordBreaches } from "../../src/core/record-lint.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runOpenCli } from "../../src/shell/cli/open.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const installation = fixtureInstallation();
const cleanup: string[] = [];
afterAll(() => {
  for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true });
});

const definition = ((): ModesDefinition => {
  const path = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
})();

/** The interface check's two runs a change with an interface keeps under its folder. */
const RUNS = [
  "interface/20261109T120000000Z-a1b2c3.json",
  "interface/20261109T121500000Z-d4e5f6.json",
];

interface Repository {
  readonly root: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, text: string) => void;
}

/** A real repository with greenline installed and committed, before any change. */
function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "record-satisfiability-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("members.ts", "export const members = [];\n");
  const rec = new RecordingWriter();
  if (runCli(["init", "--yes"], rec.writer, VERSION, { cwd: root, version: VERSION, installation }))
    throw new Error(`init failed: ${rec.err}`);
  git("add", "--all");
  git("commit", "--quiet", "--no-verify", "-m", "install greenline");
  return { root, git, write };
}

function cli(root: string, args: readonly string[]) {
  const rec = new RecordingWriter();
  const code = runCli([...args], rec.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation,
    environment: {},
  });
  return { code, out: rec.out, err: rec.err };
}

/** A step's depth in a mode, as the definition gives it. */
function depthOf(mode: Mode, step: string) {
  const depth = Object.entries(mode.steps).find(([name]) => name === step)?.[1];
  if (depth === undefined) throw new Error(`${mode.name} gives ${step} no depth`);
  return depth;
}

/** Whether a step runs for a change with the interface answer given. */
function applies(step: string, touches: boolean): boolean {
  return (
    definition.steps.find((entry) => entry.name === step)?.appliesWhen !== "interface" || touches
  );
}

/** The fresh agents a step starts in a mode, for a change with the interface answer given. */
function agentsOf(mode: Mode, step: string, touches: boolean): number {
  const depth = depthOf(mode, step);
  return applies(step, touches) && depth.depth === "independent" ? depth.agents : 0;
}

/** The starts a change names: each fresh agent of each step, `<step> <n>`, in the line's order. */
function startsOf(mode: Mode, touches: boolean): readonly string[] {
  return definition.steps.flatMap((step) =>
    Array.from(
      { length: agentsOf(mode, step.name, touches) },
      (_, at) => `${step.name} ${String(at + 1)}`,
    ),
  );
}

/**
 * How a done record links the interface check's runs, both forms the lint
 * admits (J-199 S1): each run by its path, or all at once by the folder's.
 */
type CheckLink = "runs" | "folder";

/** A step's section as an agent writes it at its depth: the reports it cites where fresh agents ran it, the check's runs beside the verifier's on an interface change. */
function sectionOf(
  id: string,
  mode: Mode,
  step: string,
  touches: boolean,
  link: CheckLink,
): readonly string[] {
  if (!applies(step, touches)) return ["none, no interface"];
  const depth = depthOf(mode, step);
  const components = step === "design" ? ["components: form, table", ""] : [];
  // A careful frame asks or closes every subject node with a reason (J-223 S1).
  const nodes =
    step === "frame" && mode.name === "careful"
      ? [
          "- closed [purpose, scope, adjacent, journey, surface, data]: the members list alone, as CSV",
          "- closed [behaviour, security, performance, operations, verification, constraints]: the export's tests",
        ]
      : [];
  const check =
    step !== "verify" || !touches
      ? []
      : link === "folder"
        ? [`The [interface check](${id}/interface/) ran twice.`]
        : [
            `The interface check ran twice: ${RUNS.map((run) => `[${run}](${id}/${run})`).join(" and ")}.`,
          ];
  switch (depth.depth) {
    case "none":
      return [`none at ${mode.name}`];
    case "inline":
      // An inline step's section is one line, its components and its check's runs on it.
      return [
        [
          `The ${step} for the members export, written by the builder`,
          ...(step === "design" ? ["components: form, table"] : []),
          ...check,
        ].join("; "),
      ];
    case "independent":
      return [
        ...components,
        `The ${step} by fresh agents: ${Array.from(
          { length: depth.agents },
          (_, at) => `[report ${String(at + 1)}](${id}/${step}-${String(at + 1)}.md)`,
        ).join(" and ")}.`,
        ...check,
      ];
    default:
      return [
        ...components,
        `The ${step} for the members export, written by the builder.`,
        ...nodes,
        ...check,
      ];
  }
}

/** The record the open wrote with each placeholder replaced as an agent replaces it, set done. */
function filled(
  skeleton: string,
  id: string,
  mode: Mode,
  touches: boolean,
  link: CheckLink,
): string {
  const starts = startsOf(mode, touches);
  const lines = new Map<string, string>(
    Object.entries({
      mode: `mode: ${mode.name}`,
      choice: "choice: accepted",
      yes: 'yes: "Yes, go ahead."',
      // The owner's words that confirmed a careful frame, the line its skeleton names (J-223 S1).
      confirmed: 'confirmed: "Yes, that is what I want."',
      why: 'why: "the members list exports as CSV"',
      // The floors line, owed from the open in every mode (J-226 S1).
      floors: "floors: none",
      state: "state: done",
      next: "next: none",
      ground: "ground: branch",
      agent: 'agent: "claude-code/claude-opus-5-5"',
      interface: touches ? 'interface: "yes, app"' : "interface: no",
      skills: "skills: [frame, build, verify, close]",
      agents: `agents: ${String(1 + starts.length)}`,
      rounds: "rounds: 1",
      starts: `starts: [${starts.map((start) => `"${start}"`).join(", ")}]`,
      outcome: 'outcome: "The members list exports as CSV."',
    }),
  );
  const [, front = "", body = ""] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(skeleton) ?? [];
  const keys = front.split("\n").map((line) => /^([a-z]+):/.exec(line)?.[1] ?? line);
  // The interface line stands where the workspace names interface roots; the answer is the agent's either way.
  const head = [...keys, ...(keys.includes("interface") ? [] : ["interface"])].map((key) => {
    const replaced = lines.get(key);
    if (replaced === undefined) throw new Error(`the skeleton's line ${key} has no filler`);
    return replaced;
  });
  const sections = body
    .split(/^(?=## )/m)
    .filter((section) => section.startsWith("## "))
    .flatMap((section) => {
      const heading = /^## (\S+)/.exec(section)?.[1] ?? "";
      const step = definition.steps.find((entry) => entry.name === heading);
      // A kind's section, a start's, is left out where none began the change.
      if (step === undefined) return [];
      return [`## ${heading}`, "", ...sectionOf(id, mode, heading, touches, link), ""];
    });
  return ["---", ...head, "---", "", ...sections].join("\n");
}

/**
 * One cell's change carried to done as a real change is: opened with
 * `greenline open`, committed, the work done, the fresh agents' reports and,
 * on an interface change, the check's runs kept in its folder, the record
 * filled and set done, a check run through `greenline check`, and the done
 * commit made with its trailer; then read by the record lint, with the
 * folder as status reads it, and by `greenline status`.
 */
async function reach(mode: Mode, touches: boolean, link: CheckLink) {
  const { root, git, write } = repository();
  const id = `2026-11-09-${mode.name}-${touches ? "interface" : "plain"}`;
  const record = `.greenline/ledger/${id}.md`;
  const opening = new RecordingWriter();
  const opened = runOpenCli(["--change", id, "--mode", mode.name], opening.writer, {
    cwd: root,
    installation: () => ok(installation),
  });
  expect(opened, opening.err).toBe(0);
  const skeleton = readFileSync(join(root, record), "utf8");
  git("add", "--all");
  git("commit", "--quiet", "--no-verify", "-m", `open ${id}\n\nGreenline-Change: ${id}`);
  write("members.ts", "export const members = [];\nexport const csv = () => '';\n");
  const reports = definition.steps.flatMap((step) =>
    Array.from(
      { length: agentsOf(mode, step.name, touches) },
      (_, at) => `${step.name}-${String(at + 1)}.md`,
    ),
  );
  for (const file of reports)
    write(`.greenline/ledger/${id}/${file}`, `# ${file}\n\nNo finding.\n`);
  if (touches) for (const run of RUNS) write(`.greenline/ledger/${id}/${run}`, "{}\n");
  const text = filled(skeleton, id, mode, touches, link);
  write(record, text);
  const checked = await runCheckCli(
    ["--change", id, "--", process.execPath, "-e", "process.exit(0)"],
    new RecordingWriter().writer,
    { cwd: root, installation: () => ok(installation), environment: process.env, stdio: "ignore" },
  );
  expect(checked).toBe(0);
  git("add", "--all");
  git("commit", "--quiet", "--no-verify", "-m", `the members export\n\nGreenline-Change: ${id}`);
  const breaches = recordBreaches({
    id,
    text,
    definition,
    loaded: [],
    owed: [],
    folder: { files: [...reports, ...(touches ? RUNS : [])], visuals: 0 },
  });
  return { breaches, status: cli(root, ["status", "--change", id]) };
}

/** The cells: every mode by the interface answer, yes and no. */
const CELLS = definition.modes.flatMap((mode) =>
  [true, false].map((touches) => ({ mode, touches })),
);

describe("J-211 S3 the record satisfiability matrix: every mode by the interface fact reaches done through the lint and status", () => {
  it("covers every mode of the shipped definition both ways", () => {
    expect(CELLS.map(({ mode, touches }) => `${mode.name} ${touches ? "yes" : "no"}`)).toEqual(
      definition.modes.flatMap((mode) => [`${mode.name} yes`, `${mode.name} no`]),
    );
    expect(CELLS.length).toBeGreaterThanOrEqual(6);
  });

  it.each(
    CELLS.map(({ mode, touches }) => [mode.name, touches ? "yes" : "no", mode, touches] as const),
  )(
    "%s with interface %s: the record the open wrote, filled and set done, passes the record lint and greenline status",
    async (_name, _answer, mode, touches) => {
      const reached = await reach(mode, touches, "runs");
      expect(reached.breaches).toEqual([]);
      // Status: no finding, so it exits zero, and no form of the record named.
      expect(reached.status.code, reached.status.err + reached.status.out).toBe(0);
      expect(reached.status.err + reached.status.out).not.toMatch(/GL0\d+|correct the done change/);
    },
  );

  // The defect this matrix found (J-211 S3), cured by J-218 S1: the lint
  // admits the interface check's runs linked all at once by the folder's
  // link, as its own remedy names it, and status reads that link as citing
  // the files under it, so the done change passes both readers.
  it.each(CELLS.filter(({ touches }) => touches).map(({ mode }) => [mode.name, mode] as const))(
    "%s with interface yes, the check's runs linked by the folder's link: passes the record lint and greenline status",
    async (_name, mode) => {
      const reached = await reach(mode, true, "folder");
      expect(reached.breaches).toEqual([]);
      expect(reached.status.code, reached.status.err + reached.status.out).toBe(0);
      expect(reached.status.err + reached.status.out).not.toMatch(/GL0\d+|correct the done change/);
    },
  );
});
