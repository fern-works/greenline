import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import { parseGuidanceRequest, type GuidanceRequest } from "../../src/core/guidance-receipts.ts";
import type { FileIo } from "../../src/shell/fs/io.ts";
import { runConnectorsCallCli } from "../../src/shell/cli/connectors-call.ts";
import { makeRepository, read, removeRepository, run } from "./workspace.ts";

/**
 * A workspace with garden enabled against the synthetic garden command the
 * tests own (`fake-garden.mjs`), started through a launcher outside the
 * repository, and one execution account to own requests.
 */

/** The account garden requests belong to in these tests. */
export const ACCOUNT = "work-one";

/** The synthetic command's source. */
const FAKE = join(import.meta.dirname, "fake-garden.mjs");

/** One test's garden workspace and where its synthetic command logs. */
export interface GardenWorkspace {
  readonly root: string;
  /** The directory holding the launcher named `garden`, outside the repository. */
  readonly bin: string;
  readonly launcher: string;
  /** Where the synthetic command appends one line per run. */
  readonly log: string;
  readonly remove: () => void;
}

/** One call's recorded output, parsed. */
export interface CallRun {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  /** The JSON reply, from stdout on success and stderr on failure. */
  readonly reply: CallReply;
}

/** The fields of a call's JSON reply the tests read. */
export interface CallReply {
  readonly ok: boolean;
  readonly command: string;
  readonly request?: string | null | undefined;
  readonly error?: { readonly kind: string; readonly input: string } | undefined;
  readonly receipt?: JsonValue | undefined;
  readonly result?: JsonValue | undefined;
  readonly consultations?:
    | readonly { readonly unit: string; readonly consultation: string }[]
    | undefined;
}

const replySchema: z.ZodType<CallReply> = z.object({
  ok: z.boolean(),
  command: z.string(),
  request: z.string().nullable().optional(),
  error: z.object({ kind: z.string(), input: z.string() }).optional(),
  receipt: z.json().optional(),
  result: z.json().optional(),
  consultations: z.array(z.object({ unit: z.string(), consultation: z.string() })).optional(),
});

/** A launcher script that runs the synthetic command with this Node. */
function writeLauncher(directory: string): string {
  const path = join(directory, "garden");
  writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`);
  chmodSync(path, 0o755);
  return path;
}

/** A fresh workspace with garden enabled at the endpoint, run through the named executable. */
export function gardenWorkspace(
  prefix: string,
  options: { readonly endpoint?: string; readonly executable?: "launcher" | "garden" } = {},
): GardenWorkspace {
  const root = makeRepository(prefix);
  const outside = mkdtempSync(join(tmpdir(), `gl-garden-bin-${prefix}-`));
  const bin = join(outside, "bin");
  mkdirSync(bin);
  const launcher = writeLauncher(bin);
  const executable = options.executable === "garden" ? "garden" : launcher;
  const endpoint = options.endpoint ?? "https://garden.example/";
  const steps = [
    ["init", "--yes"],
    ["connectors", "enable", "garden", "--url", endpoint, "--executable", executable],
  ];
  for (const args of steps)
    if (run(root, args).code !== 0) throw new Error(`setup failed: ${args.join(" ")}`);
  mkdirSync(join(root, ".greenline/ledger/records"), { recursive: true });
  writeFileSync(
    join(root, `.greenline/ledger/records/${ACCOUNT}.json`),
    `${JSON.stringify({
      schemaVersion: 3,
      id: ACCOUNT,
      context: "ctx-one",
      actor: "agent",
      // Upkeep has no owning artifact, so the account stands without a work tree.
      role: "maintenance",
      work: null,
      scopes: ["."],
      selections: [],
    })}\n`,
  );
  return {
    root,
    bin,
    launcher,
    log: join(outside, "garden.log"),
    remove: () => {
      removeRepository(root);
      removeRepository(outside);
    },
  };
}

/** Run one `connectors call` in the workspace, the synthetic command answering in `mode`. */
export async function call(
  workspace: GardenWorkspace,
  args: readonly string[],
  options: {
    readonly mode?: string;
    readonly key?: string;
    readonly path?: string;
    readonly io?: FileIo;
    /** Run once the call has started its child, before any cancel. */
    readonly started?: () => void;
    /** Cancelled as soon as the call has started its child. */
    readonly cancel?: AbortController;
    /** More variables for the caller's environment. */
    readonly extra?: NodeJS.ProcessEnv;
    /** How the seal waits for a held lock. */
    readonly wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<CallRun> {
  let out = "";
  let err = "";
  const environment: NodeJS.ProcessEnv = {
    PATH: options.path ?? process.env["PATH"] ?? "",
    GARDEN_FAKE_MODE: options.mode ?? "fixture",
    GARDEN_FAKE_LOG: workspace.log,
  };
  if (options.key !== undefined) environment["GARDEN_API_KEY"] = options.key;
  Object.assign(environment, options.extra ?? {});
  const base = { cwd: workspace.root, environment };
  const cancellable =
    options.cancel === undefined ? base : { ...base, signal: options.cancel.signal };
  const withIo = options.io === undefined ? cancellable : { ...cancellable, io: options.io };
  const env = options.wait === undefined ? withIo : { ...withIo, wait: options.wait };
  const running = runConnectorsCallCli(
    ["garden", ...args],
    {
      stdout: {
        write: (text) => {
          out += text;
        },
      },
      stderr: {
        write: (text) => {
          err += text;
        },
      },
    },
    env,
  );
  // The child starts synchronously inside the call, so work queued now finds it running.
  setImmediate(() => {
    options.started?.();
    options.cancel?.abort();
  });
  const code = await running;
  const text = (code === 0 ? out : err).trim().split("\n").at(-1) ?? "";
  return { code, out, err, reply: replySchema.parse(JSON.parse(text)) };
}

/** The request collection a call wrote. */
export function stored(workspace: GardenWorkspace, id: string): GuidanceRequest {
  const parsed = parseGuidanceRequest(
    read(workspace.root, `.greenline/ledger/receipts/${id}.json`),
    id,
  );
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

/** Every run the synthetic command logged: its arguments, the key it saw and where it ran. */
export function runs(workspace: GardenWorkspace): readonly {
  readonly argv: readonly string[];
  readonly key: string | null;
  /** The names of greenline's own variables the child saw, in any case. */
  readonly greenline: readonly string[];
  readonly cwd: string;
}[] {
  if (!existsSync(workspace.log)) return [];
  return readFileSync(workspace.log, "utf8")
    .trim()
    .split("\n")
    .map((line) =>
      z
        .object({
          argv: z.array(z.string()),
          key: z.string().nullable(),
          greenline: z.array(z.string()),
          cwd: z.string(),
        })
        .parse(JSON.parse(line)),
    );
}
