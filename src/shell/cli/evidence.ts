import { Command } from "commander";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../commons/hash.ts";
import { isRepositoryPath } from "../../commons/repository-path.ts";
import { findGitRoot } from "../git.ts";
import type { CliWriter } from "./output.ts";
import type { LedgerEvidence } from "../../core/execution-ledger.ts";

/** Construct references from explicit files or an exact commit; never write or assess evidence. */
export function runEvidenceCli(argv: readonly string[], writer: CliWriter, cwd: string): number {
  const command = new Command("greenline evidence")
    .description("Return exact file evidence references without writing accounts")
    .argument("<paths...>", "repository-relative files")
    .option("--commit <hash>", "read files at an exact Git commit, never a floating ref")
    .option(
      "--pending",
      "hash the working tree for bytes whose commit does not exist yet; doctor resolves that commit",
    )
    .configureOutput({ writeOut: (text) => writer.stdout.write(text), writeErr: () => undefined })
    .exitOverride();
  try {
    command.parse([...argv], { from: "user" });
  } catch (error) {
    if (z.object({ code: z.literal("commander.helpDisplayed") }).safeParse(error).success) return 0;
    writer.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        command: "evidence",
        ok: false,
        error: { kind: "configuration", input: "evidence arguments; see --help" },
      }) + "\n",
    );
    return 2;
  }
  const root = findGitRoot(cwd),
    options = command.opts<{ commit?: string; pending?: boolean }>(),
    commit = options.commit,
    pending = options.pending === true;
  const fail = (input: string): number => {
    writer.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        command: "evidence",
        ok: false,
        error: { kind: "configuration", input },
      }) + "\n",
    );
    return 1;
  };
  if (root === undefined) return fail("Git repository");
  if (commit !== undefined && pending)
    return fail("choose --commit for bytes already committed or --pending for bytes that are not");
  if (commit !== undefined && !/^[a-f0-9]{7,40}$/.test(commit))
    return fail("commit must be an exact Git hash");
  const references: LedgerEvidence[] = [];
  for (const path of command.args) {
    if (!isRepositoryPath(path)) return fail(path);
    try {
      if (commit !== undefined) {
        const resolved = execFileSync("git", ["rev-parse", "--verify", `${commit}^{commit}`], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const bytes = execFileSync("git", ["show", `${resolved}:${path}`], {
          cwd: root,
          stdio: ["ignore", "pipe", "ignore"],
          maxBuffer: 64 * 1024 * 1024,
        });
        references.push({ path, revision: sha256Hex(bytes), commit: resolved });
      } else {
        const full = join(root, path);
        if (!lstatSync(full).isFile() || !realpathSync(full).startsWith(realpathSync(root) + sep))
          return fail(path);
        const revision = sha256Hex(readFileSync(full));
        references.push(pending ? { path, revision, pending: true } : { path, revision });
      }
    } catch {
      return fail(path);
    }
  }
  writer.stdout.write(
    JSON.stringify({ schemaVersion: 1, command: "evidence", ok: true, references }) + "\n",
  );
  return 0;
}
