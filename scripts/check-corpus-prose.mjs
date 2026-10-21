// greenline's own corpus prose is checked as prose greenline wrote: the
// runtime guides whole, and for each roster skill the text its recipe says
// greenline wrote (workshop/components/recipes.md): a skill whose recipe
// takes no upstream text whole, and otherwise its written passages and its
// edited segments, each edited segment beside the upstream text it edits.
// `em-dashes`: no em dash in greenline-authored lines (ADR 0010; the corpus
// practices the catalog of tells it ships, the prose habit's tells.md). `coherence`: skill invocations
// name roster skills, `status:` tokens name a plan document's marks,
// `greenline <cmd>` names a real command, and `.greenline/...` tokens name
// real workspace paths.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { provenanceData } from "../src/corpus/instrument.ts";
import { loadCorpusManifest } from "../src/shell/corpus.ts";
import { listFilesRecursive } from "../src/shell/fs/walk.ts";
import { DOCUMENT_STATUSES } from "../src/core/plan-documents.ts";
import { WORKSPACE_HOME } from "./lib/workspace-homes.mjs";

const mode = process.argv[2];
const whole = process.argv.includes("--whole");
if (mode !== "em-dashes" && mode !== "coherence")
  throw new Error("Usage: node scripts/check-corpus-prose.mjs em-dashes|coherence [--whole]");
const root = resolve("corpus");
const manifest = loadCorpusManifest(root);
if (manifest._tag === "err") throw manifest.error;
const provenance = provenanceData(root);
if (provenance._tag === "err")
  throw new Error(provenance.error.issues.map((issue) => issue.message).join("; "));

/** The line, from 1, at an offset of a text. */
const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;

/** A segment's text after its edits, applied in order as the recipe check applies them. */
const edited = (text, edits) =>
  edits.reduce((current, edit) => current.replace(edit.find, () => edit.replace), text);

/**
 * Every greenline-authored line as [label, line, context, origin]. For a
 * whole file the context is empty. A written passage's lines carry as
 * context the upstream text it replaces, as a hunk's removed lines did: the
 * dropped segments that name it as their replacement, and the segments
 * dropped between the taken passages on either side of it, from their
 * source file. An edited segment's lines carry the segment's upstream text.
 * A token or an em dash already present in the context is upstream's, not
 * ours. Under `--whole` every other line of a skill's prose files follows,
 * marked as upstream.
 */
function authoredLines() {
  const out = [];
  const wholeFile = (path) => {
    if (!path.endsWith(".md")) return;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => out.push([`${path}:${index + 1}`, line, ""]));
  };
  const span = (label, text, context, line) =>
    text
      .split("\n")
      .forEach((part, index) => out.push([`${label}:${line + index}`, part, context]));
  for (const file of listFilesRecursive(join(root, "runtime")))
    wholeFile(join(root, "runtime", file));
  const skills = new Map(provenance.value.skills.map((skill) => [skill.name, skill]));
  for (const entry of manifest.value.skills) {
    const dir = join(root, "skills", entry.name);
    const skill = skills.get(entry.name);
    if (skill === undefined) throw new Error(`${entry.name}: the roster skill has no recipe`);
    const takes = skill.files.some((file) =>
      file.passages.some((passage) => passage.origin === "taken"),
    );
    if (!takes) {
      for (const file of skill.files) wholeFile(join(dir, file.path));
      continue;
    }
    const upstream = new Map(
      skill.coverage.flatMap((file) =>
        file.segments.map((segment) => [`${file.source}\0${file.file}\0${segment.id}`, segment]),
      ),
    );
    const coverage = (source, file) =>
      skill.coverage.find((entry) => entry.source === source && entry.file === file);
    for (const file of skill.files) {
      const label = `${dir}/${file.path}`;
      const ours = new Set();
      /** The upstream text a written passage replaces, as its context. */
      const replaced = (at) => {
        const named = skill.coverage
          .flatMap((entry) => entry.segments)
          .filter(
            (segment) =>
              segment.account === "dropped" &&
              segment.replacedBy?.path === file.path &&
              segment.replacedBy?.passage === at,
          );
        const before = file.passages.slice(0, at).findLast((item) => item.origin === "taken");
        const after = file.passages.slice(at + 1).find((item) => item.origin === "taken");
        const anchor = before ?? after;
        const segments =
          anchor === undefined ? [] : (coverage(anchor.source, anchor.file)?.segments ?? []);
        const place = (id) => segments.findIndex((segment) => segment.id === id);
        const same = (item) =>
          item !== undefined && item.source === anchor.source && item.file === anchor.file;
        const low = same(before) ? place(before.segments.at(-1)) : -1;
        const high = same(after) ? place(after.segments[0]) : segments.length;
        const between = segments
          .slice(low + 1, high)
          .filter((segment) => segment.account === "dropped");
        return [...named, ...between].map((segment) => segment.text).join("\n");
      };
      for (const [at, passage] of file.passages.entries()) {
        if (passage.origin === "written") {
          const line = lineAt(file.text, passage.start);
          span(label, file.text.slice(passage.start, passage.end), replaced(at), line);
          const last = lineAt(file.text, passage.end);
          for (let at = line; at <= last; at += 1) ours.add(at);
          continue;
        }
        for (const id of new Set(passage.edits.map((edit) => edit.segment))) {
          const edits = passage.edits.filter((edit) => edit.segment === id);
          const before = upstream.get(`${passage.source}\0${passage.file}\0${id}`)?.text ?? "";
          const line = lineAt(file.text, edits[0].start);
          span(label, edited(before, edits), before, line);
          ours.add(line);
        }
      }
      // `--whole` also reads every upstream line of the copy: after the fold
      // (ADR 0039, S3) a copy says what greenline means throughout, so a home,
      // a status, a command or an OS temp path is checked wherever it sits.
      // The slash-invocation rule stays on greenline's lines; upstream route
      // and command examples are not skill invocations.
      if (whole)
        file.text.split("\n").forEach((line, index) => {
          if (!ours.has(index + 1)) out.push([`${label}:${index + 1}`, line, "", "upstream"]);
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
  const statuses = new Set(DOCUMENT_STATUSES);
  const argsSrc = readFileSync("src/shell/cli/args.ts", "utf8");
  // The root's commands only: a group's subcommand, such as connectors' `call`,
  // is no top-level command, so `greenline call` is refused while
  // `greenline connectors call` stays valid.
  const commands = new Set(
    [...argsSrc.matchAll(/\bprogram\s*\.command\("([a-z-]+)"\)/g)].map((m) => m[1]),
  );
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
    for (const m of s.matchAll(/`status: ([a-z]+)`|status `([a-z]+)`/g)) {
      const named = m[1] ?? m[2];
      if (!statuses.has(named) && ours(m[0]))
        bad.push(`${label}: status '${named}' is not a plan document's mark`);
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
