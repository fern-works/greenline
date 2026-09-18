import { sha256Hex } from "../../commons/hash.ts";
import { rootExclusions, rootLanguages } from "../../core/root-statements.ts";
import { readRepositoryDecisions } from "../repository-state.ts";
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../../commons/result.ts";
import type { Redacted } from "../../commons/redacted.ts";
import {
  CabinetAccessFailed,
  unitEnvelope,
  type Cabinet,
  type CabinetBinding,
  type CabinetFailure,
  type ListResult,
  type Unit,
  type UnitEnvelope,
  type Vocabulary,
  CabinetError,
} from "../../core/cabinet.ts";
import { parseManifest, type Manifest } from "../../core/manifest.ts";
import { parseLedgerRecord, type LedgerRecord } from "../../core/execution-ledger.ts";
import { parseJson } from "../../core/contract.ts";
import {
  parseGuidanceRequest,
  receiptConsultationId,
  receiptCoverage,
  requestLimitsSchema,
  type GuidanceReceipt,
  type GuidanceRequest,
  type ReceiptUnit,
  type RequestLimits,
} from "../../core/guidance-receipts.ts";
import { readUnits } from "../../core/cabinet-reading.ts";
import { openHttpCabinet, resumeHttpCabinet, type CabinetConnection } from "../cabinet-client.ts";
import { GuidanceRequests } from "../guidance-requests.ts";
import { createNodeFileIo, type FileIo } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import { parseGuidanceArgs, type GuidanceCommand } from "./guidance-args.ts";

