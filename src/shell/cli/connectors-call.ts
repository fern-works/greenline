import { randomUUID } from "node:crypto";
import { parse } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../commons/hash.ts";
import { err, ok, type Result } from "../../commons/result.ts";
import {
  GARDEN_MAX_BYTES,
  GARDEN_MAX_DEADLINE_MS,
  GARDEN_MAX_UNITS,
  gardenArguments,
  type GardenConfiguration,
  type GardenRead,
} from "../../core/connectors/garden.ts";
import type { GardenCallIdentity, GardenReply } from "../../core/connectors/garden-result.ts";
import {
  projectConnectorReceipt,
  type ConnectorsConfiguration,
} from "../../core/connectors/registry.ts";
import type { LedgerRecord } from "../../core/execution-ledger.ts";
import {
  receiptConsultationId,
  requestLimitsSchema,
  type GuidanceReceipt,
  type GuidanceRequest,
  type ReceiptUnit,
  type RequestBinding,
  type RequestLimits,
} from "../../core/guidance-receipts.ts";
import { rootExclusionSubjects, type RootStatement } from "../../core/root-statements.ts";
import { callGarden, type GardenCallOutcome } from "../connectors/garden.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import { GuidanceRequests } from "../guidance-requests.ts";
import {
  readRepositoryAccount,
  readRepositoryDecisions,
  readRepositoryManifest,
} from "../repository-state.ts";
import {
  parseGardenCallArgs,
  type GardenCallCommand,
  type GardenCallRead,
} from "./connectors-call-args.ts";

/**
 * `greenline connectors call garden <operation>` (contract T2): one garden
 * read inside a greenline request. The pending receipt is written before
 * the call starts; its seal is written after the reply is validated; the
 * reply's result reaches the caller only after that seal is persisted, and
 * it is never stored. The first successful call fixes the request's
 * publication, and no later call rebinds it.
 */

/** Awaitable output, so a stream failure after persistence is still seen. */
export interface ConnectorsCallWriter {
  readonly stdout: { readonly write: (text: string) => void | Promise<void> };
  readonly stderr: { readonly write: (text: string) => void | Promise<void> };
}

/** What the harness supplies: where the call runs, what it passes on, how it is cancelled. */
export interface ConnectorsCallEnvironment {
  readonly cwd: string;
  /** Passed to garden unread; its key stays in it and nowhere else. */
  readonly environment: NodeJS.ProcessEnv;
  readonly io?: FileIo;
  readonly now?: () => string;
  readonly signal?: AbortSignal;
  /** How the seal waits for another writer's lock; real time unless a test supplies its own. */
  readonly wait?: (ms: number) => Promise<void>;
}

/** How many times a seal meets another writer's lock or a moved binding before it gives up. */
const SETTLE_ATTEMPTS = 20;
/** The wait between two attempts on a held lock. */
const SETTLE_WAIT_MS = 50;

/** A refusal or failure as the caller reads it. */
interface CallFailure {
  readonly kind: string;
  readonly input: string;
}

/** A call refused before garden ran: its kind and what was refused, never a body or a key. */
class CallRefused extends Error {
  readonly _tag = "CallRefused" as const;
  readonly kind: string;
  readonly input: string;
  constructor(kind: string, input: string) {
    super(`${kind}: ${input}`);
    this.kind = kind;
    this.input = input;
  }
}

/** What a receipt records about a call before it runs, besides what every call records. */
type ReceiptStart = Pick<
  GuidanceReceipt,
  "operation" | "query" | "requested" | "closure" | "excluded"
>;

/** One call planned: the read garden runs, the call its reply must answer, the receipt it starts. */
interface PlannedCall {
  readonly read: GardenRead;
  readonly identity: Omit<GardenCallIdentity, "callId">;
  readonly start: ReceiptStart;
}

