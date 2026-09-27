import { once } from "node:events";
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, parse } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../../src/core/contract.ts";
import type { RootExclusion } from "../../src/core/root-statements.ts";
import { runConnectorsCallCli } from "../../src/shell/cli/connectors-call.ts";
import { readExecutionLedger } from "../../src/shell/execution-ledger.ts";
import { GuidanceRequests } from "../../src/shell/guidance-requests.ts";
import { createNodeFileIo, type FileIo } from "../../src/shell/fs/io.ts";
import { AtomicWriteFailed } from "../../src/shell/fs/io.ts";
import { err } from "../../src/commons/result.ts";
import {
  ACCOUNT,
  call,
  gardenWorkspace,
  runs,
  stored,
  type GardenWorkspace,
} from "./garden-fixture.ts";
import { read, run, tree } from "./workspace.ts";

const A = { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" };
const B = { id: "example-publication-b", publishedAt: "2026-01-02T00:00:00.000Z" };
const ENDPOINT = "https://garden.example/";
const RULE = {
  id: "example-rule",
  coverage: "full",
  revision: "aeac74735d30cbaf048380f01d0166412d106a2c367a6262a50f3fd5ec29c4b2",
  contentHash: "ebfa459986c396971ad885f7964ac08410d12d6fada2a9472f6b2cfc46fb5927",
};
const PREREQUISITE = {
  id: "example-prerequisite",
  coverage: "full",
  revision: "2c9b3b577036484d8fd034e3f04220e7fcd4a6c24a15dae5f21e108251dc240e",
  contentHash: "e4b8ed50296714f026a6d860194b8d34d291cec5e0b07124adbc73b75ef042e4",
};

const workspaces: GardenWorkspace[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.remove();
});
/** A garden workspace removed after the test. */
function workspace(prefix: string, options: Parameters<typeof gardenWorkspace>[1] = {}) {
  const created = gardenWorkspace(prefix, options);
  workspaces.push(created);
  return created;
}
/** The request collections a workspace holds. */
function collections(garden: GardenWorkspace): readonly string[] {
  const directory = join(garden.root, ".greenline/ledger/receipts");
  return existsSync(directory) ? readdirSync(directory) : [];
}
/** The one request a new call opened. */
function only(garden: GardenWorkspace) {
  const [name] = collections(garden);
  if (name === undefined || collections(garden).length !== 1)
    throw new Error("expected one request");
  return stored(garden, name.slice(0, -".json".length));
}
/** The flag-value arguments of one logged run. */
function flagsOf(argv: readonly string[], name: string): readonly string[] {
  return argv
    .filter((arg) => arg.startsWith(`--${name}=`))
    .map((arg) => arg.slice(name.length + 3));
}

