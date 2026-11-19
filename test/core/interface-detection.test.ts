import { describe, expect, it } from "vitest";
import { detectInterface, interfaceRootOf } from "../../src/core/interface-detection.ts";

/**
 * The interface a workspace already has (J-123 S1; N-62): the roots and the
 * extensions, the platform and the frameworks, each with the evidence that
 * named it, detected from the repository's files and its stack files.
 */

const NEXT_PACKAGE = JSON.stringify({
  dependencies: { next: "15.0.0", react: "19.0.0" },
  devDependencies: { tailwindcss: "4.0.0" },
});

describe("J-123 S1 the interface detected from the files", () => {
  it("finds the roots, the extensions, the web platform and the frameworks of a Tailwind app with components", () => {
    const detection = detectInterface({
      files: [
        "package.json",
        "tailwind.config.ts",
        "src/app/page.tsx",
        "src/app/globals.css",
        "src/components/Button.tsx",
        "src/components/ui/Card.tsx",
        "src/lib/fetch.ts",
        "node_modules/x/index.tsx",
        "test/app.test.tsx",
      ],
      packageJson: NEXT_PACKAGE,
    });
    expect(detection).toEqual({
      roots: ["src/app", "src/components"],
      extensions: ["css", "tsx"],
      platform: "web",
      frameworks: ["next", "react", "tailwind"],
      evidence: [
        "platform web: no native target or cross-platform stack is named",
        "next: package.json names next",
        "react: package.json names react",
        "tailwind: package.json names tailwindcss",
        "roots src/app, src/components: the interface files stand there",
      ],
    });
  });

  it("names a React Native app cross and an Electron app desktop", () => {
    const native = detectInterface({
      files: ["app/index.tsx", "app/components/Row.tsx"],
      packageJson: JSON.stringify({ dependencies: { "react-native": "0.80.0", react: "19.0.0" } }),
    });
    expect([native?.platform, native?.frameworks]).toEqual(["cross", ["react-native", "react"]]);
    const desktop = detectInterface({
      files: ["renderer/index.html", "renderer/style.css", "renderer/components/Bar.jsx"],
      packageJson: JSON.stringify({ devDependencies: { electron: "33.0.0" } }),
    });
    expect([desktop?.platform, desktop?.frameworks]).toEqual(["desktop", ["vanilla"]]);
  });

  it("finds no interface where no framework, configuration, tokens file or components directory says the files are one", () => {
    expect(detectInterface({ files: ["src/index.ts", "README.md"] })).toBeUndefined();
    expect(detectInterface({ files: ["docs/site.css", "docs/page.html"] })).toBeUndefined();
    expect(
      detectInterface({ files: ["docs/site.css", "docs/page.html", "tokens.json"] })?.roots,
    ).toEqual(["docs"]);
  });

  it("makes the whole repository one root where an interface file stands at the root", () => {
    expect(
      detectInterface({
        files: ["index.html", "components/nav.vue"],
        packageJson: JSON.stringify({ dependencies: { vue: "3.5.0" } }),
      })?.roots,
    ).toEqual(["."]);
  });

  it("says a path is an interface file only under a root with an interface extension", () => {
    const roots = ["src/app", "src/components"];
    const extensions = ["css", "tsx"];
    expect(interfaceRootOf("src/components/Button.tsx", roots, extensions)).toBe("src/components");
    expect(interfaceRootOf("src/components/button.ts", roots, extensions)).toBeUndefined();
    expect(interfaceRootOf("src/lib/x.tsx", roots, extensions)).toBeUndefined();
    expect(interfaceRootOf("src/application/x.tsx", roots, extensions)).toBeUndefined();
    // J-143 S3: the practice's home is never under a root, the root `.` included.
    expect(interfaceRootOf("index.html", ["."], ["html"])).toBe(".");
    expect(
      interfaceRootOf(".greenline/visuals/2026-10-27-x/capture-index-html.html", ["."], ["html"]),
    ).toBeUndefined();
    expect(interfaceRootOf(".greenline/ledger/x.html", ["."], ["html"])).toBeUndefined();
    expect(interfaceRootOf("page.css", ["."], extensions)).toBe(".");
  });
});
