import {
  connectorKeyVariable,
  connectorStatuses,
  planConnectorInvocation,
  type ConnectorStatus,
  type ConnectorsConfiguration,
  type HostPlatform,
} from "../../core/connectors/registry.ts";
import { resolveConnectorExecutable } from "./process.ts";

/**
 * Whether each registered connector could run here, read offline: the
 * manifest's entry, the filesystem and the environment's `PATH`, and the
 * presence of the key variable the connector's own command reads. Nothing is
 * started, contacted or consulted, and the key's value is never read, so
 * status and doctor can explain a missing executable, key or configuration
 * before any call is made.
 */

/** Where the configured executable stands on this machine. */
export type ExecutableReadiness =
  | { readonly state: "found"; readonly file: string }
  | { readonly state: "missing" }
  | { readonly state: "not-absolute"; readonly message: string };

/** One connector's registered and installed state, with what an enabled one would need here. */
export type ConnectorReadiness =
  | { readonly status: Extract<ConnectorStatus, { readonly state: "disabled" }> }
  | {
      readonly status: Extract<ConnectorStatus, { readonly state: "enabled" }>;
      readonly executable: ExecutableReadiness;
      /** The variable's name and whether the environment holds a non-empty value; never the value. */
      readonly key: { readonly variable: string; readonly present: boolean };
    };

/** Every registered connector's readiness, in listing order. */
export function connectorReadiness(
  connectors: ConnectorsConfiguration,
  environment: NodeJS.ProcessEnv,
  platform: HostPlatform,
): readonly ConnectorReadiness[] {
  return connectorStatuses(connectors).map((status): ConnectorReadiness => {
    if (status.state === "disabled") return { status };
    const variable = connectorKeyVariable(status.id);
    const value = environment[variable];
    const key = { variable, present: value !== undefined && value !== "" };
    // The same policy a call plans under decides whether the entry could run here at all.
    const planned = planConnectorInvocation(status.id, connectors, [], 1, platform);
    if (planned._tag === "err")
      return {
        status,
        executable: { state: "not-absolute", message: planned.error.message },
        key,
      };
    const file = resolveConnectorExecutable(status.executable, environment);
    return {
      status,
      executable: file === undefined ? { state: "missing" } : { state: "found", file },
      key,
    };
  });
}
