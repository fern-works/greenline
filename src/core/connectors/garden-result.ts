import { z } from "zod";
import contractDocument from "../../../contracts/garden/cli-result-v1.schema.json" with { type: "json" };
import { sha256Hex } from "../../commons/hash.ts";
import { err, ok, type Result } from "../../commons/result.ts";
import { parseJson, type JsonValue } from "../contract.ts";
import type { GardenOperation } from "./garden.ts";

/**
 * greenline's reader of garden's replies. Each reply is first held to the
 * copied contract, `contracts/garden/cli-result-v1.schema.json`, bundled into
 * the CLI and pinned by digest; greenline's own checks then bind it to the
 * call it answers: the call id and operation, the origin, the publication,
 * each identity once, and each body to the delivery entry that names it.
 */

/** The one format this reader accepts. */
const FORMAT = "garden.result/v1";

/** The copied contract as a validator. The schema text is data compiled into the CLI. */
const contract = z.fromJSONSchema(contractSchema());

/** The bundled schema as the validator's input, through the JSON it is. */
function contractSchema(): z.core.JSONSchema.JSONSchema {
  const value = parseJson(JSON.stringify(contractDocument));
  // SAFETY: the bundled file is the pinned garden.result/v1 schema, a JSON
  // object that test/connectors/contract.test.ts holds to its digest and
  // accepts every fixture through; JSON Schema is the validator's input type.
  return value as z.core.JSONSchema.JSONSchema;
}

/** The call a reply must answer, as greenline made it. */
export interface GardenCallIdentity {
  readonly operation: GardenOperation;
  readonly callId: string;
  /** The endpoint the call named with `--url`. */
  readonly origin: string;
  /** The deadline the call named with `--timeout-ms`, which the reply's limits must echo. */
  readonly timeoutMs: number;
  /** The exact publication the call named; absent when it asked for current or named a pair. */
  readonly publication?: string | undefined;
  /** The pair a comparison named. */
  readonly pair?: { readonly from: string; readonly to: string } | undefined;
  /** The anchor a resolve named. */
  readonly anchor?: string | undefined;
  /** For a read: the units asked for, whether prerequisites were, what was excluded, and its budget. */
  readonly read?:
    | {
        readonly ids: readonly string[];
        readonly requires: boolean;
        readonly exclude: readonly string[];
        readonly maxUnits: number;
        readonly maxBytes: number;
      }
    | undefined;
}

/** One publication's identity as garden reports it. */
export interface GardenPublication {
  readonly id: string;
  readonly publishedAt: string;
}

/** One full unit a read delivered, bound to its text by greenline's own hashing. */
export interface GardenDeliveredUnit {
  readonly id: string;
  readonly revision: string;
  readonly contentHash: string;
  readonly bytes: number;
}

/** One listed unit's metadata the bridge reads to expand an exclusion. */
export interface GardenListedUnit {
  readonly id: string;
  readonly contains: readonly string[];
}

/** A validated reply: garden's answer to exactly this call, or its typed refusal. */
export type GardenReply =
  | {
      readonly ok: true;
      readonly clientVersion: string;
      readonly origin: string;
      readonly snapshot:
        | { readonly kind: "publication"; readonly publication: GardenPublication }
        | {
            readonly kind: "pair";
            readonly from: GardenPublication;
            readonly to: GardenPublication;
          };
      readonly delivery: readonly GardenDeliveredUnit[];
      /** How many candidates a list or comparison answered. */
      readonly count: number | null;
      /** The metadata unit a resolve named. */
      readonly resolved: string | null;
      /** The listed units, for a list. */
      readonly listed: readonly GardenListedUnit[];
      /** The body-free projection's source: the validated document. */
      readonly document: { readonly [key: string]: JsonValue };
      /** The operation's answer, which reaches the caller and is never stored. */
      readonly result: JsonValue;
    }
  | {
      readonly ok: false;
      readonly clientVersion: string;
      readonly error: { readonly kind: string; readonly subject: string };
      readonly document: { readonly [key: string]: JsonValue };
    };

/** Why a reply is not garden's answer to this call. */
export type GardenReplyProblem =
  | "malformed"
  | "format"
  | "schema"
  | "exit"
  | "call"
  | "origin"
  | "publication"
  | "duplicate"
  | "body"
  | "count"
  | "limits";

