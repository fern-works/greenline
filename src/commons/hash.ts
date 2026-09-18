import { createHash } from "node:crypto";

/**
 * SHA-256 hex digest of bytes or a UTF-8 string. Used for the managed-file
 * ownership model (`docs/SPEC.md` §5): the lock records the digest of
 * every managed region and the gate compares digests, never contents.
 */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
