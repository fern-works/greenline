import { h, type ComponentChild, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type {
  CountedName,
  RosterDocument,
  RosterSkill,
  RosterUse,
  SkillDocument,
  SkillKindView,
  SkillLoad,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import {
  ArtefactFold,
  Empty,
  FilterBar,
  Group,
  JsonView,
  kindGroups,
  LINE_STEPS,
  ListBox,
  Meter,
  plural,
  RecordLink,
  SectionHead,
  StateWord,
  StepCells,
  Tag,
  when,
  When,
} from "./ui.ts";

/*
 * The roster's components (J-116 S4, redrawn by J-166 S1): one load of a
 * skill; the roster grouped by kind, the kinds in the modes
 * definition's order, each ranked by loads with its kind's sentence, a row
 * per skill with its sentence, its loads on the neutral meter, its loads
 * over the line as eight cells, how often it loaded off its own step and
 * when last, the never-loaded folded into one line per kind and the
 * skills not installed folded last; the nine-column table as the raw view;
 * and a skill's own page. A load is a fact of what entered the context,
 * never of what was followed; the record's sections say that.
 */

/** Who loaded a skill: the session's own agent, the builder, or a fresh agent by the id its harness gave. */
function agentWord(agent: string | null): string {
  return agent === null ? "builder" : `fresh agent ${agent}`;
}

/** One load of a skill: whole or part, when, at which step and by which agent. */
export function LoadRow(props: { readonly load: SkillLoad }): ComponentChild {
  const load = props.load;
  return h(
    "li",
    { "data-component": "LoadRow" },
    h(
      "div",
      { class: "row-top" },
      h("span", { class: "mono title" }, load.skill),
      h(
        "span",
        { class: "meta" },
        [
          // One page per read and the harness's cut name why a read is a part (J-203 S1).
          load.whole
            ? "whole"
            : load.cause === "together"
              ? "part, read with another page"
              : load.cause === "cut"
                ? "part, cut by the harness"
                : "part",
          load.step === null ? "before the record" : `at ${load.step}`,
          agentWord(load.agent),
          when(load.at),
        ].join(" · "),
      ),
    ),
    h(
      "div",
      { class: "row-meta" },
      h("span", { class: "mono" }, load.file),
      h("span", null, `by ${load.via}`),
    ),
  );
}

/** Names with their counts, in the line's order, `build 3, review 1`. */
function countedText(names: readonly CountedName[]): string {
  const at = (name: string): number => {
    const index = LINE_STEPS.indexOf(name);
    return index === -1 ? LINE_STEPS.length : index;
  };
  return [...names]
    .sort((a, b) => at(a.name) - at(b.name))
    .map((entry) => `${entry.name} ${String(entry.loads)}`)
    .join(", ");
}

/** A skill's page in the app. */
const skillPath = (name: string): string => pathOf({ page: "roster", skill: name });

/**
 * The roster as a table, its raw view: each skill with its kind, whether it
 * is installed, its loads, whole or part, the changes, the steps, the
 * harness and model, and its loads off its step, the most loaded first.
 */
export function RosterTable(props: {
  readonly skills: readonly RosterSkill[];
  readonly use: readonly RosterUse[] | null;
}): ComponentChild {
  const used = new Map((props.use ?? []).map((entry) => [entry.skill, entry]));
  const most = Math.max(1, ...(props.use ?? []).map((entry) => entry.loads));
  const ranked = [...props.skills].sort(
    (a, b) =>
      (used.get(b.name)?.loads ?? 0) - (used.get(a.name)?.loads ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return h(
    "div",
    { class: "table-wrap roster-table", "data-component": "RosterTable" },
    h(
      "table",
      null,
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          [
            "Skill",
            "Kind",
            "Installed",
            "Loads",
            "Whole or part",
            "Changes",
            "By step",
            "By harness and model",
            "Off its step",
          ].map((label) => h("th", null, label)),
        ),
      ),
      h(
        "tbody",
        null,
        ranked.map((skill) => {
          const use = used.get(skill.name);
          return h(
            "tr",
            null,
            h("td", null, h("a", { class: "mono", href: skillPath(skill.name) }, skill.name)),
            h("td", null, skill.slot === null ? skill.kind : `${skill.kind} · ${skill.slot}`),
            h(
              "td",
              null,
              // A plain fact, a word with no mark (J-164 S1).
              h(StateWord, { word: skill.installed ? "installed" : "not installed" }),
              skill.extra ? h(Tag, null, "extra") : null,
            ),
            h(
              "td",
              null,
              use === undefined
                ? props.use === null
                  ? h("span", { class: "unset" }, "not recorded")
                  : "0"
                : h(Meter, { value: use.loads, most, label: "loads" }),
            ),
            h("td", null, use === undefined ? "" : `${use.whole} whole, ${use.part} in part`),
            h("td", null, use === undefined ? "" : String(use.changes)),
            h("td", null, use === undefined ? "" : countedText(use.byStep)),
            h("td", null, use === undefined ? "" : countedText(use.byAgent)),
            h("td", null, use === undefined || skill.slot === null ? "" : String(use.outside)),
          );
        }),
      ),
    ),
  );
}

/**
 * One skill of the roster as a row (J-166 S1), a fold of one artefact:
 * its name, its sentence, its loads on the neutral meter with the count
 * aligned, its loads over the line as eight cells, off its step as a count
 * for a step skill, and when it last loaded; opened, its loads by step,
 * whole or in part, and the changes, with its page.
 */
export function RosterRow(props: {
  readonly skill: RosterSkill;
  readonly use: RosterUse;
  readonly most: number;
  readonly at: Date;
}): ComponentChild {
  const { skill, use, at } = props;
  return h(ArtefactFold, {
    id: `skill:${skill.name}`,
    kind: "roster skill",
    component: "RosterRow",
    open: false,
    address: null,
    closed: null,
    attributes: { "data-skill": skill.name },
    head: h(
      "span",
      { class: "roster-row" },
      h(
        "span",
        { class: "roster-name" },
        h("a", { class: "mono title", href: skillPath(skill.name) }, skill.name),
        skill.extra ? h(Tag, null, "extra") : null,
      ),
      h("span", { class: "roster-sentence" }, skill.description),
      h(Meter, { value: use.loads, most: props.most, label: "loads" }),
      h(StepCells, { byStep: use.byStep, own: skill.slot }),
      h(
        "span",
        { class: "roster-off meta" },
        skill.slot === null || use.outside === 0 ? "" : `${String(use.outside)} off its step`,
      ),
      h("span", { class: "roster-last meta" }, h(When, { iso: use.lastAt, at })),
    ),
    held: {
      read: () =>
        h(
          "div",
          { class: "roster-open" },
          h(
            "p",
            null,
            `${plural(use.loads, "load")} in ${plural(use.changes, "change")}, ${String(use.whole)} whole and ${String(use.part)} in part, a reference file without its SKILL.md.`,
          ),
          h("p", { class: "meta" }, `By step: ${countedText(use.byStep)}.`),
          h("p", { class: "meta" }, `By harness and model: ${countedText(use.byAgent)}.`),
          h("p", null, h("a", { href: skillPath(skill.name) }, `Open ${skill.name}'s page`)),
        ),
      source: null,
      json: {
        text: JSON.stringify({ skill, use }, null, 2),
        address: `/api/roster/${encodeURIComponent(skill.name)}`,
      },
    },
  });
}

/** The skills of one kind no change has loaded, in one folded line. */
function NeverLoadedLine(props: { readonly skills: readonly RosterSkill[] }): ComponentChild {
  if (props.skills.length === 0) return null;
  return h(
    Group,
    {
      id: `never:${props.skills[0]?.kind ?? ""}`,
      title: `${String(props.skills.length)} never loaded`,
      count: props.skills.length,
      open: false,
      flat: false,
      component: "NeverLoaded",
    },
    h(
      "ul",
      { class: "plain never-list" },
      props.skills.map((skill) =>
        h(
          "li",
          null,
          h("a", { class: "mono", href: skillPath(skill.name) }, skill.name),
          h("span", { class: "meta" }, ` ${skill.description}`),
        ),
      ),
    ),
  );
}

/**
 * The roster grouped by kind (J-166 S1), the kinds in the modes
 * definition's order, each with its kind's sentence and ranked by loads, the
 * never-loaded folded into one line per kind, and the skills not installed
 * folded last, each leading to the installation.
 */
export function RosterGroups(props: {
  readonly roster: RosterDocument;
  readonly at: Date;
}): ComponentChild {
  const { roster, at } = props;
  const uses = roster.use.available ? roster.use.items : [];
  const used = new Map(uses.map((entry) => [entry.skill, entry]));
  const most = Math.max(1, ...uses.map((entry) => entry.loads));
  const installed = roster.skills.filter((skill) => skill.installed);
  const absent = roster.skills.filter((skill) => !skill.installed);
  const sentence = (kind: string): string =>
    roster.kinds.find((entry: SkillKindView) => entry.name === kind)?.when ?? "";
  const kinds = kindGroups(
    roster.kinds,
    installed.map((skill) => skill.kind),
  );
  return h(
    "div",
    { "data-component": "RosterGroups" },
    kinds.map(([kind, title]) => {
      const own = installed.filter((skill) => skill.kind === kind);
      if (own.length === 0) return null;
      const loaded = own
        .filter((skill) => used.has(skill.name))
        .sort((a, b) => (used.get(b.name)?.loads ?? 0) - (used.get(a.name)?.loads ?? 0));
      const never = own.filter((skill) => !used.has(skill.name));
      const loads = loaded.reduce((sum, skill) => sum + (used.get(skill.name)?.loads ?? 0), 0);
      return h(
        "section",
        { class: "roster-kind", "data-kind": kind, "aria-label": title },
        h(SectionHead, {
          title,
          count: own.length,
          aside: `${String(loaded.length)} of ${String(own.length)} loaded · ${plural(loads, "load")}`,
        }),
        sentence(kind) === "" ? null : h("p", { class: "meta kind-sentence" }, sentence(kind)),
        h(
          ListBox,
          { label: `The ${title.toLowerCase()}` },
          loaded.map((skill) => {
            const use = used.get(skill.name);
            return use === undefined ? null : h(RosterRow, { skill, use, most, at });
          }),
          h(NeverLoadedLine, { skills: never }),
        ),
      );
    }),
    absent.length === 0
      ? null
      : h(
          ListBox,
          { label: "Not installed" },
          h(
            Group,
            {
              id: "roster:not-installed",
              title: "Not installed",
              count: absent.length,
              open: false,
              flat: false,
              component: "NotInstalled",
            },
            h(
              "p",
              { class: "meta" },
              "What the practice offers that is not installed here. ",
              h(
                "a",
                { href: pathOf({ page: "settings", tab: "installation" }) },
                "Install one in Settings",
              ),
              ".",
            ),
            h(
              "ul",
              { class: "plain never-list" },
              absent.map((skill) =>
                h(
                  "li",
                  null,
                  h("a", { class: "mono", href: skillPath(skill.name) }, skill.name),
                  skill.extra ? h(Tag, null, "extra") : null,
                  h("span", { class: "meta" }, ` ${skill.kind}. ${skill.description}`),
                  used.has(skill.name)
                    ? h(
                        "span",
                        { class: "meta" },
                        ` Removed, ${plural(used.get(skill.name)?.loads ?? 0, "load")} before.`,
                      )
                    : null,
                ),
              ),
            ),
          ),
        ),
  );
}

/** How the roster is shown: ranked by kind, or as its table, the raw view. */
export type RosterForm = "list" | "table";

/**
 * The roster's page (J-166 S1): the summary line, the list or the table,
 * and where no load is recorded, why.
 */
export function RosterView(props: RosterViewProps): ComponentChild {
  return h(RosterViewHeld, props);
}

/** What the roster's page shows: the roster, the time it is read at, and the form it opens in. */
export interface RosterViewProps {
  readonly roster: RosterDocument;
  readonly at: Date;
  readonly form?: RosterForm;
}

/** The roster's page with the form the owner picks. */
function RosterViewHeld(props: RosterViewProps): ComponentChild {
  const [form, setForm] = useState<RosterForm>(props.form ?? "list");
  return rosterView(props, form, setForm);
}

RosterViewHeld.firstPaint = (props: RosterViewProps): ComponentChildren =>
  rosterView(props, props.form ?? "list", () => undefined);

function rosterView(
  props: RosterViewProps,
  form: RosterForm,
  setForm: (form: RosterForm) => void,
): ComponentChild {
  const { roster, at } = props;
  const uses = roster.use.available ? roster.use.items : [];
  const loads = uses.reduce((sum, entry) => sum + entry.loads, 0);
  const installed = roster.skills.filter((skill) => skill.installed);
  const used = new Set(uses.map((entry) => entry.skill));
  const agents = [...new Set(uses.flatMap((entry) => entry.agents))];
  return h(
    "div",
    { "data-view": "roster", "data-form": form },
    h(
      "p",
      { class: "summary" },
      h("span", { class: "title" }, plural(loads, "load")),
      h(
        "span",
        { class: "meta" },
        `${String(installed.filter((skill) => used.has(skill.name)).length)} of ${String(installed.length)} installed skills loaded`,
        agents.length === 1 ? `, all by ${agents[0] ?? ""}` : "",
      ),
    ),
    h(
      "p",
      { class: "meta" },
      "A load is what entered the agent's context, not what it followed. Read from the hooks' load facts.",
    ),
    roster.owed.length === 0
      ? null
      : h(
          "p",
          { class: "meta", "data-component": "OwedUse" },
          `Owed by the changes' trigger rows, against loaded: ${roster.owed
            .map((entry) => `${entry.skill} ${String(entry.loaded)} of ${String(entry.owed)}`)
            .join(", ")}.`,
        ),
    h(
      "div",
      { class: "list-tools" },
      h(FilterBar<RosterForm>, {
        label: "Show the roster",
        chips: [
          { key: "list", label: "By kind", count: installed.length },
          { key: "table", label: "Table", count: roster.skills.length },
        ],
        current: form,
        pick: setForm,
      }),
      h("a", { class: "meta", href: "/api/roster", target: "_blank", rel: "noopener" }, "JSON"),
    ),
    roster.use.available
      ? null
      : h(Empty, { title: "No skill load is recorded here." }, h("p", null, roster.use.reason)),
    form === "table"
      ? h(RosterTable, { skills: roster.skills, use: roster.use.available ? uses : null })
      : h(RosterGroups, { roster, at }),
  );
}

/**
 * One skill's page (J-166 S1): what it is for, its kind and step, its
 * loads, when it loaded first and last, its loads over the line, the
 * changes that loaded it, the files it was loaded from, and every load as
 * the raw view.
 */
export function SkillPage(props: {
  readonly document: SkillDocument;
  readonly at: Date;
}): ComponentChild {
  const { document, at } = props;
  const { skill, use } = document;
  const files = new Map<string, number>();
  for (const load of document.loads) files.set(load.file, (files.get(load.file) ?? 0) + 1);
  return h(
    "article",
    { "data-component": "SkillPage", "data-skill": skill.name },
    h(
      "nav",
      { class: "crumb" },
      h("a", { href: pathOf({ page: "practice" }) }, "Practice"),
      " / ",
      h("a", { href: pathOf({ page: "roster" }) }, "Roster"),
      " / ",
      skill.name,
    ),
    h("h1", { class: "mono" }, skill.name),
    h(
      "p",
      { class: "change-meta" },
      h(
        "span",
        { class: "fact-chip" },
        skill.slot === null ? skill.kind : `${skill.kind} · ${skill.slot}`,
      ),
      h(StateWord, { word: skill.installed ? "installed" : "not installed" }),
      skill.extra ? h(Tag, null, "extra") : null,
      h(
        "span",
        { class: "fact-chip" },
        skill.activation === "implicit"
          ? "loaded when its situation fits"
          : "loaded only when named",
      ),
    ),
    h("p", { class: "lede" }, skill.description),
    document.skillKind === null ? null : h("p", { class: "meta" }, document.skillKind.when),
    // The pages a whole read includes, as its recipe names them, one page per read (J-203 S1).
    document.wholeRead === undefined
      ? null
      : h(
          "p",
          { class: "meta", "data-whole-read": "" },
          `A whole read: SKILL.md, ${document.wholeRead.join(", ")}, each read alone.`,
        ),
    use === null
      ? h(Empty, { title: "No change has loaded it yet." })
      : [
          h(
            "p",
            { class: "summary" },
            h("span", { class: "title" }, plural(use.loads, "load")),
            h(
              "span",
              { class: "meta" },
              `in ${plural(use.changes, "change")}, ${String(use.whole)} whole and ${String(use.part)} in part · first `,
              h(When, { iso: use.firstAt, at }),
              ", last ",
              h(When, { iso: use.lastAt, at }),
            ),
          ),
          h(SectionHead, { title: "By step" }),
          h(
            "p",
            { class: "by-step" },
            h(StepCells, { byStep: use.byStep, own: skill.slot }),
            h("span", { class: "meta" }, countedText(use.byStep)),
            skill.slot === null
              ? null
              : h("span", { class: "meta" }, ` · ${String(use.outside)} off its step`),
          ),
        ],
    h(SectionHead, { title: "Changes", count: document.changes.length }),
    document.changes.length === 0
      ? h("p", { class: "meta" }, "No change loaded it.")
      : h(
          ListBox,
          { label: "The changes that loaded it" },
          h(
            "ul",
            { class: "rows" },
            document.changes.map((entry) =>
              h(
                "li",
                null,
                h(
                  "div",
                  { class: "row-top" },
                  h(RecordLink, {
                    kind: "change",
                    id: entry.change.id,
                    href: entry.change.address,
                    named: entry.change,
                  }),
                  h(
                    "span",
                    { class: "meta" },
                    `${plural(entry.loads, "load")} · ${entry.steps.join(", ")}`,
                  ),
                ),
              ),
            ),
          ),
        ),
    files.size === 0
      ? null
      : [
          h(SectionHead, { title: "Files", count: files.size }),
          h(
            "p",
            { class: "meta" },
            [...files].map(([file, count], index) => [
              index === 0 ? "" : " · ",
              h("span", { class: "mono" }, file),
              ` ${String(count)}`,
            ]),
          ),
        ],
    document.loads.length === 0
      ? null
      : h(
          ListBox,
          { label: "Every load" },
          h(
            Group,
            {
              id: `loads:${skill.name}`,
              title: "Every load, as the hooks saw it",
              count: document.loads.length,
              open: false,
              flat: false,
            },
            h(
              "ul",
              { class: "rows" },
              document.loads.map((load) => h(LoadRow, { load })),
            ),
          ),
        ),
    h(
      Group,
      {
        id: `json:${skill.name}`,
        title: "The skill's document",
        count: 1,
        open: false,
        flat: false,
      },
      h(JsonView, {
        text: JSON.stringify(document, null, 2),
        address: `/api/roster/${encodeURIComponent(skill.name)}`,
      }),
    ),
  );
}
