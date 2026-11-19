/**
 * The visual home's pure part (J-110 S1 and S3): the manifest's parser, the
 * layout's places and ids, the staleness arithmetic the map, status and the
 * inspector share, and the change's links file.
 */
import { describe, expect, it } from "vitest";
import {
  changeVisualsFolder,
  documentsKept,
  linksFileText,
  manifestAtCommit,
  manifestWithReaches,
  pictureMaker,
  parseDocuments,
  parseVisualManifest,
  placeOfManifest,
  reachesOf,
  tierOf,
  visualId,
} from "../../src/core/visuals.ts";

const MANIFEST = {
  schema: "greenline.visual/v1",
  title: "The request path",
  form: "sequence",
  skill: "diagram-design",
  change: "2026-10-25-cache-headers",
  commit: "0123abc",
  files: ["src/http/", "src/cache.ts"],
  made: "2026-10-25",
  summary: "How a request reaches the cache and back.",
};

describe("J-110 S1 the visual's manifest", () => {
  it("reads a manifest with every field, a change or none", () => {
    const read = parseVisualManifest(JSON.stringify(MANIFEST), "m.visual.json");
    expect(read._tag).toBe("ok");
    const none = parseVisualManifest(
      JSON.stringify({ ...MANIFEST, change: null, made: "2026-10-25T10:00:00Z", files: [] }),
      "m",
    );
    expect(none._tag).toBe("ok");
  });

  it("refuses text that is no JSON, an unknown field, a missing one and a path leaving the repository", () => {
    expect(parseVisualManifest("{", "m")._tag).toBe("err");
    expect(parseVisualManifest(JSON.stringify({ ...MANIFEST, extra: 1 }), "m")._tag).toBe("err");
    const { summary: _summary, ...lacking } = MANIFEST;
    expect(parseVisualManifest(JSON.stringify(lacking), "m")._tag).toBe("err");
    for (const file of ["../secret", "/etc/passwd", "src/../../x", "a\\b"])
      expect(parseVisualManifest(JSON.stringify({ ...MANIFEST, files: [file] }), "m")._tag).toBe(
        "err",
      );
    expect(parseVisualManifest(JSON.stringify({ ...MANIFEST, change: "cache" }), "m")._tag).toBe(
      "err",
    );
    expect(parseVisualManifest(JSON.stringify({ ...MANIFEST, commit: "HEAD" }), "m")._tag).toBe(
      "err",
    );
  });
});

describe("J-110 S1 the home's layout", () => {
  it("places a change's visual, the map's and a subsystem's journey, each with its id", () => {
    const change = placeOfManifest("2026-10-25-cache-headers/request-path.visual.json");
    expect(change).toEqual({
      kind: "change",
      change: "2026-10-25-cache-headers",
      slug: "request-path",
    });
    expect(change === undefined ? "" : visualId(change)).toBe(
      "2026-10-25-cache-headers/request-path",
    );
    const map = placeOfManifest("map/architecture.visual.json");
    expect(map === undefined ? "" : visualId(map)).toBe("map/architecture");
    const journey = placeOfManifest("subsystems/http/a-request.visual.json");
    expect(journey).toEqual({ kind: "journey", subsystem: "http", slug: "a-request" });
    expect(journey === undefined ? "" : visualId(journey)).toBe("subsystems/http/a-request");
  });

  it("holds no place for a path its layout does not name", () => {
    for (const path of [
      "loose.visual.json",
      "cache/request.visual.json",
      "2026-10-25-a/deeper/x.visual.json",
      "subsystems/x.visual.json",
      "map/Upper.visual.json",
      "2026-10-25-a/request.json",
    ])
      expect(placeOfManifest(path), path).toBeUndefined();
  });

  it("names a change's folder in the home", () => {
    expect(changeVisualsFolder("2026-10-25-a")).toBe(".greenline/visuals/2026-10-25-a/");
  });
});

