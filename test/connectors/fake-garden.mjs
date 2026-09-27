// The synthetic garden command the connector tests own. It answers garden's
// six reads from the copied contract fixtures, rewritten to the call it was
// given, and misbehaves on demand through GARDEN_FAKE_MODE. It never opens a
// connection. When GARDEN_FAKE_LOG names a file it appends one line per run:
// its arguments, the key it received and its working directory.
import { appendFileSync, readFileSync } from "node:fs";

const fixtures = new URL("../../contracts/garden/fixtures/", import.meta.url);
const fixture = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, fixtures), "utf8"));
const PUBLICATIONS = new Map([
  [
    "example-publication-a",
    { id: "example-publication-a", publishedAt: "2026-01-01T00:00:00.000Z" },
  ],
  [
    "example-publication-b",
    { id: "example-publication-b", publishedAt: "2026-01-02T00:00:00.000Z" },
  ],
]);
const GROUP = "example responsibility";

const [operation = "", ...rest] = process.argv.slice(2);
/** Every `--name=value` and bare `--name` the command line carries, in order. */
const flags = new Map();
for (const arg of rest) {
  if (!arg.startsWith("--")) continue;
  const equals = arg.indexOf("=");
  const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
  const value = equals === -1 ? true : arg.slice(equals + 1);
  flags.set(name, [...(flags.get(name) ?? []), value]);
}
const flag = (name) => flags.get(name)?.[0];
const all = (name) => flags.get(name) ?? [];
const mode = process.env.GARDEN_FAKE_MODE ?? "fixture";
if (process.env.GARDEN_FAKE_LOG !== undefined)
  appendFileSync(
    process.env.GARDEN_FAKE_LOG,
    `${JSON.stringify({ argv: process.argv.slice(2), key: process.env.GARDEN_API_KEY ?? null, greenline: Object.keys(process.env).filter((name) => /^greenline_/i.test(name)), cwd: process.cwd() })}\n`,
  );

/** Print one document and end with its exit status. */
const answer = (document, exit) => {
  process.stdout.write(`${JSON.stringify(document)}\n`);
  process.exitCode = exit;
};
/** A refusal of this call, its kind's fixture rewritten to name what was refused. */
const refuse = (kind, subject) => {
  const document = fixture(`refusal-${kind}`);
  const error = { kind, subject: subject ?? document.error.subject };
  answer(
    { ...document, operation, callId: flag("call-id"), origin: flag("url"), snapshot: null, error },
    2,
  );
};

/** Answer a success, or misbehave with it the way the mode asks. */
const finish = (document) => {
  const text = JSON.stringify(document);
  if (mode === "false-zero")
    answer(
      {
        ...fixture("refusal-unauthorized"),
        callId: document.callId,
        origin: document.origin,
        operation,
      },
      0,
    );
  else if (mode === "exit2-success") answer(document, 2);
  else if (mode === "format") answer({ ...document, format: "garden.result/v2" }, 0);
  else if (mode === "schema")
    answer({ ...document, extra: "a field the contract does not hold" }, 0);
  else if (mode === "wrong-call") answer({ ...document, callId: "someone-elses-call" }, 0);
  else if (mode === "wrong-origin")
    answer({ ...document, origin: "https://elsewhere.example/" }, 0);
  else if (mode === "wrong-limits")
    answer({ ...document, limits: { ...document.limits, timeoutMs: 1 } }, 0);
  else if (mode === "two-documents") process.stdout.write(`${text}\n${text}\n`);
  else if (mode === "partial") process.stdout.write(text.slice(0, Math.floor(text.length / 2)));
  else answer(document, 0);
};

