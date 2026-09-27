import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import {
  parseGuidanceRequest,
  receiptCoverage,
  type GuidanceAdvisory,
  type GuidanceRequest,
  type GuidanceReceipt,
  type ReceiptUnit,
  type RequestBinding,
} from "../core/guidance-receipts.ts";
import { createNodeFileIo, type AtomicWriteFailed, type FileIo } from "./fs/io.ts";
import { withWorkspaceWrite } from "./fs/workspace-write.ts";

/** Evidence the store could not read or write; the call it belongs to is never reported as recorded. */
export class ReceiptStoreFailed extends Error {
  readonly _tag = "ReceiptStoreFailed" as const;
  /** `configuration` for evidence that contradicts the call, `unavailable` for a failed read or write. */
  readonly kind: "configuration" | "unavailable";
  /** What was refused, never a body or a credential. */
  readonly input: string;
  constructor(kind: "configuration" | "unavailable", input: string) {
    super(`${kind}: ${input}`);
    this.kind = kind;
    this.input = input;
  }
}

type Failure = ReceiptStoreFailed;
type Start = Pick<
  GuidanceReceipt,
  | "id"
  | "operation"
  | "query"
  | "requested"
  | "closure"
  | "excluded"
  | "roots"
  | "policyRevision"
  | "startedAt"
  | "nativeCall"
>;
/** A read-only consultation as its caller reports it; the collection assigns the sequence. */
type Dispatched = Omit<GuidanceAdvisory, "sequence">;
/** A finished call's facts: what it delivered, how it ended and, for a first success, what it bound. */
interface Seal {
  readonly units: readonly ReceiptUnit[];
  readonly count: number | null;
  readonly error: GuidanceReceipt["error"];
  readonly at: string;
  /** The publication or pair a request's first successful call names; only an unresolved request takes one. */
  readonly binding?: RequestBinding;
}
const missing = z.object({ code: z.literal("ENOENT") });

/**
 * The writer lock's failure as evidence: a lock another writer holds kept the
 * write from happening; a failure after it was taken leaves the write
 * unconfirmed, since it may have landed before the lock was released.
 */
function lockFailure(error: AtomicWriteFailed): ReceiptStoreFailed {
  return new ReceiptStoreFailed(
    "unavailable",
    error.step === "lock" ? "receipt write lock" : "receipt write unconfirmed",
  );
}

/** The sole durable receipt writer: confined files, exclusive updates and atomic replacement. */
export class GuidanceRequests {
  readonly #root: string;
  readonly #io: FileIo;
  constructor(root: string, io: FileIo = createNodeFileIo()) {
    this.#root = root;
    this.#io = io;
  }

  #path(id?: string): Result<string, Failure> {
    if (id !== undefined && !z.uuid().safeParse(id).success)
      return err(new ReceiptStoreFailed("configuration", "request id"));
    const dirs = [
      ".greenline",
      ".greenline/tmp",
      ".greenline/ledger",
      ".greenline/ledger/receipts",
    ];
    for (const directory of dirs) {
      try {
        const stat = lstatSync(join(this.#root, directory));
        if (stat.isSymbolicLink() || !stat.isDirectory())
          return err(new ReceiptStoreFailed("unavailable", "receipt directory"));
      } catch (error) {
        if (!missing.safeParse(error).success)
          return err(new ReceiptStoreFailed("unavailable", "receipt directory"));
      }
    }
    const path = join(
      this.#root,
      ".greenline/ledger/receipts",
      id === undefined ? "" : `${id}.json`,
    );
    if (id !== undefined) {
      try {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink() || !stat.isFile())
          return err(new ReceiptStoreFailed("unavailable", "receipt file"));
      } catch (error) {
        if (!missing.safeParse(error).success)
          return err(new ReceiptStoreFailed("unavailable", "receipt file"));
      }
    }
    return ok(path);
  }

  /** Load one exact handle. Absence or malformed evidence never starts another request. */
  read(id: string): Result<GuidanceRequest, Failure> {
    const path = this.#path(id);
    if (path._tag === "err") return path;
    const content = this.#io.read(path.value);
    if (content._tag === "err") return err(new ReceiptStoreFailed("unavailable", "request handle"));
    const request = parseGuidanceRequest(content.value, path.value);
    return request._tag === "err" || request.value.id !== id
      ? err(new ReceiptStoreFailed("configuration", "request evidence"))
      : request;
  }

