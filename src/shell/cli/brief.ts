import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "../../commons/result.ts";
import {
  AXES,
  BRIEF_STEPS,
  composeBrief,
  type Axis,
  type BriefRequest,
  type BriefStep,
} from "../../core/brief.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import type { Installation } from "../../core/installation.ts";
import { parseTicketsFile, type TicketsFile } from "../../core/plan-documents.ts";
import { listChangeRecords, scratchFolder } from "../changes.ts";
import { findGitRoot } from "../git.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";

/**
 * `greenline brief --change <id> --step review|verify --round <n>`
 * (`workshop/components/cli-contracts.md`, "The brief command",
 * `docs/SPEC.md` section 4): write the brief a fresh agent of the review or
 * the verify step is started with, from the change record, its acceptance
 * and the step's template, into the change's folder as
 * `brief-<step>-<n>.md`, its first line the command's mark, and print its
 * path, the one thing the builder hands the agent. The brief names the
 * agent's scratch folder by its absolute path, which the command makes. It
 * never writes over a brief that stands; a refusal writes nothing and exits
 * with the usage code.
 */

/** What the verb needs beyond its arguments. */
export interface BriefEnvironment {
  readonly cwd: string;
  /** The installation, read only once the arguments are valid, so help needs none. */
  readonly installation: () => Result<Installation, ContractParseFailed>;
}

const USAGE = [
  "Usage: greenline brief --change <id> --step review|verify --round <n> [--axis standards|spec] [--intent <paragraph>]",
  "",
  "Write the brief a fresh agent of the review or the verify step is started",
  "with, from the change record: its front matter, its acceptance (the plan",
  "section, a ticket's acceptance or the frame section), the change's id, the",
  "agent's report path and the skill page it reads whole, then the step's",
  "extras. The file is .greenline/ledger/<id>/brief-<step>-<n>.md, its first",
  "line the command's mark, and its path is printed: start the agent with that",
  "path and nothing else. The builder never opens, copies, diffs or derives a",
  "brief file, and status reports one the command did not write. A brief that",
  "stands is never written over.",
  "",
  "Options:",
  "  --change <id>         the open change the agent serves",
  "  --step <step>         review or verify",
  "  --round <n>           the agent's number at the independent depth, the",
  "                        round's at the looped depth",
  "  --axis <axis>         review's one axis where two agents review one after",
  "                        another: standards for the first, spec for the second",
  "  --intent <paragraph>  review's extra, the builder's paragraph of intent;",
  "                        required for review, refused for verify",
  "  -h, --help            show this help",
  "",
].join("\n");

/** A parsed invocation, or the reason it is refused. */
type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "write"; readonly request: BriefRequest }
  | { readonly kind: "refused"; readonly message: string };

const VALUED: readonly string[] = ["--change", "--step", "--round", "--axis", "--intent"];

function isStep(value: string): value is BriefStep {
  return BRIEF_STEPS.some((step) => step === value);
}

function isAxis(value: string): value is Axis {
  return AXES.some((axis) => axis === value);
}

function parseBriefArgs(argv: readonly string[]): Parsed {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index] ?? "";
    if (option === "--help" || option === "-h") return { kind: "help" };
    const value = argv[index + 1];
    if (!VALUED.includes(option))
      return { kind: "refused", message: `unknown argument '${option}'` };
    if (value === undefined || value === "")
      return { kind: "refused", message: `${option} needs a value` };
    if (values.has(option))
      return { kind: "refused", message: `${option} is given twice; give it once` };
    values.set(option, value);
    index += 1;
  }
  const change = values.get("--change");
  const step = values.get("--step");
  const round = values.get("--round");
  const axis = values.get("--axis");
  if (change === undefined || step === undefined || round === undefined)
    return { kind: "refused", message: "--change, --step and --round are required" };
  if (!isStep(step))
    return {
      kind: "refused",
      message: `the command writes the briefs of ${BRIEF_STEPS.join(" and ")}, not '${step}'; anticipate's brief stays the builder's`,
    };
  if (!/^[1-9]\d*$/.test(round))
    return { kind: "refused", message: `--round is a whole number from 1, not '${round}'` };
  if (axis !== undefined && !isAxis(axis))
    return { kind: "refused", message: `--axis is ${AXES.join(" or ")}, not '${axis}'` };
  return {
    kind: "write",
    request: { change, step, round: Number(round), axis, intent: values.get("--intent") },
  };
}

