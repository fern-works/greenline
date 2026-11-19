import { h, type ComponentChild, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  InstalledFileDocument,
  RosterDocument,
  SettingsDocument,
} from "../../../core/inspector/documents.ts";
import type { DiffLine } from "../../../core/inspect.ts";
import { pathOf } from "./addresses.ts";
import { post, Refused, type SavePayload } from "./client.ts";
import { ArtefactFold, Callout, Delta, Group, kindGroups, ListBox, StateWord, Tag } from "./ui.ts";

/*
 * The settings' components (J-166 S1): the draft every editor holds, the
 * installation as a form with its pending changes and its sync, and the
 * installed files as a tree against Git HEAD. Every save carries the
 * revision the page read; a stale one is refused and the draft stays on
 * the page. Saving and syncing are separate actions. The decisions book
 * and the house rulings are read and edited in Knowledge.
 */

/** What a save reports back to the view: the words to show, and whether to read the settings again. */
export type Saved = (message: string, reread: boolean) => void;

export async function save(
  address: string,
  payload: SavePayload,
  saved: Saved,
  done: string,
): Promise<boolean> {
  try {
    const answer = await post(address, payload);
    if (!answer.outcome.ok) {
      saved(answer.outcome.diagnostics.map((note) => note.message).join("\n"), true);
      return false;
    }
    saved(done, true);
    // A save that changed nothing wrote nothing; the next read brings nothing new to take.
    return answer.outcome.effects.length > 0;
  } catch (error) {
    // A refused save keeps the draft: the view is not read again, so nothing typed is lost.
    const stale = error instanceof Refused && error.status === 409;
    saved(
      error instanceof Error
        ? stale
          ? `${error.message} Your draft is kept.`
          : error.message
        : "The save failed.",
      false,
    );
    return false;
  }
}

/** A draft and what it can do: its value, its edit, the revision it began from, and the two ways it takes the file as read. */
export interface Draft<T> {
  readonly draft: T;
  readonly edit: (next: T) => void;
  readonly base: string;
  /** Take the settings as last read, discarding the draft. */
  readonly discard: () => void;
  /** The draft named was just saved or synced: the next read's settings replace it while it is still that draft. */
  readonly saved: (sent: T) => void;
}

/**
 * A draft held against the settings it began from. Each read of the
 * settings (`read`, a new object on every read) brings what the files and
 * the installation now hold. When that differs from where the draft began,
 * the draft takes it if it is untouched, if it equals it, or if it is still
 * the draft just saved; an edited draft keeps its own revision, so its save
 * is refused as stale and nothing typed is lost until the owner discards it.
 * A save's mark lasts for the next read only.
 */
export function useDraft<T>(value: T, revision: string, read: SettingsDocument): Draft<T> {
  const [original, setOriginal] = useState(value);
  const [draft, setDraft] = useState(value);
  const [base, setBase] = useState(revision);
  const sent = useRef<{ readonly draft: T } | null>(null);
  const same = (a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);
  const adopt = (): void => {
    sent.current = null;
    setOriginal(value);
    setDraft(value);
    setBase(revision);
  };
  useEffect(() => {
    const fresh = revision !== base || !same(value, original);
    const justSaved = sent.current !== null && same(draft, sent.current.draft);
    sent.current = null;
    if (fresh && (justSaved || same(draft, original) || same(draft, value))) adopt();
  }, [read]);
  return {
    draft,
    edit: setDraft,
    base,
    discard: adopt,
    saved: (draftSent) => {
      sent.current = { draft: draftSent };
    },
  };
}

function toggled(list: readonly string[], value: string, on: boolean): readonly string[] {
  return on
    ? [...list.filter((entry) => entry !== value), value]
    : list.filter((entry) => entry !== value);
}

function Choice(props: {
  readonly label: ComponentChild;
  readonly checked: boolean;
  readonly set: (on: boolean) => void;
  readonly name: string;
}): ComponentChild {
  return h(
    "label",
    null,
    h("input", {
      type: "checkbox",
      name: props.name,
      checked: props.checked,
      onChange: (event: Event) => {
        if (event.currentTarget instanceof HTMLInputElement) props.set(event.currentTarget.checked);
      },
    }),
    props.label,
  );
}

