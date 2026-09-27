import { z } from "zod";
import { parseJson } from "./contract.ts";
import type { LedgerConsultation, ConsultationObservation } from "./execution-ledger.ts";

const block = z.object({
  type: z.string(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.object({ file_path: z.string().optional(), command: z.string().optional() }).optional(),
  tool_use_id: z.string().optional(),
  is_error: z.boolean().optional(),
  content: z
    .union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))])
    .optional(),
});
const claude = z.object({
  type: z.string(),
  session_id: z.string().optional(),
  message: z.object({ content: z.array(block) }).optional(),
});
const readResult = z.object({
  tool_use_result: z.object({
    file: z.object({
      filePath: z.string(),
      content: z.string(),
      startLine: z.number().int().positive(),
      numLines: z.number().int().nonnegative(),
      totalLines: z.number().int().nonnegative(),
    }),
  }),
});
const stdoutResult = z.object({ tool_use_result: z.object({ stdout: z.string() }) });
const codex = z.object({
  type: z.string(),
  item: z.object({
    id: z.string(),
    type: z.string(),
    command: z.string().optional(),
    status: z.string().optional(),
    exit_code: z.number().nullable().optional(),
    aggregated_output: z.string().optional(),
    changes: z.array(z.object({ path: z.string() })).optional(),
  }),
});
const thread = z.object({ type: z.literal("thread.started"), thread_id: z.string() });

/** An observed operation in supplied capture order; unknown fields do not become success. */
interface LedgerTraceOperation {
  readonly id: string;
  readonly session?: string | undefined;
  readonly kind: "read" | "command" | "change" | "other";
  readonly targets: readonly string[];
  readonly requested: number;
  readonly delivered?: number | undefined;
  readonly result: "succeeded" | "failed" | "unknown";
  readonly output: string;
  readonly command?: string | undefined;
  readonly file?:
    | {
        readonly path: string;
        readonly content: string;
        readonly start: number;
        readonly count: number;
        readonly total: number;
      }
    | undefined;
  readonly ambiguous: boolean;
}
type MutableOperation = {
  -readonly [Key in keyof LedgerTraceOperation]: LedgerTraceOperation[Key];
};

function identify(
  operation: MutableOperation,
  kind: LedgerTraceOperation["kind"],
  targets: readonly string[],
  command: string | undefined,
): void {
  if (
    (operation.kind !== "other" && operation.kind !== kind) ||
    (operation.targets.length > 0 &&
      targets.length > 0 &&
      JSON.stringify(operation.targets) !== JSON.stringify(targets)) ||
    (operation.command !== undefined && command !== undefined && operation.command !== command)
  )
    operation.ambiguous = true;
  operation.kind = kind;
  if (targets.length > 0) operation.targets = targets;
  if (command !== undefined) operation.command = command;
}
/** A capture may supply content while still leaving part of execution unobservable. */
interface LedgerTrace {
  readonly operations: readonly LedgerTraceOperation[];
  readonly gaps: readonly number[];
}

function deliver(
  operation: MutableOperation,
  line: number,
  result: LedgerTraceOperation["result"],
  output: string,
): void {
  if (operation.delivered !== undefined) {
    if (operation.result !== result || operation.output !== output) operation.ambiguous = true;
    return;
  }
  operation.delivered = line;
  operation.result = result;
  operation.output = output;
}

