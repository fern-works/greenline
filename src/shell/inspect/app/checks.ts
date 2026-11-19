import { h, type ComponentChild } from "preact";
import type {
  DiagnosticEntry,
  HealthGroup,
  PracticeDocument,
} from "../../../core/inspector/documents.ts";
import type { ReceiptRequestView } from "../../../core/inspect.ts";
import { pathOf } from "./addresses.ts";
import {
  ArtefactFold,
  Callout,
  Empty,
  Group,
  ListBox,
  NamedText,
  plural,
  StateWord,
  Tag,
  when,
} from "./ui.ts";

/*
 * The checks' components: a diagnostic as status reports it, the declared
 * checks with the hooks that run them, and the receipts of each
 * consultation, body-free.
 */

/** One diagnostic: its severity as a word, its message, its code and its path. */
export function DiagnosticRow(props: { readonly diagnostic: DiagnosticEntry }): ComponentChild {
  const diagnostic = props.diagnostic;
  return h(
    "li",
    { "data-component": "DiagnosticRow", "data-severity": diagnostic.severity },
    h(
      "div",
      { class: "row-top" },
      h(StateWord, { word: diagnostic.severity }),
      h("span", null, h(NamedText, { text: diagnostic.message })),
    ),
    h(
      "div",
      { class: "row-meta" },
      h("span", { class: "mono" }, diagnostic.code),
      diagnostic.path === undefined ? null : h("span", { class: "mono" }, diagnostic.path),
    ),
  );
}

/**
 * The diagnostics by the groups the server reads (J-165 S1), errors first:
 * each group its first message, its count and its code, its findings folded
 * under it, so a hundred of one finding read as one line.
 */
export function HealthGroups(props: { readonly groups: readonly HealthGroup[] }): ComponentChild {
  if (props.groups.length === 0)
    return h(
      Empty,
      { title: "No diagnostic findings." },
      h("p", null, "greenline status reports nothing to correct in this repository."),
    );
  return h(
    "div",
    { "data-component": "HealthGroups" },
    h(
      ListBox,
      { label: "The findings by kind" },
      props.groups.map((group) => {
        // Each finding as status reported it: the group's code and kind, its own message or the group's (J-232 S1).
        const held = group.findings.map((finding): DiagnosticEntry => {
          const entry: DiagnosticEntry = {
            code: group.code,
            severity: group.kind,
            message: finding.message ?? group.text,
          };
          return finding.path === undefined ? entry : { ...entry, path: finding.path };
        });
        return h(
          Group,
          {
            id: `health:${group.kind}:${group.code}`,
            title: [h(StateWord, { word: group.kind }), " ", h(NamedText, { text: group.text })],
            count: group.count,
            quantity: h("span", { class: "mono meta" }, group.code),
            // One finding is a group too: its code and its file stay behind the fold.
            flat: false,
            anchor: group.code,
            attributes: { "data-severity": group.kind },
          },
          h(HealthAct, { group }),
          h(
            "ul",
            { class: "rows" },
            held.map((diagnostic) => h(DiagnosticRow, { diagnostic })),
          ),
        );
      }),
    ),
  );
}

/** The codes whose findings a sync of the installation clears. */
const SYNC_CODES: ReadonlySet<string> = new Set(["GL0110"]);

/** The act that clears a group's findings (J-166 S1): the sync for an installation out of step, else the page its finding names. */
function HealthAct(props: { readonly group: HealthGroup }): ComponentChild {
  const { group } = props;
  if (SYNC_CODES.has(group.code))
    return h(
      "p",
      { class: "health-act", "data-component": "HealthAct" },
      "Syncing rewrites the installed skills and the generated block from the settings; your own regions stay. ",
      h(
        "a",
        { href: `${pathOf({ page: "settings", tab: "installation" })}#sync` },
        "Sync the installation in Settings",
      ),
    );
  if (group.address !== null)
    return h(
      "p",
      { class: "health-act", "data-component": "HealthAct" },
      h("a", { href: group.address }, "Open what it names"),
      ", where it is corrected; greenline status names each finding with its file.",
    );
  return h(
    "p",
    { class: "health-act meta", "data-component": "HealthAct" },
    "greenline status in a terminal names each finding with its file and what corrects it.",
  );
}