/** A reply refused before any of it is believed; it delivers nothing. */
export class GardenReplyRefused extends Error {
  readonly _tag = "GardenReplyRefused" as const;
  readonly problem: GardenReplyProblem;
  constructor(problem: GardenReplyProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

const publication = z.object({ id: z.string(), publishedAt: z.string() });
const pair = z.object({ from: publication, to: publication });
const delivered = z.object({
  id: z.string(),
  revision: z.string(),
  contentHash: z.string(),
  bytes: z.number(),
});
const envelope = z.object({
  format: z.string(),
  clientVersion: z.string(),
  ok: z.boolean(),
  operation: z.string().nullable(),
  callId: z.string(),
  origin: z.string().nullable(),
  snapshot: z.union([publication, pair]).nullable(),
  delivery: z.object({ units: z.array(delivered), bytes: z.number() }),
  limits: z
    .object({
      timeoutMs: z.number(),
      maxUnits: z.number().nullable(),
      maxBytes: z.number().nullable(),
    })
    .nullable(),
  result: z.json().nullable(),
  error: z.object({ kind: z.string(), subject: z.string() }).nullable(),
});
/** The longest refusal subject a receipt keeps: a unit, an anchor, a publication, a flag or a step. */
const SUBJECT_LIMIT = 256;
/**
 * A control, format, surrogate, private-use or unassigned character: C0 and
 * C1 controls, bidirectional overrides and zero-width characters among them.
 * None may enter a receipt, a terminal line or a later command line.
 */
const UNSAFE = /\p{C}/u;
const readResult = z.object({
  units: z.array(
    z.object({
      id: z.string(),
      family: z.string(),
      content: z.string(),
      revision: z.string(),
      contentHash: z.string(),
    }),
  ),
});
const listResult = z.object({
  snapshot: z.string(),
  count: z.number(),
  units: z.array(z.object({ id: z.string(), contains: z.array(z.string()) })),
});
const resolveResult = z.object({ anchor: z.string(), id: z.string() });
const snapshotResult = z.object({ id: z.string(), publishedAt: z.string() });
const changesResult = z.object({
  from: z.object({ id: z.string() }),
  to: z.object({ id: z.string() }),
  added: z.array(z.object({ id: z.string() })),
  changed: z.array(z.object({ id: z.string() })),
  removed: z.array(z.object({ id: z.string() })),
  count: z.number(),
});
const documentObject = z.record(z.string(), z.json());

/** Refuse with a reason. */
function refused(problem: GardenReplyProblem, message: string): Result<never, GardenReplyRefused> {
  return err(new GardenReplyRefused(problem, message));
}

/** Whether a list of identities holds one twice. */
function repeats(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * Read one reply: stdout must be exactly one `garden.result/v1` document, a
 * success for exit 0 and a refusal for exit 2, answering exactly this call.
 */
export function readGardenReply(
  stdout: string,
  exit: 0 | 2,
  call: GardenCallIdentity,
): Result<GardenReply, GardenReplyRefused> {
  const raw = parseJson(stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout);
  const document = documentObject.safeParse(raw);
  if (raw === undefined || stdout.includes("\n") !== stdout.endsWith("\n") || !document.success)
    return refused("malformed", "stdout is not exactly one JSON document");
  if (document.data["format"] !== FORMAT) return refused("format", `the reply is not ${FORMAT}`);
  if (!contract.safeParse(document.data).success)
    return refused("schema", `the reply breaks the ${FORMAT} schema`);
  const reply = envelope.parse(document.data);
  if (reply.ok !== (exit === 0))
    return refused("exit", `exit ${exit} carried a ${reply.ok ? "success" : "refusal"}`);
  if (!reply.ok) {
    // A refusal naming no operation refused the command line before reading
    // its call id; any other answers exactly this call.
    const refusedLine = reply.operation === null && reply.error?.kind === "invalid-request";
    if (!refusedLine && (reply.operation !== call.operation || reply.callId !== call.callId))
      return refused("call", "the refusal answers another call");
    if (reply.origin !== null && reply.origin !== call.origin)
      return refused("origin", "the refusal names another origin");
    if (
      call.publication !== undefined &&
      reply.snapshot !== null &&
      "id" in reply.snapshot &&
      reply.snapshot.id !== call.publication
    )
      return refused("publication", "the refusal names another publication");
    const error = reply.error ?? { kind: "invalid-result", subject: "error" };
    // The subject enters the receipt, so it must be the short literal garden's contract describes.
    if (error.subject.length > SUBJECT_LIMIT || UNSAFE.test(error.subject))
      return refused("malformed", "the refusal's subject is not a short literal");
    return ok({ ok: false, clientVersion: reply.clientVersion, error, document: document.data });
  }
  if (reply.operation !== call.operation || reply.callId !== call.callId)
    return refused("call", "the reply answers another call");
  if (reply.origin !== call.origin) return refused("origin", "the reply names another origin");
  const limits = reply.limits;
  if (
    limits === null ||
    limits.timeoutMs !== call.timeoutMs ||
    (call.read !== undefined &&
      (limits.maxUnits !== call.read.maxUnits || limits.maxBytes !== call.read.maxBytes))
  )
    return refused("limits", "the reply ran under other limits than the call named");
  if (
    call.read !== undefined &&
    (reply.delivery.units.length > call.read.maxUnits || reply.delivery.bytes > call.read.maxBytes)
  )
    return refused("limits", "the delivery passes the call's budget");
  const bound = reply.snapshot;
  if (bound === null) return refused("publication", "the reply names no publication");
  // A publication a request binds is named on every later command line, so it must be a literal.
  const publications = "from" in bound ? [bound.from.id, bound.to.id] : [bound.id];
  if (publications.some((id) => UNSAFE.test(id)))
    return refused("publication", "the reply names a publication that is not a literal");
  if (call.operation === "changes") {
    if (!("from" in bound)) return refused("publication", "a comparison names no pair");
    if (bound.from.id !== call.pair?.from || bound.to.id !== call.pair.to)
      return refused("publication", "the reply compares another pair");
  } else if (!("id" in bound)) return refused("publication", "the reply names a pair");
  else if (call.publication !== undefined && bound.id !== call.publication)
    return refused("publication", "the reply reads another publication");
  const units = reply.delivery.units;
  if (repeats(units.map((unit) => unit.id)))
    return refused("duplicate", "the delivery names a unit twice");
  const snapshot =
    "from" in bound
      ? { kind: "pair" as const, from: bound.from, to: bound.to }
      : { kind: "publication" as const, publication: bound };
  const base = {
    ok: true as const,
    clientVersion: reply.clientVersion,
    origin: reply.origin,
    snapshot,
    delivery: units,
    count: null,
    resolved: null,
    listed: [],
    document: document.data,
    result: reply.result,
  };
  switch (call.operation) {
    case "read": {
      const read = readResult.parse(reply.result);
      if (repeats(read.units.map((unit) => unit.id)))
        return refused("duplicate", "the result names a unit twice");
      const bodies = checkBodies(read.units, units, reply.delivery.bytes);
      if (bodies !== undefined) return refused("body", bodies);
      const asked = new Set(call.read?.ids ?? []);
      const got = new Set(units.map((unit) => unit.id));
      if ([...asked].some((id) => !got.has(id)))
        return refused("call", "the read did not deliver a unit it was asked for");
      if (!call.read?.requires && got.size !== asked.size)
        return refused("call", "the read delivered a unit it was not asked for");
      if ((call.read?.exclude ?? []).some((id) => got.has(id)))
        return refused("call", "the read delivered an excluded unit");
      return ok(base);
    }
    case "list": {
      const list = listResult.parse(reply.result);
      if ("id" in bound && list.snapshot !== bound.id)
        return refused("publication", "the listing is of another publication");
      if (repeats(list.units.map((unit) => unit.id)))
        return refused("duplicate", "the listing names a unit twice");
      if (list.count !== list.units.length)
        return refused("count", "the listing's count is not the units it lists");
      return ok({ ...base, count: list.count, listed: list.units });
    }
    case "changes": {
      const changes = changesResult.parse(reply.result);
      if (changes.from.id !== call.pair?.from || changes.to.id !== call.pair.to)
        return refused("publication", "the comparison is of another pair");
      const named = [...changes.added, ...changes.changed, ...changes.removed].map(
        (unit) => unit.id,
      );
      if (repeats(named)) return refused("duplicate", "the comparison names a unit twice");
      if (changes.count !== named.length)
        return refused("count", "the comparison's count is not the units it names");
      return ok({ ...base, count: changes.count });
    }
    case "resolve": {
      const resolved = resolveResult.parse(reply.result);
      if (resolved.anchor !== call.anchor)
        return refused("call", "the reply resolves another anchor");
      return ok({ ...base, resolved: resolved.id });
    }
    case "snapshot": {
      const named = snapshotResult.parse(reply.result);
      if (!("id" in bound) || named.id !== bound.id || named.publishedAt !== bound.publishedAt)
        return refused("publication", "the reply's result names another publication");
      return ok(base);
    }
    case "vocabulary":
      return ok(base);
  }
}

/**
 * Each body bound to its delivery entry, in order, as garden's service
 * computes them: the content hash is the SHA-256 of the UTF-8 text, the
 * revision the SHA-256 of `JSON.stringify([family, text])`, the byte count
 * the text's UTF-8 length. A reason when one does not hold.
 */
function checkBodies(
  bodies: readonly {
    readonly id: string;
    readonly family: string;
    readonly content: string;
    readonly revision: string;
    readonly contentHash: string;
  }[],
  entries: readonly GardenDeliveredUnit[],
  total: number,
): string | undefined {
  if (bodies.length !== entries.length) return "the bodies and the delivery differ in number";
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const [index, body] of bodies.entries()) {
    const entry = entries[index];
    const length = encoder.encode(body.content).length;
    bytes += length;
    if (
      entry === undefined ||
      entry.id !== body.id ||
      entry.revision !== body.revision ||
      entry.contentHash !== body.contentHash ||
      entry.bytes !== length ||
      sha256Hex(body.content) !== body.contentHash ||
      sha256Hex(JSON.stringify([body.family, body.content])) !== body.revision
    )
      return `the body of ${body.id} is not the one its delivery entry names`;
  }
  return bytes === total ? undefined : "the delivery's byte total is not its bodies'";
}
