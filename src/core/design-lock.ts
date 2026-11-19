/**
 * The lock of DESIGN.md (J-148 S3, the Linear replay's F10): the owner's
 * pick, written by the design step, holds the sections the interface
 * rulings name locked, `- locked: Colors, Typography` under the decisions
 * book's `## Interface` heading, and the harness hook refuses a write that
 * changes one of them while the change record's `## Interface` section
 * holds no `- unlock <section>: "<the owner's words>"` for it, or
 * `- unlock all: "<the owner's words>"`. A section's tokens count as its own: `colors` is the Colors section's, `typography`
 * the Typography section's, `rounded` the Shapes section's, `spacing` the
 * Layout section's and `components` the Components section's. Pure: the
 * shell reads the file, the payload and the record.
 */

/** The token groups of the front matter, by the section that applies them. */
const GROUP_SECTION: ReadonlyMap<string, string> = new Map([
  ["colors", "colors"],
  ["typography", "typography"],
  ["rounded", "shapes"],
  ["spacing", "layout"],
  ["components", "components"],
]);

/** A section's name as compared: its words in lower case, its spacing collapsed. */
function key(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A section's block: the name it is shown by, and its text. */
interface Block {
  readonly name: string;
  readonly text: string;
}

/**
 * Each section of a DESIGN.md's text by its key, with its token group's
 * lines beside its prose: the prose under its `## ` heading, and the lines
 * of its group in the front matter; a group no section applies is a block
 * of its own, `<group> tokens`.
 */
function blocks(text: string): ReadonlyMap<string, Block> {
  const out = new Map<string, Block>();
  const add = (name: string, part: string): void => {
    const at = key(name);
    out.set(at, { name: out.get(at)?.name ?? name, text: `${out.get(at)?.text ?? ""}\n${part}` });
  };
  const lines = text.split("\n");
  let at = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    const front = end === -1 ? lines.slice(1) : lines.slice(1, end);
    let group: string | undefined;
    let held: string[] = [];
    const flush = (): void => {
      if (group !== undefined) add(GROUP_SECTION.get(group) ?? `${group} tokens`, held.join("\n"));
      held = [];
    };
    for (const line of front) {
      const top = /^([A-Za-z][\w-]*):/.exec(line);
      if (top !== null && !line.startsWith(" ")) {
        flush();
        group = top[1];
      }
      held.push(line);
    }
    flush();
    at = end === -1 ? lines.length : end + 1;
  }
  let section: string | undefined;
  let held: string[] = [];
  for (const line of [...lines.slice(at), "## "]) {
    if (line.startsWith("## ")) {
      if (section !== undefined) add(section, held.join("\n"));
      section = line.slice(3).trim();
      held = [];
    } else held.push(line);
  }
  return out;
}

/**
 * The locked sections a write changes: each whose prose or tokens differ
 * between the file before and after it.
 * @param before the file's text before the write, empty where it stands nowhere
 * @param after the file's text after it
 * @param locked the sections the rulings hold locked, by their headings
 * @returns the locked sections it changes, by the names the rulings give
 */
export function lockedChanged(
  before: string,
  after: string,
  locked: readonly string[],
): readonly string[] {
  const was = blocks(before);
  const now = blocks(after);
  const differs = (at: string): boolean => (was.get(at)?.text ?? "") !== (now.get(at)?.text ?? "");
  return locked.filter((name) => differs(key(name)));
}

/** One edit a write tool makes: the text it finds and the text it puts there. */
export interface TextEdit {
  readonly find: string;
  readonly put: string;
  readonly all?: boolean;
}

/**
 * A file's text after a write, read from what the write tool was given:
 * the whole text, edits applied in order, or a patch's hunks; undefined
 * where an edit's text is not found, so nothing is guessed.
 * @param current the file's text before it, empty where it stands nowhere
 * @param write the whole text, or the edits
 * @returns the text after it, or undefined
 */
export function textAfter(
  current: string,
  write: { readonly whole: string } | { readonly edits: readonly TextEdit[] },
): string | undefined {
  if ("whole" in write) return write.whole;
  let text = current;
  for (const edit of write.edits) {
    if (edit.find === "") return undefined;
    if (!text.includes(edit.find)) return undefined;
    text =
      edit.all === true
        ? text.split(edit.find).join(edit.put)
        : text.replace(edit.find, () => edit.put);
  }
  return text;
}

/**
 * The edits an apply-patch envelope makes to one file: each hunk's context
 * and removed lines found, its context and added lines put; an added file
 * as its whole text, a deleted one as empty.
 * @param patch the envelope's text
 * @param matches whether a path the envelope names is the file
 * @returns the write, or undefined where the envelope names the file nowhere
 */
export function patchWrite(
  patch: string,
  matches: (path: string) => boolean,
): { readonly whole: string } | { readonly edits: readonly TextEdit[] } | undefined {
  const lines = patch.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines[index] ?? "");
    if (header === null || !matches((header[2] ?? "").trim())) continue;
    const body: string[] = [];
    for (let at = index + 1; at < lines.length && !(lines[at] ?? "").startsWith("*** "); at += 1)
      body.push(lines[at] ?? "");
    if (header[1] === "Delete") return { whole: "" };
    if (header[1] === "Add")
      return {
        whole: `${body
          .filter((line) => line.startsWith("+"))
          .map((line) => line.slice(1))
          .join("\n")}\n`,
      };
    const edits: TextEdit[] = [];
    let find: string[] = [];
    let put: string[] = [];
    const flush = (): void => {
      if (find.length > 0 || put.length > 0)
        edits.push({ find: find.join("\n"), put: put.join("\n") });
      find = [];
      put = [];
    };
    for (const line of body) {
      if (line.startsWith("@@")) flush();
      else if (line.startsWith("-")) find.push(line.slice(1));
      else if (line.startsWith("+")) put.push(line.slice(1));
      else if (line.startsWith(" ")) {
        find.push(line.slice(1));
        put.push(line.slice(1));
      }
    }
    flush();
    return { edits };
  }
  return undefined;
}

/** The rule a lock's refusal names last (J-144 S3). */
const LOCK_RULE = "design-lock";

/**
 * The refusal of a write that changes a locked section, or undefined where
 * the owner's words unlock each one it changes.
 * @param path the DESIGN.md written, as the refusal names it
 * @param changed the locked sections the write changes
 * @param unlocked the sections the change record's `## Interface` section unlocks in the owner's words
 * @returns the refusal's one line, its rule last
 */
export function lockRefusal(
  path: string,
  changed: readonly string[],
  unlocked: readonly string[],
): string | undefined {
  if (unlocked.some((open) => key(open) === "all")) return undefined;
  const held = changed.filter((name) => !unlocked.some((open) => key(open) === key(name)));
  if (held.length === 0) return undefined;
  const names = held.join(" and ");
  const first = held[0] ?? "";
  return `this write would change ${path}'s ${names} ${held.length === 1 ? "section" : "sections"}, which the interface rulings hold locked as the owner's pick; ask the owner, write their words in the change record's ## Interface section as \`- unlock ${first}: "<their words>"\`, and write again; ${LOCK_RULE}`;
}
