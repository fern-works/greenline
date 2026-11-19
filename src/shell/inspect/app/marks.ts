import { h, type ComponentChild } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Box, BoxedElement } from "../../../core/interface-boxes.ts";
import { elementAt, elementsUnder } from "../../../core/interface-hits.ts";
import type { CaptureView, CaptureWidthView, MarkView } from "../../../core/inspector/documents.ts";
import type { Mark } from "../../../core/marks.ts";
import { pathOf } from "./addresses.ts";
import { BoxWire } from "./pages.ts";
import { Callout, Empty, JsonView, plural, SectionHead, StateWord, Tag, when } from "./ui.ts";

/*
 * The hand (J-124 S3): a capture at one width with its boxes as a hover
 * layer, a click that picks an element and shows its role, text and
 * source, a pencil that draws a region and names the elements under it,
 * and a note with an intent that appends a mark; the marks by state, each
 * opening its capture; before and after side by side for a mark the agent
 * answered, the element outlined in both; and capture now. Every hit test
 * is the core's, over the boxes the capture kept.
 */

/** The intents a mark carries, as the marks record names them. */
const INTENTS = ["fix", "question", "options", "idea"] as const;

/** A point in the page's coordinates. */
type Point = readonly [number, number];

/** A box as a positioned rectangle over an image of a width and height, in percent. */
function placed(box: Box, width: number, height: number): string {
  const left = (box.x / width) * 100;
  const top = (box.y / height) * 100;
  return `left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${((box.width / width) * 100).toFixed(3)}%;height:${((box.height / height) * 100).toFixed(3)}%`;
}

/** What an element is, in one line: its role or tag, its text, its source. */
function elementLine(element: Pick<BoxedElement, "role" | "tag" | "text" | "source">): string {
  const source =
    element.source === null
      ? ""
      : ` · ${element.source.file}${element.source.line === null ? "" : `:${String(element.source.line)}`}`;
  return `${element.role ?? element.tag}${element.text === "" ? "" : ` · "${element.text}"`}${source}`;
}

/** What the stage is doing: picking elements or drawing a region. */
export type StageMode = "pick" | "pencil";

/**
 * How tall a capture's stage is in the page's pixels: its image's height
 * where it kept one, else its page down to three screens.
 * @param width the captured width
 * @returns the height
 */
function stageHeight(width: CaptureWidthView): number {
  if (width.image !== null) return Math.max(1, width.imageHeight);
  return Math.max(1, Math.min(Math.max(width.page.height, width.height), width.height * 3));
}

/**
 * One width of a capture, its image, or where it kept none the wireframe
 * its boxes draw (J-166 S1), under a layer that picks and draws, each note
 * a numbered pin; the layer leaves the page to scroll unless the pencil
 * draws.
 */
