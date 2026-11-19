import { parseColour, type Rgb } from "./colour.ts";
import { designDrift, pixelsOf, usedValues } from "./design-drift.ts";
import {
  DESIGN_FILE,
  referenceReadings,
  resolveValue,
  sectionOrderIssues,
  type DesignDocument,
} from "./design-file.ts";
import {
  attribute,
  hasAttribute,
  innerOf,
  lineOf,
  tagsOf,
  visibleText,
  type Tag,
} from "./markup.ts";
import {
  durationsOf,
  layersOf,
  millisecondsOf,
  styleRulesOf,
  valueOf,
  type StyleRule,
} from "./stylesheet.ts";

/**
 * The interface check's static engines (J-123 S4; `workshop/components/interface-rules.md`,
 * "The engines"): one detector per rule of the pattern, cascade and drift
 * engines, each reading a file's source, its tags and its style rules, and
 * the governing DESIGN.md, with no browser and no model, fast enough for the
 * harness hook. Each detector returns the lines where its rule fails; the
 * render engine's rules are measured in a browser (`./interface-render.ts`).
 */

/** One file the engines read. */
export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** What a detector may read beyond its file. */
export interface StaticContext {
  /** The DESIGN.md that governs the file, where one does. */
  readonly design?: DesignDocument | undefined;
  /** Whether any interface file of the workspace holds a reduced-motion path. */
  readonly reducedMotionAnywhere: boolean;
  /** Whether any interface file of the workspace sets viewport-fit=cover. */
  readonly viewportCoverAnywhere: boolean;
}

/** One place a rule fails. */
export interface Hit {
  readonly line: number;
  readonly detail?: string | undefined;
}

/** A file parsed once for every detector: its text, its tags and its style rules. */
export interface FileRead {
  readonly file: SourceFile;
  readonly tags: readonly Tag[];
  readonly rules: readonly StyleRule[];
}

/** What a detector reads: the file parsed, and what the rule may read beyond it. */
interface Read extends FileRead {
  readonly context: StaticContext;
}

/** A detector: the places its rule fails in a file. */
type Detector = (read: Read) => readonly Hit[];

const NATIVE_CONTROLS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  "option",
]);
const CLICK = ["onClick", "onclick", "@click", "on:click", "v-on:click", "onPress"];
const KEYS = [
  "onKeyDown",
  "onKeyUp",
  "onKeyPress",
  "onkeydown",
  "onkeyup",
  "@keydown",
  "@keyup",
  "on:keydown",
  "v-on:keydown",
];

