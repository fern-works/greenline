import { h, type ComponentChild } from "preact";
import type {
  ChangeListEntry,
  ChecksView,
  CodeTargetView,
  RecordCard,
  RunView,
  SearchKind,
  StripStep,
} from "../../../core/inspector/documents.ts";
import { pathOf } from "./addresses.ts";
import {
  Callout,
  CopyButton,
  Empty,
  Group,
  LinesDelta,
  ListBox,
  PartFailed,
  plural,
  RecordLink,
  SectionHead,
  stationWord,
  StateWord,
  Tag,
  when,
  When,
} from "./ui.ts";

/*
 * The change's components: its row in a list, the step strip in its four
 * forms, the record's facts, a step's section,
 * the checks held against the commits with their trailers, the folder's
 * reports and briefs, the lineage strip, and the change page, the spine
 * the others hang from.
 */

const changePath = (id: string, part: string | null = null): string =>
  pathOf({ page: "change", id, part });

/** The step and the action of a "next" line, `<step>: <action>`. */
function nextParts(next: string): { readonly step: string | null; readonly action: string } {
  const split = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(next);
  return split === null
    ? { step: null, action: next }
    : { step: split[1] ?? null, action: split[2] ?? "" };
}

/** The strip's three forms, one component: the rail on the change page, segments on a card, dots in a row. */
export type StripForm = "rail" | "segments" | "dots";

/**
 * How far a change has come along the line, in a few words: the step it is
 * at now, or how many steps are written where it is at none.
 * @param strip the steps of the line
 * @returns the words
 */
export function stripWords(strip: readonly StripStep[]): string {
  const now = strip.find((step) => step.current);
  const written = strip.filter((step) => step.state === "written").length;
  const counted = strip.filter(
    (step) => step.state !== "skipped" && step.state !== "in-plan",
  ).length;
  return now !== undefined ? `at ${now.step}` : `${written} of ${counted} written`;
}

/**
 * The step strip: every step of the line with its state in words, the step
 * reached marked, a skipped step shown as skipped; the same words in each form.
 */
export function StepStrip(props: {
  readonly strip: readonly StripStep[];
  readonly form: StripForm;
  /** The change whose sections the rail's stations open; none links nothing. */
  readonly change?: string;
}): ComponentChild {
  const reachedAt = props.strip.findIndex((step) => step.current);
  const label = "The steps of the line";
  if (props.form === "dots") {
    // A dot per step, the step now in the accent and named beside: seen without reading, each step's word on hover.
    const words = stripWords(props.strip);
    return h(
      "span",
      {
        class: "strip-dots",
        role: "img",
        "aria-label": `${label}: ${words}, ${props.strip
          .map(
            (step, index) =>
              `${step.step} ${stationWord(step, reachedAt === -1 || index <= reachedAt)}`,
          )
          .join(", ")}`,
        "data-component": "StepStrip",
      },
      h(
        "span",
        { class: "dots", "aria-hidden": "true" },
        props.strip.map((step, index) =>
          h("span", {
            class: "dot",
            "data-state": step.state,
            "data-current": step.current ? "yes" : undefined,
            "data-ahead": reachedAt === -1 || index <= reachedAt ? undefined : "yes",
            title: `${step.step}: ${stationWord(step, reachedAt === -1 || index <= reachedAt)}`,
          }),
        ),
      ),
      h("span", { class: "strip-now", "aria-hidden": "true" }, words),
    );
  }
  return h(
    "ol",
    {
      class: props.form === "rail" ? "strip-rail" : "strip-segments",
      "aria-label": label,
      "data-component": "StepStrip",
    },
    props.strip.map((step, index) => {
      const reached = reachedAt === -1 || index <= reachedAt;
      const word = stationWord(step, reached);
      const attributes = {
        "data-state": step.state,
        "data-current": step.current ? "yes" : undefined,
        "data-ahead": reached ? undefined : "yes",
        "aria-current": step.current ? ("step" as const) : undefined,
        title: `${step.step}: ${word}`,
      };
      if (props.form === "segments")
        return h(
          "li",
          attributes,
          h("span", { class: "name" }, step.step),
          h("span", { class: "state" }, word),
        );
      const name =
        props.change === undefined
          ? h("span", { class: "name" }, step.step)
          : h("a", { href: changePath(props.change, step.step) }, step.step);
      return h("li", attributes, name, h("span", { class: "state" }, word));
    }),
  );
}

