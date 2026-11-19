import { h, type ComponentChild } from "preact";
import type {
  PracticeDocument,
  RosterDocument,
  SettingsDocument,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import { DeclaredChecks, HealthGroups, ReceiptTable } from "./checks.ts";
import { Group, kindGroups, ListBox, Meter, plural, SectionHead, StateWord, When } from "./ui.ts";

/*
 * Practice's home (J-166 S1): is greenline healthy here, and how is it
 * set? One sentence of its health, the health groups each with its
 * sentence, count, quiet code, its files folded and the act that clears
 * it; a tile of the roster with each kind's share loaded and the most
 * loaded skills; a tile of the settings; and the hooks with the declared
 * checks and the receipts folded.
 */

/** The health in one sentence: nothing to correct, or how many errors and warnings of how many kinds. */
export function healthSentence(practice: PracticeDocument): string {
  const { errors, warnings, groups } = practice.health;
  if (errors === 0 && warnings === 0)
    return "greenline is healthy here: status reports nothing to correct.";
  const kinds = (kind: "error" | "warning"): number =>
    groups.filter((group) => group.kind === kind).length;
  const part = (count: number, noun: string, of: number): string =>
    count === 0 ? "" : `${plural(count, noun)} of ${plural(of, "kind")}`;
  const parts = [
    part(errors, "error", kinds("error")),
    part(warnings, "warning", kinds("warning")),
  ].filter((text) => text !== "");
  return `${parts.join(" and ")} in greenline's health.`;
}

/** The roster as a tile: how many installed skills loaded, each kind's share, and the most loaded. */
export function RosterTile(props: { readonly roster: RosterDocument }): ComponentChild {
  const { roster } = props;
  const uses = roster.use.available ? roster.use.items : [];
  const used = new Map(uses.map((entry) => [entry.skill, entry.loads]));
  const installed = roster.skills.filter((skill) => skill.installed);
  const loads = uses.reduce((sum, entry) => sum + entry.loads, 0);
  const top = [...uses].sort((a, b) => b.loads - a.loads).slice(0, 3);
  const kinds = kindGroups(
    roster.kinds,
    installed.map((skill) => skill.kind),
  ).map(([kind, title]) => [kind, title.toLowerCase()] as const);
  return h(
    "article",
    { class: "panel tile", "data-component": "RosterTile" },
    h(SectionHead, {
      title: "Roster",
      aside: h("a", { href: pathOf({ page: "roster" }) }, "Open the roster"),
    }),
    h(
      "p",
      null,
      `${String(installed.filter((skill) => used.has(skill.name)).length)} of ${String(installed.length)} installed skills loaded · ${plural(loads, "load")}`,
    ),
    h(
      "dl",
      { class: "kind-bars" },
      kinds.map(([kind, label]) => {
        const own = installed.filter((skill) => skill.kind === kind);
        const loaded = own.filter((skill) => used.has(skill.name)).length;
        return own.length === 0
          ? null
          : h(
              "div",
              null,
              h("dt", null, label),
              h(
                "dd",
                null,
                h(Meter, {
                  value: loaded,
                  most: own.length,
                  label: `of ${String(own.length)} loaded`,
                  count: false,
                }),
                h("span", { class: "meta" }, `${String(loaded)} of ${String(own.length)}`),
              ),
            );
      }),
    ),
    top.length === 0
      ? h("p", { class: "meta" }, "No load is recorded yet.")
      : h(
          "p",
          { class: "meta" },
          "Most loaded: ",
          top.map((entry, index) => [
            index === 0 ? "" : " · ",
            h(
              "a",
              { class: "mono", href: pathOf({ page: "roster", skill: entry.skill }) },
              entry.skill,
            ),
            ` ${String(entry.loads)}`,
          ]),
        ),
  );
}

/** The settings as a tile: the harnesses, proceeding without waiting, the policy and its last save. */
export function SettingsTile(props: {
  readonly settings: SettingsDocument;
  readonly at: Date;
}): ComponentChild {
  const { settings, at } = props;
  const manifest = settings.manifest;
  const last = settings.policyChanges.reduce<string | null>(
    (latest, change) => (latest === null || change.at > latest ? change.at : latest),
    null,
  );
  const words = new Map([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
  ]);
  const row = (label: string, value: ComponentChild): ComponentChild =>
    h("div", null, h("dt", null, label), h("dd", null, value));
  return h(
    "article",
    { class: "panel tile", "data-component": "SettingsTile" },
    h(SectionHead, {
      title: "Settings",
      aside: h(
        "a",
        { href: pathOf({ page: "settings", tab: "installation" }) },
        "Open the settings",
      ),
    }),
    h(
      "dl",
      { class: "facts tile-facts" },
      row(
        "Harnesses",
        manifest.targets.map((target) => words.get(target) ?? target).join(", ") || "none",
      ),
      row("Proceeds without waiting", manifest.proceed),
      row("Skills installed", String(settings.skills.filter((skill) => skill.installed).length)),
      row(
        "House rulings",
        h(
          "a",
          { href: pathOf({ page: "rulings" }) },
          settings.houseRulings.rulings.length === 0
            ? "none yet"
            : plural(settings.houseRulings.rulings.length, "ruling"),
        ),
      ),
      row(
        "Policy last saved",
        last === null ? "never through this page" : h(When, { iso: last, at }),
      ),
    ),
  );
}

/** Practice's home drawn from the practice, the roster and the settings, each where it was read. */
export function PracticeHome(props: {
  readonly practice: PracticeDocument;
  readonly roster: RosterDocument | null;
  readonly settings: SettingsDocument | null;
  readonly at: Date;
}): ComponentChild {
  const { practice, roster, settings, at } = props;
  const healthy = practice.health.errors === 0 && practice.health.warnings === 0;
  return h(
    "div",
    { class: "practice-home", "data-component": "PracticeHome" },
    h(
      "p",
      { class: "health-sentence" },
      h(StateWord, { word: healthy ? "ok" : practice.health.errors > 0 ? "error" : "warning" }),
      " ",
      healthSentence(practice),
      h("span", { class: "meta" }, " From greenline status."),
    ),
    h(HealthGroups, { groups: practice.health.groups }),
    h(
      "div",
      { class: "tiles-two" },
      roster === null ? null : h(RosterTile, { roster }),
      settings === null ? null : h(SettingsTile, { settings, at }),
    ),
    h(
      ListBox,
      { label: "The hooks and the receipts" },
      h(
        Group,
        {
          id: "practice:hooks",
          title: "Hooks and declared checks",
          count: practice.hooks === null ? 0 : practice.hooks.checks.length,
          open: false,
          flat: false,
        },
        h(DeclaredChecks, { hooks: practice.hooks }),
      ),
      h(
        Group,
        {
          id: "practice:receipts",
          title: "Receipts",
          count: practice.receipts.length,
          quantity: practice.connector ? undefined : "no connector is enabled",
          open: false,
          flat: false,
        },
        h(ReceiptTable, {
          receipts: practice.receipts,
          problems: practice.problems,
          connector: practice.connector,
        }),
      ),
    ),
    h("p", { class: "meta" }, `greenline CLI ${practice.version}.`),
  );
}
