import {
  COMPONENTS,
  isOnList,
  REGISTERS,
  type Component,
  type Framework,
  type Platform,
  type Register,
} from "./interface-facets.ts";

/**
 * The interface fact (J-123 S1; `workshop/components/interface-practice.md`,
 * "The fact"): whether a change touches an interface, as its proposal states
 * it in the record's `interface` line, `no`, or `"yes, <register>"` with the
 * register or registers the change works in. Every part of the practice runs
 * on this fact and none guesses it from the prompt: the design step's
 * applicability, the hook's finding on a write under an interface root, the
 * mirror's line. The design section names the components a change builds on
 * its `components:` line, the one facet a change declares by judgment.
 */

/** The fact a record states. */
export type InterfaceFact =
  | { readonly touches: false }
  | { readonly touches: true; readonly registers: readonly Register[] };

const YES = /^yes(?:, ([a-z]+(?:(?:, | and )[a-z]+)*))?$/;

/**
 * Parse the record's `interface` line.
 * @param text the line's text: `no`, `yes`, or `yes, <register>` with one register or more joined by `, ` or ` and `
 * @returns the fact, or undefined where the line is no such form or names a register off the list
 */
export function parseInterfaceFact(text: string): InterfaceFact | undefined {
  if (text === "no") return { touches: false };
  const match = YES.exec(text);
  if (match === null) return undefined;
  const named = match[1] === undefined ? [] : match[1].split(/, | and /);
  const registers: Register[] = [];
  for (const name of named) {
    if (!isOnList(REGISTERS, name)) return undefined;
    if (!registers.includes(name)) registers.push(name);
  }
  return { touches: true, registers };
}

/**
 * The `interface` line's text for a fact, as the record writes it.
 * @param fact the fact
 * @returns `no`, `yes`, or `yes, <registers>`
 */
export function interfaceFactText(fact: InterfaceFact): string {
  if (!fact.touches) return "no";
  return fact.registers.length === 0 ? "yes" : `yes, ${fact.registers.join(", ")}`;
}

/** The `components:` mark: a line of its own at the written depth, or a clause of the inline depth's one line. */
const COMPONENTS_LINE = /(?:^|\s)components: ([^;\n]+)/m;

/**
 * The components a change declares on its design section's `components:`
 * line, each a value of the closed list; a name off the list is left out.
 * @param section the design section's text
 * @returns the components, in the order the line names them
 */
export function declaredComponents(section: string): readonly Component[] {
  const line = COMPONENTS_LINE.exec(section)?.[1];
  if (line === undefined) return [];
  return [
    ...new Set(
      line
        .split(/,\s*|\s+and\s+/)
        .map((name) => name.trim())
        .filter((name): name is Component => isOnList(COMPONENTS, name)),
    ),
  ];
}

/** What the mirror's interface line reads: the record's line as written, the workspace's facets and the change's components. */
export interface InterfaceLineFacts {
  /** The record's `interface` line as written; undefined where it states none. */
  readonly stated: string | undefined;
  readonly platform: Platform;
  readonly frameworks: readonly Framework[];
  /** The registers the rulings set per root, used where the record names none. */
  readonly rulingRegisters: readonly Register[];
  readonly components: readonly Component[];
}

/**
 * The status mirror's interface line, printed while a change is open in a
 * workspace with interface roots (J-107 S2's edition): the fact as the
 * record states it with the facets in play, or the nudge that the proposal
 * states it.
 * @param facts the record's line, the workspace's facets and the change's components
 * @returns the line, unindented
 */
export function interfaceLine(facts: InterfaceLineFacts): string {
  if (facts.stated === undefined)
    return 'interface: not stated; the proposal states it in the record, interface: no or interface: "yes, <register>"';
  const fact = parseInterfaceFact(facts.stated);
  if (fact === undefined)
    return `interface: '${facts.stated}' is no form the record takes; write no, or "yes, <register>"`;
  if (!fact.touches) return "interface: no";
  const registers = fact.registers.length > 0 ? fact.registers : facts.rulingRegisters;
  const facets = [...registers, facts.platform, ...facts.frameworks].join(" · ");
  const components =
    facts.components.length === 0 ? "" : `; this change: ${facts.components.join(", ")}`;
  return `interface: yes; facets: ${facets}${components}`;
}