  /** The collection files' names, sorted; none when the directory is absent. */
  #names(): Result<readonly string[], Failure> {
    const path = this.#path();
    if (path._tag === "err") return path;
    try {
      return ok(
        readdirSync(path.value)
          .filter((name) => name.endsWith(".json"))
          .sort(),
      );
    } catch (error) {
      return missing.safeParse(error).success
        ? ok([])
        : err(new ReceiptStoreFailed("unavailable", "receipt directory"));
    }
  }

  /** Discover every collection; the account never chooses an inventory subset. */
  all(): Result<readonly GuidanceRequest[], Failure> {
    const names = this.#names();
    if (names._tag === "err") return names;
    const records: GuidanceRequest[] = [];
    for (const name of names.value) {
      const value = this.read(name.slice(0, -5));
      if (value._tag === "err") return value;
      records.push(value.value);
    }
    return ok(records);
  }

  /**
   * Every collection file with what reading it gave: the request, or the
   * refusal. A reader that shows evidence (the inspector) shows the valid
   * collections beside the ones it cannot read, where the account's audit
   * refuses the whole set.
   */
  survey(): Result<
    readonly (
      | { readonly file: string; readonly request: GuidanceRequest }
      | { readonly file: string; readonly failure: string }
    )[],
    Failure
  > {
    const names = this.#names();
    if (names._tag === "err") return names;
    return ok(
      names.value.map((file) => {
        const value = this.read(file.slice(0, -5));
        return value._tag === "ok"
          ? { file, request: value.value }
          : { file, failure: value.error.message };
      }),
    );
  }

  #write(request: GuidanceRequest): Result<GuidanceRequest, Failure> {
    const path = this.#path(request.id);
    if (path._tag === "err") return path;
    const text = JSON.stringify(request, null, 2) + "\n";
    const parsed = parseGuidanceRequest(text, path.value);
    if (parsed._tag === "err")
      return err(new ReceiptStoreFailed("configuration", "receipt update"));
    const written = this.#io.write(path.value, text);
    return written._tag === "err"
      ? err(new ReceiptStoreFailed("unavailable", "receipt persistence"))
      : ok(parsed.value);
  }

  /** Allocate only a new durable collection, never replace a known handle. */
  create(request: GuidanceRequest): Result<GuidanceRequest, Failure> {
    if (request.owner.record === null)
      return err(new ReceiptStoreFailed("configuration", "read-only persistence"));
    const path = this.#path(request.id);
    if (path._tag === "err") return path;
    const locked = withWorkspaceWrite(this.#root, () => {
      const exists = this.#io.read(path.value);
      if (exists._tag === "ok" || exists.error.step !== "absent")
        return err(new ReceiptStoreFailed("configuration", "request already exists"));
      return this.#write(request);
    });
    return locked._tag === "err" ? err(lockFailure(locked.error)) : locked.value;
  }

  #change(
    expected: GuidanceRequest,
    change: (current: GuidanceRequest) => Result<GuidanceRequest, Failure>,
  ): Result<GuidanceRequest, Failure> {
    const path = this.#path(expected.id);
    if (path._tag === "err") return path;
    const locked = withWorkspaceWrite(this.#root, () => {
      const current = this.read(expected.id);
      if (current._tag === "err") return current;
      // Both call lists grow under other writers — this caller's own calls
      // and any read-only consultation dispatched from this request — so the
      // binding is what must not have moved.
      if (
        JSON.stringify({ ...current.value, receipts: [], advisories: [] }) !==
        JSON.stringify({ ...expected, receipts: [], advisories: [] })
      )
        return err(new ReceiptStoreFailed("configuration", "request binding changed"));
      const next = change(current.value);
      return next._tag === "err" ? next : this.#write(next.value);
    });
    return locked._tag === "err" ? err(lockFailure(locked.error)) : locked.value;
  }

  /** Record a pending operation before attempting its service read. */
  begin(expected: GuidanceRequest, start: Start): Result<GuidanceReceipt, Failure> {
    const changed = this.#change(expected, (current) =>
      ok({
        ...current,
        receipts: [
          ...current.receipts,
          {
            ...start,
            sequence: current.receipts.length + 1,
            units: [],
            count: null,
            outcome: "pending",
            error: null,
            finishedAt: null,
          },
        ],
      }),
    );
    if (changed._tag === "err") return changed;
    const receipt = changed.value.receipts.find((value) => value.id === start.id);
    return receipt === undefined
      ? err(new ReceiptStoreFailed("configuration", "receipt identity"))
      : ok(receipt);
  }

  #receipt(
    expected: GuidanceRequest,
    id: string,
    change: (entry: GuidanceReceipt) => GuidanceReceipt,
    binding?: RequestBinding,
  ): Result<{ request: GuidanceRequest; receipt: GuidanceReceipt }, Failure> {
    const changed = this.#change(expected, (current) => {
      const existing = current.receipts.find((entry) => entry.id === id);
      if (existing?.outcome !== "pending")
        return err(new ReceiptStoreFailed("configuration", "receipt is not pending"));
      // A binding moves once, from unresolved, and never onto another origin.
      if (
        binding !== undefined &&
        (current.binding.state !== "unresolved" || current.binding.origin !== binding.origin)
      )
        return err(new ReceiptStoreFailed("configuration", "request binding is already fixed"));
      const bound = binding === undefined ? current : { ...current, binding };
      return ok({
        ...bound,
        receipts: current.receipts.map((entry) => (entry.id === id ? change(entry) : entry)),
      });
    });
    if (changed._tag === "err") return changed;
    const receipt = changed.value.receipts.find((entry) => entry.id === id);
    return receipt === undefined
      ? err(new ReceiptStoreFailed("configuration", "receipt identity"))
      : ok({ request: changed.value, receipt });
  }

  /** Append validated delivery facts immediately, including before a later batch failure. */
  deliver(
    expected: GuidanceRequest,
    id: string,
    units: readonly ReceiptUnit[],
    count: number | null = null,
  ): Result<GuidanceReceipt, Failure> {
    const changed = this.#receipt(expected, id, (entry) => ({
      ...entry,
      units: [...entry.units, ...units],
      count: count ?? entry.count,
    }));
    return changed._tag === "err" ? changed : ok(changed.value.receipt);
  }

  /** Seal coverage or failure. No output-success or comprehension verdict is recorded. */
  finish(
    expected: GuidanceRequest,
    id: string,
    error: GuidanceReceipt["error"],
    at: string,
    count: number | null,
  ): Result<GuidanceReceipt, Failure> {
    const changed = this.#receipt(expected, id, (entry) => ({
      ...entry,
      finishedAt: at,
      count: count ?? entry.count,
      error,
      outcome: receiptCoverage(error, entry.units),
    }));
    return changed._tag === "err" ? changed : ok(changed.value.receipt);
  }

  /**
   * Record a finished call in one write: its delivery, its seal and, for a
   * request's first successful call, the publication it bound. The request
   * returned is the one later calls of the same invocation continue from.
   */
  settle(
    expected: GuidanceRequest,
    id: string,
    seal: Seal,
  ): Result<{ request: GuidanceRequest; receipt: GuidanceReceipt }, Failure> {
    if (seal.binding !== undefined && seal.error !== null)
      return err(new ReceiptStoreFailed("configuration", "a failed call binds no publication"));
    return this.#receipt(
      expected,
      id,
      (entry) => ({
        ...entry,
        units: [...entry.units, ...seal.units],
        finishedAt: seal.at,
        count: seal.count,
        error: seal.error,
        outcome: receiptCoverage(seal.error, [...entry.units, ...seal.units]),
      }),
      seal.binding,
    );
  }

  /**
   * File a read-only consultation under the request that dispatched it,
   * leaving that request's own calls untouched. A dispatcher that is itself
   * read-only has no collection to file under; that absence answers `null`
   * rather than failing a call this store never owned.
   */
  advise(parent: string, entry: Dispatched): Result<GuidanceAdvisory | null, Failure> {
    const path = this.#path(parent);
    if (path._tag === "err") return path;
    const locked = withWorkspaceWrite(this.#root, (): Result<GuidanceAdvisory | null, Failure> => {
      const found = this.#io.read(path.value);
      if (found._tag === "err" && found.error.step === "absent") return ok(null);
      const current = this.read(parent);
      if (current._tag === "err") return current;
      const written = this.#write({
        ...current.value,
        advisories: [
          ...current.value.advisories,
          { ...entry, sequence: current.value.advisories.length + 1 },
        ],
      });
      if (written._tag === "err") return written;
      const recorded = written.value.advisories.find((value) => value.id === entry.id);
      return recorded === undefined
        ? err(new ReceiptStoreFailed("configuration", "advisory identity"))
        : ok(recorded);
    });
    return locked._tag === "err" ? err(lockFailure(locked.error)) : locked.value;
  }
}
