import { describe, expect, it } from "vitest";
import { isOk } from "../../src/commons/result.ts";
import {
  composeBlockTarget,
  ManagedBlockBroken,
  renderManagedBlock,
  splitManagedBlock,
} from "../../src/core/managed-block.ts";

const KEY: string = "policy";

describe("splitManagedBlock", () => {
  it("returns the body as user content when no block exists", () => {
    const split = splitManagedBlock("# My notes\nplain text\n", KEY);
    expect(split.block).toBeUndefined();
    expect(split.issues).toEqual([]);
    expect(split.head).toBe("# My notes\nplain text\n");
    expect(split.tail).toBe("");
  });

  it("extracts the block and preserves surrounding user content", () => {
    const body = renderManagedBlock("user head\n", "generated body", "user tail\n", KEY);
    const split = splitManagedBlock(body, KEY);
    expect(split.issues).toEqual([]);
    expect(split.block).toBe("generated body");
    expect(split.head).toBe("user head\n");
    expect(split.tail).toBe("user tail\n");
  });

  it("round-trips: split then render is byte-identical", () => {
    const body = renderManagedBlock(
      "head line\n",
      "block line 1\nblock line 2",
      "tail line\n",
      KEY,
    );
    const split = splitManagedBlock(body, KEY);
    expect(split.issues).toEqual([]);
    const rebuilt = renderManagedBlock(split.head, split.block ?? "", split.tail, KEY);
    expect(rebuilt).toBe(body);
  });

  it("handles a file that has no user content at all", () => {
    const body = renderManagedBlock("", "only block", "", KEY);
    const split = splitManagedBlock(body, KEY);
    expect(split.head).toBe("");
    expect(split.tail).toBe("");
    expect(split.block).toBe("only block");
  });

  it("reports a missing END marker as malformed", () => {
    const split = splitManagedBlock("<!-- greenline:managed begin policy -->\nbody", KEY);
    expect(split.block).toBeUndefined();
    expect(split.issues.some((issue) => issue.includes("END"))).toBe(true);
  });

  it("reports a missing BEGIN marker as malformed", () => {
    const split = splitManagedBlock("body\n<!-- greenline:managed end policy -->\n", KEY);
    expect(split.block).toBeUndefined();
    expect(split.issues.some((issue) => issue.includes("BEGIN"))).toBe(true);
  });

  it("reports reversed markers as malformed", () => {
    const split = splitManagedBlock(
      "<!-- greenline:managed end policy -->\n<!-- greenline:managed begin policy -->\n",
      KEY,
    );
    expect(split.block).toBeUndefined();
    expect(split.issues.length).toBeGreaterThan(0);
  });

  it("reports duplicate markers as malformed", () => {
    const body =
      "<!-- greenline:managed begin policy -->\na\n<!-- greenline:managed begin policy -->\nb\n<!-- greenline:managed end policy -->\n";
    const split = splitManagedBlock(body, KEY);
    expect(split.block).toBeUndefined();
    expect(split.issues.some((issue) => issue.includes("duplicate"))).toBe(true);
  });

  it("treats another key's block as user content", () => {
    const foreign =
      "<!-- greenline:managed begin other -->\nx\n<!-- greenline:managed end other -->\n";
    const split = splitManagedBlock(foreign, KEY);
    expect(split.block).toBeUndefined();
    expect(split.head).toBe(foreign);
  });

  it("reports a marker mid-line as malformed", () => {
    const split = splitManagedBlock(
      "no newline before <!-- greenline:managed begin policy -->\n",
      KEY,
    );
    expect(split.block).toBeUndefined();
    expect(split.issues.some((issue) => issue.includes("own line"))).toBe(true);
  });
});

describe("composeBlockTarget", () => {
  const desiredBlock = "> owned\n\nGenerated roster.";

  it("composes a block-only file when nothing exists on disk", () => {
    const result = composeBlockTarget(undefined, desiredBlock, KEY);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.owned).toBe(desiredBlock);
    expect(splitManagedBlock(result.value.text, KEY)).toEqual({
      head: "",
      tail: "",
      block: desiredBlock,
      issues: [],
    });
    expect(result.value.text.endsWith("\n")).toBe(true);
  });

  it("replaces an existing block in place and preserves user bytes outside it", () => {
    const diskFile = renderManagedBlock(
      "# My project\n",
      "old generated body",
      "## Release notes\nKeep these.\n",
      KEY,
    );
    const result = composeBlockTarget(diskFile, desiredBlock, KEY);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const split = splitManagedBlock(result.value.text, KEY);
    expect(split).toEqual({
      head: "# My project\n",
      tail: "## Release notes\nKeep these.\n",
      block: desiredBlock,
      issues: [],
    });
  });

  it("prepends the block to a user file that has none, byte-preserving", () => {
    const diskFile = "# A user file\n\nhand-written\n";
    const result = composeBlockTarget(diskFile, desiredBlock, KEY);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.text).toBe(
      `<!-- greenline:managed begin ${KEY} -->\n${desiredBlock}\n<!-- greenline:managed end ${KEY} -->\n${diskFile}`,
    );
  });

  it("fails closed on malformed markers with the layout issues", () => {
    const diskFile = "<!-- greenline:managed begin policy -->\nno end marker";
    const result = composeBlockTarget(diskFile, desiredBlock, KEY);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error).toBeInstanceOf(ManagedBlockBroken);
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  it("treats an empty disk file as having no block", () => {
    const result = composeBlockTarget("", desiredBlock, KEY);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.text.startsWith(`<!-- greenline:managed begin ${KEY} -->`)).toBe(true);
  });
});
