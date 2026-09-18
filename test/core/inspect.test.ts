import { describe, expect, it } from "vitest";
import { languageOfPath, lineDiff, withStanza } from "../../src/core/inspect.ts";

describe("languageOfPath", () => {
  it("names the roster language a file's extension speaks, or all for anything else", () => {
    expect(languageOfPath("src/sighting.ts")).toBe("typescript");
    expect(languageOfPath("web/app.tsx")).toBe("typescript");
    expect(languageOfPath("cmd/api/main.go")).toBe("go");
    expect(languageOfPath("src/lib.rs")).toBe("rust");
    expect(languageOfPath("src/Main.java")).toBe("java");
    expect(languageOfPath("etl/load.py")).toBe("python");
    expect(languageOfPath("README.md")).toBe("all");
  });
});

describe("lineDiff", () => {
  it("pairs unchanged lines and marks removed and added ones, in order", () => {
    const diff = lineDiff("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(diff).toEqual([
      { kind: "same", line: "a" },
      { kind: "del", line: "b" },
      { kind: "add", line: "B" },
      { kind: "same", line: "c" },
      { kind: "add", line: "d" },
    ]);
  });
});

describe("withStanza", () => {
  const block =
    "<!-- greenline:managed begin policy -->\n> Owned region.\n<!-- greenline:managed end policy -->\n";

  it("replaces the House rulings stanza in the user region and leaves the managed block byte for byte", () => {
    const before = `# demo\n\n## House rulings\n\n- Old one.\n\n## Working here\n\nAsk first.\n\n${block}`;
    const after = withStanza(before, "- New one.\n- And another.");
    expect(after).toBe(
      `# demo\n\n## House rulings\n\n- New one.\n- And another.\n\n## Working here\n\nAsk first.\n\n${block}`,
    );
  });

  it("creates the stanza above the managed block when the file has none", () => {
    const before = `# demo\n\n${block}`;
    expect(withStanza(before, "- First.")).toBe(
      `# demo\n\n## House rulings\n\n- First.\n\n${block}`,
    );
  });
});
