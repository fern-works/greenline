import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../../src/commons/hash.ts";
import {
  authorityWitnessIssues,
  readAuthorityWitness,
  WITNESSES,
} from "../../src/shell/divergence.ts";

const recorded = "docs/ledger/evidence/skills-s7/method-rulings.md";
const frozen = Buffer.from("frozen bytes\n");

/** A repository with the witness at its live path, and a corpus root beside it. */
function repository() {
  const repo = mkdtempSync(join(tmpdir(), "greenline-witness-"));
  mkdirSync(join(repo, "docs/ledger/evidence/skills-s7"), { recursive: true });
  writeFileSync(join(repo, recorded), "live bytes\n");
  return { repo, corpusRoot: join(repo, "corpus") };
}

function freeze(corpusRoot: string, bytes: Buffer): void {
  mkdirSync(join(corpusRoot, WITNESSES, "docs/ledger/evidence/skills-s7"), { recursive: true });
  writeFileSync(join(corpusRoot, WITNESSES, recorded), bytes);
}

describe("readAuthorityWitness", () => {
  it("reads a witness under corpus/ledger/witnesses/ at its recorded path, never at the live path, and names the failure with its cause", () => {
    const { repo, corpusRoot } = repository();
    try {
      const absent = readAuthorityWitness(corpusRoot, recorded);
      expect(absent._tag).toBe("err");
      if (absent._tag !== "err") return;
      expect(absent.error._tag).toBe("AuthorityWitnessReadFailed");
      expect(absent.error.recorded).toBe(recorded);
      expect(absent.error.message).toContain("ENOENT");
      expect(absent.error.cause).toBeInstanceOf(Error);

      freeze(corpusRoot, frozen);
      const present = readAuthorityWitness(corpusRoot, recorded);
      expect(present._tag).toBe("ok");
      if (present._tag !== "ok") return;
      expect(sha256Hex(present.value)).toBe(sha256Hex(frozen));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("authorityWitnessIssues", () => {
  const record = (revision: string) => ({
    id: "record-1",
    changes: [{ skill: "example", authority: { path: recorded, revision } }],
  });

  it("refuses a witness that is not frozen, naming the cause", () => {
    const { repo, corpusRoot } = repository();
    try {
      expect(authorityWitnessIssues(corpusRoot, [record(sha256Hex(frozen))])).toEqual([
        {
          path: "example",
          message: expect.stringMatching(/^record-1: authority witness is unavailable: .*ENOENT/),
        },
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("refuses a frozen witness whose digest is not the recorded revision", () => {
    const { repo, corpusRoot } = repository();
    try {
      freeze(corpusRoot, Buffer.from("other bytes\n"));
      expect(authorityWitnessIssues(corpusRoot, [record(sha256Hex(frozen))])).toEqual([
        { path: "example", message: "record-1: authority witness changed" },
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts a frozen witness at the recorded revision, and a change with no authority", () => {
    const { repo, corpusRoot } = repository();
    try {
      freeze(corpusRoot, frozen);
      expect(authorityWitnessIssues(corpusRoot, [record(sha256Hex(frozen))])).toEqual([]);
      expect(
        authorityWitnessIssues(corpusRoot, [{ id: "record-2", changes: [{ skill: "plain" }] }]),
      ).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
