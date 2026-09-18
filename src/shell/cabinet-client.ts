import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import type { Redacted } from "../commons/redacted.ts";
import { parseJson } from "../core/contract.ts";
import {
  CABINET_PROTOCOL,
  CabinetAccessFailed,
  CabinetError,
  parseCabinetList,
  parseCabinetUnit,
  parseCabinetVocabulary,
  validateQuery,
  type CabinetBinding,
  type Cabinet,
  type CabinetFailure,
} from "../core/cabinet.ts";
import { providerUrl } from "../core/guidance-configuration.ts";

/** Explicit provider access for one guided request; no repository discovery or retained library. */
export interface CabinetConnection {
  readonly url: string;
  readonly credential: Redacted<string>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly snapshot?: string;
}

/** One request's resolved publication and the four reads bound to it. */
/** An opened cabinet bound to one request publication. */
export interface GuidedCabinet extends CabinetBinding {
  readonly cabinet: Cabinet;
}

const publicationSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .refine((id) => id !== "." && id !== ".." && id.isWellFormed()),
    publishedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const errorSchema = z.object({
  error: z.object({
    kind: z.enum([
      "unknown facet",
      "unknown value",
      "unknown kind",
      "unknown responsibility",
      "unknown id",
      "unknown anchor",
      "no snapshot",
    ]),
  }),
});

interface Reply {
  readonly text: string;
  readonly snapshot: string;
}

interface Transport {
  readonly origin: string;
  readonly get: (
    path: string,
    operation: string,
    input: string,
    expected?: string,
  ) => Promise<Result<Reply, CabinetFailure>>;
}

function connect(options: CabinetConnection): Result<Transport, CabinetFailure> {
  const endpoint = providerUrl(options.url);
  if (endpoint === undefined) return err(new CabinetAccessFailed("configuration", "url"));
  const base = new URL(endpoint);
  if (!options.credential.reveal() || /\s/.test(options.credential.reveal()))
    return err(new CabinetAccessFailed("configuration", "credential"));
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 4_294_967_295)
    return err(new CabinetAccessFailed("configuration", "timeoutMs"));

  const get = async (
    path: string,
    operation: string,
    input: string,
    expected?: string,
  ): Promise<Result<Reply, CabinetFailure>> => {
    const deadline = AbortSignal.timeout(timeout);
    const signal =
      options.signal === undefined ? deadline : AbortSignal.any([deadline, options.signal]);
    try {
      const response = await fetch(new URL(path, base), {
        headers: { authorization: `Bearer ${options.credential.reveal()}` },
        signal,
        redirect: "error",
      });
      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        await response.body?.cancel().catch(() => undefined);
        return err(
          new CabinetAccessFailed(
            response.status >= 500 ? "unavailable" : "unauthorized",
            operation,
          ),
        );
      }
      const bytes = await response.arrayBuffer();
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return err(new CabinetAccessFailed("invalid response", operation));
      }
      if (response.status !== 200) {
        const parsed = errorSchema.safeParse(parseJson(text));
        if (parsed.success) {
          const kind = parsed.data.error.kind;
          if (response.status === 404 && kind === "no snapshot")
            return err(new CabinetAccessFailed("no snapshot", expected ?? input));
          if (
            (response.status === 404 && (kind === "unknown id" || kind === "unknown anchor")) ||
            (response.status === 400 &&
              kind !== "no snapshot" &&
              kind !== "unknown id" &&
              kind !== "unknown anchor")
          )
            return err(new CabinetError(kind, input));
        }
        return err(new CabinetAccessFailed("invalid response", operation));
      }
      if (response.headers.get("x-greenline-protocol") !== String(CABINET_PROTOCOL))
        return err(new CabinetAccessFailed("incompatible protocol", operation));
      const snapshot = response.headers.get("x-greenline-snapshot");
      if (
        !snapshot ||
        (expected !== undefined && snapshot !== expected) ||
        response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
          "application/json"
      )
        return err(new CabinetAccessFailed("invalid response", operation));
      return ok({ text, snapshot });
    } catch {
      return err(new CabinetAccessFailed(signal.aborted ? "cancelled" : "unavailable", operation));
    }
  };

  return ok({ origin: base.toString(), get });
}

