import { describe, expect, it } from "vitest";
import type { InterfaceCheckFact } from "../../src/core/interface-check.ts";
import type { CaptureLimit } from "../../src/core/interface-check.ts";
import {
  CAPTURE_COMMAND,
  isTemplate,
  pageMatches,
  pageOfFile,
  pagesOf,
  renderOwed,
  renderOwedLine,
  renderOwedText,
  touchedFiles,
  unservedLine,
  type TouchedFile,
} from "../../src/core/interface-pages.ts";
import type { InterfaceSetting } from "../../src/core/manifest.ts";
import { declaredPages } from "../../src/core/record-interface.ts";

/**
 * The pages an interface change touched (J-133 S1): each interface file's
 * page read from its path by the frameworks' file-system conventions, the
 * files no page names kept apart, and the render hold that asks, for each
 * page, a capture at the three widths or the browser limit the engine
 * named, made after its files last changed.
 */

const WEB: InterfaceSetting = {
  roots: ["src/app", "src/components", "site", "."],
  extensions: ["tsx", "css", "html", "vue", "astro"],
  platform: "web",
  frameworks: ["react"],
  evidence: [],
  confirmed: true,
  check: true,
};

const NOW = Date.parse("2026-10-27T10:00:00.000Z");

function fact(
  address: string | undefined,
  at: number,
  extra: Partial<InterfaceCheckFact> = {},
): InterfaceCheckFact {
  return {
    generatedBy: "greenline check interface",
    at: new Date(at).toISOString(),
    commit: null,
    paths: [],
    counts: { floor: 0, reflex: 0, waived: 0, finish: 0 },
    findings: [],
    unmeasured: [],
    widths: [],
    address,
    ...extra,
  };
}

const CAPTURED = { widths: [1440, 768, 390, 320] };
const NO_BROWSER: CaptureLimit = {
  cause: "no-browser",
  origin: "http://127.0.0.1:3000",
  address: "/",
  at: new Date(NOW + 1).toISOString(),
  detail: "no Chrome or Chromium was found",
};
const TIMEOUT: CaptureLimit = {
  cause: "timeout",
  origin: "http://127.0.0.1:3000",
  address: "/",
  at: new Date(NOW + 1).toISOString(),
  detail: "Page.navigate timed out",
};

describe("J-133 S1 the page of an interface file", () => {
  it("reads the app folder by its folders, its groups, slots and private folders left out", () => {
    expect(pageOfFile("src/app/page.tsx", "src/app")).toBe("/");
    expect(pageOfFile("src/app/globals.css", "src/app")).toBe("/");
    expect(pageOfFile("src/app/members/page.tsx", "src/app")).toBe("/members");
    expect(pageOfFile("src/app/members/new/page.tsx", "src/app")).toBe("/members/new");
    expect(pageOfFile("src/app/(shop)/cart/@modal/_parts/row.tsx", "src/app")).toBe("/cart");
    expect(pageOfFile("app/blog/[slug]/page.tsx", ".")).toBe("/blog/[slug]");
    expect(pageOfFile("apps/web/src/app/page.tsx", "apps/web")).toBe("/");
  });

  it("reads a pages folder by the file's name, index as its folder, the innermost folder first", () => {
    expect(pageOfFile("src/pages/index.astro", "src/pages")).toBe("/");
    expect(pageOfFile("src/pages/about.astro", "src/pages")).toBe("/about");
    expect(pageOfFile("pages/blog/[...slug].tsx", ".")).toBe("/blog/[...slug]");
    expect(pageOfFile("pages/_app.tsx", ".")).toBe("/");
    expect(pageOfFile("app/pages/about.vue", "app")).toBe("/about");
  });

  it("names no page for a folder named app that is a package or a Rails app", () => {
    expect(pageOfFile("packages/app/src/components/x.tsx", "packages/app")).toBeUndefined();
    expect(pageOfFile("app/javascript/components/X.tsx", "app/javascript")).toBeUndefined();
  });

  it("reads a plain page by its path under the root, and names no page for a shared component", () => {
    expect(pageOfFile("site/index.html", "site")).toBe("/");
    expect(pageOfFile("site/about.html", "site")).toBe("/about.html");
    expect(pageOfFile("site/docs/index.html", "site")).toBe("/docs/");
    expect(pageOfFile("src/components/members-table.tsx", "src/components")).toBeUndefined();
    expect(pageOfFile("site/css/main.css", "site")).toBeUndefined();
  });
});