export function CaptureStage(props: {
  readonly width: CaptureWidthView;
  readonly mode: StageMode;
  readonly selected: BoxedElement | null;
  readonly stroke: readonly Point[];
  readonly marks: readonly Mark[];
  readonly onPick: (element: BoxedElement | null) => void;
  readonly onStroke: (points: readonly Point[]) => void;
  /** The height shown, in the page's pixels; the stage's whole height where none is given. */
  readonly tall?: number;
  /** The address, which the wireframe's words name. */
  readonly address?: string;
  /** Each note's number on the stage, by its id. */
  readonly numbers?: ReadonlyMap<string, number>;
}): ComponentChild {
  const { width } = props;
  const [hover, setHover] = useState<BoxedElement | null>(null);
  const drawing = useRef<Point[] | null>(null);
  const [live, setLive] = useState<readonly Point[]>([]);
  const tall = props.tall ?? stageHeight(width);
  const pointOf = (event: PointerEvent): Point | undefined => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return undefined;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return undefined;
    return [
      Math.round(((event.clientX - rect.left) / rect.width) * width.width),
      Math.round(((event.clientY - rect.top) / rect.height) * tall),
    ];
  };
  const shown = props.stroke.length > 0 ? props.stroke : live;
  return h(
    "div",
    {
      class: "capture-stage",
      "data-component": "CaptureStage",
      style: `max-width:${String(width.width)}px`,
    },
    width.image === null
      ? h(
          "div",
          { class: "capture-wire", style: `aspect-ratio:${String(width.width)}/${String(tall)}` },
          h(BoxWire, {
            width: { ...width, page: { width: width.page.width, height: tall } },
            address: props.address ?? "",
            whole: true,
            bare: true,
          }),
        )
      : h(
          "div",
          {
            class: "capture-picture",
            style: `aspect-ratio:${String(width.width)}/${String(tall)}`,
          },
          h("img", {
            src: width.image,
            alt: `The capture at ${String(width.width)} wide`,
            width: width.width,
            height: Math.max(1, width.imageHeight),
          }),
        ),
    h(
      "div",
      {
        class: props.mode === "pencil" ? "capture-layer drawing" : "capture-layer",
        role: "application",
        "aria-label":
          props.mode === "pencil"
            ? "Draw a region over the capture"
            : "Pick an element of the capture",
        onPointerMove: (event: PointerEvent) => {
          const point = pointOf(event);
          if (point === undefined) return;
          if (props.mode === "pick")
            setHover(elementAt(width.elements, point[0], point[1]) ?? null);
          else if (drawing.current !== null) {
            drawing.current.push(point);
            setLive([...drawing.current]);
          }
        },
        onPointerLeave: () => setHover(null),
        onPointerDown: (event: PointerEvent) => {
          if (props.mode !== "pencil") return;
          const point = pointOf(event);
          if (point === undefined) return;
          drawing.current = [point];
          setLive([point]);
        },
        onPointerUp: () => {
          if (props.mode !== "pencil" || drawing.current === null) return;
          const points = drawing.current;
          drawing.current = null;
          setLive([]);
          if (points.length > 1) props.onStroke(points);
        },
        onClick: (event: MouseEvent) => {
          if (props.mode !== "pick") return;
          const target = event.currentTarget;
          if (!(target instanceof HTMLElement)) return;
          const rect = target.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * width.width;
          const y = ((event.clientY - rect.top) / rect.height) * tall;
          props.onPick(elementAt(width.elements, x, y) ?? null);
        },
      },
      props.marks.map((mark) =>
        h(
          "span",
          {
            class: "capture-mark",
            title: mark.note,
            style: placed(mark.element?.box ?? mark.crop, width.width, tall),
          },
          props.numbers?.get(mark.id) === undefined
            ? null
            : h("span", { class: "pin" }, String(props.numbers.get(mark.id))),
        ),
      ),
      hover === null || hover === props.selected
        ? null
        : h("span", { class: "capture-box", style: placed(hover.box, width.width, tall) }),
      props.selected === null
        ? null
        : h("span", {
            class: "capture-box selected",
            style: placed(props.selected.box, width.width, tall),
          }),
      shown.length < 2
        ? null
        : h(
            "svg",
            {
              class: "capture-stroke",
              viewBox: `0 0 ${String(width.width)} ${String(tall)}`,
              preserveAspectRatio: "none",
              "aria-hidden": "true",
            },
            h("polyline", { points: shown.map((point) => point.join(",")).join(" ") }),
          ),
    ),
  );
}

/** What a mark's save reports. */
export type MarkSaving =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly id: string }
  | { readonly kind: "refused"; readonly message: string };

/** What the capture view sends to append a mark. */
export interface MarkDraft {
  readonly width: number;
  readonly selector?: string;
  readonly region?: readonly Point[];
  readonly note: string;
  readonly intent: string;
}

/**
 * A capture that kept no image (J-155 S6): in place of a blank frame, what
 * the capture did keep, its address, its widths and its scores, and why the
 * picker and the pencil wait.
 */
