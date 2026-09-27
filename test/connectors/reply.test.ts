import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GardenInputRefused,
  gardenArguments,
  type GardenOperation,
} from "../../src/core/connectors/garden.ts";
import {
  GardenReplyRefused,
  readGardenReply,
  type GardenCallIdentity,
} from "../../src/core/connectors/garden-result.ts";

/**
 * greenline's reader of garden's replies, proved on the copied fixtures:
 * each is accepted as the answer to the call it describes, and each way a
 * reply can fail to be that answer is refused with its own reason.
 */

const FIXTURES = join(import.meta.dirname, "../../contracts/garden/fixtures");
const documentSchema = z.record(z.string(), z.json());
const fixture = (name: string) =>
  documentSchema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")));
const text = (document: z.infer<typeof documentSchema>): string => `${JSON.stringify(document)}\n`;
const ORIGIN = "https://garden.example/";
const operationSchema = z.enum(["snapshot", "vocabulary", "list", "read", "resolve", "changes"]);

const limitsSchema = z
  .object({
    timeoutMs: z.number(),
    maxUnits: z.number().nullable(),
    maxBytes: z.number().nullable(),
  })
  .nullable();
/** The read budget the read fixture ran under, which its call named. */
const BUDGET = { maxUnits: 16, maxBytes: 262144 };

/** The call a fixture answers, as greenline would have made it. */
function identity(name: string): GardenCallIdentity {
  const document = fixture(name);
  const operation = operationSchema.parse(document["operation"] ?? "snapshot");
  const call = z.string().parse(document["callId"]);
  const timeoutMs = limitsSchema.parse(document["limits"])?.timeoutMs ?? 30000;
  if (operation === "changes")
    return {
      operation,
      callId: call,
      origin: ORIGIN,
      timeoutMs,
      pair: { from: "example-publication-a", to: "example-publication-b" },
    };
  const base = {
    operation,
    callId: call,
    origin: ORIGIN,
    timeoutMs,
    publication: "example-publication-a",
  };
  if (operation === "resolve") return { ...base, anchor: "example-anchor" };
  return operation === "read"
    ? { ...base, read: { ids: ["example-rule"], requires: true, exclude: [], ...BUDGET } }
    : base;
}

