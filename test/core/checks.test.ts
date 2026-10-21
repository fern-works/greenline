import { describe, expect, it } from "vitest";
import {
  checkName,
  declaredForRun,
  declaredWith,
  isRunOf,
  matchedCheck,
  proposedChecks,
  type DeclaredCheck,
} from "../../src/core/checks.ts";
import type { JsonValue } from "../../src/core/contract.ts";
import { parseManifest } from "../../src/core/manifest.ts";

const TEST: DeclaredCheck = { name: "test", command: "pnpm run test", dir: "." };
const WEB: DeclaredCheck = { name: "web", command: "npm test", dir: "apps/web" };

describe("J-98 S1 a declared check's directory is where check runs it and how the close reads it", () => {
  const API: DeclaredCheck = { name: "api", command: "npm test", dir: "apps/api" };

  it("takes the declared check a run's text matches: the one declared where check started, else the one directory that declares it", () => {
    expect(declaredForRun([TEST, WEB], "npm test", ".")).toEqual({ kind: "declared", check: WEB });
    expect(declaredForRun([TEST, WEB], "npm test -- --watch=false", "src")).toEqual({
      kind: "declared",
      check: WEB,
    });
    expect(declaredForRun([TEST, WEB, API], "npm test", "apps/api")).toEqual({
      kind: "declared",
      check: API,
    });
    expect(declaredForRun([TEST, WEB], "pnpm run test", "apps/web")).toEqual({
      kind: "declared",
      check: TEST,
    });
    expect(declaredForRun([TEST, WEB], "make lint", "apps/web")).toEqual({ kind: "none" });
  });

  it("takes the declared command the text equals, else the longest that matches, so a narrower check is never taken for a broader one", () => {
    const unit: DeclaredCheck = { name: "unit", command: "pnpm test", dir: "." };
    const web: DeclaredCheck = { name: "web", command: "pnpm test --filter web", dir: "." };
    expect(declaredForRun([unit, web], "pnpm test --filter web", ".")).toEqual({
      kind: "declared",
      check: web,
    });
    expect(declaredForRun([unit, web], "pnpm test --filter web --watch=false", "src")).toEqual({
      kind: "declared",
      check: web,
    });
    expect(declaredForRun([unit, web], "pnpm test", ".")).toEqual({
      kind: "declared",
      check: unit,
    });
    expect(declaredForRun([unit, web], "pnpm test --filter api", ".")).toEqual({
      kind: "declared",
      check: unit,
    });
  });

  it("names every match when several directories declare the text and check started in none of them", () => {
    expect(declaredForRun([TEST, WEB, API], "npm test", ".")).toEqual({
      kind: "ambiguous",
      checks: [WEB, API],
    });
  });

  it("reads a recorded run as a declared check's by its text, its directory and the name it records", () => {
    const run = (dir?: string, check?: string) => ({ arguments: ["npm", "test"], dir, check });
    expect(isRunOf(WEB, run("apps/web", "web"))).toBe(true);
    expect(isRunOf(WEB, run("apps/web"))).toBe(true);
    expect(isRunOf(WEB, run())).toBe(false);
    expect(isRunOf(WEB, run("apps/web", "api"))).toBe(false);
    expect(isRunOf(API, run("apps/web", "web"))).toBe(false);
    // A run recorded before a run carried its directory ran at the root.
    expect(isRunOf(TEST, { arguments: ["pnpm", "run", "test"] })).toBe(true);
  });
});

