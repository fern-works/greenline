import { VIEWS } from "./addresses.ts";

/*
 * The keys: every action a click takes has a key. The palette opens on
 * `/` or the platform's command key with K; `g` then a place's letter goes
 * to that place (d, c, i, k, p); `j` and `k` move over the group heads and
 * the rows and Enter opens a row's page; `o` or Space toggles the group or
 * the fold in focus, `l` and `h` open and close it, `[` and `]` close and
 * open every one on the page, and `v` turns the fold's view between Read,
 * Source and JSON; Escape closes or goes back to the parent; `r` reads the
 * repository again; `t` switches the theme; `c` copies the page's address;
 * `?` shows the keys. A key typed in a field is the field's, except Escape
 * and the palette's chord.
 */

/** What a key asks the shell to do. */
export type KeyCommand =
  | { readonly kind: "palette" }
  | { readonly kind: "await-view" }
  | { readonly kind: "go"; readonly path: string }
  | { readonly kind: "next" }
  | { readonly kind: "previous" }
  | { readonly kind: "toggle" }
  | { readonly kind: "open" }
  | { readonly kind: "close" }
  | { readonly kind: "open-all" }
  | { readonly kind: "close-all" }
  | { readonly kind: "view" }
  | { readonly kind: "back" }
  | { readonly kind: "reload" }
  | { readonly kind: "theme" }
  | { readonly kind: "copy" }
  | { readonly kind: "keys" };

/** The modifiers held with a key. */
export interface Held {
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
}

/** The keys that ask for one command each, with no `g` before them. */
const SINGLE: ReadonlyMap<string, KeyCommand> = new Map<string, KeyCommand>([
  ["/", { kind: "palette" }],
  ["g", { kind: "await-view" }],
  ["j", { kind: "next" }],
  ["k", { kind: "previous" }],
  ["o", { kind: "toggle" }],
  ["l", { kind: "open" }],
  ["h", { kind: "close" }],
  ["]", { kind: "open-all" }],
  ["[", { kind: "close-all" }],
  ["v", { kind: "view" }],
  ["r", { kind: "reload" }],
  ["t", { kind: "theme" }],
  ["c", { kind: "copy" }],
  ["?", { kind: "keys" }],
]);

/**
 * The command a key asks for, or undefined when it asks for none.
 * @param key the key, as the keyboard event names it
 * @param held the modifiers held
 * @param inField whether the key was typed in a field
 * @param afterG whether the key follows a `g`
 * @returns the command, or undefined
 */
export function commandFor(
  key: string,
  held: Held,
  inField: boolean,
  afterG: boolean,
): KeyCommand | undefined {
  if ((held.meta || held.ctrl) && key.toLowerCase() === "k") return { kind: "palette" };
  if (key === "Escape") return { kind: "back" };
  if (inField || held.meta || held.ctrl || held.alt) return undefined;
  if (afterG) {
    const view = VIEWS.find((entry) => entry.key === key);
    return view === undefined ? undefined : { kind: "go", path: view.path };
  }
  return SINGLE.get(key);
}

/** The keys as the help shows them. */
export const KEYS: readonly { readonly keys: string; readonly does: string }[] = [
  {
    keys: "/ or ⌘K",
    does: "open the palette: changes, discussions, plans, skills, pages and actions",
  },
  {
    keys: `g then ${VIEWS.map((view) => view.key).join(" ")}`,
    does: `go to ${VIEWS.map((view) => view.label).join(", ")}`,
  },
  { keys: "j k", does: "move over the group heads and the rows; Enter opens a row's page" },
  { keys: "o or Space", does: "open or close the group or the fold in focus" },
  { keys: "l h", does: "open, or close, the group or the fold in focus" },
  { keys: "] [", does: "open, or close, every group and fold on the page" },
  { keys: "v", does: "turn the open fold's view: Read, Source, JSON" },
  { keys: "Esc", does: "close the palette or the keys, or go back to the parent" },
  { keys: "r", does: "read the repository again" },
  { keys: "t", does: "switch light and dark" },
  { keys: "c", does: "copy this page's address" },
  { keys: "?", does: "show the keys" },
];
