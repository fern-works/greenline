/**
 * The Result type — expected failures as tagged values
 * (`docs/CODE-STANDARDS.md` §2).
 *
 * Every known failure mode of a function appears in its return type as a
 * custom tagged error. A caller handles it or returns it upward; at the
 * outermost boundary it becomes a valid outcome — a CLI exit code, a
 * structured diagnostic, a conflict report.
 */

/** The base contract every tagged failure error satisfies. */
export type TaggedError = Error & { readonly _tag: string };

/** A computation outcome: either a value or a tagged, expected failure. */
export type Result<T, E extends TaggedError> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

/** Wrap a value in the ok state. */
export function ok<T>(value: T): Result<T, never> {
  return { _tag: "ok", value };
}

/** Wrap a tagged error in the err state. */
export function err<E extends TaggedError>(error: E): Result<never, E> {
  return { _tag: "err", error };
}

/** Transform the value of an ok result, passing err results through. */
export function map<T, E extends TaggedError, U>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result._tag === "ok" ? ok(fn(result.value)) : result;
}

/** Chain a fallible step from an ok result, passing err results through. */
export function andThen<T, E extends TaggedError, U, E2 extends TaggedError>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E2>,
): Result<U, E | E2> {
  return result._tag === "err" ? result : fn(result.value);
}

/** Destructure both states into plain values. */
export function match<T, E extends TaggedError, R>(
  result: Result<T, E>,
  cases: { readonly ok: (value: T) => R; readonly err: (error: E) => R },
): R {
  return result._tag === "ok" ? cases.ok(result.value) : cases.err(result.error);
}

/** Type predicate narrowing a result to its ok state. */
export function isOk<T, E extends TaggedError>(
  result: Result<T, E>,
): result is { readonly _tag: "ok"; readonly value: T } {
  return result._tag === "ok";
}
