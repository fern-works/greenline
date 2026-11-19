/**
 * The capture's boxes and capture now (J-124 S1): `greenline check
 * interface --url --path` keeps beside each capture its boxes at the three
 * widths, every element with its rectangle, role, text, a selector and the
 * source location the planted development attributes carry; the inspector's
 * capture now renders a served page and answers the new capture's id, its
 * document carrying the full-page image and the boxes; a capture a mark
 * names is never overwritten; and with no browser capture now names the
 * limit and keeps nothing. The tests that drive a browser run where one is
 * found.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "../../src/commons/result.ts";
import { parseJson } from "../../src/core/contract.ts";
import { parseCaptureBoxes, type BoxedElement } from "../../src/core/interface-boxes.ts";
import { parsePaths } from "../../src/core/interface-home.ts";
import { captureLimitSchema, captureLimitText } from "../../src/core/interface-check.ts";
import { parseInspectorDocument } from "../../src/core/inspector/contract.ts";
import { parseVisualManifest } from "../../src/core/visuals.ts";
import { findBrowser } from "../../src/shell/browser.ts";
import { runCheckCli } from "../../src/shell/cli/check.ts";
import { runCli } from "../../src/shell/cli/runner.ts";
import { captureImages } from "../../src/shell/interface-capture.ts";
import { captureNow } from "../../src/shell/interface-check.ts";
import { startInspector } from "../../src/shell/inspect/server.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const ID = "2026-10-26-plans-page";
const BROWSER = findBrowser(process.env).kind === "found";
const PAGE = readFileSync(join(import.meta.dirname, "../fixtures/interface/boxes.html"), "utf8");

let server: Server;
let origin = "";
let rootForPage = "";
const cleanup: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const found = request.url === "/plans";
    response.writeHead(found ? 200 : 404, { "content-type": "text/html" });
    response.end(found ? PAGE.replace("__ROOT__", rootForPage) : "");
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
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A web app initialised, with the planted source files, and a change open on its branch. */
function workspace(open = true): string {
  const root = mkdtempSync(join(tmpdir(), "interface-boxes-"));
  cleanup.push(root);
  rootForPage = root;
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
  write("src/components/Cta.tsx", "export const Cta = () => <button>Start a trial</button>;\n");
  write("src/components/Footer.tsx", "export const Footer = () => <small>Made here</small>;\n");
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
  if (open) {
    git("checkout", "--quiet", "-b", `greenline/${ID}`);
    write(
      `.greenline/ledger/${ID}.md`,
      [
        "---",
        "mode: regular",
        'why: "w"',
        "state: open",
        "choice: accepted",
        'interface: "yes, app"',
        "---",
        "",
      ].join("\n"),
    );
  }
  return root;
}

/** The elements of a width by their selector. */
function bySelector(elements: readonly BoxedElement[], selector: string): BoxedElement | undefined {
  return elements.find((entry) => entry.selector === selector);
}

