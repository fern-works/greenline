import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { join, sep } from "node:path";
import { realpathSync, lstatSync, existsSync } from "node:fs";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { err } from "../../commons/result.ts";
import { sha256Hex } from "../../commons/hash.ts";
import { parseManifest, serializeManifest, type Manifest } from "../../core/manifest.ts";
import { guidanceConfigurationSchema } from "../../core/guidance-configuration.ts";
import { parseDecisionDocument, type RootStatement } from "../../core/root-statements.ts";
import { parseHouseRulings } from "../../core/house-rulings.ts";
import { lineDiff, withStanza, type DiffLine } from "../../core/inspect.ts";
import { parseLock } from "../../core/lock.ts";
import { renderProjection } from "../../core/render.ts";
import { buildStatusView, type ProjectView } from "../../core/status.ts";
import type { ExecutionLedger } from "../../core/execution-ledger.ts";
import { AtomicWriteFailed, createNodeFileIo, type FileIo } from "../fs/io.ts";
import { applyFilePlan } from "../fs/apply.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { readExecutionLedger } from "../execution-ledger.ts";
import { collectArtifacts } from "../artifacts.ts";
import { runCommand } from "../cli/commands.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import type { CommandOutcome } from "../cli/command-outcome.ts";
import type { Diagnostic } from "../cli/output.ts";
import { renderInspectorPage } from "./page.ts";

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
  readonly ledger: ExecutionLedger | null;
  readonly work: ProjectView;
  readonly checks: readonly Diagnostic[];
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
  readonly skills: readonly {
    readonly name: string;
    readonly installed: boolean;
    readonly optIn: boolean;
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
/** Refuse installed-context links outside the repository before reading content. */
function readInstalledFile(root: string, io: FileIo, path: string): ReturnType<FileIo["read"]> {
  const location = join(root, path);
  try {
    const resolved = realpathSync(location);
    if (!resolved.startsWith(realpathSync(root) + sep))
      return err(
        new AtomicWriteFailed(path, "read", "installed context resolves outside the repository"),
      );
    return io.read(resolved);
  } catch (error) {
    const absent = z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
    return err(new AtomicWriteFailed(path, absent ? "absent" : "read", String(error)));
  }
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

function inspectorState(root: string, env: CliEnvironment): InspectorState | { error: string } {
  const io = createNodeFileIo(),
    texts = editableTexts(root, io);
  if (texts._tag === "err") return { error: texts.error.message };
  const manifest = parseManifest(texts.value.manifest, ".greenline/manifest.json"),
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
  const ledger = readExecutionLedger(root, io),
    artifacts = collectArtifacts(join(root, ".greenline/work"));
  const doctor = runCommand(
    {
      command: "doctor",
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
    ledger: ledger._tag === "ok" ? ledger.value : null,
    work: buildStatusView(artifacts._tag === "ok" ? artifacts.value.parsed : []),
    checks: doctor.diagnostics,
    files,
    changes: { baseline: baseline?.revision ?? null, files: changes, unavailable },
    skills: env.installation.skills.map((skill) => ({
      name: skill.name,
      installed: files.some(
        (file) => file.path.endsWith(`/skills/${skill.name}/SKILL.md`) && file.content !== null,
      ),
      optIn: skill.optIn === true,
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
    guidance: guidanceConfigurationSchema.optional(),
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
function save(
  root: string,
  endpoint: string,
  body: string,
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
        skills: write.skills ?? current.value.skills,
        guidance: write.guidance ?? current.value.guidance,
      };
      const checked = parseManifest(serializeManifest(next), path);
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
    | { outcome: CommandOutcome; state: InspectorState | { error: string } },
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
    if (
      request.method === "POST" &&
      ["/api/manifest", "/api/policy", "/api/rulings"].includes(url.pathname)
    ) {
      const result = save(root, url.pathname, await readBody(request));
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
