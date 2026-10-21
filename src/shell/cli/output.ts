/**
 * The output contract: exit codes, the versioned JSON automation
 * envelope, and stable diagnostic codes (`docs/SPEC.md` §4).
 *
 * All output goes through the injected writer — never console.log —
 * so every command is testable through a recorded stream and the
 * bundle keeps a single stdout/stderr surface.
 */
import type { ConnectorStatus } from "../../core/connectors/registry.ts";
import type { ChangesReport } from "../../core/status.ts";
import type { Situation } from "../../core/situation.ts";
import type { TidyReason } from "../../core/tidy.ts";
import { renderHooksText, type HooksReport } from "../../core/adapters.ts";

export const EXIT_OK: number = 0;
export const EXIT_FAILURE: number = 1;
export const EXIT_USAGE: number = 2;

export type DiagnosticSeverity = "error" | "warning";

/** A stable, machine-readable diagnostic. Codes are GL####. */
export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

/**
 * The diagnostic code table. Codes are stable contracts: consumers may
 * key on them, so a code's meaning never changes, only its use.
 */
export const GL = {
  usage: "GL0001",
  ioFailure: "GL0003",
  manifestMissing: "GL0101",
  manifestInvalid: "GL0102",
  lockMissing: "GL0103",
  lockInvalid: "GL0104",
  notGitRepository: "GL0105",
  overridePresent: "GL0106",
  syncBlockedByConflicts: "GL0107",
  brokenBlock: "GL0108",
  lockStale: "GL0110",
  managedConflict: "GL0111",
  managedOrphan: "GL0112",
  unknownForceTarget: "GL0113",
  skillReference: "GL0114",
  initTargetsUnchosen: "GL0116",
  repositoryStateInvalid: "GL0123",
  workspaceInitialized: "GL0124",
  connectorConfiguration: "GL0125",
  installationUnavailable: "GL0140",
  // The changes view's findings, which fail status, and its notices, which never do.
  // Each reads a record's field or a durable fact of the repository and is paired
  // with its sentence in workshop/components/cli-contracts.md, "The checks charter";
  // GL0453, GL0454, GL0457 and GL0458 became status nudges in J-93 S3 and are never reused.
  changeUnparsed: "GL0401",
  changeMismatch: "GL0402",
  changeBelowFloor: "GL0403",
  changeChecksFailed: "GL0404",
  changeCitedMissing: "GL0405",
  changeTicketMode: "GL0406",
  changePlanningBelowCareful: "GL0407",
  changeBriefUnwritten: "GL0408",
  changeCostBelowStarts: "GL0409",
  changeCodeMoved: "GL0451",
  changeUncited: "GL0452",
  changeDeleted: "GL0455",
  changeUnchecked: "GL0456",
  changeFactMissing: "GL0459",
  // tidy's refusal to remove a change's working files.
  tidyKept: "GL0470",
} as const;

/**
 * GL0105's message for a command that needs a repository and finds none.
 * Whether to create one is the owner's decision, so the words an agent
 * reads say it offers `git init` and waits, in init's words (J-82), and
 * never read as an instruction to run it.
 * @param command the command refused, such as `sync`
 * @returns the message
 */
export function noRepositoryMessage(command: string): string {
  return `${command} requires a Git repository root, and none stands here; running 'git init' is the owner's decision: an agent offers it and waits, and 'greenline init --yes' runs it only as the owner's answer`;
}

/** A stable diagnostic builder. */
export function diagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  path?: string,
): Diagnostic {
  if (path === undefined) return { code, severity, message };
  return { code, severity, message, path };
}

/** The stable effect vocabulary commands report. */
export type EffectJson =
  | { readonly kind: "create"; readonly path: string }
  | { readonly kind: "update"; readonly path: string }
  | { readonly kind: "unchanged"; readonly path: string }
  | { readonly kind: "conflict"; readonly path: string; readonly reason: string }
  | { readonly kind: "orphan"; readonly path: string }
  | { readonly kind: "remove"; readonly path: string };

/** The versioned JSON automation envelope. */
export interface Envelope {
  readonly schemaVersion: 1;
  readonly command: string;
  readonly ok: boolean;
  readonly effects: readonly EffectJson[];
  readonly diagnostics: readonly Diagnostic[];
  /** The House rulings stanza's dash lines, present only on status. */
  readonly houseRulings?: readonly string[];
  /** The changes view, present only on status. */
  readonly changes?: ChangesReport;
  /** The connectors' registered and installed state, present on the `connectors` group and status. */
  readonly connectors?: readonly ConnectorStatus[];
  /** The situation the repository is in, present only on status's default view. */
  readonly situation?: Situation;
  /** What tidy removed and kept, present only on tidy. */
  readonly tidy?: TidyJson;
  /** The git hooks, the declared checks and the adapters, present on init, sync and status. */
  readonly hooks?: HooksReport;
}

/** What tidy removed and kept: each folder's path from the root, and for a kept one why, whether keeping it refused the request, and the sentence. */
export interface TidyJson {
  readonly removed: readonly string[];
  readonly kept: readonly {
    readonly path: string;
    readonly reason: TidyReason;
    readonly refused: boolean;
    readonly message: string;
  }[];
}

/** The streams a command may write to. */
export interface CliWriter {
  readonly stdout: { readonly write: (chunk: string) => void };
  readonly stderr: { readonly write: (chunk: string) => void };
}

/** Emit the envelope as a single pretty-printed JSON document. */
export function writeEnvelope(writer: CliWriter, envelope: Envelope): void {
  writer.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

/** The human count of a command's effects, with the orphan rule when an orphan is among them. */
export function effectSummary(effects: readonly EffectJson[]): string {
  const counts: Record<string, number> = {};
  for (const effect of effects) {
    counts[effect.kind] = (counts[effect.kind] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(", ");
  const line = `  ${summary === "" ? "no effects" : summary}\n`;
  return (counts["orphan"] ?? 0) > 0
    ? `${line}  an orphan is a managed file no longer generated; it stays until \`--force-managed <path>\` removes it\n`
    : line;
}

/** Emit a compact human summary of the same facts the envelope carries. */
export function writeHumanResult(writer: CliWriter, envelope: Envelope, text?: string): void {
  writer.stdout.write(`greenline ${envelope.command}\n`);
  // A command with a rendered view prints it; effect counts don't apply, and
  // status, which writes nothing, prints none even when it refuses early.
  if (text !== undefined) writer.stdout.write(text);
  else if (envelope.command !== "status") writer.stdout.write(effectSummary(envelope.effects));
  // A command with a view of its own places the hooks' lines in it.
  if (text === undefined && envelope.hooks !== undefined)
    writer.stdout.write(renderHooksText(envelope.hooks));
  for (const item of envelope.diagnostics) {
    const path = item.path === undefined ? "" : ` (${item.path})`;
    writer.stderr.write(`  ${item.severity.toUpperCase()} ${item.code}: ${item.message}${path}\n`);
  }
  writer.stdout.write(`${envelope.ok ? "  ok" : "  failed"}\n`);
}