export function NoCaptureImage(props: {
  readonly capture: CaptureView;
  /** The picture's one line, as `/list at 1440, 768, 390: floor 0 red, finish 41`; null where none is given. */
  readonly summary: string | null;
}): ComponentChild {
  const { capture } = props;
  const widths = capture.widths.map((entry) => String(entry.width));
  const scores = props.summary === null ? "" : props.summary.split(": ").slice(1).join(": ");
  return h(
    "div",
    { class: "empty capture-empty", "data-component": "NoCaptureImage" },
    h("p", null, "This capture kept no image."),
    h(
      "p",
      null,
      `It recorded ${capture.address} at ${widths.join(", ")} wide`,
      scores === "" ? "" : `, scored ${scores}`,
      ", but no picture of the page, so the picker and the pencil have nothing to mark. Capture the address again to see it and mark it.",
    ),
  );
}

/** The capture page's three views: the picture with its notes, the elements as a table, the manifest as JSON. */
export type CaptureTab = "picture" | "elements" | "manifest";

/**
 * The width a capture opens at: the one the address names, else the one
 * closest to the reader's window, so a phone opens on the phone's capture.
 * @param capture the capture
 * @param asked the width the address names
 * @param viewport the reader's window's width
 * @returns the width
 */
export function openingWidth(
  capture: CaptureView,
  asked: number | undefined,
  viewport: number,
): number {
  if (asked !== undefined && capture.widths.some((entry) => entry.width === asked)) return asked;
  let best = capture.widths[0]?.width ?? 0;
  for (const entry of capture.widths)
    if (Math.abs(entry.width - viewport) < Math.abs(best - viewport)) best = entry.width;
  return best;
}

/** The capture as its manifest reads, each image named rather than copied. */
function manifestOf(capture: CaptureView): string {
  return JSON.stringify(
    {
      ...capture,
      widths: capture.widths.map((entry) => ({
        ...entry,
        image: entry.image === null ? null : "(the image, as a data address)",
        elements: `${plural(entry.elements.length, "element")}, in the Elements view`,
      })),
    },
    null,
    2,
  );
}