/** Whether a change is over: done or dropped. */
export function finished(change: Pick<ChangeListEntry, "state">): boolean {
  return change.state === "done" || change.state === "dropped";
}

/**
 * A ticket's change by its ticket and the rest of its name: the name the
 * server gives, `Tracker t5 list issue`, read `T5 · List issue`.
 * @param name the change's name
 * @param ticket its ticket, `T5`
 * @returns the words
 */
function ticketName(name: string, ticket: string): string {
  const words = name.split(" ");
  const at = words.findIndex((word) => word.toLowerCase() === ticket.toLowerCase());
  const rest = at === -1 ? name : words.slice(at + 1).join(" ");
  return rest === "" ? ticket : `${ticket} · ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

/**
 * One change in a list, dense (J-166 S1): one line of 36 pixels at 13
 * with its mark, its name, a ticket's led by its ticket, and the agent's
 * sentence, then for an open change its steps as dots with the step now
 * named, for a finished one its size, its files and lines; its commits,
 * and when it closed, or for an open one its last activity, the absolute
 * time on hover; below tablet width the same facts as a card.
 */
export function ChangeRow(props: {
  readonly change: ChangeListEntry;
  /** The time the page is read at, which the row's time is said against. */
  readonly at: Date;
}): ComponentChild {
  const change = props.change;
  const sentence =
    change.problem !== null && change.why === null
      ? `The record does not parse: ${change.problem}`
      : (change.why ?? "The record states no reason.");
  const next = change.next === null ? null : nextParts(change.next);
  const over = finished(change);
  const time = over ? change.closedAt : change.lastAt;
  const name =
    change.ticket === null ? change.ref.name : ticketName(change.ref.name, change.ticket);
  return h(
    "li",
    {
      class: "change-row",
      "data-component": "ChangeRow",
      "data-state": change.state ?? "unreadable",
      title:
        next === null
          ? undefined
          : `Next${next.step === null ? "" : `, ${next.step}`}: ${next.action}`,
    },
    h("span", { class: "cell-state" }, h(StateWord, { word: change.state ?? "unreadable" })),
    h(
      "span",
      { class: "cell-main" },
      h(
        "a",
        { class: "title", href: changePath(change.id), "data-item": "", title: change.ref.name },
        h(RecordLink, {
          kind: "change",
          id: change.id,
          href: changePath(change.id),
          plain: true,
          named: { ...change.ref, name },
        }),
      ),
      h("span", { class: "sentence" }, sentence),
    ),
    h(
      "span",
      { class: "cell-strip" },
      over
        ? change.size === null
          ? h("span", { class: "meta" }, "size not read")
          : h(
              "span",
              { class: "row-size", "data-component": "RowSize" },
              h("span", { class: "meta" }, plural(change.size.files, "file")),
              h(LinesDelta, { added: change.size.added, removed: change.size.removed }),
            )
        : change.strip.length === 0
          ? null
          : h(StepStrip, { strip: change.strip, form: "dots" }),
    ),
    h(
      "span",
      { class: "cell-commits meta" },
      change.commits === null ? "" : plural(change.commits, "commit"),
    ),
    h(
      "span",
      { class: "cell-age meta" },
      time === null
        ? h("span", { title: `opened ${change.opened}` }, `opened ${change.opened}`)
        : h(When, { iso: time, at: props.at }),
    ),
  );
}

const CHOICE = {
  owner: "the owner named it",
  accepted: "the owner accepted the proposal",
  standing: "taken without waiting",
} as const;

/** One fact the record states; a field it does not state is not drawn (J-155 S2). */
function fact(label: string, value: ComponentChild, note?: string): ComponentChild {
  if (value === null || value === undefined || value === "") return null;
  return h(
    "div",
    null,
    h("dt", null, label),
    h("dd", null, value, note === undefined ? null : h("span", { class: "note" }, note)),
  );
}

/** The record's front matter as facts, only those it states; what the page's head shows is not repeated. */
export function RecordFacts(props: { readonly card: RecordCard }): ComponentChild {
  const card = props.card;
  const tags = (values: readonly string[] | null): ComponentChild =>
    values === null || values.length === 0
      ? null
      : h(
          "span",
          null,
          values.map((value) => h(Tag, null, value)),
        );
  const words = (value: string | null): ComponentChild =>
    value === null ? null : h("q", null, value);
  return h(
    "dl",
    { class: "facts", "data-component": "RecordFacts" },
    fact("Choice", card.choice, card.choice === null ? undefined : CHOICE[card.choice]),
    fact("Proposed", card.proposed),
    fact("Next", card.next),
    fact("Floors", tags(card.floors)),
    fact(
      "Raises",
      card.raises.length === 0
        ? null
        : h(
            "span",
            null,
            card.raises.map((raise) =>
              h("span", { class: "note" }, `from ${raise.from}: ${raise.reason}`),
            ),
          ),
    ),
    fact("Reviewed", card.reviewed),
    fact(
      "Plan and ticket",
      card.plan === null
        ? null
        : h(
            "a",
            { href: pathOf({ page: "plan", name: card.plan, part: card.ticket }) },
            // The plan by its name, never its folder's; the ticket by its own short label.
            h(RecordLink, {
              kind: "plan",
              id: card.plan,
              href: pathOf({ page: "plan", name: card.plan, part: null }),
              plain: true,
            }),
            card.ticket === null ? "" : `, ticket ${card.ticket}`,
          ),
    ),
    fact("Agents", card.agents === null ? null : String(card.agents)),
    fact("Rounds", card.rounds === null ? null : String(card.rounds)),
    fact("Starts", tags(card.starts)),
    fact("Landing", words(card.landing)),
    fact("Rebase", words(card.rebase)),
    fact("Stopped", words(card.stopped)),
    fact(
      "Refreshes",
      card.refreshes.length === 0
        ? null
        : h(
            "span",
            null,
            card.refreshes.map((refresh) =>
              h(
                "span",
                { class: "note" },
                `${refresh.pages}, by ${refresh.by}'s agent: ${refresh.cost}`,
              ),
            ),
          ),
    ),
    ...card.lines.map((line) => fact(line.field, line.text)),
  );
}