/** The read's answer: only the units asked for, and their prerequisites when asked. */
const read = (document, publication) => {
  const asked = document.result.units.filter(
    (unit) => all("id").includes(unit.id) || flag("requires") === true,
  );
  // A partial delivery: a well-formed success that leaves out the last unit asked for.
  const selected = mode === "partial-delivery" ? asked.slice(0, -1) : asked;
  const missing = all("id").find((id) => !asked.some((unit) => unit.id === id));
  const blocked = all("exclude").find((id) => selected.some((unit) => unit.id === id));
  if (missing !== undefined) return refuse("not-found", missing);
  if (blocked !== undefined && mode !== "excluded-delivered") return refuse("excluded", blocked);
  if (selected.length > Number(flag("max-units")) && mode !== "over-budget")
    return refuse("budget", "max-units");
  const entries = document.delivery.units.filter((entry) =>
    selected.some((unit) => unit.id === entry.id),
  );
  const bodies =
    mode === "tampered"
      ? selected.map((unit) => ({ ...unit, content: `${unit.content}!` }))
      : selected;
  const twice = mode === "duplicate";
  return finish({
    ...document,
    snapshot: publication,
    delivery: {
      units: twice ? [...entries, ...entries] : entries,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) * (twice ? 2 : 1),
    },
    result: { units: twice ? [...bodies, ...bodies] : bodies },
  });
};

/** A listing: the fixture's units, or the one group this garden knows. */
const list = (document, publication) => {
  const group = flag("responsibility");
  const units =
    group === undefined
      ? document.result.units
      : document.result.units
          .filter((unit) => unit.id === "example-rule" && group === GROUP)
          .map((unit) => ({ ...unit, option_group: { responsibility: GROUP, member: "rule" } }));
  return finish({
    ...document,
    snapshot: publication,
    result: {
      snapshot: publication.id,
      count: units.length + (mode === "miscount" ? 3 : 0),
      units,
    },
  });
};

if (mode === "hang") setInterval(() => undefined, 1_000);
else if (mode === "crash") process.exitCode = 1;
else if (mode === "signal") process.kill(process.pid, "SIGTERM");
else if (mode === "garbage") process.stdout.write("this is not one garden reply\n");
else if (mode === "overflow") process.stdout.write(" ".repeat(3 * 1024 * 1024));
else if (mode.startsWith("refusal:")) refuse(mode.slice("refusal:".length));
else if (mode === "long-subject") refuse("not-found", "x".repeat(4096));
else if (mode === "control-publication") {
  const odd = { id: "example-publication-\u0007", publishedAt: "2026-01-01T00:00:00.000Z" };
  answer(
    {
      ...fixture("success-snapshot"),
      callId: flag("call-id"),
      origin: flag("url"),
      limits: { timeoutMs: Number(flag("timeout-ms")), maxUnits: null, maxBytes: null },
      snapshot: odd,
      result: odd,
    },
    0,
  );
}
// An older garden that does not know the operation refuses the command line
// before reading the call id, and generates its own.
else if (mode === "old-client") answer(fixture("refusal-invalid-request"), 2);
else {
  // The limits the call ran under are the ones its command line named.
  const read_ = operation === "read";
  const document = {
    ...fixture(`success-${operation}`),
    callId: flag("call-id"),
    origin: flag("url"),
    limits: {
      timeoutMs: Number(flag("timeout-ms")),
      maxUnits: read_ ? Number(flag("max-units")) : null,
      maxBytes: read_ ? Number(flag("max-bytes")) : null,
    },
  };
  const asked = operation === "snapshot" ? flag("id") : flag("snapshot");
  const publication =
    mode === "drift"
      ? PUBLICATIONS.get("example-publication-b")
      : PUBLICATIONS.get(asked === "current" ? "example-publication-a" : asked);
  if (operation === "changes")
    if (flag("from") === "example-publication-a" && flag("to") === "example-publication-b")
      finish(document);
    else refuse("not-found", "publication");
  else if (publication === undefined) refuse("not-found", "publication");
  else if (operation === "read") read(document, publication);
  else if (operation === "list") list(document, publication);
  else if (operation === "snapshot")
    finish({
      ...document,
      snapshot: publication,
      result:
        mode === "snapshot-mismatch" ? PUBLICATIONS.get("example-publication-b") : publication,
    });
  else if (operation === "resolve")
    finish({
      ...document,
      snapshot: publication,
      result: {
        anchor: mode === "wrong-anchor" ? "another-anchor" : flag("anchor"),
        id: "example-rule",
      },
    });
  else finish({ ...document, snapshot: publication });
}
