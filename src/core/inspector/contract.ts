import type { Result } from "../../commons/result.ts";
import { z } from "zod";
import {
  contractFailure,
  contractOk,
  issuesFrom,
  type ContractParseFailed,
  type JsonValue,
} from "../contract.ts";
import type {
  ContractEntry,
  RemainingDocument,
  GeneratedFile,
  InspectSchema,
  InspectorDocument,
} from "./documents.ts";
import { DOCUMENT_SCHEMAS } from "./schemas.ts";

/*
 * The inspector's contract (docs/SPEC.md, "The inspector's contract"): one
 * typed JSON document per artefact kind, each opening with the contract's
 * version, its kind and when it was read with the revision of the state it
 * read, served by `greenline inspect` under `/api/`. Every record a
 * document holds carries its reference, a name with its address; every
 * summary the inspector composes carries its source; and a change, a step,
 * an outcome, a picture and a note each take one vocabulary of states.
 * Version 2 (J-154 S3) replaced version 1 with no converter. The
 * version rule: a field removed, renamed or retyped, or a kind removed,
 * moves the version; a field or a kind added does not. The client app and
 * the CLI ship in one package, so the app reads exactly this version and
 * refuses another by name. J-165 S1 grew it with the version unchanged, on
 * the operator's word: the change document became a light head whose parts
 * moved to addresses of their own, the settings' one revision became one
 * per file, and fields were added across the documents.
 */

/** The version every document carries. */
export const INSPECT_SCHEMA: InspectSchema = "greenline.inspect/v2";

const SOURCE = "inspector document";

/** Every document the inspector serves, by kind, with the artefact it carries and its address. */
export const CONTRACT_DOCUMENTS: readonly ContractEntry[] = [
  { kind: "contract", artefact: "the contract", address: "GET /api/contract" },
  { kind: "desk", artefact: "change", address: "GET /api/desk?since=<time>" },
  { kind: "changes", artefact: "change", address: "GET /api/changes" },
  { kind: "change", artefact: "change", address: "GET /api/changes/<id>" },
  {
    kind: "changed-files",
    artefact: "change",
    address: "GET /api/changes/<id>/changed",
  },
  { kind: "source", artefact: "change", address: "GET /api/changes/<id>/source" },
  { kind: "step", artefact: "step", address: "GET /api/changes/<id>/steps/<step>" },
  { kind: "file", artefact: "change", address: "GET /api/changes/<id>/files/<path>" },
  { kind: "diff", artefact: "commit", address: "GET /api/changes/<id>/changed/<path>" },
  { kind: "check-facts", artefact: "check fact", address: "GET /api/changes/<id>/checks" },
  { kind: "commits", artefact: "commit", address: "GET /api/changes/<id>/commits" },
  { kind: "skill-loads", artefact: "skill load", address: "GET /api/changes/<id>/loads" },
  { kind: "frame-map", artefact: "frame map", address: "GET /api/changes/<id>/frame" },
  {
    kind: "interface-checks",
    artefact: "design section and tiered check fact",
    address: "GET /api/changes/<id>/interface",
  },
  { kind: "deal", artefact: "catalog entry", address: "GET /api/changes/<id>/deal" },
  {
    kind: "pictures",
    artefact: "visual and manifest",
    address: "GET /api/changes/<id>/pictures",
  },
  { kind: "notes", artefact: "capture and mark", address: "GET /api/changes/<id>/notes" },
  { kind: "plans", artefact: "plan and ticket", address: "GET /api/plans" },
  { kind: "plan", artefact: "plan and ticket", address: "GET /api/plans/<name>" },
  { kind: "discussions", artefact: "discussion", address: "GET /api/discussions" },
  { kind: "discussion", artefact: "discussion", address: "GET /api/discussions/<id>" },
  {
    kind: "file",
    artefact: "discussion",
    address: "GET /api/discussions/<id>/research/<file>",
  },
  { kind: "interface", artefact: "path index", address: "GET /api/interface" },
  { kind: "mark", artefact: "capture and mark", address: "GET /api/marks/<id>" },
  { kind: "homes", artefact: "knowledge home", address: "GET /api/knowledge" },
  { kind: "home", artefact: "knowledge home", address: "GET /api/knowledge/<home>" },
  { kind: "pictures", artefact: "visual and manifest", address: "GET /api/pictures" },
  { kind: "picture", artefact: "visual and manifest", address: "GET /api/pictures/<visual id>" },
  { kind: "atlas", artefact: "subsystem page and journey", address: "GET /api/atlas" },
  {
    kind: "subsystem",
    artefact: "subsystem page and journey",
    address: "GET /api/atlas/subsystems/<name>",
  },
  {
    kind: "document",
    artefact: "subsystem page and journey",
    address: "GET /api/atlas/documents/<path>",
  },
  { kind: "practice", artefact: "diagnostic", address: "GET /api/practice" },
  { kind: "installed-file", artefact: "settings", address: "GET /api/practice/files/<path>" },
  { kind: "roster", artefact: "skill load", address: "GET /api/roster" },
  { kind: "skill", artefact: "skill load", address: "GET /api/roster/<skill>" },
  { kind: "settings", artefact: "settings", address: "GET /api/settings" },
  { kind: "catalog", artefact: "catalog entry", address: "GET /api/catalog" },
  { kind: "search", artefact: "reference", address: "GET /api/search" },
];

/**
 * The documents J-156's design names that a later slice adds under this
 * envelope, each with the slice that owes it; a page that needs one reads
 * the change document until it stands.
 */
export const REMAINING_DOCUMENTS: readonly RemainingDocument[] = [
  {
    kind: "events",
    address: "GET /api/events",
    carries: "server-sent events naming the revision and the documents a write touched",
    owner: "J-158",
  },
];

