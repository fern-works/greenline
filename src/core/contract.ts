import { err, ok, type Result } from "../commons/result.ts";

/**
 * Shared plumbing for the versioned JSON contracts (manifest and lock,
 * `docs/SPEC.md` §5). Parsing happens at the boundary: JSON text in,
 * a typed result out, every rejection carrying source-located,
 * actionable fields.
 */

/** One rejectable mistake inside a contract document. */
export interface InvalidField {
  readonly path: string;
  readonly message: string;
}

/** The contract's rejections are expected failures, never throws. */
export class ContractParseFailed extends Error {
  readonly _tag = "ContractParseFailed" as const;
  readonly source: string;
  readonly issues: readonly InvalidField[];
  constructor(source: string, issues: readonly InvalidField[]) {
    super(`${source}: invalid contract (${issues.length} issue(s))`);
    this.source = source;
    this.issues = issues;
  }
}

/** The complete JSON value universe; sound because JSON.parse only produces these. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Parse JSON text; undefined means the text was not valid JSON. */
export function parseJson(input: string): JsonValue | undefined {
  try {
    // SAFETY: valid JSON is by definition a JsonValue; JSON.parse succeeds
    // only on valid JSON, and the consuming zod schemas re-check the shape.
    return JSON.parse(input) as JsonValue;
  } catch {
    return undefined;
  }
}

function isPlainObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return (
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/** Check the schemaVersion of an unknown document with a clear message. */
export function checkContractVersion(
  raw: JsonValue,
  kind: string,
  expected: number,
): InvalidField | undefined {
  if (!isPlainObject(raw)) {
    return { path: "schemaVersion", message: `${kind} must be a JSON object with a schemaVersion` };
  }
  if (raw["schemaVersion"] !== expected) {
    return {
      path: "schemaVersion",
      message: `unsupported ${kind} schema version '${String(raw["schemaVersion"])}' (expected ${expected})`,
    };
  }
  return undefined;
}

function formatPath(parts: readonly (string | number | symbol)[]): string {
  return parts
    .map((part) => {
      const text = String(part);
      return /^\d+$/.test(text) ? `[${text}]` : text;
    })
    .join(".")
    .replace(/\.\[/g, "[");
}

/** Map zod's issue list to the contract's stable field shape. */
export function issuesFrom(
  issues: readonly {
    readonly path: readonly (string | number | symbol)[];
    readonly message: string;
  }[],
): readonly InvalidField[] {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? "" : formatPath(issue.path),
    message: issue.message,
  }));
}

/** Convenience wrapper used by every contract parser. */
export function contractFailure(
  source: string,
  issues: readonly InvalidField[],
): Result<never, ContractParseFailed> {
  return err(new ContractParseFailed(source, issues));
}

/** Convenience wrapper used by every contract parser. */
export function contractOk<T>(value: T): Result<T, ContractParseFailed> {
  return ok(value);
}
