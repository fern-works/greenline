/**
 * The render engine on a real workspace (J-123 S5): `greenline check
 * interface --url --path` reads a page served locally in a local browser,
 * reports the planted failures at each width, keeps the captures as a visual
 * the inspector lists, writes the path index, writes a redesign's kept list
 * from the before and catches a removed field in the after; and on a machine
 * with no browser it names the missing browser and checks nothing it cannot.
 * The tests that drive a browser run where one is found.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "../../src/commons/result.ts";
import {
  parseInterfaceCheckFact,
  type InterfaceCheckFact,
} from "../../src/core/interface-check.ts";
import { parsePaths } from "../../src/core/interface-home.ts";
import { parseKept } from "../../src/core/interface-kept.ts";
import { parseVisualManifest } from "../../src/core/visuals.ts";
import { findBrowser } from "../../src/shell/browser.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { picturesDocument } from "../../src/shell/inspect/visuals.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const ID = "2026-10-25-pricing-table";
const BROWSER = findBrowser(process.env).kind === "found";
const PLANTED = readFileSync(
  join(import.meta.dirname, "../fixtures/interface/planted.html"),
  "utf8",
);
const FORM_WITH = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Log in</title></head><body><h1>Log in</h1><form action="/session"><label for="email">Email</label><input id="email" name="email" type="email" /><label for="password">Password</label><input id="password" name="password" type="password" /><button type="submit">Log in</button></form></body></html>`;
const FORM_WITHOUT = FORM_WITH.replace(
  '<label for="password">Password</label><input id="password" name="password" type="password" />',
  "",
);

let form = FORM_WITH;
let server: Server;
let origin = "";
const cleanup: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const page = request.url === "/planted" ? PLANTED : request.url === "/login" ? form : undefined;
    response.writeHead(page === undefined ? 404 : 200, { "content-type": "text/html" });
    response.end(page ?? "");
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", done);
  });
  const { port } = z.object({ port: z.number() }).parse(server.address());
  origin = `http://127.0.0.1:${String(port)}`;
});
afterAll(async () => {
  await new Promise<void>((done) => {
    server.close(() => {
      done();
    });
  });
});
afterEach(() => {
  form = FORM_WITH;
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Workspace {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly check: (environment: NodeJS.ProcessEnv, ...argv: string[]) => Promise<string>;
  readonly code: () => number;
}

/** A web app initialised, with a change open whose record says it touches an interface. */
function workspace(body = ""): Workspace {
  const root = mkdtempSync(join(tmpdir(), "interface-render-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    });
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  write("package.json", JSON.stringify({ dependencies: { react: "19.0.0" } }));
  write("src/components/Price.tsx", "export const Price = () => <p>Ten</p>;\n");
  const init = new RecordingWriter();
  if (
    runCli(["init", "--yes"], init.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    }) !== 0
  )
    throw new Error(init.out + init.err);
  git("add", "--all");
  git("commit", "--quiet", "--no-verify", "-m", "start");
  git("checkout", "--quiet", "-b", `greenline/${ID}`);
  write(
    `.greenline/ledger/${ID}.md`,
    [
      "---",
      "mode: careful",
      'why: "w"',
      "state: open",
      "choice: accepted",
      'interface: "yes, app"',
      "---",
      "",
      body,
    ].join("\n"),
  );
  let last = 0;
  const check = async (environment: NodeJS.ProcessEnv, ...argv: string[]): Promise<string> => {
    const recording = new RecordingWriter();
    last = await runCheckCli(["interface", ...argv], recording.writer, {
      cwd: root,
      installation: () => ok(fixtureInstallation()),
      environment,
      stdio: "ignore",
    });
    return recording.out + recording.err;
  };
  return { root, write, check, code: () => last };
}

/** The newest interface fact of the change. */
function latestFact(root: string): InterfaceCheckFact {
  const folder = join(root, ".greenline", "ledger", ID, "interface");
  const name = readdirSync(folder).sort().at(-1) ?? "";
  const parsed = parseInterfaceCheckFact(readFileSync(join(folder, name), "utf8"), name);
  if (parsed._tag === "err") throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.value;
}

describe("J-123 S5 the render engine", () => {
  it("names the missing browser, lists the render rules unmeasured and checks the floor statically", async () => {
    const here = workspace();
    const out = await here.check(
      { ...process.env, GREENLINE_CHROME: join(here.root, "no-such-browser") },
      "--url",
      origin,
      "--path",
      "/planted",
    );
    expect(out).toContain(
      `GREENLINE_CHROME names ${join(here.root, "no-such-browser")}, which does not exist`,
    );
    expect(out).toMatch(/\nunmeasured: text-contrast-aa, /);
    expect(here.code()).toBe(0);
    const fact = latestFact(here.root);
    expect(fact.browser).toContain("which does not exist");
    expect(fact.widths).toEqual([]);
    expect(fact.unmeasured.find((entry) => entry.rule === "reflow-320")?.why).toContain(
      "the floor stands as checked statically",
    );
  });

  it("J-191 S1 writes the capture's limit with its cause, the origin tried and the time, where no browser runs", async () => {
    const here = workspace();
    const out = await here.check(
      { ...process.env, GREENLINE_CHROME: join(here.root, "no-such-browser") },
      "--url",
      `${origin}/`,
      "--path",
      "/planted",
    );
    expect(here.code(), out).toBe(0);
    const fact = latestFact(here.root);
    expect(fact.limit).toEqual({
      cause: "no-browser",
      origin,
      address: "/planted",
      at: fact.at,
      detail: `GREENLINE_CHROME names ${join(here.root, "no-such-browser")}, which does not exist`,
    });
    expect(out).toContain(
      `interface capture: not made for /planted, ${fact.at}: no browser ran at ${origin}/planted`,
    );
    // J-228 S1, j217c-roster-use F13: the path index line names the commit the file goes in.
    expect(out).toContain(
      "path index: the limit on /planted in .greenline/ledger/interface/paths.json; it is the workspace's record, never ignored: commit it with the change's record or its folder, before done or after, and never beside code after done",
    );
  });

  it("J-191 S1 reads the app's origin from the record's app line where --path comes alone, and refuses without one", async () => {
    const none = workspace();
    expect(await none.check(process.env, "--path", "/planted")).toContain(
      "--path alone reads the app's origin from the record's ## Interface line `- app <origin>`, and the record names none",
    );
    expect(none.code()).toBe(2);
    const here = workspace(`## Interface\n\n- app ${origin}\n`);
    await here.check(
      { ...process.env, GREENLINE_CHROME: join(here.root, "no-such-browser") },
      "--path",
      "/planted",
    );
    expect(latestFact(here.root).limit?.origin).toBe(origin);
  });

  it("J-191 S1 refuses the viewer's own origin in one line, never capturing the viewer", async () => {
    const here = workspace();
    const port = Number(new URL(origin).port);
    here.write(
      ".greenline/tmp/inspect.json",
      `${JSON.stringify({ generatedBy: "greenline inspect", address: `http://127.0.0.1:${String(port)}/`, port, started: new Date().toISOString(), pid: process.pid })}\n`,
    );
    const out = await here.check(
      process.env,
      "--url",
      `http://localhost:${String(port)}`,
      "--path",
      "/members",
    );
    expect(here.code()).toBe(2);
    expect(out).toBe(
      `greenline check: http://localhost:${String(port)} is the viewer's own address, where greenline inspect serves, not the app's; give the origin the app serves, from its start command or the record's \`- app <origin>\` line\n`,
    );
    expect(existsSync(join(here.root, ".greenline", "ledger", ID, "interface"))).toBe(false);
  });

  it.skipIf(!BROWSER)(
    "J-191 S1 names an origin where nothing answers as the app not running there",
    async () => {
      const closed = createServer();
      await new Promise<void>((done) => {
        closed.listen(0, "127.0.0.1", done);
      });
      const { port } = z.object({ port: z.number() }).parse(closed.address());
      await new Promise<void>((done) => {
        closed.close(() => {
          done();
        });
      });
      const here = workspace();
      const out = await here.check(
        process.env,
        "--url",
        `http://127.0.0.1:${String(port)}`,
        "--path",
        "/",
      );
      const fact = latestFact(here.root);
      expect(fact.limit?.cause, out).toBe("refused");
      expect(fact.limit?.origin).toBe(`http://127.0.0.1:${String(port)}`);
      expect(out).toContain(
        `nothing answers at http://127.0.0.1:${String(port)}/: the app is not running there`,
      );
    },
    120_000,
  );

  it("refuses --url without --path, and an address that is no origin", async () => {
    const here = workspace();
    expect(await here.check(process.env, "--url", origin)).toContain(
      "--url and --path are given together",
    );
    expect(here.code()).toBe(2);
    expect(await here.check(process.env, "--url", "localhost:3000", "--path", "/")).toContain(
      "is the running page's origin",
    );
  });

  it.skipIf(!BROWSER)(
    "reports the planted failures at each width, keeps the capture and writes the path index",
    async () => {
      const here = workspace();
      const out = await here.check(process.env, "--url", origin, "--path", "/planted");
      expect(here.code(), out).toBe(1);
      const fact = latestFact(here.root);
      expect(fact.widths).toEqual([1440, 768, 390, 320]);
      const at = (rule: string): readonly (number | undefined)[] =>
        fact.findings.filter((finding) => finding.rule === rule).map((finding) => finding.width);
      expect(at("text-contrast-aa")).toContain(1440);
      expect(at("text-under-11")).toContain(768);
      expect(at("headline-two-lines")).toContain(390);
      expect(at("reflow-320")).toContain(320);
      expect(at("image-loads")).toHaveLength(1);
      expect(at("console-clean").length).toBeGreaterThan(0);
      const manifest = parseVisualManifest(
        readFileSync(
          join(here.root, `.greenline/visuals/${ID}/capture-planted.visual.json`),
          "utf8",
        ),
        "manifest",
      );
      expect(manifest._tag === "ok" && manifest.value.capture).toMatchObject({
        address: "/planted",
        widths: [1440, 768, 390],
      });
      expect(manifest._tag === "ok" && manifest.value.form).toBe("capture");
      const page = readFileSync(
        join(here.root, `.greenline/visuals/${ID}/capture-planted.html`),
        "utf8",
      );
      expect(page.match(/<img src="data:image\/jpeg;base64,/g)?.length).toBe(7);
      const listed = picturesDocument(here.root).pictures.items.map((item) => item.id);
      expect(listed).toContain(`${ID}/capture-planted`);
      const index = parsePaths(
        readFileSync(join(here.root, ".greenline/ledger/interface/paths.json"), "utf8"),
      );
      const entry =
        index._tag === "ok"
          ? index.value.paths.find((path) => path.address === "/planted")
          : undefined;
      expect(entry?.capture?.visual).toBe(`${ID}/capture-planted`);
      expect(entry?.scores?.floor).toBeGreaterThan(0);
    },
    120_000,
  );

  it.skipIf(!BROWSER)(
    "writes a redesign's kept list from the before and catches a removed field in the after",
    async () => {
      const here = workspace(
        "## start\n\nredesign of the login page; the constraint stands below.\n",
      );
      const before = await here.check(process.env, "--url", origin, "--path", "/login");
      expect(before).toContain(
        `kept list: the before of /login written to .greenline/ledger/${ID}/kept.json`,
      );
      const kept = parseKept(
        readFileSync(join(here.root, `.greenline/ledger/${ID}/kept.json`), "utf8"),
        "kept.json",
      );
      const route = kept._tag === "ok" ? kept.value.addresses[0] : undefined;
      expect(route?.fields).toEqual(["email email", "password password"]);
      expect(readdirSync(join(here.root, `.greenline/visuals/${ID}`))).toContain(
        "capture-login-before.visual.json",
      );
      form = FORM_WITHOUT;
      const after = await here.check(process.env, "--url", origin, "--path", "/login");
      expect(here.code(), after).toBe(1);
      expect(after).toContain("kept-list: ");
      expect(after).toContain('the kept fields entry "password password" is gone');
      expect(after).toContain("kept check: ");
    },
    120_000,
  );
});
