/**
 * The inspector's cache (J-154 S2; workshop/components/inspector.md, "The
 * cache"): a document built once for the state it reads, a write to one
 * change's folder building that change's documents and the lists again and
 * no other change's, a write to the installation's files and the server's
 * own writes seen at the next read, the reads that arrive during a build
 * sharing it, and a refusal never kept.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BuilderPool, type Built } from "../../../src/shell/inspect/builder.ts";
import { fixtureInstallation } from "../../fixtures/corpus.ts";
import { DocumentReader, type WatchSource } from "../../../src/shell/inspect/readers.ts";

const roots: string[] = [];
const readers: DocumentReader[] = [];
afterEach(() => {
  for (const reader of readers.splice(0)) reader.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A workspace with two changes and a visual, and a reader whose builds are counted by address. */
function planted() {
  const root = mkdtempSync(join(tmpdir(), "greenline-readers-"));
  roots.push(root);
  write(root, ".greenline/ledger/2026-10-01-a.md", "---\nmode: quick\n---\n");
  write(root, ".greenline/ledger/2026-10-01-a/review-1.md", "# Review\n");
  write(root, ".greenline/ledger/2026-10-02-b.md", "---\nmode: quick\n---\n");
  write(root, ".greenline/visuals/map/one.visual.json", "{}\n");
  write(root, "AGENTS.md", "# Agents\n");
  const built = new Map<string, number>();
  let status = 200;
  // The watcher as a seam: the test reports the writes the platform would.
  let report: (path: string) => void = () => undefined;
  let started = 0;
  const watch: WatchSource = (_root, changed) => {
    started += 1;
    report = changed;
    return () => undefined;
  };
  const reader = new DocumentReader(root, {
    build: async (address: string): Promise<Built> => {
      const count = (built.get(address) ?? 0) + 1;
      built.set(address, count);
      return { status, body: JSON.stringify({ address, count }), ms: 1, thread: 0 };
    },
    watch,
    timing: undefined,
    edition: "0.0.0 test",
  });
  readers.push(reader);
  const read = (address: string) => reader.read(address, new URLSearchParams());
  return {
    root,
    reader,
    built,
    read,
    refuse: (next: number) => {
      status = next;
    },
    report: (path: string) => report(path),
    watchersStarted: () => started,
  };
}

