import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

it("G3 rejects an unexpected packed directory without requiring its name in a denylist", () => {
  const root = mkdtempSync(join(tmpdir(), "greenline-package-"));
  try {
    mkdirSync(join(root, "dist/bin"), { recursive: true });
    mkdirSync(join(root, "unexpected"));
    writeFileSync(join(root, "dist/bin/greenline.mjs"), "export {};\n");
    writeFileSync(join(root, "unexpected/private.txt"), "Maintainer-only bytes.\n");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "greenline-package-fixture",
        version: "0.0.0",
        files: ["dist/bin", "unexpected"],
        dependencies: { commander: "15.0.0", zod: "4.4.3" },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, "../../scripts/check-consumer-package.mjs"), "."],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unexpected/private.txt");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("R6 lets a root file name the workspace glossary homes GLOSSARY.md and GLOSSARY-MAP.md without shipping them", () => {
  const root = mkdtempSync(join(tmpdir(), "greenline-package-"));
  try {
    mkdirSync(join(root, "dist/bin"), { recursive: true });
    writeFileSync(join(root, "dist/bin/greenline.mjs"), "export {};\n");
    writeFileSync(
      join(root, "README.md"),
      "The agent keeps `GLOSSARY.md` and `GLOSSARY-MAP.md` in the workspace; `docs/absent.md` is not shipped.\n",
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "greenline-package-fixture",
        version: "0.0.0",
        files: ["dist/bin", "README.md"],
        dependencies: { commander: "15.0.0", zod: "4.4.3" },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, "../../scripts/check-consumer-package.mjs"), "."],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("GLOSSARY");
    expect(result.stderr).toContain(
      "README.md: package path 'docs/absent.md' is absent from the tarball",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