/** Decode supported complete envelopes; preserve line order and incomplete operations. */
function parseLedgerTrace(
  input: string,
  format: "claude-stream-json" | "codex-jsonl",
): LedgerTrace {
  const operations = new Map<string, MutableOperation>();
  const gaps: number[] = [];
  let session: string | undefined;
  const find = (id: string, line: number): MutableOperation => {
    const key = JSON.stringify([session ?? null, id]);
    const previous = operations.get(key);
    if (previous !== undefined) return previous;
    const operation: MutableOperation = {
      id,
      session,
      kind: "other",
      targets: [],
      requested: line,
      result: "unknown",
      output: "",
      ambiguous: false,
    };
    operations.set(key, operation);
    return operation;
  };
  for (const [offset, text] of input.split("\n").entries()) {
    if (text.trim() === "") continue;
    const line = offset + 1;
    const raw = parseJson(text);
    if (raw === undefined) {
      gaps.push(line);
      continue;
    }
    if (format === "codex-jsonl") {
      const opened = thread.safeParse(raw);
      if (opened.success) {
        session = opened.data.thread_id;
        continue;
      }
      const parsed = codex.safeParse(raw);
      if (!parsed.success) continue;
      const { type, item } = parsed.data;
      if (type !== "item.started" && type !== "item.completed") continue;
      const operation = find(item.id, line);
      const kind =
        item.type === "file_change"
          ? "change"
          : item.type === "command_execution"
            ? "command"
            : "other";
      identify(operation, kind, item.changes?.map((entry) => entry.path) ?? [], item.command);
      if (type === "item.completed")
        deliver(
          operation,
          line,
          item.status === "failed" ||
            (item.exit_code !== undefined && item.exit_code !== null && item.exit_code !== 0)
            ? "failed"
            : item.status === "completed" && (operation.kind !== "command" || item.exit_code === 0)
              ? "succeeded"
              : "unknown",
          item.aggregated_output ?? "",
        );
      continue;
    }
    const parsed = claude.safeParse(raw);
    if (!parsed.success) continue;
    session = parsed.data.session_id ?? session;
    const blocks = parsed.data.message?.content ?? [];
    for (const entry of blocks) {
      if (entry.type === "tool_use" && entry.id !== undefined) {
        const operation = find(entry.id, line);
        const kind =
          entry.name === "Read"
            ? "read"
            : entry.name === "Bash"
              ? "command"
              : entry.name === "Edit" || entry.name === "Write" || entry.name === "NotebookEdit"
                ? "change"
                : "other";
        identify(
          operation,
          kind,
          entry.input?.file_path === undefined ? [] : [entry.input.file_path],
          entry.input?.command,
        );
      }
      if (entry.type === "tool_result" && entry.tool_use_id !== undefined) {
        const operation = find(entry.tool_use_id, line);
        const file = readResult.safeParse(raw);
        const stdout = stdoutResult.safeParse(raw);
        const plain = z.string().safeParse(entry.content);
        const output = stdout.success
          ? stdout.data.tool_use_result.stdout
          : plain.success
            ? plain.data
            : "";
        let deliveredFile: LedgerTraceOperation["file"];
        if (file.success && blocks.filter((item) => item.type === "tool_result").length === 1) {
          const returned = file.data.tool_use_result.file;
          deliveredFile = {
            path: returned.filePath,
            content: returned.content,
            start: returned.startLine,
            count: returned.numLines,
            total: returned.totalLines,
          };
        }
        if (
          operation.delivered !== undefined &&
          JSON.stringify(operation.file) !== JSON.stringify(deliveredFile)
        )
          operation.ambiguous = true;
        if (operation.delivered === undefined) operation.file = deliveredFile;
        deliver(operation, line, entry.is_error === true ? "failed" : "succeeded", output);
      }
    }
  }
  return { operations: [...operations.values()], gaps };
}

