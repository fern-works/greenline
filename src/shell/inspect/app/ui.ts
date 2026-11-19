import {
  createContext,
  h,
  type Context,
  type ComponentChild,
  type ComponentChildren,
} from "preact";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  ChangedFiles,
  DocumentKind,
  DocumentOf,
  Ref,
  SearchDocument,
  SearchEntry,
  SearchKind,
  SkillKindView,
  StripStep,
} from "../../../core/inspector/documents.ts";
import { readDocument, Refused } from "./client.ts";

/*
 * The few parts every view draws from: a state word, a tag, a callout, an
 * empty state, the house renderer's prose, the tabs and the reading of a
 * document. A state or a tier is always a word; its tone only sits beside
 * it, in the one vocabulary of states every view shares.
 */

/** How many times the repository has been read again: a view reads its document again when it moves. */
export const Generation: Context<number> = createContext(0);

/** A document as a view holds it: being read, read, or refused with the server's words. */
export type Reading<T> =
  | { readonly state: "reading" }
  | {
      readonly state: "ready";
      readonly document: T;
      /** Why the latest read again was refused; the document drawn is the one read before. */
      readonly refused?: string;
    }
  | {
      readonly state: "failed";
      readonly message: string;
      /** The server holds nothing at the address: the view shows its empty state, never an error (J-142 S1). */
      readonly missing?: boolean;
    };

/**
 * Read one document of the contract, again whenever the generation moves.
 * @param address the document's address
 * @param kind its kind
 * @param wanted whether to read it at all: a part handed its document by its
 *   page's own reads nothing, and its reading stays "reading"
 * @returns the reading
 */
export function useDocument<K extends DocumentKind>(
  address: string,
  kind: K,
  wanted = true,
): Reading<DocumentOf<K>> {
  const generation = useContext(Generation);
  const [reading, setReading] = useState<Reading<DocumentOf<K>>>({ state: "reading" });
  useEffect(() => {
    if (!wanted) return undefined;
    let current = true;
    const read = async (): Promise<DocumentOf<K> | Error> => {
      try {
        return await readDocument(address, kind);
      } catch (error) {
        return error instanceof Error ? error : new Error("The read failed.");
      }
    };
    void read().then((next) => {
      if (!current) return;
      if (!(next instanceof Error)) setReading({ state: "ready", document: next });
      // A read again that is refused keeps what was drawn, so an editor and its draft stay.
      else
        setReading((previous) =>
          previous.state === "ready"
            ? { state: "ready", document: previous.document, refused: next.message }
            : next instanceof Refused && next.status === 404
              ? { state: "failed", message: next.message, missing: true }
              : { state: "failed", message: next.message },
        );
    });
    return () => {
      current = false;
    };
  }, [address, kind, generation, wanted]);
  return reading;
}

/** How the page reads the repository again, which a failed read offers; the shell gives it. */
export const ReadAgain: Context<() => void> = createContext<() => void>(() => undefined);

/** The form a section's skeleton takes while it is read: rows of a mark, a name and a fact, cards, or lines of text. */
export type SkeletonForm = "rows" | "cards" | "text";

/** A read's three designed states (rubric 8): loading what it reads, empty and why, failed and what to do. */
export type ReadFace =
  | {
      readonly face: "loading";
      /** What is being read, as a phrase: `the changes from the ledger`. */
      readonly reads: string;
      /** The section's form, which its skeleton takes; rows where none is named. */
      readonly form?: SkeletonForm;
    }
  | {
      readonly face: "empty";
      /** What would appear here, said as its absence: `No change recorded yet.` */
      readonly title: string;
    }
  | {
      readonly face: "failed";
      /** What failed to read, as a phrase: `the changes from the ledger`. */
      readonly reads: string;
      /** Why, in the server's or the reader's words. */
      readonly message: string;
    };

/** A phrase as a sentence's start. */
const opening = (phrase: string): string =>
  phrase === "" ? phrase : `${phrase[0]?.toUpperCase() ?? ""}${phrase.slice(1)}`;

/**
 * A skeleton of a section's form (J-164 S1): three rows of a mark, a name
 * and a fact; three cards; or four lines of text.
 * @param form the section's form
 * @returns the skeleton, hidden from a reader of the page
 */
function skeleton(form: SkeletonForm): ComponentChild {
  const bone = (kind: string): ComponentChild => h("span", { class: `bone ${kind}` });
  const bones =
    form === "rows"
      ? [1, 2, 3].map(() =>
          h("span", { class: "bone-row" }, bone("mark"), bone("name"), bone("fact")),
        )
      : form === "cards"
        ? [1, 2, 3].map(() =>
            h("span", { class: "bone-card" }, bone("half"), bone("name"), bone("short")),
          )
        : [bone("name"), bone("name"), bone("short"), bone("half")];
  return h("div", { class: "skeleton", "data-form": form, "aria-hidden": "true" }, bones);
}

/**
 * The one component for a read's three states, every view and every part
 * of a page drawing them alike: loading says what it reads over a skeleton
 * of the section's form, empty says in one quiet line what would appear
 * and, in its children, why none does, with an act where one helps, and
 * failed names what failed, why, and what to do.
 */
export function ReadState(
  props: ReadFace & { readonly children?: ComponentChildren },
): ComponentChild {
  if (props.face === "loading")
    return h(
      "div",
      {
        class: "read-state",
        "data-component": "ReadState",
        "data-face": "loading",
        "aria-live": "polite",
      },
      h("p", { class: "meta" }, `Reading ${props.reads}.`),
      skeleton(props.form ?? "rows"),
    );
  if (props.face === "empty")
    return h(
      "div",
      { class: "empty", "data-component": "ReadState", "data-face": "empty" },
      h("p", null, props.title),
      props.children ?? null,
    );
  return h(
    "div",
    {
      class: "read-state failed",
      "data-component": "ReadState",
      "data-face": "failed",
      role: "alert",
    },
    h("p", { class: "title" }, `${opening(props.reads)} could not be read.`),
    h("p", null, props.message),
    props.children ??
      h(
        "p",
        { class: "actions" },
        h(ReadAgain.Consumer, null, (again: () => void) =>
          h("button", { type: "button", onClick: () => again() }, "Read again"),
        ),
        h(
          "span",
          { class: "meta" },
          "If it fails again, greenline status in a terminal names what is wrong.",
        ),
      ),
  );
}

/**
 * A reading's three faces: the document drawn, the loading state naming
 * what it reads, the failed state naming what failed and what to do, and an
 * address the repository holds no record for as its empty state.
 * @param reading the reading
 * @param draw what to draw from its document
 * @param reads what the reading reads, as a phrase: `the changes from the ledger`
 * @param form the section's form, which its skeleton takes while it is read
 * @returns the view
 */
export function drawReading<T>(
  reading: Reading<T>,
  draw: (document: T) => ComponentChildren,
  reads = "the repository",
  form: SkeletonForm = "rows",
): ComponentChild {
  if (reading.state === "reading")
    return h("div", { "data-reading": "reading" }, h(ReadState, { face: "loading", reads, form }));
  if (reading.state === "failed")
    return reading.missing === true
      ? h(
          "div",
          { "data-reading": "missing" },
          h(
            ReadState,
            { face: "empty", title: "Nothing here by that name." },
            h(
              "p",
              null,
              `${reading.message} The repository holds no record at this address; the view lists what it holds.`,
            ),
          ),
        )
      : h(
          "div",
          { "data-reading": "failed" },
          h(ReadState, { face: "failed", reads, message: reading.message }),
        );
  return h(
    "div",
    { "data-reading": "ready" },
    reading.refused === undefined
      ? null
      : h(
          Callout,
          null,
          `Reading the repository again was refused: ${reading.refused} What shows was read before.`,
        ),
    draw(reading.document),
  );
}

/** The tone a state's word sits beside, one per kind of state, each a colour of the house tokens. */
export type StateTone = "need" | "accent" | "pass" | "fail" | "warn" | "info" | "idle" | "plain";

