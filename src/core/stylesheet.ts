import { lineOf } from "./markup.ts";

/**
 * A scanner for the style rules of an interface file (J-123 S4): each rule's
 * selector, its declarations and the at-rules around it (`@media`,
 * `@supports`, `@container`), from a stylesheet or from the `<style>` blocks
 * and style attributes of markup. It is no CSS engine: it resolves no
 * specificity and computes no value, which the render engine measures in a
 * browser; the static rules read what a rule declares and where it stands.
 */

/** One declaration: its property, lower case, its value and its line. */
export interface Declaration {
  readonly property: string;
  readonly value: string;
  readonly line: number;
}

/** One style rule with the at-rules that hold it, outermost first. */
export interface StyleRule {
  readonly selector: string;
  readonly declarations: readonly Declaration[];
  readonly context: readonly string[];
  readonly line: number;
}

/** The declarations of a block's body. */
function declarationsOf(body: string, text: string, offset: number): readonly Declaration[] {
  const found: Declaration[] = [];
  let at = 0;
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon !== -1) {
      const property = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim();
      if (/^-{0,2}[a-z][a-z0-9-]*$/.test(property) && value !== "")
        found.push({
          property,
          value,
          line: lineOf(text, offset + at + part.indexOf(part.trimStart().charAt(0))),
        });
    }
    at += part.length + 1;
  }
  return found;
}

/**
 * The rules of a stylesheet's text, each with its at-rule context.
 * @param css the stylesheet
 * @param text the whole file, for the lines
 * @param base the stylesheet's offset in the file
 * @returns the rules, in order
 */
function rulesIn(css: string, text: string, base: number): readonly StyleRule[] {
  const rules: StyleRule[] = [];
  const stack: { readonly prelude: string; readonly isRule: boolean; readonly start: number }[] =
    [];
  let preludeStart = 0;
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (char === "{") {
      const prelude = cleaned.slice(preludeStart, index).trim();
      // An at-rule whose body is declarations, such as @font-face, reads as a rule of its own.
      const isRule =
        !prelude.startsWith("@") || /^@(?:font-face|page|property|counter-style)\b/.test(prelude);
      stack.push({ prelude: prelude.replace(/\s+/g, " "), isRule, start: index + 1 });
      preludeStart = index + 1;
    } else if (char === "}") {
      const open = stack.pop();
      if (open?.isRule === true) {
        const body = cleaned.slice(open.start, index);
        // A nested rule's own body holds no inner block once its children closed.
        const own = body.replace(/\{[^{}]*\}/g, "");
        rules.push({
          selector: open.prelude,
          declarations: declarationsOf(own, text, base + open.start),
          context: stack.filter((entry) => !entry.isRule).map((entry) => entry.prelude),
          line: lineOf(text, base + open.start),
        });
      }
      preludeStart = index + 1;
    } else if (char === ";" && stack.length === 0) preludeStart = index + 1;
  }
  return rules;
}

/**
 * Every style rule a file holds: the whole file where it is a stylesheet,
 * else each `<style>` block, and each inline `style="..."` attribute as a
 * rule whose selector is `[style]`.
 * @param path the file's path, whose extension says whether it is a stylesheet
 * @param text the file's text
 * @returns the rules, in order
 */
export function styleRulesOf(path: string, text: string): readonly StyleRule[] {
  if (/\.(?:css|scss|sass|less)$/.test(path)) return rulesIn(text, text, 0);
  const rules: StyleRule[] = [];
  for (const block of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const start = (block.index ?? 0) + block[0].indexOf(">") + 1;
    rules.push(...rulesIn(block[1] ?? "", text, start));
  }
  for (const inline of text.matchAll(/\sstyle="([^"]*)"/g))
    rules.push({
      selector: "[style]",
      declarations: declarationsOf(inline[1] ?? "", text, inline.index ?? 0),
      context: [],
      line: lineOf(text, inline.index ?? 0),
    });
  return rules;
}

/**
 * The value of a property in a rule, the last declaration winning.
 * @param rule the rule
 * @param property the property, lower case
 * @returns its value, or undefined
 */
export function valueOf(rule: StyleRule, property: string): string | undefined {
  return [...rule.declarations].reverse().find((entry) => entry.property === property)?.value;
}

/**
 * A duration in milliseconds, from `200ms` or `.2s`.
 * @param value the written duration
 * @returns the milliseconds, or undefined
 */
export function millisecondsOf(value: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(value.trim());
  if (match === null) return undefined;
  const number = Number.parseFloat(match[1] ?? "");
  return match[2] === "s" ? number * 1000 : number;
}

/**
 * Every duration a transition or an animation shorthand or longhand names.
 * @param rule the rule
 * @returns each duration's milliseconds with its declaration
 */
export function durationsOf(
  rule: StyleRule,
): readonly { readonly ms: number; readonly declaration: Declaration }[] {
  return rule.declarations.flatMap((declaration) => {
    if (!/^(?:transition|animation)(?:-duration)?$/.test(declaration.property)) return [];
    return layersOf(declaration.value).flatMap((layer) => {
      // In a shorthand the first time is the duration and the second the delay.
      const first = /(?<![\w.-])\d*\.?\d+m?s\b/.exec(layer)?.[0];
      const ms = first === undefined ? undefined : millisecondsOf(first);
      return ms === undefined ? [] : [{ ms, declaration }];
    });
  });
}

/**
 * The comma-separated layers of a value, commas inside parentheses kept.
 * @param value the value
 * @returns each layer, trimmed
 */
export function layersOf(value: string): readonly string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers.filter((layer) => layer !== "");
}
