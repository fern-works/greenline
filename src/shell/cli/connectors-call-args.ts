import { Command, CommanderError, type OptionValues } from "commander";
import { z } from "zod";
import { isRepositoryPath } from "../../commons/repository-path.ts";
import { GARDEN_FILTERS, type GardenQuery } from "../../core/connectors/garden.ts";
import { parseConnectorId } from "../../core/connectors/registry.ts";
import { isVisibleText, nativeCallSchema } from "../../core/guidance-receipts.ts";

/**
 * The arguments of `greenline connectors call garden <operation>`. Parsing
 * runs nothing: it turns argv into one garden read and the request context
 * greenline keeps for it, or a usage refusal.
 */

/** One garden read as the caller asked for it; the request supplies the publication when it has one. */
export type GardenCallRead =
  | { readonly operation: "snapshot"; readonly id: string | undefined }
  | { readonly operation: "vocabulary"; readonly snapshot: string | undefined }
  | {
      readonly operation: "list";
      readonly snapshot: string | undefined;
      readonly query: GardenQuery;
    }
  | {
      readonly operation: "read";
      readonly snapshot: string | undefined;
      readonly ids: readonly string[];
      readonly requires: boolean;
      readonly exclude: readonly string[];
    }
  | {
      readonly operation: "resolve";
      readonly snapshot: string | undefined;
      readonly anchor: string;
    }
  | { readonly operation: "changes"; readonly from: string; readonly to: string };

/** One call and the greenline request it belongs to. */
export interface GardenCallCommand {
  readonly read: GardenCallRead;
  /** The account a new request belongs to. */
  readonly record: string | undefined;
  /** The request a call continues. */
  readonly request: string | undefined;
  readonly roots: readonly string[];
  readonly context: string | undefined;
  /** The harness's own tool-call identity, recorded as supplied once it holds no invisible character. */
  readonly call: string | undefined;
  readonly maxUnits: number | undefined;
  readonly maxBytes: number | undefined;
  readonly timeoutMs: number | undefined;
}

const optional = z.string().min(1).optional();
const required = z.string().min(1);
const count = z.coerce.number().int().positive().optional();
const repeated = z.array(z.string()).default([]);
const requestOptions = z.object({
  record: optional,
  request: optional,
  root: z
    .array(
      z
        .string()
        .refine(
          (value) => (value === "." || isRepositoryPath(value)) && isVisibleText(value),
          "a root path with no control, format, private-use or unassigned character",
        ),
    )
    .default([]),
  context: optional,
  call: nativeCallSchema.optional(),
  maxUnits: count,
  maxBytes: count,
  timeoutMs: count,
});
const listOptions = z.object({
  snapshot: optional,
  language: repeated,
  purpose: repeated,
  technology: repeated,
  task: repeated,
  concern: repeated,
  kind: repeated,
  responsibility: repeated,
});
const collect = (value: string, previous: readonly string[]): readonly string[] => [
  ...previous,
  value,
];
const OPERATIONS = "snapshot, vocabulary, list, read, resolve or changes";
const CHOOSE = `name a connector and one of its operations: garden ${OPERATIONS}`;

