import { CHANGE_ID } from "./change.ts";
import { ruled } from "./git-hooks.ts";
import { gitInvocations } from "./guardrails.ts";

/**
 * The ledger's machine-written files (J-173 S1; the register's row of
 * 2026-10-31, "The ledger's files are the CLI's to write"; `docs/SPEC.md`
 * §3): the files a command or the hooks write beside the records, which
 * the agent never writes by hand or by a script, each with the command that
 * owns it and the way forward, and a picture under a change's ledger
 * folder, which the visual home holds instead. A change's folder in the
 * visual home is written by `greenline picture keep` alone, the picture
 * and its manifest together, and a research report by `greenline research
 * report` (J-176 S1). The before-write hook reads
 * this one list for a Write or an Edit, and the shell guard for a command
 * whose words name one of the paths as a write target. Pure: the shell
 * resolves the path from the repository's root.
 */

/** One class of file the CLI writes and the agent does not. */
export interface MachineFile {
  /** What the file is, as the refusal names it. */
  readonly what: string;
  /** The command or the hook that writes it. */
  readonly owner: string;
  /** How the file's path reads, from the root, `/`-separated. */
  readonly path: RegExp;
  /** The way forward, the change's id given where the path names one. */
  readonly forward: (change: string | undefined) => string;
}

/** A change's folder, its id captured. */
const FOLDER = String.raw`\.greenline/ledger/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)`;

/**
 * The machine-written files, in the order the SPEC's §3 lists them. The
 * marks file keeps its own refusal ({@link ledgerWriteRefusal}); the
 * others share one.
 */