/**
 * The one vocabulary of states (the design's contract, "Shared shapes"),
 * every word with its tone: waiting on you; in progress or the step now; done,
 * passed and fresh keeping green; failed, stale and did not finish; drifting;
 * stopped, dropped, skipped and not run quiet. A word not named here is plain.
 */
const TONES: ReadonlyMap<string, StateTone> = new Map<string, StateTone>([
  ...["waiting", "waiting on you", "blocking"].map((word) => [word, "need"] as const),
  ...["open", "in-progress", "in progress", "now", "current"].map(
    (word) => [word, "accent"] as const,
  ),
  ...["done", "passed", "fresh", "promoted", "ok", "written", "registered", "addressed"].map(
    (word) => [word, "pass"] as const,
  ),
  ...[
    "failed",
    "error",
    "stale",
    "unreadable",
    "red",
    "unfinished",
    "did not finish",
    "refused",
  ].map((word) => [word, "fail"] as const),
  ...["drifting", "drift", "warning", "warnings"].map((word) => [word, "warn"] as const),
  ...["note", "your note"].map((word) => [word, "info"] as const),
  ...[
    "stopped",
    "dropped",
    "declined",
    "merged",
    "parked",
    "skipped",
    "elsewhere",
    "not-run",
    "not run",
    "none",
    "off",
  ].map((word) => [word, "idle"] as const),
]);

/** The states that are over: their mark is filled; an open state's mark is outlined. */
const SETTLED: ReadonlySet<string> = new Set([
  "done",
  "passed",
  "fresh",
  "promoted",
  "ok",
  "written",
  "registered",
  "addressed",
  "failed",
  "error",
  "stale",
  "unfinished",
  "did not finish",
  "refused",
  "dropped",
  "declined",
  "merged",
  "skipped",
]);

/** How a state's word is drawn: its tone, and whether its mark is filled. */
export interface StateDrawing {
  readonly tone: StateTone;
  /** The state is over, so its mark is filled; an open state's mark is outlined. */
  readonly settled: boolean;
}

/**
 * How a state's word is drawn: its tone, and whether its mark is filled
 * because the state is over or outlined because it is still open.
 * @param word a state, a tier or an outcome
 * @returns the tone and whether the state is settled
 */
export function stateTone(word: string): StateDrawing {
  return { tone: TONES.get(word) ?? "plain", settled: SETTLED.has(word) };
}

/**
 * A state, a tier or an outcome as a word with its mark: a small rounded
 * square in the state's tone, outlined while the state is open and filled
 * once it is over. The word always shows; the tone only sits beside it.
 */
export function StateWord(props: { readonly word: string | null }): ComponentChild {
  const word = props.word ?? "unreadable";
  const { tone, settled } = stateTone(word);
  return h(
    "span",
    {
      class: "word",
      "data-tone": tone,
      "data-settled": settled ? "yes" : "no",
      "data-word": word,
      // A plain fact is a word with no mark, never an outlined square that reads as not ticked.
      "data-fact": FACTS.has(word) ? "yes" : undefined,
    },
    SPOKEN.get(word) ?? word,
  );
}

/** The words that state a plain fact, not a state: drawn with no mark (J-164 S1). */
const FACTS: ReadonlySet<string> = new Set(["installed", "not installed", "extra"]);

/** The contract's state values as the practice says them on screen (rubric 12). */
const SPOKEN: ReadonlyMap<string, string> = new Map([
  ["waiting", "waiting on you"],
  ["in-progress", "in progress"],
  ["not-run", "not run"],
  ["not-yet", "not yet"],
  ["in-plan", "in plan"],
]);

/** A short value in mono, such as a skill's name. */
export function Tag(props: { readonly children?: ComponentChildren }): ComponentChild {
  return h("span", { class: "tag" }, props.children);
}

/** A line that needs the eye: a refusal, a stopped change, a warning. */
export function Callout(props: {
  readonly children?: ComponentChildren;
  readonly quiet?: boolean;
}): ComponentChild {
  return h(
    "p",
    { class: props.quiet === true ? "callout quiet" : "callout", role: "note" },
    props.children,
  );
}

/** What a list shows when it holds nothing, and why: the read state's empty face. */
export function Empty(props: {
  readonly title: string;
  readonly children?: ComponentChildren;
}): ComponentChild {
  return h(ReadState, { face: "empty", title: props.title }, props.children);
}

/**
 * A part of a page whose own reading failed while the page read: the read
 * state's failed face, naming the part and why, with the way to read again.
 */
export function PartFailed(props: {
  readonly reads: string;
  readonly reason: string;
}): ComponentChild {
  return h(ReadState, { face: "failed", reads: props.reads, message: props.reason });
}

/**
 * A time as a list's summary names it: a date as it is, a time in UTC to the minute.
 * @param at a date or an ISO time
 * @returns the words
 */
function stamp(at: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : when(at);
}

/**
 * The line a list opens with (rubric 5 and 7): how many, how they stand in
 * the one vocabulary of states, and the newest; a list's own facts after.
 */
export function ListSummary(props: {
  readonly count: number;
  /** The noun the count counts, singular. */
  readonly noun: string;
  /** Its plural where an `s` does not make it. */
  readonly nouns?: string;
  /** How many stand in each state, in the order to show them; a state none stands in is left out. */
  readonly states?: readonly (readonly [string, number])[];
  /** The newest, by its name, and when. */
  readonly newest?: { readonly name: ComponentChildren; readonly at: string | null } | null;
  /** A further fact of the list, a sentence. */
  readonly more?: ComponentChildren;
}): ComponentChild {
  const states = (props.states ?? []).filter(([, count]) => count > 0);
  return h(
    "p",
    { class: "summary", "data-component": "ListSummary" },
    h(
      "span",
      { class: "title" },
      props.count === 1 ? `1 ${props.noun}` : `${props.count} ${props.nouns ?? `${props.noun}s`}`,
    ),
    // Each part after a space of its own, so the line reads as words without its layout.
    states.length === 0
      ? null
      : states.map(([word, count]) => [
          " ",
          h("span", { class: "summary-state" }, String(count), " ", h(StateWord, { word })),
        ]),
    props.newest === undefined || props.newest === null
      ? null
      : [
          " ",
          h(
            "span",
            { class: "meta" },
            "newest ",
            props.newest.name,
            props.newest.at === null ? "" : `, ${stamp(props.newest.at)}`,
          ),
        ],
    props.more === undefined ? null : [" ", h("span", { class: "meta" }, props.more)],
  );
}

/** The names the app shows for records, by kind and id, read once by the server (`GET /api/search`). */
export type Names = ReadonlyMap<string, SearchEntry>;

/** A record's key among the names. */
const nameKey = (kind: SearchKind, id: string): string => `${kind}\u0000${id}`;

/**
 * A record among the names.
 * @param names the names
 * @param kind its kind
 * @param id its id
 * @returns its entry, or undefined where the names do not hold it
 */
export function lookupName(names: Names, kind: SearchKind, id: string): SearchEntry | undefined {
  return names.get(nameKey(kind, id));
}

/**
 * The names by kind and id.
 * @param document the names document
 * @returns the names
 */
export function namesOf(document: SearchDocument): Names {
  return new Map(document.entries.map((entry) => [nameKey(entry.kind, entry.id), entry]));
}

/** The names as the shell read them; a page draws a reference by its name from here. */
export const NamesContext: Context<Reading<Names>> = createContext<Reading<Names>>({
  state: "reading",
});

/**
 * Read the names, again whenever the repository is read again.
 * @returns the reading of the names
 */
function useNames(): Reading<Names> {
  const reading = useDocument("/api/search", "search");
  // Built once per reading, so every link on the page reads the same names.
  return useMemo(
    () =>
      reading.state === "ready" ? { ...reading, document: namesOf(reading.document) } : reading,
    [reading],
  );
}

/** A change's id standing whole in a sentence: not a folder's path or a file's name that begins with it. */
const CHANGE_ID_IN_TEXT = /(?<![\w/.-])(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)(?![\w/-]|\.[\w/])/g;

/**
 * A sentence in the practice's own words, such as a finding of greenline
 * status, with each change it quotes by id shown by its name, linked; an id
 * the names do not hold, and one inside a path, stays as written.
 */
