/**
 * `greenline status` reads the visual home (J-110 S3 and S7), on real
 * repositories: a visual whose covered files changed since its commit is a
 * notice with its tier, an untouched one says nothing, an atlas page drifts
 * the same way, and a manifest that does not read is a notice; none fails.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/shell/cli/runner.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { RecordingWriter } from "../helpers/writer.ts";

const VERSION = "0.1.0";
const ID = "2026-10-25-cache-headers";
const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

interface Repository {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly commit: (message: string) => string;
}

function repository(): Repository {
  const root = mkdtempSync(join(tmpdir(), "status-visuals-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const commit = (message: string): string => {
    git("add", "--all");
    git("commit", "--quiet", "--no-verify", "-m", message);
    return git("rev-parse", "HEAD");
  };
  write("src/cache.ts", "a\n");
  write("src/other.ts", "a\n");
  const rec = new RecordingWriter();
  if (
    runCli(["init", "--yes"], rec.writer, VERSION, {
      cwd: root,
      version: VERSION,
      installation: fixtureInstallation(),
    }) !== 0
  )
    throw new Error(`init failed: ${rec.err}`);
  return { root, write, commit };
}

function manifest(commit: string, files: readonly string[]): string {
  return JSON.stringify({
    schema: "greenline.visual/v1",
    title: "The request path",
    form: "sequence",
    skill: "diagram-design",
    change: ID,
    commit,
    files,
    made: "2026-10-25",
    summary: "How a request reaches the cache.",
  });
}

interface Status {
  readonly code: number;
  readonly out: string;
  readonly diagnostics: readonly { code: string; severity: string; message: string }[];
}

function status(root: string): Status {
  const json = new RecordingWriter();
  const code = runCli(["status", "--json"], json.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  const text = new RecordingWriter();
  runCli(["status"], text.writer, VERSION, {
    cwd: root,
    version: VERSION,
    installation: fixtureInstallation(),
  });
  // SAFETY: the envelope's JSON is the CLI's own output, read for its diagnostics.
  const envelope = JSON.parse(json.out) as { diagnostics: Status["diagnostics"] };
  return { code, out: text.out, diagnostics: envelope.diagnostics };
}

const ours = (found: Status): Status["diagnostics"] =>
  found.diagnostics.filter((entry) => entry.code.startsWith("GL06"));

describe("J-110 S3 status reports a visual whose files changed since its commit", () => {
  it("says nothing of an untouched visual, and a drifting notice with its tier once a commit touches its files", () => {
    const repo = repository();
    const at = repo.commit("start");
    repo.write(`.greenline/visuals/${ID}/request.visual.json`, manifest(at, ["src/cache.ts"]));
    repo.write(`.greenline/visuals/${ID}/request.svg`, "<svg/>");
    repo.write("src/other.ts", "b\n");
    repo.commit("other");
    expect(ours(status(repo.root))).toEqual([]);
    repo.write("src/cache.ts", "b\n");
    repo.commit("cache");
    const found = status(repo.root);
    expect(found.code).toBe(0);
    expect(ours(found)).toEqual([expect.objectContaining({ code: "GL0601", severity: "warning" })]);
    // J-143 S3: the line names the tier and what the drift reaches, the visual and the record that links it.
    expect(ours(found)[0]?.message).toContain(
      `name the visual '${ID}/request', "The request path", to the owner: it is at the tier drifting, reaching the visual and change ${ID}'s record, which links it, as 1 commit since ${at.slice(0, 7)} touched the files it covers; the owner may delete it in greenline inspect, and the reply offers no remake, which is the owner's ask alone`,
    );
    expect(found.out).toContain("drift: 1 visual changed since its commit");
    // A capture's notice names the capture, and a visual no change made names no record.
    repo.write(
      `.greenline/visuals/${ID}/request.visual.json`,
      manifest(at, ["src/cache.ts"]).replace('"form":"sequence"', '"form":"capture"'),
    );
    expect(ours(status(repo.root))[0]?.message).toContain(
      "is at the tier drifting, reaching the capture and change",
    );
    repo.write(
      `.greenline/visuals/${ID}/request.visual.json`,
      manifest(at, ["src/cache.ts"]).replace(`"change":"${ID}"`, '"change":null'),
    );
    expect(ours(status(repo.root))[0]?.message).toContain(
      "is at the tier drifting, reaching the visual, as 1 commit",
    );
  });

  it("reads a visual stale whose commit the history does not hold, and a manifest that does not read as its own notice", () => {
    const repo = repository();
    repo.commit("start");
    repo.write(`.greenline/visuals/${ID}/request.visual.json`, manifest("0".repeat(40), []));
    repo.write(`.greenline/visuals/${ID}/broken.visual.json`, "{");
    const found = ours(status(repo.root));
    expect(found.map((entry) => entry.code).sort()).toEqual(["GL0601", "GL0602"]);
    expect(found.find((entry) => entry.code === "GL0601")?.message).toContain(
      "is at the tier stale",
    );
  });

  it("J-110 S7 reports an atlas page whose covered files changed since the commit it was read at", () => {
    const repo = repository();
    const at = repo.commit("start");
    repo.write(
      ".greenline/visuals/atlas.json",
      JSON.stringify({
        schema: "greenline.atlas/v1",
        layers: ["entry", "core"],
        subsystems: [
          {
            name: "cache",
            title: "The cache",
            layer: "core",
            summary: "Keeps responses.",
            files: ["src/cache.ts"],
            commit: at,
            read: "2026-10-25",
            calls: [],
          },
          {
            name: "other",
            title: "The other",
            layer: "entry",
            summary: "Something else.",
            files: ["src/other.ts"],
            commit: at,
            read: "2026-10-25",
            calls: ["cache"],
          },
        ],
        refreshes: [],
      }),
    );
    repo.write("src/cache.ts", "b\n");
    repo.commit("cache");
    const found = status(repo.root);
    expect(ours(found).map((entry) => entry.code)).toEqual(["GL0603"]);
    expect(ours(found)[0]?.message).toContain("the atlas page 'cache'");
    expect(found.out).toContain("drift: 1 atlas page changed since its commit");
  });
});

describe("J-147 S1 status's atlas and docs facts, and GL0607 and GL0608", () => {
  it("says atlas: none in a workspace with no atlas, and the pages with the map's commits behind once one stands", () => {
    const repo = repository();
    const at = repo.commit("start");
    // No page is offered: the map is made on the owner's ask (J-176 S1).
    expect(status(repo.root).out).toContain("atlas: none\n");
    repo.write(
      ".greenline/visuals/atlas.json",
      JSON.stringify({
        schema: "greenline.atlas/v1",
        layers: ["core"],
        subsystems: [
          {
            name: "cache",
            title: "The cache",
            layer: "core",
            summary: "Keeps responses.",
            files: ["src/cache.ts"],
            commit: at,
            read: "2026-10-25",
            calls: [],
          },
        ],
        refreshes: [],
      }),
    );
    repo.write(
      ".greenline/visuals/map/map.visual.json",
      manifest(at, ["src/"]).replace(`"change":"${ID}"`, '"change":null'),
    );
    repo.write("src/cache.ts", "b\n");
    repo.commit("cache");
    const found = status(repo.root);
    expect(found.out).toContain("atlas: 1 page, 1 drifting; map 1 commit behind");
    expect(found.out.indexOf("drift:")).toBeLessThan(found.out.indexOf("atlas:"));
  });

  it("names a drifted document as GL0607, the owner's named and never rewritten unasked, and says the docs line", () => {
    const repo = repository();
    repo.write("README.md", "# cache\n");
    const at = repo.commit("start");
    repo.write(
      ".greenline/visuals/documents.json",
      JSON.stringify({
        schema: "greenline.documents/v1",
        documents: [
          { path: "README.md", author: "owner", files: ["src/cache.ts"], commit: at, change: null },
        ],
      }),
    );
    repo.write("src/cache.ts", "b\n");
    repo.commit("cache");
    const found = status(repo.root);
    expect(ours(found)).toEqual([expect.objectContaining({ code: "GL0607", severity: "warning" })]);
    expect(ours(found)[0]?.message).toBe(
      `name the document README.md to the owner, who wrote it and whose ask alone has it refreshed: it is drifting, as 1 commit since ${at.slice(0, 7)} touched the files it covers`,
    );
    expect(found.out).toContain("docs: 1 page drifting: README.md\n");
  });

  it("names a durable visual that loads an address outside the repository as GL0608", () => {
    const repo = repository();
    const at = repo.commit("start");
    repo.write(
      `.greenline/visuals/${ID}/request.visual.json`,
      JSON.stringify({
        ...JSON.parse(manifest(at, [])),
        reaches: ["https://cdn.example.com/d3.js"],
      }),
    );
    const found = ours(status(repo.root));
    expect(found).toEqual([expect.objectContaining({ code: "GL0608", severity: "warning" })]);
    expect(found[0]?.message).toContain(
      `name the visual '${ID}/request', "The request path", to the owner: its file loads https://cdn.example.com/d3.js from outside the repository`,
    );
  });
});

describe("J-198 S1 the picture notices name the fact and offer no remake (j196t-conduct-empty finding 1)", () => {
  /** The words that invite the owner to a remake, which the run's replies passed on. */
  const INVITES = /may ask for|ask for (?:its|the|a|either) remake|can ask for/;
  const NO_OFFER = "the reply offers no remake, which is the owner's ask alone";

  it("names the run's two kept pictures, drifted, the call path a fresh agent's and the parts the session's, with the tier, what each reaches and who drew it, and no invitation", () => {
    const repo = repository();
    const at = repo.commit("start");
    const kept = (slug: string, title: string, madeBy: "agent" | "session"): void => {
      repo.write(
        `.greenline/visuals/${ID}/${slug}.visual.json`,
        JSON.stringify({ ...JSON.parse(manifest(at, ["src/cache.ts"])), title, madeBy }),
      );
      repo.write(`.greenline/visuals/${ID}/${slug}.svg`, "<svg/>");
    };
    kept("greeting-call-path", "Greeting call path", "agent");
    kept("greeting-parts", "Greeting parts", "session");
    repo.write(
      `.greenline/visuals/${ID}/greeting-web.visual.json`,
      JSON.stringify({
        ...JSON.parse(manifest(at, [])),
        title: "Greeting web",
        madeBy: "agent",
        reaches: ["https://cdn.example.com/d3.js"],
      }),
    );
    repo.write("src/cache.ts", "b\n");
    repo.commit("rename");
    const found = ours(status(repo.root));
    expect(found.map((entry) => entry.code).sort()).toEqual([
      "GL0601",
      "GL0601",
      "GL0604",
      "GL0608",
    ]);
    for (const entry of found) {
      expect(entry.message).not.toMatch(INVITES);
      expect(entry.message).toContain(NO_OFFER);
    }
    const message = (code: string, id: string): string | undefined =>
      found.find((entry) => entry.code === code && entry.message.includes(`'${ID}/${id}'`))
        ?.message;
    expect(message("GL0601", "greeting-call-path")).toBe(
      `name the visual '${ID}/greeting-call-path', "Greeting call path", drawn by a fresh agent, to the owner: it is at the tier drifting, reaching the visual and change ${ID}'s record, which links it, as 1 commit since ${at.slice(0, 7)} touched the files it covers; the owner may delete it in greenline inspect, and ${NO_OFFER}`,
    );
    expect(message("GL0601", "greeting-parts")).toContain(
      `"Greeting parts", drawn by the session itself, to the owner: it is at the tier drifting`,
    );
    expect(message("GL0604", "greeting-parts")).toBe(
      `name the visual '${ID}/greeting-parts', "Greeting parts", to the owner: the session drew it itself, not a fresh agent, and a durable visual is a fresh agent's; ${NO_OFFER}`,
    );
    expect(message("GL0608", "greeting-web")).toBe(
      `name the visual '${ID}/greeting-web', "Greeting web", drawn by a fresh agent, to the owner: its file loads https://cdn.example.com/d3.js from outside the repository, which the viewer's policy refuses and an offline reader cannot reach; ${NO_OFFER}`,
    );
  });

  it("names no maker where the manifest records none", () => {
    const repo = repository();
    const at = repo.commit("start");
    repo.write(`.greenline/visuals/${ID}/request.visual.json`, manifest(at, ["src/cache.ts"]));
    repo.write("src/cache.ts", "b\n");
    repo.commit("cache");
    expect(ours(status(repo.root))[0]?.message).toContain(
      `name the visual '${ID}/request', "The request path", to the owner: it is at the tier drifting`,
    );
  });
});
