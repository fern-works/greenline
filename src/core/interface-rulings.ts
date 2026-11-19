import {
  isOnList,
  PLATFORMS,
  REGISTERS,
  type Platform,
  type Register,
} from "./interface-facets.ts";

/**
 * The owner's interface rulings (J-123 S1; the register's row of 2026-10-24
 * on the home): the `## Interface` section of the decisions book,
 * `.greenline/DECISIONS.md`, one dash line per ruling. It holds the register
 * per root, the platform, the anti-references, the direction's pin, the
 * shell, the standing waivers with their reasons and the bar. frame and
 * design read it before an interface change, the check clears a reflex a
 * standing waiver names, and the design step writes it on the owner's yes.
 * A ruling is the owner's: the agent proposes one and never sets it alone.
 */

/** The section's heading in the decisions book. */
const INTERFACE_HEADING = "## Interface";

/** A root's register. */
export interface RootRegister {
  readonly root: string;
  readonly register: Register;
}

/** The direction locked for the workspace: its catalog entry, the catalog's pin and the date. */
export interface DirectionPin {
  readonly entry: string;
  readonly catalog: string;
  readonly date: string;
}

/** A standing waiver: a reflex rule the owner waived for the workspace, with the reason. */
export interface StandingWaiver {
  readonly rule: string;
  readonly reason: string;
}

/** The rulings the section holds. */
export interface InterfaceRulings {
  readonly registers: readonly RootRegister[];
  readonly platform?: Platform | undefined;
  readonly antiReferences: readonly string[];
  readonly direction?: DirectionPin | undefined;
  readonly shell?: string | undefined;
  readonly waivers: readonly StandingWaiver[];
  readonly bar?: string | undefined;
  /** The DESIGN.md sections the owner's pick holds locked, by their headings (J-148 S3). */
  readonly locked?: readonly string[] | undefined;
}

/** A line of the section that is no ruling's form, by its text. */
export interface RulingIssue {
  readonly line: string;
  readonly message: string;
}

/** The section read: its rulings and the lines it could not read. */
export interface RulingsReading {
  /** Whether the decisions book holds the section at all. */
  readonly present: boolean;
  readonly rulings: InterfaceRulings;
  readonly issues: readonly RulingIssue[];
}

/** The rulings of a workspace that states none. */
export const NO_RULINGS: InterfaceRulings = { registers: [], antiReferences: [], waivers: [] };

const REGISTER_LINE = /^register: (site|app) at (\S+)$/;
const DIRECTION_LINE = /^direction: ([a-z0-9][a-z0-9-]*), catalog ([^,]+), (\d{4}-\d{2}-\d{2})$/;
const WAIVER_LINE = /^waiver: ([a-z0-9][a-z0-9-]*): (\S.*)$/;
const FIELD_LINE = /^([a-z-]+): (\S.*)$/;

/** The section's dash lines, and whether the book holds the section. */
interface SectionLines {
  readonly present: boolean;
  readonly lines: readonly string[];
}

/** The rulings a section states once, each set by its last line. */
interface SingleRulings {
  platform?: Platform;
  direction?: DirectionPin;
  shell?: string;
  bar?: string;
  locked?: readonly string[];
}

/** The dash lines under the section's heading, a continuation joined to its line. */
function sectionLines(book: string): SectionLines {
  const all = book.split(/\r?\n/);
  const start = all.findIndex((line) => line.trim() === INTERFACE_HEADING);
  if (start === -1) return { present: false, lines: [] };
  const lines: string[] = [];
  for (const line of all.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    if (line.startsWith("- ")) lines.push(line.slice(2).trim());
    else if (/^\s+\S/.test(line) && lines.length > 0)
      lines[lines.length - 1] = `${lines.at(-1) ?? ""} ${line.trim()}`;
  }
  return { present: true, lines };
}

/**
 * Read the `## Interface` section of the decisions book.
 * @param book the decisions book's text
 * @returns its rulings, and each line it could not read
 */