export function NamedText(props: { readonly text: string }): ComponentChild {
  return h(NamesContext.Consumer, null, (names: Reading<Names> | undefined) => {
    if (names?.state !== "ready") return props.text;
    const parts: ComponentChildren[] = [];
    let at = 0;
    for (const match of props.text.matchAll(CHANGE_ID_IN_TEXT)) {
      const id = match[1] ?? "";
      const entry = lookupName(names.document, "change", id);
      if (entry === undefined) continue;
      parts.push(props.text.slice(at, match.index));
      parts.push(h("a", { href: entry.address, title: entry.id }, entry.name));
      at = match.index + id.length;
    }
    parts.push(props.text.slice(at));
    return parts;
  });
}

/** Give every page below the names, read again whenever the repository is. */
export function NamesProvider(props: { readonly children?: ComponentChildren }): ComponentChild {
  return h(NamesContext.Provider, { value: useNames() }, props.children);
}

/**
 * A reference to a record by its name (rubric 4 and 10): the id is the
 * link's address and the hover's words, never its text. While the names are
 * read it says so; a record the names do not hold, one gone from the
 * repository, shows its id plainly marked as not found.
 */
export function RecordLink(props: RecordLinkProps): ComponentChild {
  // No names given at all reads as names still being read, the context's own default.
  return h(NamesContext.Consumer, null, (names: Reading<Names> | undefined) =>
    namedRecord(props, names ?? { state: "reading" }),
  );
}

/** What a reference names: the record's kind, its id, and where it is when the names do not hold it. */
interface RecordLinkProps {
  readonly kind: SearchKind;
  readonly id: string;
  /** The record's address, where the names do not hold it. */
  readonly href: string;
  /** The name as text alone, where a link to the record already stands beside it. */
  readonly plain?: boolean;
  /** The record's own reference where its document carries it: drawn at once, the names not needed. */
  readonly named?: Ref;
}

/** A reference drawn from its own reference, else from the names as they are read. */
function namedRecord(props: RecordLinkProps, names: Reading<Names>): ComponentChild {
  if (props.named !== undefined) return drawnRef(props.named, props.plain === true);
  if (names.state === "reading")
    // Busy, not a view's reading: the page has drawn, the link already leads to the record,
    // and its name fills when the names arrive.
    return h(
      props.plain === true ? "span" : "a",
      {
        class: "meta",
        "aria-busy": "true",
        "data-component": "RecordLink",
        href: props.plain === true ? undefined : props.href,
      },
      "reading its name",
    );
  const entry =
    names.state === "ready" ? names.document.get(nameKey(props.kind, props.id)) : undefined;
  if (entry === undefined)
    return h(
      "span",
      {
        "data-component": "RecordLink",
        "data-found": "no",
        title: `No ${props.kind} by this id is held here.`,
      },
      h("span", { class: "mono" }, props.id),
      h("span", { class: "meta" }, " (not found)"),
    );
  return drawnRef(entry, props.plain === true);
}

/** A reference by its name, the id the hover's words and the address the link's. */
function drawnRef(ref: Ref, plain: boolean): ComponentChild {
  return plain
    ? h("span", { class: "record-name", "data-component": "RecordLink", title: ref.id }, ref.name)
    : h(
        "a",
        { href: ref.address, class: "record-name", "data-component": "RecordLink", title: ref.id },
        ref.name,
      );
}

/**
 * Text the house renderer rendered on the server: every byte escaped and
 * every link resolved there, so the page places it as it is.
 */
export function Prose(props: { readonly html: string }): ComponentChild {
  return h("div", { class: "prose", dangerouslySetInnerHTML: { __html: props.html } });
}

/**
 * A choice among states (rubric 2 and 6): a chip per state with how many
 * stand in it, the chosen one pressed, the whole set offered first; a state
 * none stands in stays, reading 0, so the vocabulary never shifts.
 */
export function FilterBar<K extends string>(props: {
  /** What the chips choose among, for a reader of the page. */
  readonly label: string;
  readonly chips: readonly { readonly key: K; readonly label: string; readonly count: number }[];
  readonly current: K;
  readonly pick: (key: K) => void;
}): ComponentChild {
  return h(
    "div",
    {
      class: "filter-bar",
      role: "group",
      "aria-label": props.label,
      "data-component": "FilterBar",
    },
    props.chips.map((chip) =>
      h(
        "button",
        {
          type: "button",
          class: "chip",
          "data-count": chip.count === 0 ? "zero" : undefined,
          "aria-pressed": String(chip.key === props.current),
          onClick: () => props.pick(chip.key),
        },
        chip.label,
        // A space read aloud between the word and its count; the chip's gap draws it.
        " ",
        h("span", { class: "chip-count" }, String(chip.count)),
      ),
    ),
  );
}

/** A view's tabs, each its own address, with its count where it has one; a tab with nothing in it stays, quiet. */
export function Tabs(props: {
  readonly label: string;
  readonly items: readonly {
    readonly label: string;
    readonly path: string;
    readonly current: boolean;
    readonly count?: number;
  }[];
}): ComponentChild {
  return h(
    "nav",
    { class: "tabs", "aria-label": props.label, "data-component": "Tabs" },
    props.items.map((item) =>
      h(
        "a",
        {
          href: item.path,
          "aria-current": item.current ? "page" : undefined,
          "data-empty": item.count === 0 ? "yes" : undefined,
        },
        item.label,
        item.count === undefined ? null : h("span", { class: "count" }, String(item.count)),
      ),
    ),
  );
}

/**
 * A time as the page prints it, in UTC to the minute.
 * @param iso an ISO time
 * @returns the time in words, or what was given when it does not read as one
 */
export function when(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * A count with its noun.
 * @param count the count
 * @param word the noun, singular
 * @returns the words
 */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The kinds a roster's skills are grouped by, each with its title: the
 * modes definition's kinds in its order, then any kind a skill carries that
 * the definition does not name (J-166 S1); a title is its kind's name in
 * the plural, so no kind is listed here by name.
 */
export function kindGroups(
  defined: readonly SkillKindView[],
  present: readonly string[],
): readonly (readonly [string, string])[] {
  const names = [...new Set([...defined.map((kind) => kind.name), ...present])];
  return names.map((name) => [name, `${name.charAt(0).toUpperCase()}${name.slice(1)}s`] as const);
}

/** A station's state in the strip's words: the step reached, or its section's state, or its depth ahead. */
export function stationWord(step: StripStep, reached: boolean): string {
  if (step.current) return "current";
  if (step.state === "skipped") return "skipped";
  if (step.state === "in-plan") return "in plan";
  if (step.state === "written") return "written";
  return reached || step.depth === null ? step.state : aheadWord(step.depth);
}

/** A step ahead in the strip's few words: what the mode gives it, never read as already done. */
function aheadWord(depth: string): string {
  if (depth === "written") return "to write";
  if (depth.startsWith("inline")) return "inline";
  if (depth.startsWith("skipped")) return "skipped";
  const agents = /^independent, (\d+) fresh agents?$/.exec(depth);
  if (agents !== null) return `${agents[1] ?? ""} agent${agents[1] === "1" ? "" : "s"}`;
  const rounds = /^looped, up to (\d+) rounds?$/.exec(depth);
  if (rounds !== null) return `up to ${rounds[1] ?? ""} rounds`;
  return depth;
}

/** The words of an address that name nothing: the app's own places and a date's numbers. */
const PLACE_WORDS = new Set([
  "api",
  "atlas",
  "changes",
  "checks",
  "discussions",
  "homes",
  "interfaces",
  "marks",
  "now",
  "plans",
  "roster",
  "settings",
  "visuals",
  "captures",
  "subsystems",
]);

/**
 * The records an address the app does not show may have meant, by the
 * words it holds: each record whose name or id holds one of them, those
 * holding the most first, five at most.
 * @param path the address
 * @param names the names
 * @returns the records
 */
export function suggestionsFor(path: string, names: Names): readonly SearchEntry[] {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // An escape that does not decode is searched as it was typed.
  }
  const words = [
    ...new Set(
      decoded
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !PLACE_WORDS.has(word)),
    ),
  ];
  if (words.length === 0) return [];
  return [...names.values()]
    .map((entry) => {
      const held = `${entry.name} ${entry.id}`.toLowerCase();
      return { entry, score: words.filter((word) => held.includes(word)).length };
    })
    .filter((found) => found.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, 5)
    .map((found) => found.entry);
}

