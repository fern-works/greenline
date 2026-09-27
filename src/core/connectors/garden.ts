import { z } from "zod";
import { err, ok, type Result } from "../../commons/result.ts";
import { providerUrl } from "../guidance-configuration.ts";
import type { ReceiptQuery } from "../guidance-receipts.ts";

/**
 * garden's own half of the connector (the decoupling plan's contract T2):
 * the configuration its manifest entry holds, the values it declares to the
 * common layer in `registry.ts`, and the six finite reads with the literal
 * command line each becomes. Its result validation is `garden-result.ts`.
 */

/** garden's installed configuration: where it is called and which executable runs; never a credential. */
export interface GardenConfiguration {
  /** The canonical endpoint garden is called with: HTTPS, or loopback HTTP for fixtures. */
  readonly endpoint: string;
  /** `garden` on the PATH, or an absolute path to the executable. */
  readonly executable: string;
}

/** The executable an entry names when enabling is given none: the garden command on the PATH. */
export const GARDEN_COMMAND = "garden";

/** The opt-in skill that explains a garden consultation, installed only while garden is enabled. */
export const GARDEN_SKILL = "use-garden";

/** One line naming the connector in a listing. */
export const GARDEN_SUMMARY =
  "garden, the separately installed command that answers guidance questions";

/** The environment variable garden reads its key from; greenline checks its presence and never reads its value. */
export const GARDEN_KEY_VARIABLE: string = "GARDEN_API_KEY";

/** What enabling garden leaves to the person, stated without contacting anything. */
export const GARDEN_PREREQUISITE: string = `greenline neither installs nor runs garden: install the garden command separately; garden reads its key from ${GARDEN_KEY_VARIABLE} in your environment, and greenline stores no credential.`;

/** A garden process's captured stdout is capped at 2 MiB (contract T2). */
export const GARDEN_STDOUT_LIMIT_BYTES = 2_097_152;

/** One total deadline spans a garden call, at most the 30,000 ms read budget garden keeps (contract T1). */
export const GARDEN_MAX_DEADLINE_MS = 30_000;

/** The most units one read may deliver (contract T1). */
export const GARDEN_MAX_UNITS = 16;

/** The most UTF-8 content bytes one read may deliver (contract T1). */
export const GARDEN_MAX_BYTES = 262_144;

/**
 * The fields of a `garden.result/v1` document a receipt may keep: every
 * field but `result`, which carries the unit bodies. The delivery keeps
 * identities, revisions, content hashes and byte counts, which are body-free.
 */
export const GARDEN_RECEIPT_FIELDS: readonly string[] = [
  "format",
  "clientVersion",
  "ok",
  "operation",
  "callId",
  "origin",
  "snapshot",
  "delivery",
  "limits",
  "error",
];

const ENDPOINT_RULE =
  "an HTTPS URL, or HTTP on a loopback address (127.0.0.0/8 or [::1]) for fixtures, without credentials, query parameters or a fragment";
const EXECUTABLE_RULE = "garden, or an absolute path to the garden executable";

/**
 * Absolute on POSIX (`/…`) or Windows (`C:\…`, `C:/…`, `\\server\…`), whatever
 * platform reads the committed manifest. The invocation policy in
 * `registry.ts` runs only a path absolute on the platform running it.
 */
const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

/**
 * A control, format, surrogate, private-use or unassigned character (C0 and
 * C1 controls, bidirectional overrides, zero-width characters), which cannot
 * pass through a literal argument, a terminal or a receipt safely.
 */
function hasControl(input: string): boolean {
  return /\p{C}/u.test(input);
}

/** The executable an entry may name: `garden` itself, or an absolute path; undefined otherwise. */
function gardenExecutable(input: string): string | undefined {
  if (hasControl(input)) return undefined;
  return input === GARDEN_COMMAND || ABSOLUTE.test(input) ? input : undefined;
}

/**
 * The endpoint garden accepts: HTTPS, or HTTP on a loopback address, which
 * garden takes to be 127.0.0.0/8 or [::1] and never the name `localhost`.
 */
