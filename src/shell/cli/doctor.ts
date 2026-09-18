import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { planManagedFiles } from "../../core/managed-file.ts";
import { parseLock } from "../../core/lock.ts";
import { findBrokenReferences } from "../../core/links.ts";
import { renderProjection } from "../../core/render.ts";
import { auditArtifacts } from "../../core/artifact-audit.ts";
import { readRepositoryManifest, readRepositoryDecisions } from "../repository-state.ts";
import { readExecutionLedger } from "../execution-ledger.ts";
import { auditLedgerWork, summarizeLedger, type LedgerFinding } from "../../core/ledger-audit.ts";
import { findGitRoot } from "../git.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { snapshotWorkspace } from "../workspace.ts";
import { collectArtifacts } from "../artifacts.ts";
import { GL, diagnostic, type Diagnostic } from "./output.ts";
import { type RepositoryEnvironment, envRead } from "./command-environment.ts";
import { type CommandOutcome, fail, contractDiagnostics, succeed } from "./command-outcome.ts";
import { withBrokenBlockConflicts, entryDiagnostic } from "./install-plan.ts";
import { artifactFailureDiagnostics, findingDiagnostic } from "./artifact-diagnostics.ts";

/** Read repository diagnostics without modifying files or contacting the cabinet. */
export function runDoctor(env: RepositoryEnvironment): CommandOutcome {
  const io: FileIo = createNodeFileIo();
  const root = findGitRoot(env.cwd);
  if (root === undefined) {
    return fail([
      diagnostic(GL.notGitRepository, "error", "doctor requires a Git repository root"),
    ]);
  }
  const diagnostics: Diagnostic[] = [];
  const skillNames = env.installation?.skills.map((skill) => skill.name);

  const manifestText = envRead(io, join(root, ".greenline", "manifest.json"));
  if (manifestText === undefined)
    diagnostics.push(
      diagnostic(
        GL.manifestMissing,
        "error",
        "missing manifest; run greenline init",
        ".greenline/manifest.json",
      ),
    );
  else {
    const parsed = readRepositoryManifest(root, io, skillNames);
    if (parsed._tag === "err")
      diagnostics.push(
        ...contractDiagnostics(GL.manifestInvalid, parsed.error.issues, parsed.error.source),
      );
    const decisions = readRepositoryDecisions(root, io);
    if (decisions._tag === "err")
      diagnostics.push(
        ...contractDiagnostics(
          GL.repositoryStateInvalid,
          decisions.error.issues,
          decisions.error.source,
        ),
      );
  }

  // Report an existing CI job file without a configured remote; diagnosis creates nothing.
  const gitConfig = envRead(io, join(root, ".git", "config"));
  const ciJobs = join(root, ".github", "workflows");
  if (
    gitConfig !== undefined &&
    !gitConfig.includes('[remote "') &&
    existsSync(ciJobs) &&
    readdirSync(ciJobs).some((name) => /\.ya?ml$/.test(name))
  ) {
    diagnostics.push(
      diagnostic(
        GL.doctorWorkflowWithoutRemote,
        "warning",
        "a CI job file exists under .github/workflows but this repository has no remote; local checks can still run",
        ".github/workflows",
      ),
    );
  }

  const lockText = envRead(io, join(root, ".greenline", "lock.json"));
  if (lockText === undefined) {
    diagnostics.push(
      diagnostic(
        GL.lockMissing,
        "error",
        "missing lock; run 'greenline sync'",
        ".greenline/lock.json",
      ),
    );
  } else {
    const parsed = parseLock(lockText, ".greenline/lock.json");
    if (parsed._tag === "err") {
      diagnostics.push(
        ...contractDiagnostics(GL.lockInvalid, parsed.error.issues, parsed.error.source),
      );
    } else if (parsed.value.cliVersion !== env.version) {
      diagnostics.push(
        diagnostic(
          GL.lockStale,
          "warning",
          `lock records CLI ${parsed.value.cliVersion}; this is ${env.version} — run 'greenline sync'`,
          ".greenline/lock.json",
        ),
      );
    }
  }

  if (envRead(io, join(root, "AGENTS.override.md")) !== undefined) {
    diagnostics.push(
      diagnostic(
        GL.overridePresent,
        "error",
        "AGENTS.override.md would shadow the managed policy",
        "AGENTS.override.md",
      ),
    );
  }

  if (manifestText !== undefined && lockText !== undefined && env.installation !== undefined) {
    const manifest = readRepositoryManifest(root, io, skillNames);
    const lock = parseLock(lockText, ".greenline/lock.json");
    if (manifest._tag === "ok" && lock._tag === "ok") {
      const desired = renderProjection(manifest.value, env.installation);
      const snapshot = snapshotWorkspace(
        root,
        desired,
        io,
        new Set<string>(lock.value.files.keys()),
      );
      const plan = withBrokenBlockConflicts(
        planManagedFiles({
          desired: snapshot.targets,
          locked: lock.value.files,
          disk: snapshot.diskHashes,
        }),
        snapshot,
      );
      for (const entry of plan) {
        if (entry.kind === "create" || entry.kind === "update") {
          diagnostics.push(
            diagnostic(
              GL.lockStale,
              "error",
              "installed skills or runtime do not match current settings; run greenline sync",
              entry.path,
            ),
          );
        }
        if (entry.kind === "conflict") {
          diagnostics.push(entryDiagnostic(entry, snapshot));
        }
        if (entry.kind === "orphan") {
          diagnostics.push(
            diagnostic(GL.doctorOrphan, "warning", "managed file no longer generated", entry.path),
          );
        }
      }
      for (const reference of findBrokenReferences(desired)) {
        diagnostics.push(
          diagnostic(
            GL.doctorReference,
            "warning",
            `skill reference '${reference.target}' does not resolve in the projection`,
            reference.file,
          ),
        );
      }
    }
  }

  // Artifact scope: parse every work/ file, then audit the parsed set.
  const collected = collectArtifacts(join(root, ".greenline", "work"));
  if (collected._tag === "err") {
    diagnostics.push(diagnostic(GL.ioFailure, "error", collected.error.message));
  } else {
    diagnostics.push(...artifactFailureDiagnostics(collected.value.failures));
    for (const finding of auditArtifacts(collected.value.parsed)) {
      diagnostics.push(findingDiagnostic(finding));
    }
    // ADR 0016: a complete initiative's outliving rulings are promoted
    // to the product decisions book. QA run 042 proved prose alone
    // cannot carry this — the harvest clause sat on an unconsulted
    // skill body through seven close windows; doctor is the one
    // surface every close meets.
    const closed = collected.value.parsed.filter(
      (entry) => entry.artifact.type === "initiative" && entry.artifact.status === "complete",
    );
    if (closed.length > 0) {
      const book = envRead(createNodeFileIo(), join(root, ".greenline", "DECISIONS.md")) ?? "";
      for (const entry of closed) {
        if (!book.includes(entry.artifact.id)) {
          diagnostics.push(
            diagnostic(
              GL.artifactHarvestUnrecorded,
              "warning",
              `initiative '${entry.artifact.id}' is complete but .greenline/DECISIONS.md carries no entry for it; record its outliving rulings there with references to their sources, or record that none remain`,
              `.greenline/work/${entry.path}`,
            ),
          );
        }
      }
    }
  }
  const state = readExecutionLedger(root, io);
  if (state._tag === "err")
    return fail([
      ...diagnostics,
      ...(state.error._tag === "ContractParseFailed"
        ? contractDiagnostics(GL.repositoryStateInvalid, state.error.issues, state.error.source)
        : [diagnostic(GL.repositoryStateInvalid, "error", state.error.message)]),
    ]);
  const tree = collected._tag === "ok" ? collected.value.parsed : [];
  diagnostics.push(...auditLedgerWork(state.value, tree).map(ledgerDiagnostic));
  return { ...succeed([], diagnostics), ledger: summarizeLedger(state.value) };
}

function ledgerDiagnostic(finding: LedgerFinding): Diagnostic {
  const codes = {
    missing: GL.ledgerMissing,
    reference: GL.ledgerReference,
    incomplete: GL.ledgerIncomplete,
    contradicted: GL.ledgerContradicted,
    unverified: GL.ledgerUnverified,
  };
  return diagnostic(codes[finding.kind], finding.severity, finding.message, finding.path);
}