describe("J-110 S3 the staleness arithmetic", () => {
  it("reads fresh with no commit touching its files, drifting with one, stale when its commit or a file is gone", () => {
    expect(tierOf({ kind: "read", touching: 0, missing: 0 })).toEqual({
      tier: "fresh",
      commitsSince: 0,
    });
    expect(tierOf({ kind: "read", touching: 3, missing: 0 })).toEqual({
      tier: "drifting",
      commitsSince: 3,
    });
    expect(tierOf({ kind: "read", touching: 1, missing: 1 })).toEqual({
      tier: "stale",
      commitsSince: 1,
    });
    expect(tierOf({ kind: "unknown-commit" })).toEqual({ tier: "stale", commitsSince: null });
  });
});

describe("J-110 S1 the change's links file", () => {
  it("opens with its generatedBy key and lists the visuals in id order", () => {
    const text = linksFileText(
      "2026-10-25-a",
      [
        { id: "2026-10-25-a/b", title: "B", file: null, manifest: "m2" },
        {
          id: "2026-10-25-a/a",
          title: "A",
          file: ".greenline/visuals/2026-10-25-a/a.svg",
          manifest: "m1",
        },
      ],
      "greenline event",
    );
    expect(text.startsWith('{\n  "generatedBy": "greenline event",')).toBe(true);
    expect(text.indexOf('"title": "A"')).toBeLessThan(text.indexOf('"title": "B"'));
    expect(text.endsWith("}\n")).toBe(true);
  });
});

describe("J-147 S1 the documents index", () => {
  const INDEX = {
    schema: "greenline.documents/v1",
    documents: [
      {
        path: "README.md",
        author: "owner",
        files: ["src/"],
        commit: "0123abc",
        change: null,
      },
      {
        path: "docs/loans.md",
        author: "practice",
        files: ["src/loans.ts"],
        commit: "0123abc",
        change: "2026-10-28-loans",
      },
    ],
  };

  it("reads each document with its author, covered files, commit and change", () => {
    const read = parseDocuments(JSON.stringify(INDEX), "documents.json");
    expect(read._tag).toBe("ok");
    if (read._tag === "ok")
      expect(read.value.documents.map((entry) => entry.author)).toEqual(["owner", "practice"]);
  });

  it("refuses a path listed twice, an author of neither kind, a document covering nothing and an unknown field", () => {
    const [first] = INDEX.documents;
    const twice = { ...INDEX, documents: [first, first] };
    expect(parseDocuments(JSON.stringify(twice), "d")._tag).toBe("err");
    for (const bad of [{ author: "agent" }, { files: [] }, { extra: 1 }, { path: "../x.md" }])
      expect(
        parseDocuments(JSON.stringify({ ...INDEX, documents: [{ ...first, ...bad }] }), "d")._tag,
      ).toBe("err");
    expect(parseDocuments("{", "d")._tag).toBe("err");
  });

  it("keeps the documents a change wrote at a commit, the rest as they stand, and writes nothing where none moved", () => {
    const read = parseDocuments(JSON.stringify(INDEX), "d");
    if (read._tag !== "ok") throw new Error("the fixture reads");
    const kept = documentsKept(read.value, ["README.md", "src/a.ts"], "fedcba9", "2026-10-29-docs");
    const after = kept === undefined ? undefined : parseDocuments(kept, "d");
    expect(after?._tag === "ok" ? after.value.documents : undefined).toEqual([
      { ...INDEX.documents[0], commit: "fedcba9", change: "2026-10-29-docs" },
      INDEX.documents[1],
    ]);
    expect(documentsKept(read.value, ["src/a.ts"], "fedcba9", "2026-10-29-docs")).toBeUndefined();
  });
});

describe("J-147 S1 the style guide's manifest", () => {
  it("places the style guide at the home's top as its own place and id", () => {
    const place = placeOfManifest("style-guide.visual.json");
    expect(place).toEqual({ kind: "style", slug: "style-guide" });
    expect(place === undefined ? undefined : visualId(place)).toBe("style-guide");
    expect(placeOfManifest("other.visual.json")).toBeUndefined();
    expect(
      parseVisualManifest(
        JSON.stringify({ ...MANIFEST, form: "style", change: null, files: [] }),
        "m",
      )._tag,
    ).toBe("ok");
  });
});