function linesOf(content: string): readonly string[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Completed file edits in an explicitly matching captured context; absence proves nothing. */
export function observeTraceChanges(
  input: string,
  format: "claude-stream-json" | "codex-jsonl",
  context: string,
): readonly { readonly call: string; readonly line: number; readonly paths: readonly string[] }[] {
  return parseLedgerTrace(input, format).operations.flatMap((operation) =>
    operation.kind === "change" &&
    operation.session === context &&
    operation.result === "succeeded" &&
    !operation.ambiguous &&
    operation.delivered !== undefined
      ? [{ call: operation.id, line: operation.delivered, paths: operation.targets }]
      : [],
  );
}
function lineCountMatches(reported: number, content: string, lines: readonly string[]): boolean {
  // Claude counts the empty segment after a final newline; other captures omit it.
  return reported === lines.length || (content.endsWith("\n") && reported === lines.length + 1);
}
function targetMatches(path: string, relative: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized === relative || normalized.endsWith(`/${relative}`);
}

/** Compare actual returned content and delivery order with one pinned consultation claim. */
export function observeConsultation(
  trace: string,
  entry: LedgerConsultation,
  source: string,
  context: string,
): ConsultationObservation {
  const reference = entry.observation;
  const unavailable = (detail: string): ConsultationObservation => ({
    status: "unavailable",
    ordering: "unknown",
    detail,
  });
  if (entry.source.kind === "garden")
    return unavailable(
      "Garden service delivery comes from generated receipts; native capture has not been established here.",
    );
  if (reference === undefined)
    return {
      status: "declared",
      ordering: "unknown",
      detail: "Agent-declared consultation; no capture reference.",
    };
  const parsed = parseLedgerTrace(trace, reference.format);
  const matches = parsed.operations.filter((operation) => operation.id === reference.call);
  const matchingContext = matches.filter(
    (operation) => operation.session === undefined || operation.session === context,
  );
  const operation = matchingContext.length === 1 ? matchingContext[0] : undefined;
  if (operation === undefined)
    return matches.length > 0 && matchingContext.length === 0
      ? {
          status: "contradicted",
          ordering: "unknown",
          detail: "The referenced operation belongs to another captured context.",
        }
      : unavailable("The referenced operation is missing or ambiguous in this capture.");
  if (operation.ambiguous) return unavailable("Conflicting results share this operation identity.");
  if (operation.result === "failed" || operation.kind === "change")
    return {
      status: "contradicted",
      ordering: "unknown",
      detail: "The cited operation failed or records a write, not delivered guidance.",
    };
  if (operation.result !== "succeeded" || operation.delivered === undefined)
    return unavailable("No successful result delivery is captured.");
  const all = linesOf(source);
  const start = entry.lines?.start ?? 1;
  const end = entry.lines?.end ?? all.length;
  if (end > all.length || start > end)
    return unavailable("The claimed range does not resolve in the pinned source.");
  const expected = all.slice(start - 1, end).join("\n");
  let supplied = false;
  if (operation.kind === "read" && operation.file !== undefined) {
    const file = operation.file;
    const sourcePath = entry.source.path;
    const returned = linesOf(file.content);
    const from = start - file.start;
    supplied =
      targetMatches(file.path, sourcePath) &&
      operation.targets.some((path) => targetMatches(path, sourcePath)) &&
      lineCountMatches(file.total, source, all) &&
      lineCountMatches(file.count, file.content, returned) &&
      from >= 0 &&
      end < file.start + file.count &&
      returned.slice(from, from + end - start + 1).join("\n") === expected;
  } else if (operation.kind === "command") {
    supplied =
      expected.length > 0 &&
      (operation.command?.includes(entry.source.path) ?? false) &&
      `\n${linesOf(operation.output).join("\n")}\n`.includes(`\n${expected}\n`);
  }
  if (!supplied)
    return unavailable(
      "The result does not expose the claimed content and coverage; a command or path mention is insufficient.",
    );
  const changes = parsed.operations.filter(
    (item) =>
      item.kind === "change" &&
      item.result === "succeeded" &&
      !item.ambiguous &&
      item.session === operation.session &&
      item.targets.some((path) => !/[\\/]?\.greenline[\\/](?:ledger|work|tmp)[\\/]/.test(path)),
  );
  const firstChange = changes.reduce<number | undefined>(
    (first, item) =>
      item.delivered === undefined
        ? first
        : first === undefined
          ? item.delivered
          : Math.min(first, item.delivered),
    undefined,
  );
  const ordering =
    firstChange === undefined || parsed.gaps.length > 0
      ? "unknown"
      : operation.delivered < firstChange
        ? "before-observed-change"
        : "after-observed-change";
  const late = entry.stage === "before-work" && ordering === "after-observed-change";
  return {
    status: late ? "contradicted" : "observed",
    ordering,
    detail: late
      ? "Content arrived after an observed change, contradicting before-work consultation."
      : `The claimed content was returned in this supplied capture.${operation.session === undefined ? " Context identity is unavailable." : ""}${parsed.gaps.length > 0 ? " Capture gaps leave ordering unknown." : ""} Delivery does not prove comprehension or independent provenance.`,
  };
}