/** The installation's choices as a draft holds them. */
interface Installation {
  readonly targets: readonly string[];
  readonly proceed: string;
  readonly trials: readonly string[];
  readonly installed: readonly string[];
}

/** The harnesses the installation can write for, by their words. */
const HARNESSES: readonly (readonly [string, string])[] = [
  ["claude-code", "Claude Code"],
  ["codex", "Codex"],
];

/**
 * What a draft of the installation changes against the settings as read,
 * each in a few words: `+ tdd`, `− prose`, `proceed regular`.
 * @param before the installation as read
 * @param after the draft
 * @returns the changes
 */
export function pendingChanges(before: Installation, after: Installation): readonly string[] {
  const added = (from: readonly string[], to: readonly string[]): readonly string[] =>
    to.filter((entry) => !from.includes(entry));
  const words = (name: string): string => HARNESSES.find(([key]) => key === name)?.[1] ?? name;
  return [
    ...added(before.targets, after.targets).map((name) => `+ ${words(name)}`),
    ...added(after.targets, before.targets).map((name) => `− ${words(name)}`),
    ...(before.proceed === after.proceed ? [] : [`proceed ${after.proceed}`]),
    ...added(before.trials, after.trials).map((name) => `+ trial ${name}`),
    ...added(after.trials, before.trials).map((name) => `− trial ${name}`),
    ...added(before.installed, after.installed).map((name) => `+ ${name}`),
    ...added(after.installed, before.installed).map((name) => `− ${name}`),
  ];
}

/**
 * The installation as a form (J-166 S1): the sync banner while the
 * installed files differ from the settings, the harnesses, proceeding
 * without waiting, the trials, the skills grouped by kind as the roster
 * groups them with each one's sentence and loads, and the connectors;
 * under them a sticky bar naming the unsaved changes, what saving writes,
 * and that the sync is separate.
 */
export function InstallationForm(props: InstallationProps): ComponentChild {
  return h(InstallationFormHeld, props);
}

/** What the installation's form shows and how it saves. */
export interface InstallationProps {
  readonly settings: SettingsDocument;
  readonly saved: Saved;
  /** The roster, whose kinds, sentences and loads group the skills; null where it was not read. */
  readonly roster: RosterDocument | null;
  /** How many installed files greenline status finds out of step with the settings; null where it was not read. */
  readonly outOfSync: number | null;
  /** A specimen in the catalogue: it shows the form, and neither saves nor syncs. */
  readonly specimen?: boolean;
}

/** The form with the draft it holds. */
function InstallationFormHeld(props: InstallationProps): ComponentChild {
  const settings = props.settings;
  const manifest = settings.manifest;
  const original: Installation = {
    targets: manifest.targets,
    proceed: manifest.proceed,
    trials: manifest.trials,
    installed: settings.skills.filter((skill) => skill.installed).map((skill) => skill.name),
  };
  const draft = useDraft<Installation>(original, settings.revisions.manifest, settings);
  const [busy, setBusy] = useState(false);
  return installationForm(props, original, draft, busy, setBusy);
}

InstallationFormHeld.firstPaint = (props: InstallationProps): ComponentChildren => {
  const manifest = props.settings.manifest;
  const original: Installation = {
    targets: manifest.targets,
    proceed: manifest.proceed,
    trials: manifest.trials,
    installed: props.settings.skills.filter((skill) => skill.installed).map((skill) => skill.name),
  };
  return installationForm(
    props,
    original,
    {
      draft: original,
      edit: () => undefined,
      base: props.settings.revisions.manifest,
      discard: () => undefined,
      saved: () => undefined,
    },
    false,
    () => undefined,
  );
};

