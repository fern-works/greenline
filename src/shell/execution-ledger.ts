import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, sep, relative, isAbsolute } from "node:path";
import { isRepositoryPath } from "../commons/repository-path.ts";
import { sha256Hex } from "../commons/hash.ts";
import { ok, type Result } from "../commons/result.ts";
import { contractFailure, type ContractParseFailed } from "../core/contract.ts";
import {
  parseLedgerRecord,
  type LedgerEvidence,
  type LedgerRecord,
  type ExecutionLedger,
  type LedgerEvidenceCheck,
  type LedgerConsultationCheck,
  type LedgerObservedChange,
} from "../core/execution-ledger.ts";
import { observeConsultation, observeTraceChanges } from "../core/ledger-observations.ts";
import type { FileIo, AtomicWriteFailed } from "./fs/io.ts";
import { GuidanceRequests } from "./guidance-requests.ts";
import { compileGuidanceLedger } from "../core/guidance-ledger.ts";
import { parseManifest } from "../core/manifest.ts";
import type { GuidanceConfiguration } from "../core/guidance-configuration.ts";

interface Witness {
  readonly status: LedgerEvidenceCheck["status"];
  readonly current?: boolean;
  readonly content?: string;
}

/** Resolve explicit Git evidence, or current bytes with a recorded-commit fallback. */
function readWitness(root: string, reference: LedgerEvidence, record: LedgerRecord): Witness {
  let status: Witness["status"] = "unavailable";
  let current = false;
  {
    const path = join(root, reference.path);
    try {
      const actual = realpathSync(path);
      const boundary = realpathSync(root) + sep;
      if (!actual.startsWith(boundary)) return { status: "unavailable" };
      const bytes = readFileSync(path);
      current = sha256Hex(bytes) === reference.revision;
      if (current && reference.commit === undefined)
        return { status: "matched", current, content: bytes.toString("utf8") };
      if (!current) status = "changed";
    } catch {
      status = existsSync(path) ? "unavailable" : "missing";
    }
  }
  // A pin taken before its commit existed names no commit, so the account's
  // own range cannot carry it: the bytes land in the code commit, and the
  // account that claims them lands in the accounting commit after it. Read
  // HEAD and its first parent as well, so the pin resolves once both exist
  // (the premium run bought two extra commits re-pinning past GL0303).
  const commits =
    reference.commit === undefined
      ? [record.resultCommit, record.baseCommit, ...(reference.pending ? ["HEAD", "HEAD^"] : [])]
      : [reference.commit];
  for (const commit of new Set(commits)) {
    if (commit === undefined) continue;
    try {
      const content = execFileSync("git", ["-C", root, "show", `${commit}:${reference.path}`], {
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024,
      });
      if (sha256Hex(content) === reference.revision)
        return { status: "matched", current, content: content.toString("utf8") };
      status = "changed";
    } catch {
      /* A historical witness that is not available stays unverified. */
    }
  }
  return { status, current };
}

function referencesOf(record: LedgerRecord): readonly LedgerEvidence[] {
  return [
    ...record.selections.flatMap((entry) => [
      ...(entry.source.kind === "repository" ? [entry.source] : []),
      ...(entry.observation === undefined ? [] : [entry.observation.trace]),
    ]),
    ...record.applications.flatMap((entry) => entry.evidence),
    ...record.checks,
    ...record.reviews,
  ];
}

function evidenceKey(reference: LedgerEvidence): string {
  return JSON.stringify([
    reference.path,
    reference.revision,
    reference.commit ?? null,
    reference.pending ?? null,
  ]);
}