/** The elements of a capture at one width as a table: each one's role, its text and where its source was written. */
function ElementsTable(props: { readonly width: CaptureWidthView }): ComponentChild {
  const elements = props.width.elements;
  if (elements.length === 0)
    return h(Empty, { title: "This capture kept no element box at this width." });
  return h(
    "div",
    { class: "table-wrap", "data-component": "ElementsTable" },
    h(
      "table",
      null,
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          ["Role", "Text", "Source"].map((label) => h("th", null, label)),
        ),
      ),
      h(
        "tbody",
        null,
        elements.map((element) =>
          h(
            "tr",
            null,
            h("td", { class: "mono" }, element.role ?? element.tag),
            h("td", null, element.text),
            h(
              "td",
              { class: "mono" },
              element.source === null
                ? ""
                : `${element.source.file}${element.source.line === null ? "" : `:${String(element.source.line)}`}`,
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * The capture page's work (J-166 S1): the three views, Picture, Elements
 * and Manifest; on the picture, the widths, the picker and the pencil, the
 * stage with each note a numbered pin, the first screen or the whole page,
 * and beside it, under it on a phone, the notes on this capture numbered
 * as their pins and the note to write.
 */
export function CapturePanel(props: {
  readonly capture: CaptureView;
  readonly marks: readonly MarkView[];
  readonly saving: MarkSaving;
  readonly onMark: ((draft: MarkDraft) => void) | null;
  readonly initialWidth?: number | undefined;
}): ComponentChild {
  const { capture } = props;
  const viewport = Number(globalThis.innerWidth) || 1440;
  const [shownWidth, setShownWidth] = useState(() =>
    openingWidth(capture, props.initialWidth, viewport),
  );
  const [tab, setTab] = useState<CaptureTab>("picture");
  const [whole, setWhole] = useState(false);
  const [mode, setMode] = useState<StageMode>("pick");
  const [selected, setSelected] = useState<BoxedElement | null>(null);
  const [stroke, setStroke] = useState<readonly Point[]>([]);
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState<string>("fix");
  const savedId = props.saving.kind === "saved" ? props.saving.id : null;
  useEffect(() => {
    if (savedId === null) return;
    setNote("");
    setSelected(null);
    setStroke([]);
  }, [savedId]);
  const width = capture.widths.find((entry) => entry.width === shownWidth) ?? capture.widths[0];
  const own = props.marks.filter((view) => view.mark.capture.id === capture.id);
  const numbers = new Map(own.map((view, index) => [view.mark.id, index + 1]));
  // A width with neither an image nor a box has nothing to see or mark: its facts take the stage's place.
  const blank = width !== undefined && width.image === null && width.elements.length === 0;
  const toolReason = blank ? "This capture kept nothing to mark at this width." : undefined;
  const full = width === undefined ? 1 : stageHeight(width);
  const tall = width === undefined ? 1 : whole ? full : Math.min(full, width.height);
  const under =
    width === undefined || stroke.length < 2 ? [] : elementsUnder(width.elements, stroke);
  const ready =
    props.onMark !== null &&
    width !== undefined &&
    note.trim() !== "" &&
    (selected !== null || stroke.length > 1) &&
    props.saving.kind !== "saving";
  const tabButton = (key: CaptureTab, label: string): ComponentChild =>
    h(
      "button",
      {
        type: "button",
        class: "chip",
        "data-view": key,
        "aria-pressed": String(tab === key),
        onClick: () => setTab(key),
      },
      label,
    );
  return h(
    "section",
    { class: "section", "data-component": "CapturePanel" },
    capture.boxes === null ? null : h(Callout, { quiet: true }, capture.boxes),
    width === undefined
      ? h(Empty, { title: "No width to show." })
      : h(
          "div",
          null,
          h(
            "div",
            { class: "capture-tools", role: "toolbar", "aria-label": "The capture's tools" },
            capture.widths.map((entry) =>
              h(
                "button",
                {
                  type: "button",
                  "aria-pressed": entry.width === width.width ? "true" : "false",
                  onClick: () => {
                    setShownWidth(entry.width);
                    setSelected(null);
                    setStroke([]);
                  },
                },
                `${String(entry.width)} wide`,
              ),
            ),
            h(
              "button",
              {
                type: "button",
                disabled: blank,
                title: toolReason,
                "aria-pressed": mode === "pick" ? "true" : "false",
                onClick: () => {
                  setMode("pick");
                  setStroke([]);
                },
              },
              "Picker",
            ),
            h(
              "button",
              {
                type: "button",
                disabled: blank,
                title: toolReason,
                "aria-pressed": mode === "pencil" ? "true" : "false",
                onClick: () => {
                  setMode("pencil");
                  setSelected(null);
                },
              },
              "Pencil",
            ),
            h(
              "span",
              { class: "fold-views capture-views", role: "group", "aria-label": "The view" },
              tabButton("picture", "Picture"),
              tabButton("elements", "Elements"),
              tabButton("manifest", "Manifest"),
            ),
          ),
          tab === "elements"
            ? h(ElementsTable, { width })
            : tab === "manifest"
              ? h(JsonView, {
                  text: manifestOf(capture),
                  address: `/api/pictures/${capture.id.split("/").map(encodeURIComponent).join("/")}`,
                })
              : h(
                  "div",
                  { class: "capture-work" },
                  h(
                    "div",
                    { class: "capture-main" },
                    blank
                      ? h(NoCaptureImage, { capture, summary: null })
                      : h(CaptureStage, {
                          width,
                          mode,
                          selected,
                          stroke,
                          tall,
                          address: capture.address,
                          numbers,
                          marks: own
                            .filter((view) => view.mark.width === width.width)
                            .map((view) => view.mark),
                          onPick: (element) => {
                            setSelected(element);
                            setStroke([]);
                          },
                          onStroke: (points) => {
                            setStroke(points);
                            setSelected(null);
                          },
                        }),
                    blank || full <= width.height
                      ? null
                      : h(
                          "p",
                          { class: "meta" },
                          h(
                            "button",
                            {
                              type: "button",
                              class: "small ghost",
                              onClick: () => setWhole(!whole),
                            },
                            whole
                              ? "Show the first screen"
                              : `Show the whole page (${plural(Math.ceil(full / Math.max(1, width.height)), "screen")})`,
                          ),
                          width.image === null
                            ? " Drawn from the element boxes; no image was kept."
                            : null,
                        ),
                  ),
                  h(
                    "aside",
                    { class: "capture-side", "aria-label": "Your notes on this capture" },
                    h(SectionHead, { title: "Your notes on this capture", count: own.length }),
                    own.length === 0
                      ? h("p", { class: "meta" }, "No note on this capture yet.")
                      : h(
                          "ol",
                          { class: "rows note-pins" },
                          own.map((view) =>
                            h(
                              "li",
                              { "data-mark": view.mark.id },
                              h(
                                "div",
                                { class: "row-top" },
                                h(
                                  "span",
                                  { class: "pin" },
                                  String(numbers.get(view.mark.id) ?? ""),
                                ),
                                h(StateWord, { word: view.mark.state }),
                                h(Tag, null, view.mark.intent),
                                h("span", { class: "meta" }, `at ${String(view.mark.width)}`),
                              ),
                              h("p", null, h("q", null, view.mark.note)),
                            ),
                          ),
                        ),
                    blank
                      ? null
                      : h(
                          "div",
                          { class: "mark-form", "data-component": "MarkForm" },
                          h(
                            "p",
                            { class: "meta", "aria-live": "polite" },
                            selected !== null
                              ? `Picked: ${elementLine(selected)} (${selected.selector})`
                              : under.length > 0
                                ? `Drawn over: ${under.map((element) => elementLine(element)).join("; ")}`
                                : stroke.length > 1
                                  ? "Drawn over no element; the region stands on its own."
                                  : mode === "pick"
                                    ? "Click an element to mark it."
                                    : "Draw round what you mean.",
                          ),
                          h(
                            "label",
                            null,
                            "What is wrong or wanted",
                            h("textarea", {
                              value: note,
                              placeholder: "The call to action sits below the fold here.",
                              onInput: (event: Event) =>
                                setNote(
                                  event.currentTarget instanceof HTMLTextAreaElement
                                    ? event.currentTarget.value
                                    : note,
                                ),
                            }),
                          ),
                          h(
                            "div",
                            { class: "row-meta" },
                            h(
                              "label",
                              { class: "filter" },
                              "Intent",
                              h(
                                "select",
                                {
                                  value: intent,
                                  onChange: (event: Event) =>
                                    setIntent(
                                      event.currentTarget instanceof HTMLSelectElement
                                        ? event.currentTarget.value
                                        : intent,
                                    ),
                                },
                                INTENTS.map((option) => h("option", { value: option }, option)),
                              ),
                            ),
                          ),
                          h(
                            "p",
                            { class: "meta" },
                            "Saving keeps your note beside the capture; the agent reads it at its next turn.",
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "primary",
                              disabled: !ready,
                              onClick: () => {
                                if (!ready) return;
                                // The draft stays until the save lands, so a refused save keeps the owner's note.
                                props.onMark?.({
                                  width: width.width,
                                  ...(selected !== null
                                    ? { selector: selected.selector }
                                    : { region: stroke }),
                                  note: note.trim(),
                                  intent,
                                });
                              },
                            },
                            "Save the note",
                          ),
                          props.saving.kind === "refused"
                            ? h(Callout, null, props.saving.message)
                            : null,
                          props.saving.kind === "saved"
                            ? h(
                                Callout,
                                { quiet: true },
                                "Your note is kept; the agent reads it at its next turn.",
                              )
                            : null,
                        ),
                  ),
                ),
        ),
  );
}

/** The capture view's address for a capture id. */
export function capturePath(id: string): string {
  return pathOf({ page: "picture", id });
}

/** A mark by its words: the note's first line, or what it names where the note is empty. */
function noteLine(mark: Mark): string {
  const line = mark.note.trim().split("\n")[0] ?? "";
  if (line === "") return targetLine(mark);
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** What a mark names, in one line. */
function targetLine(mark: Mark): string {
  if (mark.element !== null) return elementLine(mark.element);
  const over = mark.region?.elements ?? [];
  return over.length === 0 ? "a region" : `a region over ${over.join(", ")}`;
}

/** One mark: its state, intent, address and width, what it names, its note, and the owner's close. */
export function MarkRow(props: {
  readonly view: MarkView;
  readonly onClose: ((as: "addressed" | "declined") => void) | null;
}): ComponentChild {
  const { mark } = props.view;
  return h(
    "li",
    { "data-component": "MarkRow", id: `mark-${mark.id}` },
    h(
      "div",
      { class: "row-top" },
      h(
        "a",
        {
          class: "title",
          href: `${capturePath(mark.capture.id)}?width=${String(mark.width)}`,
          title: mark.id,
        },
        noteLine(mark),
      ),
      h(StateWord, { word: mark.state }),
      h(Tag, null, mark.intent),
      h("span", { class: "mono" }, `${mark.address} at ${String(mark.width)}`),
      props.view.stale ? h(StateWord, { word: "stale" }) : null,
    ),
    h("p", null, mark.note),
    h(
      "p",
      { class: "meta" },
      `${targetLine(mark)}. ${mark.by === "owner" ? "Marked in the viewer" : `Recorded from your words: "${mark.words ?? ""}"`}, ${when(mark.at)}.`,
    ),
    mark.proposed === null || mark.state !== "open"
      ? null
      : h(
          Callout,
          { quiet: true },
          `The agent proposes it ${mark.proposed.as}: ${mark.proposed.note}${mark.proposed.diff === null ? "" : ` (${mark.proposed.diff})`}. It closes only on your word.`,
        ),
    mark.closed === null
      ? null
      : h(
          "p",
          { class: "meta" },
          `Closed ${mark.state} by you ${mark.closed.via === "viewer" ? "in the viewer" : `in words: "${mark.closed.words ?? ""}"`}, ${when(mark.closed.at)}.`,
        ),
    props.onClose === null || mark.state !== "open"
      ? null
      : h(
          "div",
          { class: "row-meta" },
          h(
            "button",
            { type: "button", onClick: () => props.onClose?.("addressed") },
            "Accept as addressed",
          ),
          h(
            "button",
            { type: "button", class: "quiet", onClick: () => props.onClose?.("declined") },
            "Decline",
          ),
        ),
  );
}

/** The marks by state, open first, each row with the owner's close. */
export function MarksList(props: {
  readonly marks: readonly MarkView[];
  readonly onClose: ((id: string, as: "addressed" | "declined") => void) | null;
  readonly empty: string;
}): ComponentChild {
  if (props.marks.length === 0) return h(Empty, { title: props.empty });
  return h(
    "div",
    { "data-component": "MarksList" },
    (["open", "addressed", "declined"] as const).map((state) => {
      const own = props.marks.filter((view) => view.mark.state === state);
      return own.length === 0
        ? null
        : h(
            "div",
            null,
            h(
              "h3",
              null,
              `${state[0]?.toUpperCase() ?? ""}${state.slice(1)}, ${String(own.length)}`,
            ),
            h(
              "ul",
              { class: "rows" },
              own.map((view) =>
                h(MarkRow, {
                  view,
                  onClose:
                    props.onClose === null
                      ? null
                      : (as: "addressed" | "declined") => props.onClose?.(view.mark.id, as),
                }),
              ),
            ),
          );
    }),
  );
}

/** One side of a before and after: the capture at the mark's width with the element outlined. */
function Side(props: {
  readonly label: string;
  readonly width: CaptureWidthView | undefined;
  readonly box: Box | null;
}): ComponentChild {
  const { width } = props;
  if (width === undefined || width.image === null)
    return h(
      "figure",
      { class: "before-after-side" },
      h(Callout, { quiet: true }, "No image at this width."),
      h("figcaption", null, props.label),
    );
  // A window of the page around the element, one screen tall at most, so the two sides compare the same place.
  const tall = Math.max(1, width.imageHeight);
  const shown = Math.min(tall, width.height);
  const centre = props.box === null ? 0 : props.box.y + props.box.height / 2;
  const top = Math.max(0, Math.min(tall - shown, Math.round(centre - shown / 2)));
  return h(
    "figure",
    { class: "before-after-side" },
    h(
      "div",
      {
        class: "capture-stage",
        style: `max-width:${String(width.width)}px;aspect-ratio:${String(width.width)}/${String(shown)}`,
      },
      h(
        "div",
        {
          class: "capture-window",
          style: `top:${((-top / shown) * 100).toFixed(3)}%;height:${((tall / shown) * 100).toFixed(3)}%`,
        },
        h("img", { src: width.image, alt: props.label, width: width.width, height: tall }),
        props.box === null
          ? null
          : h("span", {
              class: "capture-box selected",
              style: placed(props.box, width.width, tall),
            }),
      ),
    ),
    h("figcaption", null, props.label),
  );
}

/** Before and after for a mark the agent answered: the two captures at its width, the element outlined in both. */
export function BeforeAfter(props: {
  readonly view: MarkView;
  readonly before: CaptureView | null;
  readonly after: CaptureView | null;
}): ComponentChild {
  const { mark } = props.view;
  const at = (capture: CaptureView | null): CaptureWidthView | undefined =>
    capture?.widths.find((entry) => entry.width === mark.width);
  return h(
    "div",
    { class: "before-after", "data-component": "BeforeAfter" },
    h(Side, {
      label: `Before, ${props.before === null ? mark.capture.id : when(props.before.made)}`,
      width: at(props.before),
      box: mark.element?.box ?? mark.crop,
    }),
    h(Side, {
      label:
        props.after === null
          ? "No capture after it yet"
          : `After, ${when(props.after.made)}${props.view.after?.box === null ? "; the element was not found again, the region is outlined" : ""}`,
      width: at(props.after),
      box: props.view.after?.box ?? mark.crop,
    }),
  );
}

/** What capture now reports. */
export type CaptureNowState =
  | { readonly kind: "idle" }
  | { readonly kind: "capturing" }
  | { readonly kind: "limit"; readonly message: string };

/** Capture now: the owner's running page's address and the button. */
export function CaptureNow(props: {
  readonly state: CaptureNowState;
  readonly onCapture: ((url: string) => void) | null;
  /** The address the field opens with; the running page's root where none is given. */
  readonly url?: string | undefined;
}): ComponentChild {
  const [url, setUrl] = useState(props.url ?? "http://localhost:3000/");
  return h(
    "form",
    {
      class: "capture-now",
      "data-component": "CaptureNow",
      onSubmit: (event: Event) => {
        event.preventDefault();
        if (props.state.kind !== "capturing") props.onCapture?.(url);
      },
    },
    h(
      "label",
      { class: "filter" },
      "Your running page",
      h("input", {
        type: "url",
        value: url,
        onInput: (event: Event) =>
          setUrl(event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : url),
      }),
    ),
    h(
      "button",
      {
        type: "submit",
        disabled: props.onCapture === null || props.state.kind === "capturing",
      },
      props.state.kind === "capturing"
        ? "Capturing at three widths"
        : props.url === undefined
          ? "Capture now"
          : "Capture again",
    ),
    props.state.kind === "limit" ? h(Callout, { quiet: true }, props.state.message) : null,
  );
}
