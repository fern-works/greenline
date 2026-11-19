import {
  createContext,
  h,
  type ComponentChild,
  type ComponentChildren,
  type Context,
} from "preact";
import { useContext, useState } from "preact/hooks";
import type { FrameMap, FrameQuestion } from "../../../core/frame-map.ts";
import type {
  BriefEntry,
  ChangeDocument,
  ChangedFile,
  ChangedFiles,
  ChangedFilesDocument,
  CheckFactsDocument,
  CommitsDocument,
  DiffCommit,
  DiffNet,
  DocumentKind,
  DocumentOf,
  FolderEntry,
  FolderFile,
  FrameMapDocument,
  NumberedDiffLine,
  PicturesDocument,
  SearchEntry,
  SectionView,
  SkillLoad,
  OwedView,
  SkillLoadsDocument,
  SourceDocument,
  StepDocument,
  StepSummary,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import { ChangeVisuals } from "./atlas.ts";
import {
  checkCounts,
  ChecksByCommand,
  CommitList,
  GroundFacts,
  LineageStrip,
  RecordFacts,
  StepStrip,
  type LineageHop,
} from "./change.ts";
import { stateWords } from "./desk.ts";
import { FrameMapView } from "./frame.ts";
import { LoadRow } from "./roster.ts";
import {
  ArtefactFold,
  Callout,
  ChoiceTiles,
  drawReading,
  Empty,
  FileRow,
  FilesLine,
  folderName,
  Group,
  JsonView,
  LinesDelta,
  ListBox,
  plural,
  Prose,
  ReadState,
  SectionHead,
  SourceView,
  StateWord,
  Tag,
  tookWords,
  useDocument,
  when,
  type Reading,
} from "./ui.ts";

/*
 * The change page, cut by artefact (J-166 S1, on J-165's documents): a
 * short head, the crumbs, the name, a line of its facts as chips, a line of
 * its times and the one sentence it opens on, the record's outcome where
 * it holds one, else the why asked; a waiting banner only while something
 * waits, its options as tiles; an outcome card of four rows, each linking
 * its tab, what changed, what was checked, what was decided and what the
 * folder kept; the step rail; and four tabs at their own addresses:
 * Overview, what you decided; Steps, each step folded with its evidence,
 * its skill loads and its pictures; Code, the files by folder with each
 * file's lines inline under its row, the commits and the checks by
 * command; and Record, the front matter, the record's source, the close's
 * paragraphs and what the status says. The head draws at once from the
 * change's head document; every part is read from its own address once,
 * shared by the parts that draw it, and a part handed in is drawn as given.
 */

/** The parts of a change's page, each its own document; a part given here is drawn and not read (J-165 S1). */
export interface ChangeParts {
  readonly changed?: ChangedFilesDocument;
  readonly checks?: CheckFactsDocument;
  readonly commits?: CommitsDocument;
  readonly frame?: FrameMapDocument;
  readonly pictures?: PicturesDocument;
  readonly loads?: SkillLoadsDocument;
  readonly source?: SourceDocument;
  /** The close step's words, which the Record tab draws as its paragraphs. */
  readonly close?: StepDocument;
}

/** The parts the page's view has read once, by their address under the change's, shared by every part that draws them (J-166 S1). */
export const PartReadings: Context<ReadonlyMap<string, Reading<unknown>> | null> =
  createContext<ReadonlyMap<string, Reading<unknown>> | null>(null);

/** How a part of the page is drawn: its address under the change's, its kind, and what stands while it reads or where it fails. */
interface PartDrawing<K extends DocumentKind> {
  readonly change: string;
  readonly aspect: string;
  readonly kind: K;
  /** What is read, as a phrase, for the read's states. */
  readonly reads: string;
  readonly draw: (document: DocumentOf<K>) => ComponentChild;
  /** What stands while it reads; the loading face where none is named. */
  readonly waiting?: ComponentChild;
  /** What stands where it fails; the failed face where none is named. */
  readonly failed?: ComponentChild;
}

/** A part read from its own address, or from the page's shared reading of it, drawn once it arrives (J-165 S1). */
function ChangePart<K extends DocumentKind>(props: PartDrawing<K>): ComponentChild {
  const shared = useContext(PartReadings)?.get(props.aspect);
  const own: Reading<DocumentOf<K>> = useDocument(
    `/api/changes/${encodeURIComponent(props.change)}/${props.aspect}`,
    props.kind,
    shared === undefined,
  );
  // SAFETY: the page reads a shared part from the same address, of the same kind.
  const reading = (shared as Reading<DocumentOf<K>> | undefined) ?? own;
  if (reading.state === "reading" && props.waiting !== undefined) return props.waiting;
  if (reading.state === "failed" && props.failed !== undefined) return props.failed;
  return drawReading(reading, props.draw, props.reads);
}

/** A part of the page: the one given drawn as it is, else read from its own address. */
function partShown<K extends DocumentKind>(
  given: DocumentOf<K> | undefined,
  drawing: PartDrawing<K>,
): ComponentChild {
  return given === undefined ? h(ChangePart<K>, drawing) : drawing.draw(given);
}

/** The four tabs, each an artefact of the change. */
export type ChangeTab = "overview" | "steps" | "code" | "record";

const TABS: readonly {
  readonly tab: ChangeTab;
  readonly label: string;
  readonly part: string | null;
}[] = [
  { tab: "overview", label: "Overview", part: null },
  { tab: "steps", label: "Steps", part: "steps" },
  { tab: "code", label: "Code", part: "code" },
  { tab: "record", label: "Record", part: "record" },
];

/** The parts an address names that open the Code tab. */
const CODE_PARTS: ReadonlySet<string> = new Set(["code", "changed", "commits", "checks"]);
/** The parts that open the Record tab. */
const RECORD_PARTS: ReadonlySet<string> = new Set(["record", "source"]);
/** The parts that open the Overview: the page itself, what waits and why. */
const OVERVIEW_PARTS: ReadonlySet<string> = new Set(["waiting", "why", "decided"]);

/**
 * The tab an address opens: the change's own address, what waits and why
 * open the Overview; the code, a changed file, the commits and the checks
 * open Code; the record and its source open Record; a step, a file of the
 * folder, the frame map, the deal, the pictures and the loads open Steps.
 * @param part the part the address names
 * @param changed a changed file the address names
 * @returns the tab
 */
export function tabOf(part: string | null, changed: string | null): ChangeTab {
  if (changed !== null) return "code";
  if (part === null || OVERVIEW_PARTS.has(part)) return "overview";
  if (CODE_PARTS.has(part)) return "code";
  if (RECORD_PARTS.has(part)) return "record";
  return "steps";
}

const changePath = (id: string, part: string | null = null): string =>
  pathOf({ page: "change", id, part });

/** The tabs, each a link to its address, the one shown marked, each with its count where it has one. */
function ChangeTabs(props: {
  readonly change: string;
  readonly tab: ChangeTab;
  readonly counts: Partial<Readonly<Record<ChangeTab, number>>>;
}): ComponentChild {
  return h(
    "nav",
    {
      class: "tabs change-tabs",
      "aria-label": "The change's artefacts",
      "data-component": "ChangeTabs",
    },
    TABS.map((entry) => {
      const count = props.counts[entry.tab];
      return h(
        "a",
        {
          href: changePath(props.change, entry.part),
          "aria-current": entry.tab === props.tab ? ("page" as const) : undefined,
        },
        entry.label,
        count === undefined ? null : h("span", { class: "count" }, String(count)),
      );
    }),
  );
}

/** A step's count, where the record holds one the inspector can count: the frame's questions, a looped step's rounds. */
function countOf(step: StepSummary, frame: FrameMap | null): string | null {
  if (step.heading === "frame" && frame !== null && frame.questions.length > 0) {
    const owner = frame.questions.filter((question) => question.decided === "owner").length;
    return `${plural(frame.questions.length, "question")}, you answered ${String(owner)}`;
  }
  if (step.rounds > 1) return plural(step.rounds, "round");
  return null;
}

/** A step's state in the page's words. */
function stepWord(step: StepSummary): string {
  if (step.current) return "now";
  if (step.state === "in-plan") return step.heldBy === "plan" ? "in the plan" : "in the tickets";
  if (step.state === "not-yet") return "not yet";
  return step.state;
}

/** A step's glyph, which reads its state at a glance beside its word. */
function glyphOf(step: StepSummary): string {
  if (step.current) return "▶";
  if (step.state === "written") return "✓";
  if (step.state === "skipped") return "–";
  if (step.state === "in-plan") return "◇";
  return "·";
}

/** A depth the mode gives a step beyond its written section, as a chip: inline, fresh agents, rounds. */
function depthChip(step: StepSummary): ComponentChild {
  if (step.depth === null || step.depth === "written" || step.state === "skipped") return null;
  return h("span", { class: "chip-depth" }, step.depth);
}

/**
 * One step folded (J-164 S1, an artefact fold; J-166 S1): its glyph, its
 * name, its state, a depth chip and its count in the head; opened, its
 * words read from the step document and what the page gives the step, its
 * evidence, its loads and its frame map, with its Markdown as Source and
 * the document as JSON.
 */
export function StepFold(props: {
  readonly change: string;
  readonly step: StepSummary;
  readonly open: boolean;
  readonly frame: FrameMap | null;
  /** What the step's fold holds under its words: its evidence, its loads, its frame map. */
  readonly more?: ComponentChildren;
}): ComponentChild {
  const { step } = props;
  const count = countOf(step, props.frame);
  const line =
    step.line ??
    (count !== null
      ? count
      : step.written
        ? null
        : step.state === "in-plan"
          ? null
          : "not written yet");
  const words = step.written && step.state !== "skipped";
  const more = props.more ?? null;
  return h(ArtefactFold<"step">, {
    id: step.heading,
    kind: "step",
    component: "StepFold",
    open: props.open,
    address: changePath(props.change, step.heading),
    closed: changePath(props.change, "steps"),
    attributes: { "data-state": step.state, "data-kind": step.kind },
    head: [
      h(
        "span",
        { class: "glyph", "data-state": step.current ? "now" : step.state, "aria-hidden": "true" },
        glyphOf(step),
      ),
      h("span", { class: "title" }, step.heading),
      h(StateWord, { word: stepWord(step) }),
      depthChip(step),
      line === null ? null : h("span", { class: "fold-line" }, line),
    ],
    document: words
      ? {
          address: `/api/changes/${encodeURIComponent(props.change)}/steps/${encodeURIComponent(step.heading)}`,
          kind: "step",
          reads: "this step's words",
          read: (document: StepDocument) => [h(StepBody, { section: document.section }), more],
          source: (document: StepDocument) => document.section.text,
        }
      : undefined,
    held: words
      ? undefined
      : {
          read: () => [
            h(
              "p",
              { class: "meta" },
              step.state === "skipped"
                ? "Skipped at this mode."
                : step.state === "in-plan"
                  ? "Held by the plan's records."
                  : "Not written yet.",
            ),
            more,
          ],
          source: null,
          json: null,
        },
  });
}

/** A step's words, rendered, or what stands in their place; the line naming the skill it followed is left to the loads. */
export function StepBody(props: { readonly section: SectionView }): ComponentChild {
  const section = props.section;
  if (section.state === "skipped") return h("p", { class: "meta" }, section.text.trim());
  if (section.state === "in-plan")
    return h(
      "p",
      { class: "meta" },
      section.heldBy === "plan" ? "Held by the planning record." : "Held by the tickets' records.",
    );
  return section.html === ""
    ? h("p", { class: "meta" }, "Not written yet.")
    : h(
        "div",
        { class: "fold-body", "data-component": "StepBody" },
        h(Prose, { html: section.html }),
      );
}

/** A report's or a brief's title from its name: `review-2.md` reads `review 2`. */
function fileTitle(file: string): string {
  const brief = /^brief-([a-z][a-z0-9-]*)-(\d+)\.md$/.exec(file);
  if (brief !== null) return `brief for ${brief[1] ?? ""} ${brief[2] ?? ""}`;
  const named = /^([a-z][a-z0-9-]*)-(\d+)\.md$/.exec(file);
  return named === null ? file : `${named[1] ?? ""} ${named[2] ?? ""}`;
}

/**
 * The step a file of the folder was written for, by its name: a report
 * `review-1.md` and its brief `brief-review-1.md` the review's, a file under
 * `verify/` the verify's, an interface check's run the verify's.
 * @param file the file's path in the folder
 * @returns the step, or null where the name names none
 */
export function stepOfFile(file: string): string | null {
  const folder = /^([a-z][a-z0-9-]*)\//.exec(file)?.[1];
  if (folder === "interface") return "verify";
  if (folder !== undefined) return folder;
  const brief = /^brief-([a-z][a-z0-9-]*)-\d+\.md$/.exec(file)?.[1];
  if (brief !== undefined) return brief;
  return /^([a-z][a-z0-9-]*)-\d+\.md$/.exec(file)?.[1] ?? null;
}

/** One file of the change's folder folded: its title and name open, its text read when it opens. */
export function FolderFileView(props: {
  readonly change: string;
  readonly file: FolderEntry | BriefEntry;
  readonly open: boolean;
}): ComponentChild {
  const file = props.file;
  const brief =
    "written" in file
      ? file.written
        ? null
        : h(Tag, null, "not written by greenline brief")
      : null;
  return h(ArtefactFold<"file">, {
    id: file.file,
    kind: "file",
    component: "FolderFileView",
    open: props.open,
    address: pathOf({ page: "change", id: props.change, part: null, file: file.file }),
    closed: changePath(props.change, "steps"),
    head: [
      h("span", { class: "title" }, fileTitle(file.file)),
      fileTitle(file.file) === file.file ? null : h("span", { class: "mono meta" }, file.file),
      brief,
    ],
    document: {
      address: `/api/changes/${encodeURIComponent(props.change)}/files/${file.file.split("/").map(encodeURIComponent).join("/")}`,
      kind: "file",
      reads: "this file of the change's folder",
      read: (document) => h(FileBody, { file: document.file }),
      source: (document) => document.file.text,
    },
  });
}

/** A file of the folder as it reads: Markdown rendered, a JSON fact shaped, any other text as it stands. */
export function FileBody(props: { readonly file: FolderFile }): ComponentChild {
  const file = props.file;
  if (file.text === null) return h("p", { class: "meta" }, file.problem ?? "It cannot be shown.");
  if (file.html === null && file.file.endsWith(".json")) {
    let pretty: string | null = null;
    try {
      pretty = JSON.stringify(JSON.parse(file.text), null, 2);
    } catch {
      pretty = null;
    }
    if (pretty !== null)
      return h(
        "div",
        { class: "fold-body", "data-component": "FileBody" },
        h(JsonView, { text: pretty, address: null }),
      );
  }
  return h(
    "div",
    { class: "fold-body", "data-component": "FileBody" },
    file.html === null ? h("pre", null, file.text) : h(Prose, { html: file.html }),
  );
}

/** One line's sign in the unified form. */
const sign = (line: { readonly kind: string }): string =>
  line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";

/**
 * A changed file's lines as raw text: the net change where git read one,
 * else each commit's under its hash and subject, the unified form, `+`
 * added, `-` removed.
 * @param commits the commits that touched it, the oldest first
 * @param net the net change across the change, where read
 * @returns the text
 */
export function diffSource(commits: readonly DiffCommit[], net: DiffNet | null = null): string {
  if (net !== null)
    return `@@ ${net.from === null ? "the start" : net.from.slice(0, 7)} to ${net.to.slice(0, 7)}\n${net.lines
      .map((line) => `${sign(line)}${line.line}`)
      .join("\n")}`;
  return commits
    .map(
      (commit) =>
        `@@ ${commit.hash.slice(0, 7)} ${commit.subject}\n${commit.lines
          .map((line) => `${sign(line)}${line.line}`)
          .join("\n")}`,
    )
    .join("\n");
}

/** One changed file folded: its row in the head, its lines opened under it, the net change by default. */
function ChangedFileFold(props: {
  readonly change: string;
  readonly file: ChangedFile;
  readonly open: boolean;
}): ComponentChild {
  const { file } = props;
  return h(ArtefactFold<"diff">, {
    id: file.path,
    kind: "diff",
    component: "ChangedFile",
    open: props.open,
    address: pathOf({ page: "change", id: props.change, part: "changed", changed: file.path }),
    closed: changePath(props.change, "code"),
    attributes: { "data-changed": file.path },
    head: h(FileRow, { path: file.path, added: file.added, removed: file.removed }),
    document: {
      address: `/api/changes/${encodeURIComponent(props.change)}/changed/${file.path.split("/").map(encodeURIComponent).join("/")}`,
      kind: "diff",
      reads: "this file's lines across the change's commits",
      read: (document) =>
        h(DiffBody, {
          path: document.path,
          commits: document.commits,
          net: document.net,
          unknown: document.unknown,
        }),
      source: (document) => diffSource(document.commits, document.net),
    },
  });
}

/** The lines added and removed under a folder. */
function folderLines(files: readonly ChangedFile[]) {
  return {
    added: files.reduce((total, file) => total + (file.added ?? 0), 0),
    removed: files.reduce((total, file) => total + (file.removed ?? 0), 0),
  };
}

/**
 * The files the change's commits touched (J-164 S1, J-166 S1): the files
 * line, then each folder a group with its count and its lines, its files
 * by the lines they changed, each a row whose lines open under it.
 */
export function ChangedTree(props: {
  readonly change: string;
  readonly files: ChangedFiles;
  readonly open: string | null;
}): ComponentChild {
  const files = props.files;
  if (files.unknown !== null)
    return h(
      "p",
      { class: "meta", "data-component": "ChangedTree" },
      `The files are not read: ${files.unknown}`,
    );
  if (files.totals.files === 0)
    return h(
      "div",
      { "data-component": "ChangedTree" },
      h(
        Empty,
        { title: "No file of its own changed." },
        h(
          "p",
          null,
          files.installed === 0
            ? "The change's commits wrote its record alone."
            : `Its commits touched ${plural(files.installed, "file")} of greenline's own, counted apart.`,
        ),
      ),
    );
  const size = (file: ChangedFile): number => (file.added ?? 0) + (file.removed ?? 0);
  return h(
    "section",
    { class: "changed-tree", "data-component": "ChangedTree", "aria-label": "The files changed" },
    h(SectionHead, { title: "Files", count: files.totals.files }),
    h(FilesLine, { files }),
    h(
      ListBox,
      { label: "The files by folder" },
      files.groups.map((group, index) =>
        h(
          Group,
          {
            id: `folder:${group.folder}`,
            title: h("span", { class: "mono" }, folderName(group.folder)),
            count: group.count,
            quantity: h(LinesDelta, folderLines(group.files)),
            // The folder of the file the address opens stands open, and the first.
            open:
              index === 0 || group.files.some((file) => file.path === props.open)
                ? true
                : undefined,
            flat: false,
          },
          [...group.files]
            .sort((a, b) => size(b) - size(a))
            .map((file) =>
              h(ChangedFileFold, { change: props.change, file, open: props.open === file.path }),
            ),
        ),
      ),
    ),
  );
}

/** How many lines of the same text a run of context keeps in view at each end before it folds the rest. */
const CONTEXT_KEPT = 3;

/** One line of a diff, its numbers before and after, its sign in its tone. */
function diffLine(line: NumberedDiffLine | DiffCommit["lines"][number]): ComponentChild {
  const numbered = "oldLine" in line;
  return h(
    "span",
    { class: `diff-line ${line.kind}`, "data-kind": line.kind },
    numbered
      ? [
          h("span", { class: "num" }, line.oldLine === null ? "" : String(line.oldLine)),
          h("span", { class: "num" }, line.newLine === null ? "" : String(line.newLine)),
        ]
      : null,
    h("span", { class: "sign" }, line.kind === "add" ? "+ " : line.kind === "del" ? "− " : "  "),
    line.line,
    "\n",
  );
}

/** Lines with their long runs of context folded: a run kept short at its ends, the rest one line that opens. */
function foldedLines(
  lines: readonly (NumberedDiffLine | DiffCommit["lines"][number])[],
): ComponentChildren {
  const out: ComponentChild[] = [];
  let run: (NumberedDiffLine | DiffCommit["lines"][number])[] = [];
  const flush = (last: boolean): void => {
    const first = out.length === 0;
    const keepHead = first ? 0 : CONTEXT_KEPT;
    const keepTail = last ? 0 : CONTEXT_KEPT;
    if (run.length > keepHead + keepTail + 2) {
      out.push(...run.slice(0, keepHead).map(diffLine));
      const hidden = run.slice(keepHead, run.length - keepTail);
      out.push(
        h(
          "details",
          { class: "diff-gap" },
          h("summary", null, `${plural(hidden.length, "unchanged line")}`),
          hidden.map(diffLine),
        ),
      );
      out.push(...run.slice(run.length - keepTail).map(diffLine));
    } else out.push(...run.map(diffLine));
    run = [];
  };
  for (const line of lines)
    if (line.kind === "same") run.push(line);
    else {
      if (run.length > 0) flush(false);
      out.push(diffLine(line));
    }
  if (run.length > 0) flush(true);
  return out;
}

/** How a changed file's lines are shown: the net change across the change, or each commit's. */
type DiffMode = "net" | "commits";

/** The DiffBody drawn with what it holds: its first paint without a browser, its state in one. */
export function DiffBody(props: DiffProps): ComponentChild {
  return h(DiffBodyHeld, props);
}

/**
 * One changed file's lines (J-166 S1): the net change across the change
 * by default, with the line numbers before and after and the long runs of
 * context folded, or each commit's, the newest first, by the switch.
 */
function DiffBodyHeld(props: DiffProps): ComponentChild {
  const [mode, setMode] = useState<DiffMode>(
    props.net === null || props.net === undefined ? "commits" : "net",
  );
  return diffBody(props, mode, setMode);
}

/** The lines on their first paint, the net change shown; a drawing of a page without a browser draws this. */
DiffBodyHeld.firstPaint = (props: DiffProps): ComponentChildren =>
  diffBody(
    props,
    props.net === null || props.net === undefined ? "commits" : "net",
    () => undefined,
  );

/** What a changed file's lines show. */
interface DiffProps {
  readonly path: string;
  readonly commits: readonly DiffCommit[];
  readonly net?: DiffNet | null;
  readonly unknown: string | null;
}

function diffBody(
  props: DiffProps,
  mode: DiffMode,
  pick: (mode: DiffMode) => void,
): ComponentChild {
  const net = props.net ?? null;
  const newest = [...props.commits].reverse();
  return h(
    "section",
    { class: "diff-file", "data-component": "DiffBody" },
    h(
      "div",
      { class: "diff-head" },
      h("span", { class: "mono" }, props.path),
      net === null
        ? null
        : h(
            "span",
            { class: "fold-views", role: "group", "aria-label": "The lines shown" },
            h(
              "button",
              {
                type: "button",
                class: "chip",
                "aria-pressed": String(mode === "net"),
                onClick: () => pick("net"),
              },
              "Net",
            ),
            h(
              "button",
              {
                type: "button",
                class: "chip",
                "aria-pressed": String(mode === "commits"),
                onClick: () => pick("commits"),
              },
              "By commit",
            ),
          ),
    ),
    props.unknown === null ? null : h(Callout, null, `Git could not read it: ${props.unknown}`),
    props.commits.length === 0 && props.unknown === null
      ? h(
          "p",
          { class: "meta" },
          "No line to show: the file is binary or its commits changed no line of it.",
        )
      : null,
    mode === "net" && net !== null
      ? h(
          "div",
          { class: "diff-commit" },
          h(
            "p",
            { class: "meta" },
            `From ${net.from === null ? "before the change" : net.from.slice(0, 7)} to ${net.to.slice(0, 7)}, across ${plural(props.commits.length, "commit")}`,
          ),
          h("pre", { class: "diff-lines numbered" }, foldedLines(net.lines)),
        )
      : newest.map((commit) =>
          h(
            "div",
            { class: "diff-commit" },
            h(
              "p",
              { class: "meta" },
              h("span", { class: "mono" }, commit.hash.slice(0, 7)),
              ` ${commit.subject}`,
            ),
            h(
              "pre",
              {
                class: commit.lines.some((line) => "oldLine" in line)
                  ? "diff-lines numbered"
                  : "diff-lines",
              },
              foldedLines(commit.lines),
            ),
          ),
        ),
  );
}

/**
 * A change page before its document is read (J-155 S6): the head drawn at
 * once from what the app already holds, the change's name, its state and
 * the day it opened from the names the shell read, and the skeleton only
 * for what is still unread. A change the names do not yet hold shows the
 * crumb and the reading alone.
 */
export function ChangeFirstDraw(props: { readonly known: SearchEntry | null }): ComponentChild {
  const { known } = props;
  return h(
    "div",
    { "data-component": "ChangeFirstDraw" },
    h(
      "header",
      { class: "change-head" },
      h(
        "nav",
        { class: "crumb" },
        h("a", { href: pathOf({ page: "changes" }) }, "Changes"),
        known === null ? null : [" / ", known.name],
      ),
      known === null
        ? null
        : [
            h("h1", null, known.name),
            h(
              "p",
              { class: "change-meta" },
              h(StateWord, { word: stateWords(known.state) }),
              known.at === null ? null : h("span", null, `opened ${known.at}`),
            ),
          ],
    ),
    h(ReadState, {
      face: "loading",
      reads:
        known === null
          ? "this change's record, its folder and its commits"
          : "its steps, its folder and its commits",
    }),
  );
}

/** The change's times from its commits: when it opened, when its first and last commit were, how long it took. */
function timesOf(
  opened: string,
  commits: CommitsDocument | null,
  done: boolean,
): ComponentChildren {
  const parts: string[] = [`opened ${opened}`];
  const dated = (commits?.commits ?? [])
    .map((commit) => (commit.date === null ? Number.NaN : Date.parse(commit.date)))
    .filter((time) => !Number.isNaN(time));
  if (dated.length > 0) {
    const first = Math.min(...dated);
    const last = Math.max(...dated);
    parts.push(`${done ? "closed" : "last commit"} ${when(new Date(last).toISOString())}`);
    if (done && last > first) parts.push(`took ${tookWords(Math.round((last - first) / 60_000))}`);
  }
  if (commits !== null) parts.push(plural(commits.commits.length, "commit"));
  return parts.join(" · ");
}

/**
 * The head (J-166 S1): the crumbs, the lineage, the name, a line of facts
 * as chips, its mode, its agents, its fix rounds, its review and its
 * floors, a line of times, and the one sentence it opens on, the record's
 * outcome labelled Landed where it holds one, else its why labelled Asked.
 */
export function ChangeHead(props: {
  readonly page: ChangeDocument;
  /** The change's commits, once read; null until then. */
  readonly commits?: CommitsDocument | null;
}): ComponentChild {
  const { page } = props;
  const change = page.change;
  const card = change.card;
  const hops: LineageHop[] = [
    // The discussions it was promoted from head the strip (J-118 S4).
    ...card.from.map((id) => ({
      kind: "discussion" as const,
      label: id,
      named: "discussion" as const,
      path: pathOf({ page: "discussion", id }),
      here: false,
    })),
    ...(card.plan === null
      ? []
      : [
          {
            kind: "plan" as const,
            label: card.plan,
            named: "plan" as const,
            path: pathOf({ page: "plan", name: card.plan, part: null }),
            here: false,
          },
        ]),
    { kind: "change", label: page.ref.name, path: null, here: true },
  ];
  const summary = change.summary;
  const chip = (words: string, tone?: string): ComponentChild =>
    h("span", { class: "fact-chip", "data-tone": tone }, words);
  return h(
    "header",
    { class: "change-head", "data-component": "ChangeHead" },
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "changes" }) }, "Changes"),
      " / ",
      page.ref.name,
    ),
    hops.length > 1 ? h(LineageStrip, { hops }) : null,
    h("h1", null, page.ref.name),
    h(
      "p",
      { class: "change-meta" },
      h(StateWord, { word: stateWords(page.state) }),
      card.mode === null ? null : chip(card.mode),
      card.step === null || card.step === "none" ? null : chip(`at ${card.step}`),
      card.agents === null || card.agents === 0 ? null : chip(plural(card.agents, "agent")),
      card.rounds === null || card.rounds === 0 ? null : chip(plural(card.rounds, "fix round")),
      card.reviewed === null ? null : chip(`${card.reviewed} review`),
      card.floors.map((floor) => chip(`floor: ${floor}`, "warn")),
    ),
    h(
      "p",
      { class: "change-times meta" },
      timesOf(change.opened, props.commits ?? null, page.state === "done"),
    ),
    summary === null
      ? null
      : h(
          "div",
          { class: "change-summary", "data-from": summary.from },
          h(
            "span",
            {
              class: "summary-label",
              title:
                summary.from === "outcome"
                  ? "What landed, as the agent wrote it at the close."
                  : "The agent's why, as the record states it.",
            },
            summary.from === "outcome" ? "Landed" : "Asked",
          ),
          h(
            "div",
            { class: "summary-text" },
            summary.html === "" ? summary.text : h(Prose, { html: summary.html }),
          ),
        ),
    change.problem === null
      ? null
      : h(Callout, null, `The record does not parse against the modes: ${change.problem}`),
  );
}

