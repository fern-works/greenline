import { Command, CommanderError, type OptionValues } from "commander";
import { z } from "zod";
import { isRepositoryPath } from "../../commons/repository-path.ts";
import { FACETS, type Query } from "../../core/cabinet.ts";

/** The agent supplies every selection and request boundary explicitly. */
export interface GuidanceCommand {
  readonly operation: "list" | "read" | "resolve" | "vocabulary";
  readonly ids: readonly string[];
  readonly query: Query;
  readonly record: string | undefined;
  readonly request: string | undefined;
  readonly fromRequest: string | undefined;
  readonly readOnly: boolean;
  readonly snapshot: string | undefined;
  readonly context: string | undefined;
  readonly role: ContributorRole | undefined;
  readonly call: string | undefined;
  readonly maxUnits: number | undefined;
  readonly maxBytes: number | undefined;
  readonly timeoutMs: number | undefined;
  readonly closure: boolean;
  readonly excluded: readonly string[];
  readonly roots: readonly string[];
}
/** The five roles a contributor may declare; the CLI records one, never awards it. */
export type ContributorRole =
  | "implementation"
  | "review"
  | "verification"
  | "planning"
  | "maintenance";
const text = z.string().min(1).optional();
const words = z.array(z.string()).default([]);
const number = z.coerce.number().int().positive().optional();
const role = z
  .enum(["implementation", "review", "verification", "planning", "maintenance"])
  .optional();
const optionsSchema = z
  .object({
    record: text,
    request: text,
    fromRequest: text,
    readOnly: z.boolean().default(false),
    snapshot: text,
    context: text,
    role,
    call: text,
    maxUnits: number,
    maxBytes: number,
    timeoutMs: number,
    requires: z.boolean().default(false),
    exclude: words,
    root: z
      .array(z.string().refine((value) => value === "." || isRepositoryPath(value)))
      .default([]),
    language: words,
    purpose: words,
    technology: words,
    task: words,
    concern: words,
    kind: words,
    responsibility: words,
  })
  .strict();
const collect = (value: string, previous: readonly string[]): readonly string[] => [
  ...previous,
  value,
];

/** Parse only; command execution, provider access and receipt writes happen later. */
export function parseGuidanceArgs(
  argv: readonly string[],
):
  | { readonly kind: "run"; readonly command: GuidanceCommand }
  | { readonly kind: "help"; readonly text: string }
  | { readonly kind: "error"; readonly message: string } {
  let command: GuidanceCommand | undefined;
  let invalid: string | undefined;
  let output = "";
  const program = new Command()
    .name("greenline guidance")
    .description(
      "Query and read guidance; all replies are JSON and selection stays with the agent.",
    )
    .exitOverride();
  program.configureOutput({
    writeOut: (chunk) => {
      output += chunk;
    },
    writeErr: () => undefined,
  });
  const common = (verb: Command): Command =>
    verb
      .option(
        "--root <path>",
        "explicit governed root (repeatable; required for read-only full reads)",
        collect,
        [],
      )
      .option("--record <id>", "owning execution account for a new durable request")
      .option("--read-only", "keep receipts in the tool result; write no repository files")
      .option("--request <handle>", "continue the exact request binding")
      .option("--from-request <handle>", "new contributor using an existing request's publication")
      .option("--snapshot <id>", "explicit historical publication; never substitute current")
      .option("--context <id>", "provided context identity; must match the account")
      .option(
        "--role <role>",
        "declared contributor role for a read-only caller (implementation, review, verification, planning or maintenance)",
      )
      .option("--call <id>", "provided native tool-call identity, if available")
      .option("--max-units <number>", "freeze the request's read limit (default 16)")
      .option("--max-bytes <number>", "freeze its UTF-8 content budget (default 262144)")
      .option(
        "--timeout-ms <number>",
        "deadline per command invocation, including requires (default 30000)",
      );
  const take = (
    operation: GuidanceCommand["operation"],
    ids: readonly string[],
    options: OptionValues,
  ): void => {
    const parsed = optionsSchema.safeParse(options);
    if (!parsed.success) {
      invalid = parsed.error.issues
        .map((issue) => issue.path.join(".") + ": " + issue.message)
        .join("; ");
      return;
    }
    const value = parsed.data;
    command = {
      operation,
      ids,
      query: {
        language: value.language,
        purpose: value.purpose,
        technology: value.technology,
        task: value.task,
        concern: value.concern,
        kind: value.kind,
        responsibility: value.responsibility,
      },
      record: value.record,
      request: value.request,
      fromRequest: value.fromRequest,
      readOnly: value.readOnly,
      snapshot: value.snapshot,
      context: value.context,
      role: value.role,
      call: value.call,
      maxUnits: value.maxUnits,
      maxBytes: value.maxBytes,
      timeoutMs: value.timeoutMs,
      closure: value.requires,
      excluded: value.exclude,
      roots: value.root,
    };
  };
  const list = common(
    program
      .command("list")
      .description("Return every matching candidate and its condition, summary and count"),
  );
  for (const facet of [...FACETS, "kind", "responsibility"])
    list.option(
      `--${facet} <value>`,
      `${facet} filter (repeatable; OR within, AND across fields)`,
      collect,
      [],
    );
  list.action((options) => take("list", [], options));
  common(
    program
      .command("read <ids...>")
      .description("Deliver selected original units with verified identities"),
  )
    .option("--requires", "follow required reading once per closure")
    .option(
      "--exclude <id>",
      "additional prohibited unit id (repeatable; containment is expanded)",
      collect,
      [],
    )
    .action((ids: string[], options: OptionValues) => take("read", ids, options));
  common(
    program.command("resolve <anchor>").description("Resolve an anchor to its owning unit"),
  ).action((anchor: string, options: OptionValues) => take("resolve", [anchor], options));
  common(program.command("vocabulary").description("Return the bound vocabulary")).action(
    (options) => take("vocabulary", [], options),
  );
  try {
    const input =
      argv.length > 1 && argv.every((value) => value === "help") ? ["--help"] : [...argv];
    program.parse(input, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError)
      return error.code === "commander.helpDisplayed" ||
        (error.code === "commander.help" && error.exitCode === 0)
        ? { kind: "help", text: output }
        : {
            kind: "error",
            message:
              error.code === "commander.help"
                ? "choose list, read, resolve or vocabulary; run 'greenline guidance --help'"
                : error.message,
          };
    throw error;
  }
  if (invalid !== undefined) return { kind: "error", message: invalid };
  return command === undefined
    ? { kind: "error", message: "choose list, read, resolve or vocabulary" }
    : { kind: "run", command };
}
