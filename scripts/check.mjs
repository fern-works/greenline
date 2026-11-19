#!/usr/bin/env node
/** THE CHECK GATE (docs/CODE-STANDARDS.md §10). Honest rows: each row
 * PASSES, FAILS, or SKIPS with a named reason. A skip is never a pass —
 * the summary says exactly what was and was not proven. */
import { execFileSync, execSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { availableParallelism, loadavg, tmpdir } from "node:os";
import { GREEN_LINE, outcome, passWithNote, skip } from "./lib/gate-outcome.mjs";
import { checkCommit, parseCommits, walkPlan } from "./lib/commit-subject.mjs";
import { nameLeaks, scannedFile } from "./lib/name-boundary.mjs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// This script is part of the public tree, while the workshop allocator is
// private. The public gate inherits the controller check's owned environment.
// Imported by its URL: Node's ESM loader refuses a bare absolute path on Windows (J-104 S2).
const privateStorageUrl = new URL("./lib/qa-storage.mjs", import.meta.url);
const privateStoragePath = fileURLToPath(privateStorageUrl);
const privateStorage = existsSync(privateStoragePath) ? await import(privateStorageUrl.href) : null;
const checkTask = privateStorage
  ? privateStorage.beginWorkshopTask("check", { repository: resolve("."), env: process.env })
  : null;
if (checkTask)
  Object.assign(process.env, privateStorage.workshopEnvironment(checkTask, process.env));
// Ctrl-C or a supervisor's SIGTERM records the interruption, so the next check
// recovers this allocation once its process group has drained; the handler is
// in place before the children are protected.
if (checkTask) privateStorage.recordWorkshopInterrupt(checkTask);
if (checkTask) privateStorage.protectWorkshopChildren(checkTask);

const full = process.argv.includes("--full");
// A narrowed full tier the overseer may run by hand (docs/CODE-STANDARDS.md,
// "The full tier"); a slice's gate is the fast tier. Beside --full,
// --no-public leaves the public-gate row out and --no-coverage runs the
// vitest row without coverage; each is listed as a skip naming its flag.
const noPublic = process.argv.includes("--no-public");
const noCoverage = process.argv.includes("--no-coverage");
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
  "corpus",
  "corpus-budget",
  "corpus-fronts",
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
  "inspect-fonts",
]);
const inRepository = () => existsSync(".git");
// The toolchain rows, registered below in one loop: name, command, whether
// sources are needed, the tier and any environment the command adds. Named
// here so the gate-row-names row can read them.
const TOOLCHAIN_ALL = [
  ["typecheck", "tsc -p tsconfig.json", false, "fast"],
  ["oxlint", "oxlint .", false, "fast"],
  ["oxfmt", "oxfmt --check .", false, "fast"],
  // The full tier and the public gate run the slow project beside the fast
  // one (vitest.config.ts); the fast tier runs the fast project alone (J-127 S2).
  [
    "vitest",
    full && !noCoverage
      ? "vitest run --coverage --passWithNoTests"
      : "vitest run --passWithNoTests",
    false,
    "fast",
    full || publicOnly ? { GREENLINE_SLOW_TESTS: "1" } : {},
  ],
  ["depcruise", "depcruise src --config .dependency-cruiser.cjs", true, "fast"],
  // Knip runs in the fast tier, a slice's gate: a round's slices gathered three
  // knip reds none of them ran while it sat in the full tier (J-233 S1).
  ["knip", "knip", true, "fast"],
  ["jscpd", "jscpd src", true, "full"],
];
const TOOLCHAIN_ROWS = TOOLCHAIN_ALL.filter(([, , , tier]) => full || tier === "fast");
const rows = [];
// Focused proof: CHECK_ROWS names the applicable rows for a bounded change;
// every other row is a named skip, printed and never treated as a pass.
const narrowed = process.env.CHECK_ROWS
  ? new Set(process.env.CHECK_ROWS.split(",").map((s) => s.trim()))
  : null;