export const MACHINE_FILES: readonly MachineFile[] = [
  {
    what: "the owner's marks",
    owner: "greenline mark",
    path: /^\.greenline\/ledger\/(?:interface|\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\/marks\.jsonl$/,
    forward: () =>
      "change them through greenline mark (list, add, propose, close), which records whose act each line is, and close a mark only on the owner's word",
  },
  {
    what: "the change's links to its visuals",
    owner: "the hooks",
    path: new RegExp(`^${FOLDER}/visuals\\.json$`),
    forward: (change) =>
      `keep the picture with greenline picture keep <file> --change ${change ?? "<id>"}, which writes it and its manifest under .greenline/visuals/${change ?? "<id>"}/, and the hooks list it`,
  },
  {
    what: "the change's frame map",
    owner: "the hooks",
    path: new RegExp(`^${FOLDER}/frame-map\\.json$`),
    forward: (change) =>
      `write the frame section of .greenline/ledger/${change ?? "<id>"}.md and the hooks derive the map from it`,
  },
  {
    what: "a check's facts",
    owner: "greenline check",
    path: new RegExp(`^${FOLDER}/checks/`),
    forward: () => "run the check through greenline check -- <command>",
  },
  {
    what: "a run of the interface check",
    owner: "greenline check interface",
    path: new RegExp(`^${FOLDER}/interface/`),
    forward: () => "run greenline check interface, which writes each run's findings by tier",
  },
  {
    what: "the change's skill loads",
    owner: "the hooks",
    path: new RegExp(`^${FOLDER}/skills/`),
    forward: () =>
      "read the skill's pages and the hooks note each load; the close's skills line copies what greenline status --change <id> lists",
  },
  {
    what: "a session's skill loads",
    owner: "the hooks",
    path: /^\.greenline\/ledger\/sessions\//,
    forward: () => "read the skill's pages and the hooks note each load",
  },
  {
    what: "the interface's path index",
    owner: "greenline check interface",
    path: /^\.greenline\/ledger\/interface\/paths\.json$/,
    forward: () =>
      "capture the page with greenline check interface --url <origin> --path <path>, which writes its line",
  },
  {
    what: "the owner's pick of a direction",
    owner: "the viewer",
    path: new RegExp(`^${FOLDER}/design-pick\\.json$`),
    forward: () =>
      "ask the owner to pick in the viewer's deal view, or write the pick they named in the design section",
  },
  {
    what: "a request's receipt",
    owner: "greenline connectors",
    path: /^\.greenline\/ledger\/receipts\//,
    forward: () => "call the connector through greenline connectors call, which writes the receipt",
  },
  {
    what: "a capture's boxes file",
    owner: "greenline check interface",
    path: /^\.greenline\/visuals\/.+\.boxes\.json$/,
    forward: () =>
      "take the capture again with greenline check interface --url <origin> --path <path>",
  },
  {
    what: "a kept picture or its manifest",
    owner: "greenline picture keep",
    path: /^\.greenline\/visuals\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\//,
    forward: (change) =>
      `draw the picture under .greenline/tmp/${change ?? "<id>"}/ and, on the owner's ask, keep it with greenline picture keep <file> --change ${change ?? "<id>"} --ask "<the owner's words>" --title "<title>" --form <form> --skill <skill> --summary "<what it shows and why>" --files <path>,<path>, which writes it and its manifest together`,
  },
  {
    what: "a research report",
    owner: "greenline research report",
    path: new RegExp(`^${FOLDER}/frame-research-[1-9]\\d*\\.md$`),
    forward: (change) =>
      `write the report under .greenline/tmp/${change ?? "<id>"}/ and file it with greenline research report <file> --change ${change ?? "<id>"} --topic R<n>, which writes it into the change's folder`,
  },
  {
    what: "the record of what each owner-words line lifted",
    owner: "the hooks",
    path: /^\.git\/greenline\/lifts\.jsonl$/,
    forward: () =>
      "ask the owner for the act and write their words in the record's line, then commit the record alone",
  },
];

/** A path from the root as the list reads it: `/`-separated, with no leading `./`. */
function normalised(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

/**
 * The machine-written file a path is, or undefined for every other.
 * @param path the path from the repository's root
 * @returns the file's class, or undefined
 */
export function ledgerFileOf(path: string): MachineFile | undefined {
  const at = normalised(path);
  return MACHINE_FILES.find((file) => file.path.test(at));
}

/** A picture's suffix: PNG, JPEG, WebP, GIF and SVG. */
const PICTURE = /\.(?:png|jpe?g|webp|gif|svg)$/i;

/**
 * The folder under the ledger a picture is written in, or undefined for a
 * path that is no picture under `.greenline/ledger/`: the change's id for a
 * change's folder, the folder's name for any other, `.` for the ledger's
 * own top.
 * @param path the path from the repository's root
 * @returns the folder, or undefined
 */
export function pictureInLedger(path: string): string | undefined {
  const at = normalised(path);
  if (!at.startsWith(".greenline/ledger/") || !PICTURE.test(at)) return undefined;
  const rest = at.slice(".greenline/ledger/".length).split("/");
  return rest.length > 1 ? rest[0] : ".";
}

/**
 * The change folders of the visual home a restored path holds (J-227 S1):
 * a `git restore` or a `git checkout --` of a change's folder writes under
 * it, and one of an ancestor, the home or `.greenline`, writes under each
 * change's folder it holds. A restore of the whole tree is a discard,
 * which the guardrails' discard rule and its owner's words decide, so it
 * names none here.
 * @param path the restored path from the repository's root
 * @param folders the change folders that stand, `.greenline/visuals/<id>`, from the root
 * @returns the folders it writes under, in the order given
 */
export function restoredFolders(path: string, folders: readonly string[]): readonly string[] {
  const at = normalised(path).replace(/\/+$/, "");
  if (at === "" || at === ".") return [];
  return folders.filter((folder) => folder === at || folder.startsWith(`${at}/`));
}

/** What a refusal of a restore into the visual home adds: the owner's delete stands (J-227 S1). */
const RESTORE_WORDS =
  "; a picture the owner deleted in greenline inspect is remade only on the owner's ask, never restored from git";

/**
 * The refusal of a write to a machine-written file or of a picture under
 * the ledger, the owning command and the way forward named, or undefined
 * for every other path.
 * @param path the path from the repository's root
 * @param restore whether git writes it back, a `git restore` or a `git checkout --` (J-227 S1)
 * @returns the refusal's one line, its rule after a semicolon, or undefined
 */
export function ledgerWriteRefusal(path: string, restore = false): string | undefined {
  const at = normalised(path);
  const folder = pictureInLedger(at);
  if (folder !== undefined) {
    const change = CHANGE_ID.test(folder) ? folder : undefined;
    return ruled(
      `a picture is no record, so ${at} is not written under the ledger; a lasting visual stands in the visual home, .greenline/visuals/${change ?? "<id>"}/, beside its manifest, kept with greenline picture keep on the owner's ask or by greenline check interface --url --path for a capture, and a working screenshot stays under .greenline/tmp/${change === undefined ? "" : `${change}/`}`,
      "picture-in-ledger",
    );
  }
  const file = ledgerFileOf(at);
  if (file === undefined) return undefined;
  const change =
    new RegExp(`^${FOLDER}/`).exec(at)?.[1] ??
    /^\.greenline\/visuals\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(at)?.[1];
  if (file.owner === "greenline mark")
    return ruled(
      `the owner's marks are not edited by hand, so the write to ${at} is stopped; ${file.forward(change)}`,
      "marks-by-hand",
    );
  const writes =
    file.owner === "the hooks"
      ? "which the hooks write"
      : file.owner === "the viewer"
        ? "which the viewer writes"
        : `which ${file.owner} writes`;
  // The visual home's own refusal names its door (J-176 S1).
  if (file.owner === "greenline picture keep")
    return ruled(
      `${at} is ${file.what} in the visual home, which greenline picture keep alone writes, so it is not written by hand or by a script${restore ? ", nor restored by git" : ""}; ${file.forward(change)}${restore ? RESTORE_WORDS : ""}`,
      "visuals-by-hand",
    );
  const after =
    file.what === "the change's links to its visuals"
      ? " after each write under the visual home"
      : "";
  return ruled(
    `${at} is ${file.what}, ${writes}${after}, so it is not written by hand or by a script; ${file.forward(change)}`,
    "ledger-by-hand",
  );
}

/** A path under a change's folder of the visual home, its change captured. */
const CHANGE_VISUAL = /^\.greenline\/visuals\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\//;

/**
 * Whether a path from the root stands in a change's folder of the visual
 * home, which `greenline picture keep` alone writes (J-176 S1).
 * @param path the path from the repository's root
 * @returns true for a path under `.greenline/visuals/<id>/`
 */
export function inChangeVisuals(path: string): boolean {
  return CHANGE_VISUAL.test(normalised(path));
}

/** The words of the two commands that write a change's folder of the home, the keep and the interface check's capture. */
const DOOR_WORDS = /\bgreenline(?:\.[cm]?js)?(?:@\S+)?\s+(?:picture\s+keep|check\s+interface)\b/;

/**
 * The after-tool line naming a write into a change's folder of the visual
 * home that the command's words hid (J-227 S1, j201t-visuals finding 6): a
 * path the files' times show the command wrote there while its words named
 * no write of it, such as a script that built the folder's path from parts.
 * A command that runs `greenline picture keep`, `greenline check interface`,
 * whose capture stands in the change's folder, or git writes there by its
 * own rules, and names none. Read by the files' times, a write a parallel
 * call made in the same moment can be named under this command. The line is never a refusal: the write stood
 * before the hook read it, so it names the fact and the door.
 * @param command the shell command's words as the harness reported them
 * @param written the paths under the homes the command wrote, from the root
 * @returns the line, or undefined where none is owed
 */
export function hiddenWriteLine(command: string, written: readonly string[]): string | undefined {
  if (DOOR_WORDS.test(command) || gitInvocations(command).length > 0) return undefined;
  const hidden = written.map((path) => normalised(path)).filter((path) => inChangeVisuals(path));
  const first = hidden[0];
  if (first === undefined) return undefined;
  const refusal = ledgerWriteRefusal(first) ?? "";
  return `the command wrote ${hidden.join(", ")} in a change's folder of the visual home, which its words did not show, so the hooks name it after the tool: ${refusal}`;
}
