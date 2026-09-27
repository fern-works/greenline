#!/usr/bin/env node
/**
 * Check the actual npm payload, including artifacts left by an overseer
 * build: its paths against an exact allowlist, its references, its notices
 * and licences, and, where the repository of record's records and private
 * names stand, that it carries no guidance unit identity and no private
 * name. Then install the tarball into a clean directory and run it there
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
// The leak proof: no packed file names a guidance unit id a publication
// entry of the ledger's chain names. The ids come from the prefix's
// publication records, which only the repository of record holds; the public
// tree (workshop/components/public-export.md) has no records, and its run of
// this script proves the package's shape only. A second argument names
// another records directory, the seam the tests read a fixture through.
const records = process.argv[3]
  ? resolve(process.argv[3])
  : fileURLToPath(new URL("../corpus/ledger/records", import.meta.url));
const unitIds = existsSync(records)
  ? [
      ...new Set(
        readdirSync(records)
          .filter((name) => name.endsWith(".json"))
          .map((name) => JSON.parse(readFileSync(join(records, name), "utf8")))
          .filter((entry) => entry.kind === "publication")
          .flatMap((entry) =>
            entry.changes.flatMap((change) => change.units.map((unit) => unit.id)),
          ),
      ),
    ]
  : undefined;
if (unitIds !== undefined) {
  assert(
    unitIds.length > 0,
    "the ledger's publication entries name no unit; the leak proof has no ids",
  );
  const named = new RegExp(`(?<![a-z0-9-])(${unitIds.join("|")})(?![a-z0-9-])`);
  for (const path of paths) {
    const found = named.exec(read(path));
    assert(found === null, `${path}: guidance unit identity ${found?.[1]} in package`);
  }
}
// The private-name proof: no packed file carries a credential variable, a
// hosting resource's name, a sibling checkout or garden's own package. The
// names live in a file the public tree refuses, so this proof, like the one
// above, runs in the repository of record.
const privateNames = new URL("./lib/private-names.mjs", import.meta.url);
const namesIn = existsSync(fileURLToPath(privateNames))
  ? (await import(privateNames.href)).privateNamesIn
  : undefined;
if (namesIn !== undefined)
  for (const path of paths) {
    const found = namesIn(read(path));
    assert.deepEqual(found, [], `${path}: private names in the package: ${found.join("; ")}`);
  }
const rootFiles = new Set(["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]);
// The inspector's fonts are embedded in the bundle; their licence ships beside it.
const FONT_LICENCE = "assets/inspect-fonts/OFL.txt";
// The provenance pages ship and are never installed (the ledger plan's rulings D1 and D2).
const provenance = (path) => /^provenance\/(INDEX|[a-z][a-z0-9-]*)\.md$/.test(path);
const unexpected = paths.filter(
  (path) =>
    !rootFiles.has(path) &&
    path !== "dist/bin/greenline.mjs" &&
    path !== "dist/corpus/installation.json" &&
    path !== FONT_LICENCE &&
    !provenance(path),
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

/**
 * Install the packed tarball into a clean directory and run it there with
 * the network refused: a preload makes every socket connection, name lookup
 * and fetch of the greenline process fail and leave a mark.
 *
 * With garden disabled, a stand-in `garden` on the PATH leaves a mark if
 * anything starts it and the run's environment holds no key: init, sync,
 * doctor, status and the connectors listing must succeed, with garden
 * reported disabled, no connector entry, no receipt, and neither mark.
 *
 * With garden then enabled against the synthetic garden executable the
 * connector tests own (`test/connectors/fake-garden.mjs`, which answers from
 * the copied contract's fixtures and opens no connection), named by its
 * absolute launcher: enabling installs use-garden, doctor and status report
 * it enabled and ready with no GL0125, one read is recorded in a receipt
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
    for (const command of ["doctor", "status"]) {
      const envelope = JSON.parse(run(command, "--json"));
      assert.equal(envelope.ok, true, `greenline ${command} is not ok in the clean install`);
      assert.deepEqual(
        envelope.connectors.map((connector) => [connector.id, connector.state]),
        [["garden", "disabled"]],
        `greenline ${command} does not report garden disabled`,
      );
      assert.deepEqual(
        envelope.diagnostics.filter((item) => item.code === "GL0125"),
        [],
        `greenline ${command} raises a connector finding with garden disabled`,
      );
    }
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
  for (const command of ["doctor", "status"]) {
    const envelope = JSON.parse(run(command, "--json"));
    assert.equal(envelope.ok, true, `greenline ${command} is not ok with garden enabled`);
    assert.deepEqual(
      envelope.connectors.map((connector) => [connector.state, connector.executable]),
      [["enabled", launcher]],
      `greenline ${command} does not report garden enabled at its launcher`,
    );
    assert.deepEqual(
      envelope.diagnostics.filter((item) => item.code === "GL0125"),
      [],
      `greenline ${command} raises a connector finding with garden enabled and ready`,
    );
  }
  mkdirSync(join(repo, ".greenline/ledger/records"), { recursive: true });
  writeFileSync(
    join(repo, ".greenline/ledger/records/work-one.json"),
    `${JSON.stringify({
      schemaVersion: 3,
      id: "work-one",
      context: "ctx-one",
      actor: "agent",
      role: "maintenance",
      work: null,
      scopes: ["."],
      selections: [],
    })}\n`,
  );
  const body = "Synthetic text: the unit a contract fixture reads.";
  const delivered = run(
    "connectors",
    "call",
    "garden",
    "read",
    "--record",
    "work-one",
    "--id",
    "example-rule",
  );
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
  return "with garden enabled against the synthetic executable, doctor and status reported it ready, one read was recorded in a body-free receipt, and disabling kept the receipt";
}
const enabledRun = runInstalledOffline();

process.stdout.write(
  `Consumer package matches its path allowlist; package-owned document, manifest and import paths resolve; no development scripts are packed; only two runtime dependencies remain; ${
    unitIds !== undefined
      ? `none of the ${unitIds.length} guidance unit ids the ledger's publications name is packed`
      : "the unit-id leak proof runs where the ledger's records stand"
  }; ${
    namesIn !== undefined
      ? "no private name is packed"
      : "the private-name proof runs where its list stands"
  }; installed into a clean directory, init, sync, doctor, status and the connectors listing ran offline with garden disabled, no connection, no garden process and no receipt; ${enabledRun}.\n`,
);