/** A finished call's receipt facts, and the validated success they came from. */
type Sealed =
  | {
      readonly kind: "delivered";
      readonly reply: Extract<GardenReply, { ok: true }>;
      readonly units: readonly ReceiptUnit[];
      readonly count: number;
      readonly binding: RequestBinding | undefined;
    }
  | { readonly kind: "failed"; readonly error: CallFailure };

/** Everything a call needs before anything is written. */
interface Prepared {
  readonly root: string;
  readonly io: FileIo;
  readonly garden: GardenConfiguration;
  readonly connectors: ConnectorsConfiguration;
  readonly store: GuidanceRequests;
  readonly now: () => string;
  readonly policyRevision: string;
  readonly roots: readonly string[];
  readonly statements: readonly RootStatement[];
  readonly request: GuidanceRequest;
  /** Whether the request's collection already exists on disk. */
  readonly persisted: boolean;
}

const DEFAULT_LIMITS: RequestLimits = {
  maxUnits: GARDEN_MAX_UNITS,
  maxBytes: GARDEN_MAX_BYTES,
  timeoutMs: GARDEN_MAX_DEADLINE_MS,
};
const projectedDelivery = z.object({
  units: z.array(z.object({ id: z.string(), revision: z.string(), contentHash: z.string() })),
});

