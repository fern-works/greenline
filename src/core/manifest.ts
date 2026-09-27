import { z } from "zod";
import type { Result } from "../commons/result.ts";
import {
  connectorChoiceIssues,
  connectorsSchema,
  type ConnectorsConfiguration,
} from "./connectors/registry.ts";
import {
  checkContractVersion,
  contractFailure,
  contractOk,
  issuesFrom,
  parseJson,
  type ContractParseFailed,
} from "./contract.ts";

export const MANIFEST_SCHEMA_VERSION = 6 as const;
export type TargetName = "codex" | "claude-code";
/** Repository installation choices; engineering policy stays in the decision home. */
export interface Manifest {
  readonly schemaVersion: 6;
  readonly targets: readonly TargetName[];
  readonly skills: { readonly exclude: readonly string[]; readonly include: readonly string[] };
  /** The enabled connectors; an absent entry, or an absent map, means disabled. */
  readonly connectors: ConnectorsConfiguration;
}
const schema = z
  .object({
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    targets: z.array(z.enum(["codex", "claude-code"])).min(1),
    skills: z
      .object({
        exclude: z.array(z.string().min(1)).default([]),
        include: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .default({ exclude: [], include: [] }),
    connectors: connectorsSchema.default({}),
  })
  .strict();
/** Parse the installation contract, checking skill membership when its roster is available. */
export function parseManifest(
  input: string,
  source: string,
  skillNames?: readonly string[],
): Result<Manifest, ContractParseFailed> {
  const raw = parseJson(input);
  if (raw === undefined)
    return contractFailure(source, [{ path: "", message: "manifest is not valid JSON" }]);
  const version = checkContractVersion(raw, "manifest", MANIFEST_SCHEMA_VERSION);
  if (version !== undefined) return contractFailure(source, [version]);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return contractFailure(source, issuesFrom(parsed.error.issues));
  for (const [field, values] of [
    ["targets", parsed.data.targets],
    ["skills.include", parsed.data.skills.include],
    ["skills.exclude", parsed.data.skills.exclude],
  ] as const)
    if (new Set(values).size !== values.length)
      return contractFailure(source, [
        { path: field, message: `Duplicate entry: ${values.join(", ")}` },
      ]);
  const connectorIssues = connectorChoiceIssues(parsed.data.skills, parsed.data.connectors);
  if (connectorIssues.length > 0) return contractFailure(source, connectorIssues);
  if (skillNames !== undefined) {
    const roster = new Set(skillNames);
    const issues = (["include", "exclude"] as const).flatMap((field) =>
      parsed.data.skills[field].flatMap((name, index) =>
        roster.has(name)
          ? []
          : [
              {
                path: `skills.${field}[${index}]`,
                message: `Unknown skill '${name}'; see the installed skill list in AGENTS.md.`,
              },
            ],
      ),
    );
    if (issues.length > 0) return contractFailure(source, issues);
  }
  return contractOk(parsed.data);
}
/** Deterministic manifest serialization; the connectors map appears only when it holds an entry. */
export function serializeManifest(manifest: Manifest): string {
  const choices = {
    schemaVersion: manifest.schemaVersion,
    targets: manifest.targets,
    skills: manifest.skills,
  };
  const enabled = Object.values(manifest.connectors).some((entry) => entry !== undefined);
  const document = enabled ? { ...choices, connectors: manifest.connectors } : choices;
  return JSON.stringify(document, null, 2) + "\n";
}
