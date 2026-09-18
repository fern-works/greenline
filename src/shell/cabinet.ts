import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { err, ok, type Result } from "../commons/result.ts";
import {
  publish,
  snapshotCabinet,
  type Cabinet,
  type Publication,
  type PublishRefused,
  type Snapshot,
  type UnitFile,
} from "../core/cabinet.ts";

/**
 * The fixture cabinet: the contract served from `corpus/units/` on disk.
 * Tests and the maintainer's local walks use it; the published store
 * answers the same reads over HTTP. The snapshot id is the digest of every
 * file's bytes, so two trees with the same units publish the same id.
 */

export class UnitsTreeUnreadable extends Error {
  readonly _tag = "UnitsTreeUnreadable" as const;
  readonly path: string;
  constructor(path: string, cause: string) {
    super(`units tree unreadable at ${path}: ${cause}`);
    this.path = path;
  }
}

/** Read every family directory's unit files and the vocabulary from a units root. */
export function readUnitsTree(root: string): Result<Publication, UnitsTreeUnreadable> {
  let activePath = root;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    activePath = join(root, "VOCABULARY.json");
    const vocabulary: unknown = JSON.parse(decoder.decode(readFileSync(activePath)));
    const files: UnitFile[] = [];
    const digest = createHash("sha256");
    activePath = root;
    for (const family of readdirSync(root).sort()) {
      const dir = join(root, family);
      activePath = dir;
      if (!statSync(dir).isDirectory()) continue;
      for (const name of readdirSync(dir).sort()) {
        // The family's generated provenance page sits beside its units and is not one.
        if (!name.endsWith(".md") || name === "README.md" || name === "PROVENANCE.md") continue;
        const path = join(dir, name);
        activePath = path;
        const text = decoder.decode(readFileSync(path));
        digest.update(`${family}/${name}\n${text}\n`);
        files.push({ family, path: `${family}/${name}`, text });
      }
    }
    return ok({
      id: `fixture-${digest.digest("hex").slice(0, 16)}`,
      publishedAt: new Date().toISOString(),
      vocabulary,
      files,
    });
  } catch (error) {
    return err(new UnitsTreeUnreadable(activePath, String(error)));
  }
}

/** Publish the tree at `root` and serve it. */
export function loadFixtureSnapshot(
  root: string,
): Result<Snapshot, UnitsTreeUnreadable | PublishRefused> {
  const tree = readUnitsTree(root);
  return tree._tag === "err" ? tree : publish(tree.value);
}

export function fixtureCabinet(
  root: string,
): Result<Cabinet, UnitsTreeUnreadable | PublishRefused> {
  const snapshot = loadFixtureSnapshot(root);
  return snapshot._tag === "err" ? snapshot : ok(snapshotCabinet(snapshot.value));
}
