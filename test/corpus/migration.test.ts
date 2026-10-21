/** S8c's migration of the ledger (R49 and R52 of the plan procedures-on-the-line): the old chain's rulings, captured from the tree at 846fbc93 before its entries were rewritten in place, against the rewritten chain on disk. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { latestChanges, parseChain, type Chain, type Entry } from "../../src/corpus/chain.ts";
import { editionData } from "../../src/corpus/instrument.ts";
import { handoffIssues, rulingListIssues } from "../../src/corpus/record.ts";

const repository = join(import.meta.dirname, "..", "..");
const entries = join(repository, "corpus/ledger/entries");

/** The tip of the chain the migration rewrote in place; every entry after it was recorded in the new form, and the counts below leave it out. */
const MIGRATED_TIP = "2026-10-11-constraint-driven-development-interview-page";

/** Each old entry's rulings by id: a change entry's ruling cut at its semicolons as the edition cut it, and a source or retirement entry's quoted words from its reason's ruling seam with every ruling label and contradiction its reason names. */
const before: { readonly commit: string; readonly entries: Record<string, readonly string[]> } =
  JSON.parse(readFileSync(join(import.meta.dirname, "rulings-before-migration.json"), "utf8"));

/** A clause as the edition compared it: trimmed, its leading "and " and closing full stop left out. */
const key = (text: string): string =>
  text
    .trim()
    .replace(/^and\s+/, "")
    .replace(/\.$/, "");

function chainOnDisk(): Chain {
  const chain = parseChain(
    readdirSync(entries)
      .filter((name) => name.endsWith(".json"))
      .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(entries, name))) })),
  );
  if (chain._tag === "err") throw chain.error;
  return chain.value;
}

/** Whether a text holds a clause whole: its key, with no letter or digit running on at either end, so "contradiction 1" is not found in "contradiction 15". */
function holds(text: string, clause: string): boolean {
  const escaped = key(clause).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`).test(text);
}

/** The old clauses that do not stand inside exactly one item of an entry's ruling list, each with its count. */
function strays(entry: Entry | undefined, clauses: readonly string[]): readonly string[] {
  const items = entry?.ruling ?? [];
  return clauses.flatMap((clause) => {
    const count = items.filter((item) => holds(item.words, clause)).length;
    return count === 1 ? [] : [`${entry?.id ?? "no entry"}: ${count} items hold '${key(clause)}'`];
  });
}

describe("S8c: the ledger's migration to the entry's form", () => {
  const chain = chainOnDisk();
  const byId = new Map(chain.entries.map(({ entry }) => [entry.id, entry]));

  it("keeps the 288 entries it rewrote, through its tip, by their ids, 161 change, 99 source and 28 retirement, the old capture's ids among them", () => {
    const end = chain.entries.findIndex(({ entry }) => entry.id === MIGRATED_TIP);
    const migrated = chain.entries.slice(0, end + 1);
    expect(migrated).toHaveLength(288);
    const kinds = { change: 0, source: 0, retirement: 0 };
    for (const { entry } of migrated) kinds[entry.kind] += 1;
    expect(kinds).toEqual({ change: 161, source: 99, retirement: 28 });
    expect(Object.keys(before.entries).filter((id) => !byId.has(id))).toEqual([]);
    expect(before.commit).toBe("846fbc93");
  });

  it("holds every clause of every old entry's ruling inside exactly one item of the same entry's ruling list, so none is lost or stated twice", () => {
    expect(
      Object.entries(before.entries).flatMap(([id, clauses]) => strays(byId.get(id), clauses)),
    ).toEqual([]);
  });

  it("holds every clause of each roster skill's latest old entry inside exactly one item of that entry's list", () => {
    const latest = [...latestChanges(chain).values()];
    expect(latest).toHaveLength(37);
    expect(latest.flatMap((entry) => strays(entry, before.entries[entry.id] ?? []))).toEqual([]);
  });

  it("holds every clause of each roster skill's latest old entry inside one of the skill's numbered rulings in the edition", () => {
    const data = editionData(join(repository, "corpus"));
    if (data._tag === "err") throw data.error;
    const missing = data.value.skills.flatMap((skill) =>
      (before.entries[skill.entry.id] ?? [])
        .filter((clause) => !skill.rulings.some((ruling) => holds(ruling.text, clause)))
        .map((clause) => `${skill.name}: '${key(clause)}'`),
    );
    expect(missing).toEqual([]);
  });

  it("passes record's checks over every entry: each change entry keeps its subject's previous ruling list, and each handoff's craft has its page where the workshop stands beside the corpus", () => {
    // A tree that carries the corpus without the workshop, as the public tree does, has no craft page to check.
    const workshop = existsSync(join(repository, "workshop/skills"));
    const issues = chain.entries.flatMap(({ entry }, index) => {
      const earlier = { entries: chain.entries.slice(0, index) };
      if (entry.kind === "change") return rulingListIssues(entry, earlier);
      if (entry.kind === "source")
        return handoffIssues(
          entry,
          (name) => !workshop || existsSync(join(repository, "workshop/skills", name, "SKILL.md")),
        );
      return [];
    });
    expect(issues).toEqual([]);
  });

  it("leaves no reason quoting its ruling at the old seam, the ruling living in its own list", () => {
    expect(
      chain.entries
        .filter(({ entry }) =>
          /, ruled (?:\d{4}-\d{2}-\d{2} \(|before the reading)/.test(entry.reason),
        )
        .map(({ entry }) => entry.id),
    ).toEqual([]);
  });
});
