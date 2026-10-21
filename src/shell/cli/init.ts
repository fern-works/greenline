import { join } from "node:path";
import { planManagedFiles } from "../../core/managed-file.ts";
import { serializeLock } from "../../core/lock.ts";
import {
  HOOKS_ON,
  MANIFEST_SCHEMA_VERSION,
  NO_PROCEED,
  serializeManifest,
  type Manifest,
  type TargetName,
} from "../../core/manifest.ts";
import { renderProjection } from "../../core/render.ts";
import { findGitRoot, initRepository } from "../git.ts";
import { applyFilePlan } from "../fs/apply.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { snapshotWorkspace } from "../workspace.ts";
import { optInLines, renderHooksText } from "../../core/adapters.ts";
import { proposedChecks } from "../../core/checks.ts";
import {
  gitHooksState,
  hooksReport,
  presentHarnesses,
  projectFiles,
  registerGitHooks,
} from "../hooks.ts";
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

/** The answers init's git question accepts. */
const GIT_CHOICES: readonly PromptChoice[] = [
  { key: "yes", label: "yes, run 'git init' here" },
  { key: "no", label: "no" },
];

/**
 * GL0105's remedy outside a repository. Whether to create one is the owner's
 * decision, so the words an agent reads say it offers `git init` and waits,
 * and never read as an instruction to run it (J-82).
 */
const OWNER_DECIDES =
  "running 'git init' is the owner's decision: an agent offers it and waits, and 'greenline init --yes' runs it only as the owner's answer";

/** GL0105's message outside a repository, when init does not run `git init`. */
const NO_REPOSITORY = `init requires a Git repository root, and none stands here; ${OWNER_DECIDES}`;

/** The offer's outcome: a repository now stands at the directory, or init stops with GL0105. */
export type GitOffer =
  | { readonly kind: "initialized"; readonly root: string }
  | { readonly kind: "refused"; readonly outcome: CommandOutcome };

/**
 * Init on a directory that is no repository offers `git init` there, one
 * question in its flow, asked before the harness trees: `--yes` answers it, a
 * terminal is asked, and a no, no answer or no terminal keeps GL0105, whose
 * remedy leaves the decision to the owner. A dry run writes nothing, so it
 * runs no `git init` either.
 * @param request the init request
 * @param env where init runs and the terminal it may ask
 * @returns the new repository's root, or the refusal
 */
export function offerGitInit(request: RunRequest, env: CliEnvironment): GitOffer {
  const refused = (message: string): GitOffer => ({
    kind: "refused",
    outcome: fail([diagnostic(GL.notGitRepository, "error", message)]),
  });
  if (request.dryRun)
    return refused(
      `init requires a Git repository root, and none stands here; a dry run runs no 'git init', and ${OWNER_DECIDES}`,
    );
  const answer = request.yes
    ? "yes"
    : env.prompt?.choose(
        "This directory is not a Git repository. Run 'git init' here?",
        GIT_CHOICES,
      );
  if (answer !== "yes") return refused(NO_REPOSITORY);
  const created = initRepository(env.cwd);
  if (created._tag === "err")
    return refused(
      `init requires a Git repository root, and 'git init' failed: ${created.error.message}`,
    );
  return { kind: "initialized", root: env.cwd };
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
    return fail([diagnostic(GL.notGitRepository, "error", NO_REPOSITORY)]);
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
  // It writes the two settings' defaults: the agent waits under every mode, and no trial skill installs.
  // It proposes the checks from the project's own files and turns the git hooks and the adapters on.
  const manifest: Manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    targets,
    skills: { exclude: [], include: [] },
    connectors: {},
    proceed: NO_PROCEED,
    trials: [],
    checks: proposedChecks(projectFiles(root)),
    hooks: HOOKS_ON,
  };
  const desired = renderProjection(manifest, env.installation, presentHarnesses(root));
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
    env.installation.sources,
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
    ...execution.writes.map((entry) => ({
      path: join(root, entry.path),
      content: entry.content,
      executable: entry.executable,
    })),
  ];
  const effects = [manifestWrite.effect, lockWrite.effect, ...execution.effects];
  if (request.dryRun) {
    return {
      ...succeed(effects, unknownForce),
      hooks: hooksReport(manifest, desired, gitHooksState(root, manifest.hooks)),
    };
  }
  const applied = applyFilePlan(writes, io);
  if (applied._tag === "err") {
    return fail(
      [diagnostic(GL.ioFailure, "error", applied.error.message, applied.error.path)],
      effects,
    );
  }
  // The scripts stand now, so git can be told to run them.
  const hooks = hooksReport(manifest, desired, registerGitHooks(root, manifest.hooks));
  return { ...succeed(effects, unknownForce), hooks, text: initText(hooks) };
}

/**
 * Init's closing text: the getting-started lines, then the hooks, the
 * checks it proposed, which the agent confirms or corrects in the first
 * change, and the lines for the harnesses whose hooks the owner adds.
 */
function initText(hooks: Parameters<typeof renderHooksText>[0]): string {
  const proposal =
    hooks.checks.length === 0
      ? ""
      : "These checks were read from the project's files, a proposal your agent confirms or corrects in its first change.\n";
  return `${INIT_EPILOGUE}\n${renderHooksText(hooks)}${proposal}${optInLines().join("\n")}\n`;
}

// Static usage text printed after a fresh init (never in --json mode);
// facts and usage only, the passivity law's help-text class.
const INIT_EPILOGUE: string =
  `Workspace initialized. Getting started:\n` +
  `  ask your agent: "what were we doing?"        (continuity from the change records)\n` +
  `  ask your agent: "set this repo up properly"  (the stack and the furniture)\n` +
  `The installed roster and working laws are in the AGENTS.md managed block.`;