describe("the call command's refusals", () => {
  it("an unknown connector, or no operation, is a usage refusal before anything is read", async () => {
    const garden = workspace("usage");
    let err = "";
    const writer = {
      stdout: { write: () => undefined },
      stderr: {
        write: (text: string) => {
          err += text;
        },
      },
    };
    const env = { cwd: garden.root, environment: {} };
    expect(await runConnectorsCallCli(["gardn", "snapshot"], writer, env)).toBe(2);
    expect(err).toContain("no plugin is discovered or loaded");
    expect(await runConnectorsCallCli(["garden"], writer, env)).toBe(2);
    expect(err).toContain("snapshot, vocabulary, list, read, resolve or changes");
    expect(runs(garden)).toEqual([]);
  });

  it("a call is refused while garden is disabled, and without exactly one of --record and --request", async () => {
    const garden = workspace("disabled");
    for (const args of [["snapshot"], ["snapshot", "--record", ACCOUNT, "--request", "x"]]) {
      const refused = await call(garden, args);
      expect(refused.reply.error?.input).toBe(
        "choose --record for a new request or --request to continue one",
      );
    }
    expect(run(garden.root, ["connectors", "disable", "garden"]).code).toBe(0);
    const disabled = await call(garden, ["snapshot", "--record", ACCOUNT]);
    expect(disabled.code).toBe(1);
    expect(disabled.reply.error?.input).toBe(
      "garden is not enabled for this repository; run 'greenline connectors enable garden --url URL'",
    );
    expect(runs(garden)).toEqual([]);
    expect(collections(garden)).toEqual([]);
  });

  it("a call id holding an invisible character is a usage refusal before any receipt is written", async () => {
    const garden = workspace("call-id");
    for (const id of ["x\u202e", "x\u0085", "x\u200b"]) {
      const refused = await call(garden, ["snapshot", "--record", ACCOUNT, "--call", id]);
      expect(refused.code).toBe(2);
      expect(refused.reply.error?.input).toContain("call: a call id with no control");
    }
    expect(runs(garden)).toEqual([]);
    expect(collections(garden)).toEqual([]);
    const plain = await call(garden, ["snapshot", "--record", ACCOUNT, "--call", "toolu_01"]);
    expect(plain.code).toBe(0);
    expect(only(garden).receipts[0]?.nativeCall).toBe("toolu_01");
  });

  it("a --root holding an invisible character is a usage refusal before anything is read", async () => {
    const garden = workspace("root-character");
    for (const root of ["src\u202e", "src\u007f", "src\u200b"]) {
      const named = await call(garden, ["snapshot", "--record", ACCOUNT, "--root", root]);
      expect(named.code).toBe(2);
      expect(named.reply.error?.input).toContain("root.0: a root path with no control");
    }
    expect(runs(garden)).toEqual([]);
    expect(collections(garden)).toEqual([]);
  });

  it("a default root from an account scope holding an invisible character fails at the store's write, before garden runs", async () => {
    const garden = workspace("scope-character");
    const path = join(garden.root, `.greenline/ledger/records/${ACCOUNT}.json`);
    const account: { readonly [key: string]: JsonValue } = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, `${JSON.stringify({ ...account, scopes: ["src\u200b"] })}\n`);
    const scoped = await call(garden, ["snapshot", "--record", ACCOUNT]);
    expect(scoped.code).toBe(1);
    expect(scoped.reply.error).toEqual({
      kind: "evidence",
      input: "receipt update; the call is not recorded",
    });
    expect(runs(garden)).toEqual([]);
    // The request opened before its first receipt was refused; it records no call and binds nothing.
    const request = only(garden);
    expect(request.receipts).toEqual([]);
    expect(request.binding.state).toBe("unresolved");
  });
});

describe("the six operations through the synthetic garden", () => {
  it("a first snapshot resolves current once and binds the request to what garden named", async () => {
    const garden = workspace("snapshot");
    const result = await call(garden, ["snapshot", "--record", ACCOUNT]);
    expect(result.code).toBe(0);
    const request = only(garden);
    expect(result.reply.request).toBe(request.id);
    expect(request.source).toBe("garden");
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts.map((entry) => [entry.operation, entry.outcome])).toEqual([
      ["snapshot", "received"],
    ]);
    const [first] = runs(garden);
    expect(flagsOf(first?.argv ?? [], "id")).toEqual(["current"]);
    expect(flagsOf(first?.argv ?? [], "call-id")).toEqual([request.receipts[0]?.id]);
  });

  it("vocabulary, list, read and resolve continue under the bound publication, each sealed", async () => {
    const garden = workspace("continue");
    const opened = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const handle = opened.reply.request ?? "";
    for (const args of [
      ["vocabulary"],
      ["list", "--task", "implement"],
      ["read", "--id", "example-rule", "--requires"],
      ["resolve", "--anchor", "example-anchor"],
    ]) {
      const result = await call(garden, [...args, "--request", handle]);
      expect(result.code, args.join(" ")).toBe(0);
    }
    for (const logged of runs(garden).slice(1))
      expect(flagsOf(logged.argv, "snapshot")).toEqual([A.id]);
    const request = stored(garden, handle);
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(
      request.receipts.map((entry) => [entry.operation, entry.outcome, entry.count, entry.units]),
    ).toEqual([
      ["snapshot", "received", 0, []],
      ["vocabulary", "received", 0, []],
      ["list", "received", 2, []],
      ["read", "received", 2, [PREREQUISITE, RULE]],
      [
        "resolve",
        "received",
        1,
        [{ id: "example-rule", coverage: "metadata", revision: null, contentHash: null }],
      ],
    ]);
  });

  it("a first read in a new request resolves current and binds the publication it read", async () => {
    const garden = workspace("first-read");
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"]);
    expect(result.code).toBe(0);
    const request = only(garden);
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts[0]?.units).toEqual([RULE]);
    expect(flagsOf(runs(garden)[0]?.argv ?? [], "snapshot")).toEqual(["current"]);
  });

  it("a read's bodies reach the caller after the seal and never reach the receipt file", async () => {
    const garden = workspace("bodies");
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"]);
    expect(result.out).toContain("Synthetic text: the unit a contract fixture reads.");
    const request = only(garden);
    const file = read(garden.root, `.greenline/ledger/receipts/${request.id}.json`);
    expect(file).not.toContain("Synthetic text");
    expect(file).not.toContain('"content"');
    expect(result.reply.consultations).toEqual([
      { unit: "example-rule", consultation: `guidance-${request.id}-1-example-rule` },
    ]);
  });

  it("changes opens a comparison request of its own, bound to the pair it compared", async () => {
    const garden = workspace("changes");
    const result = await call(garden, [
      "changes",
      "--record",
      ACCOUNT,
      "--from",
      A.id,
      "--to",
      B.id,
    ]);
    expect(result.code).toBe(0);
    const request = only(garden);
    expect(request.binding).toEqual({ state: "comparison", origin: ENDPOINT, from: A, to: B });
    expect(request.publicationUse).toBe("historical");
    expect(request.receipts[0]).toMatchObject({
      operation: "changes",
      outcome: "received",
      count: 1,
      units: [],
    });
  });
});

