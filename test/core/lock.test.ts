import { describe, expect, it } from "vitest";
import { isOk } from "../../src/commons/result.ts";
import { LOCK_SCHEMA_VERSION, parseLock } from "../../src/core/lock.ts";

const SOURCE: string = ".greenline/lock.json";
const HASH: string = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const REVISION: string = "f".repeat(64);

function lockJson(body: string): string {
  return `{ "schemaVersion": ${LOCK_SCHEMA_VERSION}, "cliVersion": "0.0.0", "installationRevision": "${REVISION}", ${body} }`;
}

const BASE_BODY: string = `"upstreams": [{ "name": "mattpocock-skills", "repo": "mattpocock/skills", "commit": null }], "files": {}`;

describe("parseLock", () => {
  it.each([
    "../outside.md",
    "/outside.md",
    "a/../../outside.md",
    "C:/outside.md",
    "a\\\\outside.md",
    "a/./file.md",
  ])("rejects nonportable or escaping managed path %s", (path) => {
    const text = JSON.stringify({
      schemaVersion: 4,
      cliVersion: "0.0.0",
      installationRevision: REVISION,
      upstreams: [],
      files: { [path]: HASH },
    });
    expect(parseLock(text, SOURCE)._tag).toBe("err");
  });

  it("carries the installation identity independently of guidance publications", () => {
    const body = `"upstreams": [{ "name": "mattpocock-skills", "repo": "mattpocock/skills", "commit": null }], "files": {}`;
    const text = `{ "schemaVersion": ${LOCK_SCHEMA_VERSION}, "cliVersion": "0.0.0", "installationRevision": "${REVISION}", ${body} }`;
    const result = parseLock(text, SOURCE);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.schemaVersion).toBe(4);
    expect(result.value.installationRevision).toBe(REVISION);
    expect(
      parseLock(text.replace(`"installationRevision": "${REVISION}", `, ""), SOURCE)._tag,
    ).toBe("err");
    expect(parseLock(text.replace('"schemaVersion": 4', '"schemaVersion": 2'), SOURCE)._tag).toBe(
      "err",
    );
  });

  it("parses a valid lock with an empty upstream commit", () => {
    const result = parseLock(lockJson(BASE_BODY), SOURCE);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.cliVersion).toBe("0.0.0");
    expect(result.value.upstreams[0]?.commit).toBe(null);
    expect(result.value.files.size).toBe(0);
  });

  it("records managed files as a map of path to sha256", () => {
    const body = `"upstreams": [{ "name": "mattpocock-skills", "repo": "mattpocock/skills", "commit": "abc123" }], "files": { ".agents/skills/x/SKILL.md": "${HASH}" }`;
    const result = parseLock(lockJson(body), SOURCE);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.files.get(".agents/skills/x/SKILL.md")).toBe(HASH);
  });

  it("rejects an unknown schema version", () => {
    const result = parseLock(`{ "schemaVersion": 99, "cliVersion": "0.0.0" }`, SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues[0]?.path).toBe("schemaVersion");
    expect(result.error.issues[0]?.message).toContain("99");
  });

  it("rejects the retired single-upstream schema version 1", () => {
    const v1 = `{ "schemaVersion": 1, "cliVersion": "0.0.0", "upstream": { "repo": "r", "commit": null }, "files": {} }`;
    expect(isOk(parseLock(v1, SOURCE))).toBe(false);
  });

  it("rejects a malformed content hash", () => {
    const body = `"upstreams": [{ "name": "f", "repo": "r", "commit": null }], "files": { "a": "not-a-hash" }`;
    const result = parseLock(lockJson(body), SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues[0]?.path).toContain("a");
  });

  it("rejects an empty cliVersion", () => {
    const result = parseLock(
      `{ "schemaVersion": ${LOCK_SCHEMA_VERSION}, "cliVersion": "", ${BASE_BODY} }`,
      SOURCE,
    );
    expect(isOk(result)).toBe(false);
  });

  it("rejects invalid JSON entirely", () => {
    const result = parseLock("{ nope", SOURCE);
    expect(isOk(result)).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const result = parseLock(lockJson(`${BASE_BODY}, "extra": 1`), SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues.some((issue) => issue.message.includes("extra"))).toBe(true);
  });
});
