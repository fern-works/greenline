import { h, type ComponentChild, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type {
  ChangedFiles,
  CheckStandingView,
  DeskChange,
  DeskClose,
  DeskDocument,
  DeskSince,
  DiscussionSummary,
  DriftNotice,
  HomeReading,
  WaitingOn,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import { StepStrip } from "./change.ts";
import {
  ArtefactFold,
  Callout,
  CheckBadge,
  ChoiceTiles,
  dayTime,
  Delta,
  drawReading,
  FileRow,
  FilesLine,
  Group,
  LinesDelta,
  ListBox,
  plural,
  RecordLink,
  SectionHead,
  StateWord,
  stateTone,
  tookWords,
  useDocument,
  When,
} from "./ui.ts";

/*
 * The desk, the first screen (J-155 S1, redrawn by J-166 S1 on the second
 * cut's system): the briefing in one column read in the owner's order, a
 * sentence saying what is happening, a card per change in progress, the
 * one that waits first, titled with the change's sentence, its steps with
 * the step now named, one line of its facts, what it waits on as tiles
 * with Copy, and what it changed since the owner's last look folded; at
 * most three, then how many more; then the last closes, one row each, the
 * newest open. Beside it at 1200 px and wider, under it on a phone: what
 * moved since the owner's last look, what needs care, and the open
 * discussions. Every component here draws from its props alone, so the
 * tests draw them from a document without a browser; the view reads the
 * document and keeps the owner's last look in the browser.
 */

const changePath = (id: string, part: string | null = null): string =>
  pathOf({ page: "change", id, part });

/** How many changes in progress the desk draws as cards before it counts the rest. */
const CARDS_SHOWN = 3;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How long ago a time was, in the owner's words.
 * @param iso the time
 * @param at the time the page is read at
 * @returns `just now`, `17 min ago`, `3 h ago` or `2 days ago`; empty when it does not read
 */
export function agoText(iso: string, at: Date): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((at.getTime() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * A time as the desk prints it: the clock time on the page's own day, the
 * date before it on another, then how long ago.
 * @param iso the time
 * @param at the time the page is read at
 * @returns `15:58, 17 min ago` or `28 Oct 15:58, 2 days ago`
 */
export function whenText(iso: string, at: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameDay = date.toDateString() === at.toDateString();
  const day = sameDay ? "" : `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} `;
  return `${day}${clock}, ${agoText(iso, at)}`;
}

/**
 * A state as the page says it: the contract's tokens in the practice's
 * words, `in-progress` read `in progress`.
 * @param state the state, null for a record that does not parse
 * @returns the words, `unreadable` for null
 */
export function stateWords(state: string | null): string {
  return state === null ? "unreadable" : state.replace(/-/g, " ");
}

function capitalised(text: string): string {
  return text === "" ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * The sentence at the head of the desk: what waits on the owner, what is
 * in progress, or that nothing is, then when the last change closed.
 */
export function DeskSummary(props: {
  readonly now: DeskDocument;
  readonly at: Date;
}): ComponentChild {
  const { now, at } = props;
  const waiting = now.inProgress.filter((change) => change.waitingOn !== null);
  const first = waiting[0] ?? now.inProgress[0];
  const name = (change: DeskChange): ComponentChild =>
    h("a", { href: change.ref.address }, change.ref.name);
  let sentence: ComponentChildren;
  if (now.unavailable !== null) sentence = "The ledger could not be read.";
  else if (first === undefined) sentence = "Nothing is in progress.";
  else if (waiting.length === 1 && first.waitingOn !== null)
    sentence = [name(first), " waits on you."];
  else if (waiting.length > 1) sentence = `${plural(waiting.length, "change")} wait on you.`;
  else if (now.inProgress.length === 1) sentence = [name(first), " is in progress."];
  else sentence = `${plural(now.inProgress.length, "change")} are in progress.`;
  const last = now.closes[0];
  return h(
    "header",
    { class: "desk-head", "data-component": "DeskSummary" },
    h(
      "h1",
      { class: "desk-title" },
      // The sentence says what waits; the waiting mark alone stands beside it.
      waiting.length > 0
        ? h("span", { class: "word", "data-tone": "need", "aria-hidden": "true" })
        : null,
      sentence,
    ),
    last === undefined
      ? h("p", { class: "lede" }, "No change has closed yet.")
      : h(
          "p",
          { class: "lede" },
          "The last change closed ",
          last.closedAt === null ? "with no commit read" : agoText(last.closedAt, at),
          ".",
        ),
  );
}

/**
 * What a change waits on from the owner (J-166 S1): the waiting mark, the
 * step it waits at and when it asked, the question in the agent's words,
 * its options as tiles side by side, each with a Copy that writes nothing,
 * and the step it waits at linked; the answer is given in the session.
 */
export function WaitingCard(props: {
  readonly change: string;
  readonly waiting: WaitingOn;
  readonly at: Date;
}): ComponentChild {
  const { waiting, at } = props;
  return h(
    "div",
    { class: "waiting", "data-component": "WaitingCard" },
    h(
      "p",
      { class: "waiting-label" },
      h(StateWord, { word: "waiting" }),
      waiting.step === null ? "" : ` at ${waiting.step}`,
      waiting.askedAt === null ? "" : `, asked ${whenText(waiting.askedAt, at)}`,
    ),
    h("p", { class: "waiting-question" }, capitalised(waiting.question)),
    waiting.options === null || waiting.options.length === 0
      ? null
      : h(ChoiceTiles, { question: waiting.question, options: waiting.options }),
    h(
      "p",
      { class: "meta" },
      "Answer in your session; the agent goes no further than this wait. ",
      waiting.step === null
        ? h("a", { href: changePath(props.change) }, "Open the change")
        : h("a", { href: changePath(props.change, waiting.step) }, `Open the ${waiting.step} step`),
    ),
  );
}

/** At most this many folders show on a card; the rest are counted and one click away. */
const FOLDERS_SHOWN = 4;
/** At most this many files show under one folder. */
const FILES_SHOWN = 4;

/** The files a change changed, by folder, each with its lines, since the owner's last look or in all. */
export function ChangedFilesList(props: {
  readonly change: string;
  readonly files: ChangedFiles;
  readonly since: string | null;
  readonly at: Date;
}): ComponentChild {
  const { files, since, at } = props;
  const lead =
    since === null ? "Changed so far" : `Changed since your last look, ${whenText(since, at)}`;
  if (files.unknown !== null)
    return h(
      "p",
      { class: "meta", "data-component": "ChangedFiles" },
      `${lead}: not read. ${files.unknown}`,
    );
  if (files.totals.files === 0)
    return h(
      "p",
      { class: "meta", "data-component": "ChangedFiles" },
      since === null
        ? "No file of the change's own committed yet."
        : "No file changed since your last look.",
    );
  const shown = files.groups.slice(0, FOLDERS_SHOWN);
  const rest = files.groups.slice(FOLDERS_SHOWN);
  return h(
    Group,
    {
      id: `changed:${props.change}`,
      title: lead,
      count: files.totals.files,
      quantity: h(LinesDelta, { added: files.totals.added, removed: files.totals.removed }),
      flat: false,
      component: "ChangedFiles",
    },
    h(
      "ul",
      { class: "rows" },
      shown.flatMap((group) =>
        group.files.slice(0, FILES_SHOWN).map((file) =>
          h(
            "li",
            { class: "file-line" },
            // Each file opens its lines across the change's commits (J-155 S2).
            h(
              "a",
              {
                href: pathOf({
                  page: "change",
                  id: props.change,
                  part: "changed",
                  changed: file.path,
                }),
              },
              h(FileRow, {
                path: file.path,
                added: file.added,
                removed: file.removed,
                name: `${group.folder === "." ? "" : `${group.folder}/`}${file.path.split("/").at(-1) ?? file.path}`,
              }),
            ),
          ),
        ),
      ),
    ),
    files.installed === 0 && rest.length === 0
      ? null
      : h(
          "p",
          { class: "meta" },
          rest.length === 0
            ? null
            : h(
                "a",
                { href: changePath(props.change, "changed") },
                `and ${plural(
                  rest.reduce((total, group) => total + group.count, 0),
                  "file",
                )} in ${plural(rest.length, "more folder")}`,
              ),
          rest.length === 0 || files.installed === 0 ? null : "; ",
          files.installed === 0 ? null : `${plural(files.installed, "file")} of greenline's own`,
        ),
  );
}

/** What the agent does next, in the record's words, where nothing waits on the owner. */
export function NextLine(props: {
  readonly next: string;
  readonly stopped: boolean;
}): ComponentChild {
  const split = /^([a-z][a-z0-9-]*): (.*)$/.exec(props.next);
  const step = split?.[1];
  const action = split?.[2] ?? props.next;
  return h(
    "p",
    { class: "next-line", "data-component": "NextLine" },
    h(
      "b",
      null,
      props.stopped
        ? `Stopped${step === undefined ? "" : ` at ${step}`}. When it resumes: `
        : "Next: ",
    ),
    capitalised(action),
  );
}

/** The latest check a change in progress ran, by its time. */
function lastCheck(checks: readonly CheckStandingView[]): CheckStandingView | undefined {
  let latest: CheckStandingView | undefined;
  for (const check of checks) {
    if (check.at === null) continue;
    const before = latest?.at ?? null;
    if (before === null || Date.parse(check.at) > Date.parse(before)) latest = check;
  }
  return latest;
}

/** A change in progress's one line of facts: its commits, its files with their lines, its last check. */
export function FactLine(props: {
  readonly change: DeskChange;
  readonly at: Date;
}): ComponentChild {
  const { change, at } = props;
  const check = lastCheck(change.checks);
  const parts: ComponentChild[] = [];
  if (change.commits !== null) parts.push(h("span", null, plural(change.commits, "commit")));
  if (change.size !== null)
    parts.push(
      h(
        "span",
        { class: "fact" },
        plural(change.size.files, "file"),
        " ",
        h(Delta, { added: change.size.added, removed: change.size.removed }),
      ),
    );
  if (check !== undefined && check.at !== null)
    parts.push(
      h(
        "span",
        { class: "fact" },
        check.name,
        " ",
        h(StateWord, { word: check.outcome }),
        " ",
        h(When, { iso: check.at, at }),
      ),
    );
  else parts.push(h("span", null, "no check yet"));
  if (change.lastAt !== null)
    parts.push(h("span", null, "last activity ", h(When, { iso: change.lastAt, at })));
  return h(
    "p",
    { class: "fact-line", "data-component": "FactLine" },
    parts.flatMap((part, index) =>
      index === 0 ? [part] : [h("span", { class: "dot-sep", "aria-hidden": "true" }, "·"), part],
    ),
  );
}

/** A change in progress: its sentence, its steps, one line of facts, what it waits on, what it changed and its open offer. */
export function ChangeCard(props: {
  readonly change: DeskChange;
  readonly since: string | null;
  readonly at: Date;
}): ComponentChild {
  const { change, at } = props;
  return h(
    "article",
    {
      class: "panel card-change",
      "data-component": "ChangeCard",
      "data-state": change.waitingOn === null ? (change.state ?? "unreadable") : "waiting",
    },
    h(
      "p",
      { class: "card-eyebrow" },
      h(StateWord, { word: stateWords(change.state) }),
      h("a", { href: change.ref.address }, change.ref.name),
      change.mode === null ? null : h("span", { class: "meta" }, change.mode),
    ),
    h(
      "h2",
      { class: "card-title" },
      h(
        "a",
        { href: change.ref.address, "data-item": "" },
        change.why ?? `The record does not parse: ${change.problem ?? "it cannot be read"}`,
      ),
    ),
    change.strip.length === 0
      ? null
      : h(StepStrip, { strip: change.strip, form: "dots", change: change.id }),
    h(FactLine, { change, at }),
    change.waitingOn !== null
      ? h(WaitingCard, { change: change.id, waiting: change.waitingOn, at })
      : change.next === null
        ? null
        : h(NextLine, { next: change.next, stopped: change.state === "stopped" }),
    change.changedFiles === null
      ? h("p", { class: "meta", "data-component": "ChangedFiles" }, "Its commits cannot be listed.")
      : h(ChangedFilesList, {
          change: change.id,
          files: change.changedFiles,
          since: props.since,
          at,
        }),
  );
}

/** The check of a close in words: each declared command's latest run, and whether it saw the final code. */
export function checkedText(close: DeskClose): string {
  const checked = close.checked;
  if (checked.total === 0) return "No check recorded.";
  if (checked.failed > 0)
    return `${checked.failed} of ${plural(checked.total, "check")} failed: ${checked.failing.join("; ")}.`;
  const final =
    checked.onFinal === checked.total
      ? "on the final code"
      : `${checked.onFinal} of them on the final code`;
  return checked.passed === checked.total
    ? `${checked.total === 1 ? "The 1 check" : `All ${checked.total} checks`} passed ${final}.`
    : `${checked.passed} of ${plural(checked.total, "check")} passed, ${final}.`;
}

/** When a close's commits began and ended: its first commit's time from its last and how long it took. */
function spanText(close: DeskClose, at: Date): string | null {
  if (close.closedAt === null) return null;
  const end = Date.parse(close.closedAt);
  if (Number.isNaN(end)) return null;
  const commits =
    close.commits === null ? "Its commits" : capitalised(plural(close.commits, "commit"));
  if (close.tookMinutes === null) return `${commits}, the last ${dayTime(close.closedAt, at)}.`;
  const start = new Date(end - close.tookMinutes * 60_000).toISOString();
  return `${commits}, ${dayTime(start, at)} to ${dayTime(close.closedAt, at)}.`;
}

/**
 * A closed change as one row (J-166 S1), a fold of one artefact: its mark
 * and name, its why on one line, its files with their lines, a check
 * badge, and when it closed and how long it took; opened, the why whole,
 * the folders, the checks in words, the commits' span and the change's
 * page. The newest stands open, and one whose check failed.
 */
export function CloseCard(props: {
  readonly close: DeskClose;
  readonly at: Date;
  readonly open: boolean;
}): ComponentChild {
  const { close, at } = props;
  const touched = close.touched;
  const failed = close.checked.failed > 0;
  const span = spanText(close, at);
  return h(ArtefactFold, {
    id: `close:${close.id}`,
    kind: "close",
    component: "CloseCard",
    open: props.open || failed,
    address: null,
    closed: null,
    attributes: { "data-state": close.state ?? "unreadable", class: "fold close-card" },
    head: [
      h(StateWord, { word: stateWords(close.state) }),
      h("a", { class: "title", href: changePath(close.id) }, close.ref.name),
      close.why === null ? null : h("span", { class: "close-why" }, close.why),
      h(
        "span",
        { class: "close-facts" },
        touched === null || touched.unknown !== null || touched.totals.files === 0
          ? null
          : h(
              "span",
              { class: "fact" },
              plural(touched.totals.files, "file"),
              " ",
              h(Delta, { added: touched.totals.added, removed: touched.totals.removed }),
            ),
        h(CheckBadge, close.checked),
        close.closedAt === null
          ? null
          : h(
              "span",
              { class: "meta" },
              h(When, { iso: close.closedAt, at }),
              close.tookMinutes === null ? null : ` · ${tookWords(close.tookMinutes)}`,
            ),
      ),
    ],
    held: {
      read: () =>
        h(
          "div",
          { class: "close-open" },
          close.why === null ? null : h("p", { class: "summary-text" }, close.why),
          touched === null
            ? h("p", { class: "meta" }, "Its commits cannot be listed.")
            : touched.unknown !== null
              ? h("p", { class: "meta" }, `Its files are not read: ${touched.unknown}`)
              : touched.totals.files === 0
                ? h(
                    "p",
                    { class: "meta" },
                    "No file of its own: its commits wrote the records alone.",
                  )
                : h(FilesLine, { files: touched }),
          h(
            "p",
            {
              class: failed ? "close-checked" : "close-checked meta",
              "data-tone": failed ? "fail" : undefined,
            },
            checkedText(close),
          ),
          span === null ? null : h("p", { class: "meta" }, span),
          h(
            "p",
            null,
            h("a", { href: changePath(close.id), "data-item": "" }, `Open ${close.ref.name}`),
            " · ",
            h("a", { href: changePath(close.id, "code") }, "its code"),
          ),
        ),
      source: null,
      json: {
        text: JSON.stringify(close, null, 2),
        address: `/api/changes/${encodeURIComponent(close.id)}`,
      },
    },
  });
}

/**
 * What moved since the owner's last look (J-166 S1): the commits, the
 * changes that opened, moved or closed, the pictures, and the files with
 * their lines, folded by folder; on a first look, that the next look says.
 */
export function SinceLine(props: {
  readonly since: DeskSince | null;
  readonly at: Date;
}): ComponentChild {
  const { since, at } = props;
  if (since === null)
    return h(
      "section",
      { class: "since", "data-component": "SinceLine", "aria-label": "Since your last look" },
      h(SectionHead, { title: "Since your last look" }),
      h(
        "p",
        { class: "meta" },
        "This is your first look from this browser; the next one says what moved since.",
      ),
    );
  const files = since.changedFiles;
  const moved = since.changes.map((entry) => [
    h("a", { href: entry.change.address }, entry.change.name),
    ` ${entry.happened}`,
  ]);
  const quiet = since.commits === 0 && since.changes.length === 0 && since.pictures === 0;
  return h(
    "section",
    { class: "since", "data-component": "SinceLine", "aria-label": "Since your last look" },
    h(SectionHead, {
      title: "Since your last look",
      aside: h(When, { iso: since.at, at }),
    }),
    quiet
      ? h("p", { class: "meta" }, "Nothing moved: no commit, no change, no picture.")
      : h(
          "p",
          { class: "since-words" },
          plural(since.commits, "commit"),
          moved.length === 0
            ? null
            : [", ", moved.flatMap((part, index) => (index === 0 ? [part] : ["; ", part]))],
          since.pictures === 0 ? null : `, ${plural(since.pictures, "picture")}`,
          ".",
        ),
    files.unknown !== null || files.totals.files === 0
      ? null
      : h(
          ListBox,
          { label: "The files since your last look" },
          h(
            Group,
            {
              id: "since-files",
              title: plural(files.totals.files, "file"),
              count: files.groups.length,
              quantity: h(LinesDelta, { added: files.totals.added, removed: files.totals.removed }),
              flat: false,
              open: false,
            },
            h(
              "ul",
              { class: "rows" },
              files.groups.flatMap((group) =>
                group.files.map((file) =>
                  h(
                    "li",
                    { class: "file-line" },
                    h(FileRow, {
                      path: file.path,
                      added: file.added,
                      removed: file.removed,
                      name: `${group.folder === "." ? "" : `${group.folder}/`}${file.path.split("/").at(-1) ?? file.path}`,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
  );
}

/** The change a drifted picture or page was made under, read from its id. */
function changeOf(notice: DriftNotice): string | null {
  const head = notice.id.split("/")[0] ?? "";
  return /^\d{4}-\d{2}-\d{2}-/.test(head) ? head : null;
}

/** The commits a drifted item stands behind, read from its detail. */
function behindOf(notice: DriftNotice): number {
  const found = /(\d+) commits? since/.exec(notice.detail);
  return found === null ? 0 : Number(found[1]);
}

/**
 * What drifted from the code, in one line (J-166 S1): how many pictures or
 * pages, from how many changes, the oldest so many commits behind, folded
 * by change.
 */
export function DriftLine(props: { readonly drift: HomeReading<DriftNotice> }): ComponentChild {
  const drift = props.drift;
  if (!drift.available)
    return h(
      "p",
      { class: "care-line meta", "data-component": "DriftLine" },
      `The pictures could not be read: ${drift.reason}`,
    );
  const items = drift.items;
  if (items.length === 0)
    return h(
      "p",
      { class: "care-line", "data-component": "DriftLine" },
      h(StateWord, { word: "fresh" }),
      " Nothing drifted: every picture and page matches its code.",
    );
  const pictures = items.filter((item) => item.kind === "visual").length;
  const noun =
    pictures === items.length
      ? items.length === 1
        ? "picture"
        : "pictures"
      : pictures === 0
        ? items.length === 1
          ? "page"
          : "pages"
        : "pictures and pages";
  const captures = items.every((item) => item.kind === "visual" && item.id.includes("/capture-"));
  const byChange = new Map<string, DriftNotice[]>();
  for (const item of items) {
    const key = changeOf(item) ?? "";
    byChange.set(key, [...(byChange.get(key) ?? []), item]);
  }
  const oldest = Math.max(0, ...items.map(behindOf));
  const changes = [...byChange.keys()].filter((key) => key !== "").length;
  return h(
    Group,
    {
      id: "care-drift",
      title: [
        h("span", {
          class: "word",
          "data-tone": "warn",
          "data-settled": "yes",
          "aria-hidden": "true",
        }),
        " ",
        `${String(items.length)} ${noun}`,
        changes === 0 ? "" : ` from ${plural(changes, "change")}`,
        " drifted",
        oldest === 0 ? "" : `, the oldest ${plural(oldest, "commit")} behind`,
      ],
      // The count of what the fold holds: a line per change.
      count: byChange.size,
      flat: false,
      open: false,
      component: "DriftLine",
    },
    h(
      "ul",
      { class: "rows" },
      [...byChange].map(([change, notices]) =>
        h(
          "li",
          null,
          h(
            "div",
            { class: "row-top" },
            change === ""
              ? h("span", { class: "title" }, "Under no change")
              : h(
                  "a",
                  { class: "title", href: changePath(change) },
                  h(RecordLink, {
                    kind: "change",
                    id: change,
                    href: changePath(change),
                    plain: true,
                  }),
                ),
            h(
              "span",
              { class: "meta" },
              `${plural(notices.length, "item")}, ${plural(Math.max(0, ...notices.map(behindOf)), "commit")} behind`,
            ),
          ),
        ),
      ),
    ),
    h(
      "p",
      { class: "meta" },
      h(
        "a",
        {
          href: captures
            ? pathOf({ page: "atlas", tab: "interfaces" })
            : pathOf({ page: "atlas", tab: "visuals" }),
        },
        captures ? "Open the pages in Interface" : "Open the pictures",
      ),
    ),
  );
}

/** One line of what needs care: its mark, its words and where it is fixed. */
interface CareLine {
  readonly key: string;
  readonly word: string;
  readonly text: string;
  readonly address: string | null;
}

/**
 * What needs the owner's care (J-166 S1), at most five lines grouped by
 * kind, each with its mark: the drift by change with its age in commits,
 * the failing checks, greenline's health and the open notes.
 */
export function CareList(props: { readonly now: DeskDocument }): ComponentChild {
  const { now } = props;
  const failing = [
    ...now.inProgress.map((change) => ({
      change,
      failed: change.checks
        .filter((check) => check.outcome === "failed")
        .map((check) => check.name),
    })),
    ...now.closes.map((close) => ({ change: close, failed: close.checked.failing })),
  ].filter((entry) => entry.failed.length > 0);
  const lines: CareLine[] = [];
  for (const entry of failing.slice(0, 2))
    lines.push({
      key: `failing:${entry.change.id}`,
      word: "failed",
      text: `${entry.change.ref.name}: ${entry.failed.join("; ")} failed`,
      address: changePath(entry.change.id, "code"),
    });
  if (failing.length === 0)
    lines.push({ key: "checks", word: "passed", text: "No failing check.", address: null });
  const { errors, warnings } = now.diagnostics;
  lines.push(
    errors === 0 && warnings === 0
      ? {
          key: "health",
          word: "ok",
          text: "greenline's health reports nothing to correct.",
          address: null,
        }
      : {
          key: "health",
          word: errors > 0 ? "error" : "warning",
          text: `${plural(errors, "error")} and ${plural(warnings, "warning")} in greenline's health`,
          address: pathOf({ page: "practice" }),
        },
  );
  const notes = now.care.find((item) => item.kind === "notes");
  if (notes !== undefined && notes.count > 0)
    lines.push({ key: "notes", word: "note", text: notes.text, address: notes.address });
  return h(
    "section",
    { class: "care", "data-component": "CareList", "aria-label": "Needs care" },
    h(SectionHead, { title: "Needs care" }),
    h(DriftLine, { drift: now.drift }),
    h(
      "ul",
      { class: "care-lines" },
      lines.slice(0, 4).map((line) =>
        h(
          "li",
          { "data-tone": stateTone(line.word).tone },
          h("span", {
            class: "word",
            "data-tone": stateTone(line.word).tone,
            "data-settled": "yes",
            "aria-hidden": "true",
          }),
          line.address === null
            ? h("span", null, line.text)
            : h("a", { href: line.address }, line.text),
        ),
      ),
    ),
  );
}

/** The open discussions, each by its idea. */
export function OpenDiscussions(props: {
  readonly discussions: HomeReading<DiscussionSummary>;
}): ComponentChild {
  const reading = props.discussions;
  const body = !reading.available
    ? h("p", { class: "meta" }, `The discussions could not be read: ${reading.reason}`)
    : reading.items.length === 0
      ? h(
          "p",
          { class: "meta" },
          "No discussion is open. An idea you talk through with the agent shows here until it becomes a change.",
        )
      : h(
          "ul",
          { class: "ideas" },
          reading.items.map((discussion) =>
            h(
              "li",
              null,
              h(StateWord, { word: discussion.state }),
              h(
                "a",
                { href: pathOf({ page: "discussion", id: discussion.id }), "data-item": "" },
                discussion.title,
              ),
            ),
          ),
        );
  return h(
    "section",
    { class: "discussions", "data-component": "OpenDiscussions", "aria-label": "Discussions" },
    h(SectionHead, {
      title: "Discussions",
      count: reading.available && reading.items.length > 0 ? reading.items.length : null,
      aside: h("a", { href: pathOf({ page: "discussions" }) }, "All discussions"),
    }),
    body,
  );
}

/**
 * The desk drawn from its document: the briefing, the sentence, the
 * changes in progress, the one that waits first, at most three, and the
 * last closes; beside it, what moved since the owner's last look, what
 * needs care and the open discussions.
 */
export function Desk(props: { readonly now: DeskDocument; readonly at: Date }): ComponentChild {
  const { now, at } = props;
  const ordered = [
    ...now.inProgress.filter((change) => change.waitingOn !== null),
    ...now.inProgress.filter((change) => change.waitingOn === null),
  ];
  const shown = ordered.slice(0, CARDS_SHOWN);
  const more = ordered.length - shown.length;
  return h(
    "div",
    { class: "desk" },
    h(
      "div",
      { class: "desk-brief" },
      h(DeskSummary, { now, at }),
      now.unavailable === null
        ? null
        : h(
            Callout,
            null,
            `The ledger could not be read: ${now.unavailable}. greenline status says the same in the terminal.`,
          ),
      shown.length === 0
        ? null
        : h(
            "section",
            { class: "desk-cards", "aria-label": "In progress" },
            shown.map((change) => h(ChangeCard, { change, since: now.since?.at ?? null, at })),
            more === 0
              ? null
              : h(
                  "p",
                  { class: "meta" },
                  h(
                    "a",
                    { href: pathOf({ page: "changes" }) },
                    `and ${plural(more, "more change")} in progress`,
                  ),
                ),
          ),
      h(
        "section",
        { class: "desk-closes", "aria-label": "The last closes" },
        h(SectionHead, {
          title: now.closes.length === 1 ? "The last close" : "The last closes",
          count: now.closes.length > 1 ? now.closes.length : null,
          aside: h("a", { href: pathOf({ page: "changes" }) }, "All changes"),
        }),
        now.closes.length === 0
          ? h("p", { class: "meta" }, "No change has closed yet.")
          : h(
              "div",
              { class: "close-list" },
              now.closes.map((close, index) => h(CloseCard, { close, at, open: index === 0 })),
            ),
      ),
    ),
    h(
      "aside",
      { class: "desk-aside", "aria-label": "Beside the briefing" },
      h(SinceLine, { since: now.since, at }),
      h(CareList, { now }),
      h(OpenDiscussions, { discussions: now.discussions }),
    ),
  );
}

/** Where the browser keeps the owner's last look at the desk. */
const LAST_LOOK = "greenline.desk.lastLook";

function storedLook(): string | null {
  try {
    return window.localStorage.getItem(LAST_LOOK);
  } catch {
    return null;
  }
}

function storeLook(at: string): void {
  try {
    window.localStorage.setItem(LAST_LOOK, at);
  } catch {
    // A browser that keeps nothing shows every change's files whole.
  }
}

/**
 * The desk's view: reads the desk's document for the owner's last look,
 * which the browser keeps, and sets that look to now when the owner leaves.
 */
export function DeskView(): ComponentChild {
  const [since] = useState(storedLook);
  useEffect(() => {
    const leave = (): void => storeLook(new Date().toISOString());
    window.addEventListener("pagehide", leave);
    return () => {
      leave();
      window.removeEventListener("pagehide", leave);
    };
  }, []);
  const address = since === null ? "/api/desk" : `/api/desk?since=${encodeURIComponent(since)}`;
  const reading = useDocument(address, "desk");
  return h(
    "section",
    { "data-view": "desk" },
    drawReading(
      reading,
      (desk) => h(Desk, { now: desk, at: new Date() }),
      "the ledger, what is moving in this repository",
      "cards",
    ),
  );
}