/**
 * The page for an address the app does not show: it says so in a sentence,
 * offers the records the address's words name, and the way back. An address
 * of an earlier inspector lands here and finds the page that moved.
 */
export function NotFound(props: { readonly path: string }): ComponentChild {
  return h(NamesContext.Consumer, null, (names: Reading<Names> | undefined) =>
    notFound(props.path, names ?? { state: "reading" }),
  );
}

/** The not-found page drawn from the names as they are read. */
function notFound(path: string, names: Reading<Names>): ComponentChild {
  const props = { path };
  const found = names.state === "ready" ? suggestionsFor(props.path, names.document) : [];
  return h(
    "section",
    { "data-component": "NotFound" },
    h("h1", null, "No page here"),
    h(
      "p",
      { class: "lede" },
      "The inspector shows no page at ",
      h("span", { class: "mono" }, props.path),
      ". An address from an earlier inspector may name a page that has moved.",
    ),
    names.state === "reading"
      ? h(ReadState, { face: "loading", reads: "the names to look for it" })
      : found.length === 0
        ? h(
            "p",
            null,
            names.state === "failed"
              ? "The names could not be read, so nothing is offered in its place."
              : "Nothing here goes by the address's words.",
          )
        : h(
            "div",
            null,
            h("h2", null, "It may be one of these"),
            h(
              "ul",
              { class: "rows" },
              found.map((entry) =>
                h(
                  "li",
                  null,
                  h(
                    "div",
                    { class: "row-top" },
                    h("a", { class: "title", href: entry.address, "data-item": "" }, entry.name),
                    h(
                      "span",
                      { class: "meta" },
                      `${entry.where}${entry.at === null ? "" : `, ${stamp(entry.at)}`}`,
                    ),
                  ),
                ),
              ),
            ),
          ),
    h("p", null, h("a", { href: "/" }, "Open the desk"), ", or press / to search every name."),
  );
}

/*
 * The second cut's primitives (J-164 S1): the icons the bar draws, the
 * section system (a section's head, the list box and the group with its
 * band), the fold of one artefact with its Read, Source and JSON views, the
 * lines added and removed in their two tones, and the bar's read age.
 */

/** The icons the bar and the folds draw, each a line drawing in the current ink. */
export type IconName =
  | "desk"
  | "changes"
  | "interface"
  | "knowledge"
  | "practice"
  | "search"
  | "reload"
  | "theme"
  | "chevron";

const ICON_PATHS = {
  desk: "M2.5 3.5h11v9h-11z M2.5 6.5h11",
  changes: "M3 4h10 M3 8h10 M3 12h6",
  interface: "M2.5 2.5h11v11h-11z M2.5 5.5h11 M5.5 5.5v8",
  knowledge: "M3 3.5a1 1 0 0 1 1-1h8.5v10H4a1 1 0 0 0-1 1z M3 13.5a1 1 0 0 0 1 1h8.5",
  practice: "M3 4h10 M3 8h10 M3 12h10 M6 2.5v3 M10 6.5v3 M5 10.5v3",
  search: "M7 2.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z M10.5 10.5l3 3",
  reload: "M13 8a5 5 0 1 1-1.6-3.7 M13 2.5v3.5h-3.5",
  theme: "M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11z M8 2.5v11 M8 5h3.5 M8 8h5 M8 11h3.5",
  chevron: "M6 4l4 4-4 4",
} as const satisfies Readonly<Record<IconName, string>>;

