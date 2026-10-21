/**
 * The defect helpers (`docs/CODE-STANDARDS.md` §2): a defect is a broken
 * internal invariant or an impossible branch, and only a defect throws.
 * An expected failure is a Result value, never one of these.
 */

/**
 * Close an exhaustive switch over a union: the call typechecks only when
 * every case is handled, so reaching it at run time is a defect.
 * @param unexpected the value no case handled; `never` when the switch is exhaustive
 * @returns never
 * @throws always, naming the value no case handled
 */
export function casesHandled(unexpected: never): never {
  throw new Error(`A case no branch handles reached casesHandled: ${JSON.stringify(unexpected)}`);
}

/**
 * Mark a branch the program's invariants make unreachable, such as a
 * lookup a parser has already proved will succeed.
 * @param message the invariant that broke
 * @returns never
 * @throws always, carrying the message
 */
export function shouldNeverHappen(message?: string): never {
  throw new Error(message ?? "A branch that should never run was reached.");
}
