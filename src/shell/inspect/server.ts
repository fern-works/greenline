import type { CaptureLimit } from "../../core/interface-check.ts";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { lstatSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { sha256Hex } from "../../commons/hash.ts";
import { parseManifest, serializeManifest } from "../../core/manifest.ts";
import type { SkillChoices } from "../../core/connectors/registry.ts";
import { parseDecisionDocument } from "../../core/root-statements.ts";
import { withStanza } from "../../core/inspect.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { applyFilePlan } from "../fs/apply.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { rosterOf } from "../repository-state.ts";
import type { Installation } from "../../core/installation.ts";
import { runCommand } from "../cli/commands.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import type { CommandOutcome } from "../cli/command-outcome.ts";
import { placeOf } from "./app/addresses.ts";
import { CLIENT_ASSET, renderShellPage } from "./page.ts";
import { readInstalledFile } from "./repository-read.ts";
import type { DesignPick } from "../../core/design-pick.ts";
import { captureAt, closeFromViewer, markFromViewer } from "./captures.ts";
import { markedCaptures } from "../marks.ts";
import { savePick } from "./interface.ts";
import { deleteVisual, rawVisual, VISUAL_POLICY } from "./visuals.ts";
import {
  decodedPart,
  editable,
  editableTexts,
  markers,
  type PolicyChanges,
  revision,
  unlisted,
  visualIdOf,
} from "./answers.ts";
import { BuilderPool, buildHere, type Built } from "./builder.ts";
import { DocumentReader, fsWatchSource, type Reading } from "./readers.ts";

export const INSPECT_DEFAULT_PORT = 7433;
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
    const path =
      endpoint === "/api/manifest"
        ? editable[0]
        : endpoint === "/api/policy"
          ? editable[1]
          : editable[2];
    // Each file is checked against its own revision, so a save of one is never refused for another's edit (J-165 S1).
    const standing =
      path === editable[0]
        ? texts.value.revisions.manifest
        : path === editable[1]
          ? texts.value.revisions.decisions
          : texts.value.revisions.agents;
    if (parsed.data.expectedRevision !== standing)
      return {
        error: `${path} changed since this page read it, so the save is refused; discard the draft to take the file as it stands.`,
        conflict: true,
      };
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
    let entries: PolicyChanges;
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
    | { error: string }
    | { pick: DesignPick }
    | { captured: string | null; limit: string | null; detail: CaptureLimit | null },
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}
/**
 * A document read through the cache: answered "not modified" with no body
 * when the page sends back the tag it holds, else the body with its tag.
 */
function sendReading(request: IncomingMessage, response: ServerResponse, reading: Reading): void {
  const type = { "content-type": "application/json; charset=utf-8" };
  // A refusal carries no tag and is asked again; a document is asked again each time, and its tag makes the answer a diff.
  if (reading.status !== 200) {
    response.writeHead(reading.status, { ...type, "cache-control": "no-store" });
    response.end(reading.body);
    return;
  }
  const headers = { ...type, "cache-control": "no-cache", etag: reading.tag };
  if (request.headers["if-none-match"] === reading.tag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, headers);
  response.end(reading.body);
}
/** A write's answer with the settings as they now stand, read through the cache. */
function sendWithState(response: ServerResponse, outcome: CommandOutcome, state: Reading): void {
  sendJoined(response, { outcome: JSON.stringify(outcome), settings: state.body });
}
/** A write's answer of several parts, each already JSON text, as one object. */
function sendJoined(response: ServerResponse, parts: Readonly<Record<string, string>>): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(
    `{${Object.entries(parts)
      .map(([key, text]) => `${JSON.stringify(key)}:${text}`)
      .join(",")}}`,
  );
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
/**
 * What the shell's page may load: its own script and the contract from its
 * own origin, its inline style and the fonts embedded in it; nothing from
 * another host, and no inline script.
 */
