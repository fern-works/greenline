import { z } from "zod";
import { err, ok, type Result } from "./result.ts";

/** An invalid or lossy timestamp at the PostgreSQL/JavaScript Date boundary. */
class ExactInstantError extends Error {
  readonly _tag = "ExactInstantError" as const;
  readonly kind: "invalid" | "unsupported precision";
  constructor(kind: ExactInstantError["kind"]) {
    super(`exact instant ${kind}`);
    this.kind = kind;
  }
}

/** Parse an ISO instant only when PostgreSQL and the driver can round-trip it without loss. */
export function exactInstantMilliseconds(value: string): Result<number, ExactInstantError> {
  if (!z.iso.datetime().safeParse(value).success) return err(new ExactInstantError("invalid"));
  const fraction = /\.(\d+)Z$/u.exec(value)?.[1] ?? "";
  if (/[^0]/u.test(fraction.slice(3))) return err(new ExactInstantError("unsupported precision"));
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds)
    ? ok(milliseconds)
    : err(new ExactInstantError("invalid"));
}

/** Compare supported ISO spellings by exact represented instant, without rewriting either string. */
export function sameExactInstant(left: string, right: string): boolean {
  const parsedLeft = exactInstantMilliseconds(left);
  const parsedRight = exactInstantMilliseconds(right);
  return (
    parsedLeft._tag === "ok" && parsedRight._tag === "ok" && parsedLeft.value === parsedRight.value
  );
}