describe("reading garden's replies", () => {
  const names = readdirSync(FIXTURES).map((name) => name.slice(0, -".json".length));

  it.each(names.filter((name) => name.startsWith("success-") && name !== "success-capabilities"))(
    "%s is accepted as the answer to the call it describes",
    (name) => {
      const reply = readGardenReply(text(fixture(name)), 0, identity(name));
      expect(reply._tag).toBe("ok");
      if (reply._tag !== "ok" || !reply.value.ok) return;
      expect(reply.value.origin).toBe(ORIGIN);
    },
  );

  it.each(
    names.filter((name) => name.startsWith("refusal-") && name !== "refusal-invalid-request"),
  )("%s is accepted as a typed refusal of its call", (name) => {
    const reply = readGardenReply(text(fixture(name)), 2, identity(name));
    expect(reply._tag).toBe("ok");
    if (reply._tag !== "ok" || reply.value.ok) return;
    expect(reply.value.error.kind).toBe(name.slice("refusal-".length));
  });

  it("a read's delivery carries each unit's identity, revision, content hash and bytes", () => {
    const reply = readGardenReply(text(fixture("success-read")), 0, identity("success-read"));
    if (reply._tag !== "ok" || !reply.value.ok) throw new Error("the read was refused");
    expect(reply.value.delivery.map((unit) => [unit.id, unit.bytes])).toEqual([
      ["example-prerequisite", 546],
      ["example-rule", 575],
    ]);
  });

  const read = fixture("success-read");
  const readResult = z
    .object({ units: z.array(z.record(z.string(), z.json())) })
    .parse(read["result"]);
  const delivery = z
    .object({ units: z.array(z.record(z.string(), z.json())), bytes: z.number() })
    .parse(read["delivery"]);
  const refusals: readonly [string, string, 0 | 2, string][] = [
    ["not one document", "malformed", 0, "not json at all\n"],
    ["another format version", "format", 0, text({ ...read, format: "garden.result/v2" })],
    ["a field the schema does not hold", "schema", 0, text({ ...read, key: "gdn_secret" })],
    ["a refusal under exit 0", "exit", 0, text(fixture("refusal-budget"))],
    ["a success under exit 2", "exit", 2, text(read)],
    ["another call id", "call", 0, text({ ...read, callId: "someone-else" })],
    [
      "another operation",
      "call",
      0,
      text({ ...fixture("success-list"), callId: read["callId"] ?? null }),
    ],
    ["another origin", "origin", 0, text({ ...read, origin: "https://elsewhere.example/" })],
    [
      "another publication",
      "publication",
      0,
      text({
        ...read,
        snapshot: { id: "example-publication-b", publishedAt: "2026-01-02T00:00:00.000Z" },
      }),
    ],
    [
      "a unit delivered twice",
      "duplicate",
      0,
      text({
        ...read,
        delivery: { units: [...delivery.units, ...delivery.units], bytes: delivery.bytes * 2 },
        result: { units: [...readResult.units, ...readResult.units] },
      }),
    ],
    [
      "a body its delivery entry does not bind",
      "body",
      0,
      text({
        ...read,
        result: {
          units: readResult.units.map((unit) => ({
            ...unit,
            content: `${String(unit["content"])}!`,
          })),
        },
      }),
    ],
    [
      "a delivery whose byte total is not its bodies'",
      "body",
      0,
      text({ ...read, delivery: { ...delivery, bytes: delivery.bytes + 1 } }),
    ],
  ];

  it.each(refusals)("refuses %s as %s", (_what, problem, exit, input) => {
    const reply = readGardenReply(input, exit, identity("success-read"));
    expect(reply._tag).toBe("err");
    if (reply._tag !== "err") return;
    expect(reply.error).toBeInstanceOf(GardenReplyRefused);
    expect(reply.error.problem).toBe(problem);
  });

  const other = { id: "example-publication-b", publishedAt: "2026-01-02T00:00:00.000Z" };
  const listing = fixture("success-list");
  const listed = z.record(z.string(), z.json()).parse(listing["result"]);
  const compared = z.record(z.string(), z.json()).parse(fixture("success-changes")["result"]);
  const refusal = fixture("refusal-not-found");
  it.each<[string, string, string, 0 | 2, z.infer<typeof documentSchema>]>([
    [
      "a snapshot whose result names another publication",
      "publication",
      "success-snapshot",
      0,
      { ...fixture("success-snapshot"), result: other },
    ],
    [
      "a resolve of another anchor",
      "call",
      "success-resolve",
      0,
      { ...fixture("success-resolve"), result: { anchor: "another-anchor", id: "example-rule" } },
    ],
    [
      "a listing whose count is not its units",
      "count",
      "success-list",
      0,
      { ...listing, result: { ...listed, count: 5 } },
    ],
    [
      "a comparison whose count is not its units",
      "count",
      "success-changes",
      0,
      { ...fixture("success-changes"), result: { ...compared, count: 7 } },
    ],
    [
      "a reply under another deadline than the call named",
      "limits",
      "success-read",
      0,
      { ...read, limits: { timeoutMs: 1000, maxUnits: 16, maxBytes: 262144 } },
    ],
    [
      "a refusal whose subject carries a bidirectional override",
      "malformed",
      "refusal-not-found",
      2,
      { ...refusal, error: { kind: "not-found", subject: "example\u202erule" } },
    ],
    [
      "a publication id carrying a C1 control",
      "publication",
      "success-vocabulary",
      0,
      {
        ...fixture("success-vocabulary"),
        snapshot: { id: "example-publication-\u0085", publishedAt: "2026-01-01T00:00:00.000Z" },
      },
    ],
    [
      "a refusal whose subject is not a short literal",
      "malformed",
      "refusal-not-found",
      2,
      { ...refusal, error: { kind: "not-found", subject: "x".repeat(257) } },
    ],
  ])("refuses %s as %s", (_what, problem, name, exit, document) => {
    const reply = readGardenReply(text(document), exit, identity(name));
    expect(reply._tag === "err" ? reply.error.problem : "accepted").toBe(problem);
  });

  it("refuses a read that delivers past the budget its call named", () => {
    const call = identity("success-read");
    const budget = { ...BUDGET, maxUnits: 1 };
    const reply = readGardenReply(text({ ...read, limits: { timeoutMs: 30000, ...budget } }), 0, {
      ...call,
      read: { ids: ["example-rule"], requires: true, exclude: [], ...budget },
    });
    expect(reply._tag === "err" ? reply.error.problem : "accepted").toBe("limits");
  });

  it("refuses two documents on stdout, and trailing text after the one", () => {
    const one = text(read);
    for (const input of [`${one}${one}`, `${one}garden: extra\n`]) {
      const reply = readGardenReply(input, 0, identity("success-read"));
      expect(reply._tag === "err" ? reply.error.problem : "accepted").toBe("malformed");
    }
  });

  it("refuses a read that delivered an excluded unit, a unit not asked for, or missed one asked for", () => {
    const call = identity("success-read");
    const cases: readonly GardenCallIdentity["read"][] = [
      { ids: ["example-rule"], requires: true, exclude: ["example-prerequisite"], ...BUDGET },
      { ids: ["example-rule"], requires: false, exclude: [], ...BUDGET },
      { ids: ["example-rule", "example-other"], requires: true, exclude: [], ...BUDGET },
    ];
    for (const asked of cases) {
      const reply = readGardenReply(text(read), 0, { ...call, read: asked });
      expect(reply._tag === "err" ? reply.error.problem : "accepted").toBe("call");
    }
  });

  it("an older garden's refusal of the command line is read as its refusal", () => {
    const reply = readGardenReply(
      text(fixture("refusal-invalid-request")),
      2,
      identity("success-read"),
    );
    expect(reply._tag).toBe("ok");
    if (reply._tag !== "ok" || reply.value.ok) return;
    expect(reply.value.error).toEqual({ kind: "invalid-request", subject: "command" });
  });
});