describe("J-93 S3 the declared checks: matching by text, never by parsing", () => {
  it("matches a text equal to a declared command, or one that begins with it and a space, in the same directory", () => {
    expect(matchedCheck([TEST, WEB], "pnpm run test", ".")).toBe(TEST);
    expect(matchedCheck([TEST, WEB], "pnpm run test -- --coverage", ".")).toBe(TEST);
    expect(matchedCheck([TEST, WEB], "npm test", "apps/web")).toBe(WEB);
  });

  it("matches nothing for a longer word, another directory, or a command that only contains it", () => {
    expect(matchedCheck([TEST], "pnpm run tests", ".")).toBeUndefined();
    expect(matchedCheck([TEST], "pnpm run test", "apps/web")).toBeUndefined();
    expect(matchedCheck([TEST], "cd x && pnpm run test", ".")).toBeUndefined();
    expect(matchedCheck([], "pnpm run test", ".")).toBeUndefined();
  });

  it("declares a command once, naming it from the command or the name asked for, a taken name gaining a number", () => {
    const first = declaredWith([], "cargo test", ".");
    expect(first).toMatchObject({
      added: true,
      check: { name: "cargo-test", command: "cargo test", dir: "." },
    });
    const again = declaredWith(first.checks, "cargo test", ".");
    expect(again.added).toBe(false);
    expect(again.checks).toBe(first.checks);
    const named = declaredWith(first.checks, "cargo test --doc", ".", "cargo-test");
    expect(named.check.name).toBe("cargo-test-2");
    expect(checkName("./scripts/check.sh")).toBe("scripts-check-sh");
    expect(checkName("2fa")).toBe("check-2fa");
    expect(checkName("---")).toBe("check");
  });

  it("the manifest reads the declared checks and refuses a malformed one or a name declared twice", () => {
    const manifest = (checks: JsonValue): ReturnType<typeof parseManifest> =>
      parseManifest(
        JSON.stringify({ schemaVersion: 6, targets: ["codex"], checks }),
        ".greenline/manifest.json",
      );
    const read = manifest([{ ...TEST }]);
    expect(read._tag === "ok" ? read.value.checks : undefined).toEqual([TEST]);
    expect(read._tag === "ok" ? read.value.hooks : undefined).toEqual({
      git: true,
      adapters: true,
    });
    expect(manifest([{ ...TEST, command: " pnpm test" }])._tag).toBe("err");
    expect(manifest([{ ...TEST, dir: "../outside" }])._tag).toBe("err");
    expect(manifest([{ ...TEST, extra: true }])._tag).toBe("err");
    expect(manifest([{ ...TEST }, { ...WEB, name: "test" }])._tag).toBe("err");
  });
});

describe("J-93 S3 init proposes the checks from the project's own files", () => {
  it("proposes a package.json's test, lint, typecheck and build scripts under the package manager its lock file names, the test in its short form", () => {
    const packageJson = JSON.stringify({
      scripts: { test: "vitest", lint: "oxlint", build: "tsdown", dev: "vite", check: "all" },
    });
    expect(proposedChecks({ packageJson, lockFiles: ["pnpm-lock.yaml"] })).toEqual([
      { name: "test", command: "pnpm test", dir: "." },
      { name: "lint", command: "pnpm run lint", dir: "." },
      { name: "build", command: "pnpm run build", dir: "." },
    ]);
    expect(proposedChecks({ packageJson, lockFiles: [] })[0]?.command).toBe("npm test");
    expect(proposedChecks({ packageJson, lockFiles: ["yarn.lock"] })[0]?.command).toBe("yarn test");
    expect(proposedChecks({ packageJson, lockFiles: ["bun.lock"] })[0]?.command).toBe(
      "bun run test",
    );
    expect(proposedChecks({ packageJson: "{ not json", lockFiles: [] })).toEqual([]);
  });

  it("proposes a Makefile's targets, cargo, pytest and ruff where named, and go's test and vet", () => {
    expect(
      proposedChecks({
        makefile: "VAR := 1\ntest: build\n\tgo test\nlint:\n\tlint\nrelease:\n",
        cargoToml: '[package]\nname = "x"\n',
        pyprojectToml: "[tool.pytest.ini_options]\n[tool.ruff]\n",
        goMod: "module x\n",
        lockFiles: [],
      }).map((check) => [check.name, check.command]),
    ).toEqual([
      ["make-test", "make test"],
      ["make-lint", "make lint"],
      ["cargo-test", "cargo test"],
      ["pytest", "python -m pytest"],
      ["ruff", "ruff check ."],
      ["go-test", "go test ./..."],
      ["go-vet", "go vet ./..."],
    ]);
  });

  it("proposes nothing for a project with none of those files, so the agent declares by reasoning", () => {
    expect(proposedChecks({ lockFiles: [] })).toEqual([]);
    expect(proposedChecks({ pyprojectToml: "[project]\nname = 'x'\n", lockFiles: [] })).toEqual([]);
  });
});
