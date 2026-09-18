import { err, ok, type Result } from "../commons/result.ts";

/**
 * Managed instruction blocks (`docs/adr/0004`). greenline owns a
 * bounded region of an otherwise user-owned file: everything outside
 * the markers is the user's, byte-for-byte; the region between them is
 * regenerated. This module is pure: parsing, composing, and rendering.
 */

export interface ManagedBlockSplit {
  /** User-owned content before the block marker. */
  readonly head: string;
  /** User-owned content after the block marker. */
  readonly tail: string;
  /**
   * The generated body between the markers, without the marker lines.
   * Undefined when the file has no block or its block is malformed.
   */
  readonly block: string | undefined;
  /** Layout problems that make the block unsafe to regenerate. */
  readonly issues: readonly string[];
}

function beginMarker(key: string): string {
  return `<!-- greenline:managed begin ${key} -->`;
}

function endMarker(key: string): string {
  return `<!-- greenline:managed end ${key} -->`;
}

/**
 * Split a file body into its managed block and the surrounding user
 * content. Blocks with keys other than ours are user content.
 */
export function splitManagedBlock(body: string, key: string): ManagedBlockSplit {
  const begin = beginMarker(key);
  const end = endMarker(key);
  const issues: string[] = [];

  const beginIndex = body.indexOf(begin);
  const endIndex = body.indexOf(end);
  const secondBegin = beginIndex === -1 ? -1 : body.indexOf(begin, beginIndex + begin.length);
  const secondEnd = endIndex === -1 ? -1 : body.indexOf(end, endIndex + end.length);

  if (beginIndex === -1 && endIndex === -1) {
    return { head: body, tail: "", block: undefined, issues };
  }
  if (beginIndex === -1) {
    issues.push(`END marker present without its BEGIN marker`);
    return { head: body, tail: "", block: undefined, issues };
  }
  if (beginIndex > 0 && body[beginIndex - 1] !== "\n") {
    issues.push(`BEGIN marker is not on its own line`);
    return { head: body, tail: "", block: undefined, issues };
  }
  if (endIndex === -1) {
    issues.push(`BEGIN marker present without its END marker`);
    return { head: body, tail: "", block: undefined, issues };
  }
  if (endIndex < beginIndex) {
    issues.push(`END marker appears before the BEGIN marker`);
    return { head: body, tail: "", block: undefined, issues };
  }
  if (secondBegin !== -1 || secondEnd !== -1) {
    issues.push(`duplicate block markers are not allowed`);
    return { head: body, tail: "", block: undefined, issues };
  }
  if (endIndex > 0 && body[endIndex - 1] !== "\n") {
    issues.push(`END marker is not on its own line`);
    return { head: body, tail: "", block: undefined, issues };
  }

  let block = body.slice(beginIndex + begin.length, endIndex);
  if (block.startsWith("\n")) block = block.slice(1);
  if (block.endsWith("\n")) block = block.slice(0, -1);
  let tail = body.slice(endIndex + end.length);
  if (tail.startsWith("\n")) tail = tail.slice(1);
  return {
    head: body.slice(0, beginIndex),
    tail,
    block,
    issues,
  };
}

/**
 * Render a file from its user parts and generated block. The reverse
 * of splitManagedBlock: split-then-render is byte-identical.
 */
export function renderManagedBlock(head: string, block: string, tail: string, key: string): string {
  return `${head}${beginMarker(key)}\n${block}\n${endMarker(key)}\n${tail}`;
}

/** A managed-block path ready for planning: bytes to write + owned region. */
export interface BlockTarget {
  /** Full file bytes to write, including user content around the block. */
  readonly text: string;
  /** The owned region whose digest the lock tracks. */
  readonly owned: string;
}

/** The file's markers are malformed; the owned region is unsafe to touch. */
export class ManagedBlockBroken extends Error {
  readonly _tag = "ManagedBlockBroken" as const;
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`managed block layout is broken: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

/**
 * Compose the full text of a managed-block path from the user file on
 * disk (if any) and the desired generated body. A file without our
 * block gets the block prepended so the always-loaded policy is near
 * the top (ADR 0004); user bytes outside the region are never touched.
 * Malformed markers fail closed with the layout issues.
 */
export function composeBlockTarget(
  diskFile: string | undefined,
  desiredBlock: string,
  key: string,
): Result<BlockTarget, ManagedBlockBroken> {
  if (diskFile === undefined) {
    return ok({ text: renderManagedBlock("", desiredBlock, "", key), owned: desiredBlock });
  }
  const split = splitManagedBlock(diskFile, key);
  if (split.issues.length > 0) return err(new ManagedBlockBroken(split.issues));
  if (split.block === undefined) {
    return ok({
      text: `${renderManagedBlock("", desiredBlock, "", key)}${diskFile}`,
      owned: desiredBlock,
    });
  }
  return ok({
    text: renderManagedBlock(split.head, desiredBlock, split.tail, key),
    owned: desiredBlock,
  });
}
