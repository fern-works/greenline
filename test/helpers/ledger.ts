import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../../src/commons/hash.ts";
import type { LedgerRecord } from "../../src/core/execution-ledger.ts";
import { parseArtifact } from "../../src/core/artifact.ts";

/** A synthetic artifact fixture carries explicit accounting, never invented observed reads. */
export function writeArtifactLedger(
  root: string,
  path: string,
  roleOverride?: LedgerRecord["role"],
): void {
  const sourcePath = `.greenline/work/${path}`;
  const body = readFileSync(join(root, sourcePath), "utf8");
  const parsed = parseArtifact(path, body);
  if (parsed._tag === "err") throw parsed.error;
  const artifact = parsed.value;
  const role =
    roleOverride ??
    (artifact.type === "ticket"
      ? "implementation"
      : artifact.type === "review"
        ? "review"
        : "planning");
  const id = `fixture-${artifact.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${role}`;
  mkdirSync(join(root, ".greenline/ledger/records"), { recursive: true });
  writeFileSync(
    join(root, `.greenline/ledger/records/${id}.json`),
    JSON.stringify({
      schemaVersion: 3,
      id,
      context: `synthetic-fixture-${role}`,
      actor: "fixture-author",
      role,
      work: { id: artifact.id, revision: artifact.revision },
      scopes: ["."],
      resultCommit:
        artifact.type === "ticket"
          ? (artifact.resultCommit ?? undefined)
          : artifact.type === "review"
            ? artifact.range.split("..")[1]
            : undefined,
      reviews:
        artifact.type === "review"
          ? [
              {
                path: `.greenline/ledger/records/${artifact.implementationAccount}.json`,
                revision: sha256Hex(
                  readFileSync(
                    join(root, `.greenline/ledger/records/${artifact.implementationAccount}.json`),
                  ),
                ),
              },
            ]
          : [],
      selections: [
        {
          id: "fixture-input",
          kind: "document",
          source: { kind: "repository", path: sourcePath, revision: sha256Hex(body) },
          stage: "after-work",
          decision: "not-applicable",
          reason:
            "This synthetic baseline supplies artifact state, not a historical agent consultation or engineering application claim.",
        },
      ],
    }),
  );
}