/**
 * What waits on the owner, as a banner under the head (J-166 S1), only
 * while something waits: the question in the agent's words, its options as
 * radio tiles with Copy my answer, which writes nothing, and the step it
 * waits at.
 */
export function WaitingBanner(props: { readonly page: ChangeDocument }): ComponentChild {
  const waiting = props.page.waitingOn;
  if (waiting === null) return null;
  return h(
    "section",
    {
      class: "waiting waiting-banner",
      "data-component": "WaitingBanner",
      "data-anchor": "waiting",
      "aria-label": "Waiting on you",
    },
    h(
      "p",
      { class: "waiting-label" },
      h(StateWord, { word: "waiting" }),
      waiting.step === null ? "" : ` at ${waiting.step}`,
      waiting.askedAt === null ? "" : `, asked ${when(waiting.askedAt)}`,
    ),
    h(
      "p",
      { class: "waiting-question" },
      `${waiting.question.charAt(0).toUpperCase()}${waiting.question.slice(1)}`,
    ),
    waiting.options === null || waiting.options.length === 0
      ? h(
          "p",
          { class: "meta" },
          "Answer in your session; the agent goes no further than this wait.",
        )
      : h(ChoiceTiles, { question: waiting.question, options: waiting.options, pick: true }),
    waiting.step === null
      ? null
      : h(
          "p",
          { class: "meta" },
          h(
            "a",
            { href: changePath(props.page.change.id, waiting.step) },
            `Open the ${waiting.step} step`,
          ),
        ),
  );
}