const SHELL_POLICY =
  "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; font-src data:; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * The client asset beside the CLI's bundle, read each time it is asked so a
 * rebuild shows on the next reload; undefined when this checkout has none.
 * @returns the asset's text, or undefined
 */
async function clientAsset(): Promise<string | undefined> {
  try {
    return await readFile(new URL(`./${CLIENT_ASSET}`, import.meta.url), "utf8");
  } catch {
    return undefined;
  }
}

/** How the inspector builds and reports its reads. */
export interface InspectorOptions {
  /** Each read's line, for `greenline inspect --timing`. */
  readonly timing?: (line: string) => void;
  /**
   * Where documents are built: on builder threads, so no request waits on a
   * build, as `greenline inspect` asks; or, the default for any other
   * caller, a test's, in the server's own thread, one build at a time.
   */
  readonly builders?: "threads" | "here";
  /**
   * Watch the working tree for writes elsewhere than the ledger, the
   * installation and git, as `greenline inspect` asks; another caller's
   * server, a test's, does not unless it asks, and sees such a write at its
   * own next write.
   */
  readonly watch?: boolean;
}

/** A loopback inspector with explicit saves and sync; no guidance API requests. */
export interface InspectorHandle {
  readonly url: string;
  /** The port it listens on, which the address file records (J-142 S1). */
  readonly port: number;
  readonly close: () => Promise<void>;
}
export function startInspector(
  root: string,
  env: CliEnvironment,
  port: number,
  client: () => string | undefined | Promise<string | undefined> = clientAsset,
  options: InspectorOptions = {},
): Promise<InspectorHandle> {
  const pool = options.builders === "threads" ? new BuilderPool(root, env) : undefined;
  // A build on a thread that cannot start, or that fails, is built here instead: slower, and still answered.
  const build = async (address: string, query: string, state: string): Promise<Built> => {
    if (pool !== undefined)
      try {
        return await pool.build(address, query, state);
      } catch (error) {
        // A closing server builds nothing more; any other refusal, this thread can build.
        if (pool.closing) throw error;
      }
    return buildHere(root, env, address, query, state);
  };
  const reader = new DocumentReader(root, {
    build,
    watch: options.watch === true ? fsWatchSource : undefined,
    timing: options.timing,
    edition: `${env.version} ${env.installation.revision}`,
  });

  /** The settings as they stand after a write, read again through the cache. */
  const stateAfterWrite = (): Promise<Reading> => {
    reader.moveState();
    return reader.read("/api/settings", new URLSearchParams());
  };
  const server = createServer((request, response) => {
    void serve(request, response)
      .catch(() => {
        if (response.headersSent) response.destroy();
        else send(response, 400, { error: "Inspector request failed." });
      })
      // A write the server made moves the state now, before the watcher sees it.
      .finally(() => {
        if (request.method === "POST") reader.moveState();
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
    // The shell answers every path the app shows; the app reads the contract under /api/.
    if (request.method === "GET" && placeOf(url.pathname) !== undefined) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": SHELL_POLICY,
      });
      response.end(renderShellPage());
      return;
    }
    if (request.method === "GET" && url.pathname === `/${CLIENT_ASSET}`) {
      const asset = await client();
      response.writeHead(asset === undefined ? 503 : 200, {
        "content-type":
          asset === undefined ? "text/plain; charset=utf-8" : "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        asset ??
          "The inspector's client is not built in this checkout: run pnpm build, then greenline inspect from dist/bin.",
      );
      return;
    }
    // A visual's own bytes, shown in place by the Visuals view: an SVG as an image, an HTML page in a sandboxed frame.
    const raw = /^\/raw\/visuals\/(.+)$/.exec(url.pathname)?.[1];
    if (request.method === "GET" && raw !== undefined) {
      const id = visualIdOf(raw);
      const answer =
        id === undefined
          ? ({
              status: 404,
              type: "text/plain; charset=utf-8",
              body: "No such visual file.",
            } as const)
          : rawVisual(root, id);
      response.writeHead(answer.status, {
        "content-type": answer.type,
        "cache-control": "no-store",
        "content-security-policy": answer.status === 200 ? answer.policy : VISUAL_POLICY,
        "x-content-type-options": "nosniff",
      });
      response.end(answer.body);
      return;
    }
    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      response.writeHead(404, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": SHELL_POLICY,
      });
      // The app draws the not-found page, which offers the records the address's words name (J-158 S2).
      response.end(renderShellPage());
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/")) {
      sendReading(request, response, await reader.read(url.pathname, url.searchParams));
      return;
    }
    if (
      request.method === "POST" &&
      ["/api/manifest", "/api/policy", "/api/rulings"].includes(url.pathname)
    ) {
      const result = save(root, url.pathname, await readBody(request), env.installation);
      if ("error" in result) send(response, result.conflict ? 409 : 400, { error: result.error });
      else sendWithState(response, result.outcome, await stateAfterWrite());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/pictures/delete") {
      const result = deleteVisual(root, await readBody(request));
      if ("error" in result)
        send(response, result.conflict === true ? 409 : 400, { error: result.error });
      else {
        reader.moveState();
        const pictures = await reader.read("/api/pictures", new URLSearchParams());
        sendJoined(response, { removed: JSON.stringify(result.removed), pictures: pictures.body });
      }
      return;
    }
    // Capture now: the owner's running page rendered and kept as a capture (J-124 S1); a limit is an answer, never an error.
    if (request.method === "POST" && url.pathname === "/api/captures") {
      // The viewer's own address, which capture now refuses as the app's (J-191 S1).
      const own = z.object({ port: z.number() }).safeParse(server.address());
      const answer = await captureAt(
        root,
        await readBody(request),
        env.environment ?? process.env,
        markedCaptures(root),
        own.success ? `http://127.0.0.1:${String(own.data.port)}/` : undefined,
      );
      if (answer.kind === "refused") send(response, 400, { error: answer.error });
      else if (answer.kind === "limit")
        send(response, 200, { captured: null, limit: answer.limit, detail: answer.detail });
      else send(response, 200, { captured: answer.capture, limit: null, detail: null });
      return;
    }
    // The owner's mark and the owner's closure, each with the revision check (J-124 S2).
    const closing = /^\/api\/marks\/(m[0-9a-f]{7})\/close$/.exec(url.pathname)?.[1];
    if (request.method === "POST" && (url.pathname === "/api/marks" || closing !== undefined)) {
      const body = await readBody(request);
      const written =
        closing === undefined ? markFromViewer(root, body) : closeFromViewer(root, closing, body);
      if (written.kind === "refused")
        send(response, written.conflict ? 409 : 400, { error: written.error });
      else {
        reader.moveState();
        const facing = await reader.read("/api/interface", new URLSearchParams());
        sendJoined(response, { mark: JSON.stringify(written.mark), interface: facing.body });
      }
      return;
    }
    // The deal view's pick, its one write, with the revision check (J-123 S7).
    const picked = /^\/api\/changes\/([^/]+)\/deal\/pick$/.exec(url.pathname)?.[1];
    if (request.method === "POST" && picked !== undefined) {
      const result = savePick(root, decodedPart(picked), await readBody(request));
      if (result.kind === "refused")
        send(response, result.conflict ? 409 : 400, { error: result.error });
      else send(response, 200, { pick: result.pick });
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
      sendWithState(response, outcome, await stateAfterWrite());
      return;
    }
    send(response, 404, { error: "No such path." });
  }
  return new Promise((resolve, reject) => {
    // A server that cannot listen leaves no watcher or builder behind.
    server.once("error", (error) => {
      reader.close();
      void pool?.close();
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      const address = z.object({ port: z.number() }).parse(server.address());
      // The watcher starts once the server listens, after the caller has its address.
      setImmediate(() => reader.startWatching());
      // The builders start now, so the first read waits on no thread's start (J-165 S1).
      pool?.warm();
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        port: address.port,
        close: () =>
          new Promise((done) => {
            reader.close();
            void pool?.close();
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
