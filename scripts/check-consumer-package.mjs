#!/usr/bin/env node
/**
 * Check the actual npm payload, including artifacts left by an overseer
 * build: its paths against an exact allowlist, its references, its notices
 * and licences, and, where the repository of record's private names and
 * frozen guidance unit identities stand, that it carries neither. Then install the tarball into a clean directory and run it there
 * offline: with garden disabled, every network connection refused, no garden
 * process started and no receipt written; then, where a POSIX launcher can
 * run the synthetic garden executable beside this script, with garden
 * enabled against it. A garden-enabled half that cannot run is named in the
 * last line as not run, and the gate's row reports it as a skip.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseInstallation } from "../src/core/installation.ts";
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
// The private names and the guidance unit identities live in files the
// public tree refuses (workshop/components/public-export.md), so the two
// proofs below run in the repository of record, and the public tree's run of
// this script proves the package's shape only.
const privateNames = new URL("./lib/private-names.mjs", import.meta.url);
const privateList = existsSync(fileURLToPath(privateNames))
  ? await import(privateNames.href)
  : undefined;
// The leak proof: no packed file names a guidance unit id the old ledger's
// publication entries named, frozen beside the private names. A second
// argument names another JSON list of ids, the seam the tests read a
// fixture through.
const unitIds = process.argv[3]
  ? JSON.parse(readFileSync(resolve(process.argv[3]), "utf8"))
  : privateList?.publicationUnitIds();
if (unitIds !== undefined) {
  assert(unitIds.length > 0, "the frozen list names no guidance unit; the leak proof has no ids");
  const named = new RegExp(`(?<![a-z0-9-])(${unitIds.join("|")})(?![a-z0-9-])`);
  for (const path of paths) {
    const found = named.exec(read(path));
    assert(found === null, `${path}: guidance unit identity ${found?.[1]} in package`);
  }
}
// The private-name proof: no packed file carries a credential variable, a
// hosting resource's name, a sibling checkout or garden's own package.
const namesIn = privateList?.privateNamesIn;
if (namesIn !== undefined)
  for (const path of paths) {
    const found = namesIn(read(path));
    assert.deepEqual(found, [], `${path}: private names in the package: ${found.join("; ")}`);
  }
const rootFiles = new Set(["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]);
// The inspector's fonts are embedded in the bundle; their licence ships beside it.
const FONT_LICENCE = "assets/inspect-fonts/OFL.txt";
// The ledger's index ships and is never installed (the ledger plan's rulings D1 and D2).
const LEDGER_INDEX = "provenance/INDEX.md";
const unexpected = paths.filter(
  (path) =>
    !rootFiles.has(path) &&
    path !== "dist/bin/greenline.mjs" &&
    path !== "dist/corpus/installation.json" &&
    path !== FONT_LICENCE &&
    path !== LEDGER_INDEX,
);
assert.deepEqual(unexpected, [], `Unexpected consumer package paths: ${unexpected.join(", ")}`);
for (const field of ["scripts", "devDependencies", "private", "packageManager"])
  assert(
    !(field in pkg),
    `package.json: ${field} belongs to the overseer checkout, not the consumer package`,
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
  /^(?:\.(?:greenline|agents|claude|git|github)\/|AGENTS(?:\.override)?\.md$|CLAUDE\.md$|GLOSSARY(?:-MAP)?\.md$)/.test(
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
assert(paths.includes(FONT_LICENCE), "Missing the inspector fonts' licence");
assert.equal(
  read(FONT_LICENCE),
  readFileSync(FONT_LICENCE, "utf8"),
  `the packed ${FONT_LICENCE} is not the repository's licensed copy byte for byte`,
);
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
// The notices list the sources a recipe takes from or credits
// (workshop/components/ledger.md, "The views"), not every pin: a source pinned
// for the intake that no recipe names yet ships nothing. The modes recipe is
// the definition's and names no source (workshop/components/recipes.md).
const recipes = readdirSync("corpus/recipes")
  .filter((file) => file.endsWith(".json") && file !== "modes.json")
  .map((file) => JSON.parse(readFileSync(join("corpus/recipes", file), "utf8")));
const named = new Set(recipes.flatMap((recipe) => recipe.sources));
assert.deepEqual(
  [...noticeRows.keys()].sort(),
  manifest.sources
    .map((pinned) => pinned.name)
    .filter((name) => named.has(name))
    .sort(),
  "The sources the recipes name and the packed notices differ",
);
for (const pinned of manifest.sources.filter((source) => named.has(source.name))) {
  const row = noticeRows.get(pinned.name);
  const methods = row.split("|").at(-1);
  assert.deepEqual(
    [...methods.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((match) => match[1]).sort(),
    // A combined skill takes from several sources (S13 of the plan
    // modes-records-recipes), so each source's skills are the recipes that
    // name it, not the one upstream a copy's manifest entry states.
    recipes
      .filter((recipe) => recipe.sources.includes(pinned.name))
      .map((recipe) => recipe.name)
      .sort(),
    `${pinned.name}: notices must map every distributed method to its source terms`,
  );
  assert(
    row.includes(pinned.repo) && row.includes(pinned.commit),
    `${pinned.name}: source or revision missing from notices`,
  );
  const licencePath = join("corpus", pinned.snapshot, "LICENSE");
  if (existsSync(licencePath)) {
    const license = readFileSync(licencePath, "utf8");
    const copyright = /^Copyright.*$/m.exec(license)?.[0];
    const start = license.indexOf("Permission is hereby granted");
    assert(start >= 0, `${pinned.name}: preserved MIT permission text is missing`);
    const permission = license.slice(start).trim();
    assert(
      copyright && row.includes("MIT") && row.includes(copyright) && notices.includes(permission),
      `${pinned.name}: preserved MIT copyright or terms missing`,
    );
  } else {
    assert(
      pinned.holder && row.includes("MIT") && row.includes(pinned.holder),
      `${pinned.name}: copyright line missing from notices`,
    );
  }
}
// The fresh chain's index ships byte for byte as the corpus holds it.
assert(paths.includes("provenance/INDEX.md"), "Missing the ledger index under provenance/");
assert.equal(
  read("provenance/INDEX.md"),
  readFileSync("corpus/ledger/INDEX.md", "utf8"),
  "Rebuild: the packed ledger index differs from the corpus",
);

/**
 * Install the packed tarball into a clean directory and run it there with
 * the network refused: a preload makes every socket connection, name lookup
 * and fetch of the greenline process fail and leave a mark.
 *
 * With garden disabled, a stand-in `garden` on the PATH leaves a mark if
 * anything starts it and the run's environment holds no key: init, sync,
 * status and the connectors listing must succeed, with garden
 * reported disabled, no connector entry, no receipt, and neither mark.
 *
 * With garden then enabled against the synthetic garden executable the
 * connector tests own (`test/connectors/fake-garden.mjs`, which answers from
 * the copied contract's fixtures and opens no connection), named by its
 * absolute launcher: enabling installs use-garden, status reports it
 * enabled and ready with no GL0125, one read is recorded in a receipt
 * that keeps no body while the body reaches the caller, and disabling
 * removes the skill and keeps the receipt. The network mark and the
 * stand-in's mark must still be absent. The enabled run needs a POSIX
 * launcher and the synthetic executable beside this script; where either is
 * missing it is named as not run, never passed.
 */