/** One row of the outcome card: its label, what it says, and the tab it links. */
function OutcomeRow(props: {
  readonly label: string;
  readonly href: string;
  readonly children?: ComponentChildren;
}): ComponentChild {
  return h(
    "a",
    { class: "outcome-row", href: props.href, "data-item": "" },
    h("span", { class: "outcome-label" }, props.label),
    h("span", { class: "outcome-body" }, props.children),
    h("span", { class: "outcome-go", "aria-hidden": "true" }, "→"),
  );
}

/** A row while its part is read. */
const readingRow = (label: string, href: string): ComponentChild =>
  h(OutcomeRow, { label, href }, h("span", { class: "meta", "aria-busy": "true" }, "reading"));

/** What the frame's questions came to: who answered how many. */
function decidedWords(map: FrameMap | null): ComponentChildren {
  if (map === null || map.questions.length === 0)
    return h("span", { class: "meta" }, "No frame question was asked.");
  const owner = map.questions.filter((question) => question.decided === "owner").length;
  const agent = map.questions.filter((question) => question.decided === "agent").length;
  const open = map.questions.length - owner - agent;
  return [
    `You answered ${String(owner)} of ${plural(map.questions.length, "question")}`,
    agent === 0 ? "" : `; the agent settled ${String(agent)}`,
    open === 0 ? "" : `; ${String(open)} still open`,
  ].join("");
}