/** One icon, hidden from a reader of the page: the word beside it or its button's label says what it is. */
export function Icon(props: {
  readonly name: IconName;
  readonly chevron?: boolean;
}): ComponentChild {
  return h(
    "svg",
    {
      // A fold's chevron turns as its fold opens.
      class: props.chevron === true ? "icon chev" : "icon",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    h("path", { d: ICON_PATHS[props.name] }),
  );
}

/** A section's head: its title at the section's size in ink, its count, and one aside on the right. */
export function SectionHead(props: {
  readonly title: ComponentChildren;
  readonly count?: number | null;
  readonly aside?: ComponentChildren;
}): ComponentChild {
  return h(
    "div",
    { class: "section-head", "data-component": "SectionHead" },
    h(
      "h2",
      null,
      props.title,
      // A space read aloud between the title and its count; the pill's margin draws it.
      props.count === undefined || props.count === null
        ? null
        : [" ", h("span", { class: "count" }, String(props.count))],
    ),
    props.aside === undefined || props.aside === null
      ? null
      : h("span", { class: "aside" }, props.aside),
  );
}

/** A section's one body of rows: the raised box with its hairline and radius, a hairline between rows, its groups banded. */
export function ListBox(props: {
  readonly label?: string;
  readonly children?: ComponentChildren;
}): ComponentChild {
  return h(
    "div",
    { class: "listbox", "aria-label": props.label, "data-component": "ListBox" },
    props.children,
  );
}

/** The states a group opens for when its tally holds them (J-164 S1). */
const OPENING: ReadonlySet<string> = new Set(["failed", "error", "stale", "waiting"]);

/**
 * Whether a group starts open: it holds the step now or something that
 * waits, its tally holds a failed, error, stale or waiting item, or it holds
 * three items or fewer.
 * @param count how many items it holds
 * @param tally how many stand in each state
 * @param now whether it holds the step now or something waiting on the owner
 * @returns whether it starts open
 */
export function groupOpens(
  count: number,
  tally: readonly (readonly [string, number])[],
  now: boolean,
): boolean {
  if (now) return true;
  if (tally.some(([word, items]) => items > 0 && OPENING.has(word))) return true;
  return count <= 3;
}

/** The tones from the one that most asks the eye to the least. */
const WORST_FIRST: readonly StateTone[] = [
  "fail",
  "need",
  "warn",
  "accent",
  "info",
  "pass",
  "idle",
  "plain",
];

/**
 * The state a closed group shows the mark of: the one of its tally that most
 * asks the eye, failed before waiting before drifting before the rest.
 * @param tally how many stand in each state
 * @returns the state's word, or null where the tally holds none
 */
export function worstState(tally: readonly (readonly [string, number])[]): string | null {
  const held = tally.filter(([, items]) => items > 0).map(([word]) => word);
  let worst: string | null = null;
  let rank = WORST_FIRST.length;
  for (const word of held) {
    const at = WORST_FIRST.indexOf(stateTone(word).tone);
    if (at < rank) {
      worst = word;
      rank = at;
    }
  }
  return worst;
}

/** Where the open groups are kept for the page, across a reload of the tab. */
const GROUPS_KEY = "greenline-inspect-groups";

/**
 * A group's open state as the owner left it on this page, if they did.
 * @param id the group's key on its page
 * @returns whether it was left open, or undefined where it was not touched
 */
function keptOpen(id: string): boolean | undefined {
  try {
    const kept = JSON.parse(sessionStorage.getItem(GROUPS_KEY) ?? "{}");
    const value = kept[`${location.pathname}#${id}`];
    return value === true || value === false ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keep a group's open state for this page.
 * @param id the group's key on its page
 * @param open whether it is open
 */
function keepOpen(id: string, open: boolean): void {
  try {
    const kept = JSON.parse(sessionStorage.getItem(GROUPS_KEY) ?? "{}");
    kept[`${location.pathname}#${id}`] = open;
    sessionStorage.setItem(GROUPS_KEY, JSON.stringify(kept));
  } catch {
    // A browser that keeps no storage opens each group by its rule again.
  }
}

/** A group of like things: what it holds, how they stand, and what it opens to. */
export interface GroupProps {
  /** Its key on the page, which keeps its open state across a reload. */
  readonly id: string;
  readonly title: ComponentChildren;
  readonly count: number;
  /** How many stand in each state, in the shared words; a state none stands in is left out. */
  readonly tally?: readonly (readonly [string, number])[];
  /** A quantity on the right, such as the lines added and removed. */
  readonly quantity?: ComponentChildren;
  /** It holds the step now or something waiting on the owner. */
  readonly now?: boolean;
  /** Its open state where the page decides it; else as the owner left it, else by the rule. */
  readonly open?: boolean | undefined;
  /** Drawn without its head; a group of one item is, unless told otherwise. */
  readonly flat?: boolean;
  /** A region of the frame map, drawn as its box with its own head. */
  readonly box?: boolean;
  readonly anchor?: string;
  readonly component?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly children?: ComponentChildren;
}

/**
 * One group (J-164 S1): a head on the group's band with its chevron, title,
 * count, its tally in the shared words, the worst state's mark while it is
 * closed and a quantity on the right; its body holds the items. It starts
 * open by the rule, or as the owner left it on this page; a group of one
 * item is drawn flat.
 */
export function Group(props: GroupProps): ComponentChild {
  const tally = (props.tally ?? []).filter(([, items]) => items > 0);
  const flat = props.flat ?? props.count === 1;
  const classes = props.box === true ? "group box node" : "group";
  if (flat)
    return h(
      "div",
      {
        class: classes,
        "data-flat": "yes",
        "data-component": props.component ?? "Group",
        "data-anchor": props.anchor,
        ...props.attributes,
      },
      props.children,
    );
  const open =
    keptOpen(props.id) ?? props.open ?? groupOpens(props.count, tally, props.now === true);
  const worst = worstState(tally);
  return h(
    "details",
    {
      class: classes,
      open,
      "data-component": props.component ?? "Group",
      "data-group": props.id,
      "data-anchor": props.anchor,
      ...props.attributes,
      onToggle: (event: Event) => {
        if (event.currentTarget instanceof HTMLDetailsElement)
          keepOpen(props.id, event.currentTarget.open);
      },
    },
    props.box === true
      ? h("summary", { class: "group-head", "data-item": "" }, props.title)
      : h(
          "summary",
          { class: "group-head", "data-item": "" },
          h(Icon, { name: "chevron", chevron: true }),
          worst === null
            ? null
            : h("span", {
                class: "word worst",
                "data-tone": stateTone(worst).tone,
                "data-settled": "yes",
                title: SPOKEN.get(worst) ?? worst,
              }),
          h("span", { class: "group-title" }, props.title),
          h("span", { class: "count" }, String(props.count)),
          tally.length === 0
            ? null
            : h(
                "span",
                { class: "tally" },
                tally.map(([word, items]) =>
                  h("span", { class: "summary-state" }, String(items), " ", h(StateWord, { word })),
                ),
              ),
          props.quantity === undefined ? null : h("span", { class: "quantity" }, props.quantity),
        ),
    h("div", { class: "group-body" }, props.children),
  );
}

/** A fold's three views: its reading, its raw text, and its document as JSON. */
export type FoldView = "read" | "source" | "json";

const VIEW_WORDS = {
  read: "Read",
  source: "Source",
  json: "JSON",
} as const satisfies Readonly<Record<FoldView, string>>;

/**
 * The view after the one shown, which `v` turns to, the first after the last.
 * @param views the views the fold offers
 * @param current the view shown
 * @returns the next
 */
export function nextView(views: readonly FoldView[], current: FoldView): FoldView {
  const at = views.indexOf(current);
  return views[(at + 1) % views.length] ?? "read";
}

/**
 * The view an address asks for with `?view=`, where it names one the fold offers.
 * @param search the address's query
 * @param views the views the fold offers
 * @returns the view, or undefined
 */
export function viewAsked(search: string, views: readonly FoldView[]): FoldView | undefined {
  const asked = new URLSearchParams(search).get("view");
  return views.find((view) => view === asked);
}

/** Where the view picked for each kind of artefact is kept in the browser. */
const VIEW_KEY = "greenline-inspect-view";

function keptView(kind: string, views: readonly FoldView[]): FoldView | undefined {
  try {
    const kept = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}")[kind];
    return views.find((view) => view === kept);
  } catch {
    return undefined;
  }
}

function keepView(kind: string, view: FoldView): void {
  try {
    const kept = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}");
    kept[kind] = view;
    localStorage.setItem(VIEW_KEY, JSON.stringify(kept));
  } catch {
    // A browser that keeps no storage opens each fold on Read again.
  }
}

/**
 * The address a fold's view is shown at: the fold's own, with `?view=` for
 * a view other than Read.
 * @param address the fold's address
 * @param view the view
 * @returns the address
 */
export function viewAddress(address: string, view: FoldView): string {
  return view === "read" ? address : `${address}?view=${view}`;
}

/** The three views as chips in a fold's open head, the one shown pressed. */
export function ViewSwitch(props: {
  readonly views: readonly FoldView[];
  readonly current: FoldView;
  readonly pick: (view: FoldView) => void;
}): ComponentChild {
  return h(
    "div",
    {
      class: "fold-views",
      role: "group",
      "aria-label": "The view",
      "data-component": "ViewSwitch",
    },
    props.views.map((view) =>
      h(
        "button",
        {
          type: "button",
          class: "chip",
          "data-view": view,
          "aria-pressed": String(view === props.current),
          onClick: (event: MouseEvent) => {
            event.preventDefault();
            props.pick(view);
          },
        },
        VIEW_WORDS[view],
      ),
    ),
  );
}

/** Copy a text to the clipboard, the button's own act: it writes nothing anywhere else. */
export function CopyButton(props: {
  readonly text: string;
  /** Its words; Copy where none is given. */
  readonly label?: string;
  /** What the button copies, for a reader of the page. */
  readonly title?: string;
}): ComponentChild {
  return h(
    "button",
    {
      type: "button",
      class: "small ghost",
      "data-component": "CopyButton",
      title: props.title,
      onClick: (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard?.writeText(props.text).catch(() => undefined);
      },
    },
    props.label ?? "Copy",
  );
}

/** The lines of a text as the source view numbers them, the last empty line left out. */
function numbered(text: string): ComponentChild {
  const lines = text.replace(/\n$/, "").split("\n");
  return h(
    "pre",
    { class: "source-lines" },
    lines.map((line) => h("span", null, line === "" ? " " : line)),
  );
}

/** An artefact's raw text: mono on the well, each line numbered, with Copy. */
export function SourceView(props: { readonly text: string }): ComponentChild {
  const lines = props.text.replace(/\n$/, "").split("\n").length;
  return h(
    "div",
    { class: "source-view", "data-component": "SourceView" },
    h(
      "div",
      { class: "source-tools" },
      h("span", null, plural(lines, "line")),
      h(CopyButton, { text: props.text }),
    ),
    numbered(props.text),
  );
}

/** An artefact's document as JSON, pretty-printed, with a link to its address where it has one. */
export function JsonView(props: {
  readonly text: string;
  readonly address: string | null;
}): ComponentChild {
  return h(
    "div",
    { class: "json-view", "data-component": "JsonView" },
    h(
      "div",
      { class: "source-tools" },
      props.address === null
        ? h("span", null, "as the page holds it")
        : h(
            "a",
            { class: "mono", href: props.address, target: "_blank", rel: "noopener" },
            props.address,
          ),
      h(CopyButton, { text: props.text }),
    ),
    numbered(props.text),
  );
}

/** What a fold reads from its own document when it opens, and how its views draw it. */
export interface FoldDocument<K extends DocumentKind> {
  /** The document's address under /api/. */
  readonly address: string;
  readonly kind: K;
  /** What it reads, as a phrase, for its loading line. */
  readonly reads: string;
  readonly read: (document: DocumentOf<K>) => ComponentChildren;
  /** Its raw text, or null where it has none. */
  readonly source: (document: DocumentOf<K>) => string | null;
}

/** What a fold draws from what its page already holds. */
export interface FoldHeld {
  readonly read: () => ComponentChildren;
  readonly source: string | null;
  /** Its JSON and the address it is served at, or null where none. */
  readonly json: { readonly text: string; readonly address: string | null } | null;
}

/** One fold of one artefact. */
export interface ArtefactFoldProps<K extends DocumentKind> {
  /** Its anchor on the page. */
  readonly id: string;
  /** The kind of artefact, under which the view the owner picks is remembered. */
  readonly kind: string;
  /** The component's name, which the render check counts. */
  readonly component: string;
  /** Its facts, shown closed and open. */
  readonly head: ComponentChildren;
  /** Whether it starts open, as its address asks. */
  readonly open: boolean;
  /** The page's address with this fold open, which the address follows; null where it has none. */
  readonly address: string | null;
  /** The page's address with it closed. */
  readonly closed: string | null;
  readonly document?: FoldDocument<K> | undefined;
  readonly held?: FoldHeld | undefined;
  readonly attributes?: Readonly<Record<string, string>>;
}

/** The views a fold offers: Read always, Source and JSON where it has them. */
function viewsOf<K extends DocumentKind>(props: ArtefactFoldProps<K>): readonly FoldView[] {
  if (props.document !== undefined) return ["read", "source", "json"];
  const held = props.held;
  return [
    "read",
    ...(held?.source === null || held?.source === undefined ? [] : (["source"] as const)),
    ...(held?.json === null || held?.json === undefined ? [] : (["json"] as const)),
  ];
}

/** The fold that `v` turns: the last one opened. */
let lastOpened: HTMLDetailsElement | null = null;

/**
 * The fold the view key turns: the fold in focus, else the last one opened while it stays open.
 * @param focused the element in focus
 * @returns the fold, or null where none is open
 */
export function foldToTurn(focused: Element | null): HTMLDetailsElement | null {
  const inFocus = focused?.closest("details.fold");
  if (inFocus instanceof HTMLDetailsElement && inFocus.open) return inFocus;
  return lastOpened !== null && lastOpened.isConnected && lastOpened.open ? lastOpened : null;
}

/**
 * Let the address follow a fold: the fold's own address while it is open,
 * the page's again once it closes, where the address was the fold's.
 * @param open whether the fold is open now
 * @param address its address
 * @param closed the page's address without it
 * @param view the view it shows
 */
function follow(
  open: boolean,
  address: string | null,
  closed: string | null,
  view: FoldView,
): void {
  if (address === null) return;
  if (open) {
    const next = viewAddress(address, view);
    if (`${location.pathname}${location.search}` !== next) history.replaceState(null, "", next);
  } else if (location.pathname === address && closed !== null)
    history.replaceState(null, "", closed);
}

/** A fold's document, read when it opens, in the view the switch shows. */
function FoldReading<K extends DocumentKind>(props: {
  readonly document: FoldDocument<K>;
  readonly view: FoldView;
}): ComponentChild {
  const { document, view } = props;
  const reading = useDocument(document.address, document.kind);
  return drawReading(
    reading,
    (read) => {
      if (view === "read") return document.read(read);
      if (view === "json")
        return h(JsonView, { text: JSON.stringify(read, null, 2), address: document.address });
      const source = document.source(read);
      return source === null
        ? h(Empty, { title: "This artefact holds no raw text of its own." })
        : h(SourceView, { text: source });
    },
    document.reads,
    "text",
  );
}

/** A fold's held content in the view the switch shows. */
function heldView(held: FoldHeld, view: FoldView): ComponentChildren {
  if (view === "source" && held.source !== null) return h(SourceView, { text: held.source });
  if (view === "json" && held.json !== null)
    return h(JsonView, { text: held.json.text, address: held.json.address });
  return held.read();
}

/**
 * The open part of a fold: the view switch and the view, read when the fold
 * opens; it follows its fold's toggle, lets the address follow it, and keeps
 * the view the owner picks for the kind.
 */
function FoldOpen<K extends DocumentKind>(props: ArtefactFoldProps<K>): ComponentChild {
  const views = viewsOf(props);
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(props.open);
  const [view, setView] = useState<FoldView>(
    () =>
      (props.open ? viewAsked(location.search, views) : undefined) ??
      keptView(props.kind, views) ??
      "read",
  );
  // Attached as the fold is laid out, before a click can reach it; a toggle missed before then is read here.
  useLayoutEffect(() => {
    const details = ref.current?.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return undefined;
    const onToggle = (): void => {
      setOpen(details.open);
      if (details.open) lastOpened = details;
      follow(details.open, props.address, props.closed, view);
    };
    if (details.open !== open) onToggle();
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, [props.address, props.closed, view]);
  const pick = (next: FoldView): void => {
    setView(next);
    keepView(props.kind, next);
    if (props.address !== null && location.pathname === props.address)
      history.replaceState(null, "", viewAddress(props.address, next));
  };
  return h(
    "div",
    { ref, class: "fold-open", "data-shown": view },
    open ? foldContent(props, views, view, pick) : null,
  );
}

/** What an open fold draws: its switch where it offers more than one view, then the view. */
function foldContent<K extends DocumentKind>(
  props: ArtefactFoldProps<K>,
  views: readonly FoldView[],
  view: FoldView,
  pick: (view: FoldView) => void,
): ComponentChildren {
  return [
    views.length > 1 ? h(ViewSwitch, { views, current: view, pick }) : null,
    props.document !== undefined
      ? h(FoldReading<K>, { document: props.document, view })
      : props.held === undefined
        ? null
        : heldView(props.held, view),
  ];
}

/**
 * What a fold's open part draws on its first paint, without its state: the
 * held reading where it starts open, the reading's loading line where it
 * reads its document, nothing where it starts closed. A drawing of a page
 * without a browser (the tests') draws this in its place.
 */
FoldOpen.firstPaint = <K extends DocumentKind>(props: ArtefactFoldProps<K>): ComponentChildren =>
  !props.open
    ? null
    : props.document !== undefined
      ? h(ReadState, { face: "loading", reads: props.document.reads, form: "text" })
      : props.held === undefined
        ? null
        : props.held.read();

/**
 * One fold of one artefact (J-164 S1): its facts in the head, and once open
 * its view, Read the default, Source its raw text with line numbers and
 * Copy, JSON its document with its address, switched by the chips in the
 * head or by `v`. Several folds open at once; the address follows the last
 * one opened. A fold that reads its own document reads it when it opens.
 */
export function ArtefactFold<K extends DocumentKind>(props: ArtefactFoldProps<K>): ComponentChild {
  return h(
    "details",
    {
      class: "fold",
      open: props.open,
      "data-anchor": props.id,
      "data-component": props.component,
      "data-fold": props.kind,
      "data-address": props.address ?? undefined,
      ...props.attributes,
    },
    h(
      "summary",
      { "data-item": "" },
      h(Icon, { name: "chevron", chevron: true }),
      h("span", { class: "fold-head" }, props.head),
    ),
    h(FoldOpen<K>, props),
  );
}

/**
 * Five blocks for a file's lines: the share added, the share removed, the
 * rest on the track; a side with any line keeps at least one block.
 * @param added lines added
 * @param removed lines removed
 * @returns five blocks, each `add`, `del` or `none`
 */
export function deltaBlocks(added: number, removed: number): readonly ("add" | "del" | "none")[] {
  const total = added + removed;
  if (total === 0) return ["none", "none", "none", "none", "none"];
  let adds = Math.round((5 * added) / total);
  let dels = Math.round((5 * removed) / total);
  if (added > 0 && adds === 0) adds = 1;
  if (removed > 0 && dels === 0) dels = 1;
  while (adds + dels > 5)
    if (adds >= dels) adds -= 1;
    else dels -= 1;
  return [
    ...Array.from({ length: adds }, () => "add" as const),
    ...Array.from({ length: dels }, () => "del" as const),
    ...Array.from({ length: 5 - adds - dels }, () => "none" as const),
  ];
}

/**
 * Lines as the page counts them, the minus sign U+2212.
 * @param added lines added
 * @param removed lines removed
 * @returns the two counts, `+148` and `−57`
 */
function deltaWords(added: number, removed: number): readonly [string, string] {
  return [`+${String(added)}`, `−${String(removed)}`];
}

/** Lines added in the add tone and removed in the del tone, mono and tabular; a binary file says so. */
export function Delta(props: {
  readonly added: number | null;
  readonly removed: number | null;
}): ComponentChild {
  if (props.added === null || props.removed === null)
    return h("span", { class: "delta", "data-component": "Delta" }, "binary");
  const [plus, minus] = deltaWords(props.added, props.removed);
  return h(
    "span",
    {
      class: "delta",
      "data-component": "Delta",
      title: `${plural(props.added, "line")} added, ${String(props.removed)} removed`,
    },
    h("span", { class: "add" }, plus),
    " ",
    h("span", { class: "del" }, minus),
  );
}

/** The bar of five blocks beside a delta. */
function DeltaBar(props: { readonly added: number; readonly removed: number }): ComponentChild {
  return h(
    "span",
    { class: "delta-bar", "aria-hidden": "true" },
    deltaBlocks(props.added, props.removed).map((kind) => h("i", { "data-kind": kind })),
  );
}

/** A delta with its bar of five blocks. */
export function LinesDelta(props: {
  readonly added: number | null;
  readonly removed: number | null;
}): ComponentChild {
  if (props.added === null || props.removed === null)
    return h("span", { class: "delta", "data-component": "LinesDelta" }, "binary");
  const [plus, minus] = deltaWords(props.added, props.removed);
  return h(
    "span",
    {
      class: "delta",
      "data-component": "LinesDelta",
      title: `${plural(props.added, "line")} added, ${String(props.removed)} removed`,
    },
    h("span", { class: "add" }, plus),
    " ",
    h("span", { class: "del" }, minus),
    h(DeltaBar, { added: props.added, removed: props.removed }),
  );
}

/** How many folders the files line names before it counts the rest. */
const FOLDERS_NAMED = 3;

/**
 * A folder as the page names it.
 * @param folder its path from the root, `.` for the root
 * @returns `the root` or `src/web/`
 */
export function folderName(folder: string): string {
  return folder === "." ? "the root" : `${folder}/`;
}

/**
 * The files line (J-164 S1): its lead, the count of files, the lines added
 * and removed with their bar, the folders as chips, the rest counted with
 * their names on hover, and greenline's own files counted apart.
 */
export function FilesLine(props: {
  readonly lead?: ComponentChildren;
  readonly files: ChangedFiles;
}): ComponentChild {
  const { files } = props;
  const named = files.groups.slice(0, FOLDERS_NAMED);
  const rest = files.groups.slice(FOLDERS_NAMED);
  return h(
    "p",
    { class: "files-line", "data-component": "FilesLine" },
    props.lead === undefined ? null : h("span", null, props.lead),
    h("span", { class: "title" }, plural(files.totals.files, "file")),
    h(LinesDelta, { added: files.totals.added, removed: files.totals.removed }),
    named.length === 0 ? null : h("span", { class: "meta" }, "in"),
    named.map((group) =>
      h(
        "span",
        { class: "folder-chip", title: plural(group.count, "file") },
        folderName(group.folder),
      ),
    ),
    rest.length === 0
      ? null
      : h(
          "span",
          { class: "meta", title: rest.map((group) => folderName(group.folder)).join(", ") },
          `and ${plural(rest.length, "more folder")}`,
        ),
    files.installed === 0
      ? null
      : h(
          "span",
          {
            class: "meta",
            title: "greenline's own trees, .agents/, .claude/ and .greenline/, counted apart",
          },
          `and ${String(files.installed)} of greenline's own`,
        ),
  );
}

/** One changed file as a row: its name, the lines added, the lines removed and their bar. */
export function FileRow(props: {
  readonly path: string;
  readonly added: number | null;
  readonly removed: number | null;
  /** The name shown; the path's last part where none is given. */
  readonly name?: string;
}): ComponentChild {
  const binary = props.added === null || props.removed === null;
  const [plus, minus] = binary ? ["binary", ""] : deltaWords(props.added ?? 0, props.removed ?? 0);
  return h(
    "span",
    { class: "file-row", "data-component": "FileRow", title: props.path },
    h("span", { class: "name" }, props.name ?? props.path.split("/").at(-1) ?? props.path),
    h("span", { class: binary ? "meta" : "add" }, plus),
    h("span", { class: "del" }, minus),
    binary
      ? h("span", null)
      : h(DeltaBar, { added: props.added ?? 0, removed: props.removed ?? 0 }),
  );
}

/** How the bar says the page's reading stands: live, behind by an age, or stopped. */
export type LiveState = "live" | "behind" | "stopped";

/** The bar's read age: its state and its words. */
export interface LiveReading {
  readonly state: LiveState;
  readonly words: string;
}

/**
 * The bar's read age in words (J-164 S1): Live within a minute of the last
 * read, then the age, Read 3 min ago; Stopped once the inspector no longer
 * answers.
 * @param readAt when the repository was last read
 * @param at now
 * @param answering whether the inspector answered the last ask
 * @returns the state and its words
 */
export function liveWords(readAt: Date, at: Date, answering: boolean): LiveReading {
  if (!answering) return { state: "stopped", words: "Stopped" };
  const minutes = Math.floor((at.getTime() - readAt.getTime()) / 60_000);
  if (minutes < 1) return { state: "live", words: "Live" };
  if (minutes < 60) return { state: "behind", words: `Read ${String(minutes)} min ago` };
  return { state: "behind", words: `Read ${String(Math.floor(minutes / 60))} h ago` };
}

/*
 * The second cut's page parts (J-166 S1): a time as the lists name it, the
 * neutral meter, the finish sparkline, the capture's three score chips, a
 * check's badge, the step cells of a skill's loads, and the options of a
 * question as tiles, each copied in place and none written.
 */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Two digits. */
const two = (value: number): string => String(value).padStart(2, "0");

/** The days from a time's own day to the page's, on the reader's clock. */
function daysBefore(date: Date, at: Date): number {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const then = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((day - then) / 86_400_000);
}

/**
 * A time as a list names it, on the reader's own clock: the time today,
 * `yesterday` and the time, the day and month and the time this year, the
 * date before.
 * @param iso the time
 * @param at the time the page is read at
 * @returns `15:58`, `yesterday 15:58`, `28 Oct 15:58` or `28 Oct 2025`
 */
export function dayTime(iso: string, at: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const clock = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const days = daysBefore(date, at);
  if (days === 0) return clock;
  if (days === 1) return `yesterday ${clock}`;
  const month = MONTH_NAMES[date.getMonth()] ?? "";
  return date.getFullYear() === at.getFullYear()
    ? `${String(date.getDate())} ${month} ${clock}`
    : `${String(date.getDate())} ${month} ${String(date.getFullYear())}`;
}

/**
 * The day a time falls on, as a group of a list names it.
 * @param iso the time
 * @param at the time the page is read at
 * @returns `Today`, `Yesterday` or `Wed 28 Oct`
 */
export function dayName(iso: string, at: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Undated";
  const days = daysBefore(date, at);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const year = date.getFullYear() === at.getFullYear() ? "" : ` ${String(date.getFullYear())}`;
  return `${WEEKDAYS[date.getDay()] ?? ""} ${String(date.getDate())} ${MONTH_NAMES[date.getMonth()] ?? ""}${year}`;
}

/**
 * Minutes as a span of work.
 * @param minutes whole minutes
 * @returns `33 min`, `1 h 10` or `3 days`
 */
export function tookWords(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 48) return `${String(Math.floor(hours / 24))} days`;
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${two(rest)}`;
}

/** A time in the list's words, the absolute time in UTC on hover. */
export function When(props: { readonly iso: string; readonly at: Date }): ComponentChild {
  return h(
    "time",
    { class: "when", dateTime: props.iso, title: when(props.iso), "data-component": "When" },
    dayTime(props.iso, props.at),
  );
}

/** A quantity on the neutral meter, never the done green: its share of the most, its count beside it, aligned. */
export function Meter(props: {
  readonly value: number;
  readonly most: number;
  /** What the count counts, for a reader of the page. */
  readonly label: string;
  /** The count beside the bar; none where the row says it elsewhere. */
  readonly count?: boolean;
}): ComponentChild {
  const share = props.most <= 0 ? 0 : Math.max(0, Math.min(1, props.value / props.most));
  return h(
    "span",
    { class: "meter-line", "data-component": "Meter" },
    h(
      "span",
      { class: "meter", role: "img", "aria-label": `${String(props.value)} ${props.label}` },
      h("span", { style: `width:${(share * 100).toFixed(1)}%` }),
    ),
    props.count === false ? null : h("span", { class: "meter-count" }, String(props.value)),
  );
}

/** A run of numbers as a line, the oldest on the left, scaled to its highest. */
export function Sparkline(props: {
  readonly values: readonly number[];
  /** What the numbers are, for a reader of the page. */
  readonly label: string;
}): ComponentChild {
  const values = props.values;
  if (values.length < 2) return null;
  const most = Math.max(1, ...values);
  const step = 60 / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(14 - (value / most) * 12).toFixed(1)}`)
    .join(" ");
  return h(
    "svg",
    {
      class: "sparkline",
      viewBox: "0 0 60 16",
      role: "img",
      "aria-label": `${props.label}: ${values.join(", ")}`,
      "data-component": "Sparkline",
    },
    h("polyline", { points }),
  );
}