describe("one publication per request", () => {
  it("a later call is refused when garden answers from another publication, and the binding holds", async () => {
    const garden = workspace("drift");
    const opened = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const handle = opened.reply.request ?? "";
    const drifted = await call(garden, ["read", "--request", handle, "--id", "example-rule"], {
      mode: "drift",
    });
    expect(drifted.code).toBe(1);
    expect(drifted.reply.error).toEqual({
      kind: "protocol",
      input: "publication: the reply reads another publication",
    });
    const request = stored(garden, handle);
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts[1]).toMatchObject({ outcome: "failed", units: [] });
  });

  it("a comparison never continues a read request, and a read never continues a comparison", async () => {
    const garden = workspace("comparison");
    const reading = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const comparing = await call(garden, [
      "changes",
      "--record",
      ACCOUNT,
      "--from",
      A.id,
      "--to",
      B.id,
    ]);
    const before = runs(garden).length;
    const attached = await call(garden, [
      "changes",
      "--request",
      reading.reply.request ?? "",
      "--from",
      A.id,
      "--to",
      B.id,
    ]);
    expect(attached.code).toBe(1);
    expect(attached.reply.error?.input).toContain("a comparison never continues a read request");
    const reversed = await call(garden, ["vocabulary", "--request", comparing.reply.request ?? ""]);
    expect(reversed.code).toBe(1);
    expect(reversed.reply.error?.input).toContain("a comparison request holds comparisons only");
    expect(runs(garden)).toHaveLength(before);
  });

  it("a call naming another publication than the bound one is refused before garden runs", async () => {
    const garden = workspace("rebind");
    const opened = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const refused = await call(garden, [
      "list",
      "--request",
      opened.reply.request ?? "",
      "--snapshot",
      B.id,
      "--task",
      "implement",
    ]);
    expect(refused.code).toBe(1);
    expect(refused.reply.error?.input).toContain(`bound to publication ${A.id}`);
    expect(runs(garden)).toHaveLength(1);
  });

  it("a request is refused after garden's endpoint or the repository's policy changed", async () => {
    const garden = workspace("moved");
    const opened = await call(garden, ["snapshot", "--record", ACCOUNT]);
    const handle = opened.reply.request ?? "";
    writeFileSync(join(garden.root, ".greenline/DECISIONS.md"), "# Decisions\n\nA new ruling.\n");
    const policy = await call(garden, ["vocabulary", "--request", handle]);
    expect(policy.reply.error?.input).toContain("policy changed since this request began");
    expect(
      run(garden.root, [
        "connectors",
        "enable",
        "garden",
        "--url",
        "https://other.example/",
        "--executable",
        garden.launcher,
      ]).code,
    ).toBe(0);
    const endpoint = await call(garden, ["vocabulary", "--request", handle]);
    expect(endpoint.reply.error?.input).toContain("endpoint changed since this request began");
    expect(runs(garden)).toHaveLength(1);
    expect(stored(garden, handle).receipts).toHaveLength(1);
  });

  it("an unresolved request keeps what it opened for: current stays current, an exact publication is named again", async () => {
    const garden = workspace("opened-for");
    const current = await call(garden, ["snapshot", "--record", ACCOUNT], {
      mode: "refusal:unavailable",
    });
    const exact = await call(garden, ["snapshot", "--record", ACCOUNT, "--id", A.id], {
      mode: "refusal:unavailable",
    });
    const before = runs(garden).length;
    const toExact = await call(garden, [
      "list",
      "--request",
      current.reply.request ?? "",
      "--snapshot",
      A.id,
      "--task",
      "implement",
    ]);
    expect(toExact.reply.error?.input).toContain("the request reads the current publication");
    const toCurrent = await call(garden, ["vocabulary", "--request", exact.reply.request ?? ""]);
    expect(toCurrent.reply.error?.input).toContain("the request reads an exact publication");
    expect(runs(garden)).toHaveLength(before);
    const named = await call(garden, [
      "vocabulary",
      "--request",
      exact.reply.request ?? "",
      "--snapshot",
      A.id,
    ]);
    expect(named.code).toBe(0);
    expect(stored(garden, exact.reply.request ?? "").publicationUse).toBe("historical");
  });

  it("a seal meeting a binding another call of the request fixed keeps that binding and is judged against it", async () => {
    const agreeing = workspace("concurrent-agree");
    const opened = await call(agreeing, ["snapshot", "--record", ACCOUNT], {
      mode: "refusal:unavailable",
    });
    const handle = opened.reply.request ?? "";
    const agreed = await call(agreeing, ["snapshot", "--request", handle], {
      started: () => bindElsewhere(agreeing, handle),
    });
    expect(agreed.code).toBe(0);
    const bound = stored(agreeing, handle);
    expect(bound.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(bound.receipts.map((entry) => entry.outcome)).toEqual([
      "failed",
      "received",
      "received",
    ]);

    const drifting = workspace("concurrent-drift");
    const reopened = await call(drifting, ["snapshot", "--record", ACCOUNT], {
      mode: "refusal:unavailable",
    });
    const second = reopened.reply.request ?? "";
    const refused = await call(drifting, ["snapshot", "--request", second], {
      mode: "drift",
      started: () => bindElsewhere(drifting, second),
    });
    expect(refused.reply.error).toEqual({
      kind: "protocol",
      input: "publication: the request is bound to another publication than the reply's",
    });
    const kept = stored(drifting, second);
    expect(kept.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(kept.receipts.map((entry) => entry.outcome)).toEqual(["failed", "failed", "received"]);
  });

  it("a seal waits out another writer's lock instead of leaving a finished call pending", async () => {
    const garden = workspace("lock-wait");
    const lock = join(garden.root, ".greenline/tmp/.write.lock");
    const waits: number[] = [];
    const result = await call(garden, ["snapshot", "--record", ACCOUNT], {
      started: () => writeFileSync(lock, "another writer\n"),
      wait: async (ms) => {
        waits.push(ms);
        rmSync(lock);
      },
    });
    expect(result.code).toBe(0);
    expect(waits).toEqual([50]);
    expect(only(garden).receipts.map((entry) => entry.outcome)).toEqual(["received"]);
  });

  it("a seal whose lock cannot be released afterwards is confirmed from the collection it wrote", async () => {
    const garden = workspace("lock-release");
    const real = createNodeFileIo();
    const temporary = join(garden.root, ".greenline/tmp");
    let receiptWrites = 0;
    const releaseFails: FileIo = {
      ...real,
      write: (path, content) => {
        const written = real.write(path, content);
        if (path.includes(".greenline/ledger/receipts/")) receiptWrites += 1;
        // After the seal lands, the lock's directory refuses the lock's removal.
        if (receiptWrites === 3) chmodSync(temporary, 0o555);
        return written;
      },
    };
    try {
      const result = await call(garden, ["snapshot", "--record", ACCOUNT], { io: releaseFails });
      // The lock left behind shows the release really failed; a root user, whom permissions do
      // not stop, fails here rather than pass without reaching the confirmation.
      expect(existsSync(join(temporary, ".write.lock"))).toBe(true);
      expect(result.code).toBe(0);
      expect(only(garden).receipts.map((entry) => entry.outcome)).toEqual(["received"]);
    } finally {
      chmodSync(temporary, 0o755);
    }
  });

  it("a policy that changes while garden runs fails the call and binds nothing", async () => {
    const garden = workspace("policy-during");
    const result = await call(garden, ["snapshot", "--record", ACCOUNT], {
      started: () =>
        writeFileSync(join(garden.root, ".greenline/DECISIONS.md"), "# Decisions\n\nChanged.\n"),
    });
    expect(result.reply.error).toEqual({
      kind: "configuration",
      input: "the repository's policy changed during the call",
    });
    const request = only(garden);
    expect(request.binding).toEqual({ state: "unresolved", origin: ENDPOINT });
    expect(request.receipts[0]).toMatchObject({ outcome: "failed", units: [] });
  });

  it("garden's budget refusal is recorded when a read would pass the request's frozen limit", async () => {
    const garden = workspace("budget");
    const result = await call(garden, [
      "read",
      "--record",
      ACCOUNT,
      "--id",
      "example-rule",
      "--requires",
      "--max-units",
      "1",
    ]);
    expect(result.reply.error).toEqual({ kind: "budget", input: "max-units" });
    expect(flagsOf(runs(garden)[0]?.argv ?? [], "max-units")).toEqual(["1"]);
  });

  it("a failed first call leaves the request unresolved, and a later call still binds it", async () => {
    const garden = workspace("unresolved");
    const failed = await call(garden, ["snapshot", "--record", ACCOUNT], {
      mode: "refusal:unavailable",
    });
    expect(failed.code).toBe(1);
    const handle = failed.reply.request ?? "";
    expect(stored(garden, handle).binding).toEqual({ state: "unresolved", origin: ENDPOINT });
    const retried = await call(garden, ["snapshot", "--request", handle]);
    expect(retried.code).toBe(0);
    expect(stored(garden, handle).binding).toEqual({
      state: "publication",
      origin: ENDPOINT,
      snapshot: A,
    });
  });
});

/** Another call of the same request, finishing first, binds it to publication A. */
function bindElsewhere(garden: GardenWorkspace, handle: string): void {
  const store = new GuidanceRequests(garden.root);
  const current = stored(garden, handle);
  const other = "55555555-5555-4555-8555-555555555555";
  store.begin(current, {
    id: other,
    operation: "snapshot",
    query: null,
    requested: ["current"],
    closure: false,
    excluded: [],
    roots: ["."],
    policyRevision: current.receipts[0]?.policyRevision ?? "",
    startedAt: current.createdAt,
    nativeCall: null,
  });
  store.settle(stored(garden, handle), other, {
    units: [],
    count: 0,
    error: null,
    at: current.createdAt,
    binding: { state: "publication", origin: ENDPOINT, snapshot: A },
  });
}

/** A decision book whose root statement for `.` carries these exclusions. */
function decide(garden: GardenWorkspace, exclusions: readonly RootExclusion[]): void {
  const statement = {
    root: ".",
    purpose: null,
    languages: [],
    technologies: [],
    decision: "#choices",
    exclusions,
  };
  writeFileSync(
    join(garden.root, ".greenline/DECISIONS.md"),
    `# Choices\n\n\`\`\`greenline-roots\n${JSON.stringify([statement])}\n\`\`\`\n`,
  );
}

describe("local policy", () => {
  it("a root's unit exclusion reaches garden as an exclusion and is recorded on the receipt", async () => {
    const garden = workspace("unit-exclusion");
    decide(garden, [{ kind: "unit", id: "example-other" }]);
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"]);
    expect(result.code).toBe(0);
    expect(flagsOf(runs(garden)[0]?.argv ?? [], "exclude")).toEqual(["example-other"]);
    expect(only(garden).receipts[0]?.excluded).toEqual(["example-other"]);
  });

  it("a responsibility-group exclusion is expanded through its own recorded listing before the read", async () => {
    const garden = workspace("group-exclusion");
    decide(garden, [{ kind: "option-group", responsibility: "example responsibility" }]);
    const result = await call(garden, [
      "read",
      "--record",
      ACCOUNT,
      "--id",
      "example-prerequisite",
    ]);
    expect(result.code).toBe(0);
    const [listing, reading] = runs(garden);
    expect(flagsOf(listing?.argv ?? [], "responsibility")).toEqual(["example responsibility"]);
    expect(flagsOf(listing?.argv ?? [], "snapshot")).toEqual(["current"]);
    expect(flagsOf(reading?.argv ?? [], "snapshot")).toEqual([A.id]);
    expect(flagsOf(reading?.argv ?? [], "exclude")).toEqual(["example-rule"]);
    const request = only(garden);
    expect(request.receipts.map((entry) => [entry.operation, entry.outcome, entry.count])).toEqual([
      ["list", "received", 1],
      ["read", "received", 1],
    ]);
    expect(request.receipts[1]?.excluded).toEqual(["example-rule"]);
  });

  it("a group with no members in the publication refuses the read rather than prohibit nothing", async () => {
    const garden = workspace("empty-group");
    decide(garden, [{ kind: "option-group", responsibility: "a misspelled responsibility" }]);
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"]);
    expect(result.code).toBe(1);
    expect(result.reply.error?.input).toBe(
      "excluded option group a misspelled responsibility has no members in this publication",
    );
    expect(runs(garden)).toHaveLength(1);
    expect(only(garden).receipts.map((entry) => entry.operation)).toEqual(["list"]);
  });
});

describe("what reaches garden", () => {
  it("garden gets neutral inputs as single literal arguments, its endpoint named, and no work-record path", async () => {
    const garden = workspace("arguments");
    const result = await call(garden, [
      "read",
      "--record",
      ACCOUNT,
      "--id",
      "example-rule",
      "--exclude",
      "example-other",
    ]);
    expect(result.code).toBe(0);
    const [logged] = runs(garden);
    const request = only(garden);
    expect(logged?.argv).toEqual([
      "read",
      "--snapshot=current",
      "--id=example-rule",
      "--exclude=example-other",
      "--max-units=16",
      "--max-bytes=262144",
      `--url=${ENDPOINT}`,
      `--call-id=${request.receipts[0]?.id}`,
      "--timeout-ms=30000",
    ]);
    // garden runs from the filesystem root, outside the repository.
    expect(logged?.cwd).toBe(parse(garden.root).root);
  });

  it("greenline's own variables stay behind while garden's key passes on", async () => {
    const garden = workspace("own-variables");
    const result = await call(garden, ["snapshot", "--record", ACCOUNT], {
      key: "gdn_key_for_garden",
      extra: {
        GREENLINE_EXAMPLE_KEY: "greenline-own-secret",
        Greenline_Example_Token: "mixed-case-secret",
      },
    });
    expect(result.code).toBe(0);
    const [logged] = runs(garden);
    expect(logged?.key).toBe("gdn_key_for_garden");
    expect(logged?.greenline).toEqual([]);
  });

  it("a read's own inputs are refused before its supporting listing runs", async () => {
    const garden = workspace("inputs-first");
    decide(garden, [{ kind: "option-group", responsibility: "example responsibility" }]);
    const refused = await call(garden, ["read", "--record", ACCOUNT, "--id", "Not_A_Unit"]);
    expect(refused.reply.error).toEqual({
      kind: "invalid-request",
      input: "--id must be one or more unit ids",
    });
    expect(runs(garden)).toEqual([]);
    expect(collections(garden)).toEqual([]);
  });

  it("a value that is not a neutral literal is refused before garden runs or any receipt exists", async () => {
    const garden = workspace("malicious-id");
    const refused = await call(garden, [
      "read",
      "--record",
      ACCOUNT,
      "--id",
      "--url=https://evil.example/",
    ]);
    expect(refused.code).toBe(1);
    expect(refused.reply.error).toEqual({
      kind: "invalid-request",
      input: "--id must be one or more unit ids",
    });
    expect(runs(garden)).toEqual([]);
    expect(collections(garden)).toEqual([]);
  });

  it("shell text and a flag-shaped value reach garden as one literal argument each", async () => {
    const garden = workspace("literal");
    const anchor = "$(touch pwned); --url=https://evil.example/";
    const result = await call(garden, ["resolve", "--record", ACCOUNT, "--anchor", anchor]);
    expect(result.code).toBe(0);
    const [logged] = runs(garden);
    expect(logged?.argv).toContain(`--anchor=${anchor}`);
    expect((logged?.argv ?? []).filter((arg) => arg.includes("--url="))).toEqual([
      `--anchor=${anchor}`,
      `--url=${ENDPOINT}`,
    ]);
    expect(existsSync(join(garden.root, "pwned"))).toBe(false);
  });

  it("the key reaches garden through the environment and nothing greenline writes or passes", async () => {
    const garden = workspace("key");
    const key = "gdn_live_4f9d2c7a0b1e_secret";
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"], {
      key,
    });
    expect(result.code).toBe(0);
    const [logged] = runs(garden);
    expect(logged?.key).toBe(key);
    expect(logged?.argv.join(" ")).not.toContain(key);
    expect(result.out + result.err).not.toContain(key);
    for (const [path, content] of tree(garden.root)) expect(content, path).not.toContain(key);
  });

  it("the bridge opens no connection of its own to garden's endpoint", async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      response.writeHead(503).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = z.object({ port: z.number() }).parse(server.address());
    try {
      const garden = workspace("offline", { endpoint: `http://127.0.0.1:${port}/` });
      const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"]);
      expect(result.code).toBe(0);
      await fetch(`http://127.0.0.1:${port}/after-the-call`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(requests).toEqual(["/after-the-call"]);
  });

  it("a bare garden is found on the absolute PATH entries only, never in the current directory", async () => {
    const garden = workspace("path", { executable: "garden" });
    const planted = join(garden.root, "garden");
    writeFileSync(planted, `#!/bin/sh\ntouch "${join(garden.root, "planted-ran")}"\n`, {
      mode: 0o755,
    });
    const found = await call(garden, ["snapshot", "--record", ACCOUNT], {
      path: `.:${garden.bin}`,
    });
    expect(found.code).toBe(0);
    expect(runs(garden)).toHaveLength(1);
    const missing = await call(garden, ["snapshot", "--record", ACCOUNT], { path: "." });
    expect(missing.code).toBe(1);
    expect(missing.reply.error?.kind).toBe("missing-executable");
    expect(existsSync(join(garden.root, "planted-ran"))).toBe(false);
  });

  it("a missing executable is its own failure, recorded, and greenline installs nothing", async () => {
    const garden = workspace("missing");
    const absent = join(garden.bin, "no-such-garden");
    expect(
      run(garden.root, [
        "connectors",
        "enable",
        "garden",
        "--url",
        ENDPOINT,
        "--executable",
        absent,
      ]).code,
    ).toBe(0);
    const result = await call(garden, ["snapshot", "--record", ACCOUNT]);
    expect(result.code).toBe(1);
    expect(result.reply.error).toEqual({
      kind: "missing-executable",
      input: `${absent} was not found or cannot run; greenline does not install garden`,
    });
    expect(only(garden).receipts[0]).toMatchObject({ outcome: "failed", units: [] });
    expect(existsSync(absent)).toBe(false);
  });
});