function gardenEndpoint(input: string): string | undefined {
  const endpoint = providerUrl(input);
  if (endpoint === undefined || !endpoint.startsWith("http:")) return endpoint;
  const host = new URL(endpoint).hostname;
  return host === "[::1]" || /^127(?:\.[0-9]{1,3}){3}$/u.test(host) ? endpoint : undefined;
}

/** The manifest entry's grammar; an unknown field, a credential among them, is refused. */
export const gardenConfigurationSchema: z.ZodType<GardenConfiguration> = z
  .object({
    endpoint: z.string().transform((value, context) => {
      const endpoint = gardenEndpoint(value);
      if (endpoint !== undefined) return endpoint;
      context.addIssue({ code: "custom", message: `use ${ENDPOINT_RULE}` });
      return z.NEVER;
    }),
    executable: z
      .string()
      .refine((value) => gardenExecutable(value) === value, `use ${EXECUTABLE_RULE}`),
  })
  .strict();

/** A refused enabling input, located at the flag that carried it. */
export class GardenConfigurationRefused extends Error {
  readonly _tag = "GardenConfigurationRefused" as const;
  /** The flag whose value was refused. */
  readonly flag: "--url" | "--executable";
  constructor(flag: "--url" | "--executable", rule: string) {
    super(`${flag} must be ${rule}`);
    this.flag = flag;
  }
}

/** Build garden's entry from the enabling flags; the executable defaults to the command on the PATH. */
export function parseGardenConfiguration(input: {
  readonly url: string;
  readonly executable: string | undefined;
}): Result<GardenConfiguration, GardenConfigurationRefused> {
  const endpoint = gardenEndpoint(input.url);
  if (endpoint === undefined) return err(new GardenConfigurationRefused("--url", ENDPOINT_RULE));
  const executable = gardenExecutable(input.executable ?? GARDEN_COMMAND);
  if (executable === undefined)
    return err(new GardenConfigurationRefused("--executable", EXECUTABLE_RULE));
  return ok({ endpoint, executable });
}

/** The six reads garden answers. */
export type GardenOperation = "snapshot" | "vocabulary" | "list" | "read" | "resolve" | "changes";

/** The facet filters a list takes, as a receipt records them; values of one filter are alternatives. */
export type GardenQuery = ReceiptQuery;

/** The list filters, in the order they reach the command line. */
export const GARDEN_FILTERS = [
  "language",
  "purpose",
  "technology",
  "task",
  "concern",
  "kind",
  "responsibility",
] as const;

/**
 * One read's neutral inputs, the only things greenline passes to garden:
 * the publication, the query, the units, the exclusions and the budget.
 * `snapshot` is `current` only on a request's first call.
 */
export type GardenRead =
  | { readonly operation: "snapshot"; readonly id: string }
  | { readonly operation: "vocabulary"; readonly snapshot: string }
  | { readonly operation: "list"; readonly snapshot: string; readonly query: GardenQuery }
  | {
      readonly operation: "read";
      readonly snapshot: string;
      readonly ids: readonly string[];
      readonly requires: boolean;
      readonly exclude: readonly string[];
      readonly maxUnits: number;
      readonly maxBytes: number;
    }
  | { readonly operation: "resolve"; readonly snapshot: string; readonly anchor: string }
  | { readonly operation: "changes"; readonly from: string; readonly to: string };

/** Where one call goes and how it is identified; the endpoint is the installed entry's. */
export interface GardenCallContext {
  readonly endpoint: string;
  readonly callId: string;
  readonly timeoutMs: number;
}

/** An input that cannot pass to garden as a neutral literal. */
export class GardenInputRefused extends Error {
  readonly _tag = "GardenInputRefused" as const;
  /** The flag whose value was refused. */
  readonly flag: string;
  constructor(flag: string, rule: string) {
    super(`${flag} must be ${rule}`);
    this.flag = flag;
  }
}

const UNIT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CALL_ID = /^[!-~]{1,128}$/u;

/** A literal value: non-empty and free of control characters. */
function literal(value: string): boolean {
  return value.length > 0 && !hasControl(value);
}

/** An exact publication id, or `current` where the read may resolve it. */
function publication(value: string, current: "current allowed" | "exact only"): boolean {
  return (
    literal(value) &&
    value !== "." &&
    value !== ".." &&
    (current === "current allowed" || value !== "current")
  );
}