/** Awaitable output distinguishes receipt persistence from subsequent stream failure. */
export interface GuidanceWriter {
  readonly stdout: { readonly write: (text: string) => void | Promise<void> };
  readonly stderr: { readonly write: (text: string) => void | Promise<void> };
}
/** Effects owned by the calling harness; native identity is supplied, never inferred. */
export interface GuidanceEnvironment {
  readonly cwd: string;
  readonly credential?: Redacted<string>;
  readonly io?: FileIo;
  readonly now?: () => string;
  readonly signal?: AbortSignal;
}
type ReadOutput = {
  readonly units: readonly (UnitEnvelope & {
    readonly id: string;
    readonly consultation: string;
  })[];
};
type Output = ListResult | ReadOutput | Vocabulary | string;
const defaultLimits: RequestLimits = { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 };
const advicePacket = z
  .object({
    request: z.string(),
    sequence: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();

function readConfined(root: string, path: string, io: FileIo): Result<string, CabinetAccessFailed> {
  const full = join(root, path);
  try {
    if (
      !lstatSync(full).isFile() ||
      lstatSync(full).isSymbolicLink() ||
      !realpathSync(full).startsWith(realpathSync(root) + sep)
    )
      return err(new CabinetAccessFailed("configuration", path));
  } catch {
    return err(new CabinetAccessFailed("configuration", path));
  }
  const result = io.read(full);
  return result._tag === "err" ? err(new CabinetAccessFailed("unavailable", path)) : result;
}
function configuration(root: string, io: FileIo): Result<Manifest, CabinetAccessFailed> {
  const text = readConfined(root, ".greenline/manifest.json", io);
  if (text._tag === "err") return text;
  const parsed = parseManifest(text.value, "manifest");
  return parsed._tag === "err"
    ? err(
        new CabinetAccessFailed(
          "configuration",
          `manifest.${parsed.error.issues[0]?.path ?? "guidance"}`,
        ),
      )
    : parsed;
}
function account(root: string, id: string, io: FileIo): Result<LedgerRecord, CabinetAccessFailed> {
  if (!/^[a-z][a-z0-9-]*$/.test(id))
    return err(new CabinetAccessFailed("configuration", "record id"));
  const text = readConfined(root, `.greenline/ledger/records/${id}.json`, io);
  if (text._tag === "err") return text;
  const parsed = parseLedgerRecord(text.value, id);
  // A record that fails the schema or names another id is not this account.
  if (parsed._tag === "err" || parsed.value.id !== id)
    return err(new CabinetAccessFailed("configuration", "execution account"));
  return parsed;
}
function owner(record: LedgerRecord): GuidanceRequest["owner"] {
  return { record: record.id, context: record.context, role: record.role, work: record.work };
}
function adviceHandle(request: GuidanceRequest, sequence: number): string {
  return (
    "advice." +
    Buffer.from(
      JSON.stringify({ request: JSON.stringify({ ...request, receipts: [] }), sequence }),
      "utf8",
    ).toString("base64url")
  );
}
function existing(
  handle: string,
  store: GuidanceRequests,
): Result<{ request: GuidanceRequest; sequence: number }, CabinetAccessFailed> {
  if (!handle.startsWith("advice.")) {
    const request = store.read(handle);
    return request._tag === "err"
      ? request
      : ok({ request: request.value, sequence: request.value.receipts.length });
  }
  const encoded = handle.slice(7);
  if (encoded.length > 65536)
    return err(new CabinetAccessFailed("configuration", "read-only handle"));
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded)
    return err(new CabinetAccessFailed("configuration", "read-only handle"));
  const packet = advicePacket.safeParse(parseJson(bytes.toString("utf8")));
  if (!packet.success) return err(new CabinetAccessFailed("configuration", "read-only handle"));
  const request = parseGuidanceRequest(packet.data.request, "read-only handle");
  return request._tag === "err" ||
    request.value.owner.record !== null ||
    request.value.receipts.length !== 0
    ? err(new CabinetAccessFailed("configuration", "read-only handle"))
    : ok({ request: request.value, sequence: packet.data.sequence });
}
function errorFact(error: CabinetFailure): NonNullable<GuidanceReceipt["error"]> {
  return { kind: error.kind, input: error.input };
}

/** The real guidance CLI: explicit requests, verified retrieval and receipt-first output. */
export async function runGuidanceCli(
  argv: readonly string[],
  writer: GuidanceWriter,
  env: GuidanceEnvironment,
): Promise<number> {
  const parsed = parseGuidanceArgs(argv);
  if (parsed.kind === "help") {
    await writer.stdout.write(parsed.text);
    return 0;
  }
  if (parsed.kind === "error") {
    await writer.stderr.write(
      JSON.stringify({ ok: false, error: { kind: "configuration", input: parsed.message } }) + "\n",
    );
    return 2;
  }
  const command = parsed.command;
  const supportingReceipts: GuidanceReceipt[] = [];
  const fail = async (
    error: CabinetFailure,
    request?: string,
    receipt?: GuidanceReceipt,
  ): Promise<number> => {
    await writer.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        command: `guidance ${command.operation}`,
        ok: false,
        error: errorFact(error),
        request,
        receipt,
        supportingReceipts,
      }) + "\n",
    );
    return 1;
  };
  const root = findGitRoot(env.cwd);
  if (root === undefined) return fail(new CabinetAccessFailed("configuration", "Git repository"));
  const io = env.io ?? createNodeFileIo();
  const manifest = configuration(root, io);
  if (manifest._tag === "err") return fail(manifest.error);
  if (manifest.value.guidance.state === "unconfigured") {
    if (command.request !== undefined || command.fromRequest !== undefined)
      return fail(
        new CabinetAccessFailed(
          "configuration",
          "request handles require configured guidance; this repository is unconfigured",
        ),
      );
    await writer.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        command: `guidance ${command.operation}`,
        ok: true,
        configuration: "unconfigured",
        request: null,
        receipt: null,
        result: null,
      }) + "\n",
    );
    return 0;
  }
  // The service answers an empty query with the whole snapshot, which this
  // command needs for its own exclusion catalog; an agent's list is a
  // question, and a question names at least one facet. (First QA series:
  // an agent listed with nothing after a refused guess and got 945 units.)
  // Refused before any request or receipt exists.
  if (
    command.operation === "list" &&
    Object.values(command.query).every((values) => values === undefined || values.length === 0)
  )
    return fail(
      new CabinetError(
        "empty query",
        "a list names at least one facet (--language, --purpose, --technology, --task, --concern, --kind or --responsibility); guidance vocabulary lists the values",
      ),
    );
  if (env.credential === undefined || !env.credential.reveal())
    return fail(new CabinetAccessFailed("configuration", "GREENLINE_GUIDANCE_KEY"));
  const provider = manifest.value.guidance.provider;
  const now = env.now ?? (() => new Date().toISOString());
  const store = new GuidanceRequests(root, io);
  const resolved = await requestFor(
    command,
    root,
    provider,
    store,
    io,
    env.credential,
    now,
    env.signal,
  );
  if (resolved._tag === "err") return fail(resolved.error);
  const request = resolved.value.request;
  const resumed = resolved.value.cabinet;
  const durable = request.owner.record !== null;
  let sequence = resolved.value.sequence;
  let handle = durable ? request.id : adviceHandle(request, sequence);
  const decisions = readRepositoryDecisions(root, io, request.binding.vocabulary);
  if (decisions._tag === "err")
    return fail(
      new CabinetAccessFailed(
        "configuration",
        decisions.error.issues.map((issue) => issue.path + ": " + issue.message).join("; "),
      ),
      handle,
    );
  const policyRevision = sha256Hex(decisions.value.body);
  const contribution =
    request.owner.record === null ? undefined : account(root, request.owner.record, io);
  if (contribution?._tag === "err") return fail(contribution.error, handle);
  const roots = command.roots.length
    ? command.roots
    : contribution?._tag === "ok"
      ? contribution.value.scopes
      : [];
  if (command.operation === "read" && roots.length === 0)
    return fail(
      new CabinetAccessFailed("configuration", "--root is required for read-only guidance reads"),
      handle,
    );
  // A list with no language facet answers for every language the corpus
  // holds (the first QA series read 163 units across languages once a facet
  // was dropped). The governed roots already settled which languages the
  // work is written in, so they supply the facet; roots that settled none
  // refuse the list rather than widen it, because no root statement says
  // what an answer would be about.
  let query = command.query;
  if (command.operation === "list" && (command.query.language ?? []).length === 0) {
    const languages = rootLanguages(decisions.value.roots, roots);
    if (languages.length === 0)
      return fail(
        new CabinetAccessFailed(
          "configuration",
          roots.length === 0
            ? "--language is absent and no governed root was named; pass --language, or name a --root whose statement declares languages"
            : `--language is absent and the governed roots (${roots.join(", ")}) declare no language in .greenline/DECISIONS.md; pass --language, or declare those roots' languages`,
        ),
        handle,
      );
    query = { ...command.query, language: languages };
  }

  let exclusionCatalog: ReadonlySet<string> | undefined;
  let excluded: readonly string[] = command.excluded;
  if (
    command.operation === "read" &&
    (excluded.length ||
      decisions.value.roots.some(
        (statement) => roots.includes(statement.root) && statement.exclusions.length,
      ))
  ) {
    const metadataStart = {
      id: randomUUID(),
      operation: "list" as const,
      query: {},
      requested: [],
      closure: false,
      excluded: [],
      roots,
      policyRevision,
      startedAt: now(),
      nativeCall: command.call ?? null,
    };
    const pending = durable
      ? store.begin(request, metadataStart)
      : ok({
          ...metadataStart,
          sequence: sequence + 1,
          units: [],
          count: null,
          outcome: "pending" as const,
          error: null,
          finishedAt: null,
        });
    if (pending._tag === "err") return fail(pending.error, handle);
    const catalog = await resumed.list({});
    if (durable) {
      if (catalog._tag === "ok") {
        const saved = store.deliver(request, pending.value.id, [], catalog.value.count);
        if (saved._tag === "err") return fail(saved.error, handle);
      }
      const ended = store.finish(
        request,
        pending.value.id,
        catalog._tag === "err" ? errorFact(catalog.error) : null,
        now(),
        catalog._tag === "err" ? null : catalog.value.count,
      );
      if (ended._tag === "err") return fail(ended.error, handle);
    }
    if (!durable) {
      sequence++;
      supportingReceipts.push({
        ...pending.value,
        units: [],
        count: catalog._tag === "err" ? null : catalog.value.count,
        outcome: catalog._tag === "err" ? "failed" : "received",
        error: catalog._tag === "err" ? errorFact(catalog.error) : null,
        finishedAt: now(),
      });
      handle = adviceHandle(request, sequence);
    }
    if (catalog._tag === "err") return fail(catalog.error, handle);
    exclusionCatalog = new Set(catalog.value.units.map((unit) => unit.id));
    const blocked = rootExclusions(decisions.value.roots, roots, catalog.value, excluded);
    if (blocked._tag === "err") return fail(blocked.error, handle);
    excluded = [...blocked.value];
  }
  const guard = (): Result<void, CabinetAccessFailed> => {
    const policy = readRepositoryDecisions(root, io, request.binding.vocabulary);
    if (policy._tag === "err" || sha256Hex(policy.value.body) !== policyRevision)
      return err(new CabinetAccessFailed("configuration", "repository policy changed"));
    const current = configuration(root, io);
    if (current._tag === "err") return current;
    if (
      current.value.guidance.state !== "configured" ||
      current.value.guidance.provider !== request.binding.origin
    )
      return err(new CabinetAccessFailed("configuration", "request provider changed"));
    if (request.owner.record !== null) {
      const record = account(root, request.owner.record, io);
      if (record._tag === "err") return record;
      if (
        JSON.stringify(owner(record.value)) !== JSON.stringify(request.owner) ||
        record.value.guidance?.state !== "configured" ||
        record.value.guidance.provider !== request.binding.origin
      )
        return err(new CabinetAccessFailed("configuration", "request contributor changed"));
    }
    return ok(undefined);
  };
  const before = guard();
  if (before._tag === "err") return fail(before.error, handle);
  const start = {
    id: randomUUID(),
    operation: command.operation,
    query: command.operation === "list" ? query : null,
    requested: command.ids,
    closure: command.closure,
    excluded,
    roots,
    policyRevision,
    startedAt: now(),
    nativeCall: command.call ?? null,
  };
  const begun = durable
    ? store.begin(request, start)
    : ok<GuidanceReceipt>({
        ...start,
        sequence: sequence + 1,
        units: [],
        count: null,
        outcome: "pending",
        error: null,
        finishedAt: null,
      });
  if (begun._tag === "err") return fail(begun.error, handle);
  let receipt = begun.value;
  const delivered = (
    units: readonly ReceiptUnit[],
    count: number | null = null,
  ): Result<void, CabinetAccessFailed> => {
    const updated = durable
      ? store.deliver(request, receipt.id, units, count)
      : ok<GuidanceReceipt>({
          ...receipt,
          units: [...receipt.units, ...units],
          count: count ?? receipt.count,
        });
    if (updated._tag === "err") return updated;
    receipt = updated.value;
    return ok(undefined);
  };
  const cabinet: Cabinet = {
    ...resumed,
    show: async (id) => {
      const beforeRead = guard();
      if (beforeRead._tag === "err") return beforeRead;
      if (exclusionCatalog !== undefined && !exclusionCatalog.has(id))
        return err(
          new CabinetAccessFailed(
            "invalid response",
            `requested unit ${id} is absent from the exclusion catalog`,
          ),
        );
      const unit = await resumed.show(id);
      if (unit._tag === "err") return unit;
      const logged = delivered([
        {
          id: unit.value.id,
          coverage: "full",
          revision: unit.value.revision,
          contentHash: unit.value.contentHash,
        },
      ]);
      return logged._tag === "err" ? logged : unit;
    },
  };
  const result = await retrieve(
    { ...command, query, excluded },
    cabinet,
    request,
    resolved.value.signal,
    receipt.sequence,
    delivered,
  );
  const after = guard();
  const failure = result._tag === "err" ? result.error : after._tag === "err" ? after.error : null;
  // A list's count was delivered with no unit entries; every other operation's
  // count is what it delivered.
  const count =
    failure === null
      ? command.operation === "list"
        ? receipt.count
        : receipt.units.length
      : receipt.count;
  const sealed = failure === null ? null : errorFact(failure);
  const finishedAt = now();
  const completed = durable
    ? store.finish(request, receipt.id, sealed, finishedAt, count)
    : ok<GuidanceReceipt>({
        ...receipt,
        finishedAt,
        count,
        error: sealed,
        outcome: receiptCoverage(sealed, receipt.units),
      });
  if (completed._tag === "err") return fail(completed.error, handle);
  receipt = completed.value;
  if (!durable) {
    handle = adviceHandle(request, receipt.sequence);
    // The reviewer keeps its receipt in the tool result, but the call itself
    // is a cabinet line under the dispatching request: file a stub there so
    // the ledger counts it and doctor's reconciliation can see it.
    if (request.parent !== null) {
      const advised = store.advise(request.parent, {
        id: receipt.id,
        request: request.id,
        role: request.owner.role,
        operation: receipt.operation,
        units: receipt.units,
        count: receipt.count,
        outcome: receiptCoverage(sealed, receipt.units),
        at: finishedAt,
      });
      if (advised._tag === "err") return fail(advised.error, handle, receipt);
    }
  }
  if (failure !== null) return fail(failure, handle, receipt);
  if (result._tag === "err") return fail(result.error, handle, receipt);
  try {
    await writer.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        command: `guidance ${command.operation}`,
        ok: true,
        configuration: "configured",
        request: handle,
        receipt,
        supportingReceipts,
        capture: "unconfirmed",
        result: result.value,
      }) + "\n",
    );
  } catch {
    return fail(
      new CabinetAccessFailed("unavailable", "output; receipt preserves service delivery only"),
      handle,
      receipt,
    );
  }
  return 0;
}

