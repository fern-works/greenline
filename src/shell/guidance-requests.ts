import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import { CabinetAccessFailed } from "../core/cabinet.ts";
import {
  parseGuidanceRequest,
  receiptCoverage,
  type GuidanceAdvisory,
  type GuidanceRequest,
  type GuidanceReceipt,
  type ReceiptUnit,
} from "../core/guidance-receipts.ts";
import { createNodeFileIo, type FileIo } from "./fs/io.ts";
import { withWorkspaceWrite } from "./fs/workspace-write.ts";

type Failure = CabinetAccessFailed;
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
const missing = z.object({ code: z.literal("ENOENT") });

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
      return err(new CabinetAccessFailed("configuration", "request id"));
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
          return err(new CabinetAccessFailed("unavailable", "receipt directory"));
      } catch (error) {
        if (!missing.safeParse(error).success)
          return err(new CabinetAccessFailed("unavailable", "receipt directory"));
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
          return err(new CabinetAccessFailed("unavailable", "receipt file"));
      } catch (error) {
        if (!missing.safeParse(error).success)
          return err(new CabinetAccessFailed("unavailable", "receipt file"));
      }
    }
    return ok(path);
  }

  /** Load one exact handle. Absence or malformed evidence never starts another request. */
  read(id: string): Result<GuidanceRequest, Failure> {
    const path = this.#path(id);
    if (path._tag === "err") return path;
    const content = this.#io.read(path.value);
    if (content._tag === "err")
      return err(new CabinetAccessFailed("unavailable", "request handle"));
    const request = parseGuidanceRequest(content.value, path.value);
    return request._tag === "err" || request.value.id !== id
      ? err(new CabinetAccessFailed("configuration", "request evidence"))
      : request;
  }

  /** Discover every collection; the account never chooses an inventory subset. */
  all(): Result<readonly GuidanceRequest[], Failure> {
    const path = this.#path();
    if (path._tag === "err") return path;
    let names: string[];
    try {
      names = readdirSync(path.value)
        .filter((name) => name.endsWith(".json"))
        .sort();
    } catch (error) {
      return missing.safeParse(error).success
        ? ok([])
        : err(new CabinetAccessFailed("unavailable", "receipt directory"));
    }
    const records: GuidanceRequest[] = [];
    for (const name of names) {
      const value = this.read(name.slice(0, -5));
      if (value._tag === "err") return value;
      records.push(value.value);
    }
    return ok(records);
  }

  #write(request: GuidanceRequest): Result<GuidanceRequest, Failure> {
    const path = this.#path(request.id);
    if (path._tag === "err") return path;
    const text = JSON.stringify(request, null, 2) + "\n";
    const parsed = parseGuidanceRequest(text, path.value);
    if (parsed._tag === "err")
      return err(new CabinetAccessFailed("configuration", "receipt update"));
    const written = this.#io.write(path.value, text);
    return written._tag === "err"
      ? err(new CabinetAccessFailed("unavailable", "receipt persistence"))
      : ok(parsed.value);
  }

  /** Allocate only a new durable collection, never replace a known handle. */
  create(request: GuidanceRequest): Result<GuidanceRequest, Failure> {
    if (request.owner.record === null)
      return err(new CabinetAccessFailed("configuration", "read-only persistence"));
    const path = this.#path(request.id);
    if (path._tag === "err") return path;
    const locked = withWorkspaceWrite(this.#root, () => {
      const exists = this.#io.read(path.value);
      if (exists._tag === "ok" || exists.error.step !== "absent")
        return err(new CabinetAccessFailed("configuration", "request already exists"));
      return this.#write(request);
    });
    return locked._tag === "err"
      ? err(new CabinetAccessFailed("unavailable", "receipt write lock"))
      : locked.value;
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
        return err(new CabinetAccessFailed("configuration", "request binding changed"));
      const next = change(current.value);
      return next._tag === "err" ? next : this.#write(next.value);
    });
    return locked._tag === "err"
      ? err(new CabinetAccessFailed("unavailable", "receipt write lock"))
      : locked.value;
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
      ? err(new CabinetAccessFailed("configuration", "receipt identity"))
      : ok(receipt);
  }

  #receipt(
    expected: GuidanceRequest,
    id: string,
    change: (entry: GuidanceReceipt) => GuidanceReceipt,
  ): Result<GuidanceReceipt, Failure> {
    const changed = this.#change(expected, (current) => {
      const existing = current.receipts.find((entry) => entry.id === id);
      if (existing?.outcome !== "pending")
        return err(new CabinetAccessFailed("configuration", "receipt is not pending"));
      return ok({
        ...current,
        receipts: current.receipts.map((entry) => (entry.id === id ? change(entry) : entry)),
      });
    });
    if (changed._tag === "err") return changed;
    const receipt = changed.value.receipts.find((entry) => entry.id === id);
    return receipt === undefined
      ? err(new CabinetAccessFailed("configuration", "receipt identity"))
      : ok(receipt);
  }

  /** Append validated delivery facts immediately, including before a later batch failure. */
  deliver(
    expected: GuidanceRequest,
    id: string,
    units: readonly ReceiptUnit[],
    count: number | null = null,
  ): Result<GuidanceReceipt, Failure> {
    return this.#receipt(expected, id, (entry) => ({
      ...entry,
      units: [...entry.units, ...units],
      count: count ?? entry.count,
    }));
  }

  /** Seal coverage or failure. No output-success or comprehension verdict is recorded. */
  finish(
    expected: GuidanceRequest,
    id: string,
    error: GuidanceReceipt["error"],
    at: string,
    count: number | null,
  ): Result<GuidanceReceipt, Failure> {
    return this.#receipt(expected, id, (entry) => ({
      ...entry,
      finishedAt: at,
      count: count ?? entry.count,
      error,
      outcome: receiptCoverage(error, entry.units),
    }));
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
        ? err(new CabinetAccessFailed("configuration", "advisory identity"))
        : ok(recorded);
    });
    return locked._tag === "err"
      ? err(new CabinetAccessFailed("unavailable", "receipt write lock"))
      : locked.value;
  }
}
