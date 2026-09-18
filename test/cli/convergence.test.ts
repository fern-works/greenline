import { ticketMd } from "../fixtures/artifacts.ts";
import { parseArgs } from "../../src/shell/cli/args.ts";
import { parseGuidanceArgs } from "../../src/shell/cli/guidance-args.ts";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "gl-convergence-"));
  mkdirSync(join(root, ".git"));
  const installation = fixtureInstallation();
  const run = (args: readonly string[], version = "test") => {
    const writer = new RecordingWriter();
    const code = runCli(args, writer.writer, version, { cwd: root, version, installation });
    return { code, out: writer.out, err: writer.err };
  };
  return { root, run, close: () => rmSync(root, { recursive: true, force: true }) };
}

it.each(["init", "sync"])(
  "G3 refuses an unknown force target before %s writes managed files",
  (command) => {
    const env = workspace();
    try {
      if (command === "sync") expect(env.run(["init", "--yes"]).code).toBe(0);
      const lock = join(env.root, ".greenline/lock.json");
      const before = existsSync(lock) ? readFileSync(lock, "utf8") : undefined;
      const result = env.run(
        [
          command,
          ...(command === "init" ? ["--yes"] : []),
          "--json",
          "--force-managed",
          "bogus.md",
        ],
        "next",
      );
      expect(result.code).toBe(1);
      expect(JSON.parse(result.out).diagnostics).toContainEqual({
        code: "GL0113",
        severity: "error",
        path: "bogus.md",
        message: "--force-managed names a path the plan does not cover: 'bogus.md'",
      });
      expect(existsSync(lock) ? readFileSync(lock, "utf8") : undefined).toBe(before);
      if (command === "init")
        expect(existsSync(join(env.root, ".greenline/manifest.json"))).toBe(false);
    } finally {
      env.close();
    }
  },
);

it.each(["init", "sync", "doctor", "status", "inspect"])(
  "G3 help %s returns its own usage instead of an outputHelp stub",
  (command) => {
    const result = parseArgs(["help", command], "test");
    expect(result.kind).toBe("help");
    if (result.kind === "help") expect(result.text).toContain(`Usage: greenline ${command}`);
  },
);

it("G3 help for the help command returns useful root help", () => {
  const result = parseArgs(["help", "help"], "test");
  expect(result.kind).toBe("help");
  if (result.kind === "help") expect(result.text).toContain("Usage: greenline");
});

it("G3 guidance help for the help command returns useful group help", () => {
  const result = parseGuidanceArgs(["help", "help"]);
  expect(result.kind).toBe("help");
  if (result.kind === "help") expect(result.text).toContain("Usage: greenline guidance");
});

it("G3 missing guidance operation is an actionable error, not empty success", () => {
  expect(parseGuidanceArgs([])).toEqual({
    kind: "error",
    message: "choose list, read, resolve or vocabulary; run 'greenline guidance --help'",
  });
});

it("G3 init and sync effects use repository-relative file paths", () => {
  const env = workspace();
  try {
    const initial = env.run(["init", "--yes", "--json"]);
    expect(initial.code).toBe(0);
    const paths = JSON.parse(initial.out).effects.map((effect: { path: string }) => effect.path);
    expect(paths).toContain(".greenline/manifest.json");
    expect(paths).toContain(".greenline/lock.json");
    expect(paths.every((path: string) => !path.includes(env.root))).toBe(true);
    const sync = env.run(["sync", "--json"], "next");
    expect(sync.code).toBe(0);
    expect(JSON.parse(sync.out).effects).toEqual([
      { kind: "update", path: ".greenline/lock.json" },
    ]);
  } finally {
    env.close();
  }
});
it("G3 artifact and ledger findings locate the same ticket from the repository root", () => {
  const env = workspace();
  try {
    expect(env.run(["init", "--yes"]).code).toBe(0);
    mkdirSync(join(env.root, ".greenline/work/tickets"), { recursive: true });
    writeFileSync(
      join(env.root, ".greenline/work/tickets/TKT-001.md"),
      ticketMd("001", {
        status: "complete",
        resultCommit: "a1b2c3d",
        acceptance: [{ text: "Saved", done: false }],
      }),
    );
    const result = env.run(["doctor", "--json"]);
    expect(result.code).toBe(1);
    const rows = JSON.parse(result.out).diagnostics;
    for (const code of ["GL0208", "GL0209", "GL0301"]) {
      const row = rows.find((entry: { code: string }) => entry.code === code);
      expect(row?.path).toBe(".greenline/work/tickets/TKT-001.md");
    }
  } finally {
    env.close();
  }
});
it.each(["doctor", "status"])(
  "G3 %s locates malformed records without an absolute checkout path",
  (command) => {
    const env = workspace();
    try {
      expect(env.run(["init", "--yes"]).code).toBe(0);
      mkdirSync(join(env.root, ".greenline/ledger/records"), { recursive: true });
      writeFileSync(join(env.root, ".greenline/ledger/records/repair.json"), "{}");
      const result = env.run([command, "--json"]);
      expect(result.code).toBe(1);
      for (const row of JSON.parse(result.out).diagnostics)
        expect(row.path).toBe(".greenline/ledger/records/repair.json");
      expect(result.out).not.toContain(env.root);
    } finally {
      env.close();
    }
  },
);
it("G3 decision errors distinguish the document path from the invalid field", () => {
  const env = workspace();
  try {
    expect(env.run(["init", "--yes"]).code).toBe(0);
    writeFileSync(
      join(env.root, ".greenline/DECISIONS.md"),
      '```greenline-roots\n[{"root":".","purpose":null,"languages":[],"technologies":[],"exclusions":[]}]\n```\n',
    );
    const result = env.run(["doctor", "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).diagnostics).toContainEqual({
      code: "GL0123",
      severity: "error",
      path: ".greenline/DECISIONS.md",
      message: expect.stringContaining("[0].decision"),
    });
  } finally {
    env.close();
  }
});

it("G3 the published root-statement example validates in a fresh workspace", () => {
  const env = workspace();
  try {
    expect(env.run(["init", "--yes"]).code).toBe(0);
    const contract = readFileSync("corpus/runtime/work.md", "utf8");
    const example = /````markdown\n(# Decisions[\s\S]*?)\n````/.exec(contract)?.[1];
    if (example === undefined) throw new Error("Root-statement example missing");
    writeFileSync(join(env.root, ".greenline/DECISIONS.md"), example);
    const result = env.run(["doctor", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).diagnostics).toEqual([]);
  } finally {
    env.close();
  }
});

it("G3 an installed guidance update refuses an inapplicable force flag before saving", () => {
  const env = workspace();
  try {
    expect(env.run(["init", "--yes"]).code).toBe(0);
    const path = join(env.root, ".greenline/manifest.json");
    const before = readFileSync(path, "utf8");
    const result = env.run([
      "init",
      "--guidance",
      "https://guidance.example/",
      "--force-managed",
      "bogus.md",
      "--json",
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).diagnostics).toContainEqual({
      code: "GL0124",
      severity: "error",
      path: ".greenline/manifest.json",
      message: expect.stringContaining("--force-managed"),
    });
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally {
    env.close();
  }
});
