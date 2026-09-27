import {
  readGardenReply,
  type GardenCallIdentity,
  type GardenReply,
} from "../../core/connectors/garden-result.ts";
import {
  planConnectorInvocation,
  type ConnectorsConfiguration,
} from "../../core/connectors/registry.ts";
import { runConnectorProcess, type ProcessContext } from "./process.ts";

/**
 * The open-source garden adapter: one call to the separately installed
 * garden command, which the manifest names, through the registry's bounded
 * invocation policy, its reply read against the copied contract. It keeps
 * no HTTP path of its own, downloads nothing, and passes the caller's
 * environment, garden's key among it, to the child unread.
 */

/** A call's end as the bridge observed it: garden's validated reply, or a failure of its own seeing. */
export type GardenCallOutcome =
  | { readonly kind: "reply"; readonly reply: GardenReply }
  | {
      readonly kind: "failure";
      readonly error: {
        readonly kind:
          | "configuration"
          | "missing-executable"
          | "cancelled"
          | "deadline"
          | "output-cap"
          | "process"
          | "protocol";
        readonly input: string;
      };
    };

/** Run one garden call with its literal arguments and read what it answered. */
export async function callGarden(
  connectors: ConnectorsConfiguration,
  args: readonly string[],
  identity: GardenCallIdentity,
  timeoutMs: number,
  context: ProcessContext,
): Promise<GardenCallOutcome> {
  const failure = (
    kind: Extract<GardenCallOutcome, { kind: "failure" }>["error"]["kind"],
    input: string,
  ): GardenCallOutcome => ({ kind: "failure", error: { kind, input } });
  const invocation = planConnectorInvocation(
    "garden",
    connectors,
    args,
    timeoutMs,
    process.platform === "win32" ? "win32" : "posix",
  );
  if (invocation._tag === "err") return failure("configuration", invocation.error.message);
  const outcome = await runConnectorProcess(invocation.value, context);
  switch (outcome.kind) {
    case "missing":
      return failure(
        "missing-executable",
        `${invocation.value.executable} was not found or cannot run; greenline does not install garden`,
      );
    case "cancelled":
      return failure("cancelled", "the call was cancelled before garden answered");
    case "deadline":
      return failure("deadline", `garden did not answer within ${timeoutMs} ms`);
    case "overflow":
      return failure(
        "output-cap",
        `garden's stdout passed ${invocation.value.stdoutLimitBytes} bytes`,
      );
    case "signalled":
      return failure("process", `garden ended on ${outcome.signal} without a reply`);
    case "failed":
      return failure("process", `garden could not start: ${outcome.message}`);
    case "exited": {
      if (outcome.code !== 0 && outcome.code !== 2)
        return failure("process", `garden exited ${outcome.code} without a reply`);
      if (outcome.stdout === null) return failure("protocol", "garden's stdout is not UTF-8");
      const reply = readGardenReply(outcome.stdout, outcome.code, identity);
      return reply._tag === "err"
        ? failure("protocol", `${reply.error.problem}: ${reply.error.message}`)
        : { kind: "reply", reply: reply.value };
    }
  }
}