async function requestFor(
  command: GuidanceCommand,
  root: string,
  provider: string,
  store: GuidanceRequests,
  io: FileIo,
  credential: Redacted<string>,
  now: () => string,
  external?: AbortSignal,
): Promise<
  Result<
    { request: GuidanceRequest; cabinet: Cabinet; signal: AbortSignal; sequence: number },
    CabinetFailure
  >
> {
  if (command.request !== undefined && command.fromRequest !== undefined)
    return err(new CabinetAccessFailed("configuration", "choose request or from-request"));
  let inherited: GuidanceRequest | undefined;
  let sequence = 0;
  const priorHandle = command.request ?? command.fromRequest;
  if (priorHandle !== undefined) {
    const prior = existing(priorHandle, store);
    if (prior._tag === "err") return prior;
    inherited = prior.value.request;
    sequence = prior.value.sequence;
  }
  const limits = requestLimitsSchema.safeParse({
    maxUnits: command.maxUnits ?? inherited?.limits.maxUnits ?? defaultLimits.maxUnits,
    maxBytes: command.maxBytes ?? inherited?.limits.maxBytes ?? defaultLimits.maxBytes,
    timeoutMs: command.timeoutMs ?? inherited?.limits.timeoutMs ?? defaultLimits.timeoutMs,
  });
  if (!limits.success) return err(new CabinetAccessFailed("configuration", "read limits"));
  if (
    inherited !== undefined &&
    (inherited.binding.origin !== provider ||
      (command.request !== undefined &&
        JSON.stringify(inherited.limits) !== JSON.stringify(limits.data)))
  )
    return err(new CabinetAccessFailed("configuration", "request origin or frozen limits"));
  const deadline = AbortSignal.timeout(limits.data.timeoutMs);
  const signal = external === undefined ? deadline : AbortSignal.any([deadline, external]);
  const connection: CabinetConnection = {
    url: provider,
    credential,
    timeoutMs: limits.data.timeoutMs,
    signal,
  };
  const options =
    command.snapshot === undefined ? connection : { ...connection, snapshot: command.snapshot };
  if (command.request !== undefined && inherited !== undefined) {
    if (
      (command.record !== undefined && command.record !== inherited.owner.record) ||
      (command.context !== undefined && command.context !== inherited.owner.context) ||
      (command.role !== undefined && command.role !== inherited.owner.role) ||
      (command.readOnly && inherited.owner.record !== null)
    )
      return err(new CabinetAccessFailed("configuration", "request contributor"));
    const resumed = resumeHttpCabinet(options, inherited.binding);
    return resumed._tag === "err"
      ? resumed
      : ok({ request: inherited, cabinet: resumed.value.cabinet, signal, sequence });
  }
  if (command.readOnly === (command.record !== undefined))
    return err(
      new CabinetAccessFailed("configuration", "choose --record or --read-only for a new request"),
    );
  let contributor: GuidanceRequest["owner"] = {
    record: null,
    context: command.context ?? null,
    role: command.role ?? null,
  };
  if (command.record !== undefined) {
    const record = account(root, command.record, io);
    if (record._tag === "err") return record;
    if (
      record.value.guidance?.state !== "configured" ||
      record.value.guidance.provider !== provider ||
      (command.context !== undefined && command.context !== record.value.context) ||
      (command.role !== undefined && command.role !== record.value.role)
    )
      return err(new CabinetAccessFailed("configuration", "account guidance, context or role"));
    contributor = owner(record.value);
  }
  const opened =
    inherited === undefined
      ? await openHttpCabinet(options)
      : resumeHttpCabinet(options, inherited.binding);
  if (opened._tag === "err") return opened;
  const binding: CabinetBinding = {
    origin: opened.value.origin,
    protocol: opened.value.protocol,
    snapshot: opened.value.snapshot,
    vocabulary: opened.value.vocabulary,
  };
  const request: GuidanceRequest = {
    schemaVersion: 3,
    id: randomUUID(),
    owner: contributor,
    parent: inherited?.id ?? null,
    createdAt: now(),
    binding,
    publicationUse:
      inherited?.publicationUse ?? (command.snapshot === undefined ? "current" : "historical"),
    limits: limits.data,
    receipts: [],
    advisories: [],
  };
  if (contributor.record !== null) {
    const created = store.create(request);
    if (created._tag === "err") return created;
  }
  return ok({ request, cabinet: opened.value.cabinet, signal, sequence: 0 });
}