/** A capture's three scores as chips: the floor's and the reflex's reds in their tone when above zero, the finish neutral. */
export function ScoreChips(props: {
  readonly floor: number;
  readonly reflex: number;
  readonly finish: number;
  /** The finish of every capture of the address, the oldest first, drawn as a line. */
  readonly history?: readonly number[];
}): ComponentChild {
  const chip = (
    name: string,
    count: number,
    tone: StateTone | null,
    title: string,
  ): ComponentChild =>
    h(
      "span",
      { class: "score-chip", "data-tone": tone ?? undefined, title },
      h("span", { class: "score-name" }, name),
      " ",
      h("span", { class: "score-count" }, String(count)),
    );
  return h(
    "span",
    { class: "score-chips", "data-component": "ScoreChips" },
    chip(
      "floor",
      props.floor,
      props.floor > 0 ? "fail" : null,
      `${plural(props.floor, "floor finding")} in red`,
    ),
    chip(
      "reflex",
      props.reflex,
      props.reflex > 0 ? "warn" : null,
      `${plural(props.reflex, "reflex finding")} in red`,
    ),
    chip("finish", props.finish, null, plural(props.finish, "finish note")),
    props.history === undefined
      ? null
      : h(Sparkline, { values: props.history, label: "The finish notes, capture by capture" }),
  );
}

