import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { call, gardenWorkspace, runs, stored, type GardenWorkspace } from "./garden-fixture.ts";
import { run } from "./workspace.ts";

/**
 * S7: a garden consultation binds to a change. A request opened with
 * `--change` belongs to that change's record; one opened without it belongs
 * to no one, a question's. S20: a collection of another owner or version is
 * refused.
 */

const ENDPOINT = "https://garden.example/";
const A = { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" };
const BODY = "Synthetic text: the unit a contract fixture reads.";
const CHANGE = "2026-10-04-fix-login";

const workspaces: GardenWorkspace[] = [];
afterEach(() => {
  for (const created of workspaces.splice(0)) created.remove();
});

function fresh(prefix: string): GardenWorkspace {
  const created = gardenWorkspace(prefix);
  workspaces.push(created);
  return created;
}

/** A change record in the workspace's ledger, in a state. */
function record(garden: GardenWorkspace, id: string, state: string): void {
  mkdirSync(join(garden.root, ".greenline/ledger"), { recursive: true });
  const next = state === "stopped" ? 'next: "build: go on"\n' : "";
  writeFileSync(
    join(garden.root, `.greenline/ledger/${id}.md`),
    `---\nmode: quick\nchoice: accepted\nwhy: "the login form"\nstate: ${state}\n${next}---\n`,
  );
}

/** The collection files a workspace holds. */
function listed(garden: GardenWorkspace): readonly string[] {
  const directory = join(garden.root, ".greenline/ledger/receipts");
  return existsSync(directory) ? readdirSync(directory) : [];
}

describe("a request a change owns", () => {
  it("S7 a call with --change records the request before any result is shown, and its collection names the change", async () => {
    const garden = fresh("change");
    record(garden, CHANGE, "open");
    let during: unknown;
    const result = await call(garden, ["read", "--change", CHANGE, "--id", "example-rule"], {
      started: () => {
        const [name] = listed(garden);
        during = stored(garden, (name ?? "").slice(0, -".json".length)).receipts.map(
          (entry) => entry.outcome,
        );
      },
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain(BODY);
    expect(during).toEqual(["pending"]);
    const request = stored(garden, result.reply.request ?? "");
    expect(request.schemaVersion).toBe(5);
    expect(request.owner).toEqual({ kind: "change", change: CHANGE });
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts[0]).toMatchObject({ outcome: "received", roots: ["."] });
    const file = readFileSync(
      join(garden.root, `.greenline/ledger/receipts/${request.id}.json`),
      "utf8",
    );
    expect(file).not.toContain("Synthetic text");
  });

  it("S7 a stopped change opens a request too, and --request continues it under the change", async () => {
    const garden = fresh("stopped");
    record(garden, CHANGE, "stopped");
    const first = await call(garden, ["snapshot", "--change", CHANGE]);
    expect(first.code).toBe(0);
    const handle = first.reply.request ?? "";
    const next = await call(garden, ["read", "--request", handle, "--id", "example-rule"]);
    expect(next.code).toBe(0);
    const request = stored(garden, handle);
    expect(request.owner).toEqual({ kind: "change", change: CHANGE });
    expect(request.receipts.map((entry) => entry.operation)).toEqual(["snapshot", "read"]);
  });

  it("S7 a request a change owns takes its roots from the call, and the repository root when it names none", async () => {
    const garden = fresh("roots");
    record(garden, CHANGE, "open");
    const named = await call(garden, ["snapshot", "--change", CHANGE, "--root", "src"]);
    expect(stored(garden, named.reply.request ?? "").receipts[0]?.roots).toEqual(["src"]);
    const unnamed = await call(garden, ["snapshot", "--change", CHANGE]);
    expect(stored(garden, unnamed.reply.request ?? "").receipts[0]?.roots).toEqual(["."]);
  });

  it.each([
    ["an unknown change", "2026-10-04-nothing", undefined, "no change record '2026-10-04-nothing'"],
    ["a change that does not parse", CHANGE, "broken", "does not parse"],
    ["a done change", CHANGE, "done", "the change '2026-10-04-fix-login' is done"],
    ["a dropped change", CHANGE, "dropped", "the change '2026-10-04-fix-login' is dropped"],
    [
      "an earlier ledger file that is not a change",
      "README",
      undefined,
      "no change record 'README'",
    ],
  ])("S7 refuses %s, running nothing and writing nothing", async (_, id, state, message) => {
    const garden = fresh("refused");
    if (state === "broken") {
      mkdirSync(join(garden.root, ".greenline/ledger"), { recursive: true });
      writeFileSync(join(garden.root, `.greenline/ledger/${CHANGE}.md`), "no front matter\n");
    } else if (state !== undefined) record(garden, CHANGE, state);
    const refused = await call(garden, ["snapshot", "--change", id]);
    expect(refused.code).toBe(1);
    expect(refused.reply.error?.input).toContain(message);
    expect(runs(garden)).toEqual([]);
    expect(listed(garden)).toEqual([]);
  });

  it("S20 --record and --context are unknown options, and --change cannot continue a request", async () => {
    const garden = fresh("both");
    record(garden, CHANGE, "open");
    for (const option of ["--record", "--context"]) {
      const refused = await call(garden, ["snapshot", "--change", CHANGE, option, "work-one"]);
      expect(refused.code).toBe(2);
      expect(refused.reply.error?.input).toContain(`unknown option '${option}'`);
    }
    const opened = await call(garden, ["snapshot", "--change", CHANGE]);
    const continued = await call(garden, [
      "snapshot",
      "--change",
      CHANGE,
      "--request",
      opened.reply.request ?? "",
    ]);
    expect(continued.reply.error?.input).toBe(
      "choose --change for a new request or --request to continue one",
    );
    expect(runs(garden)).toHaveLength(1);
  });

  it("S7 a refused continuation advises opening a new request under the same owner", async () => {
    const garden = fresh("advice");
    record(garden, CHANGE, "open");
    const changed = await call(garden, ["snapshot", "--change", CHANGE]);
    const moved = await call(garden, [
      "read",
      "--request",
      changed.reply.request ?? "",
      "--snapshot",
      "example-publication-b",
      "--id",
      "example-rule",
    ]);
    expect(moved.reply.error?.input).toBe(
      `the request is bound to publication ${A.id}; open a new request with --change ${CHANGE}`,
    );
    const asked = await call(garden, ["snapshot"]);
    const again = await call(garden, [
      "read",
      "--request",
      asked.reply.request ?? "",
      "--snapshot",
      "example-publication-b",
      "--id",
      "example-rule",
    ]);
    expect(again.reply.error?.input).toBe(
      `the request is bound to publication ${A.id}; open a new request without --change`,
    );
  });

  it("S7 a request is not continued once its change is done", async () => {
    const garden = fresh("closed");
    record(garden, CHANGE, "open");
    const opened = await call(garden, ["snapshot", "--change", CHANGE]);
    record(garden, CHANGE, "done");
    const refused = await call(garden, ["snapshot", "--request", opened.reply.request ?? ""]);
    expect(refused.code).toBe(1);
    expect(refused.reply.error?.input).toContain("the change '2026-10-04-fix-login' is done");
    expect(runs(garden)).toHaveLength(1);
  });
});

describe("a change's consultations in status", () => {
  it("S7 status --change lists the change's requests with their publication and calls, and the default view counts them", async () => {
    const garden = fresh("status");
    record(garden, CHANGE, "open");
    const opened = await call(garden, ["snapshot", "--change", CHANGE]);
    await call(garden, ["read", "--request", opened.reply.request ?? "", "--id", "example-rule"]);
    const resume = run(garden.root, ["status", "--change", CHANGE], { environment: {} });
    expect(resume.out).toContain("  consultations (1):");
    expect(resume.out).toContain(`    ${opened.reply.request}  publication ${A.id}, 2 calls`);
    expect(resume.out).not.toContain("Synthetic text");
    const json = JSON.parse(run(garden.root, ["status", "--json"], { environment: {} }).out);
    expect(json.changes.current[0].consultations).toEqual([
      {
        request: opened.reply.request,
        binding: { state: "publication", publication: A.id },
        calls: 2,
      },
    ]);
    expect(run(garden.root, ["status"], { environment: {} }).out).toContain("1 consultation");
  });
});

describe("a request no one owns", () => {
  it("S7 a question's consultation needs no --change, records its calls and binds one publication", async () => {
    const garden = fresh("question");
    const first = await call(garden, ["snapshot"]);
    expect(first.code).toBe(0);
    const handle = first.reply.request ?? "";
    const read = await call(garden, ["read", "--request", handle, "--id", "example-rule"]);
    expect(read.code).toBe(0);
    const request = stored(garden, handle);
    expect(request.owner).toEqual({ kind: "none" });
    expect(request.binding).toEqual({ state: "publication", origin: ENDPOINT, snapshot: A });
    expect(request.receipts.map((entry) => [entry.operation, entry.roots])).toEqual([
      ["snapshot", ["."]],
      ["read", ["."]],
    ]);
    const status = JSON.parse(run(garden.root, ["status", "--json"], { environment: {} }).out);
    expect(status.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual(
      [],
    );
  });
});

describe("a collection of another owner or version", () => {
  it.each([
    ["an account's schema-5 collection", 5, { kind: "account", record: "work-one" }],
    [
      "a schema-4 collection",
      4,
      { record: "work-one", context: "ctx-one", role: "maintenance", work: null },
    ],
  ])("S20 %s is refused as it is read, and no call continues it", async (_, version, owner) => {
    const garden = fresh("earlier");
    const id = "11111111-1111-4111-8111-111111111111";
    const earlier = {
      schemaVersion: version,
      id,
      source: "garden",
      owner,
      parent: null,
      createdAt: "2026-09-26T00:00:00.000Z",
      binding: { state: "publication", origin: ENDPOINT, snapshot: A },
      publicationUse: "current",
      limits: { maxUnits: 16, maxBytes: 262144, timeoutMs: 30000 },
      receipts: [],
      advisories: [],
    };
    mkdirSync(join(garden.root, ".greenline/ledger/receipts"), { recursive: true });
    const file = join(garden.root, `.greenline/ledger/receipts/${id}.json`);
    writeFileSync(file, `${JSON.stringify(earlier, null, 2)}\n`);
    const continued = await call(garden, ["read", "--request", id, "--id", "example-rule"]);
    expect(continued.code).toBe(1);
    expect(continued.reply.error?.kind).toBe("configuration");
    expect(runs(garden)).toEqual([]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(earlier);
  });
});