/**
 * The literal command line one garden read becomes. Every value passes as
 * `--flag=value`, one argument each, so no value is ever read as a flag;
 * the endpoint is always named, so `GARDEN_URL` cannot redirect the call;
 * no credential, path or work record is ever an argument.
 */
export function gardenArguments(
  read: GardenRead,
  call: GardenCallContext,
): Result<readonly string[], GardenInputRefused> {
  const refuse = (flag: string, rule: string): Result<never, GardenInputRefused> =>
    err(new GardenInputRefused(flag, rule));
  if (!CALL_ID.test(call.callId)) return refuse("--call-id", "1 to 128 visible ASCII characters");
  if (
    !Number.isInteger(call.timeoutMs) ||
    call.timeoutMs < 1 ||
    call.timeoutMs > GARDEN_MAX_DEADLINE_MS
  )
    return refuse("--timeout-ms", `a whole number from 1 to ${GARDEN_MAX_DEADLINE_MS}`);
  const common = [
    `--url=${call.endpoint}`,
    `--call-id=${call.callId}`,
    `--timeout-ms=${call.timeoutMs}`,
  ];
  const snapshot = (value: string): Result<string, GardenInputRefused> =>
    publication(value, "current allowed")
      ? ok(`--snapshot=${value}`)
      : refuse("--snapshot", "current or an exact publication id");
  switch (read.operation) {
    case "snapshot":
      return publication(read.id, "current allowed")
        ? ok(["snapshot", `--id=${read.id}`, ...common])
        : refuse("--id", "current or an exact publication id");
    case "vocabulary": {
      const bound = snapshot(read.snapshot);
      return bound._tag === "err" ? bound : ok(["vocabulary", bound.value, ...common]);
    }
    case "list": {
      const bound = snapshot(read.snapshot);
      if (bound._tag === "err") return bound;
      const filters = GARDEN_FILTERS.flatMap((facet) =>
        (read.query[facet] ?? []).map((value) => ({ facet, value })),
      );
      if (filters.length === 0)
        return refuse("--language", "given: a list names at least one filter");
      const bad = filters.find(({ value }) => !literal(value));
      if (bad !== undefined) return refuse(`--${bad.facet}`, "a non-empty literal value");
      return ok([
        "list",
        bound.value,
        ...filters.map(({ facet, value }) => `--${facet}=${value}`),
        ...common,
      ]);
    }
    case "read": {
      const bound = snapshot(read.snapshot);
      if (bound._tag === "err") return bound;
      if (read.ids.length === 0 || read.ids.some((id) => !UNIT_ID.test(id)))
        return refuse("--id", "one or more unit ids");
      if (read.exclude.some((id) => !UNIT_ID.test(id))) return refuse("--exclude", "a unit id");
      if (!Number.isInteger(read.maxUnits) || read.maxUnits < 1 || read.maxUnits > GARDEN_MAX_UNITS)
        return refuse("--max-units", `a whole number from 1 to ${GARDEN_MAX_UNITS}`);
      if (!Number.isInteger(read.maxBytes) || read.maxBytes < 1 || read.maxBytes > GARDEN_MAX_BYTES)
        return refuse("--max-bytes", `a whole number from 1 to ${GARDEN_MAX_BYTES}`);
      return ok([
        "read",
        bound.value,
        ...read.ids.map((id) => `--id=${id}`),
        ...(read.requires ? ["--requires"] : []),
        ...read.exclude.map((id) => `--exclude=${id}`),
        `--max-units=${read.maxUnits}`,
        `--max-bytes=${read.maxBytes}`,
        ...common,
      ]);
    }
    case "resolve": {
      const bound = snapshot(read.snapshot);
      if (bound._tag === "err") return bound;
      return literal(read.anchor)
        ? ok(["resolve", bound.value, `--anchor=${read.anchor}`, ...common])
        : refuse("--anchor", "a non-empty literal anchor");
    }
    case "changes":
      if (!publication(read.from, "exact only")) return refuse("--from", "an exact publication id");
      if (!publication(read.to, "exact only")) return refuse("--to", "an exact publication id");
      return ok(["changes", `--from=${read.from}`, `--to=${read.to}`, ...common]);
  }
}
