import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../../src/shell/cli/args.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { GL } from "../../src/shell/cli/output.ts";
import { contractFailure } from "../../src/core/contract.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { ticketMd } from "../fixtures/artifacts.ts";
import { RecordingWriter } from "../helpers/writer.ts";

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "gl-final-close-"));
  mkdirSync(join(root, ".git"));
  const installation = fixtureInstallation();
  const run = (args: readonly string[]) => {
    const writer = new RecordingWriter();
    const code = runCli(args, writer.writer, "test", { cwd: root, version: "test", installation });
    return { code, out: writer.out, err: writer.err };
  };
  expect(run(["init", "--yes"]).code).toBe(0);
  return { root, run, close: () => rmSync(root, { recursive: true, force: true }) };
}

it("G3 status retains work while refusing the same unsupported completion as doctor", () => {
  const env = workspace();
  try {
    mkdirSync(join(env.root, ".greenline/work/tickets"), { recursive: true });
    writeFileSync(
      join(env.root, ".greenline/work/tickets/TKT-001.md"),
      ticketMd("001", {
        status: "complete",
        resultCommit: "abc1234",
        acceptance: [{ text: "Saved", done: true }],
      }),
    );
    const doctor = env.run(["doctor", "--json"]);
    const status = env.run(["status", "--json"]);
    expect(doctor.code).toBe(1);
    expect(status.code).toBe(1);
    const result = JSON.parse(status.out);
    expect(result.ok).toBe(false);
    expect(result.view.tickets).toEqual([{ id: "TKT-001", status: "complete", blocked: false }]);
    expect(result.diagnostics).toEqual(JSON.parse(doctor.out).diagnostics);
  } finally {
    env.close();
  }
});

it("G3 doctor reports its verdict and the connectors without a meaningless effects line", () => {
  const env = workspace();
  try {
    expect(env.run(["doctor"])).toEqual({
      code: 0,
      out:
        "greenline doctor\nconnectors\n" +
        "  garden: disabled; nothing is consulted and no process starts ('greenline connectors enable garden --url URL' enables it)\n" +
        "  ok\n",
      err: "",
    });
  } finally {
    env.close();
  }
});

it("root help presents evidence with the other commands and lists no guidance command", () => {
  const result = parseArgs(["--help"], "test");
  if (result.kind !== "help") throw new Error("Root help did not render");
  expect(result.text).toMatch(/\nCommands:\n[\s\S]*\n  evidence /);
  expect(result.text).not.toMatch(/\n  guidance /);
});

it("G3 invalid installation diagnostics locate the package file and its field separately", () => {
  const env = workspace();
  try {
    const source = join(tmpdir(), "greenline-installed-package/dist/corpus/installation.json");
    const failure = contractFailure(source, [{ path: "skills", message: "Expected an array." }]);
    if (failure._tag !== "err") throw new Error("Invalid fixture error");
    const writer = new RecordingWriter();
    expect(
      runCli(["doctor", "--json"], writer.writer, "test", {
        cwd: env.root,
        version: "test",
        installationError: failure.error,
      }),
    ).toBe(1);
    expect(JSON.parse(writer.out).diagnostics).toContainEqual({
      code: "GL0140",
      severity: "error",
      path: source,
      message:
        "skills: Expected an array. Installation-dependent checks and mutations are unavailable; repository facts remain readable.",
    });
  } finally {
    env.close();
  }
});

it("the doctor reference names every diagnostic code the CLI emits, the connector's GL0125 among them", () => {
  const reference = readFileSync(join(import.meta.dirname, "../../guide/doctor.md"), "utf8");
  const rows = new Set([...reference.matchAll(/^\| (GL\d{4}) \|/gm)].map((match) => match[1]));
  expect(rows.has(GL.connectorConfiguration)).toBe(true);
  // Every code has a table row, but GL0140, which the page states in its own paragraph.
  expect(Object.values(GL).filter((code) => !rows.has(code))).toEqual([]);
  expect(reference).toContain("**GL0140**");
});