/**
 * The record's ground and agent (J-114 S5): where the change's work goes, a
 * branch in place or a worktree of its own with its path, the harness and the
 * model that do it as the record states them, and the owner's words for
 * throwing the work away, each drawn only where the record states it.
 */
export function GroundFacts(props: { readonly card: RecordCard }): ComponentChild {
  const { ground, agent, discard } = props.card;
  return h(
    "dl",
    { class: "facts", "data-component": "GroundFacts" },
    fact(
      "Ground",
      ground === null ? null : ground.kind === "branch" ? "branch" : h("code", null, ground.path),
      ground === null
        ? undefined
        : ground.kind === "branch"
          ? "a branch in this checkout"
          : "a worktree of its own",
    ),
    fact("Harness and model", agent === null ? null : h("code", null, agent)),
    fact("Discard", discard === null ? null : h("q", null, discard)),
  );
}

function duration(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const short = (hash: string | null): string => (hash === null ? "none" : hash.slice(0, 7));

/** One recorded run of a check: its outcome as a word, its command and where and when it ran. */
export function RunRow(props: {
  readonly run: RunView;
  readonly elsewhere?: boolean;
}): ComponentChild {
  const run = props.run;
  const meta = [
    run.step === null ? "" : `step ${run.step}`,
    when(run.startedAt),
    duration(run.durationMs),
    run.ended ?? "",
    props.elsewhere === true ? `started on ${short(run.commit)}` : "",
    `tree ${short(run.tree)}`,
  ].filter((part) => part !== "");
  return h(
    "li",
    { "data-component": "RunRow", "data-outcome": run.outcome, "data-anchor": run.file },
    h(StateWord, { word: run.outcome }),
    h("code", null, run.command.join(" ")),
    run.probe ? h(Tag, null, "probe") : null,
    h("span", { class: "meta" }, meta.join(" · ")),
    run.verdict === null ? null : h("span", { class: "meta" }, `Latest run: ${run.verdict}`),
  );
}

/** A commit of the change with the record-only commits on its same code folded under it (J-166 S1). */
export interface CommitGroup {
  readonly code: CodeTargetView;
  /** The later commits that left the code as it was, the records' own, the newest first. */
  readonly same: readonly CodeTargetView[];
}

/**
 * The change's commits, the newest first, each commit of code with the
 * commits after it that left its code as it was folded under it: a
 * record-only commit keeps the code's tree, `.greenline/` left out.
 * @param targets the change's commits and its working tree
 * @returns the groups, the newest first
 */
export function commitGroups(targets: readonly CodeTargetView[]): readonly CommitGroup[] {
  const time = (target: CodeTargetView): number =>
    target.date === null ? Number.POSITIVE_INFINITY : Date.parse(target.date);
  const oldest = [...targets].sort((a, b) => time(a) - time(b));
  const groups: { code: CodeTargetView; same: CodeTargetView[] }[] = [];
  for (const target of oldest) {
    const last = groups.at(-1);
    if (
      last !== undefined &&
      target.kind === "commit" &&
      last.code.kind === "commit" &&
      target.tree !== null &&
      target.tree === last.code.tree
    )
      last.same.unshift(target);
    else groups.push({ code: target, same: [] });
  }
  return groups.reverse();
}

/** One commit as a row: its short hash, its subject, its time, a mark where checks ran on its code, its trailers behind a toggle. */
export function CommitRow(props: {
  readonly target: CodeTargetView;
  /** The commits after it on the same code, folded under it. */
  readonly same?: readonly CodeTargetView[];
}): ComponentChild {
  const target = props.target;
  const same = props.same ?? [];
  const working = target.kind === "working-tree";
  const runs = [...target.runs, ...same.flatMap((entry) => entry.runs)];
  const failed = runs.some((run) => run.outcome === "failed");
  return h(
    "li",
    {
      class: "commit-row",
      "data-component": "CommitRow",
      "data-anchor": target.hash ?? "working-tree",
    },
    h(
      "div",
      { class: "row-top" },
      h(
        "span",
        { class: "mono hash", title: target.hash ?? undefined },
        working ? "working tree" : short(target.hash),
      ),
      h(
        "span",
        { class: "title" },
        working
          ? "The code as it stands, not yet committed"
          : (target.subject ?? h("span", { class: "unset" }, "subject unknown")),
      ),
      runs.length === 0 ? null : h(StateWord, { word: failed ? "failed" : "passed" }),
      target.date === null ? null : h("span", { class: "meta" }, when(target.date)),
      target.shared ? h(Tag, null, "shared with another change") : null,
    ),
    same.length === 0 && target.trailers.length === 0
      ? null
      : h(
          "details",
          { class: "commit-more" },
          h(
            "summary",
            { class: "meta" },
            [
              same.length === 0 ? "" : `${plural(same.length, "record commit")} on the same code`,
              target.trailers.length === 0 ? "" : plural(target.trailers.length, "trailer"),
            ]
              .filter((part) => part !== "")
              .join(" · "),
          ),
          same.length === 0
            ? null
            : h(
                "ul",
                { class: "plain commit-same" },
                same.map((entry) =>
                  h(
                    "li",
                    null,
                    h("span", { class: "mono", title: entry.hash ?? undefined }, short(entry.hash)),
                    " ",
                    entry.subject ?? "",
                  ),
                ),
              ),
          target.trailers.length === 0
            ? null
            : h(
                "span",
                { class: "trailers" },
                target.trailers.map((trailer) =>
                  h("span", { style: "display:block" }, `${trailer.key}: ${trailer.value}`),
                ),
              ),
        ),
  );
}

/** The change's commits, the newest first, the record-only ones folded into the commit whose code they share. */
export function CommitList(props: { readonly checks: ChecksView }): ComponentChild {
  const checks = props.checks;
  if (checks.commitsUnknown !== null)
    return h(Callout, null, `The change's commits cannot be listed: ${checks.commitsUnknown}.`);
  const groups = commitGroups(checks.targets);
  const commits = checks.targets.filter((target) => target.kind === "commit").length;
  return h(
    "section",
    { "data-component": "CommitList", "data-anchor": "commits", "aria-label": "The commits" },
    h(SectionHead, {
      title: "Commits",
      count: commits,
      aside:
        groups.length === checks.targets.length
          ? null
          : `${plural(groups.length, "commit")} of code, the record's own folded under them`,
    }),
    groups.length === 0
      ? h(Empty, { title: "The change has no commit yet." })
      : h(
          ListBox,
          { label: "The commits" },
          h(
            "ul",
            { class: "rows" },
            groups.map((group) => h(CommitRow, { target: group.code, same: group.same })),
          ),
        ),
  );
}

/**
 * A command as a short name: the tool and its last path, `npm test`,
 * `node logic.test.ts`, the whole command on hover and in the open row.
 * @param command the command's words
 * @returns the short name
 */
export function shortCommand(command: readonly string[]): string {
  const base = (word: string): string => word.split("/").at(-1) ?? word;
  const [tool, ...rest] = command;
  if (tool === undefined) return "";
  const named = rest
    .filter((word) => !word.startsWith("-"))
    .slice(0, 2)
    .map(base);
  return [base(tool), ...named].join(" ");
}

/** Every run of a change's checks, on its commits and elsewhere. */
function everyRun(checks: ChecksView): readonly RunView[] {
  return [...checks.targets.flatMap((target) => target.runs), ...checks.elsewhere];
}

/** One command with its runs, the latest first. */
export interface CommandRuns {
  readonly command: string;
  readonly latest: RunView;
  readonly runs: readonly RunView[];
}

/**
 * The change's checks by command (J-166 S1): each command once, with its
 * latest run, the most recent command first.
 * @param checks the check facts
 * @returns the commands
 */
export function commandRuns(checks: ChecksView): readonly CommandRuns[] {
  const by = new Map<string, RunView[]>();
  for (const run of everyRun(checks)) {
    const key = run.command.join(" ");
    by.set(key, [...(by.get(key) ?? []), run]);
  }
  return [...by]
    .map(([command, runs]) => {
      const sorted = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      const first = sorted[0];
      if (first === undefined) throw new Error("a command with no run");
      return { command, latest: sorted.find((run) => run.latest) ?? first, runs: sorted };
    })
    .sort((a, b) => Date.parse(b.latest.startedAt) - Date.parse(a.latest.startedAt));
}

/** The checks of a change counted by each command's latest run. */
export interface CheckCounts {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  /** How many latest runs saw the final code. */
  readonly onFinal: number;
}

/** The checks of a change counted by each command's latest run: how many passed, failed, and saw the final code. */
export function checkCounts(checks: ChecksView): CheckCounts {
  const latest = commandRuns(checks).map((entry) => entry.latest);
  return {
    total: latest.length,
    passed: latest.filter((run) => run.outcome === "passed").length,
    failed: latest.filter((run) => run.outcome === "failed").length,
    onFinal: latest.filter((run) => run.verdict === "ran on the final code").length,
  };
}

/**
 * The checks by command (J-166 S1): one row per command, its latest run's
 * outcome, its short name, how long it took and whether it saw the final
 * code; opened, the whole command with Copy and every run behind it.
 */
export function ChecksByCommand(props: {
  readonly checks: ChecksView;
  readonly sinceCheck: string | null;
}): ComponentChild {
  const checks = props.checks;
  const commands = commandRuns(checks);
  return h(
    "section",
    { "data-component": "ChecksByCommand", "data-anchor": "checks", "aria-label": "The checks" },
    h(SectionHead, {
      title: "Checks",
      count: commands.length,
      aside: props.sinceCheck ?? `${plural(checks.runs, "run")} in all`,
    }),
    commands.length === 0
      ? h(
          Empty,
          { title: "No check recorded." },
          h("p", null, "greenline check records each run in the change's folder."),
        )
      : h(
          ListBox,
          { label: "The checks by command" },
          commands.map((entry) =>
            h(
              Group,
              {
                id: `command:${entry.command}`,
                title: [
                  h(StateWord, { word: entry.latest.outcome }),
                  " ",
                  h(
                    "span",
                    { class: "mono", title: entry.command },
                    shortCommand(entry.latest.command),
                  ),
                ],
                count: entry.runs.length,
                quantity: [
                  entry.latest.verdict === null
                    ? null
                    : h(
                        "span",
                        { class: "meta" },
                        entry.latest.verdict === "ran on the final code"
                          ? "on the final code"
                          : entry.latest.verdict,
                      ),
                  entry.latest.durationMs === null
                    ? null
                    : h("span", { class: "meta" }, ` · ${duration(entry.latest.durationMs)}`),
                ],
                // A failing command stands open; any other opens by the group's rule.
                open: entry.latest.outcome === "failed" ? true : undefined,
                flat: false,
                attributes: { "data-outcome": entry.latest.outcome },
              },
              h(
                "p",
                { class: "command-line" },
                h("code", null, entry.command),
                h(CopyButton, { text: entry.command, title: "Copies the command" }),
              ),
              h(
                "ul",
                { class: "runs" },
                entry.runs.map((run) =>
                  h(RunRow, { run, elsewhere: checks.elsewhere.includes(run) }),
                ),
              ),
            ),
          ),
        ),
    checks.problems.map((problem) =>
      h(Callout, null, `${problem.file} cannot be read: ${problem.message}`),
    ),
  );
}

/** One step of the lineage: a discussion, a change, a visual or a subsystem. */
export interface LineageHop {
  readonly kind: "discussion" | "change" | "visual" | "subsystem" | "plan";
  /** Its words, or the record's id where `named` says the names hold it. */
  readonly label: string;
  readonly path: string | null;
  readonly here: boolean;
  /** The kind of record the names hold it under: the strip shows its name and keeps the id for the address. */
  readonly named?: SearchKind;
}

/** The lineage strip that heads a change or a discussion: where it came from and what it led to. */
export function LineageStrip(props: { readonly hops: readonly LineageHop[] }): ComponentChild {
  return h(
    "nav",
    { class: "lineage", "aria-label": "Lineage", "data-component": "LineageStrip" },
    props.hops.flatMap((hop, index) => {
      const body = [
        h("span", { class: "kind" }, hop.kind),
        hop.named === undefined
          ? hop.label
          : h(RecordLink, { kind: hop.named, id: hop.label, href: hop.path ?? "", plain: true }),
      ];
      const node =
        hop.path === null || hop.here
          ? h(
              "span",
              {
                class: hop.here ? "hop here" : "hop",
                "aria-current": hop.here ? "page" : undefined,
              },
              ...body,
            )
          : h("a", { class: "hop", href: hop.path }, ...body);
      const previous = props.hops[index - 1];
      return previous === undefined || previous.kind === hop.kind
        ? [node]
        : [h("span", { class: "arrow", "aria-hidden": "true" }, "→"), node];
    }),
  );
}

/** The changes list's empty and refused states. */
export function ChangesEmpty(props: { readonly unavailable: string | null }): ComponentChild {
  return props.unavailable === null
    ? h(
        Empty,
        { title: "No change recorded yet." },
        h(
          "p",
          null,
          "The practice opens a record in .greenline/ledger/ for each change it makes, and each one is listed here.",
        ),
      )
    : h(PartFailed, { reads: "the ledger's changes", reason: props.unavailable });
}