describe("J-133 S1 the files a change touched", () => {
  it("keeps the interface files with their pages, DESIGN.md, other files and greenline's own left out", () => {
    const files = touchedFiles(
      [
        "DESIGN.md",
        "README.md",
        "src/app/globals.css",
        "src/app/members/page.tsx",
        "src/app/members/page.tsx",
        "src/components/members-table.tsx",
        ".greenline/visuals/2026-10-27-x/capture-members.html",
        "node_modules/pkg/index.html",
        "tailwind.config.js",
      ],
      WEB,
    );
    expect(pagesOf(files)).toEqual({
      pages: ["/", "/members"],
      shared: ["src/components/members-table.tsx"],
    });
  });

  it("J-143 S3 holds every file under a root as a screen no page names on a platform no browser renders", () => {
    expect(touchedFiles(["src/app/members/page.tsx"], { ...WEB, platform: "ios" })).toEqual([
      { path: "src/app/members/page.tsx", page: undefined },
    ]);
    const owed = renderOwed(
      touchedFiles(["src/app/members/page.tsx"], { ...WEB, platform: "cross" }),
      [],
      () => 0,
    );
    expect(owed).toEqual({ pages: [], shared: ["src/app/members/page.tsx"] });
  });
});

describe("J-133 S1 a page matched by an address", () => {
  it("matches a dynamic segment, an optional one, a rest, a trailing slash and a query", () => {
    expect(pageMatches("/members", "/members")).toBe(true);
    expect(pageMatches("/members", "/members/?tab=all#top")).toBe(true);
    expect(pageMatches("/members", "/members/new")).toBe(false);
    expect(pageMatches("/blog/[slug]", "/blog/first")).toBe(true);
    expect(pageMatches("/blog/[slug]", "/blog")).toBe(false);
    expect(pageMatches("/docs/[...rest]", "/docs/a/b")).toBe(true);
    expect(pageMatches("/docs/[...rest]", "/docs")).toBe(true);
    expect(pageMatches("/docs/[...rest]/edit", "/docs/a/edit")).toBe(true);
    expect(pageMatches("/[[lang]]/about", "/about")).toBe(true);
    expect(pageMatches("/[[lang]]/about", "/fr/about")).toBe(true);
    expect(pageMatches("/[[lang]]/about", "/fr/de/about")).toBe(false);
    expect(pageMatches("/docs/", "/docs/")).toBe(true);
    expect(pageMatches("/", "/")).toBe(true);
  });
});

describe("J-133 S1 the render hold", () => {
  const files: readonly TouchedFile[] = [
    { path: "src/app/page.tsx", page: "/" },
    { path: "src/app/members/page.tsx", page: "/members" },
    { path: "src/components/members-table.tsx", page: undefined },
  ];
  const written = (): number => NOW;
  const touched = { pages: ["/", "/members"], shared: ["src/components/members-table.tsx"] };

  it("owes every page and the shared files while only static runs stand", () => {
    expect(renderOwed(files, [fact(undefined, NOW + 1)], written)).toEqual(touched);
  });

  it("settles a page by a capture at the three widths, or by the browser limit the engine named once the record names it", () => {
    const captured = fact("/members", NOW + 1, CAPTURED);
    expect(renderOwed(files, [captured], written)).toEqual({ pages: ["/"], shared: [] });
    const limit = fact("/", NOW + 1, {
      browser: "no Chrome or Chromium was found",
      limit: NO_BROWSER,
    });
    expect(
      renderOwed(files, [captured, limit], written, [{ address: "/", words: "not captured" }]),
    ).toBeUndefined();
  });

  it("J-191 S1 holds a page whose only render is a limit the record does not name, carrying the limit to name", () => {
    const captured = fact("/members", NOW + 1, CAPTURED);
    const limit = fact("/", NOW + 1, { browser: "Page.navigate timed out", limit: TIMEOUT });
    expect(renderOwed(files, [captured, limit], written)).toEqual({
      pages: ["/"],
      shared: [],
      limits: [TIMEOUT],
    });
    expect(
      renderOwed(files, [captured, limit], written, [{ address: "/members", words: "elsewhere" }]),
    ).toEqual({ pages: ["/"], shared: [], limits: [TIMEOUT] });
  });

  it("J-191 S1 settles a screen by the platform's limit alone, as J-143 S3 has it", () => {
    const screen = fact("/", NOW + 1, {
      browser: "the platform is ios",
      limit: { ...TIMEOUT, cause: "platform", origin: null, detail: "the platform is ios" },
    });
    expect(
      renderOwed(files, [fact("/members", NOW + 1, CAPTURED), screen], written),
    ).toBeUndefined();
  });

  it("J-191 S1 still holds a page with neither a capture nor a limit, whatever the record names", () => {
    expect(
      renderOwed(files, [fact("/members", NOW + 1, CAPTURED)], written, [
        { address: "/", words: "words alone settle nothing" },
      ]),
    ).toEqual({ pages: ["/"], shared: [] });
  });

  it("J-191 S1 words the limit the record owes in the hold's line", () => {
    expect(renderOwedLine({ pages: ["/"], shared: [], limits: [TIMEOUT] })).toBe(
      "interface render: owed for /; the capture of / met its limit, the page did not load in time at http://127.0.0.1:3000/ (Page.navigate timed out): name it in the record's ## Interface section as `- limit /: <what was not captured, in your words>`, or capture it, before done",
    );
  });

  it("never settles a page by a render made before its files last changed, a redesign's before among them", () => {
    const before = fact("/members", NOW - 1, CAPTURED);
    expect(renderOwed(files, [before], written)).toEqual({
      pages: ["/", "/members"],
      shared: ["src/components/members-table.tsx"],
    });
  });

  it("never settles a page by a render run that carries neither", () => {
    expect(renderOwed(files, [fact("/members", NOW + 1), fact("/", NOW + 1)], written)).toEqual(
      touched,
    );
  });

  it("owes nothing where the change touched no interface file", () => {
    expect(renderOwed([], [], written)).toBeUndefined();
  });

  it("words what is owed and the command that settles it", () => {
    expect(renderOwedText(touched)).toBe(
      "/ and /members, and a page rendering src/components/members-table.tsx",
    );
    expect(renderOwedText({ pages: [], shared: ["a.tsx", "b.tsx"] })).toBe(
      "a page rendering a.tsx and b.tsx",
    );
    expect(CAPTURE_COMMAND).toBe("greenline check interface --url <address> --path <page>");
    expect(renderOwedLine({ pages: ["/members"], shared: [] })).toBe(
      "interface render: owed for /members; run greenline check interface --url <address> --path <page>, or greenline check interface --path <screen> on a platform no browser renders, before done",
    );
  });
});

