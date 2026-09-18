#!/usr/bin/env node
/** Check the actual npm payload, including artifacts left by a maintainer build. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { join, posix, resolve } from "node:path";

import { parseInstallation } from "../src/core/installation.ts";
import { loadFixtureSnapshot } from "../src/shell/cabinet.ts";
import { compileInstallation } from "../src/shell/installation.ts";

const directory = resolve(process.argv[2] ?? "dist/package");
const read = (path) => readFileSync(join(directory, path), "utf8");
const pkg = JSON.parse(read("package.json"));
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    cwd: directory,
    shell: process.platform === "win32",
  }),
);
assert.equal(packed.length, 1, "Expected one consumer package");
const paths = packed[0].files.map((file) => file.path);
assert(
  paths.includes("dist/bin/greenline.mjs"),
  "Build the consumer CLI before checking its package",
);
const rootFiles = new Set(["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]);
// The provenance pages ship and are never installed (the ledger plan's rulings D1 and D2).
const provenance = (path) => /^provenance\/(INDEX|[a-z][a-z0-9-]*)\.md$/.test(path);
const unexpected = paths.filter(
  (path) =>
    !rootFiles.has(path) &&
    path !== "dist/bin/greenline.mjs" &&
    path !== "dist/corpus/installation.json" &&
    !provenance(path),
);
assert.deepEqual(unexpected, [], `Unexpected consumer package paths: ${unexpected.join(", ")}`);
for (const field of ["scripts", "devDependencies", "private", "packageManager"])
  assert(
    !(field in pkg),
    `package.json: ${field} belongs to the maintainer checkout, not the consumer package`,
  );
const present = new Set(paths);
function requirePackagePath(owner, target) {
  const clean = target.split(/[?#]/)[0];
  const path = posix.normalize(posix.join(posix.dirname(owner), clean)).replace(/\/$/, "");
  assert(
    path === "." || present.has(path) || paths.some((name) => name.startsWith(path + "/")),
    `${owner}: package path '${target}' is absent from the tarball`,
  );
}
for (const path of Object.values(pkg.bin ?? {})) requirePackagePath("package.json", path);
for (const path of pkg.files ?? []) requirePackagePath("package.json", path);
const external = (path) => /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(path);
const workspace = (path) =>
  /^(?:\.(?:greenline|agents|claude|git|github)\/|AGENTS(?:\.override)?\.md$|CLAUDE\.md$|CONTEXT(?:-MAP)?\.md$)/.test(
    path.replace(/^\.\//, ""),
  );
for (const path of paths) {
  const content = read(path);
  if (rootFiles.has(path) && path !== "package.json") {
    for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g))
      if (!external(match[1])) requirePackagePath(path, match[1]);
    for (const match of content.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
      for (const token of match[1].split(/\s+/)) {
        if (external(token) || workspace(token)) continue;
        if (/[<>{}*]/.test(token)) {
          const prefix = token.split(/[<>{}*]/)[0];
          const directory = prefix.slice(0, prefix.lastIndexOf("/") + 1);
          if (directory !== "") requirePackagePath(path, directory);
          continue;
        }
        if (/\//.test(token) || /\.(?:md|json|mjs|cjs|js|ya?ml|txt)$/.test(token))
          requirePackagePath(path, token);
      }
    }
  } else if (path.endsWith(".mjs")) {
    for (const match of content.matchAll(
      /(?:from\s*|import\s*\(\s*|new URL\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
    ))
      requirePackagePath(path, match[1]);
  }
}
assert.deepEqual(
  Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }).sort(),
  ["commander", "zod"],
  "Consumer runtime dependencies changed",
);
// The package is the public one (the composition plan, D1, D9, D14 and D17):
// MIT with the holder line, the public repository, the site, the public issues.
assert.equal(pkg.license, "MIT", "the consumer manifest's license is MIT");
assert.equal(
  pkg.repository?.url,
  "git+https://github.com/fern-works/greenline.git",
  "the consumer manifest's repository names the public repository, which provenance requires",
);
assert.equal(pkg.homepage, "https://fernworks.dev/greenline/", "the consumer manifest's homepage");
assert.equal(
  pkg.bugs?.url,
  "https://github.com/fern-works/greenline/issues",
  "the consumer manifest's bugs names the public issues",
);
// The packed licence and the packed README are the public ones, byte for
// byte: the templates in this checkout, the root files in the public tree.
for (const name of ["LICENSE", "README.md"]) {
  const source = existsSync(join("scripts/export/templates", name))
    ? join("scripts/export/templates", name)
    : name;
  assert.equal(
    read(name),
    readFileSync(source, "utf8"),
    `the packed ${name} is not ${source} byte for byte`,
  );
}
assert(paths.includes("dist/corpus/installation.json"), "Missing installation payload");
const installed = parseInstallation(read("dist/corpus/installation.json"), "packed installation");
assert.equal(
  installed._tag,
  "ok",
  "Packed installation must contain only the current method/runtime contract",
);
const source = compileInstallation("corpus");
assert.equal(source._tag, "ok", "Current method composition must compile");
assert.deepEqual(installed, source, "Rebuild: packed methods differ from current composition");
const notices = read("THIRD_PARTY_NOTICES.md");
assert.equal(installed.value.notices, notices, "Installed and packaged source notices differ");
const manifest = JSON.parse(readFileSync("corpus/manifest.json", "utf8"));
const noticeRows = new Map(
  [...notices.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(.+?)\s*\|$/gm)].map((match) => [
    match[1],
    match[2],
  ]),
);
assert.deepEqual(
  [...noticeRows.keys()].sort(),
  manifest.upstreams.map((upstream) => upstream.name).sort(),
  "Source families and packed notices differ",
);
for (const upstream of manifest.upstreams) {
  const row = noticeRows.get(upstream.name);
  const methods = row.split("|").at(-1);
  assert.deepEqual(
    [...methods.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((match) => match[1]).sort(),
    manifest.skills
      .filter((skill) => skill.upstream?.family === upstream.name)
      .map((skill) => skill.name)
      .sort(),
    `${upstream.name}: notices must map every distributed method to its source terms`,
  );
  assert(
    row.includes(upstream.repo) && row.includes(upstream.commit),
    `${upstream.name}: source or revision missing from notices`,
  );
  const licencePath = join("corpus", upstream.snapshot, "LICENSE");
  if (existsSync(licencePath)) {
    const license = readFileSync(licencePath, "utf8");
    const copyright = /^Copyright.*$/m.exec(license)?.[0];
    const start = license.indexOf("Permission is hereby granted");
    assert(start >= 0, `${upstream.name}: preserved MIT permission text is missing`);
    const permission = license.slice(start).trim();
    assert(
      copyright && row.includes("MIT") && row.includes(copyright) && notices.includes(permission),
      `${upstream.name}: preserved MIT copyright or terms missing`,
    );
  } else {
    assert(
      upstream.holder && row.includes("MIT") && row.includes(upstream.holder),
      `${upstream.name}: copyright line missing from notices`,
    );
  }
}
// Every vendored copy's provenance page and the index ship byte for byte as the corpus holds them.
assert(paths.includes("provenance/INDEX.md"), "Missing the ledger index under provenance/");
assert.equal(
  read("provenance/INDEX.md"),
  readFileSync("corpus/ledger/INDEX.md", "utf8"),
  "Rebuild: the packed ledger index differs from the corpus",
);
for (const skill of manifest.skills) {
  if (skill.upstream === undefined) continue;
  const page = `provenance/${skill.name}.md`;
  assert(paths.includes(page), `${skill.name}: provenance page missing from the package`);
  assert.equal(
    read(page),
    readFileSync(join("corpus/skills", skill.name, "PROVENANCE.md"), "utf8"),
    `${skill.name}: the packed provenance page differs from the corpus`,
  );
}
for (const path of paths.filter(provenance))
  assert(
    manifest.skills.some(
      (skill) => skill.upstream !== undefined && `provenance/${skill.name}.md` === path,
    ) || path === "provenance/INDEX.md",
    `${path}: not a vendored copy's provenance page`,
  );
for (const path of paths)
  assert(!read(path).includes("corpus/units"), `${path}: authoring unit path in package`);
// The leak proof needs the paid half: the unit bodies and the frozen claim
// identities, which only this checkout holds. The public tree
// (workshop/components/public-export.md) has neither, and its run of this
// script proves the package's shape only; the private gate proves the leak.
const paidInputs = ["corpus/units", "corpus/sources/reshape-claims.jsonl"].map((path) =>
  existsSync(path),
);
const paidHalf = paidInputs.every(Boolean);
assert(
  paidHalf || paidInputs.every((present) => !present),
  "the leak proof's inputs are partly present: corpus/units and corpus/sources/reshape-claims.jsonl stand together or not at all",
);
if (paidHalf) {
  const knowledge = loadFixtureSnapshot("corpus/units");
  assert.equal(knowledge._tag, "ok", "Unit inventory must load for the content audit");
  const claimIds = readFileSync("corpus/sources/reshape-claims.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).id);
  const forbidden = [...knowledge.value.units.values()]
    .flatMap((unit) => [unit.id, unit.body.trim(), JSON.stringify(unit.body.trim()).slice(1, -1)])
    .filter(Boolean);
  for (const path of paths) {
    const content = read(path);
    for (const needle of forbidden)
      assert(
        !content.includes(needle),
        `${path}: guidance unit identity or body in package (${needle.slice(0, 80)})`,
      );
    for (const id of claimIds)
      assert(!content.includes(id), `${path}: frozen claim identity ${id} in package`);
  }
}
process.stdout.write(
  paidHalf
    ? "Consumer package matches its path allowlist; package-owned document, manifest and import paths resolve; no development scripts, unit bodies/ids or frozen claim ids are packed; only two runtime dependencies remain.\n"
    : "Consumer package matches its path allowlist; package-owned document, manifest and import paths resolve; no development scripts are packed; only two runtime dependencies remain. The leak proof over the unit bodies and the frozen claim identities runs in the private checkout only.\n",
);
