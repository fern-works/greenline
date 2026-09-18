import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  openSync,
  closeSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";
import { createTtyPrompt } from "../../src/shell/cli/prompt.ts";

describe("G3 init guidance question", () => {
  it("G3 refuses a redirected configuration write before creating a lock outside the repository", () => {
    const root = mkdtempSync(join(tmpdir(), "guidance-confined-"));
    const outside = mkdtempSync(join(tmpdir(), "guidance-outside-"));
    mkdirSync(join(root, ".git"));
    const env = { cwd: root, version: "0.1.0", installation: fixtureInstallation() };
    try {
      expect(runCli(["init", "--yes"], new RecordingWriter().writer, "0.1.0", env)).toBe(0);
      rmSync(join(root, ".greenline/tmp"), { recursive: true });
      symlinkSync(outside, join(root, ".greenline/tmp"));
      const before = readFileSync(join(root, ".greenline/manifest.json"), "utf8");
      expect(
        runCli(
          ["init", "--guidance", "https://example.com"],
          new RecordingWriter().writer,
          "0.1.0",
          env,
        ),
      ).toBe(1);
      expect(readFileSync(join(root, ".greenline/manifest.json"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
  it("refuses obsolete manifests without silently converting or rewriting them", () => {
    const root = mkdtempSync(join(tmpdir(), "guidance-obsolete-"));
    mkdirSync(join(root, ".git"));
    const env = { cwd: root, version: "0.1.0", installation: fixtureInstallation() };
    try {
      expect(runCli(["init", "--yes"], new RecordingWriter().writer, "0.1.0", env)).toBe(0);
      const path = join(root, ".greenline/manifest.json");
      const prior = JSON.parse(readFileSync(path, "utf8"));
      prior.schemaVersion = 3;
      const bytes = JSON.stringify(prior);
      writeFileSync(path, bytes);
      for (const args of [
        ["sync", "--json"],
        ["init", "--guidance", "none", "--json"],
      ]) {
        const writer = new RecordingWriter();
        expect(runCli(args, writer.writer, "0.1.0", env)).toBe(1);
        expect(writer.out).toContain("schemaVersion");
        expect(readFileSync(path, "utf8")).toBe(bytes);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("G3 changes existing guidance only under the write lock and preserves managed files", () => {
    const root = mkdtempSync(join(tmpdir(), "guidance-reconfigure-"));
    mkdirSync(join(root, ".git"));
    const env = { cwd: root, version: "0.1.0", installation: fixtureInstallation() };
    const run = (...args: string[]) => runCli(args, new RecordingWriter().writer, "0.1.0", env);
    try {
      expect(run("init", "--yes", "--targets", "codex", "--guidance", "https://example.com")).toBe(
        0,
      );
      const path = join(root, ".greenline/manifest.json");
      const before = JSON.parse(readFileSync(path, "utf8"));
      const block = readFileSync(join(root, "AGENTS.md"), "utf8");
      expect(run("init", "--guidance", "none", "--dry-run")).toBe(0);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(before);
      writeFileSync(join(root, ".greenline/tmp/.write.lock"), "occupied");
      expect(run("init", "--guidance", "none")).toBe(1);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(before);
      rmSync(join(root, ".greenline/tmp/.write.lock"));
      expect(run("init", "--guidance", "none")).toBe(0);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
        ...before,
        guidance: { state: "unconfigured" },
      });
      expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(block);
      expect(run("init")).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("G3 carries the terminal's provider choice and pasted URL through the actual prompt reader", () => {
    const root = mkdtempSync(join(tmpdir(), "guidance-terminal-"));
    mkdirSync(join(root, ".git"));
    const input = join(root, "input");
    const output = join(root, "output");
    writeFileSync(input, "1\nhttps://guidance.example/api\n");
    const readFd = openSync(input, "r");
    const writeFd = openSync(output, "w");
    try {
      const prompt = createTtyPrompt({ fd: readFd, isTTY: true }, { fd: writeFd, isTTY: true });
      if (prompt === undefined) throw new Error("terminal adapter missing");
      const writer = new RecordingWriter();
      expect(
        runCli(["init", "--targets", "codex"], writer.writer, "0.1.0", {
          cwd: root,
          version: "0.1.0",
          installation: fixtureInstallation(),
          prompt,
        }),
      ).toBe(0);
      expect(readFileSync(output, "utf8")).toContain(
        "Use a guidance provider for this repository?",
      );
      expect(readFileSync(output, "utf8")).toContain("Guidance provider URL");
      expect(
        JSON.parse(readFileSync(join(root, ".greenline/manifest.json"), "utf8")).guidance,
      ).toEqual({ state: "configured", provider: "https://guidance.example/api/" });
    } finally {
      closeSync(readFd);
      closeSync(writeFd);
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("G3 refuses unanswered guidance configuration in a headless init", () => {
    const root = mkdtempSync(join(tmpdir(), "guidance-headless-"));
    mkdirSync(join(root, ".git"));
    try {
      const writer = new RecordingWriter();
      expect(
        runCli(["init", "--targets", "codex", "--json"], writer.writer, "0.1.0", {
          cwd: root,
          version: "0.1.0",
          installation: fixtureInstallation(),
        }),
      ).toBe(1);
      expect(writer.out).toContain("GL0124");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("G3 records the guidance answer in the installed manifest without contacting the provider", () => {
    const root = mkdtempSync(join(tmpdir(), "guidance-init-"));
    mkdirSync(join(root, ".git"));
    const questions: string[] = [];
    const writer = new RecordingWriter();
    try {
      const code = runCli(["init", "--targets", "codex"], writer.writer, "0.1.0", {
        cwd: root,
        version: "0.1.0",
        installation: fixtureInstallation(),
        prompt: {
          choose: (question) => {
            questions.push(question);
            return "configured";
          },
          input: () => "https://guidance.example/api",
        },
      });
      expect(code).toBe(0);
      expect(questions).toEqual(["Use a guidance provider for this repository?"]);
      const manifest = JSON.parse(readFileSync(join(root, ".greenline/manifest.json"), "utf8"));
      expect(manifest.guidance).toEqual({
        state: "configured",
        provider: "https://guidance.example/api/",
      });
      expect(manifest.schemaVersion).toBe(5);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
