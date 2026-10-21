// The recipe instrument (workshop/components/recipes.md) and the fresh
// chain's writer (workshop/components/ledger.md), a thin entry over
// src/corpus/instrument.ts:
//
//   node scripts/corpus.mjs draft <skill> [--stub | --native]
//   node scripts/corpus.mjs render <skill>
//   node scripts/corpus.mjs verify [skill...]
//   node scripts/corpus.mjs measure [skill...]
//   node scripts/corpus.mjs budget [mode...] [--table]
//   node scripts/corpus.mjs record <entry.json>
//   node scripts/corpus.mjs views [--write]
//   node scripts/corpus.mjs refresh <source> --commit <sha> [--path <dir>]... [--any-branch] [--write]
//   node scripts/corpus.mjs refresh <source> --repo <url> --commit <sha> --licence <class> --path <dir>... [--any-branch] [--write]
//   node scripts/corpus.mjs intake <source> <path> [--slot <name>] [--against <skill>]...
//
// Each verb prints one JSON object and exits 1 on a refusal, a difference or
// a finding. `draft` proposes corpus/recipes/<skill>.json from the committed
// copy and its snapshot, every kind and reason left as the fill marker
// <<fill>>, and never rewrites a recipe; with --stub it
// proposes a stub, every passage written and the upstream skill credited; with
// --native it proposes a native skill's recipe, one written passage per
// top-level section, with no source.
// `render` writes corpus/skills/<skill>/ from
// corpus/recipes/<skill>.json and the frozen snapshots; `verify` compares,
// checks the chain under corpus/ledger/entries/ and that every recipe's
// latest change entry records it, and with no skill named that each
// committed view is its rendering, and reports each snapshot the manifest no
// longer pins, and never writes; `verify` and `measure`
// with no skill read every recipe on disk. `record` checks an entry against
// the chain and the tree and appends it last; `budget` totals, per mode,
// the agents, the rounds, the steps it runs and the words an agent reads
// there, from the installation this script compiles as the payload's build
// does, refuses a mode over its words budget without the operator's ruling
// in the modes recipe, and with --table prints the operator's table in place
// of the JSON object; `views` prints the index, the
// sources register and the notices, and writes them only with --write.
// `refresh` is the one verb that leaves the machine, and only with a commit
// named: it fetches the source at that commit, snapshots it beside the old
// snapshot and re-anchors every recipe that names it, listing every changed,
// inserted and removed segment; with --write it writes the snapshot, the
// re-anchored recipes, each listed place holding the fill marker, and the
// manifest's pin. With --repo, --licence and --path it adds a source the
// manifest does not hold, and touches no recipe. At the pinned commit it
// fetches nothing and writes nothing, unless --path names paths the pinned
// snapshot gains at that commit, every held byte kept. `intake` prints the comparison sheet of
// a skill directory in a source's snapshot beside each roster skill named,
// and writes nothing; with --slot and no --against, beside the slot's stack,
// the roster skills on that row of the line. `views` writes the line view
// with the others.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBudgetTable } from "../src/corpus/budget.ts";
import {
  budgetVerb,
  draftVerb,
  intakeVerb,
  measureVerb,
  frontsVerb,
  recordVerb,
  refreshVerb,
  renderVerb,
  verifyVerb,
  viewsVerb,
} from "../src/corpus/instrument.ts";
import { compileInstallation } from "../src/shell/installation.ts";

const corpus = join(fileURLToPath(new URL("..", import.meta.url)), "corpus");
const [verb, ...rest] = process.argv.slice(2);

/** The flags after a verb's positional arguments: each valued flag's values in order and the switches present; undefined on an unknown flag or one without its value. */
function flagsOf(args, valued, switches) {
  const values = Object.fromEntries(valued.map((flag) => [flag, []]));
  const present = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (switches.includes(flag)) present.add(flag);
    else if (valued.includes(flag) && index + 1 < args.length) {
      values[flag].push(args[index + 1]);
      index += 1;
    } else return undefined;
  }
  return { values, present };
}

