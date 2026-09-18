import { expect, it } from "vitest";
import { observeConsultation, observeTraceChanges } from "../../src/core/ledger-observations.ts";
import { parseLedgerRecord } from "../../src/core/execution-ledger.ts";

// Envelope fields are witnessed in M7 Claude v5 lines 70/71 and Codex v6 item_1.
const source = "# Runner\n\nKeep the existing runner.\n";
function consultation(stage = "before-work", lines?: { start: number; end: number }) {
  const result = parseLedgerRecord(
    JSON.stringify({
      schemaVersion: 3,
      id: "op-one",
      context: "s",
      actor: "agent",
      role: "maintenance",
      scopes: ["."],
      selections: [
        {
          id: "law",
          kind: "guidance",
          source: { kind: "repository", path: "RULES.md", revision: "a".repeat(64) },
          stage,
          decision: "selected",
          reason: "Existing law.",
          lines,
          observation: {
            trace: { path: "trace.jsonl", revision: "b".repeat(64) },
            format: "claude-stream-json",
            call: "read-one",
          },
        },
      ],
    }),
    "fixture",
  );
  if (result._tag === "err" || result.value.selections[0] === undefined)
    throw new Error("invalid fixture");
  return result.value.selections[0];
}
const request = {
  type: "assistant",
  session_id: "s",
  message: {
    content: [
      { type: "tool_use", id: "read-one", name: "Read", input: { file_path: "/repo/RULES.md" } },
    ],
  },
};
const reply = {
  type: "user",
  session_id: "s",
  message: { content: [{ type: "tool_result", tool_use_id: "read-one", content: source }] },
  tool_use_result: {
    file: { filePath: "/repo/RULES.md", content: source, startLine: 1, numLines: 3, totalLines: 3 },
  },
};
const edit = {
  type: "assistant",
  session_id: "s",
  message: {
    content: [
      { type: "tool_use", id: "edit-one", name: "Edit", input: { file_path: "/repo/src/app.ts" } },
    ],
  },
};
const edited = {
  type: "user",
  session_id: "s",
  message: { content: [{ type: "tool_result", tool_use_id: "edit-one", content: "Updated" }] },
};
const jsonl = (rows: readonly (typeof request | typeof reply | typeof edited)[]) =>
  rows.map((row) => JSON.stringify(row)).join("\n");

it("does not attribute success to conflicting requests sharing one operation identity", () => {
  const other = {
    ...edit,
    message: {
      content: [
        {
          type: "tool_use",
          id: "edit-one",
          name: "Edit",
          input: { file_path: "/repo/.greenline/DECISIONS.md" },
        },
      ],
    },
  };
  expect(observeTraceChanges(jsonl([edit, other, edited]), "claude-stream-json", "s")).toEqual([]);
  const events = [
    { type: "thread.started", thread_id: "s" },
    {
      type: "item.completed",
      item: {
        id: "edit-one",
        type: "file_change",
        status: "completed",
        changes: [{ path: "src/app.ts" }],
      },
    },
    {
      type: "item.completed",
      item: {
        id: "edit-one",
        type: "file_change",
        status: "completed",
        changes: [{ path: ".greenline/DECISIONS.md" }],
      },
    },
  ];
  expect(
    observeTraceChanges(
      events.map((event) => JSON.stringify(event)).join("\n"),
      "codex-jsonl",
      "s",
    ),
  ).toEqual([]);
});

it("uses returned-content delivery order, not request order, to expose a late consultation", () => {
  expect(
    observeConsultation(jsonl([request, reply, edit, edited]), consultation(), source, "s"),
  ).toMatchObject({ status: "observed", ordering: "before-observed-change" });
  expect(
    observeConsultation(jsonl([request, edit, edited, reply]), consultation(), source, "s"),
  ).toMatchObject({ status: "contradicted", ordering: "after-observed-change" });
});

it("accepts Claude's captured count of the terminal empty line without accepting missing content", () => {
  // Actual M7 v5 Read 70/71 reports 120 lines for 119 newline-terminated lines.
  const terminal = {
    ...reply,
    tool_use_result: { file: { ...reply.tool_use_result.file, numLines: 4, totalLines: 4 } },
  };
  expect(observeConsultation(jsonl([request, terminal]), consultation(), source, "s").status).toBe(
    "observed",
  );
});

it("does not combine early partial delivery with conflicting later full metadata", () => {
  const partial = {
    ...reply,
    message: {
      content: [{ type: "tool_result", tool_use_id: "read-one", content: "Read returned" }],
    },
    tool_use_result: {
      file: { ...reply.tool_use_result.file, content: "# Runner\n", numLines: 1 },
    },
  };
  const full = { ...reply, message: partial.message };
  expect(
    observeConsultation(jsonl([request, partial, edit, edited, full]), consultation(), source, "s")
      .status,
  ).toBe("unavailable");
});

it("does not mistake a denied write attempt for a completed material change", () => {
  const denied = {
    ...edited,
    message: {
      content: [
        { type: "tool_result", tool_use_id: "edit-one", content: "Denied", is_error: true },
      ],
    },
  };
  expect(
    observeConsultation(jsonl([edit, denied, request, reply]), consultation(), source, "s"),
  ).toMatchObject({ status: "observed", ordering: "unknown" });
});

it("does not turn failed, interrupted, partial, or unrelated-context reads into observed full consultation", () => {
  const failed = {
    ...reply,
    message: {
      content: [
        { type: "tool_result", tool_use_id: "read-one", content: "Denied", is_error: true },
      ],
    },
  };
  const partial = {
    ...reply,
    tool_use_result: {
      file: { ...reply.tool_use_result.file, content: "# Runner\n", numLines: 1 },
    },
  };
  expect(observeConsultation(jsonl([request, failed]), consultation(), source, "s").status).toBe(
    "contradicted",
  );
  expect(observeConsultation(jsonl([request]), consultation(), source, "s").status).toBe(
    "unavailable",
  );
  expect(observeConsultation(jsonl([request, partial]), consultation(), source, "s").status).toBe(
    "unavailable",
  );
  expect(
    observeConsultation(jsonl([request, reply]), consultation(), source, "another").status,
  ).toBe("contradicted");
  expect(
    observeConsultation(
      jsonl([request, partial]),
      consultation("before-work", { start: 1, end: 1 }),
      source,
      "s",
    ).status,
  ).toBe("observed");
});

it("does not certify a path mention, successful compound command, or file change as delivered guidance", () => {
  const base = consultation();
  if (base.observation === undefined) throw new Error("observation fixture missing");
  const item = {
    id: "read-one",
    type: "command_execution",
    command: "cat RULES.md && greenline doctor",
    status: "completed",
    exit_code: 0,
    aggregated_output: "doctor clean\n",
  };
  const ref = { ...base, observation: { ...base.observation, format: "codex-jsonl" as const } };
  expect(
    observeConsultation(JSON.stringify({ type: "item.completed", item }), ref, source, "s").status,
  ).toBe("unavailable");
  expect(
    observeConsultation(
      JSON.stringify({ type: "item.completed", item: { ...item, aggregated_output: source } }),
      ref,
      source,
      "s",
    ).status,
  ).toBe("observed");
  expect(
    observeConsultation(
      JSON.stringify({
        type: "item.completed",
        item: { ...item, type: "file_change", changes: [{ path: "RULES.md" }] },
      }),
      ref,
      source,
      "s",
    ).status,
  ).toBe("contradicted");
});
