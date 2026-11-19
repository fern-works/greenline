import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../src/shell/cli/runner.ts";
import { writeChangeLinks } from "../../../src/shell/visuals.ts";
import { fixtureInstallation } from "../../fixtures/corpus.ts";
import { RecordingWriter } from "../../helpers/writer.ts";

/*
 * A workspace whose visual home holds one visual of each place and tier
 * (J-110 S2 and S7): the map, fresh; a subsystem's journey, fresh; a
 * change's SVG drawing, drifting after a commit touched its file; a
 * change's Markdown state chart, stale since its commit is unknown; and the
 * atlas's index with two subsystems and one page, `http` drifting; the
 * map's first offer and a refresh in the index, and the documents index
 * listing the owner's README over the cache, drifting (J-147 S5).
 */

export const VERSION = "0.1.0";
export const CHANGE = "2026-10-24-cache-headers";
export const OLDER = "2026-10-20-login-limit";

/** The workspace built, which the caller removes. */
export interface VisualsWorkspace {
  readonly root: string;
  readonly env: {
    readonly cwd: string;
    readonly version: string;
    readonly installation: ReturnType<typeof fixtureInstallation>;
  };
  /** The commit the visuals were made at. */
  readonly made: string;
}

function manifest(
  fields: Readonly<{ title: string; form: string; skill: string; change: string | null }>,
  commit: string,
  files: readonly string[],
): string {
  return `${JSON.stringify(
    {
      schema: "greenline.visual/v1",
      ...fields,
      commit,
      files,
      made: "2026-10-24",
      summary: `${fields.title}, as drawn.`,
    },
    null,
    2,
  )}\n`;
}

/**
 * Build the workspace in a new temporary directory.
 * @returns the workspace
 */
export function visualsWorkspace(): VisualsWorkspace {
  const root = mkdtempSync(join(tmpdir(), "greenline-visuals-view-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=QA",
        "-c",
        "user.email=qa@invalid.local",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, ".git"));
  const writer = new RecordingWriter();
  const env = { cwd: root, version: VERSION, installation: fixtureInstallation() };
  if (runCli(["init", "--yes"], writer.writer, VERSION, env) !== 0) throw new Error(writer.err);
  rmSync(join(root, ".git"), { recursive: true });
  git("init", "--quiet");
  write("src/http/server.ts", "export const port = 7;\n");
  write("src/cache.ts", "export const ttl = 1;\n");
  git("add", "--all");
  git("commit", "--quiet", "-m", "the code");
  const made = git("rev-parse", "HEAD");
  const home = ".greenline/visuals";
  write(
    `${home}/map/architecture.visual.json`,
    manifest(
      { title: "The architecture map", form: "map", skill: "architecture-map", change: null },
      made,
      ["src/"],
    ),
  );
  write(`${home}/map/architecture.html`, "<!doctype html><title>map</title><p>The map.</p>\n");
  write(
    `${home}/subsystems/http/a-request.visual.json`,
    manifest({ title: "A request", form: "journey", skill: "explain", change: null }, made, [
      "src/http/",
    ]),
  );
  write(`${home}/subsystems/http/a-request.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(
    `${home}/${CHANGE}/request-path.visual.json`,
    manifest(
      { title: "The request path", form: "sequence", skill: "diagram-design", change: CHANGE },
      made,
      ["src/cache.ts"],
    ),
  );
  write(`${home}/${CHANGE}/request-path.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(
    `${home}/${OLDER}/login-states.visual.json`,
    manifest(
      { title: "Login states", form: "state", skill: "show-me", change: OLDER },
      "0".repeat(40),
      [],
    ),
  );
  write(`${home}/${OLDER}/login-states.md`, "# Login states\n\n`open` to `limited`.\n");
  write(
    `${home}/atlas.json`,
    `${JSON.stringify({
      schema: "greenline.atlas/v1",
      layers: ["entry", "core"],
      subsystems: [
        {
          name: "http",
          title: "The HTTP layer",
          layer: "entry",
          summary: "Hands each request to its handler.",
          files: ["src/http/"],
          commit: made,
          read: "2026-10-24",
          calls: ["cache"],
        },
        {
          name: "cache",
          title: "The cache",
          layer: "core",
          summary: "Keeps the answers.",
          files: ["src/cache.ts"],
          commit: made,
          read: "2026-10-24",
          calls: [],
        },
      ],
      refreshes: [
        {
          change: CHANGE,
          commit: made,
          whole: false,
          pages: ["http"],
          greenline: "0.2.0",
          cost: "one agent, four minutes",
        },
      ],
    })}\n`,
  );
  write(`${home}/subsystems/http.md`, "# The HTTP layer\n\n## Overview\n\nIt serves.\n");
  write("README.md", "# cache\n\nThe cache keeps the answers.\n");
  write(
    `${home}/documents.json`,
    `${JSON.stringify({
      schema: "greenline.documents/v1",
      documents: [
        { path: "README.md", author: "owner", files: ["src/cache.ts"], commit: made, change: null },
      ],
    })}\n`,
  );
  writeChangeLinks(root, CHANGE, "greenline event");
  git("add", "--all");
  git("commit", "--quiet", "-m", "the visuals");
  write("src/cache.ts", "export const ttl = 2;\n");
  git("add", "--all");
  git("commit", "--quiet", "-m", "a longer cache");
  return { root, env, made };
}
