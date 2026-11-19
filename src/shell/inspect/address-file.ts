import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  INSPECT_ADDRESS_FILE,
  inspectAddressText,
  parseInspectAddress,
  type InspectAddress,
} from "../../core/inspect-address.ts";
import { atomicWriteFile } from "../fs/io.ts";

/*
 * The inspector's address file on disk (J-142 S1): written by `greenline
 * inspect` once it serves, removed when it stops, and read by the mirror,
 * `greenline status` and `greenline view`. A file whose process is gone is
 * a stale file and reads as not serving.
 */

/**
 * Whether a process is running, asked of the system without signalling it.
 * @param pid the process's id
 * @returns true while it runs, or runs as another user
 */
function processRuns(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as a process this one may not signal.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/**
 * Write the address file for a viewer serving at a port.
 * @param root the repository root
 * @param port the port it listens on
 * @param pid the process serving it
 * @param started when it started serving
 * @returns whether the file was written
 */
export function writeAddressFile(
  root: string,
  port: number,
  pid: number = process.pid,
  started: string = new Date().toISOString(),
): boolean {
  return (
    atomicWriteFile(join(root, INSPECT_ADDRESS_FILE), inspectAddressText(port, pid, started))
      ._tag === "ok"
  );
}

/**
 * Remove the address file where it is this process's, so a viewer started
 * since by another process keeps its own.
 * @param root the repository root
 * @param pid the process that wrote it
 */
export function removeAddressFile(root: string, pid: number = process.pid): void {
  const path = join(root, INSPECT_ADDRESS_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const file = parseInspectAddress(text);
  if (file !== undefined && file.pid !== pid) return;
  rmSync(path, { force: true });
}

/**
 * The viewer serving this repository, read from the address file: none
 * where no file reads or its process is gone.
 * @param root the repository root
 * @param runs whether a process runs, the system's answer by default
 * @returns the address file, or undefined where none serves
 */
export function readServing(
  root: string,
  runs: (pid: number) => boolean = processRuns,
): InspectAddress | undefined {
  let text: string;
  try {
    text = readFileSync(join(root, INSPECT_ADDRESS_FILE), "utf8");
  } catch {
    return undefined;
  }
  const file = parseInspectAddress(text);
  return file === undefined || !runs(file.pid) ? undefined : file;
}