/** What the folder kept, counted by kind: the reports by step, the briefs and the other files. */
function keptWords(page: ChangeDocument): string {
  const change = page.change;
  const reports = change.reports.filter((file) => /^[a-z][a-z0-9-]*-\d+\.md$/.test(file.file));
  const byStep = new Map<string, number>();
  for (const report of reports) {
    const step = stepOfFile(report.file) ?? "other";
    byStep.set(step, (byStep.get(step) ?? 0) + 1);
  }
  const other = change.reports.length - reports.length;
  const parts = [
    ...[...byStep].map(([step, count]) => plural(count, step)),
    change.briefs.length === 0 ? "" : plural(change.briefs.length, "brief"),
    other === 0 ? "" : plural(other, "other file"),
  ].filter((part) => part !== "");
  return parts.length === 0 ? "Nothing beside the record." : parts.join(" · ");
}

/**
 * The outcome card (J-166 S1): four rows, each answering one question and
 * linking its tab: what changed, the files with their lines; what was
 * checked, each command's latest run; what was decided, the frame's
 * questions by who answered; and what the folder kept.
 */
export function OutcomeCard(props: {
  readonly page: ChangeDocument;
  readonly parts: ChangeParts;
}): ComponentChild {
  const { page, parts } = props;
  const id = page.change.id;
  const code = changePath(id, "code");
  return h(
    "section",
    { class: "outcome-card", "data-component": "OutcomeCard", "aria-label": "The outcome" },
    partShown(parts.changed, {
      change: id,
      aspect: "changed",
      kind: "changed-files",
      reads: "the files its commits touched",
      waiting: readingRow("Changed", code),
      draw: (document) => {
        const files = document.changedFiles;
        return h(
          OutcomeRow,
          { label: "Changed", href: code },
          files.unknown !== null
            ? h("span", { class: "meta" }, `not read: ${files.unknown}`)
            : files.totals.files === 0
              ? "No file of its own; its commits wrote the records alone."
              : h(FilesLine, { files }),
        );
      },
    }),
    partShown(parts.checks, {
      change: id,
      aspect: "checks",
      kind: "check-facts",
      reads: "its checks",
      waiting: readingRow("Checked", `${code}#checks`),
      draw: (document) => {
        const counts = checkCounts(document.checks);
        return h(
          OutcomeRow,
          { label: "Checked", href: changePath(id, "checks") },
          counts.total === 0
            ? h("span", { class: "meta" }, "No check recorded.")
            : [
                h(StateWord, { word: counts.failed > 0 ? "failed" : "passed" }),
                " ",
                counts.failed > 0
                  ? `${String(counts.failed)} of ${plural(counts.total, "command")} failed`
                  : `${String(counts.passed)} of ${plural(counts.total, "command")} passed`,
                counts.onFinal === counts.total
                  ? ", on the final code"
                  : `, ${String(counts.onFinal)} on the final code`,
                h("span", { class: "meta" }, ` · ${plural(document.checks.runs, "run")}`),
              ],
        );
      },
    }),
    partShown(parts.frame, {
      change: id,
      aspect: "frame",
      kind: "frame-map",
      reads: "the frame map",
      waiting: readingRow("Decided", changePath(id, "decided")),
      draw: (document) =>
        h(
          OutcomeRow,
          { label: "Decided", href: changePath(id, "decided") },
          decidedWords(document.map),
        ),
    }),
    h(OutcomeRow, { label: "Kept", href: changePath(id, "steps") }, keptWords(page)),
  );
}

