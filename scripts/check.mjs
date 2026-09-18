#!/usr/bin/env node
/** THE CHECK GATE (docs/CODE-STANDARDS.md §10). Honest rows: each row
 * PASSES, FAILS, or SKIPS with a named reason. A skip is never a pass —
 * the summary says exactly what was and was not proven. */
import { execFileSync, execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { GREEN_LINE, outcome, skip } from "./lib/gate-outcome.mjs";
import { checkCommit, parseCommits, walkPlan } from "./lib/commit-subject.mjs";
import { nameLeaks, scannedFile } from "./lib/name-boundary.mjs";
import { join, sep } from "node:path";

const ASSET_TREE_MIN = 2;
const full = process.argv.includes("--full");
// The public tree (workshop/components/public-export.md): under --public,
// the rows named here run and every other row is left out, since the tree
// holds the kept set only; the rows outside the set fetch the workshop's
// modules when they run, so the public copy of this script loads none.
const publicOnly = process.argv.includes("--public");
const PUBLIC_ROWS = new Set([
  "forbidden-tokens",
  "token-families",
  "corpus-em-dashes",
  "env-boundary",
  "name-boundary",
  "goldens-tracked",
  "managed-block-budget",
  "corpus-coherence",
  "skills-handoff",
  "corpus-optin-assets",
  "corpus-optin-closure",
  "commit-subject",
  "tsdown-build",
  "typecheck",
  "oxlint",
  "oxfmt",
  "vitest",
  "depcruise",
  "consumer-package",
]);
const inRepository = () => existsSync(".git");
// The toolchain rows, registered below in one loop: name, command, whether
// sources are needed. Named here so the gate-row-names row can read them.
const TOOLCHAIN_ALL = [
  ["typecheck", "tsc -p tsconfig.json", false, "fast"],
  ["oxlint", "oxlint .", false, "fast"],
  ["oxfmt", "oxfmt --check .", false, "fast"],
  [
    "vitest",
    full ? "vitest run --coverage --passWithNoTests" : "vitest run --passWithNoTests",
    false,
    "fast",
  ],
  ["depcruise", "depcruise src --config .dependency-cruiser.cjs", true, "fast"],
  ["knip", "knip", true, "full"],
  ["jscpd", "jscpd src", true, "full"],
];
const TOOLCHAIN_ROWS = TOOLCHAIN_ALL.filter(([, , , tier]) => full || tier === "fast");
const rows = [];
const row = async (name, fn) => {
  if (publicOnly && !PUBLIC_ROWS.has(name)) return;
  process.stdout.write(`… ${name}\n`);
  const t0 = Date.now();
  const dt = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  try {
    const o = outcome(await fn());
    rows.push([name, o.status, o.reason]);
    process.stdout.write(`  ✓ ${name} ${o.status === "SKIP" ? "SKIP" : "ok"} (${dt()})\n`);
  } catch (e) {
    rows.push([name, "FAIL", String(e.message ?? e)]);
    process.stdout.write(`  ✗ ${name} failed (${dt()})\n`);
  }
};
const files = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e === ".git" || e === "node_modules" || e === "dist" || e === "coverage") continue;
      // The frozen authority witnesses are the bytes the ledger entries
      // hash, never house source (workshop/components/ledger.md).
      if (d === "corpus/ledger" && e === "witnesses") continue;
      // The acquisition library of external bytes (books, sweep clones) lives
      // beside this checkout at ../greenline-library since the composition
      // plan's D16; a checkout that still carries one under library/ is
      // skipped here as before, since no gate row reads those bytes as house
      // source (the kotlin sweep's clones tripped two sweeps).
      if (d === "." && e === "library") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p.split(sep).join("/"));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
};
// Tooling territory and the vendored pack are exempt from source sweeps
// (docs/CODE-STANDARDS.md §11); this gate file may name the tokens it bans.
const SWEEP_EXEMPT = (f) =>
  f.startsWith(".agents/") ||
  f.startsWith(".claude/") ||
  f.startsWith("tools/oxlint/anti-slop/") ||
  f === "scripts/check.mjs";

