import { deal, dealText, seedOf, type DealRequest } from "../../core/interface-catalog.ts";
import {
  isOnList,
  PLATFORMS,
  REGISTERS,
  type Platform,
  type Register,
} from "../../core/interface-facets.ts";
import { changeOfBranch } from "../../core/git-hooks.ts";
import { dealViewPath } from "../../core/deal-ask.ts";
import { findGitRoot } from "../git.ts";
import { recordDeal } from "../deal-view.ts";
import { branchFacts, workspaceManifest } from "../hooks.ts";
import { installedCatalog, readInterfaceRulings } from "../interface.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";

/**
 * `greenline deal` (J-123 S6; `workshop/components/interface-catalog.md`,
 * "The deal"): three directions drawn from the installed interface catalog
 * by the register and platform in play, the page's job, the tone, the
 * sector and the material in hand, under a seed, so the same ask deals the
 * same three and `--reroll` draws once again. It prints each direction's
 * entries with their reasons and pitfalls, never the catalog whole, and
 * writes nothing. With no catalog installed it says so and deals nothing.
 */

const USAGE = [
  "Usage: greenline deal [--register site|app] [--platform <platform>] [--job <job>]",
  "                      [--tone <words>] [--sector <words>] [--material <a,b,...>]",
  "                      [--seed <n>] [--reroll] [--json]",
  "",
  "Deal three directions from the installed interface catalog (the extra skill",
  "interface-catalog): for each, a material, a palette, a type pairing, a",
  "composition and a motion register that serve the register and platform in",
  "play, weighted toward the tone's, the sector's and the material's words, and",
  "the anatomy the page's job gives. The register defaults to the one the",
  "interface rulings give every root, the platform to the manifest's. A",
  "composition that needs pictures is left out where --material names none.",
  "The same ask deals the same three; --seed sets the draw and --reroll draws",
  "once again. It prints each direction's entries with their reasons and",
  "pitfalls, never the catalog whole, and writes nothing.",
  "",
].join("\n");

/** The options that take a value. */
const VALUED = new Set([
  "--register",
  "--platform",
  "--job",
  "--tone",
  "--sector",
  "--material",
  "--seed",
]);

/**
 * Run `greenline deal`.
 * @param argv the arguments after `deal`
 * @param writer greenline's streams
 * @param cwd where it runs
 * @returns 0 dealt, 1 with no catalog to deal from, 2 refused
 */
export function runDealCli(argv: readonly string[], writer: CliWriter, cwd: string): number {
  const values = new Map<string, string>();
  let reroll = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      writer.stdout.write(USAGE);
      return EXIT_OK;
    }
    if (arg === "--reroll") reroll = true;
    else if (arg === "--json") json = true;
    else if (VALUED.has(arg) && (argv[index + 1] ?? "") !== "") {
      values.set(arg, argv[index + 1] ?? "");
      index += 1;
    } else {
      writer.stderr.write(
        `greenline deal: ${VALUED.has(arg) ? `${arg} needs a value` : `unknown argument '${arg}'`}\n`,
      );
      return EXIT_USAGE;
    }
  }
  const root = findGitRoot(cwd) ?? cwd;
  const named = values.get("--register");
  if (named !== undefined && !isOnList(REGISTERS, named)) {
    writer.stderr.write(`greenline deal: --register is site or app, not '${named}'\n`);
    return EXIT_USAGE;
  }
  const ruled = [...new Set(readInterfaceRulings(root).registers.map((entry) => entry.register))];
  const register: Register | undefined = named ?? (ruled.length === 1 ? ruled[0] : undefined);
  if (register === undefined) {
    writer.stderr.write(
      "greenline deal: name the register with --register site or app; the rulings give no one register\n",
    );
    return EXIT_USAGE;
  }
  const platformNamed = values.get("--platform");
  if (platformNamed !== undefined && !isOnList(PLATFORMS, platformNamed)) {
    writer.stderr.write(
      `greenline deal: --platform is one of ${PLATFORMS.join(", ")}, not '${platformNamed}'\n`,
    );
    return EXIT_USAGE;
  }
  const platform: Platform = platformNamed ?? workspaceManifest(root)?.interface?.platform ?? "web";
  const seedText = values.get("--seed");
  if (seedText !== undefined && !/^\d+$/.test(seedText)) {
    writer.stderr.write("greenline deal: --seed is a whole number\n");
    return EXIT_USAGE;
  }
  const catalog = installedCatalog(root);
  if (catalog.kind === "absent") {
    writer.stderr.write(
      `greenline deal: ${catalog.reason.charAt(0).toLowerCase()}${catalog.reason.slice(1)} Until then compose three directions from the material in hand and the job.\n`,
    );
    return EXIT_FAILURE;
  }
  const { entries } = catalog;
  const material = values
    .get("--material")
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const ask = {
    register,
    platform,
    job: values.get("--job"),
    tone: values.get("--tone"),
    sector: values.get("--sector"),
    material,
  };
  const request: DealRequest = {
    ...ask,
    seed: seedText === undefined ? seedOf(JSON.stringify(ask)) : Number(seedText),
    reroll,
  };
  const directions = deal(entries, request);
  const facts = branchFacts(root);
  const change = changeOfBranch(facts.current, facts);
  const view =
    change === undefined
      ? undefined
      : dealViewPath(change.id, {
          register,
          platform: platformNamed,
          job: ask.job,
          tone: ask.tone,
          sector: ask.sector,
          material,
          seed: request.seed,
          reroll,
        });
  // The ask kept for the deal view's address, which greenline view and the view line read (J-142 S1).
  if (change !== undefined && view !== undefined) recordDeal(root, change.id, view);
  if (json)
    writer.stdout.write(
      `${JSON.stringify(
        {
          catalog: catalog.pin,
          seed: request.seed,
          reroll,
          view: view ?? null,
          directions: directions.map((direction) => ({
            name: direction.name,
            parts: direction.parts.map((part) => ({
              role: part.role,
              id: part.entry.id,
              kind: part.entry.kind,
            })),
          })),
        },
        null,
        2,
      )}\n`,
    );
  else
    writer.stdout.write(
      `Dealt from catalog ${catalog.pin} under seed ${String(request.seed)}${reroll ? ", rerolled" : ""}.\n\n${dealText(directions)}${view === undefined ? "" : `\nThe three side by side, with the pick: 'greenline view deal ${change?.id ?? ""}' prints its address, ${view}\n`}`,
    );
  return EXIT_OK;
}