export function parseInterfaceRulings(book: string): RulingsReading {
  const { present, lines } = sectionLines(book);
  const registers: RootRegister[] = [];
  const antiReferences: string[] = [];
  const waivers: StandingWaiver[] = [];
  const issues: RulingIssue[] = [];
  const single: SingleRulings = {};
  for (const line of lines) {
    const register = REGISTER_LINE.exec(line);
    const direction = DIRECTION_LINE.exec(line);
    const waiver = WAIVER_LINE.exec(line);
    const field = FIELD_LINE.exec(line);
    if (register !== null) {
      const name = register[1] ?? "";
      if (isOnList(REGISTERS, name)) registers.push({ root: register[2] ?? ".", register: name });
    } else if (direction !== null)
      single.direction = {
        entry: direction[1] ?? "",
        catalog: direction[2] ?? "",
        date: direction[3] ?? "",
      };
    else if (waiver !== null) waivers.push({ rule: waiver[1] ?? "", reason: waiver[2] ?? "" });
    else if (field?.[1] === "platform") {
      const name = field[2] ?? "";
      if (isOnList(PLATFORMS, name)) single.platform = name;
      else issues.push({ line, message: `the platform is one of ${PLATFORMS.join(", ")}` });
    } else if (field?.[1] === "anti-reference") antiReferences.push(field[2] ?? "");
    else if (field?.[1] === "shell") single.shell = field[2] ?? "";
    else if (field?.[1] === "bar") single.bar = field[2] ?? "";
    else if (field?.[1] === "locked")
      single.locked = (field[2] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
    else
      issues.push({
        line,
        message:
          "a ruling is one of: register: <site|app> at <root>; platform: <platform>; anti-reference: <text>; direction: <entry>, catalog <pin>, <date>; shell: <text>; waiver: <rule>: <reason>; bar: <text>; locked: <section>, <section>",
      });
  }
  return { present, rulings: { registers, antiReferences, waivers, ...single }, issues };
}

/**
 * The section's text for a set of rulings, as the design step writes it.
 * @param rulings the rulings
 * @returns the heading and one dash line per ruling, ending with a newline
 */
export function renderInterfaceRulings(rulings: InterfaceRulings): string {
  const lines = [
    ...rulings.registers.map((entry) => `register: ${entry.register} at ${entry.root}`),
    ...(rulings.platform === undefined ? [] : [`platform: ${rulings.platform}`]),
    ...rulings.antiReferences.map((text) => `anti-reference: ${text}`),
    ...(rulings.direction === undefined
      ? []
      : [
          `direction: ${rulings.direction.entry}, catalog ${rulings.direction.catalog}, ${rulings.direction.date}`,
        ]),
    ...(rulings.shell === undefined ? [] : [`shell: ${rulings.shell}`]),
    ...rulings.waivers.map((waiver) => `waiver: ${waiver.rule}: ${waiver.reason}`),
    ...(rulings.bar === undefined ? [] : [`bar: ${rulings.bar}`]),
    ...(rulings.locked === undefined || rulings.locked.length === 0
      ? []
      : [`locked: ${rulings.locked.join(", ")}`]),
  ];
  return `${INTERFACE_HEADING}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`;
}

/**
 * The decisions book with its `## Interface` section replaced, or appended
 * where it holds none; every other byte of the book is the owner's and stays.
 * @param book the book's text
 * @param rulings the rulings to write
 * @returns the book's new text
 */
export function withInterfaceRulings(book: string, rulings: InterfaceRulings): string {
  const section = renderInterfaceRulings(rulings);
  const lines = book.split("\n");
  const start = lines.findIndex((line) => line.trim() === INTERFACE_HEADING);
  if (start === -1) {
    const trimmed = book.replace(/\n*$/, "");
    return trimmed === "" ? section : `${trimmed}\n\n${section}`;
  }
  const after = lines.slice(start + 1).findIndex((line) => /^#{1,2} /.test(line));
  const end = after === -1 ? lines.length : start + 1 + after;
  const rest = lines.slice(end).join("\n");
  const head = lines.slice(0, start).join("\n");
  return `${head}${head === "" ? "" : "\n"}${section}${rest === "" ? "" : `\n${rest}`}`;
}

/**
 * The register of the root that holds a path, by the rulings.
 * @param rulings the rulings
 * @param path the path from the repository root
 * @returns the nearest root's register, or undefined where no ruling holds the path
 */
export function registerOf(rulings: InterfaceRulings, path: string): Register | undefined {
  const holding = rulings.registers.filter(
    (entry) => entry.root === "." || path === entry.root || path.startsWith(`${entry.root}/`),
  );
  const depth = (root: string): number => (root === "." ? 0 : root.split("/").length);
  return [...holding].sort((one, other) => depth(other.root) - depth(one.root))[0]?.register;
}