/** A tag's class tokens, from `class` or `className`, braces' strings included. */
function classesOf(tag: Tag): readonly string[] {
  const value = attribute(tag, "class", "className", ":class") ?? "";
  return value
    .replace(/[{}`'"]/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "");
}

/** The hit for each line of a pattern's matches in the text. */
function matches(
  text: string,
  pattern: RegExp,
  detail?: (match: RegExpMatchArray) => string,
): readonly Hit[] {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  return [...text.matchAll(global)].map((match) => ({
    line: lineOf(text, match.index ?? 0),
    detail: detail?.(match),
  }));
}

/**
 * Whether a control's content, its tags removed, holds a braced expression
 * other than a comment (J-226 S1; j217c-conduct-interface finding 11): a
 * forwarded `{children}` or a runtime choice of words may render a name the
 * static engine cannot read, so the rendered check measures that control.
 * @param inner the control's inner markup
 * @returns true where an expression stands in the content itself
 */
function rendersExpression(inner: string): boolean {
  return /\{[^{}]*\}/.test(
    inner.replace(/<[^>]*>/g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " "),
  );
}

/** One hit per tag that passes a test. */
function tagHits(
  read: Read,
  test: (tag: Tag) => boolean,
  detail?: (tag: Tag) => string,
): readonly Hit[] {
  return read.tags.filter(test).map((tag) => ({ line: tag.line, detail: detail?.(tag) }));
}

/** One hit per style rule that passes a test. */
function ruleHits(read: Read, test: (rule: StyleRule) => boolean): readonly Hit[] {
  return read.rules.filter(test).map((rule) => ({ line: rule.line, detail: rule.selector }));
}

/** The visible text of markup between tags, with its offsets kept per run. */
function textRuns(text: string): readonly { readonly text: string; readonly line: number }[] {
  const runs: { text: string; line: number }[] = [];
  for (const match of text.matchAll(/>([^<>{}]+)</g)) {
    const words = (match[1] ?? "").trim();
    if (words !== "") runs.push({ text: words, line: lineOf(text, match.index ?? 0) });
  }
  return runs;
}

const isStylesheet = (path: string): boolean => /\.(?:css|scss|sass|less)$/.test(path);
const isMarkup = (path: string): boolean => /\.(?:html|jsx|tsx|vue|svelte|astro)$/.test(path);

/** The standard autocomplete tokens (HTML, "Autofill"), the ones a field may name. */
const AUTOCOMPLETE = new Set(
  "off on name honorific-prefix given-name additional-name family-name honorific-suffix nickname email username new-password current-password one-time-code organization-title organization street-address address-line1 address-line2 address-line3 address-level4 address-level3 address-level2 address-level1 country country-name postal-code cc-name cc-given-name cc-additional-name cc-family-name cc-number cc-exp cc-exp-month cc-exp-year cc-csc cc-type transaction-currency transaction-amount language bday bday-day bday-month bday-year sex tel tel-country-code tel-national tel-area-code tel-local tel-extension impp url photo webauthn shipping billing home work mobile fax pager section".split(
    " ",
  ),
);

/** A cubic-bezier's two y values, where a value names one. */
function bezierYs(value: string): readonly number[] {
  const match =
    /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(value);
  return match === null ? [] : [Number(match[2]), Number(match[4])];
}

const ENTER =
  /\[open\]|\.open\b|data-state=["']?open|\.enter|-enter\b|-enter-active|:popover-open|\.is-open|\.show\b/;
const EXIT = /\.close|\[data-state=["']?closed|\.leave|-leave|\.exit|-exit|\.is-closing|\.hide\b/;
const timingOf = (rule: StyleRule): string =>
  [
    valueOf(rule, "transition"),
    valueOf(rule, "transition-timing-function"),
    valueOf(rule, "animation"),
    valueOf(rule, "animation-timing-function"),
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
const transitionDuration = (rule: StyleRule): number | undefined => durationsOf(rule)[0]?.ms;

/** The custom properties a file defines, for following a duration through var(). */
function customProperties(read: Read): ReadonlyMap<string, string> {
  return new Map(
    read.rules.flatMap((rule) =>
      rule.declarations
        .filter((entry) => entry.property.startsWith("--"))
        .map((entry) => [entry.property, entry.value] as const),
    ),
  );
}

/** A value with its var() references followed through the file's custom properties. */
function resolvedVars(value: string, properties: ReadonlyMap<string, string>): string {
  let current = value;
  for (let depth = 0; depth < 8 && current.includes("var("); depth += 1)
    current = current.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
      (_whole, name: string, fallback?: string) => properties.get(name) ?? fallback ?? "",
    );
  return current;
}

const isReducedMotionQuery = (context: readonly string[]): boolean =>
  context.some((entry) => /prefers-reduced-motion\s*:\s*reduce/.test(entry));

/** Whether a file holds a path for reduced motion, in CSS or in a motion library. */
export function holdsReducedMotion(text: string): boolean {
  return /prefers-reduced-motion|useReducedMotion|ReduceMotion|reducedMotion|motion-reduce:|motion-safe:/.test(
    text,
  );
}

/** Whether a file sets viewport-fit=cover. */
export function holdsViewportCover(text: string): boolean {
  return /viewport-fit\s*=\s*cover/.test(text);
}

const detectors: ReadonlyMap<string, Detector> = new Map<string, Detector>([
  // The pattern engine: the source as written.
  [
    "keyboard-operable",
    (read) =>
      tagHits(
        read,
        (tag) =>
          !NATIVE_CONTROLS.has(tag.name.toLowerCase()) &&
          /^[a-z]/.test(tag.name) &&
          hasAttribute(tag, ...CLICK) &&
          !(
            hasAttribute(tag, "role") &&
            attribute(tag, "tabIndex", "tabindex")?.replace(/[{}]/g, "") === "0" &&
            hasAttribute(tag, ...KEYS)
          ),
      ),
  ],
  [
    "role-widget-keys",
    (read) =>
      tagHits(
        read,
        (tag) =>
          /^(?:button|tab|menuitem|option|switch|checkbox|radio|slider|treeitem|link)$/.test(
            attribute(tag, "role") ?? "",
          ) &&
          !NATIVE_CONTROLS.has(tag.name.toLowerCase()) &&
          !hasAttribute(tag, ...KEYS),
      ),
  ],
  [
    "control-named-native",
    (read) => [
      ...matches(
        read.file.text,
        /Button\s*(?:\([^)]*\))?\s*\{\s*Image\(systemName:[^)]*\)\s*\}(?![\s\S]{0,120}\.accessibilityLabel)/,
      ),
      ...matches(read.file.text, /IconButton\([\s\S]{0,200}?contentDescription\s*=\s*null/),
      ...tagHits(
        read,
        (tag) =>
          /^(?:Pressable|TouchableOpacity|TouchableHighlight)$/.test(tag.name) &&
          !hasAttribute(tag, "accessibilityLabel", "aria-label") &&
          visibleText(innerOf(read.file.text, tag) ?? "") === "",
      ),
    ],
  ],
  [
    "label-bound",
    (read) =>
      tagHits(read, (tag) => {
        if (tag.name !== "label" || hasAttribute(tag, "for", "htmlFor")) return false;
        return !/<(?:input|select|textarea|[A-Z]\w*Input)\b/.test(
          innerOf(read.file.text, tag) ?? "",
        );
      }),
  ],
  [
    "autocomplete-valid",
    (read) =>
      tagHits(read, (tag) => {
        const value = attribute(tag, "autocomplete", "autoComplete");
        if (value === undefined || value.startsWith("{")) return false;
        return value
          .toLowerCase()
          .split(/\s+/)
          .filter((token) => token !== "" && !token.startsWith("section-"))
          .some((token) => !AUTOCOMPLETE.has(token));
      }),
  ],
  [
    "paste-allowed",
    (read) =>
      tagHits(read, (tag) => {
        const sensitive = /password|one-time-code|otp|code/i.test(
          `${attribute(tag, "type") ?? ""} ${attribute(tag, "name") ?? ""} ${attribute(tag, "autocomplete", "autoComplete") ?? ""}`,
        );
        const paste = attribute(tag, "onPaste", "onpaste", "@paste", "on:paste") ?? "";
        return sensitive && /preventDefault|return false/.test(paste);
      }),
  ],
  [
    "img-alt-present",
    (read) => tagHits(read, (tag) => tag.name === "img" && !hasAttribute(tag, "alt")),
  ],
  [
    "svg-decorative-hidden",
    (read) =>
      tagHits(read, (tag) => {
        if (tag.name !== "svg" && tag.name !== "canvas") return false;
        if (/^(?:true|\{true\})$/.test(attribute(tag, "aria-hidden", "ariaHidden") ?? ""))
          return false;
        const named =
          hasAttribute(tag, "aria-label", "aria-labelledby") ||
          /<title>/.test(innerOf(read.file.text, tag) ?? "");
        return !(attribute(tag, "role") === "img" && named) && !named;
      }),
  ],
  [
    "html-lang",
    (read) => tagHits(read, (tag) => tag.name === "html" && !hasAttribute(tag, "lang")),
  ],
  ["page-title", (read) => matches(read.file.text, /<title>\s*<\/title>/)],
  [
    "viewport-zoom",
    (read) =>
      tagHits(read, (tag) => {
        if (tag.name !== "meta" || attribute(tag, "name") !== "viewport") return false;
        const content = (attribute(tag, "content") ?? "").replace(/\s/g, "");
        const maximum = /maximum-scale=([\d.]+)/.exec(content)?.[1];
        return (
          /user-scalable=(?:no|0)/.test(content) || (maximum !== undefined && Number(maximum) < 2)
        );
      }),
  ],
  [
    "viewport-device-width",
    (read) =>
      tagHits(
        read,
        (tag) =>
          tag.name === "meta" &&
          attribute(tag, "name") === "viewport" &&
          /width=\d/.test((attribute(tag, "content") ?? "").replace(/\s/g, "")),
      ),
  ],
  [
    "table-headers",
    (read) =>
      tagHits(
        read,
        (tag) => tag.name === "table" && !/<th[\s>]/.test(innerOf(read.file.text, tag) ?? ""),
      ),
  ],
  [
    "target-size-native",
    (read) => [
      ...[
        ...read.file.text.matchAll(
          /Button[\s\S]{0,200}?\.frame\(\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\)/g,
        ),
      ]
        .filter((match) => Number(match[1]) < 44 || Number(match[2]) < 44)
        .map((match) => ({ line: lineOf(read.file.text, match.index ?? 0) })),
      ...matches(
        read.file.text,
        /<(?:Pressable|TouchableOpacity)[^>]*style=\{\{[^}]*(?:width|height):\s*(?:[0-3]?\d|4[0-3])\b[^}]*\}\}(?![^>]*hitSlop)/,
      ),
    ],
  ],
  [
    "autoplay-muted",
    (read) =>
      tagHits(
        read,
        (tag) =>
          (tag.name === "video" || tag.name === "audio") &&
          hasAttribute(tag, "autoplay", "autoPlay") &&
          !hasAttribute(tag, "muted"),
      ),
  ],
  [
    "captions-track",
    (read) =>
      tagHits(
        read,
        (tag) =>
          tag.name === "video" &&
          !/<track[^>]*kind=["']?(?:captions|subtitles)/.test(innerOf(read.file.text, tag) ?? ""),
      ),
  ],
  [
    "nav-uses-links",
    (read) =>
      tagHits(
        read,
        (tag) =>
          tag.name.toLowerCase() !== "a" &&
          tag.name !== "Link" &&
          /rout[e]r\.push|navigate\(|location\.href|window\.location|rout[e]r\.replace/.test(
            attribute(tag, ...CLICK) ?? "",
          ),
      ),
  ],
  [
    "drag-alternative",
    (read) =>
      /draggable|onDragStart|useDraggable|useSortable|SortableContext/.test(read.file.text) &&
      !/move[\s-]?up|move[\s-]?down|moveUp|moveDown/i.test(read.file.text)
        ? matches(
            read.file.text,
            /draggable|onDragStart|useDraggable|useSortable|SortableContext/,
          ).slice(0, 1)
        : [],
  ],
  [
    "no-placeholder-copy",
    (read) =>
      matches(
        read.file.text,
        /\blorem ipsum\b|\bjohn doe\b|\bjane doe\b|\bacme (?:inc|corp|co)\b/i,
      ),
  ],
  [
    "no-invented-metric",
    (read) =>
      textRuns(read.file.text).flatMap((run) =>
        /trusted by [\d,.]+\+?|\b\d+(?:\.\d+)?x faster\b|\b\d{2,3}(?:\.\d+)?% uptime\b|\b[\d,.]+[kKmM]?\+ (?:teams|customers|users|companies|developers)\b/i.test(
          run.text,
        )
          ? [{ line: run.line, detail: run.text }]
          : [],
      ),
  ],
  [
    "no-fake-send",
    (read) => {
      const text = read.file.text;
      const claims =
        /thanks!?|thank you|message sent|successfully (?:sent|submitted)|we'll be in touch/i;
      const sends =
        // The network calls are spelled with a class, so the source names none of them as a word.
        /f[e]tch\(|axios|\.post\(|action=|mutate|useMutation|formAction|\.submit\(|sendBeacon|XMLHttpR[e]quest|useFetcher|<Form\b/;
      return /<form\b|onSubmit|@submit/.test(text) && !sends.test(text)
        ? matches(text, claims).slice(0, 1)
        : [];
    },
  ],
  [
    "no-fake-faces",
    (read) =>
      matches(
        read.file.text,
        /pravatar\.cc|dicebear|randomuser\.me|thispersondoesnotexist|ui-avatars\.com/,
      ),
  ],
  [
    "consent-not-preselected",
    (read) =>
      tagHits(read, (tag) => {
        if (tag.name !== "input" || attribute(tag, "type") !== "checkbox") return false;
        const checked = attribute(tag, "checked", "defaultChecked");
        const on = checked !== undefined && !/^\{?\s*false\s*\}?$/.test(checked);
        return (
          on &&
          /newsletter|consent|marketing|subscribe|terms|updates/i.test(
            `${attribute(tag, "name") ?? ""} ${attribute(tag, "id") ?? ""}`,
          )
        );
      }),
  ],
  [
    "rn-sheet-fit-height",
    (read) =>
      /fitToContents/.test(read.file.text) && /flex:\s*1\b/.test(read.file.text)
        ? matches(read.file.text, /fitToContents/).slice(0, 1)
        : [],
  ],
  [
    "rn-native-tabs-five",
    (read) => {
      const screens = matches(read.file.text, /<(?:Tab|Tabs|NativeTabs)\.(?:Screen|Trigger)\b/);
      return screens.length > 5 ? [screens[5] ?? { line: 1 }] : [];
    },
  ],
  [
    "reduced-duration-not-zero",
    (read) =>
      read.rules
        .filter((rule) => isReducedMotionQuery(rule.context))
        .flatMap((rule) =>
          rule.declarations
            .filter(
              (entry) =>
                /(?:animation|transition)(?:-duration)?$/.test(entry.property) &&
                /(?<![\d.])0m?s\b/.test(entry.value),
            )
            .map((entry) => ({ line: entry.line })),
        ),
  ],
  [
    "overlay-transitioned",
    (read) =>
      /transition|animate|Transition|AnimatePresence|motion\./.test(read.file.text)
        ? []
        : matches(
            read.file.text,
            /\{\s*!?\w+\s*&&\s*<(?:Dialog|Modal|Popover|Toast|Drawer|dialog)\b|v-if=["'][^"']*["'][^>]*>?\s*<(?:Dialog|Modal|Toast)/,
          ),
  ],
  [
    "gsap-scoped",
    (read) =>
      /gsap\.(?:to|from|fromTo|timeline)\(/.test(read.file.text) &&
      /useEffect|useLayoutEffect|onMounted/.test(read.file.text) &&
      !/useGSAP|gsap\.context\(/.test(read.file.text)
        ? matches(read.file.text, /gsap\.(?:to|from|fromTo|timeline)\(/).slice(0, 1)
        : [],
  ],
  [
    "scrolltrigger-rules",
    (read) => [
      ...matches(read.file.text, /markers:\s*true/),
      ...matches(read.file.text, /scrub:[^,}]+,[^}]*toggleActions|toggleActions[^}]*scrub:/),
    ],
  ],
  [
    "rn-reduced-motion",
    (read) =>
      /withTiming|withSpring|withDecay|useAnimatedStyle/.test(read.file.text) &&
      !/useReducedMotion|ReduceMotion/.test(read.file.text)
        ? matches(read.file.text, /withTiming|withSpring|withDecay|useAnimatedStyle/).slice(0, 1)
        : [],
  ],
  [
    "rn-motion-ui-thread",
    (read) => [
      ...matches(read.file.text, /PanResponder\.create/),
      ...matches(read.file.text, /onGestureEvent[\s\S]{0,160}?\bset[A-Z]\w*\(/),
    ],
  ],
  [
    "typographic-glyphs",
    (read) =>
      textRuns(read.file.text)
        .filter((run) => /\w\.\.\.(?!\w)/.test(run.text))
        .map((run) => ({ line: run.line, detail: run.text })),
  ],
  [
    "dynamic-type",
    (read) => [
      ...matches(read.file.text, /\.font\(\.system\(size:\s*\d+(?![^)]*relativeTo)/),
      ...matches(read.file.text, /allowFontScaling=\{false\}/),
    ],
  ],
  [
    "pending-label-kept",
    (read) =>
      matches(
        read.file.text,
        /\{\s*!?[\w.]+\s*\?\s*["'`][^"'`]*ing(?:\.\.\.|…)?["'`]\s*:\s*["'`][^"'`]+["'`]\s*\}/,
      ),
  ],
  [
    "dialog-buttons-specific",
    (read) =>
      /role=["']dialog|<dialog\b|Dialog|Modal|alertdialog/.test(read.file.text)
        ? tagHits(
            read,
            (tag) =>
              /^(?:button|Button)$/.test(tag.name) &&
              /^(?:ok|okay|yes|no)$/i.test(visibleText(innerOf(read.file.text, tag) ?? "")),
          )
        : [],
  ],
  [
    "error-copy",
    (read) =>
      matches(read.file.text, /["'`>]\s*(?:oops!?[^"'`<]*|something went wrong\.?)\s*["'`<]/i),
  ],
  [
    "link-text-specific",
    (read) =>
      tagHits(
        read,
        (tag) =>
          /^(?:a|Link)$/.test(tag.name) &&
          /^(?:click here|here|read more|learn more|more)$/i.test(
            visibleText(innerOf(read.file.text, tag) ?? ""),
          ),
      ),
  ],
  ["intl-format", (read) => matches(read.file.text, /\.toLocale(?:Date|Time)?String\(\s*\)/)],
  [
    "controlled-input-handler",
    (read) =>
      tagHits(
        read,
        (tag) =>
          /^(?:input|textarea|select)$/.test(tag.name) &&
          /^\{/.test(attribute(tag, "value") ?? "") &&
          !hasAttribute(tag, "onChange", "onInput", "readOnly", "readonly"),
      ),
  ],
  [
    "full-height-unit",
    (read) => [
      ...matches(read.file.text, /(?<![\w-])h-screen\b|min-h-screen\b/),
      ...matches(read.file.text, /(?:min-)?height:\s*100vh/),
    ],
  ],
  [
    "safe-area-needs-cover",
    (read) =>
      read.context.viewportCoverAnywhere || holdsViewportCover(read.file.text)
        ? []
        : matches(read.file.text, /env\(safe-area-inset-/).slice(0, 1),
  ],
  [
    "container-query-ancestor",
    (read) =>
      /@container\b|\b@container\b|container-type/.test(read.file.text)
        ? []
        : matches(read.file.text, /(?<![\w-])@(?:xs|sm|md|lg|xl|[2-7]xl):/).slice(0, 1),
  ],
  [
    "z-index-scale",
    (read) => [
      ...matches(read.file.text, /(?<![\w-])z-\[\d+\]/),
      ...matches(read.file.text, /z-index:\s*\d{3,}/),
    ],
  ],
  [
    "collection-key-stable",
    (read) => [
      ...matches(read.file.text, /key=\{\s*(?:index|i|idx)\s*\}/),
      ...matches(read.file.text, /ForEach\([^)]*\.indices/),
    ],
  ],
  [
    "long-list-virtualised",
    (read) => matches(read.file.text, /<ScrollView[^>]*>\s*\{[^}]*\.map\(/),
  ],
  [
    "rn-safe-area-hook",
    (read) => [
      ...matches(read.file.text, /<SafeAreaView[^>]*>\s*<NavigationContainer/),
      ...(/SafeAreaView/.test(read.file.text) && /useSafeAreaInsets/.test(read.file.text)
        ? matches(read.file.text, /SafeAreaView/).slice(0, 1)
        : []),
    ],
  ],
  [
    "control-not-gesture",
    (read) => [
      ...matches(read.file.text, /(?:Image|Text)\([^)]*\)[\s\S]{0,80}?\.onTapGesture/),
      ...matches(read.file.text, /(?:Image|Text)\([\s\S]{0,120}?Modifier\.clickable/),
    ],
  ],
  [
    "colour-literal-native",
    (read) => [
      ...matches(read.file.text, /Color\.(?:white|black|red|blue|green|gray|grey)\b|Color\(red:/),
      ...matches(read.file.text, /Color\(0x[0-9A-Fa-f]{8}\)/),
    ],
  ],
  [
    "style-default-face",
    (read) =>
      matches(
        read.file.text,
        /(?:font-family|fontFamily)\s*:\s*["'`]?(?:Inter|Roboto|Arial|Helvetica|Open Sans|Lato|Montserrat|Poppins)\b|(?<![\w-])font-\[(?:Inter|Roboto|Arial)/,
      ),
  ],
  [
    "style-emoji-icon",
    (read) =>
      textRuns(read.file.text)
        .filter((run) => /\p{Extended_Pictographic}/u.test(run.text))
        .map((run) => ({ line: run.line, detail: run.text })),
  ],
  [
    "style-stock-phrases",
    (read) =>
      textRuns(read.file.text)
        .filter((run) =>
          /\b(?:seamless(?:ly)?|unleash|elevate|supercharge|revolutioni[sz]e|game-?changing|cutting-edge|empower)\b/i.test(
            run.text,
          ),
        )
        .map((run) => ({ line: run.line, detail: run.text })),
  ],
  [
    "style-template-punctuation",
    (read) =>
      textRuns(read.file.text)
        .filter((run) => /\S · \S.* · \S|\s(?:→|->)\s*$/.test(run.text))
        .map((run) => ({ line: run.line, detail: run.text })),
  ],
  [
    "style-drawn-chrome",
    (read) => matches(read.file.text, /traffic-light|#ff5f57|#febc2e|#28c840/i),
  ],
  [
    "meta-description",
    (read) => {
      if (!/<head[\s>]/.test(read.file.text)) return [];
      const head = read.tags.filter((tag) => tag.name === "meta");
      const described = head.some((tag) => attribute(tag, "name") === "description");
      const image = head.find((tag) => attribute(tag, "property") === "og:image");
      const relative =
        image !== undefined && !/^https?:\/\//.test(attribute(image, "content") ?? "");
      return [
        ...(described ? [] : matches(read.file.text, /<head[\s>]/)),
        ...(relative && image !== undefined ? [{ line: image.line }] : []),
      ];
    },
  ],

  // The cascade engine: the markup with its style rules.
  [
    "focus-outline-removed",
    (read) => {
      const replaced = read.rules.some(
        (rule) =>
          /:focus-visible/.test(rule.selector) &&
          rule.declarations.some(
            (entry) =>
              /^(?:outline|box-shadow|border|outline-color|outline-style)$/.test(entry.property) &&
              !/^(?:none|0)$/.test(entry.value),
          ),
      );
      const tailwindRing = /focus-visible:(?:ring|outline)/.test(read.file.text);
      if (replaced || tailwindRing) return [];
      return [
        ...ruleHits(
          read,
          (rule) =>
            rule.declarations.some(
              (entry) => entry.property === "outline" && /^(?:none|0)$/.test(entry.value),
            ) && !/:focus-visible/.test(rule.selector),
        ),
        ...matches(read.file.text, /(?<![\w-])(?:focus:)?outline-none\b/),
      ];
    },
  ],
  [
    "focus-ring-instant",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          /:focus(?:-visible)?/.test(rule.selector) &&
          /\b(?:outline|box-shadow|all)\b/.test(
            `${valueOf(rule, "transition") ?? ""} ${valueOf(rule, "transition-property") ?? ""}`,
          ),
      ),
  ],
  [
    "control-named",
    (read) =>
      tagHits(read, (tag) => {
        if (tag.name !== "button" && !(tag.name === "a" && hasAttribute(tag, "href"))) return false;
        if (hasAttribute(tag, "aria-label", "aria-labelledby", "title", "ariaLabel")) return false;
        const inner = innerOf(read.file.text, tag);
        return (
          inner !== undefined &&
          visibleText(inner) === "" &&
          !rendersExpression(inner) &&
          !/aria-label|sr-only|visually-hidden|<title>/.test(inner)
        );
      }),
  ],
  [
    "input-labelled",
    (read) => {
      const labelled = new Set(
        read.tags
          .filter((tag) => tag.name === "label")
          .map((tag) => attribute(tag, "for", "htmlFor") ?? ""),
      );
      const wrapped = read.tags
        .filter((tag) => tag.name === "label")
        .map((tag) => [tag.end, read.file.text.indexOf("</label", tag.end)] as const);
      return tagHits(read, (tag) => {
        if (!/^(?:input|textarea|select)$/.test(tag.name)) return false;
        if (
          /^(?:hidden|submit|button|reset|image|checkbox|radio)$/.test(attribute(tag, "type") ?? "")
        )
          return false;
        if (hasAttribute(tag, "aria-label", "aria-labelledby", "ariaLabel", "title")) return false;
        const id = attribute(tag, "id");
        if (id !== undefined && labelled.has(id)) return false;
        return !wrapped.some(
          ([start, end]) => tag.offset >= start && end !== -1 && tag.offset < end,
        );
      });
    },
  ],
  [
    "autocomplete-personal",
    (read) =>
      tagHits(
        read,
        (tag) =>
          tag.name === "input" &&
          (/^(?:email|tel)$/.test(attribute(tag, "type") ?? "") ||
            /^(?:email|phone|tel|name|given-name|family-name)$/.test(
              attribute(tag, "name") ?? "",
            )) &&
          !hasAttribute(tag, "autocomplete", "autoComplete"),
      ),
  ],
  [
    "aria-hidden-focusable",
    (read) =>
      tagHits(
        read,
        (tag) =>
          /^(?:true|\{true\})$/.test(attribute(tag, "aria-hidden", "ariaHidden") ?? "") &&
          /<(?:button|a\s[^>]*href|input|select|textarea)\b|tabindex=["']?0/i.test(
            innerOf(read.file.text, tag) ?? "",
          ),
      ),
  ],
  [
    "aria-ref-resolves",
    (read) => {
      const ids = new Set(
        read.tags.flatMap((tag) => {
          const id = attribute(tag, "id");
          return id === undefined ? [] : [id];
        }),
      );
      return tagHits(read, (tag) =>
        ["aria-labelledby", "aria-describedby", "aria-controls"].some((name) => {
          const value = attribute(tag, name);
          return (
            value !== undefined &&
            !value.startsWith("{") &&
            value.split(/\s+/).some((id) => id !== "" && !ids.has(id))
          );
        }),
      );
    },
  ],
  [
    "aria-required-state",
    (read) => {
      const tablists = read.tags
        .filter((tag) => attribute(tag, "role") === "tablist")
        .map((tag) => [tag.end, read.file.text.indexOf(`</${tag.name}`, tag.end)] as const);
      return tagHits(read, (tag) => {
        const role = attribute(tag, "role");
        if (role === "tab")
          return !tablists.some(
            ([start, end]) => tag.offset >= start && end !== -1 && tag.offset < end,
          );
        return role === "combobox" && !hasAttribute(tag, "aria-expanded", "ariaExpanded");
      });
    },
  ],
  [
    "reduced-motion-path",
    (read) =>
      read.context.reducedMotionAnywhere || holdsReducedMotion(read.file.text)
        ? []
        : [
            ...matches(read.file.text, /@keyframes\s/),
            ...read.rules
              .filter(
                (rule) =>
                  (valueOf(rule, "animation") ?? "") !== "" &&
                  !/^none$/.test(valueOf(rule, "animation") ?? ""),
              )
              .map((rule) => ({ line: rule.line })),
          ].slice(0, 1),
  ],
  [
    "reduced-motion-form",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          isReducedMotionQuery(rule.context) &&
          /^\*|,\s*\*/.test(rule.selector) &&
          rule.declarations.some(
            (entry) =>
              /^(?:animation|transition)$/.test(entry.property) && /^none/.test(entry.value),
          ),
      ),
  ],
  [
    "dialog-named",
    (read) =>
      tagHits(
        read,
        (tag) =>
          (tag.name === "dialog" ||
            attribute(tag, "role") === "dialog" ||
            attribute(tag, "role") === "alertdialog") &&
          !hasAttribute(tag, "aria-label", "aria-labelledby", "ariaLabel", "ariaLabelledby"),
      ),
  ],
  [
    "live-region-status",
    (read) =>
      tagHits(
        read,
        (tag) =>
          classesOf(tag).some((name) =>
            /^(?:toast|snackbar|notification|flash-message)$/.test(name),
          ) && !hasAttribute(tag, "role", "aria-live", "ariaLive"),
      ),
  ],
  [
    "link-not-colour-only",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          /(?:^|[\s,>])a(?:$|[\s,:])/.test(rule.selector) &&
          !/nav|button|btn|card|menu/.test(rule.selector) &&
          (valueOf(rule, "text-decoration") ?? valueOf(rule, "text-decoration-line")) === "none",
      ),
  ],
  [
    "jsonld-honest",
    (read) => {
      const hits: Hit[] = [];
      for (const block of read.file.text.matchAll(
        /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
      )) {
        const rating = /"ratingValue"\s*:\s*"?([\d.]+)/.exec(block[1] ?? "")?.[1];
        const price = /"price"\s*:\s*"?([\d.]+)/.exec(block[1] ?? "")?.[1];
        const shown = visibleText(read.file.text.replace(block[0], ""));
        for (const value of [rating, price])
          if (value !== undefined && !shown.includes(value))
            hits.push({ line: lineOf(read.file.text, block.index ?? 0), detail: value });
      }
      return hits;
    },
  ],
  [
    "transition-all",
    (read) => [
      ...ruleHits(read, (rule) =>
        /(?:^|[\s,])all(?:\s|$|,)/.test(
          `${valueOf(rule, "transition") ?? ""} ${valueOf(rule, "transition-property") ?? ""}`,
        ),
      ),
      ...matches(read.file.text, /(?<![\w-])transition-all\b/),
    ],
  ],
  [
    "animate-compositor-only",
    (read) => [
      ...ruleHits(read, (rule) =>
        layersOf(
          `${valueOf(rule, "transition") ?? ""},${valueOf(rule, "transition-property") ?? ""}`,
        ).some((layer) =>
          /^(?:width|height|top|left|right|bottom|margin|padding|max-height|max-width)(?:-\w+)?\b/.test(
            layer,
          ),
        ),
      ),
      ...[...read.file.text.matchAll(/@keyframes[^{]*\{([\s\S]*?\})\s*\}/g)]
        .filter((block) =>
          /(?:^|[;{\s])(?:width|height|top|left|margin|padding)\s*:/.test(block[1] ?? ""),
        )
        .map((block) => ({ line: lineOf(read.file.text, block.index ?? 0) })),
    ],
  ],
  [
    "entrance-ease-out",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          ENTER.test(rule.selector) && /\bease-in\b(?!-out)|\blinear\b/.test(timingOf(rule)),
      ),
  ],
  [
    "exit-easing",
    (read) => {
      const entrance = read.rules.find(
        (rule) => ENTER.test(rule.selector) && transitionDuration(rule) !== undefined,
      );
      const enterMs = entrance === undefined ? undefined : transitionDuration(entrance);
      return ruleHits(read, (rule) => {
        if (!EXIT.test(rule.selector) || transitionDuration(rule) === undefined) return false;
        const timing = timingOf(rule);
        const easedIn =
          /\bease-in\b(?!-out)|cubic-bezier\(\s*0?\.[3-9]\d*\s*,\s*0?(?:\.0+)?\s*,/.test(timing);
        const ms = transitionDuration(rule) ?? 0;
        return !easedIn || (enterMs !== undefined && ms > enterMs * 0.85);
      });
    },
  ],
  [
    "no-exit-overshoot",
    (read) =>
      ruleHits(
        read,
        (rule) => EXIT.test(rule.selector) && bezierYs(timingOf(rule)).some((y) => y > 1),
      ),
  ],
  [
    "no-exit-delay",
    (read) =>
      ruleHits(read, (rule) => {
        if (!EXIT.test(rule.selector)) return false;
        const delay = valueOf(rule, "transition-delay");
        const shorthand = layersOf(valueOf(rule, "transition") ?? "").some((layer) => {
          const times = [...layer.matchAll(/(?<![\w.-])\d*\.?\d+m?s\b/g)];
          return (millisecondsOf(times[1]?.[0] ?? "0ms") ?? 0) > 0;
        });
        return shorthand || (delay !== undefined && (millisecondsOf(delay) ?? 0) > 0);
      }),
  ],
  [
    "app-motion-300",
    (read) =>
      read.rules.flatMap((rule) =>
        /infinite/.test(valueOf(rule, "animation") ?? "")
          ? []
          : durationsOf(rule)
              .filter((entry) => entry.ms >= 300)
              .map((entry) => ({ line: entry.declaration.line, detail: `${String(entry.ms)}ms` })),
      ),
  ],
  [
    "site-section-motion",
    (read) =>
      read.rules
        .filter((rule) => /section|reveal/.test(rule.selector))
        .flatMap((rule) =>
          durationsOf(rule)
            .filter((entry) => entry.ms < 400 || entry.ms > 800)
            .map((entry) => ({ line: entry.declaration.line, detail: `${String(entry.ms)}ms` })),
        ),
  ],
  [
    "motion-over-one-second",
    (read) => {
      const properties = customProperties(read);
      return read.rules.flatMap((rule) => {
        if (/infinite/.test(valueOf(rule, "animation") ?? "")) return [];
        return rule.declarations
          .filter((entry) => /^(?:transition|animation)(?:-duration)?$/.test(entry.property))
          .filter((entry) =>
            layersOf(resolvedVars(entry.value, properties)).some(
              (layer) =>
                (millisecondsOf(/(?<![\w.-])\d*\.?\d+m?s\b/.exec(layer)?.[0] ?? "") ?? 0) > 1000,
            ),
          )
          .map((entry) => ({ line: entry.line }));
      });
    },
  ],
  ["no-scale-zero", (read) => matches(read.file.text, /scale\(\s*0(?:\s*,\s*0)?\s*\)|scale-0\b/)],
  [
    "no-bounce-easing",
    (read) => [
      ...read.rules
        .filter((rule) => bezierYs(timingOf(rule)).some((y) => y < -0.05 || y > 1.05))
        .map((rule) => ({ line: rule.line })),
      ...matches(read.file.text, /animation(?:-name)?:\s*[^;]*\b(?:bounce|elastic)\b/),
    ],
  ],
  [
    "will-change-transient",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          valueOf(rule, "will-change") !== undefined &&
          valueOf(rule, "will-change") !== "auto" &&
          !/:hover|:active|:focus|animating|is-moving/.test(rule.selector),
      ),
  ],
  [
    "hover-motion-gated",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          /:hover/.test(rule.selector) &&
          rule.declarations.some((entry) =>
            /^(?:transform|translate|scale|rotate)$/.test(entry.property),
          ) &&
          !rule.context.some((entry) => /hover\s*:\s*hover/.test(entry)),
      ),
  ],
  [
    "hover-no-layout-shift",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          /:hover/.test(rule.selector) &&
          rule.declarations.some((entry) =>
            /^(?:padding|margin|width|height|border-width|font-size|top|left|right|bottom)(?:-\w+)?$/.test(
              entry.property,
            ),
          ),
      ),
  ],
  [
    "stagger-offset",
    (read) => [
      ...[...read.file.text.matchAll(/\b\w+\s*\*\s*(\d+)\s*\}?\s*m?s/g)]
        .filter((match) => {
          const step = Number(match[1]);
          return (
            /delay/i.test(
              read.file.text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0),
            ) &&
            (step < 30 || step > 80)
          );
        })
        .map((match) => ({
          line: lineOf(read.file.text, match.index ?? 0),
          detail: `${match[1] ?? ""}ms apart`,
        })),
      ...(() => {
        const delays = read.rules
          .filter((rule) => /:nth-child/.test(rule.selector))
          .flatMap((rule) => {
            const value = valueOf(rule, "animation-delay") ?? valueOf(rule, "transition-delay");
            const ms = value === undefined ? undefined : millisecondsOf(value);
            return ms === undefined ? [] : [{ ms, line: rule.line }];
          });
        return delays
          .slice(1)
          .filter((entry, index) => {
            const gap = entry.ms - (delays[index]?.ms ?? 0);
            return gap < 30 || gap > 80;
          })
          .map((entry) => ({ line: entry.line }));
      })(),
    ],
  ],
  [
    "duration-scale",
    (read) => {
      const design = read.context.design;
      if (design === undefined) return [];
      const scale = scaleOf(design);
      if (scale.length === 0) return [];
      return read.rules.flatMap((rule) =>
        durationsOf(rule)
          .filter((entry) => !scale.some((ms) => Math.abs(ms - entry.ms) <= 5))
          .map((entry) => ({ line: entry.declaration.line, detail: `${String(entry.ms)}ms` })),
      );
    },
  ],
  [
    "tight-leading",
    (read) =>
      ruleHits(read, (rule) => {
        if (!/(?:^|[\s,])(?:p|body|article|\.prose|li)(?:$|[\s,:.])/.test(rule.selector))
          return false;
        const value = valueOf(rule, "line-height");
        if (value === undefined) return false;
        const number = Number.parseFloat(value);
        return /^[\d.]+$/.test(value.trim()) && number < 1.3;
      }),
  ],
  [
    "heading-levels",
    (read) => {
      const headings = read.tags.filter((tag) => /^h[1-6]$/.test(tag.name));
      return headings
        .slice(1)
        .filter((tag, index) => Number(tag.name[1]) - Number(headings[index]?.name[1] ?? 0) > 1)
        .map((tag) => ({ line: tag.line }));
    },
  ],
  [
    "one-h1",
    (read) => {
      const ones = read.tags.filter((tag) => tag.name === "h1");
      return ones.length > 1 ? ones.slice(1).map((tag) => ({ line: tag.line })) : [];
    },
  ],
  [
    "tabular-figures",
    (read) =>
      /tabular-nums/.test(read.file.text)
        ? []
        : tagHits(
            read,
            (tag) =>
              tag.name === "td" &&
              /^[$£€]?\s?-?[\d,]+(?:\.\d+)?\s?%?$/.test(
                visibleText(innerOf(read.file.text, tag) ?? ""),
              ),
          ).slice(0, 1),
  ],
  [
    "font-display",
    (read) =>
      ruleHits(
        read,
        (rule) => /^@font-face/.test(rule.selector) && valueOf(rule, "font-display") === undefined,
      ),
  ],
  [
    "caps-tracking",
    (read) => [
      ...ruleHits(read, (rule) => {
        if (valueOf(rule, "text-transform") !== "uppercase") return false;
        const spacing = valueOf(rule, "letter-spacing")?.trim();
        if (spacing === undefined) return true;
        const number = Number.parseFloat(spacing);
        // A length in pixels is read at a 16px size; `normal` is no tracking.
        const em = /px$/.test(spacing) ? number / 16 : Number.isNaN(number) ? 0 : number;
        return em < 0.06;
      }),
      ...tagHits(
        read,
        (tag) =>
          classesOf(tag).includes("uppercase") &&
          !classesOf(tag).some((name) => /^tracking-(?:widest|\[0?\.(?:0[6-9]|[1-9]))/.test(name)),
      ),
    ],
  ],
  [
    "heading-balance",
    (read) => [
      ...ruleHits(
        read,
        (rule) =>
          /(?:^|[\s,])h[12](?:$|[\s,:.])/.test(rule.selector) &&
          !/balance|pretty/.test(valueOf(rule, "text-wrap") ?? "") &&
          valueOf(rule, "font-size") !== undefined,
      ),
      ...tagHits(
        read,
        (tag) =>
          tag.name === "h1" &&
          hasAttribute(tag, "class", "className") &&
          !classesOf(tag).some((name) => /^text-(?:balance|pretty)$/.test(name)),
      ),
    ],
  ],
  [
    "gamut-fallback",
    (read) =>
      read.rules.flatMap((rule) =>
        rule.declarations.flatMap((entry, index) => {
          if (!/oklch\(/.test(entry.value)) return [];
          const colour = parseColour(/oklch\([^)]*\)/.exec(entry.value)?.[0] ?? "");
          if (colour === undefined || colour.inGamut) return [];
          const fallback = rule.declarations
            .slice(0, index)
            .some(
              (earlier) => earlier.property === entry.property && !/oklch\(/.test(earlier.value),
            );
          return fallback ? [] : [{ line: entry.line }];
        }),
      ),
  ],
  [
    "no-shadow-plus-border",
    (read) => [
      ...ruleHits(read, (rule) => {
        const shadow = valueOf(rule, "box-shadow");
        const border = valueOf(rule, "border");
        return (
          shadow !== undefined &&
          shadow !== "none" &&
          border !== undefined &&
          !/^(?:none|0)$|transparent/.test(border)
        );
      }),
      ...tagHits(read, (tag) => {
        const names = classesOf(tag);
        return (
          names.includes("border") &&
          names.some((name) => /^shadow(?:-|$)/.test(name) && name !== "shadow-none")
        );
      }),
    ],
  ],
  [
    "shadow-ring-forced-colors",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          /(?:^|,)\s*(?:inset\s+)?0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+\d/.test(
            valueOf(rule, "box-shadow") ?? "",
          ) &&
          valueOf(rule, "border") === undefined &&
          valueOf(rule, "border-width") === undefined,
      ),
  ],
  [
    "submit-not-predisabled",
    (read) =>
      matches(
        read.file.text,
        /:?disabled=["{]\s*!\s*[\w.]*(?:valid|Valid|canSubmit|isComplete)\w*\s*["}]/,
      ),
  ],
  [
    "overlay-overscroll",
    (read) =>
      ruleHits(
        read,
        (rule) =>
          /dialog|modal|drawer|sheet/.test(rule.selector) &&
          /auto|scroll/.test(
            `${valueOf(rule, "overflow") ?? ""} ${valueOf(rule, "overflow-y") ?? ""}`,
          ) &&
          valueOf(rule, "overscroll-behavior") === undefined &&
          valueOf(rule, "overscroll-behavior-y") === undefined,
      ),
  ],
  [
    "user-select-root",
    (read) => [
      ...ruleHits(
        read,
        (rule) =>
          /^(?:html|body|:root|main|p|article)(?:\s*,|$)/.test(rule.selector.trim()) &&
          valueOf(rule, "user-select") === "none",
      ),
      ...tagHits(
        read,
        (tag) => /^(?:body|main|html)$/.test(tag.name) && classesOf(tag).includes("select-none"),
      ),
    ],
  ],
  [
    "img-dimensions",
    (read) =>
      tagHits(
        read,
        (tag) =>
          tag.name === "img" &&
          !(hasAttribute(tag, "width") && hasAttribute(tag, "height")) &&
          !classesOf(tag).some((name) => /^aspect-/.test(name)) &&
          !/aspect-ratio/.test(attribute(tag, "style") ?? ""),
      ),
  ],
  [
    "style-eyebrow",
    (read) =>
      read.tags
        .filter((tag) => /^(?:p|span|div|small)$/.test(tag.name))
        .filter((tag) => {
          const inner = innerOf(read.file.text, tag) ?? "";
          const words = visibleText(inner);
          const caps = words.length >= 3 && words === words.toUpperCase() && /[A-Z]/.test(words);
          const tracked = classesOf(tag).some((name) =>
            /^(?:uppercase|tracking-|eyebrow|overline|kicker)/.test(name),
          );
          const next = read.file.text.slice(tag.end + inner.length).replace(/^\s*<\/\w+>\s*/, "");
          return (caps || tracked) && /^<h[12]\b/.test(next);
        })
        .map((tag) => ({ line: tag.line })),
  ],
  [
    "style-nested-cards",
    (read) => {
      const cards = read.tags.filter((tag) =>
        classesOf(tag).some((name) => /(?:^|-)card$/.test(name)),
      );
      return cards
        .filter((tag) =>
          cards.some(
            (outer) =>
              outer !== tag &&
              outer.offset < tag.offset &&
              read.file.text.indexOf(`</${outer.name}`, outer.end) > tag.offset,
          ),
        )
        .map((tag) => ({ line: tag.line }));
    },
  ],
  [
    "style-glow",
    (read) =>
      read.rules.flatMap((rule) =>
        rule.declarations
          .filter(
            (entry) =>
              (entry.property === "box-shadow" &&
                /^0(?:px)?\s+0(?:px)?\s+\d+px/.test(entry.value) &&
                isChromatic(entry.value)) ||
              (/background/.test(entry.property) && /radial-gradient/.test(entry.value)),
          )
          .map((entry) => ({ line: entry.line })),
      ),
  ],
  [
    "concentric-radius",
    (read) =>
      read.rules.flatMap((outer) => {
        const radius = pixelsOf(valueOf(outer, "border-radius") ?? "");
        const padding = pixelsOf((valueOf(outer, "padding") ?? "").split(/\s+/)[0] ?? "");
        if (radius === undefined || padding === undefined || padding === 0) return [];
        return read.rules
          .filter(
            (inner) =>
              inner !== outer &&
              inner.selector.startsWith(`${outer.selector} `) &&
              pixelsOf(valueOf(inner, "border-radius") ?? "") === radius,
          )
          .map((inner) => ({
            line: inner.line,
            detail: `${String(radius)}px inside ${String(radius)}px`,
          }));
      }),
  ],
  [
    "hover-state-present",
    (read) => {
      if (/:hover|hover:/.test(read.file.text)) return [];
      return read.rules
        .filter((rule) => /(?:^|[\s,])(?:button|a|\.btn|\.button)(?:$|[\s,.:])/.test(rule.selector))
        .slice(0, 1)
        .map((rule) => ({ line: rule.line }));
    },
  ],

  // The drift engine: the code against its DESIGN.md, and DESIGN.md itself.
  [
    "home-ref-resolves",
    (read) =>
      homeOnly(read, (design) =>
        referenceReadings(design)
          .filter((entry) => entry.reading.kind !== "value")
          .map((entry) => ({ line: 1, detail: entry.token })),
      ),
  ],
  [
    "tokens-not-raw",
    // A raw colour the home names as a token: the token is there to use.
    (read) =>
      codeAgainstHome(read, (design) => {
        const undeclared = designDrift(design, [read.file]).undeclared;
        return usedValues(read.file.path, read.file.text)
          .filter(
            (used) =>
              used.kind === "colour" &&
              !undeclared.some((miss) => miss.line === used.line && miss.value === used.value),
          )
          .map((used) => ({ line: used.line, detail: used.value }));
      }),
  ],
  ["colour-drift", (read) => driftOf(read, "colour")],
  ["font-drift", (read) => driftOf(read, "font")],
  ["radius-drift", (read) => driftOf(read, "radius")],
  ["size-drift", (read) => driftOf(read, "size")],
  [
    "home-primary",
    (read) =>
      homeOnly(read, (design) =>
        design.tokens.colors.length > 0 &&
        !design.tokens.colors.some((token) => token.name === "primary")
          ? [{ line: 1 }]
          : [],
      ),
  ],
  [
    "home-section-order",
    (read) =>
      homeOnly(read, (design) =>
        sectionOrderIssues(design).map((heading) => ({
          line: lineOf(read.file.text, read.file.text.indexOf(`## ${heading}`)),
          detail: heading,
        })),
      ),
  ],
  [
    "home-dropped-tokens",
    (read) =>
      homeOnly(read, (design) =>
        design.unknownKeys
          .filter((key) => !["themes", "metadata"].includes(key))
          .map((key) => ({
            line: lineOf(read.file.text, read.file.text.indexOf(`${key}:`)),
            detail: key,
          })),
      ),
  ],
  ["home-orphans", () => []],
  [
    "status-hue-accent",
    (read) =>
      homeOnly(read, (design) => {
        const hueOf = (name: string): number | undefined => {
          const token = design.tokens.colors.find((entry) => entry.name === name);
          if (token === undefined) return undefined;
          const reading = resolveValue(design, token.value);
          const rgb = reading.kind === "value" ? parseColour(reading.value) : undefined;
          return rgb === undefined ? undefined : hue(rgb);
        };
        const accent = hueOf("accent") ?? hueOf("primary");
        if (accent === undefined) return [];
        return design.tokens.colors
          .filter((token) => /^(?:error|danger|success|warning|info|destructive)$/.test(token.name))
          .filter((token) => {
            const value = hueOf(token.name);
            return value !== undefined && angle(value, accent) < 15;
          })
          .map((token) => ({
            line: lineOf(read.file.text, read.file.text.indexOf(`${token.name}:`)),
            detail: token.name,
          }));
      }),
  ],
]);