/** The declared checks and the hooks, as the manifest declares them and the clone registers them. */
export function DeclaredChecks(props: {
  readonly hooks: PracticeDocument["hooks"];
}): ComponentChild {
  const hooks = props.hooks;
  if (hooks === null)
    return h(
      Callout,
      { quiet: true },
      "The manifest cannot be read, so its checks and hooks are not shown.",
    );
  const git = hooks.git;
  const registration = ((): string => {
    switch (git.state) {
      case "config":
        return "registered as config-based hooks";
      case "hooks-path":
        return "registered through core.hooksPath";
      case "off":
        return "off: the manifest turns them off";
      case "absent":
        return `absent: ${git.reason}`;
    }
  })();
  return h(
    "div",
    { "data-component": "DeclaredChecks" },
    hooks.checks.length === 0
      ? h(
          "p",
          { class: "meta" },
          "No checks declared. Declare each in a change's plan with greenline check --declare -- <command>.",
        )
      : h(
          "div",
          { class: "table-wrap" },
          h(
            "table",
            null,
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, "Name"),
                h("th", null, "Command"),
                h("th", null, "Directory"),
              ),
            ),
            h(
              "tbody",
              null,
              hooks.checks.map((check) =>
                h(
                  "tr",
                  null,
                  h("td", { class: "mono" }, check.name),
                  h("td", { class: "mono" }, check.command),
                  h("td", { class: "mono" }, check.dir),
                ),
              ),
            ),
          ),
        ),
    h("h3", null, "Hooks"),
    h(
      "dl",
      { class: "facts" },
      h(
        "div",
        null,
        h("dt", null, "Git hooks"),
        h(
          "dd",
          null,
          h(StateWord, {
            word: git.state === "config" || git.state === "hooks-path" ? "registered" : git.state,
          }),
          " ",
          registration,
          git.state === "absent" ? h("span", { class: "note mono" }, git.line) : null,
        ),
      ),
      h(
        "div",
        null,
        h("dt", null, "hooks.git"),
        h("dd", { class: "mono" }, String(hooks.settings.git)),
      ),
      h(
        "div",
        null,
        h("dt", null, "hooks.adapters"),
        h("dd", { class: "mono" }, String(hooks.settings.adapters)),
      ),
      h(
        "div",
        null,
        h("dt", null, "Harness adapters"),
        h(
          "dd",
          null,
          hooks.adapters.length === 0
            ? "none written"
            : hooks.adapters.map((name) => h(Tag, null, name)),
        ),
      ),
    ),
  );
}

/** Each consultation's receipt: its source and binding, and every call's operation, outcome and units, never a body. */
export function ReceiptTable(props: {
  readonly receipts: readonly ReceiptRequestView[];
  readonly problems: readonly { readonly file: string; readonly message: string }[];
  readonly connector: boolean;
}): ComponentChild {
  return h(
    "div",
    { "data-component": "ReceiptTable" },
    props.problems.map((problem) =>
      h(Callout, null, `Not read: ${problem.file}: ${problem.message}.`),
    ),
    props.receipts.length === 0 && props.problems.length === 0
      ? h(
          Empty,
          { title: "No consultation recorded." },
          h(
            "p",
            null,
            props.connector
              ? "None has been made yet."
              : "With no connector enabled, none is made.",
          ),
        )
      : null,
    props.receipts.map((request) =>
      h(ArtefactFold, {
        id: request.id,
        kind: "receipt",
        component: "ReceiptFold",
        open: true,
        address: null,
        closed: null,
        head: [
          h("span", { class: "title" }, request.source),
          h("span", { class: "meta" }, request.binding),
        ],
        held: {
          read: () => receiptBody(request),
          source: null,
          json: { text: JSON.stringify(request, null, 2), address: "/api/practice" },
        },
      }),
    ),
  );
}

/** A receipt's request line and its calls, never a body. */
function receiptBody(request: ReceiptRequestView): ComponentChild {
  return h(
    "div",
    null,
    h(
      "p",
      { class: "meta" },
      `Request ${request.id} · created ${when(request.createdAt)} · for ${request.owner}`,
      request.advisories === 0
        ? ""
        : ` · ${plural(request.advisories, "read-only consultation")} dispatched under it`,
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ["Call", "Operation", "Outcome", "Received whole", "Listed", "Failure"].map((label) =>
              h("th", null, label),
            ),
          ),
        ),
        h(
          "tbody",
          null,
          request.calls.length === 0
            ? h("tr", null, h("td", { colSpan: 6 }, "No call recorded yet."))
            : request.calls.map((call) =>
                h(
                  "tr",
                  null,
                  h("td", null, String(call.sequence)),
                  h("td", null, call.operation),
                  h("td", null, call.outcome),
                  h(
                    "td",
                    null,
                    call.full.length === 0
                      ? "none"
                      : call.full.map((unit) =>
                          h(
                            "div",
                            null,
                            unit.id,
                            " ",
                            h("span", { class: "mono" }, unit.revision.slice(0, 12)),
                          ),
                        ),
                  ),
                  h(
                    "td",
                    null,
                    call.metadata.length === 0
                      ? "none"
                      : call.metadata.map((unit) => h("div", null, unit)),
                  ),
                  h("td", null, call.error ?? ""),
                ),
              ),
        ),
      ),
    ),
  );
}