describe("J-147 S3 the visual's reach and its commit at the close", () => {
  it("finds the addresses a file loads, never a link the reader follows or a namespace", () => {
    const html = [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://cdn.example.com/a.png"/></svg>',
      '<script src="https://cdn.example.com/d3.js"></script>',
      '<link rel="stylesheet" href="https://fonts.example.com/f.css">',
      "<style>@import url('https://fonts.example.com/g.css'); .a { background: url(https://img.example.com/b.png) }</style>",
      '<a href="https://example.com/docs">docs</a>',
      '<script src="https://cdn.example.com/d3.js"></script>',
    ].join("\n");
    expect(reachesOf(html)).toEqual([
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/d3.js",
      "https://fonts.example.com/f.css",
      "https://fonts.example.com/g.css",
      "https://img.example.com/b.png",
    ]);
    expect(reachesOf("<svg><rect/></svg>")).toEqual([]);
  });

  it("records the reach after the summary, removes it when none is left, and pins the commit", () => {
    const text = JSON.stringify(MANIFEST);
    const reached = manifestWithReaches(text, ["https://cdn.example.com/d3.js"]);
    expect(reached === undefined ? [] : Object.keys(JSON.parse(reached))).toEqual([
      ...Object.keys(MANIFEST),
      "reaches",
    ]);
    expect(parseVisualManifest(reached ?? "", "m")._tag).toBe("ok");
    expect(manifestWithReaches(reached ?? "", ["https://cdn.example.com/d3.js"])).toBeUndefined();
    expect(manifestWithReaches(reached ?? "", [])).toBe(`${JSON.stringify(MANIFEST, null, 2)}\n`);
    expect(manifestWithReaches(text, [])).toBeUndefined();
    expect(
      parseVisualManifest(JSON.stringify({ ...MANIFEST, reaches: ["ftp://x"] }), "m")._tag,
    ).toBe("err");
    const pinned = manifestAtCommit(text, "fedcba9");
    expect(pinned === undefined ? undefined : JSON.parse(pinned).commit).toBe("fedcba9");
    expect(manifestAtCommit(pinned ?? "", "fedcba9")).toBeUndefined();
  });
});

describe("J-198 S1 the picture's maker read from the hooks' facts", () => {
  const source = ".greenline/tmp/2026-11-08-greeting-module/greeting-parts.svg";
  const drawnAt = Date.parse("2026-11-08T00:16:21.700Z");
  const event = (
    kind: string,
    at: string,
    agent: string | null,
    call: string,
    command: string | null,
    written: readonly string[] = [],
  ) => ({ kind, at, agent, call, command, written });
  const keep = `greenline picture keep ${source} --change 2026-11-08-greeting-module`;

  it("reads a fresh agent's write tool as the agent's, a shell command naming the file outside its time no write", () => {
    expect(
      pictureMaker(source, drawnAt, [
        event("before-tool", "2026-11-08T00:16:21.577Z", "helper", "p", null, [source]),
        event("after-tool", "2026-11-08T00:16:21.785Z", "helper", "p", null, [source]),
        event("before-tool", "2026-11-08T00:16:27.755Z", null, "k", keep),
        event("after-tool", "2026-11-08T00:16:28.139Z", null, "k", keep),
      ]),
    ).toBe("agent");
  });

  it("reads a session's shell command naming the file within its time as the session's", () => {
    const draw = `cat > ${source} <<'SVG'`;
    expect(
      pictureMaker(source, drawnAt, [
        event("before-tool", "2026-11-08T00:16:21.000Z", null, "d", draw),
        event("after-tool", "2026-11-08T00:16:22.000Z", null, "d", draw),
      ]),
    ).toBe("session");
  });

  it("names no maker where the hooks logged no write of the file", () => {
    expect(
      pictureMaker(source, drawnAt, [
        event("before-tool", "2026-11-08T00:16:27.755Z", null, "k", keep),
        event("after-tool", "2026-11-08T00:16:28.139Z", null, "k", keep),
      ]),
    ).toBeUndefined();
    expect(pictureMaker(source, drawnAt, [])).toBeUndefined();
  });
});