async function retrieve(
  command: GuidanceCommand,
  cabinet: Cabinet,
  request: GuidanceRequest,
  signal: AbortSignal,
  sequence: number,
  delivered: (
    units: readonly ReceiptUnit[],
    count?: number | null,
  ) => Result<void, CabinetAccessFailed>,
): Promise<Result<Output, CabinetFailure>> {
  switch (command.operation) {
    case "list": {
      const result = await cabinet.list(command.query);
      if (result._tag === "err") return result;
      // The receipt keeps the query and the count; the candidates are the
      // query's answer under the bound snapshot, not delivered content.
      const logged = delivered([], result.value.count);
      return logged._tag === "err" ? logged : result;
    }
    case "read": {
      const units = await readUnits(cabinet, [...new Set(command.ids)], new Set(command.excluded), {
        ...request.limits,
        signal,
        requires: command.closure,
      });
      if (units._tag === "err") return units;
      return ok({
        units: units.value.map((unit: Unit) => ({
          id: unit.id,
          ...unitEnvelope(unit),
          consultation: receiptConsultationId(request.id, sequence, unit.id),
        })),
      });
    }
    case "resolve": {
      const result = await cabinet.resolve(command.ids[0] ?? "");
      if (result._tag === "err") return result;
      const logged = delivered(
        [{ id: result.value, coverage: "metadata", revision: null, contentHash: null }],
        1,
      );
      return logged._tag === "err" ? logged : result;
    }
    case "vocabulary":
      return ok(await cabinet.vocabulary());
  }
}