/**
 * The files a change's folder, the ledger's sessions home or the interface
 * ledger home may hold that a command or an agent generates, named once so that each later writer
 * follows one convention. A JSON file opens with its `generatedBy` key; an
 * append-only JSON Lines file is marked by its name and home alone, each line
 * a record; a Markdown file opens with a `<!-- generated by ... -->` line.
 * `greenline tidy` removes only a finished change's working folder under
 * `.greenline/tmp/`, so it removes none of them: each is the change's record.
 */
export const GENERATED_FILES: readonly GeneratedFile[] = [
  {
    name: "skills/<date>.jsonl",
    home: ".greenline/ledger/<id>/",
    header: "none: append-only JSON Lines, one load per line, marked by its home",
    writer: "greenline event, from the harness's hook payloads",
    tidy: false,
    note: "the change's skill loads: skill, file, whole or part, how it was read, when, the step, the agent, the session and its turn",
  },
  {
    name: "sessions/<date>-<session>.jsonl",
    home: ".greenline/ledger/",
    header:
      "none: append-only JSON Lines, one load or one change named per line, marked by its home",
    writer: "greenline event, from the harness's hook payloads",
    tidy: false,
    note: "a session's skill loads, each with its turn, and the change it opened or resumed at a turn, whose loads from that turn are the change's",
  },
  {
    name: "frame-map.json",
    home: ".greenline/ledger/<id>/",
    header: '"generatedBy": the command that derived it, the first key',
    writer: "`greenline event`, after each tool, from the record's frame section",
    tidy: false,
    note: "the frame's nodes, each question with the answer proposed, the answer given and who decided, and the research it drew on",
  },
  {
    name: "frame-research-<n>.md",
    home: ".greenline/ledger/<id>/",
    header: "<!-- generated by the research start: report <n> --> as the first line",
    writer: "the research start's fresh agent, one report per accepted topic",
    tidy: false,
    note: "one research report the frame section cites",
  },
  {
    name: "visuals.json",
    home: ".greenline/ledger/<id>/",
    header: '"generatedBy": the command that wrote it, the first key',
    writer:
      "greenline event, after each tool once the change's folder in the visual home holds a visual, and greenline inspect after a delete",
    tidy: false,
    note: "the change's links to its visuals in .greenline/visuals/<id>/",
  },
  {
    name: "survey.json",
    home: ".greenline/ledger/interface/",
    header: '"generatedBy": the command that wrote it, the first key',
    writer:
      "the CLI's survey, each row measured by a command, read by the agent or confirmed by the owner",
    tidy: false,
    note: "the interface survey sheet, one source per row",
  },
  {
    name: "paths.json",
    home: ".greenline/ledger/interface/",
    header: '"generatedBy": the command that wrote it, the first key',
    writer: "the capture command",
    tidy: false,
    note: "the path index: per path of the interface its register, its last capture and its last scores",
  },
  {
    name: "interface/<stamp>.json",
    home: ".greenline/ledger/<id>/",
    header: '"generatedBy": the command that wrote it, the first key',
    writer: "greenline check interface",
    tidy: false,
    note: "one run of the interface check: the paths read, the counts and the findings by tier, the render rules unmeasured and the widths",
  },
  {
    name: "kept.json",
    home: ".greenline/ledger/<id>/",
    header: '"generatedBy": the command that wrote it, the first key',
    writer: "greenline check interface --url --path, from a redesign's before",
    tidy: false,
    note: "the kept list: per address the links, fields, form actions, handlers, test hooks, ids and headings the after must keep, and the losses the owner records",
  },
  {
    name: "design-pick.json",
    home: ".greenline/ledger/<id>/",
    header: '"generatedBy": the command that wrote it, the first key',
    writer: "greenline inspect's deal view, with the revision check",
    tidy: false,
    note: "the owner's pick of one direction dealt, which the mirror prints until the design section names it",
  },
  {
    name: "marks.jsonl",
    home: ".greenline/ledger/<id>/, or .greenline/ledger/interface/ when no change is open on the mark's path",
    header:
      "none: append-only JSON Lines, the whole mark after each act per line, marked by its name",
    writer:
      "greenline mark (add, propose, close) and greenline inspect's capture view, each line appended under the writer lock, the viewer's with the revision check its saves use",
    tidy: false,
    note: "the marks on captures: address, width, the capture and its commit, element or region, crop, note, intent, state, who and when, the agent's proposal and the owner's closure",
  },
];

/** What every document opens with, read before its kind picks the schema for the rest. */
const opening = z.looseObject({ schema: z.json(), kind: z.json() });

/**
 * Read one document against its schema: the version first, then the kind,
 * then every field.
 * @param value a parsed JSON value the inspector served
 * @returns the document, or each field it fails on
 */
export function parseInspectorDocument(
  value: JsonValue,
): Result<InspectorDocument, ContractParseFailed> {
  const head = opening.safeParse(value);
  if (!head.success)
    return contractFailure(SOURCE, [{ path: "", message: "a document is a JSON object" }]);
  if (head.data.schema !== INSPECT_SCHEMA)
    return contractFailure(SOURCE, [
      {
        path: "schema",
        message: `a document of ${JSON.stringify(head.data.schema)} is not ${INSPECT_SCHEMA}, the version this greenline reads`,
      },
    ]);
  const kind = JSON.stringify(head.data.kind);
  const schema = DOCUMENT_SCHEMAS.get(String(head.data.kind));
  if (schema === undefined)
    return contractFailure(SOURCE, [
      { path: "kind", message: `no document kind ${kind} in ${INSPECT_SCHEMA}` },
    ]);
  const parsed = schema.safeParse(value);
  return parsed.success
    ? contractOk(parsed.data)
    : contractFailure(SOURCE, issuesFrom(parsed.error.issues));
}