/** Run one call; the exit code is 0 for a recorded success, 1 for a failure, 2 for a usage refusal. */
export async function runConnectorsCallCli(
  argv: readonly string[],
  writer: ConnectorsCallWriter,
  env: ConnectorsCallEnvironment,
): Promise<number> {
  const parsed = parseGardenCallArgs(argv);
  if (parsed.kind === "help") {
    await writer.stdout.write(parsed.text);
    return 0;
  }
  if (parsed.kind === "error") {
    await writer.stderr.write(
      `${JSON.stringify({ schemaVersion: 1, command: "connectors call", ok: false, error: { kind: "invalid-request", input: parsed.message } })}\n`,
    );
    return 2;
  }
  const command = parsed.command;
  const name = `connectors call garden ${command.read.operation}`;
  const supporting: GuidanceReceipt[] = [];
  let handle: string | null = null;
  const fail = async (
    failure: CallFailure,
    receipt: GuidanceReceipt | null = null,
  ): Promise<number> => {
    await writer.stderr.write(
      `${JSON.stringify({
        schemaVersion: 1,
        command: name,
        ok: false,
        error: failure,
        request: handle,
        receipt,
        supportingReceipts: supporting,
      })}\n`,
    );
    return 1;
  };
  const prepared = prepare(command, env);
  if (prepared._tag === "err")
    return fail({ kind: prepared.error.kind, input: prepared.error.input });
  const { root, io, garden, connectors, store, now, policyRevision, roots } = prepared.value;
  let request = prepared.value.request;
  let persisted = prepared.value.persisted;
  handle = request.id;
  // garden runs from the filesystem root, so nothing relative reaches into the repository.
  const context = { environment: env.environment, cwd: parse(root).root, signal: env.signal };
  const wait =
    env.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // The call is refused if the policy or the endpoint moved while it ran.
  const moved = (): CallFailure | undefined => {
    const policy = readRepositoryDecisions(root, io);
    if (policy._tag === "err" || sha256Hex(policy.value.body) !== policyRevision)
      return { kind: "configuration", input: "the repository's policy changed during the call" };
    const manifest = readRepositoryManifest(root, io);
    if (manifest._tag === "err" || manifest.value.connectors.garden?.endpoint !== garden.endpoint)
      return { kind: "configuration", input: "garden's endpoint changed during the call" };
    return undefined;
  };
  /** One recorded call: its pending receipt first, then garden, then its seal. */
  const recorded = async (
    planned: PlannedCall,
  ): Promise<
    | { readonly ok: true; readonly receipt: GuidanceReceipt; readonly reply: Sealed }
    | {
        readonly ok: false;
        readonly failure: CallFailure;
        readonly receipt: GuidanceReceipt | null;
      }
  > => {
    const callId = randomUUID();
    const args = gardenArguments(planned.read, {
      endpoint: garden.endpoint,
      callId,
      timeoutMs: request.limits.timeoutMs,
    });
    if (args._tag === "err")
      return {
        ok: false,
        failure: { kind: "invalid-request", input: args.error.message },
        receipt: null,
      };
    if (!persisted) {
      const created = store.create(request);
      if (created._tag === "err")
        return { ok: false, failure: evidence(created.error), receipt: null };
      persisted = true;
    }
    const pending = store.begin(request, {
      ...planned.start,
      id: callId,
      roots,
      policyRevision,
      startedAt: now(),
      nativeCall: command.call ?? null,
    });
    if (pending._tag === "err")
      return { ok: false, failure: evidence(pending.error), receipt: null };
    const outcome = await callGarden(
      connectors,
      args.value,
      { ...planned.identity, callId },
      request.limits.timeoutMs,
      context,
    );
    // The seal waits out another writer's lock, and a binding another call of
    // this request fixed meanwhile is re-read and judged against, never replaced.
    for (let attempt = 1; ; attempt += 1) {
      const sealed = seal(outcome, moved(), request.binding);
      const settled = store.settle(request, callId, sealFacts(sealed, now()));
      if (settled._tag === "ok") {
        request = settled.value.request;
        return sealed.kind === "failed"
          ? { ok: false, failure: sealed.error, receipt: settled.value.receipt }
          : { ok: true, receipt: settled.value.receipt, reply: sealed };
      }
      // A write that may have landed before its lock was released is confirmed from the file.
      if (settled.error.input === "receipt write unconfirmed") {
        const fresh = store.read(request.id);
        const written =
          fresh._tag === "ok"
            ? fresh.value.receipts.find((entry) => entry.id === callId)
            : undefined;
        if (fresh._tag === "err" || written === undefined || written.outcome === "pending")
          return { ok: false, failure: evidence(settled.error), receipt: pending.value };
        request = fresh.value;
        return sealed.kind === "failed"
          ? { ok: false, failure: sealed.error, receipt: written }
          : { ok: true, receipt: written, reply: sealed };
      }
      const busy = settled.error.input === "receipt write lock";
      const rebound = settled.error.input === "request binding changed";
      // A receipt that cannot be written is an evidence failure, never a recorded success.
      if (attempt >= SETTLE_ATTEMPTS || (!busy && !rebound))
        return { ok: false, failure: evidence(settled.error), receipt: pending.value };
      if (busy) await wait(SETTLE_WAIT_MS);
      else {
        const fresh = store.read(request.id);
        if (fresh._tag === "err")
          return { ok: false, failure: evidence(fresh.error), receipt: pending.value };
        request = fresh.value;
      }
    }
  };
  const read = command.read;
  const subjects = rootExclusionSubjects(prepared.value.statements, roots);
  const declared = read.operation === "read" ? [...read.exclude, ...subjects.units] : [];
  // The call's own inputs are checked before any call runs, a supporting listing included.
  const checked = gardenArguments(plan(read, request, garden.endpoint, declared).read, {
    endpoint: garden.endpoint,
    callId: randomUUID(),
    timeoutMs: request.limits.timeoutMs,
  });
  if (checked._tag === "err")
    return fail({ kind: "invalid-request", input: checked.error.message });
  // A responsibility-group exclusion becomes unit ids through a recorded listing.
  let excluded: readonly string[] = [];
  if (read.operation === "read") {
    const ids = new Set(declared);
    for (const responsibility of subjects.groups) {
      const snapshot = publicationFor(request, read.snapshot);
      const listed = await recorded({
        read: { operation: "list", snapshot, query: { responsibility: [responsibility] } },
        identity: {
          operation: "list",
          origin: garden.endpoint,
          timeoutMs: request.limits.timeoutMs,
          publication: exact(snapshot),
        },
        start: {
          operation: "list",
          query: { ...EMPTY_QUERY, responsibility: [responsibility] },
          requested: [],
          closure: false,
          excluded: [],
        },
      });
      if (!listed.ok) return fail(listed.failure, listed.receipt);
      supporting.push(listed.receipt);
      if (listed.reply.kind !== "delivered" || listed.reply.reply.listed.length === 0)
        return fail({
          kind: "configuration",
          input: `excluded option group ${responsibility} has no members in this publication`,
        });
      for (const unit of listed.reply.reply.listed) {
        ids.add(unit.id);
        for (const child of unit.contains) ids.add(child);
      }
    }
    excluded = [...ids].sort();
  }
  const main = await recorded(plan(read, request, garden.endpoint, excluded));
  if (!main.ok) return fail(main.failure, main.receipt);
  const receipt = main.receipt;
  const consultations = receipt.units
    .filter((unit) => unit.coverage === "full")
    .map((unit) => ({
      unit: unit.id,
      consultation: receiptConsultationId(request.id, receipt.sequence, unit.id),
    }));
  try {
    await writer.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        command: name,
        ok: true,
        connector: "garden",
        request: request.id,
        receipt,
        supportingReceipts: supporting,
        consultations,
        capture: "unconfirmed",
        result: main.reply.kind === "delivered" ? main.reply.reply.result : null,
      })}\n`,
    );
  } catch {
    return fail(
      { kind: "unavailable", input: "output; the receipt records garden's delivery only" },
      receipt,
    );
  }
  return 0;
}

const EMPTY_QUERY: NonNullable<GuidanceReceipt["query"]> = {
  language: [],
  purpose: [],
  technology: [],
  task: [],
  concern: [],
  kind: [],
  responsibility: [],
};

/** The repository, garden's entry and the request a call belongs to, before anything is written. */
function prepare(
  command: GardenCallCommand,
  env: ConnectorsCallEnvironment,
): Result<Prepared, CallRefused> {
  const refuse = (input: string): Result<never, CallRefused> =>
    err(new CallRefused("configuration", input));
  const root = findGitRoot(env.cwd);
  if (root === undefined) return refuse("a Git repository");
  const io = env.io ?? createNodeFileIo();
  const manifest = readRepositoryManifest(root, io);
  if (manifest._tag === "err") return refuse(`the manifest: ${issues(manifest.error)}`);
  const garden = manifest.value.connectors.garden;
  if (garden === undefined)
    return refuse(
      "garden is not enabled for this repository; run 'greenline connectors enable garden --url URL'",
    );
  const decisions = readRepositoryDecisions(root, io);
  if (decisions._tag === "err") return refuse(`the decision book: ${issues(decisions.error)}`);
  const policyRevision = sha256Hex(decisions.value.body);
  const store = new GuidanceRequests(root, io);
  const now = env.now ?? ((): string => new Date().toISOString());
  if ((command.record === undefined) === (command.request === undefined))
    return refuse("choose --record for a new request or --request to continue one");
  const opened =
    command.record !== undefined
      ? open(command, command.record, root, io, garden, now)
      : resume(command, command.request ?? "", root, io, store, garden, policyRevision);
  if (opened._tag === "err") return opened;
  const { request, account } = opened.value;
  return ok({
    root,
    io,
    garden,
    connectors: manifest.value.connectors,
    store,
    now,
    policyRevision,
    roots: command.roots.length > 0 ? command.roots : account.scopes,
    statements: decisions.value.roots,
    request,
    persisted: command.request !== undefined,
  });
}

/** A new request, unresolved until its first successful call; nothing is written yet. */
function open(
  command: GardenCallCommand,
  record: string,
  root: string,
  io: FileIo,
  garden: GardenConfiguration,
  now: () => string,
): Result<{ request: GuidanceRequest; account: LedgerRecord }, CallRefused> {
  const owner = readRepositoryAccount(root, io, record);
  if (owner._tag === "err")
    return err(new CallRefused("configuration", `the execution account: ${issues(owner.error)}`));
  const account = owner.value;
  if (command.context !== undefined && command.context !== account.context)
    return err(new CallRefused("configuration", "--context differs from the account"));
  const limits = requestLimitsSchema.safeParse({
    maxUnits: command.maxUnits ?? DEFAULT_LIMITS.maxUnits,
    maxBytes: command.maxBytes ?? DEFAULT_LIMITS.maxBytes,
    timeoutMs: command.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
  });
  if (
    !limits.success ||
    limits.data.maxUnits > GARDEN_MAX_UNITS ||
    limits.data.maxBytes > GARDEN_MAX_BYTES ||
    limits.data.timeoutMs > GARDEN_MAX_DEADLINE_MS
  )
    return err(
      new CallRefused("configuration", "limits: at most 16 units, 262144 bytes and 30000 ms"),
    );
  const read = command.read;
  const asked =
    read.operation === "changes"
      ? read.from
      : read.operation === "snapshot"
        ? read.id
        : read.snapshot;
  return ok({
    account,
    request: {
      schemaVersion: 4,
      id: randomUUID(),
      source: "garden",
      owner: {
        record: account.id,
        context: account.context,
        role: account.role,
        work: account.work,
      },
      parent: null,
      createdAt: now(),
      binding: { state: "unresolved", origin: garden.endpoint },
      // Naming an exact publication, or a pair, opens historical reading.
      publicationUse: asked === undefined || asked === "current" ? "current" : "historical",
      limits: limits.data,
      receipts: [],
      advisories: [],
    },
  });
}

/** A stored garden request this call may continue, or why it may not. */
function resume(
  command: GardenCallCommand,
  handle: string,
  root: string,
  io: FileIo,
  store: GuidanceRequests,
  garden: GardenConfiguration,
  policyRevision: string,
): Result<{ request: GuidanceRequest; account: LedgerRecord }, CallRefused> {
  const stored = store.read(handle);
  if (stored._tag === "err")
    return err(new CallRefused("configuration", `the request: ${stored.error.input}`));
  const request = stored.value;
  if (request.source !== "garden")
    return err(new CallRefused("configuration", "the request is not a garden request"));
  const owner = readRepositoryAccount(root, io, request.owner.record ?? "");
  if (
    owner._tag === "err" ||
    owner.value.context !== request.owner.context ||
    owner.value.role !== request.owner.role ||
    JSON.stringify(owner.value.work ?? null) !== JSON.stringify(request.owner.work ?? null) ||
    (command.record !== undefined && command.record !== request.owner.record) ||
    (command.context !== undefined && command.context !== request.owner.context)
  )
    return err(
      new CallRefused(
        "configuration",
        "the request's contributor changed; open a new request with --record",
      ),
    );
  if (request.binding.origin !== garden.endpoint)
    return err(
      new CallRefused(
        "configuration",
        "garden's endpoint changed since this request began; open a new request with --record",
      ),
    );
  const last = request.receipts.at(-1);
  if (last !== undefined && last.policyRevision !== policyRevision)
    return err(
      new CallRefused(
        "configuration",
        "the repository's policy changed since this request began; open a new request with --record",
      ),
    );
  if (
    (command.maxUnits !== undefined && command.maxUnits !== request.limits.maxUnits) ||
    (command.maxBytes !== undefined && command.maxBytes !== request.limits.maxBytes) ||
    (command.timeoutMs !== undefined && command.timeoutMs !== request.limits.timeoutMs)
  )
    return err(new CallRefused("configuration", "a request's limits are frozen when it opens"));
  const refused = incompatibility(request, command.read);
  return refused === undefined
    ? ok({ request, account: owner.value })
    : err(new CallRefused("configuration", refused));
}

/** Why a continued request cannot take this read; undefined when it can. */
function incompatibility(request: GuidanceRequest, read: GardenCallRead): string | undefined {
  const compares = request.receipts.some((entry) => entry.operation === "changes");
  const reads = request.receipts.some((entry) => entry.operation !== "changes");
  if (read.operation === "changes") {
    if (request.binding.state === "publication" || reads)
      return "a comparison never continues a read request; open one of its own with --record";
    if (
      request.binding.state === "comparison" &&
      (request.binding.from.id !== read.from || request.binding.to.id !== read.to)
    )
      return `the request compares ${request.binding.from.id} with ${request.binding.to.id}`;
    // An unresolved comparison retries the pair its first call named.
    const first = request.receipts[0]?.requested;
    if (first !== undefined && (first[0] !== read.from || first[1] !== read.to))
      return `the request compares ${first.join(" with ")}; open a new request with --record`;
    return undefined;
  }
  if (request.binding.state === "comparison" || compares)
    return "a comparison request holds comparisons only";
  const asked = read.operation === "snapshot" ? read.id : read.snapshot;
  if (request.binding.state === "publication")
    return asked !== undefined && asked !== request.binding.snapshot.id
      ? `the request is bound to publication ${request.binding.snapshot.id}; open a new request with --record`
      : undefined;
  // An unresolved request keeps what it opened for: current, or an exact publication named again.
  const exactly = asked !== undefined && asked !== "current";
  if (request.publicationUse === "current" && exactly)
    return "the request reads the current publication; open a new request with --record to read an exact one";
  if (request.publicationUse === "historical" && !exactly)
    return "the request reads an exact publication; name it with --snapshot, or --id for snapshot";
  return undefined;
}

/** The publication a call names: the request's bound one, else what the caller asked for, else current. */
function publicationFor(request: GuidanceRequest, asked: string | undefined): string {
  return request.binding.state === "publication"
    ? request.binding.snapshot.id
    : (asked ?? "current");
}

/** An exact publication id, or undefined for current. */
function exact(snapshot: string): string | undefined {
  return snapshot === "current" ? undefined : snapshot;
}

/** The read garden runs, the call it must answer and the receipt it starts. */
function plan(
  read: GardenCallRead,
  request: GuidanceRequest,
  origin: string,
  excluded: readonly string[],
): PlannedCall {
  const base = { query: null, requested: [], closure: false, excluded: [] };
  const timeoutMs = request.limits.timeoutMs;
  switch (read.operation) {
    case "snapshot": {
      const id = publicationFor(request, read.id);
      return {
        read: { operation: "snapshot", id },
        identity: { operation: "snapshot", origin, timeoutMs, publication: exact(id) },
        start: { ...base, operation: "snapshot", requested: [id] },
      };
    }
    case "vocabulary": {
      const snapshot = publicationFor(request, read.snapshot);
      return {
        read: { operation: "vocabulary", snapshot },
        identity: { operation: "vocabulary", origin, timeoutMs, publication: exact(snapshot) },
        start: { ...base, operation: "vocabulary" },
      };
    }
    case "list": {
      const snapshot = publicationFor(request, read.snapshot);
      return {
        read: { operation: "list", snapshot, query: read.query },
        identity: { operation: "list", origin, timeoutMs, publication: exact(snapshot) },
        start: { ...base, operation: "list", query: { ...EMPTY_QUERY, ...read.query } },
      };
    }
    case "read": {
      const snapshot = publicationFor(request, read.snapshot);
      return {
        read: {
          operation: "read",
          snapshot,
          ids: read.ids,
          requires: read.requires,
          exclude: excluded,
          maxUnits: request.limits.maxUnits,
          maxBytes: request.limits.maxBytes,
        },
        identity: {
          operation: "read",
          origin,
          timeoutMs,
          publication: exact(snapshot),
          read: {
            ids: read.ids,
            requires: read.requires,
            exclude: excluded,
            maxUnits: request.limits.maxUnits,
            maxBytes: request.limits.maxBytes,
          },
        },
        start: {
          ...base,
          operation: "read",
          requested: read.ids,
          closure: read.requires,
          excluded,
        },
      };
    }
    case "resolve": {
      const snapshot = publicationFor(request, read.snapshot);
      return {
        read: { operation: "resolve", snapshot, anchor: read.anchor },
        identity: {
          operation: "resolve",
          origin,
          timeoutMs,
          publication: exact(snapshot),
          anchor: read.anchor,
        },
        start: { ...base, operation: "resolve", requested: [read.anchor] },
      };
    }
    case "changes":
      return {
        read: { operation: "changes", from: read.from, to: read.to },
        identity: {
          operation: "changes",
          origin,
          timeoutMs,
          pair: { from: read.from, to: read.to },
        },
        start: { ...base, operation: "changes", requested: [read.from, read.to] },
      };
  }
}

/**
 * A finished call's receipt facts. Only the adapter's body-free projection
 * of a validated success supplies delivered units; a refusal, a failure the
 * bridge observed, or a policy or endpoint that moved during the call
 * delivers nothing and binds nothing.
 */
function seal(
  outcome: GardenCallOutcome,
  moved: CallFailure | undefined,
  binding: RequestBinding,
): Sealed {
  if (outcome.kind === "failure") return { kind: "failed", error: outcome.error };
  const reply = outcome.reply;
  if (!reply.ok)
    return { kind: "failed", error: { kind: reply.error.kind, input: reply.error.subject } };
  if (moved !== undefined) return { kind: "failed", error: moved };
  // A request another call bound meanwhile keeps its binding; a reply of another publication fails.
  const answered = reply.snapshot;
  if (
    (binding.state === "publication" &&
      (answered.kind !== "publication" || answered.publication.id !== binding.snapshot.id)) ||
    (binding.state === "comparison" &&
      (answered.kind !== "pair" ||
        answered.from.id !== binding.from.id ||
        answered.to.id !== binding.to.id))
  )
    return {
      kind: "failed",
      error: {
        kind: "protocol",
        input: "publication: the request is bound to another publication than the reply's",
      },
    };
  const delivery = projectedDelivery.parse(
    projectConnectorReceipt("garden", reply.document)["delivery"],
  );
  const units: ReceiptUnit[] = [
    ...delivery.units.map((unit) => ({
      id: unit.id,
      coverage: "full" as const,
      revision: unit.revision,
      contentHash: unit.contentHash,
    })),
    ...(reply.resolved === null
      ? []
      : [{ id: reply.resolved, coverage: "metadata" as const, revision: null, contentHash: null }]),
  ];
  return {
    kind: "delivered",
    reply,
    units,
    count: reply.count ?? units.length,
    binding:
      binding.state !== "unresolved"
        ? undefined
        : reply.snapshot.kind === "pair"
          ? {
              state: "comparison",
              origin: binding.origin,
              from: reply.snapshot.from,
              to: reply.snapshot.to,
            }
          : { state: "publication", origin: binding.origin, snapshot: reply.snapshot.publication },
  };
}

/** The store's seal of a finished call: its delivery and, for a first success, what it binds. */
function sealFacts(sealed: Sealed, at: string): Parameters<GuidanceRequests["settle"]>[2] {
  if (sealed.kind === "failed") return { units: [], count: null, error: sealed.error, at };
  const facts = { units: sealed.units, count: sealed.count, error: null, at };
  return sealed.binding === undefined ? facts : { ...facts, binding: sealed.binding };
}

/** A store failure as the evidence error it is. */
function evidence(error: { readonly input: string }): CallFailure {
  return { kind: "evidence", input: `${error.input}; the call is not recorded` };
}

/** A contract failure's issues in one line. */
function issues(error: { readonly issues: readonly { path: string; message: string }[] }): string {
  return error.issues.map((issue) => `${issue.path || "document"}: ${issue.message}`).join("; ");
}