describe("garden's replies are validated before anything is believed", () => {
  it.each([
    ["garbage", ["snapshot"], "protocol", "malformed"],
    ["two-documents", ["snapshot"], "protocol", "malformed"],
    ["partial", ["read", "--id", "example-rule"], "protocol", "malformed"],
    ["format", ["snapshot"], "protocol", "format"],
    ["schema", ["snapshot"], "protocol", "schema"],
    ["false-zero", ["snapshot"], "protocol", "exit"],
    ["exit2-success", ["snapshot"], "protocol", "exit"],
    ["wrong-call", ["snapshot"], "protocol", "call"],
    ["wrong-origin", ["snapshot"], "protocol", "origin"],
    ["duplicate", ["read", "--id", "example-rule"], "protocol", "duplicate"],
    ["tampered", ["read", "--id", "example-rule"], "protocol", "body"],
    [
      "excluded-delivered",
      ["read", "--id", "example-rule", "--requires", "--exclude", "example-prerequisite"],
      "protocol",
      "call",
    ],
    ["crash", ["snapshot"], "process", "exited 1"],
    ["signal", ["snapshot"], "process", "SIGTERM"],
    ["overflow", ["snapshot"], "output-cap", "2097152 bytes"],
    ["snapshot-mismatch", ["snapshot"], "protocol", "publication"],
    ["wrong-anchor", ["resolve", "--anchor", "example-anchor"], "protocol", "call"],
    ["miscount", ["list", "--task", "implement"], "protocol", "count"],
    ["wrong-limits", ["snapshot"], "protocol", "limits"],
    [
      "over-budget",
      ["read", "--id", "example-rule", "--requires", "--max-units", "1"],
      "protocol",
      "limits",
    ],
    ["long-subject", ["snapshot"], "protocol", "malformed"],
    ["control-publication", ["snapshot"], "protocol", "publication"],
  ])(
    "%s: the call %j fails as %s (%s), delivers nothing and binds nothing",
    async (mode, args, kind, detail) => {
      const garden = workspace(`reply-${mode}`);
      const result = await call(garden, [...args, "--record", ACCOUNT], { mode });
      expect(result.code).toBe(1);
      expect(result.reply.error?.kind).toBe(kind);
      expect(result.reply.error?.input).toContain(detail);
      expect(result.reply.result).toBeUndefined();
      expect(result.out).toBe("");
      const request = only(garden);
      expect(request.binding).toEqual({ state: "unresolved", origin: ENDPOINT });
      expect(request.receipts[0]).toMatchObject({ outcome: "failed", units: [], count: null });
    },
  );

  it.each([
    "cancelled",
    "deadline",
    "unavailable",
    "unauthorized",
    "invalid-result",
    "private-data",
    "excluded",
    "budget",
    "not-found",
    "invalid-request",
  ])("garden's %s refusal is recorded as its own kind with nothing delivered", async (kind) => {
    const garden = workspace(`refusal-${kind}`);
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"], {
      mode: `refusal:${kind}`,
    });
    expect(result.code).toBe(1);
    expect(result.reply.error?.kind).toBe(kind);
    expect(only(garden).receipts[0]).toMatchObject({
      outcome: "failed",
      units: [],
      error: { kind },
    });
  });

  it("an older garden that refuses the command line is recorded as its refusal, not a success", async () => {
    const garden = workspace("old-client");
    const result = await call(garden, ["snapshot", "--record", ACCOUNT], { mode: "old-client" });
    expect(result.reply.error).toEqual({ kind: "invalid-request", input: "command" });
    expect(only(garden).receipts[0]?.outcome).toBe("failed");
  });

  it("a cancelled call is recorded as cancelled from the bridge's own observation", async () => {
    const garden = workspace("cancel");
    let pending: unknown;
    const result = await call(garden, ["snapshot", "--record", ACCOUNT], {
      mode: "hang",
      started: () => {
        pending = only(garden).receipts[0]?.outcome;
      },
      cancel: new AbortController(),
    });
    expect(pending).toBe("pending");
    expect(result.reply.error).toEqual({
      kind: "cancelled",
      input: "the call was cancelled before garden answered",
    });
    expect(only(garden).receipts[0]).toMatchObject({
      outcome: "failed",
      error: { kind: "cancelled" },
    });
  });

  it("a call past its one deadline is recorded as a deadline", async () => {
    const garden = workspace("deadline");
    const result = await call(garden, ["snapshot", "--record", ACCOUNT, "--timeout-ms", "50"], {
      mode: "hang",
    });
    expect(result.reply.error).toEqual({
      kind: "deadline",
      input: "garden did not answer within 50 ms",
    });
    expect(only(garden).receipts[0]).toMatchObject({
      outcome: "failed",
      error: { kind: "deadline" },
    });
  });
});

