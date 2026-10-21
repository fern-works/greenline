import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "../commons/result.ts";
import { isBriefFile } from "../core/brief.ts";
import { isChangeId, parseChangeRecord } from "../core/change.ts";
import { contractFailure, ContractParseFailed } from "../core/contract.ts";
import { parseChecksFile, type CheckFacts, type HookRun } from "../core/facts.ts";
import type { ModesDefinition } from "../core/modes.ts";
import { parsePlanDocument, parseTicketsFile } from "../core/plan-documents.ts";
import type {
  ChangeEntry,
  ChangeFolder,
  ChangesOnDisk,
  ParsedFile,
  PlanContents,
  PlanOnDisk,
} from "../core/status.ts";
import { listFilesRecursive } from "./fs/walk.ts";

/**
 * The changes on disk, gathered and never judged: every Markdown file
 * directly under the workspace's `.greenline/ledger/` is a change record,
 * parsed against the loaded modes; a change's folder of the same name holds
 * its reports and its check facts; and `.greenline/plans/` holds the plan
 * directories. The ledger's managed `README.md` and every folder that is no
 * change's, such as the garden connector's `receipts/`, are not read. The
 * types it gathers into are the inputs of
 * `src/core/status.ts`, which derives the view from them.
 */

const MANAGED_GUIDE = "README.md";

