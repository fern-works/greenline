import { posix, win32 } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../../commons/result.ts";
import type { InvalidField, JsonValue } from "../contract.ts";
import { isSkillIncluded, type SkillSource } from "../skill.ts";
import {
  GARDEN_COMMAND,
  GARDEN_KEY_VARIABLE,
  GARDEN_MAX_DEADLINE_MS,
  GARDEN_PREREQUISITE,
  GARDEN_RECEIPT_FIELDS,
  GARDEN_SKILL,
  GARDEN_STDOUT_LIMIT_BYTES,
  GARDEN_SUMMARY,
  gardenConfigurationSchema,
  type GardenConfiguration,
} from "./garden.ts";

/**
 * The connector registry (the decoupling plan's Phase 5, contract T2): a
 * static table compiled into the CLI, with garden its one entry. Nothing is
 * discovered, downloaded or loaded at run time, so an unknown id and any
 * plugin are refused. This module owns what every connector shares: listing
 * and status, explicit enable and disable over the manifest's `connectors`
 * map, the decision to mount a connector's instructions, the bounded process
 * invocation policy and the receipt projection its adapter approved. What a
 * connector does itself lives beside it, garden's in `garden.ts`.
 */

/** The ids this build registers. */
export type ConnectorId = "garden";

/** Every registered id, in listing order. */
const CONNECTOR_IDS: readonly ConnectorId[] = ["garden"];

/** The manifest's `connectors` map: an absent entry means the connector is disabled. */
export interface ConnectorsConfiguration {
  readonly garden?: GardenConfiguration | undefined;
}

