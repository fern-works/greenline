/**
 * The visual home on disk (J-110 S1 and S3), on a fixture repository with
 * real git: every manifest the layout holds with the visual beside it, git's
 * answers about the files a visual covers since its commit, and a change's
 * links file following its folder.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atlasLine } from "../../src/core/atlas.ts";
import { tierOf } from "../../src/core/visuals.ts";
import {
  absentAt,
  atlasStanding,
  changeTouched,
  docsLineOf,
  driftFacts,
  keepDocuments,
  reachingVisuals,
  readDocuments,
  readDrift,
  readVisualsHome,
  recordReaches,
  refreshOwed,
  refreshUnnamed,
  repinChangeVisuals,
  touchedPages,
  writeChangeLinks,
} from "../../src/shell/visuals.ts";

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
  const root = mkdtempSync(join(tmpdir(), "greenline-visuals-"));
  cleanup.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet", "-b", "main");
  const commit = (message: string): string => {
    git("add", "--all");
    git("commit", "--quiet", "-m", message);
    return git("rev-parse", "HEAD");
  };
  return { root, write, commit };
}

/** The fields a test sets on a manifest beside its commit and files. */
interface ManifestFields {
  readonly change?: string | null;
}

function manifest(commit: string, files: readonly string[], more: ManifestFields = {}): string {
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
    ...more,
  });
}

describe("J-110 S1 the visual home on disk", () => {
  it("reads each manifest the layout holds with the visual beside it, and keeps one that does not read with its refusal", () => {
    const repo = repository();
    repo.write("src/cache.ts", "export {};\n");
    const at = repo.commit("start");
    repo.write(`.greenline/visuals/${ID}/request-path.visual.json`, manifest(at, ["src/cache.ts"]));
    repo.write(`.greenline/visuals/${ID}/request-path.svg`, "<svg/>");
    repo.write(
      ".greenline/visuals/map/architecture.visual.json",
      manifest(at, [], { change: null }),
    );
    repo.write(".greenline/visuals/map/architecture.html", "<html></html>");
    repo.write(".greenline/visuals/subsystems/http/a-request.visual.json", "{ not json");
    repo.write(".greenline/visuals/loose.visual.json", manifest(at, []));
    repo.write(".greenline/visuals/cache/x.visual.json", manifest(at, []));
    const entries = readVisualsHome(repo.root);
    expect(entries.map((entry) => entry.id)).toEqual([
      `${ID}/request-path`,
      "map/architecture",
      "subsystems/http/a-request",
    ]);
    expect(entries[0]?.file).toEqual({
      path: `.greenline/visuals/${ID}/request-path.svg`,
      extension: "svg",
    });
    expect(entries[1]?.file?.extension).toBe("html");
    expect(entries[2]?.manifest._tag).toBe("err");
    expect(entries[2]?.file).toBeNull();
  });

  it("reads nothing where the home is absent, or where it links outside the repository", () => {
    expect(readVisualsHome(repository().root)).toEqual([]);
    const repo = repository();
    const outside = mkdtempSync(join(tmpdir(), "greenline-visuals-outside-"));
    cleanup.push(outside);
    mkdirSync(join(outside, ID), { recursive: true });
    writeFileSync(join(outside, ID, "x.visual.json"), manifest("0123abc", []));
    mkdirSync(join(repo.root, ".greenline"), { recursive: true });
    symlinkSync(outside, join(repo.root, ".greenline", "visuals"));
    expect(readVisualsHome(repo.root)).toEqual([]);
  });
});

