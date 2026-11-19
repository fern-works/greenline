/*
 * The page the turn's situation calls for (J-142 S2), which the mirror's and
 * status's view line names and the reply's `View` row copies. The choice is
 * the turn-kind table's (`workshop/components/reply-shape.md`, "The view
 * each turn links"), read from the change's step and facts, never from the
 * reply: with no change open, the desk; at the proposal and at the close,
 * the change page; at the deal, the deal view; while a frame's question is
 * open, the frame map; while the change waits on the owner's word, its
 * waiting part (J-154 S3); after a visual was made, that picture; at an
 * interface change's verify, its captures; while a note is open, the
 * notes; otherwise the change page.
 */

/** The page a turn links, before it is an address. */
export type TurnPage =
  | { readonly page: "now" }
  | { readonly page: "change"; readonly change: string }
  | { readonly page: "deal"; readonly change: string }
  | { readonly page: "frame"; readonly change: string }
  | { readonly page: "waiting"; readonly change: string }
  | { readonly page: "visual"; readonly change: string; readonly visual: string }
  | { readonly page: "captures"; readonly change: string }
  | { readonly page: "marks"; readonly change: string };

/** What the choice reads of the open change. */
export interface TurnFacts {
  /** The open change's id; undefined where none is open. */
  readonly change: string | undefined;
  /** No record yet, or a record with no choice line: the owner has not said yes. */
  readonly proposal: boolean;
  /** The record's state, `open`, `stopped`, `done` or `dropped`, as it states it. */
  readonly state: string | undefined;
  /** The step the record reached; null where none is read. */
  readonly step: string | null;
  /** Whether the record's interface fact reads yes. */
  readonly touchesInterface: boolean;
  /** Whether the owner's pick of a dealt direction stands. */
  readonly picked: boolean;
  /** Whether a question of the frame map waits for its answer. */
  readonly frameOpen: boolean;
  /** Whether the change waits on the owner's word (J-154 S3). */
  readonly waiting: boolean;
  /** The newest visual of the change made since the previous turn started, by its id; undefined where none was. */
  readonly madeVisual: string | undefined;
  /** Whether a mark is open. */
  readonly marksOpen: boolean;
}

/**
 * The page the turn's situation calls for.
 * @param facts what the choice reads
 * @returns the page
 */
export function turnPage(facts: TurnFacts): TurnPage {
  const change = facts.change;
  if (change === undefined) return { page: "now" };
  if (facts.proposal) return { page: "change", change };
  if (facts.state === "done" || facts.state === "dropped" || facts.step === "close")
    return { page: "change", change };
  if (facts.step === "design" && facts.touchesInterface && !facts.picked)
    return { page: "deal", change };
  if (facts.frameOpen) return { page: "frame", change };
  if (facts.waiting) return { page: "waiting", change };
  if (facts.madeVisual !== undefined) return { page: "visual", change, visual: facts.madeVisual };
  if (facts.step === "verify" && facts.touchesInterface) return { page: "captures", change };
  if (facts.marksOpen) return { page: "marks", change };
  return { page: "change", change };
}