// A caller's GIT_DIR, GIT_WORK_TREE or GIT_INDEX_FILE (a git hook, for
// example) must never point the fetch at another repository: refresh runs git
// with this environment, the variables that locate a repository removed.
const GIT_LOCATION = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
]);
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !GIT_LOCATION.has(name)),
);

function refreshOf(args) {
  if (args.length === 0 || args[0].startsWith("--")) return undefined;
  const flags = flagsOf(
    args.slice(1),
    ["--commit", "--repo", "--licence", "--path"],
    ["--any-branch", "--write"],
  );
  if (flags === undefined) return undefined;
  const { values, present } = flags;
  if (
    values["--commit"].length !== 1 ||
    values["--repo"].length > 1 ||
    values["--licence"].length > 1
  )
    return undefined;
  return {
    source: args[0],
    commit: values["--commit"][0],
    repo: values["--repo"][0],
    licence: values["--licence"][0],
    paths: values["--path"],
    anyBranch: present.has("--any-branch"),
    write: present.has("--write"),
    environment,
  };
}

function intakeOf(args) {
  if (args.length < 2 || args[0].startsWith("--") || args[1].startsWith("--")) return undefined;
  const flags = flagsOf(args.slice(2), ["--against", "--slot"], []);
  if (flags === undefined || flags.values["--slot"].length > 1) return undefined;
  return {
    source: args[0],
    path: args[1],
    against: flags.values["--against"],
    slot: flags.values["--slot"][0],
  };
}

/** `budget`'s modes and whether the table is asked for; undefined on a flag other than --table. */
function budgetOf(args) {
  const modes = args.filter((arg) => arg !== "--table");
  if (modes.some((arg) => arg.startsWith("--"))) return undefined;
  return { modes, table: modes.length < args.length };
}

const budget = verb === "budget" ? budgetOf(rest) : undefined;

function outcomeOf() {
  const modes = { "--stub": "stub", "--native": "native" };
  if (
    verb === "draft" &&
    (rest.length === 1 || (rest.length === 2 && Object.hasOwn(modes, rest[1])))
  )
    return draftVerb(corpus, rest[0], rest.length === 2 ? modes[rest[1]] : "copy");
  if (verb === "render" && rest.length === 1) return renderVerb(corpus, rest[0]);
  if (verb === "verify") return verifyVerb(corpus, rest);
  if (verb === "measure") return measureVerb(corpus, rest);
  if (verb === "fronts") return frontsVerb(corpus, rest);
  if (budget !== undefined) return budgetVerb(corpus, compileInstallation(corpus), budget.modes);
  if (verb === "record" && rest.length === 1) return recordVerb(corpus, resolve(rest[0]));
  if (verb === "views" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--write")))
    return viewsVerb(corpus, rest.length === 1);
  const refresh = verb === "refresh" ? refreshOf(rest) : undefined;
  if (refresh !== undefined) return refreshVerb(corpus, refresh);
  const intake = verb === "intake" ? intakeOf(rest) : undefined;
  if (intake !== undefined)
    return intakeVerb(corpus, intake.source, intake.path, intake.against, intake.slot);
  return {
    output: {
      verb: verb ?? null,
      refused: [
        {
          skill: "*",
          issues: [
            {
              message:
                "verbs: draft <skill> [--stub | --native], render <skill>, verify [skill...], measure [skill...], fronts [skill...], budget [mode...] [--table], record <entry.json>, views [--write], refresh <source> --commit <sha> [--repo <url> --licence <class>] [--path <dir>]... [--any-branch] [--write], intake <source> <path> [--slot <name>] [--against <skill>]...",
            },
          ],
        },
      ],
    },
    failed: true,
  };
}

const outcome = outcomeOf();
process.stdout.write(
  budget?.table === true && outcome.output.verb === "budget"
    ? renderBudgetTable(outcome.output)
    : `${JSON.stringify(outcome.output, null, 2)}\n`,
);
if (outcome.failed) process.exitCode = 1;