/** The tickets file of the record's plan, when the record names a ticket and the file parses. */
function ticketsOf(
  root: string,
  installation: Installation,
  plan: string | undefined,
): TicketsFile | undefined {
  if (plan === undefined) return undefined;
  const path = join(root, ".greenline", "plans", plan, "tickets.md");
  try {
    const parsed = parseTicketsFile(installation.modes, "tickets.md", readFileSync(path, "utf8"));
    return parsed._tag === "ok" ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

/** The installed paths of the page the step's agent reads whole, in each harness tree that holds it. */
function skillPages(root: string, step: BriefStep): readonly string[] {
  const page = step === "review" ? "review/references/brief.md" : "verify/SKILL.md";
  return [".claude/skills", ".agents/skills"]
    .map((tree) => `${tree}/${page}`)
    .filter((path) => existsSync(join(root, path)));
}

/**
 * Run `greenline brief`.
 * @param argv the arguments after `brief`
 * @param writer greenline's own streams: the path on stdout, the rest on stderr
 * @param env where it runs and what it reads
 * @returns 0 when the brief is written, 2 for a refusal, 1 when greenline itself failed
 */
export function runBriefCli(
  argv: readonly string[],
  writer: CliWriter,
  env: BriefEnvironment,
): number {
  const refuse = (message: string): number => {
    writer.stderr.write(`greenline brief: ${message}\n`);
    return EXIT_USAGE;
  };
  const failed = (message: string): number => {
    writer.stderr.write(`greenline brief: ${message}\n`);
    return EXIT_FAILURE;
  };
  const parsed = parseBriefArgs(argv);
  if (parsed.kind === "help") {
    writer.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (parsed.kind === "refused") return refuse(parsed.message);
  const { request } = parsed;
  const root = findGitRoot(env.cwd);
  if (root === undefined) return refuse("brief runs inside a Git repository");
  const installation = env.installation();
  if (installation._tag === "err")
    return failed(
      `the installation is unavailable, so the modes cannot be read (GL0140): ${installation.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  const listed = listChangeRecords(root, installation.value.modes);
  if (listed._tag === "err") return failed(listed.error.issues[0]?.message ?? "unreadable ledger");
  const entry = listed.value.find((candidate) => candidate.id === request.change);
  if (entry === undefined)
    return refuse(`no change record '${request.change}' in .greenline/ledger/`);
  if (entry.record._tag === "err" || entry.text === undefined)
    return refuse(
      `the change record '${entry.id}' does not parse: ${
        entry.record._tag === "err"
          ? entry.record.error.issues
              .map((issue) =>
                issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`,
              )
              .join("; ")
          : "unreadable"
      }`,
    );
  const record = entry.record.value;
  const scratch = scratchFolder(root, entry.id, request.step, request.round);
  const brief = composeBrief(request, {
    definition: installation.value.modes,
    record,
    recordText: entry.text,
    tickets: ticketsOf(
      root,
      installation.value,
      record.belongs?.ticket === undefined ? undefined : record.belongs.plan,
    ),
    skillPages: skillPages(root, request.step),
    scratch,
  });
  if (brief._tag === "refused") return refuse(brief.message);
  const path = join(root, brief.file);
  if (existsSync(path))
    return refuse(
      `${brief.file} already stands, and a brief is never written over: start the agent with its path, a restarted agent included, since each number has one brief`,
    );
  try {
    mkdirSync(join(root, ".greenline", "ledger", entry.id), { recursive: true });
    // `wx`: the write fails rather than replace a brief that appeared since the check.
    writeFileSync(path, brief.text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    return failed(`${brief.file} could not be written: ${String(error)}`);
  }
  // The scratch folder the brief names stands before the agent starts.
  try {
    mkdirSync(scratch, { recursive: true });
  } catch (error) {
    return failed(
      `wrote ${brief.file}, but the scratch folder it names, ${scratch}, could not be made: ${String(error)}`,
    );
  }
  writer.stdout.write(`${brief.file}\n`);
  writer.stderr.write(
    `greenline brief: wrote ${brief.file}; start the agent with this path and nothing else\n`,
  );
  return EXIT_OK;
}
