import { join } from "node:path";
import { planManagedFiles } from "../../core/managed-file.ts";
import { serializeLock } from "../../core/lock.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  serializeManifest,
  type Manifest,
  type TargetName,
} from "../../core/manifest.ts";
import { renderProjection } from "../../core/render.ts";
import { findGitRoot } from "../git.ts";
import { applyFilePlan } from "../fs/apply.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { snapshotWorkspace } from "../workspace.ts";
import type { RunRequest } from "./args.ts";
import type { PromptChoice } from "./prompt.ts";
import { GL, diagnostic } from "./output.ts";
import { type CliEnvironment } from "./command-environment.ts";
import { type CommandOutcome, fail, succeed } from "./command-outcome.ts";
import {
  buildLock,
  withBrokenBlockConflicts,
  blockedConflicts,
  blockedSummary,
  entryDiagnostic,
  planExecution,
  configWrite,
  unknownForceDiagnostics,
} from "./install-plan.ts";

/** Both harness trees: what `--yes` accepts and what "both" answers. */
const BOTH_TARGETS: readonly TargetName[] = ["codex", "claude-code"];

/** The trees init can install, as the prompt offers them. */
const TARGET_CHOICES: readonly PromptChoice[] = [
  { key: "claude-code", label: "claude-code (.claude/skills)" },
  { key: "codex", label: "codex (.agents/skills and agents/openai.yaml)" },
  { key: "both", label: "both" },
];

/**
 * Which harness trees init writes (ADR 0029: presence is projection,
 * so nothing installs by assumption). The flag decides; `--yes`
 * accepts both; a terminal is asked; a headless run without either
 * stops with the flag named, before any byte moves.
 */
function resolveTargets(request: RunRequest, env: CliEnvironment): TargetsResolution {
  if (request.targets !== undefined) {
    // SAFETY: parseArgs validates --targets against the two TargetName
    // literals before a request ever reaches the commands.
    return { kind: "chosen", targets: request.targets as readonly TargetName[] };
  }
  if (request.yes) return { kind: "chosen", targets: BOTH_TARGETS };
  const answer = env.prompt?.choose(
    "Which harness trees should greenline install?",
    TARGET_CHOICES,
  );
  if (answer === "both") return { kind: "chosen", targets: BOTH_TARGETS };
  if (answer === "codex" || answer === "claude-code") return { kind: "chosen", targets: [answer] };
  return { kind: "unchosen" };
}

/** Init's harness trees: chosen by flag, answer, or acceptance; else unchosen. */
type TargetsResolution =
  | { readonly kind: "chosen"; readonly targets: readonly TargetName[] }
  | { readonly kind: "unchosen" };

/** Plan and apply a fresh installation while preserving owned-file guards. */
export function runInit(request: RunRequest, env: CliEnvironment): CommandOutcome {
  const io: FileIo = createNodeFileIo();
  const root = findGitRoot(env.cwd);
  if (root === undefined) {
    return fail([
      diagnostic(
        GL.notGitRepository,
        "error",
        "init requires a Git repository root; run 'git init' first",
      ),
    ]);
  }
  const resolved = resolveTargets(request, env);
  if (resolved.kind === "unchosen") {
    return fail([
      diagnostic(
        GL.initTargetsUnchosen,
        "error",
        "init needs to know which harness trees to install: pass --targets codex,claude-code (either or both), or --yes to install both",
      ),
    ]);
  }
  const targets = resolved.targets;
  // Init asks nothing about a connector and enables none: each stays disabled until enabled explicitly.
  const manifest: Manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    targets,
    skills: { exclude: [], include: [] },
    connectors: {},
  };
  const desired = renderProjection(manifest, env.installation);
  const snapshot = snapshotWorkspace(root, desired, io, new Set<string>());

  if (snapshot.overridePresent) {
    return fail([
      diagnostic(
        GL.overridePresent,
        "error",
        "AGENTS.override.md would shadow the managed policy; remove it and re-run",
        "AGENTS.override.md",
      ),
    ]);
  }
  if (snapshot.manifestText !== undefined)
    return fail([
      diagnostic(
        GL.workspaceInitialized,
        "error",
        "An installed manifest appeared during init; run 'greenline sync' to reconcile installed files.",
      ),
    ]);

  const lock = buildLock(
    desired,
    snapshot.targets,
    env.version,
    env.installation.upstreams,
    env.installation.revision,
  );
  const plan = withBrokenBlockConflicts(
    planManagedFiles({
      desired: snapshot.targets,
      locked: new Map<string, string>(),
      disk: snapshot.diskHashes,
    }),
    snapshot,
  );
  const unknownForce = unknownForceDiagnostics(plan, request.forceManaged);
  if (unknownForce.length > 0) return fail(unknownForce);
  const blocked = blockedConflicts(plan, request.forceManaged, snapshot.targets);
  // A dry run previews the plan (conflicts included) instead of failing.
  if (!request.dryRun && blocked.length > 0) {
    return fail([
      diagnostic(GL.syncBlockedByConflicts, "error", blockedSummary(blocked, snapshot)),
      ...blocked.map((entry) => entryDiagnostic(entry, snapshot)),
    ]);
  }

  const execution = planExecution(plan, snapshot.targets, request.forceManaged);
  const manifestWrite = configWrite(
    join(root, ".greenline", "manifest.json"),
    serializeManifest(manifest),
    snapshot.manifestText,
  );
  const lockWrite = configWrite(
    join(root, ".greenline", "lock.json"),
    serializeLock(lock),
    snapshot.lockText,
  );
  const writes = [
    { path: manifestWrite.path, content: manifestWrite.content },
    { path: lockWrite.path, content: lockWrite.content },
    ...execution.writes.map((entry) => ({ path: join(root, entry.path), content: entry.content })),
  ];
  const effects = [manifestWrite.effect, lockWrite.effect, ...execution.effects];
  if (request.dryRun) {
    return succeed(effects, unknownForce);
  }
  const applied = applyFilePlan(writes, io);
  if (applied._tag === "err") {
    return fail(
      [diagnostic(GL.ioFailure, "error", applied.error.message, applied.error.path)],
      effects,
    );
  }
  return { ...succeed(effects, unknownForce), text: INIT_EPILOGUE };
}

// Static usage text printed after a fresh init (never in --json mode);
// facts and usage only, the passivity law's help-text class.
const INIT_EPILOGUE: string =
  `Workspace initialized. Getting started:\n` +
  `  ask your agent: "what were we doing?"        (continuity from the artifacts)\n` +
  `  ask your agent: "set this repo up properly"  (the stack and the furniture)\n` +
  `The installed roster and working laws are in the AGENTS.md managed block.`;