describe("J-110 S3 git's answers about a visual's files since its commit", () => {
  it("counts the commits that touched a covered file, a directory included, and none that touched another", () => {
    const repo = repository();
    repo.write("src/cache.ts", "a\n");
    repo.write("src/http/serve.ts", "a\n");
    repo.write("README.md", "a\n");
    const at = repo.commit("start");
    expect(tierOf(driftFacts(repo.root, at, ["src/cache.ts", "src/http/"]))).toEqual({
      tier: "fresh",
      commitsSince: 0,
    });
    repo.write("README.md", "b\n");
    repo.commit("docs");
    expect(tierOf(driftFacts(repo.root, at, ["src/cache.ts", "src/http/"])).tier).toBe("fresh");
    repo.write("src/http/serve.ts", "b\n");
    repo.commit("serve");
    repo.write("src/cache.ts", "b\n");
    repo.commit("cache");
    expect(tierOf(driftFacts(repo.root, at, ["src/cache.ts", "src/http/"]))).toEqual({
      tier: "drifting",
      commitsSince: 2,
    });
  });

  it("reads stale when a covered file is gone or the commit is unknown, and fresh for a visual covering nothing", () => {
    const repo = repository();
    repo.write("src/cache.ts", "a\n");
    const at = repo.commit("start");
    rmSync(join(repo.root, "src/cache.ts"));
    repo.write("src/other.ts", "a\n");
    repo.commit("remove");
    expect(tierOf(driftFacts(repo.root, at, ["src/cache.ts"])).tier).toBe("stale");
    expect(tierOf(driftFacts(repo.root, "0".repeat(40), ["src/other.ts"]))).toEqual({
      tier: "stale",
      commitsSince: null,
    });
    expect(tierOf(driftFacts(repo.root, at, []))).toEqual({ tier: "fresh", commitsSince: 0 });
  });

  it("never counts gone a path its commit did not hold yet, a page planned before its files are written", () => {
    const repo = repository();
    repo.write("README.md", "a\n");
    const at = repo.commit("start");
    expect(tierOf(driftFacts(repo.root, at, ["src/planned/", "src/later.ts"]))).toEqual({
      tier: "fresh",
      commitsSince: 0,
    });
    repo.write("src/later.ts", "a\n");
    repo.commit("later");
    expect(tierOf(driftFacts(repo.root, at, ["src/planned/", "src/later.ts"]))).toEqual({
      tier: "drifting",
      commitsSince: 1,
    });
  });
});

describe("J-110 S1 a change's links file", () => {
  it("lists the change's visuals that read, follows a removal, and stays, empty, once the last is gone", () => {
    const repo = repository();
    repo.write("a.txt", "a\n");
    const at = repo.commit("start");
    const path = join(repo.root, ".greenline", "ledger", ID, "visuals.json");
    writeChangeLinks(repo.root, ID, "greenline event");
    expect(existsSync(path)).toBe(false);
    repo.write(`.greenline/visuals/${ID}/request-path.visual.json`, manifest(at, []));
    repo.write(`.greenline/visuals/${ID}/request-path.html`, "<html></html>");
    repo.write(`.greenline/visuals/${ID}/broken.visual.json`, "{");
    writeChangeLinks(repo.root, ID, "greenline event");
    // SAFETY: the links file is the module's own output, read for its list of ids.
    const links = JSON.parse(readFileSync(path, "utf8")) as { visuals: { id: string }[] };
    expect(links.visuals.map((visual) => visual.id)).toEqual([`${ID}/request-path`]);
    rmSync(join(repo.root, ".greenline", "visuals", ID), { recursive: true });
    writeChangeLinks(repo.root, ID, "greenline inspect");
    // SAFETY: the links file is the module's own output, read for its list.
    const emptied = JSON.parse(readFileSync(path, "utf8")) as { visuals: unknown[] };
    expect(emptied.visuals).toEqual([]);
  });
});