describe("J-124 S1 the capture's boxes and source hints", () => {
  it.skipIf(!BROWSER)(
    "keeps beside the capture every element's box, role, text, selector and planted source at each width",
    async () => {
      const root = workspace();
      const recording = new RecordingWriter();
      await runCheckCli(["interface", "--url", origin, "--path", "/plans"], recording.writer, {
        cwd: root,
        installation: () => ok(fixtureInstallation()),
        environment: process.env,
        stdio: "ignore",
      });
      const out = recording.out + recording.err;
      expect(out).toContain("with the boxes of");
      const folder = join(root, ".greenline", "visuals", ID);
      const boxes = parseCaptureBoxes(
        readFileSync(join(folder, "capture-plans.boxes.json"), "utf8"),
        "boxes",
      );
      if (boxes._tag === "err") throw new Error(JSON.stringify(boxes.error.issues));
      expect(boxes.value.address).toBe("/plans");
      expect(boxes.value.widths.map((entry) => entry.width)).toEqual([1440, 768, 390]);
      for (const entry of boxes.value.widths) {
        const { elements } = entry;
        expect(entry.image.height).toBeGreaterThan(0);
        expect(elements.find((element) => element.tag === "h1")?.source).toEqual({
          file: "src/pages/Home.tsx",
          line: 12,
          column: 5,
          via: "react-inspector",
        });
        expect(elements.find((element) => element.tag === "h1")?.role).toBe("heading");
        const cta = bySelector(elements, "#start-trial");
        expect(cta).toMatchObject({ role: "button", text: "Start a trial", tag: "button" });
        expect(cta?.source).toEqual({
          file: "src/components/Cta.tsx",
          line: 8,
          column: 7,
          via: "react",
        });
        expect(cta?.box.width).toBeGreaterThan(0);
        expect(bySelector(elements, '[data-testid="pricing-link"]')?.role).toBe("link");
        expect(
          elements.find((element) => element.text === "Start free, pay as you grow.")?.source,
        ).toEqual({ file: "src/components/Lede.vue", line: 4, column: 3, via: "vue" });
        expect(bySelector(elements, "#svelte-note")?.source).toEqual({
          file: "src/lib/Note.svelte",
          line: 7,
          column: 2,
          via: "svelte",
        });
        expect(bySelector(elements, "#react-note")?.source).toEqual({
          file: "src/components/Footer.tsx",
          line: 21,
          column: 9,
          via: "react",
        });
      }
      const manifest = parseVisualManifest(
        readFileSync(join(folder, "capture-plans.visual.json"), "utf8"),
        "manifest",
      );
      expect(manifest._tag === "ok" && manifest.value.files).toEqual(
        expect.arrayContaining(["src/components/Cta.tsx", "src/components/Footer.tsx"]),
      );
      const images = captureImages(readFileSync(join(folder, "capture-plans.html"), "utf8"));
      expect(
        images.filter((image) => image.part === "full page").map((image) => image.width),
      ).toEqual([1440, 768, 390]);
    },
    180_000,
  );

  it.skipIf(!BROWSER)(
    "captures now from the viewer, serves the capture with its image and boxes, and keeps a marked capture",
    async () => {
      const root = workspace(false);
      const handle = await startInspector(
        root,
        {
          cwd: root,
          version: VERSION,
          installation: fixtureInstallation(),
          environment: process.env,
        },
        0,
      );
      try {
        const answer = await fetch(`${handle.url}api/captures`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: `${origin}/plans` }),
        });
        expect(answer.status).toBe(200);
        const body = z
          .object({ captured: z.string().nullable(), limit: z.string().nullable() })
          .parse(parseJson(await answer.text()));
        expect(body).toEqual({ captured: "interface/capture-plans", limit: null });
        const served = await fetch(`${handle.url}api/pictures/interface/capture-plans`);
        const parsed = parseInspectorDocument(z.json().parse(parseJson(await served.text())));
        if (
          parsed._tag === "err" ||
          parsed.value.kind !== "picture" ||
          parsed.value.capture === null
        )
          throw new Error("no capture's picture");
        const { capture } = parsed.value;
        expect(capture).toMatchObject({ address: "/plans", change: null, boxes: null });
        expect(capture.widths.map((entry) => entry.width)).toEqual([1440, 768, 390]);
        expect(capture.widths[0]?.image).toMatch(/^data:image\/jpeg;base64,/);
        expect(bySelector(capture.widths[0]?.elements ?? [], "#start-trial")?.text).toBe(
          "Start a trial",
        );
        expect((await fetch(`${handle.url}api/pictures/interface/none`)).status).toBe(404);
        const refused = await fetch(`${handle.url}api/captures`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "file:///etc/hosts" }),
        });
        expect(refused.status).toBe(400);
      } finally {
        await handle.close();
      }
      const again = await captureNow(
        root,
        origin,
        "/plans",
        process.env,
        new Set(["interface/capture-plans"]),
      );
      expect(again).toMatchObject({ kind: "captured", capture: "interface/capture-plans-2" });
      expect(existsSync(join(root, ".greenline/visuals/interface/capture-plans.html"))).toBe(true);
    },
    240_000,
  );

  it("names a missing browser as capture now's limit and keeps nothing", async () => {
    const root = workspace(false);
    const handle = await startInspector(
      root,
      {
        cwd: root,
        version: VERSION,
        installation: fixtureInstallation(),
        environment: { ...process.env, GREENLINE_CHROME: join(root, "no-such-browser") },
      },
      0,
    );
    try {
      const answer = await fetch(`${handle.url}api/captures`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `${origin}/plans` }),
      });
      expect(answer.status).toBe(200);
      const body = z
        .object({ captured: z.null(), limit: z.string(), detail: captureLimitSchema })
        .parse(parseJson(await answer.text()));
      expect(body.limit).toContain("which does not exist");
      // J-191 S1: the same limit, cause and words, the check writes.
      expect(body.detail).toMatchObject({ cause: "no-browser", origin, address: "/plans" });
      expect(body.limit).toBe(captureLimitText(body.detail));
      expect(existsSync(join(root, ".greenline/visuals/interface"))).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("J-191 S1 keeps capture now's limit in the path index, which the Interface view shows, and writes no check fact", async () => {
    const root = workspace(true);
    const answer = await captureNow(
      root,
      origin,
      "/plans",
      { ...process.env, GREENLINE_CHROME: join(root, "no-such-browser") },
      new Set(),
    );
    expect(answer).toMatchObject({ kind: "limit", detail: { cause: "no-browser", origin } });
    const index = parsePaths(
      readFileSync(join(root, ".greenline", "ledger", "interface", "paths.json"), "utf8"),
    );
    expect(index._tag === "ok" && index.value.paths[0]?.limit).toMatchObject({
      cause: "no-browser",
      origin,
      address: "/plans",
    });
    expect(existsSync(join(root, ".greenline", "ledger", ID, "interface"))).toBe(false);
  });

  it("J-191 S1 refuses capture now on the viewer's own address in one line", async () => {
    const root = workspace(false);
    const handle = await startInspector(
      root,
      { cwd: root, version: VERSION, installation: fixtureInstallation() },
      0,
    );
    try {
      const answer = await fetch(`${handle.url}api/captures`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `${handle.url}interface` }),
      });
      expect(answer.status).toBe(400);
      const body = z.object({ error: z.string() }).parse(parseJson(await answer.text()));
      expect(body.error).toBe(
        `${handle.url.replace(/\/$/, "")} is the viewer's own address, where greenline inspect serves, not the app's; give the origin the app serves, from its start command or the record's \`- app <origin>\` line`,
      );
    } finally {
      await handle.close();
    }
  });
});
