/** Prepare the consumer package without ever rewriting the checkout manifest. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadCorpusManifest } from "../src/shell/corpus.ts";
import { dirname, join, resolve } from "node:path";

if (process.argv[2] === "--refuse-root-pack") {
  process.stderr.write(
    "This is the overseer checkout. Run pnpm build, then npm pack ./dist/package. The prepared consumer package has no development scripts or service.\n",
  );
  process.exitCode = 1;
} else {
  const root = resolve("."),
    target = join(root, "dist/package");
  const source = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const fields = [
    "name",
    "version",
    "description",
    "keywords",
    "homepage",
    "license",
    "author",
    "bin",
    "files",
    "type",
    "dependencies",
    "engines",
  ];
  // The package is the public one whichever checkout builds it (the
  // composition plan, D1, D9, D14 and D17): MIT, the public repository for
  // provenance, the site and the public issues.
  const consumer = {
    ...Object.fromEntries(fields.map((field) => [field, source[field]])),
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/fern-works/greenline.git" },
    homepage: "https://fernworks.dev/greenline/",
    bugs: { url: "https://github.com/fern-works/greenline/issues" },
  };
  rmSync(target, { recursive: true, force: true });
  // The licence file is the MIT text with the holder line and the README is
  // the public one: the templates in this checkout, and the root files in the
  // public tree, where the export wrote the same bytes.
  const template = (name) =>
    existsSync(join(root, "scripts/export/templates", name))
      ? join("scripts/export/templates", name)
      : name;
  const licence = template("LICENSE");
  const readme = template("README.md");
  for (const [path, from] of [
    ["README.md", readme],
    ["LICENSE", licence],
    ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
    ["dist/bin/greenline.mjs", "dist/bin/greenline.mjs"],
    ["dist/corpus/installation.json", "dist/corpus/installation.json"],
    // The inspector embeds the Geist fonts in the bundle; their licence travels with it.
    ["assets/inspect-fonts/OFL.txt", "assets/inspect-fonts/OFL.txt"],
  ]) {
    const destination = join(target, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, from), destination);
  }
  // The provenance pages ship and are never installed (the ledger plan's
  // rulings D1 and D2): the ledger index and one page per vendored copy,
  // under provenance/ in the package.
  const manifest = loadCorpusManifest(join(root, "corpus"));
  if (manifest._tag === "err") throw manifest.error;
  mkdirSync(join(target, "provenance"), { recursive: true });
  copyFileSync(join(root, "corpus/ledger/INDEX.md"), join(target, "provenance/INDEX.md"));
  for (const skill of manifest.value.skills)
    if (skill.upstream !== undefined)
      copyFileSync(
        join(root, "corpus/skills", skill.name, "PROVENANCE.md"),
        join(target, "provenance", `${skill.name}.md`),
      );
  // Write the manifest last: an interrupted preparation cannot present a complete package.
  writeFileSync(join(target, "package.json"), JSON.stringify(consumer, null, 2) + "\n");
  process.stdout.write(
    `Prepared ${consumer.name}@${consumer.version} in dist/package; pack with npm pack ./dist/package.\n`,
  );
}