/** A colour's hue in degrees, 0 to 360. */
function hue(colour: Rgb): number {
  const [r, g, b] = [colour.r / 255, colour.g / 255, colour.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const delta = max - min;
  const raw =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

/** The smaller angle between two hues. */
function angle(one: number, other: number): number {
  const difference = Math.abs(one - other) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/** Whether a value's colour is more than a grey. */
function isChromatic(value: string): boolean {
  const colour = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i.exec(value)?.[0];
  const rgb = colour === undefined ? undefined : parseColour(colour);
  return rgb !== undefined && Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) > 40;
}

/** The durations DESIGN.md's tokens name, wherever a token holds one: the home's declared scale. */
function scaleOf(design: DesignDocument): readonly number[] {
  const values = [
    ...[design.tokens.components, design.tokens.typography].flatMap((group) =>
      group.flatMap((token) => token.fields.map((field) => field.value)),
    ),
    ...[design.tokens.colors, design.tokens.rounded, design.tokens.spacing].flatMap((group) =>
      group.map((token) => token.value),
    ),
  ];
  return values.flatMap((value) => millisecondsOf(value) ?? []);
}

/** A drift rule's hits for one kind of value, where a DESIGN.md governs the file. */
function driftOf(read: Read, kind: "colour" | "font" | "radius" | "size"): readonly Hit[] {
  return codeAgainstHome(read, (design) =>
    designDrift(design, [read.file])
      .undeclared.filter((value) => value.kind === kind)
      .map((value) => ({ line: value.line, detail: value.value })),
  );
}

/** Run a home rule on DESIGN.md itself. */
function homeOnly(read: Read, rule: (design: DesignDocument) => readonly Hit[]): readonly Hit[] {
  const isHome = read.file.path === DESIGN_FILE || read.file.path.endsWith(`/${DESIGN_FILE}`);
  return isHome && read.context.design !== undefined ? rule(read.context.design) : [];
}

/** Run a drift rule on an interface file a DESIGN.md governs. */
function codeAgainstHome(
  read: Read,
  rule: (design: DesignDocument) => readonly Hit[],
): readonly Hit[] {
  const isHome = read.file.path === DESIGN_FILE || read.file.path.endsWith(`/${DESIGN_FILE}`);
  return isHome || read.context.design === undefined ? [] : rule(read.context.design);
}

/**
 * The rules the static engines implement, by id.
 * @returns the ids, in the order the detectors stand
 */
export function staticRuleIds(): readonly string[] {
  return [...detectors.keys()];
}

/**
 * Run one static rule on one file.
 * @param id the rule's id
 * @param file the file
 * @param context what the rule may read beyond the file
 * @returns where it fails; none where it passes or no detector holds the id
 */
export function runStaticRule(
  id: string,
  file: SourceFile,
  context: StaticContext,
): readonly Hit[] {
  return runStaticRuleOn(id, fileReadOf(file), context);
}

/**
 * Parse a file once, for every rule a run puts to it.
 * @param file the file
 * @returns its text, its tags and its style rules
 */
export function fileReadOf(file: SourceFile): FileRead {
  return {
    file,
    tags: isMarkup(file.path) ? tagsOf(file.text) : [],
    rules: isStylesheet(file.path) || isMarkup(file.path) ? styleRulesOf(file.path, file.text) : [],
  };
}

/**
 * Run one static rule on a file already parsed.
 * @param id the rule's id
 * @param read the file, parsed once by `fileReadOf`
 * @param context what the rule may read beyond the file
 * @returns where it fails; none where it passes or no detector holds the id
 */
export function runStaticRuleOn(
  id: string,
  read: FileRead,
  context: StaticContext,
): readonly Hit[] {
  const detector = detectors.get(id);
  return detector === undefined ? [] : detector({ ...read, context });
}

/**
 * The orphaned tokens of a home: each token no interface file uses, which the
 * finish rule `home-orphans` lists once for the workspace.
 * @param design the DESIGN.md
 * @param files the interface files it governs
 * @returns one hit per orphan, on DESIGN.md's line of the token
 */
export function homeOrphans(
  design: DesignDocument,
  designText: string,
  files: readonly SourceFile[],
): readonly Hit[] {
  return designDrift(design, files)
    .unused.filter((token) => token.group === "colors")
    .map((token) => ({
      line: lineOf(designText, designText.indexOf(`${token.name}:`)),
      detail: token.name,
    }));
}