function installationForm(
  props: InstallationProps,
  original: Installation,
  holder: Draft<Installation>,
  busy: boolean,
  setBusy: (busy: boolean) => void,
): ComponentChild {
  const settings = props.settings;
  const { draft, edit: setDraft, base, discard, saved } = holder;
  const { targets, proceed, trials, installed } = draft;
  const garden = settings.manifest.connectors.garden;
  const idle = busy || props.specimen === true;
  const pending = pendingChanges(original, draft);
  const stale = base !== settings.revisions.manifest;
  const submit = (): void => {
    const include = settings.skills
      .filter((skill) => skill.extra && installed.includes(skill.name))
      .map((skill) => skill.name);
    const exclude = settings.skills
      .filter((skill) => !skill.extra && !installed.includes(skill.name))
      .map((skill) => skill.name);
    setBusy(true);
    void save(
      "/api/manifest",
      { expectedRevision: base, targets, skills: { include, exclude }, proceed, trials },
      props.saved,
      "Saved .greenline/manifest.json. Installation sync is a separate action.",
    )
      .then((wrote) => {
        if (wrote) saved(draft);
      })
      .finally(() => setBusy(false));
  };
  const sync = (): void => {
    setBusy(true);
    // A sync changes what is installed, not the revision: the next read's choices replace an unedited draft.
    void save("/api/sync", { sync: true }, props.saved, "Installation synchronized.")
      .then((wrote) => {
        if (wrote) saved(draft);
      })
      .finally(() => setBusy(false));
  };
  const roster = props.roster;
  const loads = new Map(
    (roster?.use.available === true ? roster.use.items : []).map((use) => [use.skill, use.loads]),
  );
  const known = new Map((roster?.skills ?? []).map((skill) => [skill.name, skill]));
  const kindOf = (name: string): string => known.get(name)?.kind ?? "other";
  const kinds = kindGroups(
    roster?.kinds ?? [],
    settings.skills.map((skill) => kindOf(skill.name)),
  ).map(([kind, title]) => [kind, kind === "other" ? "Other skills" : title] as const);
  return h(
    "section",
    { class: "installation-form", "data-component": "InstallationForm", id: "sync" },
    props.outOfSync === null || props.outOfSync === 0
      ? null
      : h(
          "div",
          { class: "sync-banner", "data-component": "SyncBanner", role: "status" },
          h(
            "p",
            null,
            h(StateWord, { word: "error" }),
            ` The installed files do not match these settings: ${String(props.outOfSync)} ${props.outOfSync === 1 ? "file" : "files"}.`,
          ),
          h(
            "p",
            { class: "meta" },
            "Syncing rewrites the generated block and the installed skills from the settings saved; your own regions stay.",
          ),
          h(
            "button",
            { type: "button", class: "primary", disabled: idle, onClick: sync },
            "Sync installation",
          ),
        ),
    h(
      "div",
      { class: "form-rows" },
      h(
        "div",
        { class: "form-row" },
        h("span", { class: "form-label" }, "Harnesses"),
        h(
          "div",
          { class: "choices" },
          HARNESSES.map(([name, label]) =>
            h(Choice, {
              name,
              label,
              checked: targets.includes(name),
              set: (on) => setDraft({ ...draft, targets: toggled(targets, name, on) }),
            }),
          ),
        ),
      ),
      h(
        "div",
        { class: "form-row" },
        h("span", { class: "form-label" }, "Proceed without waiting"),
        h(
          "div",
          null,
          h(
            "select",
            {
              "aria-label": "Proceed without waiting",
              value: proceed,
              onChange: (event: Event) => {
                if (event.currentTarget instanceof HTMLSelectElement)
                  setDraft({ ...draft, proceed: event.currentTarget.value });
              },
            },
            settings.settings.proceed.map((value) => h("option", { value }, value)),
          ),
          h(
            "p",
            { class: "meta" },
            "At a mode, the agent proceeds without waiting for that mode and every faster one, and waits for the slower. At none it waits for every mode.",
          ),
        ),
      ),
      h(
        "div",
        { class: "form-row" },
        h("span", { class: "form-label" }, "Trials"),
        settings.settings.trials.length === 0
          ? h("p", { class: "meta" }, "The installation holds no trial.")
          : h(
              "div",
              { class: "choices" },
              settings.settings.trials.map((trial) =>
                h(Choice, {
                  name: `trial-${trial}`,
                  label: trial,
                  checked: trials.includes(trial),
                  set: (on) => setDraft({ ...draft, trials: toggled(trials, trial, on) }),
                }),
              ),
            ),
      ),
      h(
        "div",
        { class: "form-row" },
        h("span", { class: "form-label" }, "Skills"),
        h(
          "div",
          { class: "skill-choices" },
          kinds.map(([kind, title]) => {
            const own = settings.skills.filter((skill) => kindOf(skill.name) === kind);
            if (own.length === 0) return null;
            const chosen = own.filter((skill) => installed.includes(skill.name)).length;
            return h(
              Group,
              {
                id: `install:${kind}`,
                title,
                count: own.length,
                quantity: `${String(chosen)} of ${String(own.length)} installed`,
                open: false,
                flat: false,
              },
              h(
                "ul",
                { class: "rows skill-picks" },
                [...own]
                  .sort(
                    (a, b) =>
                      (loads.get(b.name) ?? 0) - (loads.get(a.name) ?? 0) ||
                      a.name.localeCompare(b.name),
                  )
                  .map((skill) =>
                    h(
                      "li",
                      null,
                      h(Choice, {
                        name: `skill-${skill.name}`,
                        label: [
                          h("span", { class: "mono" }, skill.name),
                          skill.extra ? h(Tag, null, "extra") : null,
                        ],
                        checked: installed.includes(skill.name),
                        set: (on) =>
                          setDraft({ ...draft, installed: toggled(installed, skill.name, on) }),
                      }),
                      h("span", { class: "meta" }, known.get(skill.name)?.description ?? ""),
                      h(
                        "a",
                        { class: "meta", href: pathOf({ page: "roster", skill: skill.name }) },
                        loads.has(skill.name)
                          ? `${String(loads.get(skill.name))} loads`
                          : "never loaded",
                      ),
                    ),
                  ),
              ),
            );
          }),
        ),
      ),
      h(
        "div",
        { class: "form-row" },
        h("span", { class: "form-label" }, "Connectors"),
        h(
          "div",
          null,
          h(
            "p",
            { class: "next-line" },
            garden === undefined
              ? "No connector is enabled: the practice consults no service."
              : `garden is enabled, at ${garden.endpoint}.`,
          ),
          h(
            "p",
            { class: "meta" },
            "Connectors are enabled and disabled with greenline connectors; credentials stay in the process environment and are never saved here.",
          ),
        ),
      ),
    ),
    h(
      "div",
      {
        class: "pending-bar",
        "data-component": "PendingBar",
        "data-pending": pending.length > 0 ? "yes" : "no",
      },
      h(
        "p",
        null,
        pending.length === 0
          ? h("span", { class: "meta" }, "No unsaved change.")
          : [h("b", null, `${String(pending.length)} unsaved: `), pending.join(", "), ". "],
        h(
          "span",
          { class: "meta" },
          " Saving writes .greenline/manifest.json; the sync is separate.",
        ),
      ),
      stale
        ? h(
            "span",
            { class: "meta" },
            "The settings changed since this draft began, so its save is refused; your draft is kept.",
          )
        : null,
      h(
        "span",
        { class: "actions" },
        h(
          "button",
          {
            class: "primary",
            type: "button",
            disabled: idle || pending.length === 0,
            onClick: submit,
          },
          "Save settings",
        ),
        h(
          "button",
          {
            type: "button",
            class: "ghost",
            disabled: pending.length === 0 && !stale,
            onClick: discard,
          },
          stale ? "Discard the draft" : "Discard",
        ),
        props.outOfSync === null || props.outOfSync === 0
          ? h("button", { type: "button", disabled: idle, onClick: sync }, "Sync installation")
          : null,
      ),
    ),
  );
}

