import { err, ok, type Result } from "../commons/result.ts";
import { CabinetAccessFailed, type Cabinet, type CabinetFailure, type Unit } from "./cabinet.ts";

/** Frozen call limits; the caller supplies the signal that owns its deadline. */
export interface ReadingLimits {
  readonly maxUnits: number;
  readonly maxBytes: number;
  readonly signal: AbortSignal;
  readonly requires: boolean;
}

function readWithinSignal(
  cabinet: Cabinet,
  id: string,
  signal: AbortSignal,
): Promise<Result<Unit, CabinetFailure>> {
  return new Promise((resolve) => {
    const cancel = (): void => resolve(err(new CabinetAccessFailed("cancelled", "read")));
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
    void cabinet
      .show(id)
      .then(resolve, () => resolve(err(new CabinetAccessFailed("unavailable", "read"))))
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** Read an explicit selection and its prerequisites once, returning prerequisites first.
 * The caller supplies all prohibited ids, including containment/group expansion.
 * Holds no cache between calls; partial deliveries are not a successful batch.
 */
export async function readUnits(
  cabinet: Cabinet,
  ids: readonly string[],
  blocked: ReadonlySet<string>,
  limits: ReadingLimits,
): Promise<Result<readonly Unit[], CabinetFailure>> {
  if (
    !Number.isSafeInteger(limits.maxUnits) ||
    limits.maxUnits < 1 ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 1
  )
    return err(new CabinetAccessFailed("configuration", "read limits"));
  const visiting = new Set<string>();
  const read = new Set<string>();
  let deliveredCount = 0;
  let deliveredBytes = 0;
  const units: Unit[] = [];
  const visit = async (id: string): Promise<Result<void, CabinetFailure>> => {
    if (limits.signal.aborted) return err(new CabinetAccessFailed("cancelled", "read"));
    if (blocked.has(id)) return err(new CabinetAccessFailed("excluded", id));
    if (visiting.has(id)) return err(new CabinetAccessFailed("invalid response", "requires cycle"));
    if (read.has(id)) return ok(undefined);
    if (deliveredCount >= limits.maxUnits)
      return err(new CabinetAccessFailed("budget exceeded", "maxUnits"));
    deliveredCount++;
    visiting.add(id);
    const delivered = await readWithinSignal(cabinet, id, limits.signal);
    if (delivered._tag === "err") return delivered;
    deliveredBytes += new TextEncoder().encode(delivered.value.content).length;
    if (deliveredBytes > limits.maxBytes)
      return err(new CabinetAccessFailed("budget exceeded", "maxBytes"));
    for (const required of limits.requires ? delivered.value.requires : []) {
      const result = await visit(required);
      if (result._tag === "err") return result;
    }
    visiting.delete(id);
    read.add(id);
    units.push(delivered.value);
    return ok(undefined);
  };
  for (const id of ids) {
    const result = await visit(id);
    if (result._tag === "err") return result;
  }
  return ok(units);
}