describe("evidence first", () => {
  it("the pending intent is on disk while garden runs, before any answer", async () => {
    const garden = workspace("pending");
    let during: unknown;
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"], {
      started: () => {
        during = only(garden).receipts.map((entry) => entry.outcome);
      },
    });
    expect(result.code).toBe(0);
    expect(during).toEqual(["pending"]);
  });

  it("a receipt that cannot be persisted is an evidence failure, never a delivered success", async () => {
    const garden = workspace("unpersisted");
    const real = createNodeFileIo();
    let receiptWrites = 0;
    const failing: FileIo = {
      ...real,
      write: (path, content) => {
        if (path.includes(".greenline/ledger/receipts/")) receiptWrites += 1;
        // The third receipt write is the seal: create, then pending, then settle.
        return receiptWrites === 3
          ? err(new AtomicWriteFailed(path, "write", "disk full"))
          : real.write(path, content);
      },
    };
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"], {
      io: failing,
    });
    expect(result.code).toBe(1);
    expect(result.out).toBe("");
    expect(result.reply.error?.kind).toBe("evidence");
    expect(result.err).not.toContain("Synthetic text");
    expect(runs(garden)).toHaveLength(1);
    expect(only(garden).receipts.map((entry) => entry.outcome)).toEqual(["pending"]);
  });

  it("a held writer lock stops the call before garden runs and writes nothing", async () => {
    const garden = workspace("locked");
    writeFileSync(join(garden.root, ".greenline/tmp/.write.lock"), "another writer\n");
    const result = await call(garden, ["snapshot", "--record", ACCOUNT]);
    expect(result.code).toBe(1);
    expect(result.reply.error?.kind).toBe("evidence");
    expect(runs(garden)).toEqual([]);
    expect(collections(garden)).toEqual([]);
  });

  it("a garden delivery joins its account as an optional consultation, and doctor owes nothing for it", async () => {
    const garden = workspace("ledger");
    const result = await call(garden, ["read", "--record", ACCOUNT, "--id", "example-rule"]);
    const request = only(garden);
    const ledger = readExecutionLedger(garden.root, createNodeFileIo());
    if (ledger._tag === "err") throw ledger.error;
    const account = ledger.value.records.find((record) => record.id === ACCOUNT);
    expect(account?.consultations).toEqual([
      {
        id: result.reply.consultations?.[0]?.consultation,
        kind: "guidance",
        source: {
          kind: "garden",
          origin: ENDPOINT,
          snapshot: A.id,
          unit: "example-rule",
          revision: RULE.revision,
          contentHash: RULE.contentHash,
          request: request.id,
          receipt: request.receipts[0]?.id,
        },
        stage: "unknown",
        decision: "unassessed",
        reason: "Garden delivery recorded; application has not been judged.",
      },
    ]);
    const doctor = run(garden.root, ["doctor", "--json"]);
    expect(doctor.code).toBe(0);
    expect(JSON.parse(doctor.out).ledger.retrievals).toEqual([
      {
        request: request.id,
        source: "garden",
        record: ACCOUNT,
        snapshot: A.id,
        publicationUse: "current",
        calls: 1,
        received: 1,
        incomplete: 0,
        advisories: 0,
      },
    ]);
  });
});