if (narrowed) process.stdout.write(`narrowed by CHECK_ROWS to: ${[...narrowed].join(", ")}\n`);
const row = async (name, fn) => {
  // The rows' children run synchronously; a turn of the event loop between rows
  // lets a pending interrupt handler run before the next row starts.
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  if (publicOnly && !PUBLIC_ROWS.has(name)) return;
  if (narrowed && !narrowed.has(name)) {
    rows.push([name, "SKIP", "narrowed by CHECK_ROWS (focused proof)"]);
    process.stdout.write(`  ✓ ${name} SKIP (narrowed)\n`);
    return;
  }
  process.stdout.write(`… ${name}\n`);
  const t0 = Date.now();
  const dt = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  try {
    const o = outcome(await fn());
    rows.push([name, o.status, o.reason]);
    const note = o.status === "PASS" && o.reason ? `: ${o.reason}` : "";
    process.stdout.write(`  ✓ ${name} ${o.status === "SKIP" ? "SKIP" : "ok"} (${dt()})${note}\n`);
  } catch (e) {
    const message = String(e.message ?? e);
    rows.push([
      name,
      "FAIL",
      privateStorage ? privateStorage.boundedTail(message) : message.slice(-4096),
    ]);
    process.stdout.write(`  ✗ ${name} failed (${dt()})\n`);
  }
};
const files = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e === ".git" || e === "node_modules" || e === "dist" || e === "coverage") continue;
      // The acquisition library of external bytes (books, sweep clones) lives
      // beside this checkout, outside it, since the composition plan's D16; a
      // checkout that still carries one under library/ is skipped here as
      // before, since no gate row reads those bytes as house source (the
      // kotlin sweep's clones tripped two sweeps).
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
// The frozen upstream snapshots under corpus/upstream/ are records, never
// house code, as the name-boundary row already treats them (FROZEN_SNAPSHOTS
// in scripts/lib/private-names.mjs): their bytes stay as upstream wrote them.
const SWEEP_EXEMPT = (f) =>
  f.startsWith(".agents/") ||
  f.startsWith("corpus/upstream/") ||
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
// bytes under corpus/upstream/ are records, not house prose, and are not
// read (scripts/lib/name-boundary.mjs decides both).
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
// ROW: the settled Fernworks promises — this repository's private local copy
// is present at the operator-approved digest pinned in
// scripts/lib/fernworks-promises.mjs (docs/SPEC.md records the same value, and
// a test holds the two equal). The row reads no sibling checkout, network or
// provider and is absent from --public.
await row("fernworks-promises", async () => {
  const { fernworksPromiseProblems } = await import("./lib/fernworks-promises.mjs");
  const problems = fernworksPromiseProblems(".");
  if (problems.length)
    throw new Error(`Fernworks promises refused ${problems.length}: ${problems.join("; ")}`);
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
// ROW: every fenced working record parses under the one versioned schema and
// the parent/slice graph is linear and complete.
await row("work-records", async () => {
  const { discoverWorkRecords } = await import("./lib/work-record.mjs");
  const { checkRecordSet } = await import("./lib/board.mjs");
  const records = discoverWorkRecords(".");
  const bad = checkRecordSet(records);
  if (bad.length > 0)
    throw new Error(`work records refused ${bad.length}: ${bad.slice(0, 6).join("; ")}`);
});
// ROW: the subagent layer's two homes match the canon byte for byte
// (the triangulation plan, T16; scripts/agents-sync.mjs --check).
await row("subagents-parity", async () => {
  if (!existsSync(".agents/subagents")) return skip("no subagent canon yet");
  const { sync } = await import("./agents-sync.mjs");
  const { problems } = sync(".", true);
  if (problems.length)
    throw new Error(`subagent homes refused ${problems.length}: ${problems.join("; ")}`);
});
// ROW: the lifecycle sequences (J-140 S2; docs/CODE-STANDARDS.md, "Testing"):
// the suite under test/shell/sequences/ drives each documented lifecycle
// through real git and the installed hooks. The hook and guard sources bind
// it (HOOK_SOURCES, scripts/lib/walk-class.mjs): the fast tier runs it when
// the candidate changed one of them, against HEAD, and names its skip
// otherwise; the full tier runs it always.
await row("lifecycle-sequences", async () => {
  if (!inRepository()) return skip("no git repository here (a built public tree)");
  const { lifecycleSequencesRow } = await import("./lib/lifecycle-sequences.mjs");
  const listed = (args) =>
    execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
  const changed = [
    ...listed(["diff", "--name-only", "-z", "--no-renames", "HEAD", "--"]),
    ...listed(["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
  const result = lifecycleSequencesRow({ full, changed });
  if (!result.ran) return skip(result.reason);
  process.stdout.write(`  lifecycle-sequences: ran because ${result.reason}\n`);
});
// ROW: the guards fire on a planted violation and pass a lawful read (the
// triangulation plan, T8): synthetic events through the hook protocol, a
// planted write and a read per guard and a non-redirection writer, the
// block's exit 2 and its decision read back.
await row("guards-drill", async () => {
  if (!existsSync("scripts/guards")) return skip("no guards yet");
  const { z } = await import("zod");
  const { queueWorkerGrant } = await import("./lib/roles.mjs");
  const { writeWorkRecord } = await import("./lib/work-record.mjs");
  const scratch = mkdtempSync(join(tmpdir(), "greenline-guards-drill-"));
  const home = mkdtempSync(join(tmpdir(), "guards-drill-"));
  const roles = join(home, "roles");
  const bad = [];
  const installed = [
    { config: ".codex/hooks.json", harness: "codex" },
    { config: ".claude/settings.json", harness: "claude" },
  ];
  try {
    for (const { config, harness } of installed) {
      const project = join(scratch, harness);
      mkdirSync(project, { recursive: true });
      if (checkTask)
        privateStorage.assertWorkshopCopyFits(checkTask, join(process.cwd(), "scripts"));
      cpSync(join(process.cwd(), "scripts"), join(project, "scripts"), { recursive: true });
      symlinkSync(
        join(process.cwd(), "node_modules"),
        join(project, "node_modules"),
        process.platform === "win32" ? "junction" : "dir",
      );
      const hooks = JSON.parse(readFileSync(config, "utf8")).hooks;
      const commandFor = (event) => {
        const command = z.string().safeParse(hooks?.[event]?.[0]?.hooks?.[0]?.command).data;
        if (!command) throw new Error(`${config} has no installed ${event} command`);
        return command;
      };
      // The installed string runs as written, through a shell, with the
      // project variable Claude Code sets for every hook command.
      const fire = (eventName, event) =>
        spawnSync(commandFor(eventName), {
          shell: true,
          cwd: project,
          input: JSON.stringify({ ...event, cwd: project, hook_event_name: eventName }),
          encoding: "utf8",
          env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: project,
            GREENLINE_GRANT: undefined,
            GREENLINE_PILOT_HOME: home,
            GREENLINE_ROLE: undefined,
            GREENLINE_ROLE_HOME: roles,
          },
        });
      const base = `docs/work/guard-${harness}`;
      const parent = `${base}/PLAN.md`;
      const record = `${base}/slices/S1.md`;
      mkdirSync(join(project, base, "slices"), { recursive: true });
      writeWorkRecord(
        join(project, parent),
        {
          schema: "greenline.work/v1",
          id: `guard-${harness}`,
          kind: "job",
          title: `Guard ${harness}`,
          status: "active",
          opened: "2026-09-20",
          authority: { source: "operator", words: "exercise installed guard wiring" },
          slices: [record],
        },
        "# Guard drill\n",
      );
      writeWorkRecord(
        join(project, record),
        {
          schema: "greenline.work/v1",
          id: "S1",
          kind: "slice",
          title: "Guard protocol",
          status: "active",
          parent: { id: `guard-${harness}`, path: parent },
          grant: {
            provenance: "contemporary",
            paths: [`${base}/`],
            proof: [
              {
                id: "protocol",
                command: ["node", "--check", "scripts/guards/role.mjs"],
                covers: [`${base}/`],
                inputs: [],
              },
            ],
          },
          worker: { harness, model: "drill-model", effort: "high" },
          evidence: [],
        },
        "# Protocol\n",
      );
      const parentSession = `drill-parent-${harness}`;
      const childSession = `drill-worker-${harness}`;
      queueWorkerGrant({ root: project, harness, session: parentSession, home: roles }, { record });
      const worker = {
        session_id: parentSession,
        agent_id: childSession,
        agent_type: "worker",
      };
      const helper = {
        session_id: parentSession,
        agent_id: `drill-reader-${harness}`,
        agent_type: "reader",
      };
      const checks = [
        ["SubagentStart", worker, 0, "worker start"],
        [
          "PreToolUse",
          {
            ...worker,
            tool_name: "Write",
            tool_input: { file_path: `${base}/implementation.mjs` },
          },
          0,
          "granted worker write",
        ],
        // A redirection names no word of the proof (J-127); a word after the proof does.
        [
          "PreToolUse",
          {
            ...worker,
            tool_name: "Bash",
            tool_input: {
              command: `node scripts/ceremony.mjs prove ${record} protocol > ${base}/prove.out 2>&1`,
            },
          },
          0,
          "worker proof with a redirection",
        ],
        [
          "PreToolUse",
          {
            ...worker,
            tool_name: "Bash",
            tool_input: {
              command: `node scripts/ceremony.mjs prove ${record} protocol extra > ${base}/prove.out 2>&1`,
            },
          },
          2,
          "worker proof with a word after the proof",
        ],
        [
          "PreToolUse",
          { ...worker, tool_name: "Write", tool_input: { file_path: record } },
          2,
          "worker control-record write",
        ],
        [
          "PreToolUse",
          {
            session_id: parentSession,
            tool_name: "Write",
            tool_input: { file_path: `${base}/implementation.mjs` },
          },
          2,
          "overseer active-scope write",
        ],
        [
          "PreToolUse",
          {
            session_id: parentSession,
            tool_name: "Write",
            tool_input: { file_path: record },
          },
          0,
          "overseer control-record write",
        ],
        [
          "PreToolUse",
          {
            session_id: `unowned-root-${harness}`,
            tool_name: "Write",
            tool_input: { file_path: "src/planted.ts" },
          },
          0,
          "unowned overseer product write",
        ],
        ["SubagentStart", helper, 0, "helper start"],
        [
          "PreToolUse",
          { ...helper, tool_name: "Write", tool_input: { file_path: `${base}/reader.md` } },
          2,
          "helper write",
        ],
        [
          "PreToolUse",
          { ...helper, tool_name: "Read", tool_input: { file_path: `${base}/reader.md` } },
          0,
          "helper read",
        ],
        ["SubagentStop", worker, 0, "worker stop"],
        [
          "PreToolUse",
          {
            session_id: parentSession,
            tool_name: "Write",
            tool_input: { file_path: `${base}/implementation.mjs` },
          },
          0,
          "overseer write after stop",
        ],
      ];
      for (const [eventName, event, want, label] of checks) {
        const result = fire(eventName, event);
        if (result.status !== want)
          bad.push(`${config} ${label}: exit ${result.status}, wanted ${want}`);
        else if (want === 2 && !/"decision":"block"/.test(result.stdout))
          bad.push(`${config} ${label}: blocked without a decision`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
  if (bad.length > 0) throw new Error(`guards drill refused ${bad.length}: ${bad.join("; ")}`);
});
// ROW: the board is the exact deterministic projection of the record set.
await row("board", async () => {
  const { checkRecordBoard } = await import("./lib/board.mjs");
  const { discoverWorkRecords } = await import("./lib/work-record.mjs");
  const board = "docs/work/BOARD.md";
  if (!existsSync(board)) return skip("no board yet");
  const bad = checkRecordBoard(readFileSync(board, "utf8"), discoverWorkRecords("."));
  if (bad.length > 0) throw new Error(`board refused ${bad.length}: ${bad.slice(0, 6).join("; ")}`);
});
// ROW: the dev policy size — AGENTS.md is measured and reported; the cap is
// an extreme one that catches runaway growth, never a target (the operator's
// ruling of 2026-09-12: semantic prose carries no word budget).
// ROW: the inspector's fonts module is generated from greenline's own
// licensed copy under assets/inspect-fonts/, independent of the website's
// files; the row renders the generator's output in memory and refuses
// drift, which the generator's header promised since ADR 0028 and no row
// had done (the map's mismatch 6).
await row("inspect-fonts", async () => {
  const { INSPECT_FONT_FILES, renderInspectFonts } = await import("./gen-inspect-fonts.mjs");
  const missing = INSPECT_FONT_FILES.filter((f) => !existsSync(f));
  if (missing.length)
    throw new Error(`the licensed font copy is incomplete: ${missing.join(", ")}`);
  const expected = renderInspectFonts(".");
  const actual = existsSync("src/shell/inspect/fonts.ts")
    ? readFileSync("src/shell/inspect/fonts.ts", "utf8")
    : "";
  if (expected !== actual)
    throw new Error(
      "src/shell/inspect/fonts.ts differs from the generator's output; run node scripts/gen-inspect-fonts.mjs",
    );
});
// ROW: the guide's roster region (J-77 S4, the ruling P6): guide/skills.md's
// step list and its starts and habits tables are rendered from
// corpus/manifest.json's skills by the site-inputs exporter's generator; the
// row renders them in memory and refuses a region that differs, a start or
// habit with no situation phrase, a phrase naming no skill and a marker
// missing or out of order, so a hand edit or a stale region fails here
// before the export carries it to the site. Absent from --public, since the
// generator is the private exporter's.
await row("guide-roster", async () => {
  const { guideRosterProblems, readGuideRoster } = await import("./lib/guide-roster.mjs");
  const { page, skills } = readGuideRoster(".");
  const problems = guideRosterProblems(page, skills);
  if (problems.length) throw new Error(`the guide's roster: ${problems.slice(0, 8).join("; ")}`);
});
await row("agents-md-budget", () => {
  const words = readFileSync("AGENTS.md", "utf8").split(/\s+/).filter(Boolean).length;
  process.stdout.write(`  AGENTS.md: ${words} words (extreme cap 5000)\n`);
  if (words > 5000) throw new Error(`AGENTS.md is ${words} words, past the extreme cap of 5000`);
});
// ROW: the shipped managed-block size: the block loads on every turn of
// every consumer session, so its size is a cost the overseer reads here.
// J-93 S1 cut the block to under 1,500 words as the corpus counts
// them (docs/SPEC.md §8; docs/work/notes/N-56.md, item 2); this row counts
// by white space, which reads higher. J-107 S3 set its cap once for the
// version's one edition of the block (the register's rows of 2026-10-22 and
// 2026-10-23; J-107's picks, item 7): the whole edition's 2,501 white-space
// words measured on 2026-10-24, rounded up to the next hundred, plus 200 for
// the design step's words J-123 adds, holding the edition rather than
// catching only runaway growth as the old cap of 8000 did.
await row("managed-block-budget", () => {
  const caps = [
    // The operator's card of 2026-10-27 raised the block's cap by 100 words once for the 0.2.0 release (J-142 S3),
    // and the register's row of 2026-10-27 on the reply's polish by 100 more (J-144 S2).
    ["test/goldens/corpus/AGENTS.md", 3000],
    ["test/goldens/garden-enabled/AGENTS.md", 3000],
  ];
  for (const [golden, cap] of caps) {
    const words = readFileSync(golden, "utf8").split(/\s+/).filter(Boolean).length;
    process.stdout.write(`  ${golden}: ${words} words (cap ${cap})\n`);
    if (words > cap) throw new Error(`${golden} is ${words} words, past the cap of ${cap}`);
  }
});
// ROW: the package's inputs and the retired identifiers at cutover.
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
  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
// The tracked Markdown files, as git lists them, less one deleted from the
// working tree: the rows read the working bytes, so a removal needs no staging.
const trackedMarkdown = () =>
  execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".md") && existsSync(f));
// The Markdown files main will hold once this candidate lands: the tracked ones
// and the untracked ones git does not ignore. git's own exclusion rules decide,
// so a scratch page an ignore names stays out exactly as it stays off main,
// which a directory walk would have to reimplement.
const candidateMarkdown = () =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f.endsWith(".md") && existsSync(f));
// ROW: the ruled words (the context-loading plan's stage C, ruling D4 of
// 2026-09-15): the ruled pairs and the unslop catalogue's lexical tells are
// refused on the live pages, so review spends no finding on them.
// scripts/lib/ruled-words.mjs decides which pages are live and what is read.
await row("ruled-words", async () => {
  const { livePage, ruledWordProblems } = await import("./lib/ruled-words.mjs");
  const pages = trackedMarkdown()
    .filter(livePage)
    .filter((file) => existsSync(file))
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
  const { componentPins, componentPinsOf } = await import("./lib/workshop-rows.mjs");
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
    .filter(({ text }) => componentPinsOf(text).present);
  const { problems, warnings } = componentPins(pages, {
    read: (p) => (existsSync(p) && statSync(p).isFile() ? readFileSync(p) : undefined),
    exists: (p) => existsSync(p),
    changedAt,
  });
  for (const w of warnings) process.stdout.write(`  warning: ${w}\n`);
  if (problems.length)
    throw new Error(`document pins refused ${problems.length}: ${problems.slice(0, 8).join("; ")}`);
});

// ROW: the reply's links to the viewer (J-140 S6;
// workshop/components/reply-links.md): every turn kind of the block's rubric
// has a row in the links page's turn table, every home of the work guide's
// homes table a view that lists it or a line saying why none, and every view
// the page names is one the inspector lists, each view of which has its row.
// It reads only greenline's own pages, never a workspace's.
await row("reply-links", async () => {
  const { REPLY_LINK_PAGES, replyLinkProblems } = await import("./lib/reply-links.mjs");
  const pages = Object.fromEntries(
    Object.entries(REPLY_LINK_PAGES).map(([name, path]) => [name, readFileSync(path, "utf8")]),
  );
  const problems = replyLinkProblems(pages);
  if (problems.length)
    throw new Error(`reply links refused ${problems.length}: ${problems.slice(0, 8).join("; ")}`);
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
  const { discoverWorkRecords } = await import("./lib/work-record.mjs");
  // The living docs walk with the skills (M4 P7.5): a moved corpus file
  // left the book pointing at nothing, and records are not surfaces.
  // The canon: the registry's canon rows, a directory row expanded to the pages
  // under it, except the authored skills, which the walk reads through their
  // mounts below; then the working documents. A sealed file is a record.
  // A directory row expands over the candidate's pages, not only the tracked
  // ones: a new page is untracked until it lands, and a gate that skipped it
  // passed a candidate whose page main then refused (J-95).
  const LIVING_DOCS = [
    ...registeredPages(parseRegistry(readFileSync("docs/README.md", "utf8")), candidateMarkdown(), [
      "canon",
    ]).filter((f) => !f.startsWith("workshop/skills/")),
    "docs/work/README.md",
    "docs/work/BOARD.md",
    "docs/work/JOBS.md",
    "docs/work/NOTES.md",
    "docs/work/LESSONS.md",
    "docs/work/archive/README.md",
    ...discoverWorkRecords(".")
      .filter(({ record }) => record.kind === "job" && record.status !== "closed")
      .map(({ path }) => path),
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
// `status:` tokens name a plan document's marks,
// `greenline <cmd>` names a real command, and `.greenline/...` tokens name
// real workspace paths.
await row("corpus-coherence", () => {
  if (!existsSync("corpus")) return skip("no corpus yet (M2 not started)");
  execFileSync(process.execPath, ["scripts/check-corpus-prose.mjs", "coherence"], {
    encoding: "utf8",
  });
});
// ROW: the corpus verifies (workshop/components/recipes.md and
// workshop/components/ledger.md, "The fresh chain"): every recipe's skill
// directory renders byte for byte, the fresh chain is whole, every recipe on
// disk is recorded by its skill's latest change entry, a retention under the
// minimum or a method item carries the operator's ruling, and each committed
// view (the index, the sources register and both notices) is its rendering.
// It runs in the public tree too; with no recipe and no entry on disk it
// passes and says so.
await row("corpus", () => {
  const run = spawnSync(process.execPath, ["scripts/corpus.mjs", "verify"], { encoding: "utf8" });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`scripts/corpus.mjs verify printed no report: ${run.stderr.slice(-400)}`);
  }
  if (run.status !== 0) {
    const findings = [
      ...report.refused.flatMap((r) => r.issues.map((i) => `${r.skill}: ${i.message}`)),
      ...report.differences.map((d) => `${d.skill}: ${d.path} ${d.difference}`),
      ...report.chain.map((c) => `${c.entry}: ${c.message}`),
      ...report.ledger.map((l) => `${l.skill}: ${l.message}`),
      ...report.views.map((v) => `${v.path}: ${v.message}`),
    ];
    // A pointer finding alone is the corpus-pointers row's, not this one's (J-140 S4).
    if (findings.length || !report.pointers?.length)
      throw new Error(`corpus refused ${findings.length}: ${findings.slice(0, 8).join("; ")}`);
  }
  if (report.recipes === 0 && report.entries === 0)
    process.stdout.write("  corpus: no recipe and no entry on disk; nothing to verify\n");
});
// ROW: the pointer-before-use reading over the roster (J-140 S4;
// craft-writing-for-agents, "Context pointers"): each installed skill's
// pointers to its reference pages, a page refused whose first pointer stands
// only in the skill's last section in a sentence naming no condition. The
// row's named exceptions, POINTER_EXCEPTIONS in scripts/lib/corpus-pointers.mjs,
// are pages a recorded follow-up moves, each naming its job: today anatomy's
// references/walkthrough.md, followed up in J-144. An exception the reading no
// longer finds is itself refused, so the list cannot outlive its cure.
await row("corpus-pointers", async () => {
  if (!existsSync("scripts/lib/corpus-pointers.mjs"))
    return skip("the pointer reading is the workshop's, absent from the public tree");
  const { pointerVerdict, rosterPointerFindings } = await import("./lib/corpus-pointers.mjs");
  const verdict = pointerVerdict(rosterPointerFindings("corpus"));
  for (const entry of verdict.excepted)
    process.stdout.write(
      `  excepted ${entry.skill}: ${entry.page}, followed up in ${entry.followUp}\n`,
    );
  const problems = [
    ...verdict.stale.map(
      (entry) =>
        `the exception ${entry.skill}: ${entry.page} (${entry.followUp}) is no longer refused; remove it`,
    ),
    ...verdict.refused.map((item) => `${item.skill}: ${item.message}`),
  ];
  if (problems.length)
    throw new Error(`pointers refused ${problems.length}: ${problems.slice(0, 8).join("; ")}`);
});
// ROW: the words budget (workshop/components/modes.md, "The words budget"):
// `scripts/corpus.mjs budget` over every mode of the definition, failing on
// a mode whose words read pass its budget without the operator's ruling in
// the modes recipe. With corpus-ceilings, which compares each ceiling with
// HEAD's, the gate's reading of the words budget; the block's own cap is
// managed-block-budget's. It runs in the public tree too. Beside the words,
// the keepers the recipes list (J-153 S3; workshop/components/recipes.md,
// "The keepers"; the register's row of 2026-10-28 on the keeper test): the
// row prints them by kind and by cost, and caps the hook rules of kind hold,
// each a refusal or a turn's-end hold a session can meet, at HOLD_CAP; a recipe that adds a
// hold past it fails the row until another is retired or merged, and only a
// register row raises the cap. Set at J-153 S4, on the brief's word, from the
// audit: 21 hook rules the roster's holds name today, and 7 the fix round's
// jobs add (J-148 S2's merge words and S3's marks at done, J-149 S1's record
// lint at done, S2's card reading, S3's state at a resume and S5's reply
// hold, J-151 S2's research hold). It is provisional: the register's keeper
// test row sets the cap from the apparatus's first measurement of the hooks'
// time per turn (J-152), and a register row moves it then.
const HOLD_CAP = 28;
await row("corpus-budget", () => {
  const run = spawnSync(process.execPath, ["scripts/corpus.mjs", "budget"], { encoding: "utf8" });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`scripts/corpus.mjs budget printed no report: ${run.stderr.slice(-400)}`);
  }
  for (const mode of report.modes)
    process.stdout.write(
      `  ${mode.mode}: ${Math.max(mode.total.default, mode.total.garden)} words read (budget ${mode.budget})\n`,
    );
  const keepers = report.keepers;
  if (keepers)
    process.stdout.write(
      `  keepers: ${keepers.promises} promises, ${keepers.kept} kept (${Object.entries(
        keepers.byKind,
      )
        .map(([kind, count]) => `${kind} ${count}`)
        .join(", ")}; ${Object.entries(keepers.byCost)
        .map(([cost, count]) => `${cost} ${count}`)
        .join(", ")}), ${keepers.holds.length} hook rules held (cap ${HOLD_CAP})\n`,
    );
  if (run.status !== 0) {
    const findings = report.refused.map((r) => `${r.mode}: ${r.message}`);
    throw new Error(`corpus-budget refused ${findings.length}: ${findings.slice(0, 8).join("; ")}`);
  }
  if (keepers && keepers.holds.length > HOLD_CAP)
    throw new Error(
      `corpus-budget refused 1: the holds name ${keepers.holds.length} hook rules, past the cap of ${HOLD_CAP} (${keepers.holds.join(", ")}); retire or merge one, or a register row raises the cap`,
    );
});
// ROW: the fronts hold the upstream prose alone (J-93 S2, N-56 item 2;
// workshop/components/recipes.md, "The front and the references"):
// `scripts/corpus.mjs fronts` over every recipe, failing on a greenline
// command, a workspace path or a record form in a skill's front outside
// SKILL.md's Handoff section, and on a skill on the line whose recipe names
// no references page, so a later ingestion cannot put a mechanic back in a
// front. It runs in the public tree too.
await row("corpus-fronts", () => {
  const run = spawnSync(process.execPath, ["scripts/corpus.mjs", "fronts"], { encoding: "utf8" });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`scripts/corpus.mjs fronts printed no report: ${run.stderr.slice(-400)}`);
  }
  process.stdout.write(`  ${report.recipes} fronts read\n`);
  if (run.status !== 0) {
    const findings = [
      ...report.findings.map((f) => `${f.skill} ${f.path}:${f.line}: ${f.what}, ${f.text}`),
      ...report.unreferenced.map(
        (skill) => `${skill}: a skill on the line names no references page`,
      ),
      ...report.refused.flatMap((r) => r.issues.map((i) => `${r.skill}: ${i.message}`)),
    ];
    throw new Error(`corpus-fronts refused ${findings.length}: ${findings.slice(0, 8).join("; ")}`);
  }
});
// ROW: the interface rule registry is whole (J-123 S4;
// workshop/components/interface-rules.md, "Which rows prove it"): the list
// corpus/interface/rules.json reads under its schema with no id twice, each
// rule's sentence stands with its id and its tier on the design step's page
// its facets give it, each rule of the static engines has a detector in
// code, and each render rule a judge (src/core/interface-render.ts), which
// measures it in a browser at verify or names why it is unmeasured.
await row("interface-rules", async () => {
  if (!existsSync("corpus/interface/rules.json")) return skip("no interface rule list yet");
  const { parseRuleList, rulePage } = await import("../src/core/interface-registry.ts");
  const { staticRuleIds } = await import("../src/core/interface-static.ts");
  const { renderRuleIds } = await import("../src/core/interface-render.ts");
  const judges = new Set(renderRuleIds());
  const parsed = parseRuleList(readFileSync("corpus/interface/rules.json", "utf8"));
  if (!parsed.ok)
    throw new Error(`interface-rules refused the list: ${parsed.issues.slice(0, 8).join("; ")}`);
  const detectors = new Set(staticRuleIds());
  const refused = [];
  for (const rule of parsed.rules) {
    const page = `corpus/skills/design/${rulePage(rule)}`;
    const text = existsSync(page) ? readFileSync(page, "utf8") : undefined;
    const line = `- \`${rule.id}\`, ${rule.tier}: ${rule.sentence}`;
    if (text === undefined) refused.push(`${rule.id}: its page ${page} stands nowhere`);
    else if (!text.includes(line))
      refused.push(`${rule.id}: ${page} does not carry its line '${line.slice(0, 80)}'`);
    if (rule.engine !== "render" && !detectors.has(rule.id))
      refused.push(
        `${rule.id}: a ${rule.engine} rule with no detector in src/core/interface-static.ts`,
      );
  }
  for (const rule of parsed.rules)
    if (rule.engine === "render" && !judges.has(rule.id))
      refused.push(`${rule.id}: a render rule with no judge in src/core/interface-render.ts`);
  for (const id of detectors)
    if (!parsed.rules.some((rule) => rule.id === id && rule.engine !== "render"))
      refused.push(`${id}: a detector for no static rule of the list`);
  for (const id of judges)
    if (!parsed.rules.some((rule) => rule.id === id && rule.engine === "render"))
      refused.push(`${id}: a judge for no render rule of the list`);
  process.stdout.write(
    `  ${parsed.rules.length} rules, ${detectors.size} static detectors, ${judges.size} render judges\n`,
  );
  if (refused.length)
    throw new Error(`interface-rules refused ${refused.length}: ${refused.slice(0, 8).join("; ")}`);
});
// ROW: the interface catalog holds (J-123 S6;
// workshop/components/interface-catalog.md, "Which rows prove it"): every
// entry reads under the schema with its provenance, no id twice, every
// entry's own colours meet the floor in the pairs it names at the ratios it
// records, every entry with tokens or a sketch renders its specimen, the
// recipe names every entry once and no entry it lacks, and the extra skill
// carries the same bytes.
await row("interface-catalog", async () => {
  const entriesPath = "corpus/interface/catalog/entries.json";
  if (!existsSync(entriesPath)) return skip("no interface catalog yet");
  const { catalogIssues, parseCatalog, specimenHtml } =
    await import("../src/core/interface-catalog.ts");
  const text = readFileSync(entriesPath, "utf8");
  const refused = [...catalogIssues(text)];
  const entries = parseCatalog(text) ?? [];
  for (const entry of entries)
    if ((entry.tokens !== undefined || entry.sketch !== undefined) && !specimenHtml(entry))
      refused.push(`${entry.id}: no specimen renders`);
  const recipe = JSON.parse(readFileSync("corpus/interface/catalog/recipe.json", "utf8"));
  const named = [...recipe.families, ...recipe.sites].flatMap((source) => source.entries);
  const ids = new Set(entries.map((entry) => entry.id));
  for (const id of named)
    if (!ids.has(id)) refused.push(`${id}: the recipe names an entry the catalog lacks`);
  for (const id of ids)
    if (named.filter((name) => name === id).length !== 1)
      refused.push(
        `${id}: the recipe names it ${String(named.filter((name) => name === id).length)} times`,
      );
  const copy = "corpus/skills/interface-catalog/catalog/entries.json";
  if (
    existsSync("corpus/skills/interface-catalog") &&
    (!existsSync(copy) || readFileSync(copy, "utf8") !== text)
  )
    refused.push(`${copy} differs from ${entriesPath}`);
  process.stdout.write(
    `  ${entries.length} entries, each with a specimen where it has tokens or a sketch\n`,
  );
  if (refused.length)
    throw new Error(
      `interface-catalog refused ${refused.length}: ${refused.slice(0, 8).join("; ")}`,
    );
});
// ROW: the ceilings hold. Each mode's words budget is a ceiling a slice
// lowers and never raises without the operator's ruling (N-56 item 2, J-93
// S1): corpus-budget refuses a mode read past its ceiling, and this row
// refuses the ceiling itself moving up against HEAD's definition, unless the
// modes recipe's account for the mode carries the operator's `excess` ruling
// naming at least the raise. A mode HEAD does not hold passes, its first
// ceiling being its measure rounded up; with no definition at HEAD, or no
// repository, there is nothing to compare and the row says so.
await row("corpus-ceilings", async () => {
  if (!inRepository()) return skip("no git repository here (a built public tree)");
  let headText;
  try {
    headText = execFileSync("git", ["show", "HEAD:corpus/runtime/modes.json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return skip("HEAD holds no corpus/runtime/modes.json to compare the ceilings with");
  }
  const { raisedCeilings } = await import("./lib/corpus-ceilings.mjs");
  const work = JSON.parse(readFileSync("corpus/runtime/modes.json", "utf8"));
  const recipe = existsSync("corpus/recipes/modes.json")
    ? JSON.parse(readFileSync("corpus/recipes/modes.json", "utf8"))
    : undefined;
  const refused = raisedCeilings(JSON.parse(headText), work, recipe);
  for (const mode of work.modes)
    process.stdout.write(`  ${mode.name}: ceiling ${mode.budget.words}\n`);
  if (refused.length)
    throw new Error(`corpus-ceilings refused ${refused.length}: ${refused.join("; ")}`);
});
// ROW: the handoff contract, read by each skill's kind: a step's Next names
// the next step of the change's mode, a start's the step its handoff
// reaches, a habit carries no Handoff section; and the chain closes: every
// Next names installed skills whose Consumes covers what was produced.
await row("skills-handoff", () => {
  execFileSync(process.execPath, ["scripts/check-skills-handoff.mjs"], { encoding: "utf8" });
});
await row("corpus-optin-assets", async () => {
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
  // A skill with an asset tree is extra and installs on request, the visual
  // skills the register's row of 2026-10-22 makes defaults aside; an extra
  // carries files beside its SKILL.md, since its tree is why it waits for
  // the request (the plan modes-records-recipes, "The roster";
  // scripts/lib/asset-tree.mjs holds the rule, its threshold and its
  // allowance).
  const { assetTreeIssues } = await import("./lib/asset-tree.mjs");
  const bad = assetTreeIssues(manifest.skills, (name) => {
    const dir = join("corpus", "skills", name);
    return {
      assets: nonMarkdown(dir),
      onlySkill: existsSync(dir) && readdirSync(dir).every((entry) => entry === "SKILL.md"),
    };
  });
  if (bad.length > 0) throw new Error(bad.join("; "));
});
// ROW: the closure of the extras: the default roster's rendered files may
// name an extra skill only beside an `(extra` marker, the reference rule for
// skills absent by default. S18b re-cut the last pages that carried the
// `(opt-in` marker, so the allowance of both vocabularies ends here.
await row("corpus-optin-closure", async () => {
  if (!existsSync("corpus/manifest.json")) return skip("no corpus yet (M2 not started)");
  const root = "test/goldens/corpus/dot-claude/skills";
  if (!existsSync(root)) return skip("default roster goldens missing");
  const manifest = JSON.parse(readFileSync("corpus/manifest.json", "utf8"));
  const extras = manifest.skills.filter((skill) => skill.extra === true).map((skill) => skill.name);
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
    for (const name of extras) {
      const referenced =
        content.includes(`/${name}`) ||
        content.includes(`\`${name}\``) ||
        content.includes(`"${name}"`);
      if (!referenced) continue;
      const marked = new RegExp(`[/\`"]${name}[\`"*]*\\s*\\(([^)]*,\\s*)?extra`).test(content);
      if (!marked) bad.push(`${file} names extra '${name}' without an (extra) marker`);
    }
  }
  if (bad.length > 0)
    throw new Error(`extras not closed: ${[...new Set(bad)].slice(0, 8).join("; ")}`);
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

for (const [name, cmd, needsSrc, , env = {}] of TOOLCHAIN_ROWS) {
  await row(name, async () => {
    if (!existsSync("node_modules"))
      return skip("toolchain not installed (run pnpm install --frozen-lockfile)");
    if (needsSrc && !existsSync("src")) return skip("no sources yet (M1 not started)");
    // The vitest row, on a red under a load above the machine's parallelism,
    // the highest of the one-minute load before the suite and the one-minute
    // and five-minute loads after it, runs the failed files alone once and
    // names the three and the files when they pass (the register's row of
    // 2026-10-30; J-157 S1, J-159 S1).
    if (name === "vitest") {
      const { runVitest, vitestRow } = await import("./lib/vitest-rerun.mjs");
      const runEnv = { ...process.env, ...env };
      const verdict = vitestRow({
        runSuite: () => runVitest(cmd.split(" ").slice(1), runEnv),
        runAlone: (failed) => runVitest(["run", "--no-file-parallelism", ...failed], runEnv),
        load: () => loadavg(),
        cores: availableParallelism(),
      });
      if (!verdict.ok) throw new Error(`${cmd} failed: ${verdict.finding}`);
      return verdict.note ? passWithNote(verdict.note) : undefined;
    }
    try {
      execSync(`npx --no-install ${cmd}`, { stdio: "pipe", env: { ...process.env, ...env } });
    } catch (error) {
      // A tool prints its finding on stderr or stdout: the row names the first
      // lines of the one and the last of the other, not only the exit.
      const lines = (bytes) =>
        String(bytes ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      const finding = [...lines(error.stderr).slice(0, 3), ...lines(error.stdout).slice(-4)];
      throw new Error(`${cmd} failed: ${finding.join(" / ") || error.message}`, {
        cause: error,
      });
    }
  });
}
// --no-coverage runs the vitest row without coverage; the summary lists
// coverage as a skip naming the flag, so it reads as not run.
if (full && noCoverage) {
  await row("coverage", () => skip("left out by --no-coverage"));
}
await row("consumer-package", () => {
  const out = execFileSync(process.execPath, ["scripts/check-consumer-package.mjs"], {
    encoding: "utf8",
  });
  // The garden-enabled half is part of the proof: where it could not run, the row is unproven, not passed.
  const notRun = /the garden-enabled run was not run: [^.;]*/.exec(out);
  if (notRun) return skip(notRun[0]);
});
if (full) {
  // ROW: the inspector's render check (J-120): the client app the build wrote,
  // served over two fixture workspaces and read in headless Chrome at 320, 768
  // and 1280 wide, every page and the catalogue drawn with no console error,
  // failed request or sideways scroll, the palette and the keys driven. With no
  // browser on the machine the row is unproven, never passed.
  await row("inspect-render", () => {
    if (!existsSync("src")) return skip("no sources yet (M1 not started)");
    const run = spawnSync(process.execPath, ["scripts/check-inspect-render.mjs"], {
      encoding: "utf8",
      timeout: 600_000,
    });
    if (run.status === 3) return skip(run.stdout.trim() || "no browser found");
    if (run.status !== 0)
      throw new Error(
        `${(run.stdout + run.stderr).trim().split("\n").slice(0, 10).join(" / ") || `exit ${run.status}`}`,
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
      // Fresh repo: init, re-init, sync, status round-trip green.
      const repoDir = join(smokeDir, "repo");
      mkdirSync(join(repoDir, ".git"), { recursive: true });
      const context = { cwd: repoDir, encoding: "utf8" };
      const initRun = spawnSync(process.execPath, [cliAbsolute, "init", "--yes"], context);
      if (initRun.status !== 0) throw new Error(`init failed: ${initRun.stderr}`);
      if (!existsSync(join(repoDir, ".greenline", "manifest.json")))
        throw new Error("init produced no manifest");
      // A repeated init changes nothing and names sync.
      const reinitRun = spawnSync(process.execPath, [cliAbsolute, "init", "--json"], context);
      const reinitEnvelope = JSON.parse(reinitRun.stdout);
      if (
        reinitRun.status !== 1 ||
        reinitEnvelope.diagnostics[0]?.code !== "GL0124" ||
        !reinitEnvelope.diagnostics[0]?.message.includes("greenline sync")
      )
        throw new Error(`re-init must refuse and name greenline sync: ${reinitRun.stdout}`);
      const syncRun = spawnSync(process.execPath, [cliAbsolute, "sync"], context);
      if (syncRun.status !== 0) throw new Error(`sync failed: ${syncRun.stderr}`);
      const statusRun = spawnSync(process.execPath, [cliAbsolute, "status", "--json"], context);
      const statusEnvelope = JSON.parse(statusRun.stdout);
      if (statusRun.status !== 0 || statusEnvelope.ok !== true)
        throw new Error("status must pass a fresh workspace");
    } finally {
      rmSync(smokeDir, { recursive: true, force: true });
    }
  });
}
// ROW: the public tree (workshop/components/public-export.md): every path
// of the candidate, tracked or untracked and not ignored, classified as kept
// or refused, every rule of the kept set naming a path the candidate holds,
// every kept source file's static imports naming kept files, the tree built
// into a temporary directory with no refused path, no private name and no
// guidance unit identity in it, and typechecked there. A worker's new module
// is untracked until the land stages it, and its git is read-only (J-211 S2).
await row("public-tree", async () => {
  const {
    buildPublicTree,
    candidateParts,
    importClosureIssues,
    privateNameIssues,
    readKeptSet,
    staleRuleIssues,
    workingFiles,
  } = await import("./lib/public-tree.mjs");
  const set = readKeptSet(".");
  const parts = candidateParts(".", set);
  if (parts.unclassified.length > 0)
    throw new Error(
      `${parts.unclassified.length} path(s) are neither kept nor refused: ${parts.unclassified.slice(0, 8).join(", ")}`,
    );
  // A rule names a file the candidate holds: a new file is untracked until its commit (J-140).
  const stale = staleRuleIssues(workingFiles("."), set);
  if (stale.length > 0)
    throw new Error(`${stale.length} rule(s) of the kept set are stale: ${stale.join("; ")}`);
  const closure = importClosureIssues(".", parts.kept, set);
  if (closure.length > 0)
    throw new Error(
      `${closure.length} kept file(s) import outside the kept set: ${closure.slice(0, 6).join("; ")}`,
    );
  if (!existsSync("node_modules")) return skip("no node_modules; the tree cannot be typechecked");
  const dir = mkdtempSync(join(tmpdir(), "greenline-kept-tree-"));
  try {
    buildPublicTree(".", dir, { set, files: parts.kept, linkNodeModules: true });
    for (const refused of parts.refused)
      if (!(refused in set.templates) && existsSync(join(dir, refused)))
        throw new Error(`${refused} reached the public tree`);
    for (const [destination, source] of Object.entries(set.templates))
      if (!readFileSync(join(dir, destination)).equals(readFileSync(source)))
        throw new Error(`${destination} in the public tree is not its template's bytes`);
    // The unit-id leak proof the package check runs, over the whole tree: the
    // ids are the frozen list the old ledger's publication records held, and
    // the proof must have ids to look for.
    const { publicationUnitIds } = await import("./lib/private-names.mjs");
    if (publicationUnitIds().length === 0)
      throw new Error("the frozen list names no guidance unit; the unit-id leak proof has no ids");
    const named = privateNameIssues(dir);
    if (named.length > 0)
      throw new Error(
        `the public tree carries private names or guidance unit identities: ${named.slice(0, 6).join("; ")}`,
      );
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
// here before an export. The tree holds the working tree's kept files, the
// untracked ones included, since the private vitest row runs those too; and
// the whole public row set runs, since a narrowing meant for this gate would
// skip every inner row and pass with nothing proven.
if (full) {
  await row("public-gate", async () => {
    if (noPublic) return skip("left out by --no-public");
    const { buildPublicTree, partition, publicGateEnvironment, readKeptSet, workingFiles } =
      await import("./lib/public-tree.mjs");
    if (!existsSync("node_modules")) return skip("no node_modules; the public rows cannot run");
    const dir = mkdtempSync(join(tmpdir(), "greenline-kept-gate-"));
    try {
      const set = readKeptSet(".");
      const files = partition(workingFiles("."), set).kept;
      buildPublicTree(".", dir, { set, files, linkNodeModules: true });
      const run = spawnSync(process.execPath, ["scripts/check.mjs", "--public"], {
        cwd: dir,
        encoding: "utf8",
        env: publicGateEnvironment(process.env),
        maxBuffer: 64 * 1024 * 1024,
      });
      if (run.status !== 0)
        throw new Error(
          `the public row set failed in the built tree:\n${run.stdout.split("\n").slice(-25).join("\n")}`,
        );
      // The public vitest row's rerun under load is named here too, so the
      // private gate's last lines say the public suite passed only alone.
      const { rerunNoteIn } = await import("./lib/vitest-rerun.mjs");
      const rerun = rerunNoteIn(run.stdout);
      if (rerun) return passWithNote(`its vitest row ${rerun}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
await row("workshop-storage", () => {
  if (!checkTask) return skip("private workshop allocator is absent from the public tree");
  privateStorage.assertWorkshopBudget(checkTask);
});
const failuresBeforeStorageFinalization = rows.filter(([, status]) => status === "FAIL").length;
let checkStorage;
if (checkTask) {
  privateStorage.confirmWorkshopChildrenDrained(checkTask);
  checkStorage = privateStorage.finishWorkshopTask(checkTask, {
    failed: failuresBeforeStorageFinalization > 0,
    label: "check",
    details: { rows },
  });
  if (checkStorage.budgetError) {
    const storageRow = rows.find((entry) => entry[0] === "workshop-storage");
    if (storageRow) storageRow.splice(1, 2, "FAIL", checkStorage.budgetError);
    else rows.push(["workshop-storage", "FAIL", checkStorage.budgetError]);
  }
}
// The expiring diagnostic's location comes before the table, so the lines a
// proof receipt keeps (the last ones) never carry it.
if (checkStorage?.diagnostic) console.log(`bounded check diagnostic: ${checkStorage.diagnostic}`);
const width = Math.max(...rows.map(([n]) => n.length));
for (const [n, s, m] of rows) console.log(`${n.padEnd(width)}  ${s}${m ? "  — " + m : ""}`);
// The last line names each failing row and the first lines of its error, so a
// proof receipt that keeps only the tail still says why the gate failed.
const failed = rows.filter(([, s]) => s === "FAIL");
const firstLines = (message) =>
  String(message ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ")
    .slice(0, 400);
// A row that passed with a note, a rerun under load, says so just above the
// last line, so a proof receipt that keeps only the tail names it.
const noted = rows.filter(([, s, m]) => s === "PASS" && m);
if (noted.length) console.log("");
for (const [n, , m] of noted) console.log(`${n}: ${m}`);
console.log(
  failed.length
    ? `\nCHECK: ${failed.length} row(s) FAILED: ${failed.map(([n, , m]) => `${n} — ${firstLines(m)}`).join("; ")}`
    : `\n${GREEN_LINE}`,
);
process.exitCode = failed.length ? 1 : 0;