/** One question the owner answered: the question in the agent's words, the owner's words quoted, the proposal it took. */
function DecisionRow(props: { readonly question: FrameQuestion }): ComponentChild {
  const question = props.question;
  return h(
    "li",
    { "data-component": "DecisionRow", "data-question": question.id },
    h("p", { class: "title" }, question.question),
    question.answer === null
      ? null
      : h("p", { class: "owner-words" }, h("q", null, question.answer)),
    question.proposed === null || question.proposed === question.answer
      ? null
      : h("p", { class: "meta" }, `The agent proposed: ${question.proposed}`),
  );
}

/**
 * What you decided (J-166 S1): the questions the owner answered, each with
 * the owner's words quoted and the proposal beside it, then the agent's own
 * settlements folded, and the frame's restatement rendered.
 */
export function WhatYouDecided(props: {
  readonly change: string;
  readonly document: FrameMapDocument;
}): ComponentChild {
  const map = props.document.map;
  const asked = map?.questions ?? [];
  const owner = asked.filter((question) => question.decided === "owner");
  const agent = asked.filter((question) => question.decided === "agent");
  const open = asked.filter((question) => question.decided === null);
  return h(
    "section",
    {
      class: "decided",
      "data-component": "WhatYouDecided",
      "data-anchor": "decided",
      "aria-label": "What you decided",
    },
    h(SectionHead, {
      title: "What you decided",
      count: owner.length,
      aside: h("a", { href: changePath(props.change, "frame") }, "The frame step"),
    }),
    asked.length === 0
      ? h(
          Empty,
          { title: "No frame question was asked." },
          h("p", null, "A change framed with questions keeps your answers here, in your words."),
        )
      : [
          owner.length === 0
            ? h(
                "p",
                { class: "meta" },
                "You answered no question; the agent settled them inside the scope you accepted.",
              )
            : h(
                ListBox,
                { label: "Your answers" },
                h(
                  "ul",
                  { class: "rows decisions" },
                  owner.map((question) => h(DecisionRow, { question })),
                ),
              ),
          open.length === 0
            ? null
            : h(
                Group,
                {
                  id: "decided-open",
                  title: "Still open",
                  count: open.length,
                  tally: [["waiting", open.length]],
                  flat: false,
                },
                h(
                  "ul",
                  { class: "rows decisions" },
                  open.map((question) => h(DecisionRow, { question })),
                ),
              ),
          agent.length === 0
            ? null
            : h(
                Group,
                {
                  id: "decided-agent",
                  title: "The agent settled",
                  count: agent.length,
                  open: false,
                  flat: false,
                },
                h(
                  "ul",
                  { class: "rows decisions" },
                  agent.map((question) => h(DecisionRow, { question })),
                ),
              ),
        ],
    props.document.restatementHtml === null
      ? null
      : h(
          "div",
          { class: "restatement", "data-part": "restatement" },
          h("p", { class: "section-label" }, "The frame's restatement"),
          h(Prose, { html: props.document.restatementHtml }),
        ),
    // The owner's words that confirmed the restatement, quoted under it (J-223 S1).
    props.document.confirmed === null || props.document.confirmed === undefined
      ? null
      : h(
          "p",
          { class: "confirmed", "data-part": "confirmed" },
          `You confirmed it: “${props.document.confirmed}”`,
        ),
  );
}