/** Parse only; the request, the policy, the call and its receipt happen later. */
export function parseGardenCallArgs(
  argv: readonly string[],
):
  | { readonly kind: "run"; readonly command: GardenCallCommand }
  | { readonly kind: "help"; readonly text: string }
  | { readonly kind: "error"; readonly message: string } {
  const named = argv[0];
  if (named !== undefined && !named.startsWith("-") && named !== "help") {
    const connector = parseConnectorId(named);
    if (connector._tag === "err") return { kind: "error", message: connector.error.message };
  }
  let command: GardenCallCommand | undefined;
  let invalid: string | undefined;
  let output = "";
  const program = new Command()
    .name("greenline connectors call")
    .description("Call a connector's read; the reply is JSON and every call leaves a receipt")
    .exitOverride();
  program.configureOutput({
    writeOut: (chunk) => {
      output += chunk;
    },
    writeErr: () => undefined,
  });
  const garden = program.command("garden").description(`Call garden: ${OPERATIONS}`);
  const operation = (name: string, description: string): Command =>
    garden
      .command(name)
      .description(description)
      .option("--record <id>", "the execution account a new request belongs to")
      .option("--request <handle>", "continue this request, under its publication and policy")
      .option(
        "--root <path>",
        "a governed root (repeatable; default the account's scopes)",
        collect,
        [],
      )
      .option("--context <id>", "the context identity; it must match the account")
      .option("--call <id>", "the harness's own tool-call identity, if it has one")
      .option("--max-units <number>", "freeze the request's unit limit (default and most 16)")
      .option("--max-bytes <number>", "freeze its content budget (default and most 262144)")
      .option("--timeout-ms <number>", "freeze each call's deadline (default and most 30000)");
  /** The action that reads one operation's own options into its read. */
  const take =
    <T>(schema: z.ZodType<T>, build: (value: T) => GardenCallRead) =>
    (options: OptionValues): void => {
      const context = requestOptions.safeParse(options);
      const reading = schema.safeParse(options);
      if (!context.success || !reading.success) {
        invalid = [...(context.error?.issues ?? []), ...(reading.error?.issues ?? [])]
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        return;
      }
      command = {
        read: build(reading.data),
        record: context.data.record,
        request: context.data.request,
        roots: context.data.root,
        context: context.data.context,
        call: context.data.call,
        maxUnits: context.data.maxUnits,
        maxBytes: context.data.maxBytes,
        timeoutMs: context.data.timeoutMs,
      };
    };
  operation("snapshot", "Resolve current once, or name an exact publication")
    .option("--id <publication>", "current (the default) or an exact publication id")
    .action(take(z.object({ id: optional }), (value) => ({ operation: "snapshot", id: value.id })));
  operation("vocabulary", "Every value a facet, kind or responsibility may carry")
    .option("--snapshot <publication>", "an exact publication for a new request")
    .action(
      take(z.object({ snapshot: optional }), (value) => ({
        operation: "vocabulary",
        snapshot: value.snapshot,
      })),
    );
  const list = operation("list", "The units matching the filters, listing metadata only").option(
    "--snapshot <publication>",
    "an exact publication for a new request",
  );
  for (const facet of GARDEN_FILTERS)
    list.option(`--${facet} <value>`, `${facet} filter (repeatable)`, collect, []);
  list.action(
    take(listOptions, ({ snapshot, ...query }) => ({ operation: "list", snapshot, query })),
  );
  operation("read", "Full units, their exact text bound to revision and content hash")
    .option("--snapshot <publication>", "an exact publication for a new request")
    .option("--id <unit>", "a unit to read (repeatable)", collect, [])
    .option("--requires", "also read the units each selected unit requires")
    .option("--exclude <unit>", "a unit never to read (repeatable)", collect, [])
    .action(
      take(
        z.object({
          snapshot: optional,
          id: repeated,
          requires: z.boolean().default(false),
          exclude: repeated,
        }),
        (value) => ({
          operation: "read",
          snapshot: value.snapshot,
          ids: value.id,
          requires: value.requires,
          exclude: value.exclude,
        }),
      ),
    );
  operation("resolve", "The unit that carries an anchor")
    .option("--snapshot <publication>", "an exact publication for a new request")
    .requiredOption("--anchor <name>", "the anchor to resolve")
    .action(
      take(z.object({ snapshot: optional, anchor: required }), (value) => ({
        operation: "resolve",
        snapshot: value.snapshot,
        anchor: value.anchor,
      })),
    );
  operation("changes", "Compare two exact publications, in a request of its own")
    .requiredOption("--from <publication>", "the earlier publication")
    .requiredOption("--to <publication>", "the later publication")
    .action(
      take(z.object({ from: required, to: required }), (value) => ({
        operation: "changes",
        from: value.from,
        to: value.to,
      })),
    );
  try {
    program.parse([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError)
      return error.code === "commander.helpDisplayed" ||
        (error.code === "commander.help" && error.exitCode === 0)
        ? { kind: "help", text: output }
        : { kind: "error", message: error.code === "commander.help" ? CHOOSE : error.message };
    throw error;
  }
  if (invalid !== undefined) return { kind: "error", message: invalid };
  return command === undefined ? { kind: "error", message: CHOOSE } : { kind: "run", command };
}