describe("J-154 S2 the inspector's cache", () => {
  it("builds a document once for the state it reads, and answers it again from the cache with the same tag", async () => {
    const { read, built } = planted();
    const first = await read("/api/changes");
    const second = await read("/api/changes");
    expect(first.source).toBe("built");
    expect(second.source).toBe("cache");
    expect(second.body).toBe(first.body);
    expect(second.tag).toBe(first.tag);
    expect(built.get("/api/changes")).toBe(1);
  });

  it("builds a change's documents again after a write to its folder, and no other change's", async () => {
    const { root, read, built } = planted();
    for (const address of [
      "/api/changes/2026-10-01-a",
      "/api/changes/2026-10-02-b",
      "/api/changes/2026-10-02-b/loads",
      "/api/changes",
    ])
      await read(address);
    write(root, ".greenline/ledger/2026-10-01-a/review-2.md", "# Review 2\n");
    const a = await read("/api/changes/2026-10-01-a");
    const b = await read("/api/changes/2026-10-02-b");
    const loads = await read("/api/changes/2026-10-02-b/loads");
    const list = await read("/api/changes");
    expect([a.source, b.source, loads.source, list.source]).toEqual([
      "built",
      "cache",
      "cache",
      "built",
    ]);
    expect(built.get("/api/changes/2026-10-02-b")).toBe(1);
  });

  it("builds every change's documents again after a write to a record or a home beside the ledger", async () => {
    const { root, read } = planted();
    await read("/api/changes/2026-10-02-b");
    write(root, ".greenline/ledger/2026-10-01-a.md", "---\nmode: regular\n---\n");
    expect((await read("/api/changes/2026-10-02-b")).source).toBe("built");
    write(root, ".greenline/visuals/map/one.visual.json", '{ "title": "moved" }\n');
    expect((await read("/api/changes/2026-10-02-b")).source).toBe("built");
  });

  it("sees a write to the installation's files, and a write the server marks, at the very next read", async () => {
    const { root, reader, read } = planted();
    await read("/api/settings");
    write(root, "AGENTS.md", "# Agents, edited\n");
    expect((await read("/api/settings")).source).toBe("built");
    expect((await read("/api/settings")).source).toBe("cache");
    reader.moveState();
    expect((await read("/api/settings")).source).toBe("built");
  });

  it("keeps no refusal: a document refused is built again at the next read", async () => {
    const { read, refuse, built } = planted();
    refuse(404);
    expect((await read("/api/plans/none")).status).toBe(404);
    refuse(200);
    expect((await read("/api/plans/none")).status).toBe(200);
    expect(built.get("/api/plans/none")).toBe(2);
  });

  it("shares one build among the reads that arrive while it runs", async () => {
    const { read, built } = planted();
    const [one, two, three] = await Promise.all([
      read("/api/desk"),
      read("/api/desk"),
      read("/api/desk"),
    ]);
    expect(built.get("/api/desk")).toBe(1);
    expect(new Set([one.body, two.body, three.body]).size).toBe(1);
  });

  it("keys a document with a query on its query, each answered from the cache apart", async () => {
    const { reader, built } = planted();
    const ask = (query: string) =>
      reader.read("/api/changes/2026-10-01-a/deal", new URLSearchParams(query));
    await ask("register=site");
    await ask("register=app");
    expect((await ask("register=site")).source).toBe("cache");
    expect(built.get("/api/changes/2026-10-01-a/deal")).toBe(2);
  });

  it("counts a write the watcher reports elsewhere in the working tree, and ignores git's objects, the ledger's scratch and the dependencies", async () => {
    const { reader, read, report } = planted();
    reader.startWatching();
    await read("/api/practice");
    for (const path of [
      ".git/objects/ab/cdef",
      ".git/logs/HEAD",
      ".greenline/tmp/scratch.json",
      ".greenline/ledger/2026-10-01-a.md",
      "node_modules/zod/index.js",
    ])
      report(path);
    expect((await read("/api/practice")).source).toBe("cache");
    report("src/app.ts");
    expect((await read("/api/practice")).source).toBe("built");
    expect((await read("/api/practice")).source).toBe("cache");
  });

  it("starts its watcher only when asked, as the server asks once it listens, once, and never after it closes", () => {
    const { reader, watchersStarted } = planted();
    expect(watchersStarted()).toBe(0);
    reader.startWatching();
    reader.startWatching();
    expect(watchersStarted()).toBe(1);
    const closed = planted();
    closed.reader.close();
    closed.reader.startWatching();
    expect(closed.watchersStarted()).toBe(0);
  });

  it("reads the scratch folder to two levels: a change's events build its page again, the address file every list, a file below neither", async () => {
    const { root, read } = planted();
    const pages = ["/api/changes/2026-10-01-a", "/api/changes/2026-10-02-b"];
    const sources = async () =>
      Promise.all([...pages, "/api/desk"].map(async (address) => (await read(address)).source));
    await sources();
    write(root, ".greenline/tmp/2026-10-01-a/events.jsonl", '{"event":"agent"}\n');
    expect(await sources()).toEqual(["built", "cache", "built"]);
    write(root, ".greenline/tmp/inspect.json", '{"port":7433}\n');
    expect(await sources()).toEqual(["built", "built", "built"]);
    write(root, ".greenline/tmp/2026-10-01-a/verify/profile/cache.bin", "bytes");
    expect(await sources()).toEqual(["cache", "cache", "cache"]);
  });

  it("reads a ledger folder that is not a change's, such as the receipts, as a home every change's page reads", async () => {
    const { root, read } = planted();
    await read("/api/changes/2026-10-02-b");
    write(root, ".greenline/ledger/receipts/r1.json", "{}\n");
    expect((await read("/api/changes/2026-10-02-b")).source).toBe("built");
  });

  it("tags a document with the edition serving, so an upgrade answers anew over the same workspace", async () => {
    const { root } = planted();
    const tagOf = async (edition: string) => {
      const reader = new DocumentReader(root, {
        build: async (): Promise<Built> => ({ status: 200, body: "{}", ms: 1, thread: 0 }),
        watch: undefined,
        timing: undefined,
        edition,
      });
      readers.push(reader);
      return (await reader.read("/api/changes", new URLSearchParams())).tag;
    };
    expect(await tagOf("0.2.0 a")).not.toBe(await tagOf("0.2.1 b"));
    expect(await tagOf("0.2.0 a")).toBe(await tagOf("0.2.0 a"));
  });
});

describe("J-154 S2 the builder threads", () => {
  it("builds on threads of their own, every status document on one, and refuses a build once closing", async () => {
    const root = mkdtempSync(join(tmpdir(), "greenline-builders-"));
    roots.push(root);
    const pool = new BuilderPool(
      root,
      { cwd: root, version: "0.0.0", installation: fixtureInstallation() },
      2,
    );
    try {
      const contract = await pool.build("/api/contract", "", "one");
      expect(contract.status).toBe(200);
      expect(contract.thread).not.toBe(0);
      const [diagnostics, plans, now] = await Promise.all([
        pool.build("/api/practice", "", "one"),
        pool.build("/api/plans", "", "one"),
        pool.build("/api/desk", "", "one"),
      ]);
      expect(new Set([diagnostics.thread, plans.thread, now.thread]).size).toBe(1);
      expect(diagnostics.thread).not.toBe(0);
    } finally {
      await pool.close();
    }
    await expect(pool.build("/api/contract", "", "one")).rejects.toThrow(/closing/);
  });
});