/** The Overview: what you decided and the restatement, the outcome card above it. */
function OverviewPanel(props: {
  readonly page: ChangeDocument;
  readonly parts: ChangeParts;
}): ComponentChild {
  const id = props.page.change.id;
  return h(
    "div",
    { class: "panel-overview", "data-tab": "overview" },
    partShown(props.parts.frame, {
      change: id,
      aspect: "frame",
      kind: "frame-map",
      reads: "the frame map",
      draw: (document) => h(WhatYouDecided, { change: id, document }),
    }),
  );
}

/** A change's skill loads by step, each skill a chip with its count, the per-file rows behind it (J-166 S1). */
export function SkillChips(props: {
  readonly loads: readonly SkillLoad[];
  /** The step whose loads to draw; undefined for every step. */
  readonly step?: string | null;
}): ComponentChild {
  const loads = props.loads.filter((load) => props.step === undefined || load.step === props.step);
  if (loads.length === 0) return null;
  const bySkill = new Map<string, SkillLoad[]>();
  for (const load of loads) bySkill.set(load.skill, [...(bySkill.get(load.skill) ?? []), load]);
  return h(
    Group,
    {
      id: `loads:${props.step ?? "all"}`,
      title: [
        "Skill loads ",
        [...bySkill].map(([skill, own]) =>
          h(
            "span",
            { class: "skill-chip", title: plural(own.length, "load") },
            skill,
            h("span", { class: "skill-count" }, `×${String(own.length)}`),
          ),
        ),
      ],
      count: loads.length,
      open: false,
      flat: false,
      component: "SkillChips",
    },
    h(
      "p",
      { class: "meta" },
      "Each roster file that entered the agent's context, as the hooks saw it; a load is not what was followed.",
    ),
    h(
      "ul",
      { class: "rows" },
      loads.map((load) => h(LoadRow, { load })),
    ),
  );
}

