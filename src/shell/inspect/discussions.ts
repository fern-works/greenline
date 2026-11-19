import { readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { discussionRef } from "./refs.ts";
import { repositoryResolver } from "./links.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  researchReports,
  decisionLines,
  discussionPath,
  DISCUSSIONS_FOLDER,
  frameSectionOf,
  type DiscussionEntry,
  type DiscussionRecord,
} from "../../core/discussion.ts";
import { frameMapOf } from "../../core/frame-map.ts";
import type {
  DiscussionSummary,
  DiscussionView,
  FolderFile,
} from "../../core/inspector/documents.ts";
import { readGit } from "../code-tree.ts";
import { listDiscussions } from "../discussions.ts";
import { readShownFile } from "./repository-read.ts";

/*
 * The discussions as the inspector serves them (J-118 S4): each record the
 * ledger's discussions folder holds that reads, as a row with its idea, its
 * state, when it opened and was last touched, its decisions counted and the
 * changes it promoted, and as a page with its frame map, J-117's, derived
 * from its frame section live, its research reports, its decisions and its
 * links. A record that does not read is left out here; `greenline status`
 * names it (GL0480). Nothing here writes; git is read for the last commit
 * that touched each record or folder.
 */

/** The date of the last commit that touched a discussion's record or folder; null while none has or git cannot say. */
function touchedOn(root: string, id: string): string | null {
  const read = readGit(root, [
    "log",
    "-1",
    "--format=%cs",
    "--",
    discussionPath(id),
    `${DISCUSSIONS_FOLDER}/${id}`,
  ]);
  if (read._tag === "err") return null;
  const date = read.value.trim();
  return date === "" ? null : date;
}

function summaryOf(root: string, record: DiscussionRecord): DiscussionSummary {
  return {
    id: record.id,
    ref: discussionRef(record.id, record.idea),
    path: discussionPath(record.id),
    title: record.idea,
    state: record.state,
    opened: record.id.slice(0, 10),
    touched: touchedOn(root, record.id),
    decisions: decisionLines(record).length,
    promoted: record.changes,
  };
}

/** The records that read, from the entries on disk. */
function records(entries: readonly DiscussionEntry[]): readonly DiscussionRecord[] {
  return entries.flatMap((entry) => ("record" in entry ? [entry.record] : []));
}

/**
 * Every discussion that reads, as a list shows it, newest first.
 * @param root the repository root
 * @returns the rows
 */
export function discussionSummaries(root: string): readonly DiscussionSummary[] {
  return records(listDiscussions(root))
    .map((record) => summaryOf(root, record))
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** The research reports a discussion's folder holds, by file name, in their numbers' order. */
function researchOf(root: string, id: string): readonly string[] {
  try {
    return researchReports(
      readdirSync(join(root, DISCUSSIONS_FOLDER, id), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name),
    );
  } catch {
    return [];
  }
}

/**
 * One research report of a discussion, its text rendered (J-166 S1), or
 * undefined when the discussion holds no report by that name: only a name
 * its folder's listing gives is read.
 * @param root the repository root
 * @param id the discussion's id
 * @param file the report's file name
 * @returns the report, or undefined
 */
export function researchFile(root: string, id: string, file: string): FolderFile | undefined {
  if (!researchOf(root, id).includes(file)) return undefined;
  const folder = `${DISCUSSIONS_FOLDER}/${id}`;
  const shown = readShownFile(root, `${folder}/${file}`);
  return {
    file,
    text: shown.text,
    html: shown.text === null ? null : renderMarkdown(shown.text, repositoryResolver(folder)),
    problem: shown.problem,
  };
}

/**
 * One discussion for its page, or undefined when no record of that id reads.
 * @param root the repository root
 * @param id the discussion's id
 * @returns the page's view, or undefined
 */
export function discussionView(root: string, id: string): DiscussionView | undefined {
  const record = records(listDiscussions(root)).find((each) => each.id === id);
  if (record === undefined) return undefined;
  const frame = frameSectionOf(record);
  const map = frame === "" ? null : frameMapOf(frame);
  // The record's prose rendered as the change's is, its links resolved from where it stands (J-165 S1).
  const resolve = repositoryResolver(posix.dirname(discussionPath(id)));
  const restatement = map?.restatement.trim() ?? "";
  return {
    ...summaryOf(root, record),
    sections: record.sections
      .filter((section) => section.heading !== "frame")
      .map((section) => ({
        heading: section.heading,
        text: section.text,
        html: renderMarkdown(section.text, resolve),
      })),
    decisionLines: decisionLines(record),
    research: researchOf(root, id),
    map,
    restatementHtml: restatement === "" ? null : renderMarkdown(restatement, resolve),
    related: record.related,
    revisit: record.revisit ?? null,
    reason: record.reason ?? null,
    into: record.into ?? null,
    words: record.words ?? null,
  };
}
