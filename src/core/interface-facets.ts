/**
 * The interface practice's facets (`workshop/components/interface-practice.md`,
 * "The facets"; the register's row of 2026-10-24 confirming N-62): every
 * rule, page section, catalog entry and scenario names the values it applies
 * to on five closed lists, and the check, the deal, the reviewer and the
 * craft index select by the facets in play. A list grows only by a ruling,
 * so each is a constant here and nothing else extends it.
 */

/** The register: a site (landing, marketing, docs) or an app (product UI). */
export const REGISTERS = ["site", "app"] as const;
/** A register's name. */
export type Register = (typeof REGISTERS)[number];

/** The platform: web, ios, android, cross (React Native, Expo, Flutter) or desktop (Electron, Tauri). */
export const PLATFORMS = ["web", "ios", "android", "cross", "desktop"] as const;
/** A platform's name. */
export type Platform = (typeof PLATFORMS)[number];

/** The framework, the interface layer's and then the style layer's. */
export const FRAMEWORKS = [
  "react",
  "vue",
  "svelte",
  "next",
  "nuxt",
  "astro",
  "swiftui",
  "compose",
  "react-native",
  "tailwind",
  "unocss",
  "css-modules",
  "vanilla",
] as const;
/** A framework's name. */
export type Framework = (typeof FRAMEWORKS)[number];

/** The concern a unit serves. */
export const CONCERNS = [
  "type",
  "colour",
  "layout",
  "motion",
  "copy",
  "forms",
  "states",
  "accessibility",
  "performance",
  "responsive",
  "dark-mode",
  "imagery",
  "data-viz",
  "sound",
] as const;
/** A concern's name. */
export type Concern = (typeof CONCERNS)[number];

/** The component a unit serves, the one facet a change declares by judgment. */
export const COMPONENTS = [
  "table",
  "form",
  "modal",
  "navigation",
  "list",
  "card",
  "chart",
  "toast",
  "dropdown",
  "tabs",
  "empty-state",
  "onboarding",
  "settings",
  "pricing",
  "hero",
  "footer",
  "search",
  "command-palette",
] as const;
/** A component's name. */
export type Component = (typeof COMPONENTS)[number];

/**
 * Whether a name is on a closed list.
 * @param list the list
 * @param name the name to test
 * @returns true when the list holds it
 */
export function isOnList<T extends string>(list: readonly T[], name: string): name is T {
  return list.some((entry) => entry === name);
}

/** The facets a unit names, each list empty where the unit applies to every value of it. */
export interface Facets {
  readonly register: readonly Register[];
  readonly platform: readonly Platform[];
  readonly framework: readonly Framework[];
  readonly concern: readonly Concern[];
  readonly component: readonly Component[];
}

/** The facets in play for a reading: what the workspace, the file and the change state; an absent value matches every unit. */
export interface FacetsInPlay {
  readonly register?: readonly Register[] | undefined;
  readonly platform?: Platform | undefined;
  readonly frameworks?: readonly Framework[] | undefined;
  readonly components?: readonly Component[] | undefined;
}

/**
 * Whether a unit's facets match the facets in play: a unit with no value on
 * a facet applies to every value of it, and a facet nothing in play states
 * selects nothing out. Concern is the unit's own and never filters.
 * @param facets the unit's facets
 * @param play the facets in play
 * @returns true when the unit applies
 */
export function facetsMatch(facets: Facets, play: FacetsInPlay): boolean {
  const meets = <T extends string>(unit: readonly T[], stated: readonly T[] | undefined): boolean =>
    unit.length === 0 || stated === undefined || unit.some((value) => stated.includes(value));
  return (
    meets(facets.register, play.register) &&
    meets(facets.platform, play.platform === undefined ? undefined : [play.platform]) &&
    meets(facets.framework, play.frameworks) &&
    meets(facets.component, play.components)
  );
}