function runInstalledOffline() {
  const scratch = mkdtempSync(join(tmpdir(), "greenline-consumer-"));
  try {
    const pack = JSON.parse(
      execFileSync(
        "npm",
        ["pack", directory, "--json", "--ignore-scripts", "--pack-destination", scratch],
        { encoding: "utf8", shell: process.platform === "win32" },
      ),
    );
    const tarball = join(scratch, pack[0].filename);
    const install = join(scratch, "install");
    mkdirSync(install);
    writeFileSync(join(install, "package.json"), '{ "name": "consumer", "private": true }\n');
    execFileSync(
      "npm",
      [
        "install",
        tarball,
        "--prefer-offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
      ],
      { cwd: install, encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" },
    );
    const modules = readdirSync(join(install, "node_modules")).filter(
      (name) => !name.startsWith("."),
    );
    assert.deepEqual(
      modules.sort(),
      ["commander", "greenline", "zod"],
      "the clean install holds greenline and its two dependencies only",
    );
    const cli = join(install, "node_modules/greenline", pkg.bin.greenline);
    const marks = join(scratch, "marks");
    mkdirSync(marks);
    const offline = join(scratch, "offline.mjs");
    writeFileSync(
      offline,
      [
        'import { appendFileSync } from "node:fs";',
        'import dns from "node:dns";',
        'import net from "node:net";',
        `const mark = (what) => { appendFileSync(${JSON.stringify(join(marks, "network"))}, what + "\\n"); throw new Error("greenline reached for the network: " + what); };`,
        'net.Socket.prototype.connect = function () { mark("socket"); };',
        'dns.lookup = () => mark("lookup");',
        'dns.promises.lookup = async () => mark("lookup");',
        'globalThis.fetch = async () => mark("fetch");',
        "",
      ].join("\n"),
    );
    const bin = join(scratch, "bin");
    mkdirSync(bin);
    const garden = join(bin, process.platform === "win32" ? "garden.cmd" : "garden");
    writeFileSync(garden, `#!/bin/sh\necho started >> "${join(marks, "garden")}"\n`);
    chmodSync(garden, 0o755);
    const repo = join(scratch, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !/^(GREENLINE_|GARDEN_)/i.test(name) && !/^NODE_OPTIONS$/i.test(name),
      ),
    );
    let extra = {};
    const run = (...args) => {
      const result = spawnSync(
        process.execPath,
        ["--import", pathToFileURL(offline).href, cli, ...args],
        { cwd: repo, encoding: "utf8", env: { ...environment, ...extra, PATH: bin } },
      );
      assert.equal(
        result.status,
        0,
        `greenline ${args.join(" ")} failed in the clean install: ${result.stderr}${result.stdout}`,
      );
      return result.stdout;
    };
    assert.match(run("--version"), new RegExp(`^${pkg.version.replaceAll(".", "\\.")}`));
    for (const command of [
      ["init", "--yes", "--json"],
      ["sync", "--json"],
    ])
      assert.equal(JSON.parse(run(...command)).ok, true, `greenline ${command[0]} is not ok`);
    const disabled = JSON.parse(run("status", "--json"));
    assert.equal(disabled.ok, true, "greenline status is not ok in the clean install");
    assert.deepEqual(
      disabled.connectors.map((connector) => [connector.id, connector.state]),
      [["garden", "disabled"]],
      "greenline status does not report garden disabled",
    );
    assert.deepEqual(
      disabled.diagnostics.filter((item) => item.code === "GL0125"),
      [],
      "greenline status raises a connector finding with garden disabled",
    );
    assert.deepEqual(
      JSON.parse(run("connectors", "list", "--json")).connectors.map((c) => c.state),
      ["disabled"],
    );
    const workspaceManifest = JSON.parse(
      readFileSync(join(repo, ".greenline/manifest.json"), "utf8"),
    );
    assert.deepEqual(
      workspaceManifest.connectors ?? {},
      {},
      "a fresh install enables no connector",
    );
    const receipts = join(repo, ".greenline/ledger/receipts");
    assert(
      !existsSync(receipts) || readdirSync(receipts).length === 0,
      "a fresh install with garden disabled wrote a receipt",
    );
    assert(!existsSync(join(marks, "network")), "greenline reached for the network offline");
    assert(!existsSync(join(marks, "garden")), "greenline started a garden process");
    return runEnabled(
      scratch,
      repo,
      run,
      (variables) => {
        extra = variables;
      },
      marks,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The enabled half of the offline run; returns what it proved, or why it did not run. */
function runEnabled(scratch, repo, run, setEnvironment, marks) {
  const fake = fileURLToPath(new URL("../test/connectors/fake-garden.mjs", import.meta.url));
  if (process.platform === "win32")
    return "the garden-enabled run was not run: its launcher is a POSIX shell script";
  if (!existsSync(fake))
    return "the garden-enabled run was not run: the synthetic garden executable is not beside this script";
  const gardenBin = join(scratch, "garden-bin");
  mkdirSync(gardenBin);
  const launcher = join(gardenBin, "garden");
  writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  chmodSync(launcher, 0o755);
  // A synthetic key: garden reads it; greenline checks its presence and never reads it.
  setEnvironment({ GARDEN_API_KEY: "synthetic-key-for-the-package-check" });
  const endpoint = "https://garden.example/";
  assert.equal(
    JSON.parse(
      run("connectors", "enable", "garden", "--url", endpoint, "--executable", launcher, "--json"),
    ).ok,
    true,
    "enabling garden against the synthetic executable is not ok",
  );
  for (const tree of [".agents", ".claude"])
    assert(
      existsSync(join(repo, tree, "skills/use-garden/SKILL.md")),
      `enabling garden did not install use-garden under ${tree}`,
    );
  const enabled = JSON.parse(run("status", "--json"));
  assert.equal(enabled.ok, true, "greenline status is not ok with garden enabled");
  assert.deepEqual(
    enabled.connectors.map((connector) => [connector.state, connector.executable]),
    [["enabled", launcher]],
    "greenline status does not report garden enabled at its launcher",
  );
  assert.deepEqual(
    enabled.diagnostics.filter((item) => item.code === "GL0125"),
    [],
    "greenline status raises a connector finding with garden enabled and ready",
  );
  const body = "Synthetic text: the unit a contract fixture reads.";
  // A question's consultation: a request no change owns.
  const delivered = run("connectors", "call", "garden", "read", "--id", "example-rule");
  assert(delivered.includes(body), "the read's body did not reach the caller");
  const receipts = join(repo, ".greenline/ledger/receipts");
  const files = existsSync(receipts) ? readdirSync(receipts) : [];
  assert.equal(files.length, 1, "the read did not leave exactly one receipt");
  const receipt = readFileSync(join(receipts, files[0]), "utf8");
  const request = JSON.parse(receipt);
  assert.equal(request.source, "garden", "the receipt does not name garden");
  assert.deepEqual(
    request.receipts.map((entry) => [entry.operation, entry.outcome]),
    [["read", "received"]],
    "the receipt does not record one received read",
  );
  assert(!receipt.includes(body) && !receipt.includes('"content"'), "the receipt keeps a body");
  assert.equal(
    JSON.parse(run("connectors", "disable", "garden", "--json")).ok,
    true,
    "disabling garden is not ok",
  );
  for (const tree of [".agents", ".claude"])
    assert(
      !existsSync(join(repo, tree, "skills/use-garden")),
      `disabling garden left use-garden installed under ${tree}`,
    );
  assert.equal(
    readFileSync(join(receipts, files[0]), "utf8"),
    receipt,
    "disabling garden changed its receipt",
  );
  assert(!existsSync(join(marks, "network")), "greenline reached for the network offline");
  assert(!existsSync(join(marks, "garden")), "greenline started the stand-in garden on the PATH");
  return "with garden enabled against the synthetic executable, status reported it ready, one read was recorded in a body-free receipt, and disabling kept the receipt";
}
const enabledRun = runInstalledOffline();

process.stdout.write(
  `Consumer package matches its path allowlist; package-owned document, manifest and import paths resolve; no development scripts are packed; only two runtime dependencies remain; ${
    unitIds !== undefined
      ? `none of the ${unitIds.length} guidance unit ids the old ledger's publications named is packed`
      : "the unit-id leak proof runs where the frozen list stands"
  }; ${
    namesIn !== undefined
      ? "no private name is packed"
      : "the private-name proof runs where its list stands"
  }; installed into a clean directory, init, sync, status and the connectors listing ran offline with garden disabled, no connection, no garden process and no receipt; ${enabledRun}.\n`,
);
