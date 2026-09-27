import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fixtureInstallation } from "../fixtures/corpus.ts";
import { compileInstallation } from "../../src/shell/installation.ts";

// Real npm packing is the package boundary; these subprocess cases may exceed 100 ms.
function packageFixture(readme: string, scripts?: { build: string }): string {
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
    build: "tsdown",
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

it("refuses a packed file that names a guidance unit id a publication entry of the ledger names, and only the whole id", () => {
  const records = mkdtempSync(join(tmpdir(), "greenline-leak-records-"));
  writeFileSync(
    join(records, "a-publication.json"),
    JSON.stringify({
      kind: "publication",
      changes: [{ units: [{ id: "example-leaked-unit" }, { id: "example-loops" }] }],
    }),
  );
  writeFileSync(join(records, "a-copy.json"), JSON.stringify({ kind: "copy", changes: [] }));
  const leaked = packageFixture("Read the example-leaked-unit unit.\n");
  const bounded = packageFixture("Read about example-leaked-units and example-loopsmith.\n");
  const audited = (root: string) =>
    spawnSync(
      process.execPath,
      [join(import.meta.dirname, "../../scripts/check-consumer-package.mjs"), root, records],
      { encoding: "utf8" },
    );
  try {
    const refused = audited(leaked);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(
      "README.md: guidance unit identity example-leaked-unit in package",
    );
    expect(audited(bounded).stderr).not.toContain("guidance unit identity");
  } finally {
    for (const path of [records, leaked, bounded]) rmSync(path, { recursive: true, force: true });
  }
});
