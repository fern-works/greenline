/**
 * The output contract: exit codes, the versioned JSON automation
 * envelope, and stable diagnostic codes (`docs/SPEC.md` §4).
 *
 * All output goes through the injected writer — never console.log —
 * so every command is testable through a recorded stream and the
 * bundle keeps a single stdout/stderr surface.
 */
import type { LedgerSummary } from "../../core/ledger-audit.ts";
import type { ProjectView } from "../../core/status.ts";

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
  doctorOrphan: "GL0112",
  unknownForceTarget: "GL0113",
  doctorReference: "GL0114",
  initTargetsUnchosen: "GL0116",
  doctorWorkflowWithoutRemote: "GL0121",
  repositoryStateInvalid: "GL0123",
  guidanceConfiguration: "GL0124",
  artifactFrontmatter: "GL0201",
  artifactIdDuplicate: "GL0202",
  artifactReferenceUnresolved: "GL0203",
  artifactConsumptionStale: "GL0204",
  artifactConsumptionAhead: "GL0205",
  artifactClaimConflict: "GL0206",
  artifactDependencyCycle: "GL0207",
  artifactEvidenceMissing: "GL0208",
  artifactCompleteUnproven: "GL0209",
  artifactHarvestUnrecorded: "GL0210",
  ledgerMissing: "GL0301",
  ledgerReference: "GL0302",
  ledgerIncomplete: "GL0303",
  ledgerContradicted: "GL0304",
  ledgerUnverified: "GL0306",
} as const;

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
  /** The status view, present only on the status command. */
  readonly view?: ProjectView;
  /** The House rulings stanza's dash lines, present only on status. */
  readonly houseRulings?: readonly string[];
  readonly ledger?: LedgerSummary;
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

/** Emit a compact human summary of the same facts the envelope carries. */
export function writeHumanResult(writer: CliWriter, envelope: Envelope, text?: string): void {
  writer.stdout.write(`greenline ${envelope.command}\n`);
  if (text !== undefined) {
    // A command with a rendered view prints it; effect counts don't apply.
    writer.stdout.write(text);
  } else if (envelope.command !== "doctor") {
    const counts: Record<string, number> = {};
    for (const effect of envelope.effects) {
      counts[effect.kind] = (counts[effect.kind] ?? 0) + 1;
    }
    const summary = Object.entries(counts)
      .map(([kind, count]) => `${count} ${kind}`)
      .join(", ");
    writer.stdout.write(`  ${summary === "" ? "no effects" : summary}\n`);
    if ((counts["orphan"] ?? 0) > 0) {
      writer.stdout.write(
        "  an orphan is a managed file no longer generated; it stays until `--force-managed <path>` removes it\n",
      );
    }
  }
  for (const item of envelope.diagnostics) {
    const path = item.path === undefined ? "" : ` (${item.path})`;
    writer.stderr.write(`  ${item.severity.toUpperCase()} ${item.code}: ${item.message}${path}\n`);
  }
  writer.stdout.write(`${envelope.ok ? "  ok" : "  failed"}\n`);
}
