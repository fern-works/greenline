// greenline's own corpus prose is checked as prose greenline wrote: the
// runtime guides and native skills whole, and for a vendored copy only the
// lines greenline added (the hunks measured against the frozen upstream).
// `em-dashes`: no em dash in greenline-authored lines (ADR 0010; the corpus
// practices the unslop catalog it ships). `coherence`: skill invocations
// name roster skills, `type:`/`status:` tokens name real artifact types and
// lifecycle states, `greenline <cmd>` names a real command, and
// `.greenline/...` tokens name real workspace paths.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { isVendored } from "../src/core/corpus.ts";
import { loadCorpusManifest } from "../src/shell/corpus.ts";
import { GENERATED_PROVENANCE_PAGE } from "../src/shell/corpus.ts";
import { measureDivergence } from "../src/shell/divergence.ts";
import { listFilesRecursive } from "../src/shell/fs/walk.ts";
import { WORKSPACE_HOME } from "./lib/workspace-homes.mjs";

const mode = process.argv[2];
const whole = process.argv.includes("--whole");
if (mode !== "em-dashes" && mode !== "coherence")
  throw new Error("Usage: node scripts/check-corpus-prose.mjs em-dashes|coherence [--whole]");
const root = resolve("corpus");
const manifest = loadCorpusManifest(root);
if (manifest._tag === "err") throw manifest.error;
const measured = measureDivergence(root);
if (measured._tag === "err") throw new Error(JSON.stringify(measured.error.issues));

/**
 * Every greenline-authored line as [label, line, context]. For a whole
 * native or runtime file (or any copy under `--whole`) the context is empty. For a vendored copy each
 * added line of a hunk carries the hunk's removed lines as context: a
 * token or an em dash already present there is upstream's, not ours (the
 * notation pass rewrites a whole line to change one reference).
 */
function authoredLines() {
  const out = [];
  const wholeFile = (path) => {
    if (!path.endsWith(".md")) return;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => out.push([`${path}:${index + 1}`, line, ""]));
  };
  for (const file of listFilesRecursive(join(root, "runtime")))
    wholeFile(join(root, "runtime", file));
  for (const entry of manifest.value.skills) {
    const dir = join(root, "skills", entry.name);
    if (!isVendored(entry)) {
      for (const file of listFilesRecursive(dir)) wholeFile(join(dir, file));
      continue;
    }
    const item = measured.value.find((state) => state.skill === entry.name);
    const added = new Set();
    for (const hunk of item?.hunks ?? [])
      if (hunk.path.endsWith(".md")) {
        const context = hunk.removed.join("\n");
        for (const line of hunk.added) {
          added.add(`${hunk.path}\0${line}`);
          out.push([`${dir}/${hunk.path} (${hunk.id})`, line, context]);
        }
      }
    // `--whole` also reads every upstream line of the copy: after the fold
    // (ADR 0039, S3) a copy says what greenline means throughout, so a home,
    // a status, a command or an OS temp path is checked wherever it sits.
    // The slash-invocation rule stays on greenline's lines; upstream route
    // and command examples are not skill invocations.
    if (whole)
      for (const file of listFilesRecursive(dir)) {
        if (!file.endsWith(".md") || file === GENERATED_PROVENANCE_PAGE) continue;
        readFileSync(join(dir, file), "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (!added.has(`${file}\0${line}`))
              out.push([`${dir}/${file}:${index + 1}`, line, "", "upstream"]);
          });
      }
  }
  return out;
}

const lines = authoredLines();
const bad = [];
const count = (text, needle) => text.split(needle).length - 1;
if (mode === "em-dashes") {
  for (const [label, line, context] of lines)
    if (count(line, "—") > count(context, "—")) bad.push(`${label} carries an em dash`);
} else {
  const roster = new Set(manifest.value.skills.map((s) => s.name));
  const artifactSrc = readFileSync("src/core/artifact.ts", "utf8");
  const statuses = new Set();
  for (const decl of artifactSrc.matchAll(/STATUSES = \[([^\]]+)\]/g))
    for (const s of decl[1].matchAll(/"([^"]+)"/g)) statuses.add(s[1]);
  const typeDecl = /export type ArtifactType =([\s\S]*?);/.exec(artifactSrc);
  const types = new Set([...typeDecl[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const argsSrc = readFileSync("src/shell/cli/args.ts", "utf8");
  const commands = new Set([...argsSrc.matchAll(/\.command\("([a-z-]+)"\)/g)].map((m) => m[1]));
  const entrySrc = readFileSync("src/shell/cli/entry.ts", "utf8");
  for (const match of entrySrc.matchAll(/argv\[0\] === "([a-z-]+)"/g)) commands.add(match[1]);
  for (const [label, s, context, origin] of lines) {
    const ours = (token) => !context.includes(token);
    if (/(^|[\s`"'(])\/tmp(\/|`|$)/.test(s))
      bad.push(`${label}: the OS temp directory; greenline's scratch is .greenline/tmp/<skill>/`);
    if (origin !== "upstream")
      for (const m of s.matchAll(/`\/([a-z][a-z0-9-]+)`/g))
        if (!roster.has(m[1]) && ours(m[0]))
          bad.push(`${label}: /${m[1]} is not on the corpus roster`);
    for (const m of s.matchAll(/`type: ([a-z]+)`/g))
      if (!types.has(m[1]) && ours(m[0]))
        bad.push(`${label}: type '${m[1]}' is not an artifact type`);
    for (const m of s.matchAll(/`status: ([a-z]+)`|status `([a-z]+)`/g)) {
      const named = m[1] ?? m[2];
      if (!statuses.has(named) && ours(m[0]))
        bad.push(`${label}: status '${named}' is not a lifecycle state`);
    }
    // Commands are code, while lowercase product mentions in prose are not invocations.
    for (const snippet of s.matchAll(/`([^`]+)`/g))
      for (const m of snippet[1].matchAll(/\bgreenline ([a-z]+)/g))
        if (!commands.has(m[1]) && ours(m[0]))
          bad.push(`${label}: 'greenline ${m[1]}' is not a command`);
    for (const m of s.matchAll(/`(\.greenline\/[^`\s]+)`/g)) {
      if (!WORKSPACE_HOME.test(m[1]) && ours(m[0]))
        bad.push(`${label}: '${m[1]}' is not a workspace path`);
    }
  }
}
if (!existsSync(root)) throw new Error("no corpus");
if (bad.length > 0) {
  console.error(`${mode} refused ${bad.length}: ${[...new Set(bad)].slice(0, 8).join("; ")}`);
  process.exitCode = 1;
} else console.log(`${mode}: ${lines.length} greenline-authored lines clean`);
