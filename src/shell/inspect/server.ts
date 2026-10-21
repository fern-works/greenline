import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { join } from "node:path";
import { lstatSync, existsSync } from "node:fs";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { sha256Hex } from "../../commons/hash.ts";
import {
  NO_PROCEED,
  parseManifest,
  serializeManifest,
  trialSkillNames,
  type HookSettings,
  type Manifest,
} from "../../core/manifest.ts";
import type { HooksReport } from "../../core/adapters.ts";
import { isConnectorSkill, type SkillChoices } from "../../core/connectors/registry.ts";
import { parseDecisionDocument, type RootStatement } from "../../core/root-statements.ts";
import { parseHouseRulings } from "../../core/house-rulings.ts";
import {
  lineDiff,
  receiptView,
  withStanza,
  type DiffLine,
  type ReceiptRequestView,
} from "../../core/inspect.ts";
import { parseLock } from "../../core/lock.ts";
import { renderProjection } from "../../core/render.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { applyFilePlan } from "../fs/apply.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { rosterOf } from "../repository-state.ts";
import type { Installation } from "../../core/installation.ts";
import { GuidanceRequests } from "../guidance-requests.ts";
import { runCommand } from "../cli/commands.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import type { CommandOutcome } from "../cli/command-outcome.ts";
import type { Diagnostic } from "../cli/output.ts";
import { renderInspectorPage } from "./page.ts";
import { readInstalledFile } from "./repository-read.ts";
import {
  changeDetail,
  changesList,
  type ChangeDetail,
  type ChangesList,
  type CommitLog,
} from "./ledger.ts";
import { changeHtml, changesListHtml } from "./ledger-html.ts";
import { planDetail, plansList, type PlanDetail, type PlansList } from "./plans.ts";
import { planHtml, plansListHtml } from "./plans-html.ts";
import {
  knowledgeHome,
  knowledgeList,
  type KnowledgeHome,
  type KnowledgeList,
} from "./knowledge.ts";
import { knowledgeHomeHtml, knowledgeListHtml } from "./knowledge-html.ts";

export const INSPECT_DEFAULT_PORT = 7433;
/** Installed context and current policy, without any remotely retrieved guidance body. */
export interface InspectorState {
  readonly manifest: Manifest;
  readonly installation: string;
  readonly editRevision: string;
  readonly cliVersion: string;
  readonly roots: readonly RootStatement[];
  readonly decisions: string;
  readonly policyChanges: readonly {
    readonly path: string;
    readonly before: string;
    readonly after: string;
    readonly at: string;
  }[];
  readonly houseRulings: { readonly stanza: string; readonly rulings: readonly string[] };
  /** The request collections, body-free, as the evidence view shows them. */
  readonly receipts: readonly ReceiptRequestView[];
  /** The collection files, or the directory, that could not be read, each with the refusal. */
  readonly receiptProblems: readonly { readonly file: string; readonly message: string }[];
  readonly checks: readonly Diagnostic[];
  /**
   * The declared checks and the hooks as `greenline status` reports them, with
   * the manifest's hooks settings; null when status could not read the manifest.
   */
  readonly hooks: (HooksReport & { readonly settings: HookSettings }) | null;
  readonly files: readonly {
    readonly path: string;
    readonly content: string | null;
    readonly error: string | null;
  }[];
  readonly changes: {
    readonly baseline: string | null;
    readonly files: readonly { readonly path: string; readonly diff: readonly DiffLine[] }[];
    readonly unavailable: readonly string[];
  };
  /** What the two settings may hold, from the installation: `proceed`'s values in order, and the trial skills. */
  readonly settings: { readonly proceed: readonly string[]; readonly trials: readonly string[] };
  readonly skills: readonly {
    readonly name: string;
    readonly installed: boolean;
    /** An extra installs only when the manifest's include list names it. */
    readonly extra: boolean;
  }[];
}
const editable = [".greenline/manifest.json", ".greenline/DECISIONS.md", "AGENTS.md"] as const;
function editableTexts(root: string, io: FileIo) {
  const values: string[] = [];
  for (const path of editable) {
    const result = readInstalledFile(root, io, path);
    if (result._tag === "err" && (result.error.step !== "absent" || path === editable[0]))
      return result;
    values.push(result._tag === "ok" ? result.value : "");
  }
  return {
    _tag: "ok" as const,
    value: {
      manifest: values[0] ?? "",
      decisions: values[1] ?? "",
      agents: values[2] ?? "",
      revision: sha256Hex(JSON.stringify(values)),
    },
  };
}
/** Pin one readable Git tree for the whole comparison. */
function gitBaseline(
  root: string,
): { readonly revision: string; readonly paths: ReadonlySet<string> } | undefined {
  try {
    const options: ExecFileSyncOptionsWithStringEncoding = {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    } as const;
    const revision = execFileSync(
      "git",
      ["rev-parse", "--verify", "HEAD^{commit}"],
      options,
    ).trim();
    const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", revision], options);
    return { revision, paths: new Set(paths.split("\0").filter(Boolean)) };
  } catch {
    return undefined;
  }
}