/** A file's lines against Git HEAD: what was added and removed, each line marked in words as well as tone. */
export function FileDiff(props: {
  readonly path: string;
  readonly diff: readonly DiffLine[];
}): ComponentChild {
  const added = props.diff.filter((line) => line.kind === "add").length;
  const removed = props.diff.filter((line) => line.kind === "del").length;
  return h(ArtefactFold, {
    id: props.path,
    kind: "installed diff",
    component: "FileDiff",
    open: false,
    address: null,
    closed: null,
    head: [h("span", { class: "mono title" }, props.path), h(Delta, { added, removed })],
    held: {
      read: () =>
        h(
          "pre",
          { class: "diff-lines" },
          props.diff.map((line) =>
            h(
              "span",
              { class: `diff-line ${line.kind}`, "data-kind": line.kind },
              h(
                "span",
                { class: "sign" },
                line.kind === "add" ? "+ " : line.kind === "del" ? "− " : "  ",
              ),
              line.line,
              "\n",
            ),
          ),
        ),
      source: props.diff
        .map((line) => `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.line}`)
        .join("\n"),
      json: { text: JSON.stringify(props, null, 2), address: "/api/settings" },
    },
  });
}

/** A size in bytes in the reader's words. */
function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The installed files as a tree (J-166 S1): each folder a group with its
 * count and size, a folder holding a changed file standing open, each file
 * a fold that opens its text, a changed one marked and opening its lines
 * against Git HEAD; the files that cannot be read named after.
 */