describe("J-148 S4 a template's address is the one the app serves it at", () => {
  const DJANGO: InterfaceSetting = { ...WEB, roots: ["tally/templates"], extensions: ["html"] };

  it("knows a server's template by its folder or its extension, and a plain page as none", () => {
    expect(isTemplate("tally/templates/tally/home.html")).toBe(true);
    expect(isTemplate("web/views/index.ejs")).toBe(true);
    expect(isTemplate("app/views/members/index.html.erb")).toBe(true);
    expect(isTemplate("site/about.html")).toBe(false);
    // A component framework's views and layouts stay shared files, owed a render.
    expect(isTemplate("src/views/Home.vue")).toBe(false);
    expect(isTemplate("src/layouts/Layout.astro")).toBe(false);
  });

  it("reads the routes the record's ## Interface section declares, and nothing outside it", () => {
    const body = [
      "## design",
      "",
      "- page /elsewhere: tally/templates/tally/list.html",
      "",
      "## Interface",
      "",
      "- page /: tally/templates/tally/home.html",
      "- page /entries/: tally/templates/tally/entries.html",
      "- waiver: none",
      "",
      "## build",
    ].join("\n");
    expect([...declaredPages(body)]).toEqual([
      ["tally/templates/tally/home.html", "/"],
      ["tally/templates/tally/entries.html", "/entries/"],
    ]);
  });

  it("checks a template at its declared page line, never its file's path, and names one no page line names", () => {
    const served = new Map([["tally/templates/tally/home.html", "/"]]);
    const files = touchedFiles(
      ["tally/templates/tally/home.html", "tally/templates/tally/list.html"],
      DJANGO,
      served,
    );
    expect(files).toEqual([
      { path: "tally/templates/tally/home.html", page: "/" },
      { path: "tally/templates/tally/list.html", page: undefined, unserved: true },
    ]);
    const touched = pagesOf(files);
    // A page folder's file names its page by its folders, a views folder within it included.
    expect(touchedFiles(["src/app/views/page.tsx"], WEB)).toEqual([
      { path: "src/app/views/page.tsx", page: "/views" },
    ]);
    expect(touched).toEqual({
      pages: ["/"],
      shared: [],
      unserved: ["tally/templates/tally/list.html"],
    });
    // The file's path is never owed: the served address is, and the unserved template is not held.
    expect(renderOwed(files, [], () => NOW)).toEqual({ pages: ["/"], shared: [] });
    expect(renderOwed(files, [fact("/", NOW + 1000, CAPTURED)], () => NOW)).toBeUndefined();
    expect(unservedLine(touched.unserved ?? [])).toBe(
      "not checked: tally/templates/tally/list.html, a template no page line names; name each in the record's ## Interface section as `- page <address>: <path>`, the address the app serves it at",
    );
    expect(unservedLine([])).toBeUndefined();
  });
});
