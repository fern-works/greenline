import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sha256Hex } from "../../src/commons/hash.ts";

/**
 * greenline's copy of garden's frozen result contract (contract T2): the
 * schema and the seventeen fixtures, byte for byte from garden at 05fc448,
 * each pinned by digest in contracts/garden/README.md.
 */

const ROOT = join(import.meta.dirname, "../..");
const DIRECTORY = "contracts/garden";
const SCHEMA = `${DIRECTORY}/cli-result-v1.schema.json`;
/** The identity of garden.result/v1: the schema's digest as garden records it. */
const RESULT_V1 = "4150b824e9434cdf5252b4f0094243f5e8295894829bc13ea3e0117d77339423";

const bytes = (path: string): Buffer => readFileSync(join(ROOT, path));
const readme = bytes(`${DIRECTORY}/README.md`).toString("utf8");
const fixtureNames = readdirSync(join(ROOT, DIRECTORY, "fixtures")).sort();
const fixture = (name: string): z.infer<typeof documentSchema> =>
  documentSchema.parse(JSON.parse(bytes(`${DIRECTORY}/fixtures/${name}`).toString("utf8")));
const documentSchema = z.record(z.string(), z.json());

/** The README's front-matter pins, in order. */
function pins(): readonly { readonly path: string; readonly sha256: string }[] {
  const front = /^---\n([\s\S]*?)\n---\n/u.exec(readme)?.[1] ?? "";
  return [...front.matchAll(/^ {2}- path: (\S+)\n {4}sha256: ([0-9a-f]{64})$/gmu)].map(
    ([, path = "", sha256 = ""]) => ({ path, sha256 }),
  );
}

/** Each keyword of the schema with where it stands, walking only schema positions. */
function keywords(schema: z.infer<typeof documentSchema>, at: string): readonly string[] {
  const nested = z.record(z.string(), z.json());
  const each = z.array(z.json());
  const found = Object.keys(schema).map((key) => `${at}:${key}`);
  const children: (readonly [string, z.infer<typeof documentSchema>])[] = [];
  for (const key of ["$defs", "properties"]) {
    const map = nested.safeParse(schema[key]);
    if (map.success)
      for (const [name, value] of Object.entries(map.data)) {
        const child = nested.safeParse(value);
        if (child.success) children.push([`${at}/${key}/${name}`, child.data]);
      }
  }
  for (const key of ["anyOf", "oneOf", "prefixItems"]) {
    const list = each.safeParse(schema[key]);
    if (list.success)
      list.data.forEach((value, index) => {
        const child = nested.safeParse(value);
        if (child.success) children.push([`${at}/${key}/${index}`, child.data]);
      });
  }
  for (const key of ["items", "additionalProperties"]) {
    const child = nested.safeParse(schema[key]);
    if (child.success) children.push([`${at}/${key}`, child.data]);
  }
  return [...found, ...children.flatMap(([where, child]) => keywords(child, where))];
}

describe("the copied garden result contract", () => {
  it("pins exactly the schema and the seventeen fixtures, nothing more or less", () => {
    expect(pins().map((pin) => pin.path)).toEqual([
      SCHEMA,
      ...fixtureNames.map((name) => `${DIRECTORY}/fixtures/${name}`),
    ]);
    expect(fixtureNames).toHaveLength(17);
    expect(fixtureNames.filter((name) => name.startsWith("success-"))).toHaveLength(7);
    expect(fixtureNames.filter((name) => name.startsWith("refusal-"))).toHaveLength(10);
  });

  it("holds every copied file to the digest the README pins", () => {
    for (const { path, sha256 } of pins()) expect(sha256Hex(bytes(path)), path).toBe(sha256);
  });

  it("pins the schema at garden.result/v1's identity and names the source commit", () => {
    expect(pins()[0]).toEqual({ path: SCHEMA, sha256: RESULT_V1 });
    expect(readme).toContain("garden at commit 05fc448");
  });

  it("uses only keywords the validator enforces, besides annotations", () => {
    const enforced = new Set([
      "$ref",
      "$defs",
      "type",
      "const",
      "enum",
      "anyOf",
      "oneOf",
      "properties",
      "required",
      "additionalProperties",
      "items",
      "prefixItems",
      "minItems",
      "maxItems",
      "minLength",
      "pattern",
      "minimum",
      "maximum",
    ]);
    const annotations = new Set(["$schema", "title", "description"]);
    const schema = documentSchema.parse(JSON.parse(bytes(SCHEMA).toString("utf8")));
    const walked = keywords(schema, "#");
    // The walk reaches nested definitions, not the root alone.
    expect(walked).toContain("#/$defs/sha256:pattern");
    expect(walked).toContain("#/$defs/deliveredUnit/properties/bytes:maximum");
    const unread = walked.filter((entry) => {
      const key = entry.slice(entry.lastIndexOf(":") + 1);
      return !enforced.has(key) && !annotations.has(key);
    });
    expect(unread).toEqual([]);
  });

  it("accepts every copied fixture through the copied schema", () => {
    const validator = z.fromJSONSchema(JSON.parse(bytes(SCHEMA).toString("utf8")));
    for (const name of fixtureNames)
      expect(validator.safeParse(fixture(name)).error?.issues, name).toBeUndefined();
  });

  it("refuses altered documents through the same schema, so the acceptance is not vacuous", () => {
    const validator = z.fromJSONSchema(JSON.parse(bytes(SCHEMA).toString("utf8")));
    const read = fixture("success-read.json");
    const refusal = fixture("refusal-budget.json");
    for (const altered of [
      { ...read, format: "garden.result/v2" },
      { ...read, key: "gdn_secret" },
      { ...read, error: refusal["error"] ?? null },
      { ...refusal, ok: true },
      { ...read, callId: "" },
    ])
      expect(validator.safeParse(altered).success).toBe(false);
  });
});
