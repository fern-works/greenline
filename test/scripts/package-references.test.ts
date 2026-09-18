import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

// Real npm packing is the package boundary; these subprocess cases may exceed 100 ms.
function packageFixture(readme: string, scripts?: { cabinet: string }): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-packed-paths-"));
  mkdirSync(join(root, "dist/bin"), { recursive: true });
  mkdirSync(join(root, "dist/corpus"), { recursive: true });
  writeFileSync(join(root, "dist/bin/greenline.mjs"), "export {};\n");
  writeFileSync(join(root, "dist/corpus/installation.json"), JSON.stringify(fixtureInstallation()));
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    writeFileSync(join(root, name), "Fixture terms.\n");
  writeFileSync(join(root, "README.md"), readme);
  const pkg = {
    name: "greenline-fixture",
    version: "0.1.0",
    files: ["dist/bin", "dist/corpus", "THIRD_PARTY_NOTICES.md"],
    bin: { greenline: "dist/bin/greenline.mjs" },
    dependencies: { commander: "15.0.0", zod: "4.4.3" },
  };
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(scripts === undefined ? pkg : { ...pkg, scripts }),
  );
  return root;
}
function audit(root: string) {
  return spawnSync(
    process.execPath,
    [join(import.meta.dirname, "../../scripts/check-consumer-package.mjs"), root],
    { encoding: "utf8" },
  );
}

it.each([
  ["See [the charter](CHARTER.md).", "CHARTER.md"],
  ["Permissions are under `docs/acquisitions/`.", "docs/acquisitions/"],
])("G3 refuses a packed document that points outside its package: %s", (text, missing) => {
  const root = packageFixture(text);
  try {
    const result = audit(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("README.md");
    expect(result.stderr).toContain(missing);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("G3 refuses development scripts in the consumer manifest", () => {
  const root = packageFixture("# Fixture\n", {
    cabinet: "node dist/cabinet/greenline-cabinet.mjs",
  });
  try {
    const result = audit(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("scripts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("G3 checks the real package prefix before accepting a placeholder path", () => {
  const root = packageFixture("Sources live under `corpus/upstream/<family>/<commit>/`.\n");
  try {
    const installed = compileInstallation("corpus");
    if (installed._tag === "err") throw installed.error;
    writeFileSync(join(root, "dist/corpus/installation.json"), JSON.stringify(installed.value));
    writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), readFileSync("THIRD_PARTY_NOTICES.md"));
    const result = audit(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "README.md: package path 'corpus/upstream/' is absent from the tarball",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
