import { z } from "zod";

/** The two deliberate installation states. Credentials never belong in either. */
export type GuidanceConfiguration =
  | { readonly state: "unconfigured" }
  | { readonly state: "configured"; readonly provider: string };

/** Canonical provider endpoint; undefined for credentials, unsafe HTTP or URL parameters. */
export function providerUrl(input: string): string | undefined {
  try {
    const url = new URL(input);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined;
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Shared boundary grammar for installation and recorded configuration facts. */
export const guidanceConfigurationSchema: z.ZodType<GuidanceConfiguration> = z.discriminatedUnion(
  "state",
  [
    z.object({ state: z.literal("unconfigured") }).strict(),
    z
      .object({
        state: z.literal("configured"),
        provider: z.string().transform((value, context) => {
          const parsed = providerUrl(value);
          if (parsed !== undefined) return parsed;
          context.addIssue({
            code: "custom",
            message:
              "use HTTPS or loopback HTTP without credentials, query parameters or a fragment",
          });
          return z.NEVER;
        }),
      })
      .strict(),
  ],
);
