/**
 * The interface check's browser (J-173 S1): the drive waits for the served
 * page by its document's readiness and a settled network, never the load
 * event alone, so a page whose load never fires is still read; a server
 * that never answers times out with the address and what did not arrive
 * named; and on every path, a timeout and a thrown error included, the
 * browser's process group is stopped and no process holding its profile
 * outlives the drive. The Linear run left eleven browsers behind on a
 * load event that never came. The tests run where a browser is found.
 */
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { browserProcesses, findBrowser, liveBrowsers } from "../../src/shell/browser.ts";
import { driveRoute } from "../../src/shell/interface-render.ts";
import { judgeRenderRule } from "../../src/core/interface-render.ts";

const BROWSER = findBrowser(process.env).kind === "found";

/** A page whose frame never answers, so its load event never fires. */
const NEVER_LOADS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Issues</title></head><body><main><h1>Issues</h1><p>Backlog</p><iframe src="/hang" title="never"></iframe></main></body></html>`;

/** The Linear run's filter: a native select named by its label, its options Backlog, In Progress and Done. */
const SELECT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Filters</title></head><body><main><h1>Filters</h1><label for="state">Status</label><select id="state"><option>Backlog</option><option>In Progress</option><option>Done</option></select><label>Assignee <select><option>Anyone</option><option>Ada</option></select></label><select aria-label="Label"><option>Bug</option><option>Feature</option></select></main></body></html>`;

let server: Server;
let origin = "";
const hanging: import("node:http").ServerResponse[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/hang" || request.url === "/silent") {
      // Never answered: the frame's load, or the page's whole request, waits.
      hanging.push(response);
      return;
    }
    const page = request.url === "/select" ? SELECT : NEVER_LOADS;
    response.writeHead(200, { "content-type": "text/html" });
    response.end(page);
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", done);
  });
  const { port } = z.object({ port: z.number() }).parse(server.address());
  origin = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  for (const response of hanging.splice(0)) response.destroy();
  server.closeAllConnections();
  await new Promise<void>((done) => {
    server.close(() => {
      done();
    });
  });
});

describe("J-173 S1 the interface check's browser", () => {
  it.skipIf(!BROWSER)(
    "reads a page whose load never fires, by its document's readiness and a settled network, and stops its browser",
    async () => {
      const seen: string[] = [];
      const result = await driveRoute(`${origin}/never-loads`, false, process.env, {
        loadTimeoutMs: 20_000,
        onLaunch: (profile) => seen.push(profile),
      });
      expect(result.kind).toBe("read");
      if (result.kind !== "read") return;
      expect(result.drive.variants.length).toBeGreaterThan(5);
      expect(seen).toHaveLength(1);
      expect(liveBrowsers()).toEqual([]);
      expect(browserProcesses(seen[0] ?? "")).toEqual([]);
    },
    120_000,
  );

  it.skipIf(!BROWSER)(
    "times out on a server that never answers, naming the address and what did not arrive, and leaves no browser",
    async () => {
      const seen: string[] = [];
      const started = Date.now();
      await expect(
        driveRoute(`${origin}/silent`, false, process.env, {
          loadTimeoutMs: 3_000,
          onLaunch: (profile) => seen.push(profile),
        }),
      ).rejects.toThrow(
        new RegExp(
          `^${origin.replace(/[.]/g, "\\.")}/silent did not load in 3 s: the server sent no answer to the page's request$`,
        ),
      );
      expect(Date.now() - started).toBeLessThan(30_000);
      expect(liveBrowsers()).toEqual([]);
      expect(browserProcesses(seen[0] ?? "")).toEqual([]);
    },
    60_000,
  );

  it.skipIf(!BROWSER || process.platform !== "darwin")(
    "J-191 S1 reads a page where the home holds no keychain, as a harness's own home does, never timing out on Page.navigate",
    async () => {
      // The Codex replay ran with HOME at the run's own folder, no login keychain in it: Chrome's
      // cookie store waited on the keychain and Page.navigate never answered (j109t-linearc F1).
      const result = await driveRoute(
        `${origin}/select`,
        false,
        { ...process.env, HOME: join(tmpdir(), "greenline-no-home-here") },
        { loadTimeoutMs: 10_000 },
      );
      expect(result.kind).toBe("read");
    },
    120_000,
  );

  it.skipIf(!BROWSER)(
    "reads a native select's label from its label, its wrapping label or its aria-label, never its options",
    async () => {
      const result = await driveRoute(`${origin}/select`, false, process.env, {
        loadTimeoutMs: 20_000,
      });
      expect(result.kind).toBe("read");
      if (result.kind !== "read") return;
      const base = result.drive.variants.find((variant) => variant.kind === "base");
      const selects = (base?.snapshot.elements ?? []).filter((element) => element.tag === "select");
      expect(selects.map((element) => element.label)).toEqual(["Status", "Assignee", "Label"]);
      const judged = judgeRenderRule("label-in-name", {
        address: "/select",
        variants: result.drive.variants,
        focus: result.drive.focus,
        focusables: result.drive.focusables,
        console: result.drive.console,
        homeDark: false,
        ladder: [],
      });
      expect(judged).toEqual({ kind: "measured", hits: [] });
    },
    120_000,
  );
});
