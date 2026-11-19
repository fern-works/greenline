import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { DESIGN_PICK_FILE } from "../../core/design-pick.ts";
import type { WaitingOn } from "../../core/inspector/documents.ts";
import { progressTail } from "../../core/progress.ts";
import { readFrameMap } from "../frame-map.ts";
import { pathOf } from "./app/addresses.ts";

/*
 * What a change waits on from the owner (J-154 S3), read from the change's
 * own facts and never from a reply: while a frame question has neither an
 * answer nor a decider, that question; while an interface change at design
 * has no pick standing, the pick; and while the record's "next" line waits
 * on the owner's word, that line's action. Only an open change waits; one
 * whose next word is the agent's waits on nothing. The turn it was asked at
 * is the latest turn's end the change's raw log holds, else the record's
 * last write. The desk, the changes list, the change page and the `View`
 * row all read this one reader.
 */

/** What the reader reads of a record. */
export interface WaitingFacts {
  readonly id: string;
  /** The record's state as it states it; undefined where it states none. */
  readonly state: string | undefined;
  /** The record's "next" line; undefined where it states none. */
  readonly next: string | undefined;
  /** The step the change is at; null where none is read. */
  readonly step: string | null;
  /** Whether the record's interface fact reads yes. */
  readonly touchesInterface: boolean;
}

/** A raw log line's kind and time. */
const LOGGED = z.object({ kind: z.string(), at: z.string() });

/** The turn a question was asked at: the latest turn's end in the change's raw log, else the record's last write. */
function askedAt(root: string, id: string): string | null {
  try {
    const text = readFileSync(join(root, ".greenline", "tmp", id, "events.jsonl"), "utf8");
    const ends = text.split("\n").flatMap((line) => {
      const read = LOGGED.safeParse(parseJson(line));
      return read.success && read.data.kind === "turn-end" ? [read.data.at] : [];
    });
    const last = ends.at(-1);
    if (last !== undefined) return last;
  } catch {
    // No raw log: the record's last write stands for the turn.
  }
  try {
    return statSync(join(root, ".greenline", "ledger", `${id}.md`)).mtime.toISOString();
  } catch {
    return null;
  }
}

/** The step and the action a "next" line names. */
const NEXT_LINE = /^([a-z][a-z0-9-]*): (.*)$/;

/**
 * What a change waits on from the owner, or null where nothing waits.
 * @param root the repository root
 * @param facts what the reader reads of the record
 * @returns what it waits on
 */
export function waitingOn(root: string, facts: WaitingFacts): WaitingOn | null {
  if (facts.state !== "open") return null;
  const id = facts.id;
  const next = facts.next === undefined || facts.next === "none" ? null : facts.next;
  const frame = readFrameMap(root, id).map;
  const open = frame?.questions.find(
    (question) => question.answer === null && question.decided === null,
  );
  if (open !== undefined)
    return {
      question: open.question,
      next,
      step: "frame",
      askedAt: askedAt(root, id),
      options: open.proposed === null ? null : [open.proposed],
      source: {
        label: `the frame map, question ${open.id}`,
        address: pathOf({ page: "change", id, part: "frame-map", anchor: open.node }),
      },
    };
  const picked = existsSync(join(root, ".greenline", "ledger", id, DESIGN_PICK_FILE));
  if (facts.step === "design" && facts.touchesInterface && !picked)
    return {
      question: "Pick one of the three directions dealt for the design.",
      next,
      step: "design",
      askedAt: askedAt(root, id),
      options: null,
      source: { label: "the deal", address: pathOf({ page: "change", id, part: "deal" }) },
    };
  if (next === null || progressTail({ state: "open", next }) !== "waiting on you") return null;
  const named = NEXT_LINE.exec(next);
  return {
    question: named?.[2] ?? next,
    next,
    step: named?.[1] ?? facts.step,
    askedAt: askedAt(root, id),
    options: null,
    source: {
      label: "the record's next line",
      address: pathOf({ page: "change", id, part: "waiting" }),
    },
  };
}