describe("the literal command line", () => {
  const call = { endpoint: ORIGIN, callId: "call-1", timeoutMs: 30000 };

  it.each<[GardenOperation, Parameters<typeof gardenArguments>[0], readonly string[]]>([
    ["snapshot", { operation: "snapshot", id: "current" }, ["snapshot", "--id=current"]],
    [
      "vocabulary",
      { operation: "vocabulary", snapshot: "pub-a" },
      ["vocabulary", "--snapshot=pub-a"],
    ],
    [
      "list",
      {
        operation: "list",
        snapshot: "pub-a",
        query: { task: ["implement"], kind: ["rule", "pattern"] },
      },
      ["list", "--snapshot=pub-a", "--task=implement", "--kind=rule", "--kind=pattern"],
    ],
    [
      "read",
      {
        operation: "read",
        snapshot: "pub-a",
        ids: ["unit-one"],
        requires: true,
        exclude: ["unit-two"],
        maxUnits: 4,
        maxBytes: 1000,
      },
      [
        "read",
        "--snapshot=pub-a",
        "--id=unit-one",
        "--requires",
        "--exclude=unit-two",
        "--max-units=4",
        "--max-bytes=1000",
      ],
    ],
    [
      "resolve",
      { operation: "resolve", snapshot: "pub-a", anchor: "an anchor" },
      ["resolve", "--snapshot=pub-a", "--anchor=an anchor"],
    ],
    [
      "changes",
      { operation: "changes", from: "pub-a", to: "pub-b" },
      ["changes", "--from=pub-a", "--to=pub-b"],
    ],
  ])(
    "%s passes each neutral input as one --flag=value argument, then the endpoint and call",
    (_name, read, head) => {
      expect(gardenArguments(read, call)).toEqual({
        _tag: "ok",
        value: [...head, `--url=${ORIGIN}`, "--call-id=call-1", "--timeout-ms=30000"],
      });
    },
  );

  it.each<[string, Parameters<typeof gardenArguments>[0], string]>([
    [
      "a flag as a unit id",
      {
        operation: "read",
        snapshot: "pub-a",
        ids: ["--url=https://evil.example/"],
        requires: false,
        exclude: [],
        maxUnits: 16,
        maxBytes: 262144,
      },
      "--id",
    ],
    [
      "no unit",
      {
        operation: "read",
        snapshot: "pub-a",
        ids: [],
        requires: false,
        exclude: [],
        maxUnits: 16,
        maxBytes: 262144,
      },
      "--id",
    ],
    [
      "a limit past garden's",
      {
        operation: "read",
        snapshot: "pub-a",
        ids: ["unit"],
        requires: false,
        exclude: [],
        maxUnits: 17,
        maxBytes: 262144,
      },
      "--max-units",
    ],
    ["an empty list query", { operation: "list", snapshot: "pub-a", query: {} }, "--language"],
    [
      "a control character",
      { operation: "list", snapshot: "pub-a", query: { task: ["a\nb"] } },
      "--task",
    ],
    [
      "a bidirectional override in an anchor",
      { operation: "resolve", snapshot: "pub-a", anchor: "x\u202e" },
      "--anchor",
    ],
    [
      "a C1 control in a publication",
      { operation: "vocabulary", snapshot: "pub-\u0085" },
      "--snapshot",
    ],
    ["current in a comparison", { operation: "changes", from: "current", to: "pub-b" }, "--from"],
    ["an empty anchor", { operation: "resolve", snapshot: "pub-a", anchor: "" }, "--anchor"],
  ])("refuses %s before anything runs", (_what, read, flag) => {
    const refused = gardenArguments(read, call);
    expect(refused._tag).toBe("err");
    if (refused._tag !== "err") return;
    expect(refused.error).toBeInstanceOf(GardenInputRefused);
    expect(refused.error.flag).toBe(flag);
  });
});
