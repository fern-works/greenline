/**
 * greenline/readers (J-150 S2; the register's row of 2026-10-28, "The
 * readers are single-sourced"; docs/SPEC.md, "The readers module"): the
 * product's own readers of the agent's text, those its hooks run and those
 * of the forms its block and close define, exported as one module of the
 * package, so a reader outside the product, the QA apparatus first, reads
 * the forms by the product's readers, versioned with the package. Each is pure and tested over the capture corpus
 * (`test/core/captures.test.ts`). The module re-exports the core's own
 * readers and adds nothing of its own.
 */

/** The reply's pictures counted against their caps, and the reply's text the harness hands its turn's end. */
export {
  pastCap,
  picturesOf,
  replyTextOf,
  type PictureCount,
  type PictureNote,
} from "../core/pictures.ts";

/** The reply's three parts, the refusal form and the cards' labels (J-176 S1). */
export {
  cardLabelsOf,
  refusalOf,
  refusalsIn,
  replyPartsOf,
  unmarkedCards,
  MARKED_LABEL,
  type RefusalLine,
  type ReplyParts,
  type UnmarkedCard,
} from "../core/reply-forms.ts";

/**
 * The skill loads a tool call makes, read from its normalised event: the
 * shell a line runs in, zsh's stop at a refused equals word among it, and
 * the loads settled against the harness's cuts and the reads never made
 * (J-207 S1).
 */
export {
  loadsOf,
  readsAsZsh,
  settledLoads,
  shellSightings,
  sightingsOf,
  skillFileOf,
  type LoadSeen,
  type LoadsReader,
  type ShellReading,
  type Sighting,
  type SkillFile,
  type Span,
} from "../core/skill-loads.ts";

/**
 * The record lint (J-149 S1): a change record's forms read for their
 * breaches, which done is refused on, the verify and review sections'
 * citations, the frame questions' answers and the skills line among them;
 * a discussion record's form, its questions' `decided` among it; and the
 * frame section's question list form read into its map.
 */
export {
  breachesLine,
  discussionBreaches,
  recordBreaches,
  type RecordBreach,
  type RecordLintInput,
  type RecordLintRule,
} from "../core/record-lint.ts";
/** The owner's yes to the proposal: whether words answer it yes, the `yes` line's quote and whether it quotes the request (J-151 S2). */
export { yesQuotes, yesToProposal, yesValue } from "../core/record-lines.ts";
export {
  frameMapOf,
  type FrameMap,
  type FrameQuestion,
  type FrameDecider,
} from "../core/frame-map.ts";

/** A harness's hook payload normalised into the event the readers read. */
export {
  normaliseEvent,
  refusedWords,
  type EventInput,
  type NormalisedEvent,
} from "../core/event.ts";
export { HARNESSES, type Harness } from "../core/adapters.ts";
export type { JsonValue } from "../core/contract.ts";