/** The skill choices a workspace records, as the manifest holds them. */
export interface SkillChoices {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

/** What a connector declares to the common layer. */
interface ConnectorDefinition {
  readonly id: ConnectorId;
  /** One line naming the connector in a listing. */
  readonly summary: string;
  /** The bare command its entry may name, resolved on the PATH; any other executable is a path. */
  readonly command: string;
  /** The opt-in skill mounted, with its conditional pointer, only while the connector is enabled. */
  readonly skill: string;
  /** The local prerequisites enabling leaves to the person, stated without contacting anything. */
  readonly prerequisite: string;
  /** The environment variable the connector's own command reads its key from; greenline never reads its value. */
  readonly keyVariable: string;
  /** The bounds its process runs under: the stdout cap and the longest total deadline. */
  readonly invocation: { readonly stdoutLimitBytes: number; readonly maxDeadlineMs: number };
  /** The top-level fields of its result a receipt may keep; the adapter approves them as body-free. */
  readonly receiptFields: readonly string[];
}

const REGISTRY = {
  garden: {
    id: "garden",
    summary: GARDEN_SUMMARY,
    command: GARDEN_COMMAND,
    skill: GARDEN_SKILL,
    prerequisite: GARDEN_PREREQUISITE,
    keyVariable: GARDEN_KEY_VARIABLE,
    invocation: {
      stdoutLimitBytes: GARDEN_STDOUT_LIMIT_BYTES,
      maxDeadlineMs: GARDEN_MAX_DEADLINE_MS,
    },
    receiptFields: GARDEN_RECEIPT_FIELDS,
  },
} as const satisfies { readonly [id in ConnectorId]: ConnectorDefinition };

const REFUSAL = `this build registers ${CONNECTOR_IDS.join(", ")} only; connectors are built in, and no plugin is discovered or loaded`;

/** An id the registry does not hold: a misspelling, a path or a package offered as a plugin. */
export class UnknownConnector extends Error {
  readonly _tag = "UnknownConnector" as const;
  /** The refused id, as given. */
  readonly input: string;
  constructor(input: string) {
    super(`unknown connector ${JSON.stringify(input)}: ${REFUSAL}`);
    this.input = input;
  }
}

/** Resolve an id against the static table; only an exact registered id resolves. */
export function parseConnectorId(input: string): Result<ConnectorId, UnknownConnector> {
  const id = CONNECTOR_IDS.find((candidate) => candidate === input);
  return id === undefined ? err(new UnknownConnector(input)) : ok(id);
}

/** The manifest's `connectors` grammar: registered ids only, each entry its connector's own. */
export const connectorsSchema: z.ZodType<ConnectorsConfiguration> = z.strictObject(
  { garden: gardenConfigurationSchema.optional() },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Unknown connector ${issue.keys.map((key) => JSON.stringify(key)).join(", ")}: ${REFUSAL}.`
        : undefined,
  },
);

/** Whether the manifest holds an entry for the connector. */
function isConnectorEnabled(id: ConnectorId, connectors: ConnectorsConfiguration): boolean {
  return connectors[id] !== undefined;
}

/**
 * The manifest's skill choices against its connectors. A connector's skill
 * is installed only through its connector, so naming it in `skills.include`
 * is refused; excluding it while the connector is enabled is the conflict
 * enabling refuses, so a manifest holding both is refused as well.
 */
export function connectorChoiceIssues(
  skills: SkillChoices,
  connectors: ConnectorsConfiguration,
): readonly InvalidField[] {
  return CONNECTOR_IDS.flatMap((id) => {
    const { skill } = REGISTRY[id];
    const included = skills.include.flatMap((name, index) =>
      name === skill
        ? [
            {
              path: `skills.include[${index}]`,
              message: `'${skill}' is installed by the ${id} connector; run 'greenline connectors enable ${id} --url URL' instead of including it.`,
            },
          ]
        : [],
    );
    const excluded = isConnectorEnabled(id, connectors)
      ? skills.exclude.flatMap((name, index) =>
          name === skill
            ? [
                {
                  path: `skills.exclude[${index}]`,
                  message: `'${skill}' cannot be excluded while the ${id} connector is enabled; run 'greenline connectors disable ${id}' or remove the exclusion.`,
                },
              ]
            : [],
        )
      : [];
    return [...included, ...excluded];
  });
}

/**
 * Whether a skill belongs to a connector: installed by enabling that
 * connector, never chosen through `skills.include` or listed as a choice.
 */
export function isConnectorSkill(name: string): boolean {
  return CONNECTOR_IDS.some((id) => REGISTRY[id].skill === name);
}

/**
 * The decision to mount a skill: a connector's skill, and with it the
 * conditional pointer the block renders for it, only while that connector
 * is enabled; every other skill by the manifest's own choices.
 */
export function isSkillMounted(
  skill: SkillSource,
  skills: SkillChoices,
  connectors: ConnectorsConfiguration,
): boolean {
  const owner = CONNECTOR_IDS.find((id) => REGISTRY[id].skill === skill.name);
  return owner === undefined
    ? isSkillIncluded(skill, skills)
    : isConnectorEnabled(owner, connectors) && !skills.exclude.includes(skill.name);
}

/** What a registered connector is and how this workspace installed it. */
export type ConnectorStatus =
  | {
      readonly id: ConnectorId;
      readonly state: "disabled";
      readonly summary: string;
      readonly skill: string;
      readonly prerequisite: string;
    }
  | {
      readonly id: ConnectorId;
      readonly state: "enabled";
      readonly summary: string;
      readonly skill: string;
      readonly prerequisite: string;
      readonly endpoint: string;
      readonly executable: string;
    };

/** One connector's registered facts and installed configuration, read from the manifest alone. */
export function connectorStatus(
  id: ConnectorId,
  connectors: ConnectorsConfiguration,
): ConnectorStatus {
  const { summary, skill, prerequisite } = REGISTRY[id];
  const configuration = connectors[id];
  return configuration === undefined
    ? { id, state: "disabled", summary, skill, prerequisite }
    : {
        id,
        state: "enabled",
        summary,
        skill,
        prerequisite,
        endpoint: configuration.endpoint,
        executable: configuration.executable,
      };
}

/** Every registered connector's status, in listing order. */
export function connectorStatuses(connectors: ConnectorsConfiguration): readonly ConnectorStatus[] {
  return CONNECTOR_IDS.map((id) => connectorStatus(id, connectors));
}

/** The environment variable a connector's own command reads its key from. */
export function connectorKeyVariable(id: ConnectorId): string {
  return REGISTRY[id].keyVariable;
}

/** Enabling a connector whose skill the manifest explicitly excludes; the exclusion is never overridden. */
export class ConnectorExclusionConflict extends Error {
  readonly _tag = "ConnectorExclusionConflict" as const;
  readonly connector: ConnectorId;
  readonly skill: string;
  constructor(connector: ConnectorId, skill: string) {
    super(
      `${connector} installs the skill '${skill}', which skills.exclude names; remove the exclusion to enable ${connector}, or keep it disabled.`,
    );
    this.connector = connector;
    this.skill = skill;
  }
}

/** Add or replace a connector's entry; refused while the manifest excludes its skill. */
export function enableConnector(
  id: ConnectorId,
  configuration: GardenConfiguration,
  skills: SkillChoices,
  connectors: ConnectorsConfiguration,
): Result<ConnectorsConfiguration, ConnectorExclusionConflict> {
  const { skill } = REGISTRY[id];
  if (skills.exclude.includes(skill)) return err(new ConnectorExclusionConflict(id, skill));
  return ok({ ...connectors, [id]: configuration });
}

/** Remove a connector's entry; a connector already disabled stays disabled. */
export function disableConnector(
  id: ConnectorId,
  connectors: ConnectorsConfiguration,
): ConnectorsConfiguration {
  const { [id]: _removed, ...rest } = connectors;
  return rest;
}

/** One planned child process: literal arguments, no shell, bounded output and time. */
export interface ConnectorInvocation {
  /** The installed entry's executable; never taken from an argument. */
  readonly executable: string;
  /** Passed to the process one by one, never through a shell. */
  readonly args: readonly string[];
  readonly shell: false;
  /** Captured stdout past this many bytes ends the process as a failure. */
  readonly stdoutLimitBytes: number;
  /** The one total deadline for the whole call. */
  readonly deadlineMs: number;
}

/** An invocation the policy will not plan. */
export class ConnectorInvocationRefused extends Error {
  readonly _tag = "ConnectorInvocationRefused" as const;
  readonly connector: ConnectorId;
  constructor(connector: ConnectorId, message: string) {
    super(message);
    this.connector = connector;
  }
}

/** The path rules of the platform that would run the process. */
export type HostPlatform = "posix" | "win32";

/**
 * The bounded process invocation policy: an enabled connector's own
 * executable with literal arguments and no shell, its declared stdout cap,
 * and one deadline no longer than its declared maximum. The manifest may
 * name an absolute path of either platform, since it is committed and read
 * on both; the process runs only a path absolute on the platform running
 * it, because elsewhere a path such as `D:/garden` resolves against the
 * current directory, which a repository controls.
 */
export function planConnectorInvocation(
  id: ConnectorId,
  connectors: ConnectorsConfiguration,
  args: readonly string[],
  deadlineMs: number,
  platform: HostPlatform,
): Result<ConnectorInvocation, ConnectorInvocationRefused> {
  const configuration = connectors[id];
  if (configuration === undefined)
    return err(
      new ConnectorInvocationRefused(
        id,
        `${id} is not enabled for this repository; run 'greenline connectors enable ${id} --url URL'.`,
      ),
    );
  const { command, invocation } = REGISTRY[id];
  const rules = platform === "win32" ? win32 : posix;
  if (configuration.executable !== command && !rules.isAbsolute(configuration.executable))
    return err(
      new ConnectorInvocationRefused(
        id,
        `the configured executable is not an absolute path on this platform; run 'greenline connectors enable ${id} --url URL --executable PATH' with one that is`,
      ),
    );
  if (args.some((arg) => arg.includes("\u0000")))
    return err(
      new ConnectorInvocationRefused(id, "an argument holds a NUL byte and cannot pass literally"),
    );
  if (!Number.isInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > invocation.maxDeadlineMs)
    return err(
      new ConnectorInvocationRefused(
        id,
        `the deadline must be a whole number of milliseconds from 1 to ${invocation.maxDeadlineMs}`,
      ),
    );
  return ok({
    executable: configuration.executable,
    args: [...args],
    shell: false,
    stdoutLimitBytes: invocation.stdoutLimitBytes,
    deadlineMs,
  });
}

/**
 * The receipt projection: only the top-level fields a connector's adapter
 * approved as body-free leave its document, so shared code never keeps raw
 * output as evidence. The adapter validates the document before this runs.
 */
export function projectConnectorReceipt(
  id: ConnectorId,
  document: { readonly [key: string]: JsonValue },
): { readonly [key: string]: JsonValue } {
  const approved = new Set(REGISTRY[id].receiptFields);
  return Object.fromEntries(Object.entries(document).filter(([key]) => approved.has(key)));
}