/** The text at the pinned commit, or undefined when its blob cannot be read. */
function atHead(root: string, revision: string, path: string): string | undefined {
  try {
    return execFileSync("git", ["show", revision + ":" + path], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

/** A commit id as git prints it; nothing else reaches git's arguments. */
const COMMIT = /^[0-9a-f]{7,64}$/;

/**
 * The subject and date of each commit, in one read of git; a commit git
 * cannot describe is left out, and the page shows its subject as unknown.
 */
function commitLog(root: string): CommitLog {
  return (hashes) => {
    const found = new Map<string, { subject: string; date: string }>();
    const asked = hashes.filter((hash) => COMMIT.test(hash));
    if (asked.length === 0) return found;
    let text: string;
    try {
      text = execFileSync(
        "git",
        ["log", "--no-walk=unsorted", "--format=%H%x00%s%x00%cI%x1e", ...asked],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      return found;
    }
    for (const record of text.split("\x1e")) {
      const [hash, subject, date] = record.trim().split("\0");
      if (hash !== undefined && subject !== undefined && date !== undefined)
        found.set(hash, { subject, date });
    }
    return found;
  };
}

function inspectorState(root: string, env: CliEnvironment): InspectorState | { error: string } {
  const io = createNodeFileIo(),
    texts = editableTexts(root, io);
  if (texts._tag === "err") return { error: texts.error.message };
  const manifest = parseManifest(
      texts.value.manifest,
      ".greenline/manifest.json",
      rosterOf(env.installation),
    ),
    decisions = parseDecisionDocument(texts.value.decisions, ".greenline/DECISIONS.md");
  if (manifest._tag === "err" || decisions._tag === "err")
    return { error: "No readable repository configuration or decisions." };
  const projected = renderProjection(manifest.value, env.installation),
    paths = new Set(projected.map((file) => file.path));
  const lockText = readInstalledFile(root, io, ".greenline/lock.json");
  const lock =
    lockText._tag === "ok" ? parseLock(lockText.value, ".greenline/lock.json") : undefined;
  if (lock?._tag === "ok") for (const path of lock.value.files.keys()) paths.add(path);
  const baseline = gitBaseline(root);
  const files: InspectorState["files"][number][] = [],
    changes: InspectorState["changes"]["files"][number][] = [],
    unavailable: string[] = [];
  for (const path of [...paths].sort()) {
    const actual = readInstalledFile(root, io, path);
    files.push({
      path,
      content: actual._tag === "ok" ? actual.value : null,
      error: actual._tag === "err" ? actual.error.message : null,
    });
    if (actual._tag === "err" && actual.error.step !== "absent") {
      unavailable.push(path);
      continue;
    }
    if (baseline === undefined) continue;
    const before = baseline.paths.has(path) ? atHead(root, baseline.revision, path) : "";
    if (before === undefined) {
      unavailable.push(path);
      continue;
    }
    const after = actual._tag === "ok" ? actual.value : "";
    if (before !== after) changes.push({ path, diff: lineDiff(before, after) });
  }
  const markerText = readInstalledFile(root, io, ".greenline/policy-changes.json");
  if (markerText._tag === "err" && markerText.error.step !== "absent")
    return { error: markerText.error.message };
  const markerData = markers.safeParse(
    markerText._tag === "ok" ? parseJson(markerText.value) : { schemaVersion: 1, changes: [] },
  );
  if (!markerData.success) return { error: "Policy change evidence is invalid." };
  const survey = new GuidanceRequests(root, io).survey();
  const RECEIPTS = ".greenline/ledger/receipts";
  const diagnosis = runCommand(
    {
      command: "status",
      json: true,
      dryRun: true,
      yes: false,
      targets: undefined,
      forceManaged: [],
      port: undefined,
    },
    env,
  );
  const rulings = parseHouseRulings(texts.value.agents);
  return {
    manifest: manifest.value,
    installation: env.installation.revision,
    editRevision: texts.value.revision,
    cliVersion: env.version,
    roots: decisions.value.roots,
    policyChanges: markerData.data.changes,
    decisions: texts.value.decisions,
    houseRulings: { stanza: rulings.map((r) => `- ${r}`).join("\n"), rulings },
    // Each collection is read as it stands, so the valid ones show beside those that cannot be read.
    receipts:
      survey._tag === "ok"
        ? receiptView(survey.value.flatMap((item) => ("request" in item ? [item.request] : [])))
        : [],
    receiptProblems:
      survey._tag === "ok"
        ? survey.value.flatMap((item) =>
            "failure" in item ? [{ file: `${RECEIPTS}/${item.file}`, message: item.failure }] : [],
          )
        : [{ file: RECEIPTS, message: survey.error.message }],
    checks: diagnosis.diagnostics,
    hooks:
      diagnosis.hooks === undefined ? null : { settings: manifest.value.hooks, ...diagnosis.hooks },
    files,
    changes: { baseline: baseline?.revision ?? null, files: changes, unavailable },
    settings: {
      proceed: [NO_PROCEED, ...env.installation.modes.modes.map((mode) => mode.name)],
      // The trial skills beside the line, which `trials` names, so a save keeps an enabled one.
      trials: trialSkillNames(env.installation.modes, env.installation.skills),
    },
    // A connector's skill is its connector's to install, and a trial skill the trials
    // setting's, so neither is offered as a choice.
    skills: env.installation.skills
      .filter((skill) => !unlisted(env.installation, skill.name))
      .map((skill) => ({
        name: skill.name,
        installed: files.some(
          (file) => file.path.endsWith(`/skills/${skill.name}/SKILL.md`) && file.content !== null,
        ),
        extra: skill.extra === true,
      })),
  };
}
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const settings = z
  .object({
    expectedRevision: revision,
    targets: z
      .array(z.enum(["codex", "claude-code"]))
      .min(1)
      .optional(),
    skills: z
      .object({ include: z.array(z.string()), exclude: z.array(z.string()) })
      .strict()
      .optional(),
    proceed: z.string().optional(),
    trials: z.array(z.string()).optional(),
  })
  .strict();
const prose = z.object({ expectedRevision: revision, body: z.string() }).strict();
const markers = z
  .object({
    schemaVersion: z.literal(1),
    changes: z.array(
      z
        .object({ path: z.enum(editable), before: revision, after: revision, at: z.iso.datetime() })
        .strict(),
    ),
  })
  .strict();
/**
 * Whether the page leaves a skill out of its choices: a connector's skill,
 * which its connector installs, and a trial skill beside the line, which the
 * trials setting installs (S17 of the plan modes-records-recipes).
 */
function unlisted(installation: Installation, name: string): boolean {
  return (
    isConnectorSkill(name) ||
    trialSkillNames(installation.modes, installation.skills).includes(name)
  );
}
/**
 * The saved skill choices: the page's, for the skills it lists, and the
 * manifest's own entries for a skill the page never lists, a connector's or
 * a trial's. A save can therefore neither write an exclusion that would block
 * enabling a connector or a trial later nor drop one the owner wrote by hand.
 */
function keepConnectorChoices(
  written: SkillChoices,
  current: SkillChoices,
  installation: Installation,
): SkillChoices {
  const hidden = (name: string): boolean => unlisted(installation, name);
  const merge = (page: readonly string[], manifest: readonly string[]): readonly string[] => [
    ...page.filter((name) => !hidden(name)),
    ...manifest.filter(hidden),
  ];
  return {
    include: merge(written.include, current.include),
    exclude: merge(written.exclude, current.exclude),
  };
}
function save(
  root: string,
  endpoint: string,
  body: string,
  installation: Installation,
): { outcome: CommandOutcome } | { error: string; conflict?: boolean } {
  const io = createNodeFileIo();
  try {
    const base = join(root, ".greenline");
    if (
      lstatSync(base).isSymbolicLink() ||
      (existsSync(join(base, "tmp")) && lstatSync(join(base, "tmp")).isSymbolicLink())
    )
      return { error: "Redirected policy writer is refused." };
  } catch {
    return { error: "Policy writer is unavailable." };
  }
  const locked = withWorkspaceWrite(root, () => {
    const texts = editableTexts(root, io);
    if (texts._tag === "err") return { error: texts.error.message };
    const json = parseJson(body);
    const parsed = endpoint === "/api/manifest" ? settings.safeParse(json) : prose.safeParse(json);
    if (!parsed.success) return { error: parsed.error.message };
    if (parsed.data.expectedRevision !== texts.value.revision)
      return {
        error: "Repository settings or policy changed; reload before saving.",
        conflict: true,
      };
    const path =
      endpoint === "/api/manifest"
        ? editable[0]
        : endpoint === "/api/policy"
          ? editable[1]
          : editable[2];
    const before =
      path === editable[0]
        ? texts.value.manifest
        : path === editable[1]
          ? texts.value.decisions
          : texts.value.agents;
    let after: string;
    if (endpoint === "/api/manifest") {
      const write = settings.parse(json),
        current = parseManifest(before, path);
      if (current._tag === "err") return { error: current.error.message };
      const next = {
        ...current.value,
        targets: write.targets ?? current.value.targets,
        skills:
          write.skills === undefined
            ? current.value.skills
            : keepConnectorChoices(write.skills, current.value.skills, installation),
        proceed: write.proceed ?? current.value.proceed,
        trials: write.trials ?? current.value.trials,
      };
      // The settings are checked against the installation's modes, as sync checks them.
      const checked = parseManifest(serializeManifest(next), path, rosterOf(installation));
      if (checked._tag === "err") return { error: checked.error.message };
      after = serializeManifest(checked.value);
    } else {
      const write = prose.parse(json);
      after = endpoint === "/api/rulings" ? withStanza(before, write.body) : write.body;
      if (endpoint === "/api/policy") {
        const checked = parseDecisionDocument(after, path);
        if (checked._tag === "err") return { error: checked.error.message };
      }
    }
    if (before === after) return { outcome: { ok: true, effects: [], diagnostics: [] } };
    const markerPath = ".greenline/policy-changes.json",
      previous = readInstalledFile(root, io, markerPath);
    if (previous._tag === "err" && previous.error.step !== "absent")
      return { error: previous.error.message };
    let entries: z.infer<typeof markers>;
    try {
      entries = markers.parse(
        previous._tag === "ok" ? JSON.parse(previous.value) : { schemaVersion: 1, changes: [] },
      );
    } catch {
      return { error: "Policy change evidence is invalid; repair it before saving." };
    }
    const next = {
      schemaVersion: 1,
      changes: [
        ...entries.changes.filter((entry) => entry.path !== path),
        { path, before: sha256Hex(before), after: sha256Hex(after), at: new Date().toISOString() },
      ],
    };
    const written = applyFilePlan(
      [
        { path: join(root, markerPath), content: JSON.stringify(next, null, 2) + "\n" },
        { path: join(root, path), content: after },
      ],
      io,
    );
    return written._tag === "err"
      ? { error: written.error.message }
      : { outcome: { ok: true, effects: [{ kind: "update" as const, path }], diagnostics: [] } };
  });
  return locked._tag === "err" ? { error: locked.error.message, conflict: true } : locked.value;
}
function send(
  response: ServerResponse,
  status: number,
  body:
    | InspectorState
    | { error: string }
    | { outcome: CommandOutcome; state: InspectorState | { error: string } }
    | (ChangesList & { html: string })
    | { change: ChangeDetail; html: string }
    | (PlansList & { html: string })
    | { plan: PlanDetail; html: string }
    | (KnowledgeList & { html: string })
    | { home: KnowledgeHome; html: string },
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}
async function readBody(request: IncomingMessage): Promise<string> {
  request.setEncoding("utf8");
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
    if (Buffer.byteLength(text) > 1048576) throw new Error("Request body too large.");
  }
  return text;
}
/** A path segment decoded; a malformed escape stays as written, so it names no change and is answered 404. */
function decodedPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
/** A loopback inspector with explicit saves and sync; no guidance API requests. */
export interface InspectorHandle {
  readonly url: string;
  readonly close: () => Promise<void>;
}
export function startInspector(
  root: string,
  env: CliEnvironment,
  port: number,
): Promise<InspectorHandle> {
  const server = createServer((request, response) => {
    void serve(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else send(response, 400, { error: "Inspector request failed." });
    });
  });
  async function serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = `127.0.0.1:${request.socket.localPort}`;
    if (
      request.headers.host !== host ||
      (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`)
    ) {
      send(response, 403, { error: "Inspector requests must come from its own local origin." });
      return;
    }
    const url = new URL(request.url ?? "/", `http://${host}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderInspectorPage());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      const state = inspectorState(root, env);
      send(response, "error" in state ? 409 : 200, state);
      return;
    }
    // The changes view: the list, and one change's page, each its data with the HTML it renders to.
    if (request.method === "GET" && url.pathname === "/api/changes") {
      const list = changesList(root, env, new Date());
      send(response, 200, { ...list, html: changesListHtml(list) });
      return;
    }
    const changePath = /^\/api\/changes\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && changePath !== null) {
      const detail = changeDetail(
        root,
        env,
        decodedPart(changePath[1] ?? ""),
        new Date(),
        commitLog(root),
      );
      if (detail === undefined) send(response, 404, { error: "No such change record." });
      else send(response, 200, { change: detail, html: changeHtml(detail) });
      return;
    }
    // The plans view: the plan directories, and one plan's page.
    if (request.method === "GET" && url.pathname === "/api/plans") {
      const list = plansList(root, env);
      send(response, 200, { ...list, html: plansListHtml(list) });
      return;
    }
    const planPath = /^\/api\/plans\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && planPath !== null) {
      const plan = planDetail(root, env, decodedPart(planPath[1] ?? ""));
      if (plan === undefined) send(response, 404, { error: "No such plan directory." });
      else send(response, 200, { plan, html: planHtml(plan) });
      return;
    }
    // The knowledge view: the homes the repository keeps, and one home's page.
    if (request.method === "GET" && url.pathname === "/api/knowledge") {
      const list = knowledgeList(root);
      send(response, 200, { ...list, html: knowledgeListHtml(list) });
      return;
    }
    const homePath = /^\/api\/knowledge\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && homePath !== null) {
      const home = knowledgeHome(root, decodedPart(homePath[1] ?? ""));
      if (home === undefined) send(response, 404, { error: "No such knowledge home here." });
      else send(response, 200, { home, html: knowledgeHomeHtml(home) });
      return;
    }
    if (
      request.method === "POST" &&
      ["/api/manifest", "/api/policy", "/api/rulings"].includes(url.pathname)
    ) {
      const result = save(root, url.pathname, await readBody(request), env.installation);
      if ("error" in result) send(response, result.conflict ? 409 : 400, { error: result.error });
      else send(response, 200, { outcome: result.outcome, state: inspectorState(root, env) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/sync") {
      const outcome = runCommand(
        {
          command: "sync",
          json: true,
          dryRun: false,
          yes: false,
          targets: undefined,
          forceManaged: [],
          port: undefined,
        },
        env,
      );
      send(response, 200, { outcome, state: inspectorState(root, env) });
      return;
    }
    send(response, 404, { error: "No such path." });
  }
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = z.object({ port: z.number() }).parse(server.address());
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