export function InstalledFiles(props: { readonly settings: SettingsDocument }): ComponentChild {
  const settings = props.settings;
  const changes = settings.changes;
  const changed = new Map(changes.files.map((file) => [file.path, file.diff]));
  const total = settings.files.reduce((sum, folder) => sum + folder.files.length, 0);
  return h(
    "div",
    { "data-component": "InstalledFiles" },
    h(
      "p",
      { class: "summary" },
      h("span", { class: "title" }, `${String(total)} installed ${total === 1 ? "file" : "files"}`),
      h(
        "span",
        { class: "meta" },
        changes.baseline === null
          ? "no readable Git commit to compare with"
          : changed.size === 0
            ? `none changed since ${changes.baseline.slice(0, 7)}`
            : `${String(changed.size)} changed since ${changes.baseline.slice(0, 7)}`,
      ),
    ),
    changes.unavailable.length === 0
      ? null
      : h(Callout, null, `Unavailable: ${changes.unavailable.join(", ")}`),
    h(
      ListBox,
      { label: "The installed files by folder" },
      settings.files.map((folder) => {
        const paths = folder.files.map((file) =>
          folder.folder === "." ? file.name : `${folder.folder}/${file.name}`,
        );
        const touched = paths.filter((path) => changed.has(path)).length;
        return h(
          Group,
          {
            id: `installed:${folder.folder}`,
            title: h(
              "span",
              { class: "mono" },
              folder.folder === "." ? "the root" : `${folder.folder}/`,
            ),
            count: folder.files.length,
            tally: touched === 0 ? [] : [["changed", touched]],
            quantity: sizeWords(folder.files.reduce((sum, file) => sum + file.size, 0)),
            open: touched > 0 ? true : undefined,
            flat: false,
            component: "FileTree",
          },
          folder.files.map((file, index) => {
            const path = paths[index] ?? file.name;
            const diff = changed.get(path);
            return diff === undefined
              ? h(InstalledFile, { key: path, path, size: file.size, error: null })
              : h(FileDiff, { key: path, path, diff });
          }),
        );
      }),
    ),
    settings.unreadable.length === 0
      ? null
      : h(
          Group,
          {
            id: "installed:unreadable",
            title: "Cannot be read",
            count: settings.unreadable.length,
            tally: [["unreadable", settings.unreadable.length]],
            flat: false,
          },
          settings.unreadable.map((file) =>
            h(InstalledFile, { key: file.path, path: file.path, size: null, error: file.error }),
          ),
        ),
  );
}

/**
 * One installed file by its name and size (J-164 S1, an artefact fold): its
 * text read from its own address when the owner opens it (J-154 S3), as it
 * stands, as numbered Source, or as its document's JSON.
 */
function InstalledFile(props: {
  readonly path: string;
  readonly size: number | null;
  readonly error: string | null;
}): ComponentChild {
  const file = props;
  return h(ArtefactFold<"installed-file">, {
    id: file.path,
    kind: "installed-file",
    component: "InstalledFile",
    open: false,
    address: null,
    closed: null,
    head: [
      h("span", { class: "mono" }, file.path),
      file.size === null ? null : h("span", { class: "meta" }, `${String(file.size)} bytes`),
      file.error === null ? null : h(StateWord, { word: "unreadable" }),
    ],
    document: {
      address: `/api/practice/files/${file.path.split("/").map(encodeURIComponent).join("/")}`,
      kind: "installed-file",
      reads: "this installed file",
      read: (document: InstalledFileDocument) =>
        h("pre", null, document.problem ?? document.content ?? ""),
      source: (document: InstalledFileDocument) => document.content,
    },
  });
}