/**
 * The skills the change owes by their trigger rows, each beside whether a
 * load holds it (J-176 S1): owed against loaded, a skill owed and never
 * loaded marked so; nothing where nothing is owed.
 */
export function OwedChips(props: { readonly owed: readonly OwedView[] }): ComponentChild {
  if (props.owed.length === 0) return null;
  return h(
    "p",
    { class: "meta", "data-component": "OwedChips" },
    "Owed: ",
    props.owed.map((entry) =>
      h(
        "span",
        {
          class: entry.loaded && entry.held === undefined ? "skill-chip" : "skill-chip unread",
          title: `${entry.read === "whole" ? "a whole read" : "its front"}, ${entry.why}${entry.held === undefined ? "" : `; ${entry.held}`}`,
        },
        entry.skill,
        // A whole read the loads began and its pages still hold (J-203 S1).
        h(
          "span",
          { class: "skill-count" },
          entry.held !== undefined ? "pages held" : entry.loaded ? "loaded" : "not loaded",
        ),
      ),
    ),
  );
}

/**
 * The Steps: each step folded, opened in place, its evidence grouped under
 * it by step and kind, its skill loads as chips, the frame map under the
 * frame; then the evidence no step names, the pictures and the interface.
 */
function StepsPanel(props: {
  readonly page: ChangeDocument;
  readonly parts: ChangeParts;
  readonly part: string | null;
  readonly file: string | null;
  readonly extra?: ComponentChildren;
}): ComponentChild {
  const { page } = props;
  const change = page.change;
  const files: readonly (FolderEntry | BriefEntry)[] = [...change.reports, ...change.briefs];
  const steps = new Set(change.sections.map((section) => section.heading));
  const ofStep = (step: string): readonly (FolderEntry | BriefEntry)[] =>
    files
      .filter((file) => stepOfFile(file.file) === step)
      .sort((a, b) => a.file.replace(/^brief-/, "").localeCompare(b.file.replace(/^brief-/, "")));
  const loose = files.filter((file) => {
    const step = stepOfFile(file.file);
    return step === null || !steps.has(step);
  });
  const fileOpen = (step: string): boolean =>
    props.file !== null && stepOfFile(props.file) === step;
  // The steps draw at once; the frame map and the loads, once read, fill their folds.
  const drawSteps = (
    frame: FrameMapDocument | null,
    loads: readonly SkillLoad[],
  ): ComponentChild =>
    change.sections.length === 0
      ? change.text === null
        ? h(Empty, { title: "The record holds no section yet." })
        : h("section", null, h("h2", null, "The record as written"), h("pre", null, change.text))
      : h(
          "section",
          { class: "step-folds", "aria-label": "The steps" },
          change.sections.map((step) => {
            const evidence = ofStep(step.heading);
            return h(StepFold, {
              change: change.id,
              step,
              open:
                props.part === step.heading ||
                fileOpen(step.heading) ||
                (step.heading === "frame" && props.part === "frame-map"),
              frame: frame?.map ?? null,
              more: [
                evidence.length === 0
                  ? null
                  : h(
                      "div",
                      { class: "step-evidence", "aria-label": `What ${step.heading} kept` },
                      evidence.map((file) =>
                        h(FolderFileView, {
                          change: change.id,
                          file,
                          open: props.file === file.file,
                        }),
                      ),
                    ),
                h(SkillChips, { loads, step: step.heading }),
                step.heading === "frame" && frame?.map !== null && frame?.map !== undefined
                  ? h(FrameMapView, { change: change.id, map: frame.map })
                  : null,
              ],
            });
          }),
        );
  const withLoads = (frame: FrameMapDocument | null): ComponentChild =>
    partShown(props.parts.loads, {
      change: change.id,
      aspect: "loads",
      kind: "skill-loads",
      reads: "its skill loads",
      draw: (document) => drawSteps(frame, document.loads.available ? document.loads.items : []),
      waiting: drawSteps(frame, []),
      failed: drawSteps(frame, []),
    });
  return h(
    "div",
    { class: "panel-steps", "data-tab": "steps" },
    partShown(props.parts.frame, {
      change: change.id,
      aspect: "frame",
      kind: "frame-map",
      reads: "the frame map",
      draw: (document) => withLoads(document),
      waiting: withLoads(null),
      failed: withLoads(null),
    }),
    loose.length === 0
      ? null
      : h(
          ListBox,
          { label: "Other evidence" },
          h(
            Group,
            {
              id: "evidence-loose",
              title: "Other evidence the folder kept",
              count: loose.length,
              flat: false,
              open: loose.some((file) => file.file === props.file) ? true : undefined,
            },
            loose.map((file) =>
              h(FolderFileView, { change: change.id, file, open: props.file === file.file }),
            ),
          ),
        ),
    partShown(props.parts.loads, {
      change: change.id,
      aspect: "loads",
      kind: "skill-loads",
      reads: "its skill loads",
      draw: (document) => {
        const before = document.loads.available
          ? document.loads.items.filter((load) => load.step === null || !steps.has(load.step))
          : [];
        return h(
          "div",
          null,
          before.length === 0 ? null : h(SkillChips, { loads: before, step: null }),
          h(OwedChips, { owed: document.owed }),
        );
      },
      waiting: null,
      failed: null,
    }),
    partShown(props.parts.pictures, {
      change: change.id,
      aspect: "pictures",
      kind: "pictures",
      reads: "the pictures made under it",
      draw: (document) => {
        const pictures = document.pictures.available ? document.pictures.items : [];
        return pictures.length === 0
          ? null
          : h(
              "section",
              { "data-anchor": "pictures" },
              h(SectionHead, { title: "Pictures", count: pictures.length }),
              h(ChangeVisuals, { visuals: pictures }),
            );
      },
      waiting: null,
    }),
    props.extra ?? null,
  );
}

