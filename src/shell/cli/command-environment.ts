import type { Installation } from "../../core/installation.ts";
import type { PromptPort } from "./prompt.ts";
import type { FileIo } from "../fs/io.ts";
/** Explicit local installation and repository context; no guidance library. */
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly installation: Installation;
  readonly prompt?: PromptPort;
}
/** Repository diagnostics can describe missing installation assets without substituting one. */
export type RepositoryEnvironment = Omit<CliEnvironment, "installation"> & {
  readonly installation?: Installation;
};
/** Optional repository bytes; callers own missing-state behavior. */
export function envRead(io: FileIo, path: string): string | undefined {
  const read = io.read(path);
  return read._tag === "ok" ? read.value : undefined;
}
