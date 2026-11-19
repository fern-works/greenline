import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isBriefStep } from "../core/brief.ts";
import { parseRecordForm } from "../core/change.ts";
import { recordPath } from "../core/git-hooks.ts";
import { skillsHintNotice } from "../core/record-lint.ts";
import { changeLoads } from "./skill-loads.ts";

/**
 * The hooks' facts set beside the record's lines (J-176 S1; the register's
 * row of 2026-11-05, "The record's lines are the agent's"): where the
 * harness gives hooks, status shows what they saw as a hint the agent
 * reconciles against, and a line that disagrees with a hint is a notice,
 * never a refusal, since a harness without hooks has no such fact. Two
 * readings: the record's `skills` line against the loads the hooks noted,
 * and each fresh agent's report against its brief's nonce, which tells the
 * record the agent read the brief where the harness shows no spawn.
 */

/** A brief's nonce, as `greenline brief` writes it in the report's first line it asks for. */
const NONCE = /<!-- brief nonce ([0-9a-f]{4,}) -->/;

/** A brief's file name: its step and number. */
const BRIEF = /^brief-([a-z][a-z0-9-]*)-([1-9]\d*)\.md$/;

/** A fresh agent's report's file name: its step and number. */
const REPORT = /^([a-z][a-z0-9-]*)-([1-9]\d*)\.md$/;

/** The notice for a report whose brief's nonce it does not cite. */
const UNCITED = "so nothing shows the agent read it; say in the section how the agent was started";

/** The notice for a report of a briefed step that stands with no brief the command wrote (J-192 S1). */
const UNBRIEFED =
  "so nothing shows the agent read one; start each fresh agent from the path greenline brief prints";

/** A file's text, undefined where it does not read. */
function textOf(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The reports in a change's folder that do not cite their brief's nonce:
 * each `<step>-<n>.md` beside a `brief-<step>-<n>.md` whose nonce the
 * report does not carry.
 * @param root the repository root
 * @param id the change
 * @returns the reports, by file name
 */
function uncitedReports(root: string, id: string): readonly string[] {
  const folder = join(root, ".greenline", "ledger", id);
  let files: readonly string[];
  try {
    files = readdirSync(folder);
  } catch {
    return [];
  }
  return files.flatMap((file) => {
    const brief = BRIEF.exec(file);
    if (brief === null) return [];
    const nonce = NONCE.exec(textOf(join(folder, file)) ?? "")?.[1];
    const report = `${brief[1] ?? ""}-${brief[2] ?? ""}.md`;
    const text = textOf(join(folder, report));
    return nonce === undefined || text === undefined || text.includes(nonce) ? [] : [report];
  });
}

/**
 * The reports of a briefed step, design's, anticipate's, review's or
 * verify's, that stand with no brief beside them (J-192 S1): the command
 * writes every such step's brief, so a report with none was started from a
 * brief the builder wrote, or none.
 * @param root the repository root
 * @param id the change
 * @returns the reports, by file name
 */
function unbriefedReports(root: string, id: string): readonly string[] {
  const folder = join(root, ".greenline", "ledger", id);
  let files: readonly string[];
  try {
    files = readdirSync(folder);
  } catch {
    return [];
  }
  return files.filter((file) => {
    const report = REPORT.exec(file);
    return (
      report !== null &&
      isBriefStep(report[1] ?? "") &&
      !files.includes(`brief-${report[1] ?? ""}-${report[2] ?? ""}.md`)
    );
  });
}

/**
 * The after-tool notice for one report a tool wrote (J-192 S1): the hook
 * reads a helper's report for its brief's nonce, anticipate's as review's,
 * and names one that cites none, or one of a briefed step with no brief.
 * @param root the repository root
 * @param id the change
 * @param report the report's file name in the change's folder
 * @returns the notice, or undefined where the report cites its brief's nonce or is no briefed step's
 */
export function reportNonceNotice(root: string, id: string, report: string): string | undefined {
  if (uncitedReports(root, id).includes(report))
    return `${report} cites no nonce of its brief, ${UNCITED}`;
  if (unbriefedReports(root, id).includes(report))
    return `${report} stands with no brief greenline brief wrote, ${UNBRIEFED}`;
  return undefined;
}

/**
 * The hints line the mirror and status print beside an open change, where
 * a record's line disagrees with what the hooks saw, or undefined where
 * nothing disagrees.
 * @param root the repository root
 * @param id the change
 * @returns the line, unindented
 */
export function recordHintsLine(root: string, id: string): string | undefined {
  const text = textOf(join(root, recordPath(id)));
  if (text === undefined) return undefined;
  const form = parseRecordForm(`${id}.md`, text);
  const loaded = changeLoads(root, id).map((load) => load.skill);
  const skills =
    form._tag === "ok" && loaded.length > 0
      ? skillsHintNotice(form.value.skills, loaded)
      : undefined;
  const uncited = uncitedReports(root, id);
  const unbriefed = unbriefedReports(root, id);
  const notes = [
    ...(skills === undefined ? [] : [skills]),
    ...(uncited.length === 0
      ? []
      : [
          `${uncited.join(", ")} cite${uncited.length === 1 ? "s" : ""} no nonce of ${uncited.length === 1 ? "its" : "their"} brief, ${UNCITED}`,
        ]),
    ...(unbriefed.length === 0
      ? []
      : [
          `${unbriefed.join(", ")} stand${unbriefed.length === 1 ? "s" : ""} with no brief greenline brief wrote, ${UNBRIEFED}`,
        ]),
  ];
  return notes.length === 0 ? undefined : `hints: ${notes.join("; ")}`;
}