/** A check's badge: how many of the declared checks passed, in the pass tone, or how many failed, in the fail tone. */
export function CheckBadge(props: {
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
}): ComponentChild {
  if (props.total === 0)
    return h(
      "span",
      { class: "check-badge", "data-tone": "idle", "data-component": "CheckBadge" },
      "no check",
    );
  const failing = props.failed > 0;
  return h(
    "span",
    {
      class: "check-badge",
      "data-tone": failing ? "fail" : props.passed === props.total ? "pass" : "plain",
      "data-component": "CheckBadge",
      title: failing
        ? `${String(props.failed)} of ${plural(props.total, "check")} failed`
        : `${String(props.passed)} of ${plural(props.total, "check")} passed`,
    },
    failing
      ? `${String(props.failed)} of ${String(props.total)} failed`
      : `${String(props.passed)}/${String(props.total)}`,
  );
}

/** The steps of the line, in its order, which a skill's step cells follow. */
export const LINE_STEPS: readonly string[] = [
  "frame",
  "design",
  "plan",
  "anticipate",
  "build",
  "review",
  "verify",
  "close",
];

/**
 * A skill's loads over the line as eight cells (J-166 S1): each step's
 * cell as tall as its share of the skill's loads, its own step in the
 * accent, the loads before the record stood a dashed ninth cell.
 */