/** The record files directly under the ledger folder, sorted; none when it is absent. */
function recordFiles(ledger: string): Result<readonly string[], ContractParseFailed> {
  try {
    return ok(
      readdirSync(ledger, { withFileTypes: true })
        .filter(
          (entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== MANAGED_GUIDE,
        )
        .map((entry) => entry.name)
        .sort(),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return ok([]);
    return err(
      new ContractParseFailed(".greenline/ledger", [
        { path: "", message: `the ledger folder cannot be read: ${String(error)}` },
      ]),
    );
  }
}

/**
 * The ids of the record files directly under the ledger, read by name and
 * never parsed: what the situation counts, whatever the installation.
 * @param root the repository root
 * @returns the ids, sorted; none when the ledger is absent; undefined when it cannot be read
 */
export function recordIds(root: string): readonly string[] | undefined {
  const names = recordFiles(join(root, ".greenline", "ledger"));
  return names._tag === "ok" ? names.value.map((name) => name.slice(0, -".md".length)) : undefined;
}

/**
 * List and parse every change record of a workspace.
 * @param root the repository root
 * @param definition the loaded modes definition
 * @returns one entry per record file, sorted by id; none when the ledger folder is absent; a refusal when it cannot be read
 */
export function listChangeRecords(
  root: string,
  definition: ModesDefinition,
): Result<readonly ChangeEntry[], ContractParseFailed> {
  const ledger = join(root, ".greenline", "ledger");
  const names = recordFiles(ledger);
  if (names._tag === "err") return names;
  return ok(
    names.value.map((name) => {
      const id = name.slice(0, -".md".length);
      try {
        const text = readFileSync(join(ledger, name), "utf8");
        return { id, text, record: parseChangeRecord(definition, name, text) };
      } catch (error) {
        return {
          id,
          text: undefined,
          record: contractFailure(name, [{ path: "", message: `unreadable: ${String(error)}` }]),
        };
      }
    }),
  );
}

const TICKETS = "tickets.md";

function read<T>(
  path: string,
  file: string,
  parse: (text: string) => Result<T, ContractParseFailed>,
): ParsedFile<T> {
  try {
    return { file, parsed: parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return {
      file,
      parsed: contractFailure(file, [{ path: "", message: `unreadable: ${String(error)}` }]),
    };
  }
}

/** A folder or directory that could not be listed, kept on its own entry. */
function unreadable(where: string, detail: string): Result<never, ContractParseFailed> {
  return contractFailure(where, [{ path: "", message: `unreadable: ${detail}` }]);
}

function folderOf(
  folder: string,
  where: string,
): Result<ChangeFolder, ContractParseFailed> | undefined {
  let files: readonly string[];
  try {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) return undefined;
    files = listFilesRecursive(folder);
  } catch (error) {
    return unreadable(where, String(error));
  }
  const isFacts = (file: string): boolean => file.startsWith("checks/") && file.endsWith(".json");
  const checks: ParsedFile<CheckFacts>[] = [];
  const hookRuns: ParsedFile<HookRun>[] = [];
  for (const file of files.filter(isFacts)) {
    let text: string;
    try {
      text = readFileSync(join(folder, file), "utf8");
    } catch (error) {
      checks.push({
        file,
        parsed: contractFailure(file, [{ path: "", message: `unreadable: ${String(error)}` }]),
      });
      continue;
    }
    // A run a hook recorded sits beside the facts check wrote, read apart from them.
    const read = parseChecksFile(text, file);
    if (read.kind === "hook") hookRuns.push({ file, parsed: read.parsed });
    else checks.push({ file, parsed: read.parsed });
  }
  return ok({
    reports: files.filter((file) => !isFacts(file)),
    briefs: files.filter(isBriefFile).map((file) => {
      try {
        return { file, text: readFileSync(join(folder, file), "utf8") };
      } catch {
        return { file, text: undefined };
      }
    }),
    checks,
    hookRuns,
  });
}

function contentsOf(
  directory: string,
  where: string,
  definition: ModesDefinition,
): Result<PlanContents, ContractParseFailed> {
  let markdown: readonly string[];
  try {
    markdown = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return unreadable(where, String(error));
  }
  return ok({
    tickets: markdown.includes(TICKETS)
      ? read(join(directory, TICKETS), TICKETS, (text) =>
          parseTicketsFile(definition, TICKETS, text),
        )
      : undefined,
    documents: markdown
      .filter((file) => file !== TICKETS)
      .map((file) => read(join(directory, file), file, (text) => parsePlanDocument(file, text))),
  });
}

function plansOf(
  root: string,
  definition: ModesDefinition,
): Result<readonly PlanOnDisk[], ContractParseFailed> {
  const plans = join(root, ".greenline", "plans");
  let names: readonly string[];
  try {
    if (!existsSync(plans)) return ok([]);
    names = readdirSync(plans, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return unreadable(".greenline/plans", String(error));
  }
  return ok(
    names.map((name) => ({
      name,
      contents: contentsOf(join(plans, name), `.greenline/plans/${name}`, definition),
    })),
  );
}

/**
 * A fresh agent's own scratch folder, `.greenline/tmp/<id>/<step>-<n>/`, by
 * its absolute path: the folder its brief names and `greenline check
 * --round` sets `TMPDIR` to, inside the change's working folder that
 * `greenline tidy` removes.
 * @param root the repository root
 * @param change the change's id
 * @param step the step the agent serves
 * @param round the agent's number, the one its report takes
 * @returns the folder's absolute path
 */
export function scratchFolder(root: string, change: string, step: string, round: number): string {
  return join(root, ".greenline", "tmp", change, `${step}-${String(round)}`);
}

/**
 * The working folders under `.greenline/tmp/`: each entry that is a
 * directory, not a link, and is named by a change id, sorted; none when the
 * folder is absent or cannot be listed, since the folder is git-ignored
 * scratch and a notice about it never hides a change.
 * @param root the repository root
 * @returns the change ids that name a working folder
 */
function workingFolders(root: string): readonly string[] {
  try {
    return readdirSync(join(root, ".greenline", "tmp"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isChangeId(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Gather every input `status` derives from: each change record with its
 * folder's reports and parsed check facts, and each plan directory with its
 * tickets file and plan documents, and the working folders under
 * `.greenline/tmp/`. One file that fails to parse, or one
 * change folder or plan directory that cannot be listed, is kept as a failure
 * on its own entry beside the others; the ledger's earlier formats are left alone.
 * @param root the repository root
 * @param definition the loaded modes definition
 * @returns the changes and plans on disk, or a refusal when the ledger or plans folder cannot be read
 */
export function readChangesOnDisk(
  root: string,
  definition: ModesDefinition,
): Result<ChangesOnDisk, ContractParseFailed> {
  const records = listChangeRecords(root, definition);
  if (records._tag === "err") return records;
  const plans = plansOf(root, definition);
  if (plans._tag === "err") return plans;
  return ok({
    changes: records.value.map((entry) => ({
      ...entry,
      folder: folderOf(
        join(root, ".greenline", "ledger", entry.id),
        `.greenline/ledger/${entry.id}`,
      ),
    })),
    plans: plans.value,
    working: workingFolders(root),
  });
}