/** Read only named JSON records; raw evidence stays outside the artifact parser. */
export function readExecutionLedger(
  root: string,
  io: FileIo,
): Result<ExecutionLedger, ContractParseFailed | AtomicWriteFailed> {
  const directory = ".greenline/ledger/records";
  const location = join(root, directory);
  const records: LedgerRecord[] = [];
  try {
    if (existsSync(location)) {
      if (
        lstatSync(location).isSymbolicLink() ||
        !realpathSync(location).startsWith(realpathSync(root) + sep)
      )
        return contractFailure(location, [
          { path: "", message: "ledger records must remain inside the repository" },
        ]);
      for (const file of readdirSync(location)
        .filter((name) => name.endsWith(".json"))
        .sort()) {
        const path = join(location, file);
        if (!lstatSync(path).isFile())
          return contractFailure(path, [
            { path: "", message: "a ledger record must be an ordinary file" },
          ]);
        const text = io.read(path);
        if (text._tag === "err") return text;
        const parsed = parseLedgerRecord(text.value, path);
        if (parsed._tag === "err") return parsed;
        if (file !== `${parsed.value.id}.json`)
          return contractFailure(path, [
            { path: "id", message: "record identity must match its filename" },
          ]);
        records.push(parsed.value);
      }
    }
  } catch (error) {
    return contractFailure(location, [
      { path: "", message: `ledger scan failed: ${String(error)}` },
    ]);
  }
  const evidence: LedgerEvidenceCheck[] = [];
  const consultations: LedgerConsultationCheck[] = [];
  const observedChanges: LedgerObservedChange[] = [];
  for (const record of records) {
    if (record.baseCommit !== undefined && record.resultCommit !== undefined) {
      try {
        const changed = execFileSync(
          "git",
          [
            "-C",
            root,
            "diff",
            "--no-ext-diff",
            "--no-renames",
            "--name-only",
            "-z",
            record.baseCommit,
            record.resultCommit,
            "--",
          ],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 32 * 1024 * 1024,
          },
        );
        const paths = changed
          .split("\0")
          .filter((path) => path !== "")
          .sort();
        if (paths.length > 0)
          observedChanges.push({
            record: record.id,
            paths,
            witness: { kind: "git", base: record.baseCommit, result: record.resultCommit },
          });
      } catch {
        // An unavailable range yields no observation, never proof that no files changed.
      }
    }
    const witnesses = new Map<string, Witness>();
    for (const reference of referencesOf(record)) {
      const key = evidenceKey(reference);
      if (witnesses.has(key)) continue;
      const witness = readWitness(root, reference, record);
      witnesses.set(key, witness);
      const checked = {
        record: record.id,
        reference,
        status: witness.status,
        current: witness.current ?? false,
      };
      const pinned =
        reference.path.startsWith(`${directory}/`) && witness.content !== undefined
          ? parseLedgerRecord(witness.content, reference.path)
          : undefined;
      if (pinned?._tag === "ok" && reference.path === `${directory}/${pinned.value.id}.json`) {
        const target = pinned.value;
        evidence.push({
          ...checked,
          target: {
            id: target.id,
            role: target.role,
            context: target.context,
            work: target.work,
            resultCommit: target.resultCommit,
          },
        });
      } else evidence.push(checked);
    }
    const captured = new Set<string>();
    for (const entry of record.selections) {
      const reference = entry.observation;
      if (reference === undefined) continue;
      const key = JSON.stringify([evidenceKey(reference.trace), reference.format]);
      const capture = witnesses.get(evidenceKey(reference.trace));
      if (captured.has(key) || capture?.status !== "matched" || capture.content === undefined)
        continue;
      captured.add(key);
      for (const change of observeTraceChanges(capture.content, reference.format, record.context)) {
        const paths = change.paths
          .map((path) => relative(root, isAbsolute(path) ? path : join(root, path)))
          .filter(isRepositoryPath)
          .sort();
        if (paths.length > 0)
          observedChanges.push({
            record: record.id,
            paths,
            witness: {
              kind: "capture",
              trace: reference.trace,
              call: change.call,
              line: change.line,
            },
          });
      }
    }
    const consulted = new Map<string, Witness>();
    for (const entry of record.selections)
      if (entry.source.kind === "repository")
        consulted.set(
          entry.id,
          witnesses.get(evidenceKey(entry.source)) ?? { status: "unavailable" },
        );
    for (const entry of record.selections) {
      const source = consulted.get(entry.id);
      const trace =
        entry.observation === undefined
          ? undefined
          : witnesses.get(evidenceKey(entry.observation.trace));
      const observation =
        entry.observation === undefined
          ? {
              status: "declared" as const,
              ordering: "unknown" as const,
              detail: "Agent-declared consultation; no capture reference.",
            }
          : source?.content === undefined || trace?.content === undefined
            ? {
                status: "unavailable" as const,
                ordering: "unknown" as const,
                detail: "The pinned source or capture is unavailable; the read remains unverified.",
              }
            : observeConsultation(trace.content, entry, source.content, record.context);
      consultations.push({ record: record.id, consultation: entry.id, ...observation });
    }
  }
  const requests = new GuidanceRequests(root, io).all();
  if (requests._tag === "err")
    return contractFailure("guidance receipts", [{ path: "", message: requests.error.message }]);
  let guidance: GuidanceConfiguration | undefined;
  const path = join(root, ".greenline/manifest.json");
  const manifestText = io.read(path);
  if (manifestText._tag === "err") {
    if (manifestText.error.step !== "absent" || records.length > 0 || requests.value.length > 0)
      return contractFailure(path, [
        {
          path: "guidance",
          message: "A readable installed manifest is required to audit consumer records.",
        },
      ]);
  } else {
    try {
      if (
        lstatSync(path).isSymbolicLink() ||
        !realpathSync(path).startsWith(realpathSync(root) + sep)
      )
        return contractFailure(path, [
          { path: "guidance", message: "The manifest must remain inside the repository." },
        ]);
    } catch {
      return contractFailure(path, [
        { path: "guidance", message: "The installed manifest is unavailable." },
      ]);
    }
    const manifest = parseManifest(manifestText.value, path);
    if (manifest._tag === "err") return manifest;
    guidance = manifest.value.guidance;
    for (const record of records)
      if (
        record.guidance !== undefined &&
        JSON.stringify(record.guidance) !== JSON.stringify(guidance)
      )
        return contractFailure(`${directory}/${record.id}.json`, [
          {
            path: "guidance",
            message: "Declared guidance differs from .greenline/manifest.json.",
          },
        ]);
  }
  const compiled = compileGuidanceLedger(records, requests.value);
  if (compiled._tag === "err") return compiled;
  const ledger: ExecutionLedger = {
    records: compiled.value.records,
    evidence,
    consultations: [...consultations, ...compiled.value.consultations],
    observedChanges,
    receipts: requests.value,
  };
  return ok(guidance === undefined ? ledger : { ...ledger, guidance });
}