export function StepCells(props: {
  readonly byStep: readonly { readonly name: string; readonly loads: number }[];
  /** The step the skill serves; null for a habit or a start. */
  readonly own: string | null;
}): ComponentChild {
  const by = new Map(props.byStep.map((entry) => [entry.name, entry.loads]));
  const most = Math.max(1, ...props.byStep.map((entry) => entry.loads));
  const before = by.get("before the record") ?? 0;
  const label = props.byStep.map((entry) => `${entry.name} ${String(entry.loads)}`).join(", ");
  const height = (loads: number): string => `--h:${String(Math.round((loads / most) * 100))}%`;
  return h(
    "span",
    {
      class: "step-cells",
      role: "img",
      "aria-label": `Loads by step: ${label === "" ? "none" : label}`,
      "data-component": "StepCells",
    },
    LINE_STEPS.map((step) => {
      const loads = by.get(step) ?? 0;
      return h("span", {
        class: "cell",
        "data-own": step === props.own ? "yes" : undefined,
        "data-empty": loads === 0 ? "yes" : undefined,
        title: `${step}: ${String(loads)}`,
        style: height(loads),
      });
    }),
    h("span", {
      class: "cell before",
      "data-empty": before === 0 ? "yes" : undefined,
      title: `before the record: ${String(before)}`,
      style: height(before),
    }),
  );
}

/** A counter for the radio groups a page draws, so each group's name is its own. */
let choiceGroups = 0;

/** The ChoiceTiles drawn with what it holds: its first paint without a browser, its state in one. */
export function ChoiceTiles(props: ChoiceProps): ComponentChild {
  return h(ChoiceTilesHeld, props);
}

/**
 * The options of a question as tiles side by side (J-166 S1), each
 * numbered with its words and a Copy that writes nothing; where the owner
 * may pick one, the tiles are radios and Copy my answer copies the question
 * with the pick, for the owner to paste into the session.
 */
function ChoiceTilesHeld(props: ChoiceProps): ComponentChild {
  const [picked, setPicked] = useState(0);
  const [name] = useState(() => {
    choiceGroups += 1;
    return `choice-${String(choiceGroups)}`;
  });
  return choiceTiles(props, picked, setPicked, name);
}

/** The tiles on their first paint, the first option picked; a drawing of a page without a browser draws this. */
ChoiceTilesHeld.firstPaint = (props: ChoiceProps): ComponentChildren =>
  choiceTiles(props, 0, () => undefined, "choice");

/** What a question's tiles show. */
interface ChoiceProps {
  readonly question: string;
  readonly options: readonly string[];
  /** The tiles are radios with one answer to copy, as the change page's banner offers them. */
  readonly pick?: boolean;
}

/** The tiles drawn with the pick they hold. */
function choiceTiles(
  props: ChoiceProps,
  picked: number,
  setPicked: (index: number) => void,
  name: string,
): ComponentChild {
  const chosen = props.options[picked] ?? props.options[0] ?? "";
  return h(
    "div",
    { class: "choice", "data-component": "ChoiceTiles" },
    h(
      "div",
      { class: "choice-tiles", role: props.pick === true ? "radiogroup" : "list" },
      props.options.map((option, index) =>
        props.pick === true
          ? h(
              "label",
              { class: "choice-tile", "data-picked": index === picked ? "yes" : undefined },
              h("input", {
                type: "radio",
                name,
                checked: index === picked,
                onChange: () => setPicked(index),
              }),
              h("span", { class: "choice-number" }, String(index + 1)),
              h("span", { class: "choice-words" }, option),
            )
          : h(
              "div",
              { class: "choice-tile", role: "listitem" },
              h("span", { class: "choice-number" }, String(index + 1)),
              h("span", { class: "choice-words" }, option),
              h(CopyButton, { text: option, title: `Copies option ${String(index + 1)}` }),
            ),
      ),
    ),
    props.pick === true
      ? h(
          "p",
          { class: "choice-act" },
          h(CopyButton, {
            text: `On ${props.question}: ${chosen}`,
            label: "Copy my answer",
            title: "Copies the question and your pick; nothing is written",
          }),
          h("span", { class: "meta" }, "Paste it in your session; copying writes nothing."),
        )
      : null,
  );
}