function boundCabinet(transport: Transport, binding: CabinetBinding): GuidedCabinet {
  const { get } = transport;
  const snapshot = Object.freeze({ ...binding.snapshot });
  const vocabulary = structuredClone(binding.vocabulary);
  const prefix = `v1/snapshots/${encodeURIComponent(snapshot.id)}/`;
  const cabinet: Cabinet = {
    vocabulary: async () => structuredClone(vocabulary),
    list: async (query) => {
      const invalid = validateQuery(vocabulary, query);
      if (invalid) return err(invalid);
      const parameters = new URLSearchParams();
      for (const [name, values] of Object.entries(query))
        for (const value of values ?? []) parameters.append(name, value);
      // No query mark when the query is empty: Node 22's fetch drops an empty
      // query from the request target and Node 24 keeps it, so the wire form
      // is the one both send.
      const search = parameters.toString();
      const result = await get(
        `${prefix}units${search === "" ? "" : `?${search}`}`,
        "list",
        "list",
        snapshot.id,
      );
      return result._tag === "err"
        ? result
        : parseCabinetList(result.value.text, snapshot.id, vocabulary, query);
    },
    show: async (id) => {
      if (!id || id === "." || id === ".." || !id.isWellFormed())
        return err(new CabinetError("unknown id", id));
      const result = await get(`${prefix}units/${encodeURIComponent(id)}`, "show", id, snapshot.id);
      return result._tag === "err" ? result : parseCabinetUnit(result.value.text, id, vocabulary);
    },
    resolve: async (anchor) => {
      if (!anchor || anchor === "." || anchor === ".." || !anchor.isWellFormed())
        return err(new CabinetError("unknown anchor", anchor));
      const result = await get(
        `${prefix}anchors/${encodeURIComponent(anchor)}`,
        "resolve",
        anchor,
        snapshot.id,
      );
      if (result._tag === "err") return result;
      const owner = z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .safeParse(parseJson(result.value.text));
      return owner.success
        ? ok(owner.data)
        : err(new CabinetAccessFailed("invalid response", "resolve"));
    },
  };
  return { ...binding, snapshot, vocabulary: structuredClone(vocabulary), cabinet };
}

/** Resolve current once (or an explicit historical publication), then its vocabulary. */
export async function openHttpCabinet(
  options: CabinetConnection,
): Promise<Result<GuidedCabinet, CabinetFailure>> {
  const transport = connect(options);
  if (transport._tag === "err") return transport;
  const historical = options.snapshot;
  if (
    historical !== undefined &&
    (!historical ||
      historical === "current" ||
      historical === "." ||
      historical === ".." ||
      !historical.isWellFormed())
  )
    return err(new CabinetAccessFailed("configuration", "snapshot"));
  const path = historical === undefined ? "current" : encodeURIComponent(historical);
  const current = await transport.value.get(
    `v1/snapshots/${path}`,
    historical === undefined ? "current" : "publication",
    historical ?? "current",
    historical,
  );
  if (current._tag === "err") return current;
  const publication = publicationSchema.safeParse(parseJson(current.value.text));
  if (!publication.success || publication.data.id !== current.value.snapshot)
    return err(
      new CabinetAccessFailed(
        "invalid response",
        historical === undefined ? "current" : "publication",
      ),
    );
  const snapshot = publication.data;
  const supplied = await transport.value.get(
    `v1/snapshots/${encodeURIComponent(snapshot.id)}/vocabulary`,
    "vocabulary",
    snapshot.id,
    snapshot.id,
  );
  if (supplied._tag === "err") return supplied;
  const vocabulary = parseCabinetVocabulary(supplied.value.text);
  if (vocabulary._tag === "err") return vocabulary;
  return ok(
    boundCabinet(transport.value, {
      origin: transport.value.origin,
      protocol: CABINET_PROTOCOL,
      snapshot,
      vocabulary: vocabulary.value,
    }),
  );
}

/** Resume an already recorded binding without resolving current or fetching vocabulary again. */
export function resumeHttpCabinet(
  options: CabinetConnection,
  binding: CabinetBinding,
): Result<GuidedCabinet, CabinetFailure> {
  const transport = connect(options);
  if (transport._tag === "err") return transport;
  if (binding.protocol !== CABINET_PROTOCOL)
    return err(new CabinetAccessFailed("incompatible protocol", "request"));
  const publication = publicationSchema.safeParse(binding.snapshot);
  const vocabulary = parseCabinetVocabulary(JSON.stringify(binding.vocabulary));
  if (
    !publication.success ||
    vocabulary._tag === "err" ||
    binding.origin !== transport.value.origin ||
    (options.snapshot !== undefined && options.snapshot !== publication.data.id)
  )
    return err(new CabinetAccessFailed("configuration", "request binding"));
  return ok(
    boundCabinet(transport.value, {
      ...binding,
      snapshot: publication.data,
      vocabulary: vocabulary.value,
    }),
  );
}