/** The Code: the files by folder with each file's lines under its row, the commits, and the checks by command. */
function CodePanel(props: {
  readonly page: ChangeDocument;
  readonly parts: ChangeParts;
  readonly changed: string | null;
}): ComponentChild {
  const id = props.page.change.id;
  return h(
    "div",
    { class: "panel-code", "data-tab": "code" },
    partShown(props.parts.changed, {
      change: id,
      aspect: "changed",
      kind: "changed-files",
      reads: "the files its commits touched",
      draw: (document) =>
        h(ChangedTree, { change: id, files: document.changedFiles, open: props.changed }),
    }),
    partShown(props.parts.checks, {
      change: id,
      aspect: "checks",
      kind: "check-facts",
      reads: "its checks and its commits",
      draw: (document) => [
        // The landing's state once the close has run, the mirror's and the status's line (J-202 S1).
        document.landing === null
          ? null
          : h("p", { class: "note", "data-anchor": "landing" }, document.landing),
        h(ChecksByCommand, { checks: document.checks, sinceCheck: document.sinceCheck }),
        h(CommitList, { checks: document.checks }),
      ],
    }),
  );
}

/** The close's paragraphs, each led by its label, `Decisions.`, as a row with its first sentence and the rest folded. */
export function CloseParagraphs(props: { readonly text: string }): ComponentChild {
  const paragraphs = props.text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph !== "" && !paragraph.startsWith("#"));
  if (paragraphs.length === 0) return h(Empty, { title: "The close holds no paragraph yet." });
  return h(
    ListBox,
    { label: "The close" },
    h(
      "ul",
      { class: "rows close-rows", "data-component": "CloseParagraphs" },
      paragraphs.map((paragraph) => {
        const labelled = /^([A-Z][A-Za-z ]{1,24})[.:]\s+(.*)$/.exec(paragraph);
        const label = labelled?.[1] ?? null;
        const rest = labelled?.[2] ?? paragraph;
        const first = /^(.+?[.!?])(\s|$)/.exec(rest)?.[1] ?? rest;
        const more = rest.slice(first.length).trim();
        return h(
          "li",
          null,
          h(
            "div",
            { class: "row-top" },
            label === null ? null : h("span", { class: "title" }, label),
            h("span", null, first),
          ),
          more === ""
            ? null
            : h(
                "details",
                { class: "close-more" },
                h("summary", { class: "meta" }, "the rest"),
                h("p", null, more),
              ),
        );
      }),
    ),
  );
}

/** The Record: the properties, the record's source, the close's paragraphs and what the status says. */
function RecordPanel(props: {
  readonly page: ChangeDocument;
  readonly parts: ChangeParts;
}): ComponentChild {
  const change = props.page.change;
  const id = change.id;
  const closed = change.sections.some((section) => section.heading === "close" && section.written);
  return h(
    "div",
    { class: "panel-record", "data-tab": "record" },
    h(
      "section",
      {
        "data-anchor": "record",
        "data-component": "RecordProperties",
        "aria-label": "The properties",
      },
      h(SectionHead, { title: "Properties" }),
      h(
        "dl",
        { class: "facts" },
        change.card.mode === null
          ? null
          : h("div", null, h("dt", null, "Mode"), h("dd", null, change.card.mode)),
        h("div", null, h("dt", null, "Opened"), h("dd", null, change.opened)),
      ),
      h(RecordFacts, { card: change.card }),
      h(GroundFacts, { card: change.card }),
    ),
    partShown(props.parts.checks, {
      change: id,
      aspect: "checks",
      kind: "check-facts",
      reads: "what the status says of it",
      draw: (document) => {
        const notes = document.notes.filter(
          (note) => note.severity === "error" || note.severity === "warning",
        );
        return notes.length === 0
          ? null
          : h(
              Callout,
              null,
              `greenline status says of it: ${notes.map((note) => `${note.message} (${note.code})`).join("; ")}`,
            );
      },
      waiting: null,
      failed: null,
    }),
    closed
      ? h(
          "section",
          { "aria-label": "The close" },
          h(SectionHead, { title: "The close" }),
          partShown(props.parts.close, {
            change: id,
            aspect: "steps/close",
            kind: "step",
            reads: "the close",
            draw: (document) => h(CloseParagraphs, { text: document.section.text }),
          }),
        )
      : null,
    h(
      "section",
      { "aria-label": "The source" },
      h(SectionHead, { title: "Source" }),
      partShown(props.parts.source, {
        change: id,
        aspect: "source",
        kind: "source",
        reads: "the record as written",
        draw: (document) =>
          document.text === null
            ? h(
                Callout,
                null,
                `The record cannot be read: ${document.problem ?? "no reason given"}`,
              )
            : h(
                "div",
                { "data-component": "RecordSource" },
                h(
                  "p",
                  { class: "meta" },
                  h("span", { class: "mono" }, document.path),
                  document.at === null ? null : ` · last written ${when(document.at)}`,
                ),
                h(SourceView, { text: document.text }),
              ),
      }),
    ),
  );
}

/**
 * The change page (J-166 S1): the head, the waiting banner while something
 * waits, the outcome card, the step rail, the four tabs and the tab the
 * address opens. The head draws from the change's head document at once;
 * its commits fill its times, and each part fills as it arrives.
 */
export function ChangePage(props: {
  readonly page: ChangeDocument;
  /** The parts already held, drawn as given; any other is read from its address. */
  readonly parts?: ChangeParts;
  readonly part: string | null;
  readonly file: string | null;
  readonly changed: string | null;
  /** What the Steps tab holds after the steps: the interface, the deal and the notes. */
  readonly extra?: ComponentChildren;
}): ComponentChild {
  const { page } = props;
  const parts = props.parts ?? {};
  const change = page.change;
  const tab = props.file !== null ? "steps" : tabOf(props.part, props.changed);
  const strip = page.strip;
  // The head draws at once; its commits, once read, add their times.
  const head = h(ChangeHead, { page });
  return h(
    "article",
    { "data-component": "ChangePage", "data-change": change.id, "data-reading": change.reading },
    partShown(parts.commits, {
      change: change.id,
      aspect: "commits",
      kind: "commits",
      reads: "its commits",
      draw: (document) => h(ChangeHead, { page, commits: document }),
      waiting: head,
      failed: head,
    }),
    h(WaitingBanner, { page }),
    h(OutcomeCard, { page, parts }),
    strip.length === 0 ? null : h(StepStrip, { strip, form: "rail", change: change.id }),
    h(ChangeTabs, { change: change.id, tab, counts: { steps: change.sections.length } }),
    tab === "overview"
      ? h(OverviewPanel, { page, parts })
      : tab === "steps"
        ? h(StepsPanel, { page, parts, part: props.part, file: props.file, extra: props.extra })
        : tab === "code"
          ? h(CodePanel, { page, parts, changed: props.changed })
          : h(RecordPanel, { page, parts }),
  );
}