// ROW: the forbidden-token sweep — test tells (docs/CODE-STANDARDS.md §8)
await row("forbidden-tokens", () => {
  const testTells = [/\.only\(/, /\.skip\(/, /\bxit\(/, /\bxdescribe\(/];
  for (const f of files(".")) {
    if (!/\.test\.(ts|mts)$/.test(f) || SWEEP_EXEMPT(f)) continue;
    const s = readFileSync(f, "utf8");
    for (const b of testTells)
      if (b.test(s)) throw new Error(`${f} carries a focused/skipped test ${b}`);
    if (/\bvi\.mock\(/.test(s))
      throw new Error(`${f} module-mocks (the no-module-mocking law; grep backstop)`);
    if (/expect\(true\)\.toBe\(true\)/.test(s))
      throw new Error(`${f} carries a trivially-true assertion (TELL 4)`);
    if (/setTimeout\([^,]*,\s*[0-9]{3,}/.test(s)) throw new Error(`${f} sleeps in a test (TELL 7)`);
  }
  for (const f of files(".")) {
    if (!/\.(ts|mts|mjs)$/.test(f) || SWEEP_EXEMPT(f)) continue;
    if (/\beval\(/.test(readFileSync(f, "utf8"))) throw new Error(`${f} carries a forbidden eval(`);
  }
});
// ROW: the token families (docs/CODE-STANDARDS.md §10)
await row("token-families", () => {
  for (const f of files(".")) {
    if (!/\.(ts|mts)$/.test(f) || SWEEP_EXEMPT(f)) continue;
    const s = readFileSync(f, "utf8");
    if (/@ts-ignore\b/.test(s))
      throw new Error(`${f}: @ts-ignore is forbidden (use @ts-expect-error w/ description)`);
    if (/@ts-expect-error\s*$/m.test(s))
      throw new Error(`${f}: @ts-expect-error without description`);
    if (/(oxlint|eslint)-disable(?!.*SAFETY)/.test(s))
      throw new Error(`${f}: lint-disable without a SAFETY tail`);
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(s)) throw new Error(`${f}: empty catch block`);
    if (f.startsWith("src/")) {
      if (/\bconsole\.log\(/.test(s)) throw new Error(`${f}: console.log in src/`);
      if (/\b(TODO|FIXME)\b(?!\()/.test(s)) throw new Error(`${f}: TODO/FIXME without (owner)`);
      if (/\/(utils|helpers|common)\.(ts|mts)$/.test(f) || /\/(utils|helpers|common)\//.test(f))
        throw new Error(`${f}: utils/helpers/common naming refused`);
    }
  }
});
// ROW: greenline-authored corpus prose practices the unslop catalog it ships
// (ADR 0010): no em dash in the runtime guides, the native skills, or the
// lines greenline added to a vendored copy (ADR 0039). Upstream lines keep
// their authors' punctuation.
await row("corpus-em-dashes", () => {
  execFileSync(process.execPath, ["scripts/check-corpus-prose.mjs", "em-dashes"], {
    encoding: "utf8",
  });
});
await row("publication-validation", () => {
  execFileSync(process.execPath, ["scripts/check-publication.mjs"], { encoding: "utf8" });
});
// ROW: env boundary — process.env is shell-only (docs/CODE-STANDARDS.md §4)
await row("env-boundary", () => {
  for (const f of files("src")) {
    if (!/\.(ts|mts)$/.test(f)) continue;
    if (/^src\/shell\//.test(f)) continue;
    if (readFileSync(f, "utf8").includes("process.env"))
      throw new Error(
        `native env read outside src/shell/: ${f} (route it through the shell's typed config)`,
      );
  }
});
// ROW: the workshop roster — the authored tree under workshop/skills/ is the
// source; the two mounts are byte-identical copies and the front door's
// owned region is the rendered roster; every craft has a row in the door's
// table and every row names a craft; every directory carries one of the
// three kinds (step 3, rulings 4 and 5; step 6, ruling 2; step 1, ruling 6).
await row("workshop-roster", async () => {
  const { checkAll: checkWorkshop } = await import("./skills-sync.mjs");
  const problems = checkWorkshop(".");
  if (problems.length) throw new Error(`workshop out of sync: ${problems.slice(0, 8).join("; ")}`);
});
// ROW: the name boundary (J-4, the ruling of 2026-09-14): the workshop's
// agent, the Fernworks agent, is named in no product file. Every text file
// under corpus/ and src/ is read, whatever its format; the frozen outside
// bytes under corpus/upstream/ and corpus/sources/ are records, not house
// prose, and are not read (scripts/lib/name-boundary.mjs decides both).
await row("name-boundary", () => {
  const pages = [...files("corpus"), ...files("src")]
    .filter(scannedFile)
    .map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const problems = nameLeaks(pages);
  if (problems.length) {
    throw new Error(
      `the workshop's agent named in the product: ${problems.slice(0, 8).join("; ")}`,
    );
  }
});
// ROW: every golden file on disk is tracked (CI on main was red for weeks:
// the scratch rule `tmp/` hid each golden's managed .greenline/tmp/.gitignore
// from git, so the checkout lacked a file the goldens test expects while
// every local tree had it).
await row("goldens-tracked", () => {
  if (!inRepository()) return skip("no git repository here (a built public tree)");
  const tracked = new Set(
    execFileSync("git", ["ls-files", "test/goldens"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean),
  );
  const untracked = files("test/goldens").filter(
    (f) => !tracked.has(f) && !f.endsWith(".DS_Store"),
  );
  if (untracked.length > 0)
    throw new Error(`golden files on disk but not in git: ${untracked.slice(0, 5).join(", ")}`);
});
// ROW: every live plan's stages carry the ruled grammar: a done stage its
// range and its close block (gate at the range's result, review, reconcile),
// a stage in review its reconcile and no range, an unfinished stage none of
// them (docs/work/README.md; the second refactor's rulings 16 and 48).
await row("plan-stages", async () => {
  const { checkStages, livePlans } = await import("./lib/plan-stages.mjs");
  const board = "docs/work/BOARD.md";
  if (!existsSync(board)) return skip("no board yet");
  const bad = [];
  for (const plan of livePlans(board)) {
    if (!existsSync(plan)) {
      bad.push(`${board}: live plan ${plan} does not exist`);
      continue;
    }
    bad.push(...checkStages(plan, readFileSync(plan, "utf8")));
  }
  if (bad.length > 0)
    throw new Error(`plan stages refused ${bad.length}: ${bad.slice(0, 6).join("; ")}`);
});
// ROW: the board agrees with the files it describes: every plan under
// docs/work/ and every live card has its line with the right stage or
// status, nothing done stays live, every sealed file is indexed and done,
// no id is reused (docs/work/README.md; rulings 48 and 49).
await row("board", async () => {
  const { checkBoard, checkCards } = await import("./lib/board.mjs");
  const board = "docs/work/BOARD.md";
  if (!existsSync(board)) return skip("no board yet");
  const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  const own = new Set(["README.md", "BOARD.md", "JOBS.md", "NOTES.md"]);
  const plans = readdirSync("docs/work")
    .filter((e) => e.endsWith(".md") && !own.has(e))
    .map((e) => ({ path: `docs/work/${e}`, slug: e.slice(0, -3), text: read(`docs/work/${e}`) }));
  const archive = (existsSync("docs/work/archive") ? readdirSync("docs/work/archive") : [])
    .filter((e) => e.endsWith(".md") && e !== "README.md")
    .map((e) => ({ path: `docs/work/archive/${e}`, text: read(`docs/work/archive/${e}`) }));
  const bad = [
    ...checkCards("docs/work/JOBS.md", read("docs/work/JOBS.md")),
    ...checkBoard({
      board: read(board),
      jobs: read("docs/work/JOBS.md"),
      archiveIndex: read("docs/work/archive/README.md"),
      plans,
      archive,
    }),
  ];
  if (bad.length > 0) throw new Error(`board refused ${bad.length}: ${bad.slice(0, 6).join("; ")}`);
});
// ROW: the dev policy size — AGENTS.md is measured and reported; the cap is
// an extreme one that catches runaway growth, never a target (the operator's
// ruling of 2026-09-12: semantic prose carries no word budget).
// ROW: the site builds from the guide — greenline.dev's docs are
// generated from guide/*.md (the single source of truth); a guide
// edit that breaks the build or a link fails here, not in deploy.
// ROW: the inspector's fonts module is generated from the site's font
// files; the row renders the generator's output in memory and refuses
// drift, which the generator's header promised since ADR 0028 and no row
// had done (the map's mismatch 6).
await row("inspect-fonts", async () => {
  const { renderInspectFonts } = await import("./gen-inspect-fonts.mjs");
  const fonts = ["site/assets/geist-var.woff2", "site/assets/geist-mono-var.woff2"].filter(
    (f) => !existsSync(f),
  );
  if (fonts.length) return skip(`site font files missing: ${fonts.join(", ")}`);
  const expected = renderInspectFonts(".");
  const actual = existsSync("src/shell/inspect/fonts.ts")
    ? readFileSync("src/shell/inspect/fonts.ts", "utf8")
    : "";
  if (expected !== actual)
    throw new Error(
      "src/shell/inspect/fonts.ts differs from the generator's output; run node scripts/gen-inspect-fonts.mjs",
    );
});
await row("site-build", () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { encoding: "utf8" });
});
// ROW: the site's provenance section (the ledger plan's stage D): every vendored skill's page is built, linked from the index, with every claimed and live hunk on it.
await row("site-provenance", () => {
  if (!existsSync("site/dist")) return skip("no built site (the site-build row runs first)");
  execFileSync(process.execPath, ["scripts/check-site-provenance.mjs"], { encoding: "utf8" });
});
await row("agents-md-budget", () => {
  const words = readFileSync("AGENTS.md", "utf8").split(/\s+/).filter(Boolean).length;
  process.stdout.write(`  AGENTS.md: ${words} words (extreme cap 5000)\n`);
  if (words > 5000) throw new Error(`AGENTS.md is ${words} words, past the extreme cap of 5000`);
});
// ROW: the shipped managed-block size — the block loads on every turn of
// every consumer session, so its size is a cost the maintainer reads here;
// the cap is extreme and catches runaway growth only (docs/SPEC.md §8; the
// operator's ruling of 2026-09-12: no word budget on semantic prose).
await row("managed-block-budget", () => {
  const caps = [["test/goldens/corpus/AGENTS.md", 8000]];
  for (const [golden, cap] of caps) {
    const words = readFileSync(golden, "utf8").split(/\s+/).filter(Boolean).length;
    process.stdout.write(`  ${golden}: ${words} words (extreme cap ${cap})\n`);
    if (words > cap) throw new Error(`${golden} is ${words} words, past the extreme cap of ${cap}`);
  }
});
// ROW: the reshape gates (the cabinet plan's section 10, in git) — every materialized unit family
// passes span coverage, byte-identical retains, vocabulary, relations, ruling
// triage, identity, and its representative-query fixture.
await row("units-reshape", () => {
  if (!existsSync("corpus/units")) return skip("no unit families yet");
  const families = readdirSync("corpus/units", { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  if (families.length === 0) throw new Error("No unit families to gate");
  for (const family of families)
    process.stdout.write(
      execFileSync(process.execPath, ["scripts/reshape.mjs", "gate", family.name], {
        encoding: "utf8",
      }),
    );
});
// ROW: ownership, claim resolution, package inputs and retired identifiers at cutover.
await row("cutover", () => {
  process.stdout.write(
    execFileSync(process.execPath, ["scripts/check-cutover.mjs"], { encoding: "utf8" }),
  );
});

// ROW: the commit subject — HEAD on every run; --full walks from the cut
// commit (the one that landed scripts/lib/commit-subject.mjs) forward, the
// cut included; a shallow clone skips the walk and still checks HEAD
// (step 6, ruling 6; the ruling's missing-main skip is not needed, because
// the cut is located in HEAD's own history, and the stage E disposition says so).
await row("commit-subject", () => {
  if (!inRepository()) return skip("no git repository here (a built public tree)");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const shallow = git("rev-parse", "--is-shallow-repository").trim() === "true";
  const cut = full
    ? git(
        "log",
        "--diff-filter=A",
        "--format=%H",
        "--reverse",
        "--",
        "scripts/lib/commit-subject.mjs",
      )
        .trim()
        .split("\n")[0]
    : undefined;
  const plan = walkPlan({ full, shallow, cut: cut || undefined });
  const bad = [];
  for (const range of plan.ranges)
    for (const c of parseCommits(git("log", "--format=%H%x00%s%x00%b%x1e", ...range)))
      bad.push(...checkCommit(c).map((p) => `${c.hash.slice(0, 8)} ${c.subject}: ${p}`));
  if (bad.length)
    throw new Error(`commit subject refused ${bad.length}: ${bad.slice(0, 6).join("; ")}`);
  if (plan.skipped) return skip(plan.skipped);
});

// ROW: the workshop's paths — every path a workshop page or the front door
// names exists, resolved against the root and the page's own directory; a
// placeholder's stem exists; a path that does not exist yet is listed under
// paths-exempt: with a reason; a tool page is walked in its house sections
// only (step 5, ruling 5; step 6, ruling 4).
const workshopPages = () =>
  [...files("workshop").filter((f) => f.endsWith(".md")), "AGENTS.md"].map((file) => ({
    file,
    text: readFileSync(file, "utf8"),
  }));
await row("workshop-paths", async () => {
  const { workshopPaths } = await import("./lib/workshop-rows.mjs");
  const bad = workshopPaths(workshopPages(), (skill) =>
    existsSync(skill) ? readFileSync(skill, "utf8") : undefined,
  );
  if (bad.length)
    throw new Error(`workshop paths refused ${bad.length}: ${bad.slice(0, 8).join("; ")}`);
});
// ROW: gate-row names — a workshop page that names a gate row names one this
// script registers (the map's mismatch on row names).
await row("gate-row-names", async () => {
  const { gateRowNames } = await import("./lib/workshop-rows.mjs");
  // The names row(...) is called with in either tier: the literal calls in
  // this file at any indentation, and every toolchain row.
  const registered = new Set([
    ...[
      ...readFileSync("scripts/check.mjs", "utf8").matchAll(/^\s*(?:await )?row\("([a-z0-9-]+)"/gm),
    ].map((m) => m[1]),
    ...TOOLCHAIN_ALL.map(([name]) => name),
  ]);
  const bad = gateRowNames(workshopPages(), registered);
  if (bad.length)
    throw new Error(`gate-row names refused ${bad.length}: ${bad.slice(0, 8).join("; ")}`);
});
// The tracked Markdown files, as git lists them.
const trackedMarkdown = () =>
  execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".md"));
// ROW: the ruled words (the context-loading plan's stage C, ruling D4 of
// 2026-09-15): the ruled pairs and the unslop catalogue's lexical tells are
// refused on the live pages, so a cold review spends no finding on them.
// scripts/lib/ruled-words.mjs decides which pages are live and what is read.
await row("ruled-words", async () => {
  const { livePage, ruledWordProblems } = await import("./lib/ruled-words.mjs");
  const pages = trackedMarkdown()
    .filter(livePage)
    .map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const problems = ruledWordProblems(pages);
  if (problems.length)
    throw new Error(`ruled words refused ${problems.length}: ${problems.slice(0, 8).join("; ")}`);
});
// ROW: the registry holds the canon: every tracked Markdown file has a row or a
// directory row, every row's path exists, every row carries a ruled class
// (docs/README.md; the second refactor's rulings 34 and 48).
await row("docs-registry", async () => {
  const { checkRegistry, parseRegistry } = await import("./lib/registry.mjs");
  const registry = "docs/README.md";
  if (!existsSync(registry)) return skip("no registry yet");
  const bad = checkRegistry({
    rows: parseRegistry(readFileSync(registry, "utf8")),
    tracked: trackedMarkdown(),
    exists: (p) => existsSync(p),
    read: (p) => (existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : undefined),
  });
  if (bad.length > 0)
    throw new Error(`registry refused ${bad.length}: ${bad.slice(0, 6).join("; ")}`);
});
// ROW: every registered page that pins the files it describes holds its pins: a
// described file changed without the pin moving fails; a described file changed
// after the page warns, which the reconcile answers (rulings 34 and 48).
await row("doc-pins", async () => {
  const { componentPins } = await import("./lib/workshop-rows.mjs");
  const { parseRegistry, registeredPages } = await import("./lib/registry.mjs");
  // The time of a path's last commit; undefined when it has none or there
  // is no history to read, which the row reports rather than treats as zero.
  const changedAt = (p) => {
    try {
      const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", p], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      return out === "" ? undefined : Number(out);
    } catch {
      return undefined;
    }
  };
  // Every registered page, a directory row expanded to the files under it.
  const pages = registeredPages(
    parseRegistry(readFileSync("docs/README.md", "utf8")),
    trackedMarkdown(),
  )
    .filter((file) => existsSync(file))
    .map((file) => ({ file, text: readFileSync(file, "utf8") }))
    .filter(({ text }) => /^describes:\n/m.test(text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""));
  const { problems, warnings } = componentPins(pages, {
    read: (p) => (existsSync(p) && statSync(p).isFile() ? readFileSync(p) : undefined),
    exists: (p) => existsSync(p),
    changedAt,
  });
  for (const w of warnings) process.stdout.write(`  warning: ${w}\n`);
  if (problems.length)
    throw new Error(`document pins refused ${problems.length}: ${problems.slice(0, 8).join("; ")}`);
});

// ROW: the pointer walk — operating surfaces cite only paths, sections, and skills that exist
await row("docs-pointers", async () => {
  const { checkPaths, exemptions } = await import("./lib/path-scan.mjs");
  // A template under scripts/export/templates/ is a page of the public tree
  // (workshop/components/public-export.md): a path it names resolves there,
  // to a template's destination or to a kept file, and not only here.
  const { classify, readKeptSet } = await import("./lib/public-tree.mjs");
  const keptSet = readKeptSet(".");
  const inPublicTree = (file, path) =>
    file.startsWith("scripts/export/templates/") &&
    (path in keptSet.templates || classify(path, keptSet) === "kept");
  const { parseRegistry, registeredPages } = await import("./lib/registry.mjs");
  const { livePlans } = await import("./lib/plan-stages.mjs");
  // The living docs walk with the skills (M4 P7.5): a moved corpus file
  // left the book pointing at nothing, and records are not surfaces.
  // The canon: the registry's canon rows, a directory row expanded to the pages
  // under it, except the authored skills, which the walk reads through their
  // mounts below; then the working documents. A sealed file is a record.
  const LIVING_DOCS = [
    ...registeredPages(parseRegistry(readFileSync("docs/README.md", "utf8")), trackedMarkdown(), [
      "canon",
    ]).filter((f) => !f.startsWith("workshop/skills/")),
    "docs/work/README.md",
    "docs/work/BOARD.md",
    "docs/work/JOBS.md",
    "docs/work/NOTES.md",
    "docs/work/archive/README.md",
    ...(existsSync("docs/work/BOARD.md") ? livePlans("docs/work/BOARD.md") : []),
  ].filter((f) => existsSync(f));
  const surfaces = [
    "AGENTS.md",
    "CLAUDE.md",
    ...LIVING_DOCS,
    ...files(".agents/skills").filter((f) => f.endsWith(".md")),
  ];
  const houseSurface = (f) =>
    f === "AGENTS.md" ||
    f === "CLAUDE.md" ||
    LIVING_DOCS.includes(f) ||
    /source:.*(greenline|Green Line|via Foundry-kernel)/.test(readFileSync(f, "utf8"));
  const ROOTED = /^(docs|scripts|tools|corpus)\//;
  const ROOT_FILES = new Set([
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "CHANGELOG.md",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    "tsconfig.json",
    "vitest.config.ts",
    "tsdown.config.ts",
  ]);
  const SECTIONS = [
    [/(?:docs\/)?CODE-STANDARDS\.md §(\d+)/g, "docs/CODE-STANDARDS.md", /^## (\d+) ·/gm],
    [/(?:docs\/)?SPEC\.md §(\d+)/g, "docs/SPEC.md", /^## (\d+)\./gm],
  ];
  const heads = new Map();
  const bad = [];
  for (const f of surfaces) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/Skill tool with \\?"([a-z0-9-]+)\\?"/g))
      if (!existsSync(`workshop/skills/${m[1]}`)) bad.push(`${f}: skill "${m[1]}"`);
    for (const [ref, doc, headPattern] of SECTIONS) {
      for (const m of s.matchAll(ref)) {
        if (!heads.has(doc))
          heads.set(
            doc,
            new Set([...readFileSync(doc, "utf8").matchAll(headPattern)].map((h) => h[1])),
          );
        if (!heads.get(doc).has(m[1])) bad.push(`${f}: ${doc} §${m[1]}`);
      }
    }
    if (!houseSurface(f)) continue; // vendored bodies carry upstream example paths, never findings
    for (const [p, why] of exemptions(s)) process.stdout.write(`  ${f}: exempt ${p} (${why})\n`);
    bad.push(
      ...checkPaths(f, s, {
        mode: "rooted",
        rooted: ROOTED,
        rootFiles: ROOT_FILES,
        skip: inPublicTree,
      }),
    );
  }
  if (bad.length > 0)
    throw new Error(
      `pointer walk refused ${bad.length}: ${[...new Set(bad)].slice(0, 8).join("; ")}`,
    );
});
// ROW: corpus coherence: greenline-authored prose (the runtime guides, the
// natives, the lines added to vendored copies) references resolve against
// the schema and the roster: skill invocations name roster skills,
// `type:`/`status:` tokens name real artifact types and lifecycle states,
// `greenline <cmd>` names a real command, and `.greenline/...` tokens name
// real workspace paths.
await row("corpus-coherence", () => {
  if (!existsSync("corpus")) return skip("no corpus yet (M2 not started)");
  execFileSync(process.execPath, ["scripts/check-corpus-prose.mjs", "coherence"], {
    encoding: "utf8",
  });
});
// ROW: the handoff contract (ADR 0039): a stage or support skill ends with a
// Handoff section, a situational skill with a Durable output line, and the
// chain closes: every Next names installed skills whose Consumes covers what
// was produced.
await row("skills-handoff", () => {
  execFileSync(process.execPath, ["scripts/check-skills-handoff.mjs"], { encoding: "utf8" });
});
// ROW: the ledger verifies (workshop/components/ledger.md): one chain, every copy's pin and hunks, every witness, every generated page.
await row("ledger", () => {
  execFileSync(process.execPath, ["scripts/ledger.mjs", "verify"], { encoding: "utf8" });
});
await row("corpus-optin-assets", () => {
  if (!existsSync("corpus/manifest.json")) return skip("no corpus yet (M2 not started)");
  const manifest = JSON.parse(readFileSync("corpus/manifest.json", "utf8"));
  const nonMarkdown = (dir) => {
    if (!existsSync(dir)) return [];
    const out = [];
    const visit = (d) => {
      for (const entry of readdirSync(d).sort()) {
        const p = join(d, entry);
        if (statSync(p).isDirectory()) visit(p);
        else if (!p.endsWith(".md") && !p.endsWith("agents/openai.yaml")) out.push(p);
      }
    };
    visit(dir);
    return out;
  };
  const bad = [];
  for (const skill of manifest.skills) {
    const assets = nonMarkdown(join("corpus", "skills", skill.name));
    const tagged = skill.optIn === true;
    if (assets.length >= ASSET_TREE_MIN && !tagged)
      bad.push(`${skill.name} ships an asset tree (${assets.length} files) without optIn`);
    if (assets.length < ASSET_TREE_MIN && tagged)
      bad.push(`${skill.name} is optIn but carries no asset tree (${assets.length} files)`);
  }
  if (bad.length > 0) throw new Error(bad.join("; "));
});
// ROW: opt-in closure — the default roster's rendered files may name an
// opt-in skill only beside an `(opt-in` marker, the reference rule for skills absent by default.
await row("corpus-optin-closure", () => {
  if (!existsSync("corpus/manifest.json")) return skip("no corpus yet (M2 not started)");
  const root = "test/goldens/corpus/dot-claude/skills";
  if (!existsSync(root)) return skip("default roster goldens missing");
  const manifest = JSON.parse(readFileSync("corpus/manifest.json", "utf8"));
  const optIn = manifest.skills.filter((skill) => skill.optIn === true).map((skill) => skill.name);
  const rendered = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) visit(p);
      else if (p.endsWith(".md") && !p.endsWith("ROUTING.md")) rendered.push(p);
    }
  };
  visit(root);
  rendered.push("test/goldens/corpus/AGENTS.md");
  const bad = [];
  for (const file of rendered) {
    const content = readFileSync(file, "utf8");
    for (const name of optIn) {
      const referenced =
        content.includes(`/${name}`) ||
        content.includes(`\`${name}\``) ||
        content.includes(`"${name}"`);
      if (!referenced) continue;
      const marked = new RegExp(`[/\`"]${name}[\`"*]*\\s*\\(([^)]*,\\s*)?opt-in`).test(content);
      if (!marked) bad.push(`${file} names opt-in '${name}' without an (opt-in) marker`);
    }
  }
  if (bad.length > 0)
    throw new Error(`opt-in not closed: ${[...new Set(bad)].slice(0, 8).join("; ")}`);
});
// TOOLCHAIN ROWS — SKIP with a named reason when not runnable yet

// The build runs before the suite: test/scripts/built-bundle.test.ts drives
// dist/bin/greenline.mjs, so on a fresh clone the vitest row read seven
// failures for want of a build (the dry acquisition, 2026-09-11). No row
// below reads the build's output; consumer-package and cli-smoke, which do,
// still follow it.
await row("tsdown-build", () => {
  if (!existsSync("node_modules"))
    return skip("toolchain not installed (run pnpm install --frozen-lockfile)");
  if (!existsSync("src")) return skip("no sources yet (M1 not started)");
  const cliBundle = "dist/bin/greenline.mjs";
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (pkg.bin?.["greenline"] !== cliBundle)
    throw new Error("package bin path and CLI bundle path differ");
  execSync("pnpm build", { stdio: "pipe" });
  if (!existsSync(cliBundle)) throw new Error(`missing CLI bundle: ${cliBundle}`);
});

for (const [name, cmd, needsSrc] of TOOLCHAIN_ROWS) {
  await row(name, () => {
    if (!existsSync("node_modules"))
      return skip("toolchain not installed (run pnpm install --frozen-lockfile)");
    if (needsSrc && !existsSync("src")) return skip("no sources yet (M1 not started)");
    const output = execSync(`npx --no-install ${cmd}`, { stdio: "pipe" });
    // Optional database suites report their skips in Vitest's summary, not as hidden passes.
    if (name === "vitest") process.stdout.write(output);
  });
}
await row("consumer-package", () => {
  execFileSync(process.execPath, ["scripts/check-consumer-package.mjs"], { encoding: "utf8" });
});
if (full) {
  // ROW: the rendered site (the second refactor's ruling 42): every built route
  // in headless Chrome at a phone width and a desktop width; a console error, a
  // failed request, a horizontal overflow or a missing landmark fails it.
  await row("site-render", () => {
    if (!existsSync("site/dist")) return skip("no built site (the site-build row runs first)");
    // The script exits with 3 where no browser stands (a machine without
    // Chrome): unproven, named, and not a failure.
    const run = spawnSync(process.execPath, ["scripts/check-site-render.mjs"], {
      encoding: "utf8",
    });
    if (run.status === 3) return skip("no browser found; the site render is unproven here");
    if (run.status !== 0)
      throw new Error(
        `check-site-render: ${(run.stderr || run.stdout).trim().split("\n").slice(-6).join("\n")}`,
      );
  });
  await row("cli-smoke", () => {
    if (!existsSync("src")) return skip("no sources yet (M1 not started)");
    const cliBundle = "dist/bin/greenline.mjs";
    const versionOut = execFileSync(process.execPath, [cliBundle, "--version"], {
      encoding: "utf8",
    });
    if (!/^\d+\.\d+\.\d+/.test(versionOut.trim()))
      throw new Error(`--version output malformed: ${versionOut}`);
    const usage = spawnSync(process.execPath, [cliBundle, "bogus"], { encoding: "utf8" });
    if (usage.status === 0 || usage.status === null)
      throw new Error("unknown command must exit nonzero");
    const smokeDir = mkdtempSync(join(tmpdir(), "greenline-smoke-"));
    // Temp-dir spawns need an absolute bundle path: a relative one
    // resolves against the child's cwd.
    const cliAbsolute = join(process.cwd(), cliBundle);
    try {
      // Outside a repository every command fails closed with the envelope.
      const noRepo = spawnSync(process.execPath, [cliAbsolute, "init", "--json"], {
        cwd: smokeDir,
        encoding: "utf8",
      });
      const envelope = JSON.parse(noRepo.stdout);
      if (
        noRepo.status !== 1 ||
        envelope.ok !== false ||
        envelope.diagnostics[0]?.code !== "GL0105"
      )
        throw new Error("init outside a repository must fail closed with GL0105");
      // Fresh repo: init, re-init, sync, doctor round-trip green.
      const repoDir = join(smokeDir, "repo");
      mkdirSync(join(repoDir, ".git"), { recursive: true });
      const context = { cwd: repoDir, encoding: "utf8" };
      const initRun = spawnSync(process.execPath, [cliAbsolute, "init", "--yes"], context);
      if (initRun.status !== 0) throw new Error(`init failed: ${initRun.stderr}`);
      if (!existsSync(join(repoDir, ".greenline", "manifest.json")))
        throw new Error("init produced no manifest");
      const reinitRun = spawnSync(
        process.execPath,
        [cliAbsolute, "init", "--guidance", "none"],
        context,
      );
      if (reinitRun.status !== 0)
        throw new Error(`re-init must be idempotent: ${reinitRun.stderr}`);
      const syncRun = spawnSync(process.execPath, [cliAbsolute, "sync"], context);
      if (syncRun.status !== 0) throw new Error(`sync failed: ${syncRun.stderr}`);
      const doctorRun = spawnSync(process.execPath, [cliAbsolute, "doctor", "--json"], context);
      const doctorEnvelope = JSON.parse(doctorRun.stdout);
      if (doctorRun.status !== 0 || doctorEnvelope.ok !== true)
        throw new Error("doctor must pass a fresh workspace");
    } finally {
      rmSync(smokeDir, { recursive: true, force: true });
    }
  });
}
// ROW: the public tree (workshop/components/public-export.md): every
// tracked path classified as kept or refused, every kept source file's
// static imports naming kept files, the tree built into a temporary
// directory with no refused path in it and typechecked there.
await row("public-tree", async () => {
  const { buildPublicTree, importClosureIssues, partition, readKeptSet, trackedFiles } =
    await import("./lib/public-tree.mjs");
  const set = readKeptSet(".");
  const parts = partition(trackedFiles("."), set);
  if (parts.unclassified.length > 0)
    throw new Error(
      `${parts.unclassified.length} tracked path(s) are neither kept nor refused: ${parts.unclassified.slice(0, 8).join(", ")}`,
    );
  const closure = importClosureIssues(".", parts.kept, set);
  if (closure.length > 0)
    throw new Error(
      `${closure.length} kept file(s) import outside the kept set: ${closure.slice(0, 6).join("; ")}`,
    );
  if (!existsSync("node_modules")) return skip("no node_modules; the tree cannot be typechecked");
  const dir = mkdtempSync(join(tmpdir(), "greenline-public-tree-"));
  try {
    buildPublicTree(".", dir, { set, files: parts.kept, linkNodeModules: true });
    for (const refused of parts.refused)
      if (!(refused in set.templates) && existsSync(join(dir, refused)))
        throw new Error(`${refused} reached the public tree`);
    for (const [destination, source] of Object.entries(set.templates))
      if (!readFileSync(join(dir, destination)).equals(readFileSync(source)))
        throw new Error(`${destination} in the public tree is not its template's bytes`);
    execFileSync(join(dir, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
// ROW: the public gate (the full tier): the tree built as the export builds
// it and its own public row set run inside it, so a public break is caught
// here before an export.
if (full) {
  await row("public-gate", async () => {
    const { buildPublicTree } = await import("./lib/public-tree.mjs");
    if (!existsSync("node_modules")) return skip("no node_modules; the public rows cannot run");
    const dir = mkdtempSync(join(tmpdir(), "greenline-public-gate-"));
    try {
      buildPublicTree(".", dir, { linkNodeModules: true });
      const run = spawnSync(process.execPath, ["scripts/check.mjs", "--public"], {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (run.status !== 0)
        throw new Error(
          `the public row set failed in the built tree:\n${run.stdout.split("\n").slice(-25).join("\n")}`,
        );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
const width = Math.max(...rows.map(([n]) => n.length));
let fail = 0;
for (const [n, s, m] of rows) {
  if (s === "FAIL") fail++;
  console.log(`${n.padEnd(width)}  ${s}${m ? "  — " + m : ""}`);
}
console.log(fail ? `\nCHECK: ${fail} row(s) FAILED` : `\n${GREEN_LINE}`);
process.exit(fail ? 1 : 0);