/** A git command in the fixture, with the change's trailer where a message names it. */
function gitIn(root: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=F", "-c", "user.email=f@example.com", ...args], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

/** Commit everything as the change's own commit, its trailer in the message. */
function changeCommit(root: string, message: string): string {
  gitIn(root, "add", "--all");
  gitIn(root, "commit", "--quiet", "-m", `${message}\n\nGreenline-Change: ${ID}`);
  return gitIn(root, "rev-parse", "HEAD");
}

/** An atlas index of the given pages, each covering its own folder, read at a commit. */
function atlasText(commit: string, names: readonly string[]): string {
  return JSON.stringify({
    schema: "greenline.atlas/v1",
    layers: ["core"],
    subsystems: names.map((name) => ({
      name,
      title: name,
      layer: "core",
      summary: `The ${name}.`,
      files: [`src/${name}/`],
      commit,
      read: "2026-10-28",
      calls: [],
    })),
    refreshes: [],
  });
}

function documentsText(commit: string, author = "owner", change: string | null = null): string {
  return JSON.stringify({
    schema: "greenline.documents/v1",
    documents: [{ path: "README.md", author, files: ["src/loans/"], commit, change }],
  });
}

describe("J-147 S1 the documents drift like atlas pages", () => {
  it("reads the index, counts a document drifting once a commit touches its files, and says the docs line", () => {
    const repo = repository();
    repo.write("README.md", "# shelf\n");
    repo.write("src/loans/lend.js", "a\n");
    const at = repo.commit("start");
    repo.write(".greenline/visuals/documents.json", documentsText(at));
    expect(readDocuments(repo.root)?._tag).toBe("ok");
    expect(docsLineOf(repo.root, readDrift(repo.root))).toBe("docs: none drifting of 1 indexed");
    repo.write("src/loans/lend.js", "b\n");
    repo.commit("lend");
    const drift = readDrift(repo.root);
    expect(drift.items).toEqual([
      expect.objectContaining({ kind: "document", id: "README.md", author: "owner" }),
    ]);
    expect(docsLineOf(repo.root, drift)).toBe("docs: 1 page drifting: README.md");
    repo.write(".greenline/visuals/documents.json", "{");
    expect(readDrift(repo.root).unreadable.map((entry) => entry.path)).toEqual([
      ".greenline/visuals/documents.json",
    ]);
  });

  it("keeps a document the change wrote at HEAD, so it no longer drifts", () => {
    const repo = repository();
    repo.write("README.md", "# shelf\n");
    repo.write("src/loans/lend.js", "a\n");
    const at = repo.commit("start");
    repo.write(".greenline/visuals/documents.json", documentsText(at));
    repo.write("src/loans/lend.js", "b\n");
    const head = repo.commit("lend");
    keepDocuments(repo.root, ["README.md"], ID);
    const index = readDocuments(repo.root);
    expect(index?._tag === "ok" ? index.value.documents[0] : undefined).toEqual(
      expect.objectContaining({ commit: head, change: ID }),
    );
    expect(readDrift(repo.root).items).toEqual([]);
  });
});

describe("J-147 S1 the atlas's standing and the pages a change touched", () => {
  it("says none, and reads a major change once pages or a map stand, writing nothing under the home (J-176 S1)", () => {
    const repo = repository();
    repo.write("src/loans/lend.js", "a\n");
    const at = repo.commit("start");
    expect(atlasStanding(repo.root, readDrift(repo.root), undefined, false)).toEqual(
      expect.objectContaining({ pages: 0, mapBehind: null, major: undefined }),
    );
    expect(existsSync(join(repo.root, ".greenline", "visuals"))).toBe(false);
    repo.write(".greenline/visuals/atlas.json", atlasText(at, ["loans"]));
    repo.commit("atlas");
    repo.write("billing/charge.ts", "export {}\n");
    repo.commit("billing");
    expect(atlasStanding(repo.root, readDrift(repo.root), undefined, false)?.major).toEqual({
      kind: "module",
      module: "billing",
    });
  });

  it("names the touched pages, a journey and the map, the ones that drift owed a refresh until the record names it", () => {
    const repo = repository();
    for (const name of ["loans", "members"]) repo.write(`src/${name}/a.js`, "a\n");
    const at = repo.commit("start");
    repo.write(".greenline/visuals/atlas.json", atlasText(at, ["loans", "members"]));
    repo.write(`.greenline/visuals/map/map.visual.json`, manifest(at, ["src/"], { change: null }));
    repo.write(
      `.greenline/visuals/subsystems/loans/lend.visual.json`,
      manifest(at, ["src/loans/a.js"], { change: null }),
    );
    repo.commit("atlas");
    repo.write("src/loans/a.js", "b\n");
    changeCommit(repo.root, "lend");
    expect(changeTouched(repo.root, ID)).toEqual(["src/loans/a.js"]);
    expect(
      touchedPages(repo.root, changeTouched(repo.root, ID)).map(
        (page) => `${page.name} ${page.staleness.tier}`,
      ),
    ).toEqual(["loans drifting", "loans/lend drifting", "map drifting"]);
    expect(refreshOwed(repo.root, ID, [])).toEqual(["loans", "loans/lend", "map"]);
    expect(refreshOwed(repo.root, ID, ["loans", "loans/lend"])).toEqual(["map"]);
    const standing = atlasStanding(repo.root, readDrift(repo.root), ID, true);
    expect(standing).toEqual(
      expect.objectContaining({
        pages: 2,
        drifting: 1,
        mapBehind: 1,
        touched: ["loans", "loans/lend", "map"],
      }),
    );
  });

  it("leaves the pages past the close's three to the owner's ask, and holds done for none of them", () => {
    const many = repository();
    const names = ["a", "b", "c", "d"];
    for (const name of names) many.write(`src/${name}/x.js`, "a\n");
    const at = many.commit("start");
    many.write(".greenline/visuals/atlas.json", atlasText(at, names));
    many.commit("atlas");
    for (const name of names) many.write(`src/${name}/x.js`, "b\n");
    changeCommit(many.root, "all");
    expect(refreshOwed(many.root, ID, []).length).toBe(4);
  });
});

describe("J-227 S1 a refresh made is a refresh named (j201t-linear-visuals finding 15)", () => {
  /** The record at its close, its refreshes line naming the pages given, or none. */
  function closing(root: string, pages: string | undefined): void {
    writeFileSync(
      join(root, ".greenline", "ledger", `${ID}.md`),
      [
        "---",
        "mode: regular",
        "state: open",
        ...(pages === undefined
          ? []
          : [
              "refreshes:",
              `  - { by: explain, pages: "${pages}", cost: "one agent, three minutes" }`,
            ]),
        "---",
        "",
        "## close",
        "",
        "Closed.",
        "",
      ].join("\n"),
    );
  }

  /** The atlas read on main with its page, a journey and the map, then the change's code and its close's refresh of the page and the map. */
  function refreshed(): Repository {
    const repo = repository();
    repo.write("src/loans/a.js", "a\n");
    const at = repo.commit("start");
    repo.write(".greenline/visuals/atlas.json", atlasText(at, ["loans"]));
    repo.write(".greenline/visuals/subsystems/loans.md", "# Loans\n");
    repo.write(
      ".greenline/visuals/subsystems/loans/lend.visual.json",
      manifest(at, ["src/loans/a.js"], { change: null }),
    );
    repo.write(".greenline/visuals/subsystems/loans/lend.svg", "<svg/>");
    repo.write(".greenline/visuals/map/map.md", "# Map\n");
    repo.write(
      ".greenline/visuals/map/architecture.visual.json",
      manifest(at, ["src/"], { change: null }),
    );
    repo.commit("atlas");
    mkdirSync(join(repo.root, ".greenline", "ledger"), { recursive: true });
    repo.write("src/loans/a.js", "b\n");
    changeCommit(repo.root, "lend");
    // The close's fresh agent rewrites the page and the map; a hook's maker on the journey's manifest is no refresh.
    repo.write(".greenline/visuals/subsystems/loans.md", "# Loans\n\nRefreshed.\n");
    repo.write(
      ".greenline/visuals/atlas.json",
      atlasText(gitIn(repo.root, "rev-parse", "HEAD"), ["loans"]),
    );
    changeCommit(repo.root, "refresh the loans page");
    repo.write(".greenline/visuals/map/map.md", "# Map\n\nRefreshed.\n");
    repo.write(
      ".greenline/visuals/subsystems/loans/lend.visual.json",
      manifest(at, ["src/loans/a.js"], { change: null }).replace(
        '"made"',
        '"madeBy":"session","made"',
      ),
    );
    // A page the change made, where none stood before it, is no refresh.
    repo.write(".greenline/visuals/subsystems/loans/return.svg", "<svg/>");
    return repo;
  }

  it("names the pages the change rewrote that the record's refreshes do not name, in the commits and the working tree", () => {
    const repo = refreshed();
    expect(refreshUnnamed(repo.root, ID, [])).toEqual(["loans", "map"]);
    expect(refreshUnnamed(repo.root, ID, ["loans"])).toEqual(["map"]);
    expect(refreshUnnamed(repo.root, ID, ["loans", "map"])).toEqual([]);
  });

  it("names them on the atlas line at the close, and nothing once the line names them", () => {
    const repo = refreshed();
    closing(repo.root, undefined);
    const standing = atlasStanding(repo.root, readDrift(repo.root), ID, true);
    expect(standing?.unnamed).toEqual(["loans", "map"]);
    expect(standing === undefined ? "" : atlasLine(standing)).toContain(
      "; this change rewrote loans, map, which the record's refreshes line does not name: name each with the agent that refreshed it and its cost",
    );
    closing(repo.root, "loans, map");
    const named = atlasStanding(repo.root, readDrift(repo.root), ID, true);
    expect(named?.unnamed).toEqual([]);
    expect(named === undefined ? "" : atlasLine(named)).not.toContain("rewrote");
    // Away from the close the line names nothing of it.
    expect(atlasStanding(repo.root, readDrift(repo.root), ID, false)?.unnamed).toBeUndefined();
  });

  it("reads the change's own trailer alone, and a page it deleted as no refresh", () => {
    const repo = refreshed();
    // Another change whose id begins with this one's rewrote the map; it is none of this change's.
    const other = `${ID}-later`;
    gitIn(repo.root, "add", "--all");
    gitIn(repo.root, "commit", "--quiet", "-m", `refresh\n\nGreenline-Change: ${other}`);
    repo.write(".greenline/visuals/map/map.md", "# Map\n\nAgain.\n");
    gitIn(repo.root, "add", "--all");
    gitIn(repo.root, "commit", "--quiet", "-m", `again\n\nGreenline-Change: ${other}`);
    expect(refreshUnnamed(repo.root, ID, [])).toEqual(["loans"]);
    // A journey the change deleted is no page it rewrote.
    rmSync(join(repo.root, ".greenline", "visuals", "subsystems", "loans", "lend.svg"));
    changeCommit(repo.root, "drop the journey");
    expect(refreshUnnamed(repo.root, ID, [])).toEqual(["loans"]);
  });

  it("names nothing for a change that touched no page, and none where no atlas stands", () => {
    const repo = repository();
    repo.write("src/loans/a.js", "a\n");
    repo.commit("start");
    repo.write("src/loans/a.js", "b\n");
    changeCommit(repo.root, "lend");
    expect(refreshUnnamed(repo.root, ID, [])).toEqual([]);
    const standing = atlasStanding(repo.root, readDrift(repo.root), ID, true);
    expect(standing === undefined ? "" : atlasLine(standing)).toBe("atlas: none");
  });
});

describe("J-147 S3 the visual's reach, its commit at the close and its files at its commit", () => {
  it("records the addresses a written visual loads and names the visual among those that reach outside", () => {
    const repo = repository();
    repo.write("src/a.js", "a\n");
    const at = repo.commit("start");
    repo.write(`.greenline/visuals/${ID}/flow.visual.json`, manifest(at, []));
    repo.write(
      `.greenline/visuals/${ID}/flow.html`,
      '<script src="https://cdn.example.com/d3.js"></script>',
    );
    recordReaches(repo.root, [`.greenline/visuals/${ID}/flow.html`]);
    expect(reachingVisuals(repo.root)).toEqual([
      expect.objectContaining({ id: `${ID}/flow`, reaches: ["https://cdn.example.com/d3.js"] }),
    ]);
    repo.write(`.greenline/visuals/${ID}/flow.html`, "<p>inline</p>");
    recordReaches(repo.root, [`.greenline/visuals/${ID}/flow.html`]);
    expect(reachingVisuals(repo.root)).toEqual([]);
  });

  it("moves a picture's commit only where no file it covers changed since, and keeps the rest with the reason (j196t-conduct-emptyd, finding 2)", () => {
    const repo = repository();
    repo.write("greeting.py", "def say_hello(name):\n    return f'Hello, {name}.'\n");
    repo.write("test_greeting.py", "import greeting\n");
    repo.write("README.md", "# greeting\n");
    const path = repo.commit("fix(greeting): end message with a full stop");
    // The request path, kept at a267195; the parts, kept at 1ca91e1 with README.md too.
    repo.write(
      `.greenline/visuals/${ID}/request-path.visual.json`,
      manifest(path, ["greeting.py", "test_greeting.py"]),
    );
    const parts = repo.commit("docs(greeting): keep request path picture");
    repo.write(
      `.greenline/visuals/${ID}/greeting-parts.visual.json`,
      manifest(parts, ["greeting.py", "test_greeting.py", "README.md"]),
    );
    repo.write(`.greenline/visuals/${ID}/readme.visual.json`, manifest(parts, ["README.md"]));
    repo.write(`.greenline/visuals/${ID}/bare.visual.json`, manifest(parts, []));
    repo.commit("docs(greeting): keep parts picture");
    // The docstring commit touches greeting.py, which both pictures cover (b49c0f0).
    repo.write(
      "greeting.py",
      'def say_hello(name):\n    """Greet."""\n    return f\'Hello, {name}.\'\n',
    );
    repo.commit("docs(greeting): document say_hello");
    repo.write(".greenline/ledger/record.md", "state: stopped\n");
    const stop = repo.commit("chore(greeting): record stop before review");
    const commitOf = (slug: string): string | undefined => {
      const entry = readVisualsHome(repo.root).find((item) => item.id === `${ID}/${slug}`);
      return entry?.manifest._tag === "ok" ? entry.manifest.value.commit : undefined;
    };
    expect(repinChangeVisuals(repo.root, ID, stop)).toEqual({
      moved: [
        { id: `${ID}/bare`, path: `.greenline/visuals/${ID}/bare.visual.json` },
        { id: `${ID}/readme`, path: `.greenline/visuals/${ID}/readme.visual.json` },
      ],
      kept: [
        {
          id: `${ID}/greeting-parts`,
          path: `.greenline/visuals/${ID}/greeting-parts.visual.json`,
          commit: parts,
          reason: "covered-changed",
        },
        {
          id: `${ID}/request-path`,
          path: `.greenline/visuals/${ID}/request-path.visual.json`,
          commit: path,
          reason: "covered-changed",
        },
      ],
    });
    expect(commitOf("request-path")).toBe(path);
    expect(commitOf("greeting-parts")).toBe(parts);
    expect(commitOf("readme")).toBe(stop);
    expect(commitOf("bare")).toBe(stop);
    // Status's count of the covered commits since each kept anchor stands, the drift it names.
    expect(driftFacts(repo.root, path, ["greeting.py", "test_greeting.py"])).toEqual({
      kind: "read",
      touching: 1,
      missing: 0,
    });
    // A manifest already at the commit moves nowhere, and another change's are not read.
    expect(repinChangeVisuals(repo.root, ID, stop).moved).toEqual([]);
    expect(repinChangeVisuals(repo.root, "2026-10-29-other", stop)).toEqual({
      moved: [],
      kept: [],
    });
  });

  it("keeps a picture whose commit the history does not hold, and moves one whose covered file changed back", () => {
    const repo = repository();
    repo.write("src/a.js", "a\n");
    const at = repo.commit("start");
    repo.write(`.greenline/visuals/${ID}/lost.visual.json`, manifest("0123abc", ["src/a.js"]));
    repo.write(`.greenline/visuals/${ID}/flow.visual.json`, manifest(at, ["src/a.js"]));
    repo.write("src/a.js", "b\n");
    repo.commit("a");
    repo.write("src/a.js", "a\n");
    const head = repo.commit("a again");
    expect(repinChangeVisuals(repo.root, ID, head)).toEqual({
      moved: [{ id: `${ID}/flow`, path: `.greenline/visuals/${ID}/flow.visual.json` }],
      kept: [
        {
          id: `${ID}/lost`,
          path: `.greenline/visuals/${ID}/lost.visual.json`,
          commit: "0123abc",
          reason: "commit-unknown",
        },
      ],
    });
  });

  it("names the covered paths a commit does not hold, and none for a commit the history lacks", () => {
    const repo = repository();
    repo.write("src/a.js", "a\n");
    const at = repo.commit("start");
    expect(absentAt(repo.root, at, ["src/a.js", "src/", "src/b.js"])).toEqual(["src/b.js"]);
    expect(absentAt(repo.root, "0123abc", ["src/a.js"])).toBeUndefined();
  });
});
