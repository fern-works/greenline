import { z } from "zod";
import { bodyLines, fieldData, parseFrontMatter, type FieldData } from "./front-matter.ts";
import { agentsAtMost, roundsAtMost, STEP_KIND, type Mode, type ModesDefinition } from "./modes.ts";

/**
 * The record's lines, the agent's (J-176 S1; the register's row of
 * 2026-11-05, "The record's lines are the agent's"; the ledger guide, "The
 * front matter"): every line of a change record is written by the agent in
 * its own words for its meaning, and the CLI makes the lines seen rather
 * than remembered. `greenline open` writes the record's skeleton with each
 * line its mode owes named and a placeholder in it, `<...>` in the record's
 * double quotes; status names the lines the record still lacks while the
 * change is open; the record lint refuses at the done commit a line left
 * missing or a placeholder left in place. No line is written into a record
 * by the CLI or a hook. The owner's words a record quotes, its `yes`, its
 * `stopped` line and its lifting lines, are held against the owner's
 * messages the hooks journaled where the harness hands them its prompts.
 * Pure.
 */

/**
 * Whether a front-matter value is the skeleton's placeholder: text in angle
 * brackets, as `"<why the change exists>"` reads.
 * @param value the value as the front matter reads it
 * @returns true for a placeholder
 */
export function isPlaceholder(value: FieldData | undefined): boolean {
  return PLACEHOLDER_TEXT.safeParse(value).success;
}

/** A placeholder's text: a string in angle brackets, white space aside. */
const PLACEHOLDER_TEXT = z
  .string()
  .trim()
  .regex(/^<[\s\S]*>$/);

/** A line of the body the skeleton left: its placeholder alone. */
const BODY_PLACEHOLDER = /^<[^<>]*(?:<[^<>]*>[^<>]*)*>$/;

/**
 * A line of the body that stands in for the template's text (J-192 S1): a
 * word such as "Pending" or "TBD" alone, its emphasis and its stop aside,
 * which says the section is not written yet as the placeholder did.
 */
const STAND_IN =
  /^[*_`]*(?:pending|tbd|tba|todo|to do|to come|to be written|to be filled(?: in)?|fill in|placeholder|wip|\.\.\.|…)[*_`]*[.!:]?[*_`]*$/i;

/**
 * The first line of a start section that names no start (J-202 S1, the run
 * j196c-landing-4's note 3; J-226 S1, j217t-roster-use finding 4): a list
 * of forms, each as the line's first words, its emphasis, its case and what
 * follows it aside: the word none, `no start`, `not applicable` and `n/a`.
 * The skeleton leaves the section out where no start was loaded, so a
 * section saying so says as little as the placeholder. A form outside the
 * list stays unread, and no form reads a line for the word no alone.
 */
const NONE_START = /^[*_`]*(?:none|no start|not applicable|n\/a)(?![a-z0-9])/i;

/** A list item's bullet before a line's text, which the marks line may carry. */
const BULLET = /^[-*]\s+/;

/** A marks clause: `marks:` opening the line or after a space, read to the line's end (J-226 S1). */
const MARKS_CLAUSE = /(?:^|\s)(marks:.*)$/;

/**
 * The close's marks clause in one of its lines (J-226 S1; j217c-conduct-
 * interface finding 1): `marks:` wherever it starts, opening the line or
 * after a space, read to the line's end and never to a semicolon, since the
 * marks line can hold one; so in a quick close's one line it comes last. A
 * list item's bullet is read past.
 * @param line a line of the close section
 * @returns the clause, trimmed, or undefined where the line holds none
 */
export function marksClause(line: string): string | undefined {
  return MARKS_CLAUSE.exec(line.trim().replace(BULLET, ""))?.[1]?.trim();
}

/**
 * Whether a line of the close section is the marks line on a line of its
 * own, which the one-line rule of an inline close does not count (J-226 S1).
 * @param line a line of the close section
 * @returns true where the line opens with `marks:`
 */
export function isMarksLine(line: string): boolean {
  return line.trim().replace(BULLET, "").startsWith("marks:");
}

/** The lines a record of its mode owes, by when: from the open, and by the done commit. */
export interface OwedLines {
  readonly open: readonly string[];
  readonly close: readonly string[];
}

/**
 * The lines a record owes for its mode (J-176 S1): from the open, the
 * owner's choice, the why, the floors the agent found or none (J-226 S1),
 * the ground and the agent, and the owner's words where the choice is
 * accepted; by the done commit, the skills it used,
 * the agents and the rounds where the mode may start a fresh agent or run
 * a round, each fresh agent's start where it may start one, and the
 * outcome. A mode of the builder alone and no round, quick's, fixes its
 * cost, so its record owes no cost line.
 * @param definition the modes definition
 * @param mode the record's mode
 * @param choice the record's choice, undefined where it states none
 * @returns the lines, each by its field's name
 */
export function owedLines(
  definition: ModesDefinition,
  mode: Mode,
  choice: string | undefined,
): OwedLines {
  return {
    open: ["choice", ...(choice === "accepted" ? ["yes"] : []), "why", "floors", "ground", "agent"],
    close: [
      "skills",
      ...(agentsAtMost(definition, mode) > 1 || roundsAtMost(definition, mode) > 0
        ? ["agents", "rounds"]
        : []),
      ...(agentsAtMost(definition, mode) > 1 ? ["starts"] : []),
      "outcome",
    ],
  };
}

/**
 * Whether a line of a section's body says the section is not written yet:
 * the skeleton's placeholder, or a word standing in for the template's text
 * (J-176 S1, J-192 S1), the readings the `record lacks:` line takes; the
 * close nudge reads a section through them too (J-226 S1).
 * @param line the line, trimmed
 * @returns true for a placeholder or a stand-in
 */
export function unwrittenLine(line: string): boolean {
  return BODY_PLACEHOLDER.test(line) || STAND_IN.test(line);
}

/** What a record still lacks of its lines (J-176 S1). */
export interface RecordLack {
  /** The record's mode, as its line states it. */
  readonly mode: string;
  /** The lines owed from the open that are absent or hold their placeholder. */
  readonly open: readonly string[];
  /** The lines among them with no line at all in the front matter, not even the skeleton's placeholder: a record written before this version's form (J-229 S1). */
  readonly absent: readonly string[];
  /** The lines owed by the done commit that are absent or hold their placeholder. */
  readonly close: readonly string[];
  /** Every front-matter line holding its placeholder, an optional kind's line among them. */
  readonly placeholders: readonly string[];
  /** The sections whose text holds a placeholder line or a stand-in for it, by heading. */
  readonly sections: readonly string[];
  /** The sections among them whose line is a stand-in for the template's text, with the line as written (J-192 S1). */
  readonly standIns: readonly { readonly heading: string; readonly line: string }[];
  /** Whether the record's start section says no start ran, in a listed form, where the skeleton leaves the section out (J-202 S1, J-226 S1). */
  readonly noneStart: boolean;
}

/**
 * What a record lacks of the lines its mode owes, read from its front
 * matter as written, so a record whose choice still holds its placeholder
 * reads too.
 * @param definition the modes definition
 * @param text the record's text
 * @returns the lack, or undefined where the front matter or the mode does not read
 */
export function recordLack(definition: ModesDefinition, text: string): RecordLack | undefined {
  const document = parseFrontMatter(text, "a change record");
  if (document._tag === "err") return undefined;
  const data = fieldData(document.value.fields);
  const named = data["mode"];
  const mode = definition.modes.find((entry) => entry.name === named);
  if (mode === undefined) return undefined;
  const stated = (field: string): boolean =>
    data[field] !== undefined && !isPlaceholder(data[field]);
  const choice = stated("choice") ? String(data["choice"]) : undefined;
  const owed = owedLines(definition, mode, choice);
  const sections: string[] = [];
  const standIns: { heading: string; line: string }[] = [];
  let heading: string | undefined;
  // The section of the kind chosen as a request opens, the start's, its first line of text read once for the word none (J-202 S1).
  const opening = new Set<string>(
    definition.kinds
      .filter(
        (kind) => kind.name !== STEP_KIND && kind.record === "section" && kind.mechanism === "open",
      )
      .map((kind) => kind.name),
  );
  let noneStart = false;
  let startRead = false;
  for (const line of bodyLines(document.value.body)) {
    if (line.fenced) continue;
    const text = line.text.trim();
    const inStart = heading !== undefined && opening.has(heading) && text !== "";
    const startsNone = inStart && !startRead && NONE_START.test(text);
    if (inStart && !text.startsWith("## ")) startRead = true;
    if (text.startsWith("## ")) heading = text.slice(3).trim();
    else if (startsNone) noneStart = true;
    else if (heading === undefined || sections.includes(heading)) continue;
    else if (BODY_PLACEHOLDER.test(text)) sections.push(heading);
    // A word left where the template's text stood says as little as the placeholder (J-192 S1).
    else if (STAND_IN.test(text)) {
      sections.push(heading);
      standIns.push({ heading, line: text });
    }
  }
  return {
    mode: mode.name,
    open: owed.open.filter((field) => !stated(field)),
    absent: owed.open.filter((field) => data[field] === undefined),
    close: owed.close.filter((field) => !stated(field)),
    placeholders: Object.keys(data).filter((field) => isPlaceholder(data[field])),
    sections,
    standIns,
    noneStart,
  };
}

/**
 * What answers the `floors` line, said where the line is lacking, in the
 * `record lacks:` line and at the done door alike (J-226 S1).
 */
export const FLOORS_CURE = "write floors: none, or the floors you found as a list, as [security]";

/**
 * What a missing `yes` is, said in the `record lacks:` line and at the done
 * door alike (J-229 S1): the agent writes the line, and what it holds is the
 * owner's words that answered the proposal, quoted where the session heard
 * them and asked for where it did not; a yes in the agent's own words is no
 * yes, and the edit hook's door holds every write outside the proposal's
 * homes until it stands.
 * @returns the clause, the same for both readers
 */
export function yesLackClause(): string {
  return "the owner's words that answered your proposal, never yours: quote them where this session heard them, ask the owner for them where it did not, and write nothing outside the proposal's homes before it";
}

/**
 * The line status and the mirror print while a change is open, naming the
 * lines its record still lacks (J-176 S1), or undefined where it lacks
 * none: `record lacks: why and ground now; skills, agents, rounds and
 * outcome by the close`. A missing `yes` is named apart as the owner's
 * words, and a record with no line at all for a line the open writes is
 * named as one written before this version's form, with the owner's two
 * ways (J-229 S1).
 * @param lack what the record lacks
 * @returns the line, unindented
 */
export function lackingLine(lack: RecordLack): string | undefined {
  const { close, sections, noneStart, absent } = lack;
  const yes = lack.open.includes("yes");
  const open = lack.open.filter((field) => field !== "yes");
  if (!yes && open.length === 0 && close.length === 0 && sections.length === 0 && !noneStart)
    return undefined;
  const parts = [
    ...(open.length === 0 ? [] : [`${joined(open)} now`]),
    ...(close.length === 0 ? [] : [`${joined(close)} by the close`]),
    ...(sections.length === 0
      ? []
      : [
          `the ${joined(sections)} section${sections.length === 1 ? "" : "s"} at ${sections.length === 1 ? "its placeholder" : "their placeholders"}`,
        ]),
    ...(noneStart ? ["the start section saying no start ran, which the skeleton leaves out"] : []),
  ];
  const own = parts.length === 0 ? [] : [...parts, "write each in your own words for its meaning"];
  const owner = yes ? [`the yes now, ${yesLackClause()}`] : [];
  const floors = open.includes("floors") ? [`for floors, ${FLOORS_CURE}`] : [];
  const older =
    absent.length === 0
      ? []
      : [
          `the record has no line at all for ${joined(absent)}, the form of a record written before this version: the owner's two ways are to complete it as ordinary work, or to close the change and open it again`,
        ];
  return `record lacks: ${[...own, ...owner, ...floors, ...older].join("; ")}`;
}

/** What the harness reports the session runs on: its name and the model as it states it. */
export interface ReportedModel {
  readonly harness: string;
  readonly model: string;
}

/** A model's name in its parts: lowercase words and numbers, the separators aside. */
function modelParts(model: string): readonly string[] {
  return model.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
}

/**
 * The agent line to write where the record's names a model family alone
 * (J-192 S1; the ledger guide, "The front matter"): the line names the
 * harness the session reports and a model whose parts all stand, in order,
 * in the model the harness reports, short of it, as `codex/GPT-6` stands in
 * `gpt-6.1-terra`. A model the harness reports, case and separators aside,
 * another harness, or a model none of the reported one, which a session
 * that moved models wrote, is no family.
 * @param agent the record's agent line
 * @param reported the harness and the model it reports for the session
 * @returns `<harness>/<model>` to write, or undefined where the line is no family alone
 */
export function agentFamilyAlone(agent: string, reported: ReportedModel): string | undefined {
  const match = /^([a-z][a-z0-9-]*)\/(\S(?:.*\S)?)$/.exec(agent);
  if (match?.[1] !== reported.harness || match[2] === undefined) return undefined;
  const stated = modelParts(match[2]);
  const full = modelParts(reported.model);
  if (stated.length === 0 || stated.length >= full.length) return undefined;
  let at = 0;
  for (const part of full) if (part === stated[at]) at += 1;
  return at === stated.length ? `${reported.harness}/${reported.model}` : undefined;
}

/**
 * Names joined with commas and a last "and".
 * @param names the names
 * @returns the words
 */
export function joined(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** The words that answer a proposal yes, anywhere in the owner's words, each on its word boundaries. */
const PROPOSAL_YES =
  /\b(?:yes|yeah|yep|sure|ok|okay|fine|good|great|perfect|go|go ahead|go for it|do it|do that|ship it|proceed|continue|carry on|approve|approved|accept|accepted|agreed|lgtm|looks good|sounds good|that works|works for me)\b/i;

/** The words that say no at their start, which no later yes overrides. */
const PROPOSAL_NO = /^\s*(?:no|nope|nah|not|wait|hold on|stop|don['’]t|do not)\b/i;

/**
 * Whether the owner's words answer the proposal yes (J-151 S2): words that
 * say yes or approve anywhere, on their word boundaries, unless they open
 * with a no, so "no worries, go ahead" still asks. A request to go on
 * without asking, such as "just write the code now and commit what you
 * have", holds none of the words and is no yes.
 * @param words the owner's words at the turn after the proposal
 * @returns true for a yes
 */
export function yesToProposal(words: string): boolean {
  return !PROPOSAL_NO.test(words) && PROPOSAL_YES.test(words);
}

/** The owner's plain words that confirm a restatement, beside the yes's, each on its word boundaries (J-223 S1). */
const CONFIRM_WORDS =
  /\b(?:correct|exactly|right|confirm|confirmed|that['’]s it|that is it|spot on|precisely)\b/i;

/**
 * A word of negation or contrast anywhere in the owner's words, which a
 * confirmation never holds: the words, a contraction with any apostrophe a
 * keyboard or a phone writes (the straight one, the two curled ones, the
 * modifier letter, the backtick and the acute accent), and the negations
 * written without one, a list of forms and never a bare "nt" ending, which
 * would catch "want" or "front" (after the falsifier's third reading).
 */
const CONFIRM_REFUSED =
  /\b(?:not|no|never|but|except|however|although|though|unless|instead|opposite|wrong|incorrect|isnt|arent|wasnt|werent|dont|doesnt|didnt|cant|cannot|couldnt|wont|wouldnt|shouldnt|mustnt|hasnt|havent|hadnt|aint|nope|nah)\b|n['’‘ʼ`´]t\b/i;

/** A message's opening clause: its words before the first comma, full stop, semicolon, colon or line end. */
function openingClause(words: string): string {
  return words.trim().split(/[,.;:\n]/)[0] ?? "";
}

/**
 * Whether the owner's words confirm a restatement put to them (J-223 S1,
 * after the falsifier's second reading): the yes's words or the plain
 * confirming words, "That's correct.", "Exactly.", "Right.", "Confirmed."
 * and "That's it." among them, standing in the message's opening clause,
 * the message holding no question mark and no word of negation or
 * contrast anywhere, "not", a word ending in n't, "no", "never", "but",
 * "except", "however", "although", "though", "unless", "instead",
 * "opposite", "wrong" or "incorrect". A false no costs one more ask and a
 * false yes lets a careful change go on unconfirmed, so the reader takes
 * the refusal's side. The proposal's yes reader is unchanged.
 * @param words the owner's words after the restatement was put
 * @returns true for a confirmation
 */
export function confirmsRestatement(words: string): boolean {
  if (words.includes("?") || CONFIRM_REFUSED.test(words)) return false;
  const opening = openingClause(words);
  return CONFIRM_WORDS.test(opening) || PROPOSAL_YES.test(opening);
}

/**
 * The most characters the close's `outcome` line holds (J-168 S1): one
 * sentence of what landed, in the agent's own words, which the change page
 * opens on; the record lint refuses a longer one.
 */
export const OUTCOME_CAP = 200;

/** How much of the owner's words the `yes` line quotes. */
const YES_CAP = 200;

/** Words read for their comparison: one line, its spaces single. */
function plainWords(words: string): string {
  return words.replaceAll(/\s+/g, " ").trim();
}

/**
 * The `yes` line's value: the owner's words that answered the proposal, on
 * one line, at most two hundred characters, in the record's double quotes.
 * @param words the owner's words
 * @returns `"Yes, go ahead."`
 */
export function yesValue(words: string): string {
  return `"${plainWords(words).slice(0, YES_CAP).replaceAll('"', "'")}"`;
}

/**
 * Whether a record's `yes` line quotes the request (J-151 S2): its words
 * stand in the request, spaces and quotes as the line writes them.
 * @param quote the `yes` line's words
 * @param request the owner's request that answered the proposal
 * @returns true where the quote is the request's
 */
export function yesQuotes(quote: string, request: string): boolean {
  const said = plainWords(quote);
  return said !== "" && plainWords(request).replaceAll('"', "'").includes(said);
}

/** The owner's messages the hooks journaled for a session or a repository (J-176 S1), or none kept where the harness handed the hooks no owner text. */
export type OwnerJournal =
  | { readonly kept: true; readonly messages: readonly string[] }
  | { readonly kept: false };

/** Whether a message holds a quote, spaces, quotes and case as a quote may write them. */
function holds(message: string, quote: string): boolean {
  return yesQuotes(quote.toLowerCase(), message.toLowerCase());
}

/**
 * Whether words a record's line quotes stand in one of the owner's
 * journaled messages, spaces, quotes and case as the line writes them.
 * @param words the line's words
 * @param messages the owner's messages
 * @returns true where one message holds them
 */
export function saidByOwner(words: string, messages: readonly string[]): boolean {
  return messages.some((message) => holds(message, words));
}

/** The words a message asks for a lasting picture by: to keep or save one, or the picture named. */
const PICTURE_ASK =
  /\b(?:keep|save|store|picture|pictures|diagram|diagrams|drawing|draw|sketch|chart|map|visual|image|figure)\b/i;

/** What a real ask is, which each refusal of the keep's `--ask` names (J-192 S1). */
const REAL_ASK =
  "a real ask is the owner's whole message asking for a lasting picture, quoted as they said it";

/** A message's sentences, each to its stop, read for a quote of a whole one. */
function sentencesOf(message: string): readonly string[] {
  return plainWords(message)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/** Two quotes the same, spaces, quotes and case as a quote may write them. */
function sameWords(a: string, b: string): boolean {
  const plain = (words: string): string => plainWords(words).replaceAll('"', "'").toLowerCase();
  return plain(a) === plain(b);
}

/**
 * Why the words `greenline picture keep --ask` quotes are not the owner's
 * ask, or undefined where they are (J-192 S1; the reading `owner-yes` makes
 * of the journal): the words stand, and where the hooks journaled the
 * owner's messages, one of them holds them whole, the message or one of its
 * sentences and never a fragment of it, and that message asks for a lasting
 * picture, to keep, save or draw one; a question that asks for none is
 * answered inline. Where no journal stands the words alone are read: three
 * words at least, asking for a picture.
 * @param ask the `--ask` words, undefined where none was given
 * @param journal the owner's journaled messages
 * @returns the reason, in a refusal's words naming what a real ask is, or undefined
 */
export function askNotHeld(ask: string | undefined, journal: OwnerJournal): string | undefined {
  const words = ask === undefined ? "" : plainWords(ask);
  if (words === "") return `--ask is required: ${REAL_ASK}`;
  if (!journal.kept) {
    if (words.split(" ").length < 3)
      return `"${words}" is a fragment, not the owner's ask: ${REAL_ASK}`;
    return PICTURE_ASK.test(words)
      ? undefined
      : `"${words}" asks for no picture to keep: ${REAL_ASK}, and a question is answered inline`;
  }
  const holding = journal.messages.filter((message) => holds(message, words));
  if (holding.length === 0)
    return `no message of the owner's holds "${words}": ${REAL_ASK}, or draw the picture inline and leave the home alone`;
  const whole = holding.find(
    (message) =>
      sameWords(message, words) || sentencesOf(message).some((each) => sameWords(each, words)),
  );
  if (whole === undefined)
    return `"${words}" is a fragment of the owner's message "${plainWords(holding[0] ?? "")}": ${REAL_ASK}`;
  return PICTURE_ASK.test(whole)
    ? undefined
    : `the owner's message "${plainWords(whole)}" asks for no picture to keep: answer it inline; ${REAL_ASK}`;
}

/**
 * Why a lifting line's words are not the owner's, as a refusal names it
 * (J-193 S1, the run j109t-conduct-runnere): words no message holds, or
 * words joined from two or more of the owner's messages, each named, since
 * a line lifts only on one message's words whole.
 * @param words the line's words, which no one message holds
 * @param messages the owner's journaled messages
 * @returns the clause, after the line's quote
 */
export function unownedWords(words: string, messages: readonly string[]): string {
  const parts = [
    ...new Set(messages.map((message) => plainWords(message)).filter((message) => message !== "")),
  ].filter((message) => holds(words, message));
  if (parts.length < 2) return "which no message of the owner's holds";
  const named = parts.map((message) => `"${message}"`);
  return `which no one message of the owner's holds whole: it joins ${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""}, ${parts.length === 2 ? "two" : String(parts.length)} of their messages`;
}

/**
 * Whether a record's `yes` line is the owner's settled word (J-186 S1): the
 * record HEAD's commit carries says `choice: accepted` with the same `yes`
 * line, and the change's first commit, which carried it, waited for the
 * yes, so no journal is read for it again in any session, clone or
 * worktree.
 * @param committed the record's lines as HEAD's commit holds them, undefined where it holds none
 * @param yes the `yes` line of the record being judged
 * @returns true where the yes stands settled
 */
export function yesSettled(
  committed:
    | { readonly choice?: string | undefined; readonly yes?: string | undefined }
    | undefined,
  yes: string | undefined,
): boolean {
  return yes !== undefined && committed?.choice === "accepted" && committed.yes === yes;
}

/**
 * Why an accepted record's `yes` line does not hold the owner's yes, or
 * undefined where it does (J-176 S1; the ledger guide, "The front
 * matter"): the line quotes the owner's words that answered the proposal,
 * and where the hooks journaled the owner's messages, one of them holds
 * those words and reads as a yes. A record whose choice is not `accepted`
 * owes no yes line.
 * @param choice the record's choice line
 * @param yes the record's yes line
 * @param journal the owner's journaled messages
 * @returns the reason, in a refusal's words, or undefined
 */
export function yesNotHeld(
  choice: string | undefined,
  yes: string | undefined,
  journal: OwnerJournal,
): string | undefined {
  if (choice !== "accepted") return undefined;
  if (yes === undefined)
    return "the record says choice: accepted with no yes line: quote the owner's words that answered the proposal in it";
  if (!journal.kept) return undefined;
  const holding = journal.messages.filter((message) => holds(message, yes));
  if (holding.length === 0)
    return `the yes line quotes "${yes}", which no message of the owner's holds: quote their words as they said them, or ask for their yes`;
  return holding.some(yesToProposal)
    ? undefined
    : `the yes line quotes "${yes}", and the owner's message that holds it reads as no yes: ask for their yes before the work goes on`;
}

/**
 * The mode whose frame owes its subject nodes covered and the owner's
 * confirmation (J-223 S1), read by the name on the record's mode line; the
 * modes definition stays as it is.
 */
export const CAREFUL_MODE = "careful";

/**
 * The owner's messages a careful record's `confirmed` line is held against
 * (J-223 S1): every message the hooks journaled, each with the time they saw
 * it, and the time the CLI first noted the frame's restatement put to the
 * owner, at a turn's end or a question tool's card; none kept where no hook
 * journaled, or where HEAD's commit carries the line settled.
 */
export type ConfirmJournal =
  | {
      readonly kept: true;
      /** When the restatement was first noted put to the owner, undefined where it never was. */
      readonly asked: string | undefined;
      readonly messages: readonly { readonly at: string; readonly words: string }[];
    }
  | { readonly kept: false };

/**
 * Whether a careful record's `confirmed` line is the owner's settled word
 * (J-223 S1), the yes's twin: the record HEAD's commit carries is careful
 * with the same line, which git's pre-commit held to the journal when it
 * was committed, so no session, clone or worktree reads it again; a line
 * carried on a record with a ticket line is never settled.
 * @param committed the record's lines as HEAD's commit holds them, undefined where it holds none
 * @param confirmed the `confirmed` line of the record being judged
 * @returns true where the confirmation stands settled
 */
export function confirmedSettled(
  committed:
    | {
        readonly mode?: string | undefined;
        readonly ticket?: string | undefined;
        readonly confirmed?: string | undefined;
      }
    | undefined,
  confirmed: string | undefined,
): boolean {
  return (
    confirmed !== undefined &&
    committed?.mode === CAREFUL_MODE &&
    committed.ticket === undefined &&
    committed.confirmed === confirmed
  );
}

/** Where a careful frame's confirmation stands (J-223 S1), each state a wait's words name. */
export type ConfirmState =
  | { readonly kind: "held" }
  /** No line, and no journal to read the ask against. */
  | { readonly kind: "missing" }
  /** No line, and the restatement never noted put to the owner. */
  | { readonly kind: "not-put" }
  /** No line, the restatement put, and no message of the owner's since. */
  | { readonly kind: "unanswered" }
  /** No line, the restatement put, and the owner's words since it. */
  | { readonly kind: "answered" }
  /** The line quotes words the owner said before the restatement was put, or with none put. */
  | { readonly kind: "before"; readonly words: string }
  /** The line quotes words no message of the owner's holds. */
  | { readonly kind: "unheld"; readonly words: string }
  /** The message after the ask that holds the words reads as no yes. */
  | { readonly kind: "no"; readonly words: string };

/**
 * Where a careful record's confirmation stands (J-223 S1; the ledger guide,
 * "The front matter"): the `confirmed` line quotes the owner's words that
 * answered the frame's restatement, and where the hooks journaled the
 * owner's messages, one of them, seen at or after the time the CLI noted the
 * restatement put to them, holds those words and reads as a yes
 * (`confirmsRestatement`); words said before, the yes to the proposal and an
 * interview's answers among them, never confirm it. Where no hook journaled,
 * the line's presence is read.
 * @param confirmed the record's confirmed line, its placeholder read as none
 * @param journal the owner's timed messages and the ask's time
 * @returns the state
 */
export function confirmState(confirmed: string | undefined, journal: ConfirmJournal): ConfirmState {
  if (!journal.kept) return confirmed === undefined ? { kind: "missing" } : { kind: "held" };
  const asked = journal.asked;
  const since = asked === undefined ? [] : journal.messages.filter((entry) => entry.at >= asked);
  if (confirmed === undefined) {
    if (asked === undefined) return { kind: "not-put" };
    return since.length === 0 ? { kind: "unanswered" } : { kind: "answered" };
  }
  const holding = since.filter((entry) => holds(entry.words, confirmed));
  if (holding.length === 0)
    return journal.messages.some((entry) => holds(entry.words, confirmed))
      ? { kind: "before", words: confirmed }
      : asked === undefined
        ? { kind: "before", words: confirmed }
        : { kind: "unheld", words: confirmed };
  return holding.some((entry) => confirmsRestatement(entry.words))
    ? { kind: "held" }
    : { kind: "no", words: confirmed };
}

/**
 * What a real stop is, which every refusal of a stop names (J-200 S1, the
 * run j196t-states-stop-2, whose agent set the record stopped twice while it
 * waited for the owner inside the session): the owner's words that end the
 * work for now, one message of theirs quoted whole in the record's
 * `stopped` line; a wait for the owner inside a session, for a review, an
 * answer or a yes, is no stop and leaves the record open.
 */
export const REAL_STOP =
  "a change is stopped only on the owner's words that end the work for now, one message of theirs quoted whole in the record's stopped line, or on their request for another change, quoted after \"another change:\", and a wait for the owner inside a session, for a review, an answer or a yes, is no stop and leaves the record open";

/** The words that end the work for now, anywhere in the owner's words, each on its word boundaries. */
const STOP_WORDS =
  /\b(?:stop|stopping|pause|halt|park it|park this|park the change|enough for (?:now|today)|that['’]s enough|for (?:now|today|tonight)|call it a day|pick (?:it|this|that) up|come back to (?:it|this|that)|resume (?:it |this )?(?:later|tomorrow)|tomorrow|wrap (?:it )?up|leave it (?:there|here|for now|for today)|end (?:here|there|the session)|hold off)\b/i;

/**
 * Whether the owner's words end the work for now (J-200 S1): words that
 * stop, pause or put the work off anywhere in them, on their word
 * boundaries, so "Stop there for today; I will pick this up tomorrow" is a
 * stop and "show them to me before you write the code" is a wait; a stop
 * word bound to a step, "pause after the build", is a wait too, and the
 * words that remain decide (J-228 S1).
 * @param words the owner's words
 * @returns true for a stop
 */
export function readsAsStop(words: string): boolean {
  return STOP_WORDS.test(words.replaceAll(BOUND_STOP, " "));
}

/**
 * A stop word bound to a step (J-228 S1, the run j217t-conduct-empty, whose
 * owner's "Yes, go ahead at regular, and pause after the build." the door
 * took as a stop): `stop`, `pause` or `halt` followed by `after`, `before`,
 * `once` or `when`, up to the clause's end, a wait inside the session that
 * is set aside before the stop words are read again, so "pause after the
 * build" is a wait and "pause after the build; we pick it up tomorrow" is
 * still a stop; the bound clause ends at a stop of the sentence or at
 * "and", "then" or "but", so "stop after the build and pick it up
 * tomorrow" stays a stop.
 */
const BOUND_STOP =
  /\b(?:stop(?:ping)?|paus(?:e|ing)|halt(?:ing)?)\s+(?:after|before|once|when)\b[^,;.!?]*?(?=\s*(?:[,;.!?]|\b(?:and|then|but)\b|$))/gi;

/**
 * The words that answer a wait and resume the work (J-205 S1, the run
 * j196t-conduct-emptyb, whose fresh session was told "Carry on with that
 * change.", "Go on." and "Yes, please." and left the stopped change
 * stopped): anywhere in the owner's words, each on its word boundaries,
 * never followed by a time that puts the work off.
 */
const RESUME_WORDS =
  /\b(?:carry(?:ing)? on|go on|continu(?:e|ing)|resum(?:e|ing)|pick (?:it|this|that) (?:back )?up|pick up where|keep going|proceed(?:ing)?)\b(?!\s+(?:later|tomorrow|another time|next time|some other time))/gi;

/** The words before a resume word that refuse it or put it after something the owner asks first. */
const RESUME_REFUSED =
  /\b(?:don['’]t|do not|not|never|no need to|before you|until)\s+(?:\w+\s+){0,2}?(?:carry|go on|continu|resum|pick|keep going|proceed)/i;

/**
 * Whether the owner's words answer a wait and resume the work (J-205 S1):
 * words that carry on, go on, continue, resume, pick the work up, keep
 * going or proceed anywhere in them, on their word boundaries, unless they
 * open with a no, refuse the resume or put it off, or read as a stop once
 * the resume's words are set aside, so "Carry on with that change." is a
 * resume and "Stop here for today; we carry on later." is none.
 * @param words the owner's words
 * @returns true for a resume
 */
export function readsAsResume(words: string): boolean {
  if (PROPOSAL_NO.test(words) || RESUME_REFUSED.test(words)) return false;
  const rest = words.replaceAll(RESUME_WORDS, " ");
  return rest !== words && !readsAsStop(rest);
}

/** A wait whose answer is a yes: the owner's yes, go-ahead, approval, permission or confirmation, or their resume. */
const WAIT_ASKS_YES =
  /\b(?:yes|go[- ]ahead|approv\w*|permission|consent|confirm\w*|resum\w*|continu\w*|carry on|proceed|go on|ok(?:ay)?|sign[- ]off)\b/i;

/**
 * A wait on the owner a record's next line names (J-214 S1, the run
 * j196t-states-stop-2d, whose next line at the stop read "build: wait for
 * the owner's review of the tests, then implement findByYear"; J-222 S1,
 * the run j217c-states-stop, whose next line read "build: wait on the
 * owner's review of the five red tests (...), then write findByYear"; the
 * ledger guide, "The \"next\" line"): a wait verb, `wait on`, `wait for`,
 * `wait until`, `waiting on` or `waiting for`, before the owner or "you",
 * its words from the owner on, read up to a comma, a semicolon, a
 * sentence's end or "then". A fixed list, never any line that holds the
 * word owner: a form an agent writes outside it stays unread until the
 * next family names it.
 */
const WAIT_VERB_OWNER =
  /\b(?:wait(?:s|ing)?) (?:on|for|until) ((?:the owner|your?)\b[\s\S]*?)(?=\s*(?:[,;]|\.(?:\s|$)|\bthen\b|$))/i;

/**
 * The owner's act named with no wait verb (J-222 S1): `the owner's
 * review`, `the owner's answer`, `the owner's yes`, `the owner reviews` and
 * `the owner to review`, its words read as a wait verb's are.
 */
const OWNER_ACT =
  /\b(the owner(?:['’]s (?:review|answer|yes)| reviews| to review)\b[\s\S]*?)(?=\s*(?:[,;]|\.(?:\s|$)|\bthen\b|$))/i;

/**
 * A review of shown tests (J-222 S1), a wait on the owner while the record
 * is stopped, since a stop keeps the tests the owner saw for their review:
 * "the review of the shown tests" or "show the tests for review", read in
 * one clause of the action.
 */
const SHOWN_REVIEW =
  /\b(?:review of\b[^,;]*?\btests?\b|tests?\b[^,;]*?\bfor (?:the |a |your |their )?review\b)/i;

/** What ends a clause of the action: a comma, a semicolon, a sentence's end or "then". */
const CLAUSE_END = /\s*(?:[,;]|\.(?:\s|$)|\bthen\b)\s*/i;

/** A parenthetical aside, such as the path a wait's tests are kept at, which the wait's words leave out. */
const ASIDE = /\s*\([^()]*\)/g;

/** A wait whose answer is the owner's resume itself. */
const WAIT_ASKS_RESUME =
  /\b(?:resum\w*|continu\w*|carry on|proceed\w*|go on|keep going|pick (?:it|this|that) (?:back )?up)\b/i;

/**
 * The wait on the owner a next line's action names (J-214 S1, J-222 S1):
 * its words, such as "the owner's review of the tests", under a wait verb
 * before the owner, the owner's act named alone, or, while the record is
 * stopped, a review of shown tests, its parenthetical asides left out; or
 * undefined where the action names none or asks the owner to resume, such
 * as the run j196t-conduct-emptyb's "wait for the owner to resume
 * independent review", which is the resume's own (J-205 S1).
 * @param action the next line's action, its step aside, undefined where it names none
 * @param stopped whether the record reads stopped
 * @returns the wait's words, or undefined
 */
export function ownerWait(action: string | undefined, stopped = false): string | undefined {
  if (action === undefined) return undefined;
  const plain = action.replaceAll(ASIDE, "");
  const words =
    WAIT_VERB_OWNER.exec(plain)?.[1] ??
    OWNER_ACT.exec(plain)?.[1] ??
    (stopped ? plain.split(CLAUSE_END).find((clause) => SHOWN_REVIEW.test(clause)) : undefined);
  const trimmed = words?.trim();
  return trimmed === undefined || trimmed === "" || WAIT_ASKS_RESUME.test(trimmed)
    ? undefined
    : trimmed;
}

/**
 * The review's words, which answer a wait on the owner where a resume does
 * not (J-214 S1): approval, the tests looking good or right, the go-ahead
 * with the code, the code or the implementation asked for, and the changes
 * the owner asks of what they reviewed, each on its word boundaries.
 */
const REVIEW_WORDS =
  /\b(?:approv(?:e|ed|al)|lgtm|looks? (?:good|right|fine|correct)|go ahead with the (?:code|implementation)|write the code|implement(?:ing)?|make (?:these|those|the|that) changes?|(?:change|fix) (?:the|this|that|these|those|it|them|one|each|both|all)\b)/i;

/** The words before a review's word that refuse it or put it after something the owner asks first. */
const REVIEW_REFUSED =
  /\b(?:don['’]t|do not|doesn['’]t|does not|not|never|no need to|before you|until)\s+(?:\w+\s+){0,2}?(?:approv|looks?|go ahead|write|implement|make|change|fix)/i;

/**
 * Whether the owner's words answer a wait on the owner the next line names
 * (J-214 S1; the register's row of 2026-11-05, "The keeper over the
 * oracle"): the review's words, or a yes where the words hold no resume,
 * since a resume answers the stop and a yes beside it is the resume's;
 * never words that open with a no, refuse the review or read as a stop. So
 * "Looks good, go ahead" and the second pass's "The tests look right; go
 * on and write the code." answer it, and "Carry on with that change." and
 * "OK, carry on" do not.
 * @param words the owner's message of the turn
 * @returns true where the words answer the wait
 */
export function answersOwnerWait(words: string): boolean {
  if (PROPOSAL_NO.test(words) || REVIEW_REFUSED.test(words) || readsAsStop(words)) return false;
  if (REVIEW_WORDS.test(words)) return true;
  return words.replaceAll(RESUME_WORDS, " ") === words && yesToProposal(words);
}

/** What the owner's words of a turn do to the wait a record's next line names (J-205 S1, J-214 S1). */
export type WaitAnswer =
  | { readonly kind: "answered" }
  | {
      readonly kind: "resumed";
      /** The wait on the owner that still stands, in the next line's words (`ownerWait`). */
      readonly wait: string;
    };

/**
 * What the owner's words of a turn do to the wait a record's next line
 * names (J-205 S1, J-214 S1; the register's row of 2026-11-05, "The keeper
 * over the oracle"): where the next line names a wait on the owner
 * (`ownerWait`), its yes and its review's words answer it and a resume
 * resumes the stopped work while the wait stands; elsewhere a resume
 * answers any wait, and a yes a wait whose answer is a yes, such as the
 * run j196t-conduct-emptyb's "wait for the owner to resume independent
 * review". Words that read as a stop answer none, and a message off the
 * lists leaves the wait as the record states it.
 * @param wait the next line's action that waits on the owner, undefined where it names none
 * @param words the owner's message of the turn, undefined where none stands
 * @param stopped whether the record reads stopped, which makes a review of shown tests a wait on the owner (`ownerWait`)
 * @returns the answer, or undefined where the words do neither
 */
export function waitAnswer(
  wait: string | undefined,
  words: string | undefined,
  stopped = false,
): WaitAnswer | undefined {
  if (words === undefined) return undefined;
  const named = ownerWait(wait, stopped);
  if (named !== undefined) {
    if (answersOwnerWait(words)) return ANSWERED_WAIT;
    return readsAsResume(words) ? { kind: "resumed", wait: named } : undefined;
  }
  if (readsAsResume(words)) return ANSWERED_WAIT;
  return wait !== undefined &&
    WAIT_ASKS_YES.test(wait) &&
    yesToProposal(words) &&
    !readsAsStop(words)
    ? ANSWERED_WAIT
    : undefined;
}

/** The answer that lifts a wait. */
const ANSWERED_WAIT: WaitAnswer = { kind: "answered" };

/**
 * Whether the owner's words of a turn answer the wait a record's next line
 * names (J-205 S1, J-214 S1): `waitAnswer` reads them as the answer, not
 * as a resume that leaves a wait on the owner standing.
 * @param wait the next line's action that waits on the owner, undefined where it names none
 * @param words the owner's message of the turn, undefined where none stands
 * @returns true where the words answer it
 */
export function answersWait(wait: string | undefined, words: string | undefined): boolean {
  return waitAnswer(wait, words)?.kind === "answered";
}

/*
 * The owner's answer to the landing's offer (J-209 S1, the run
 * j196c-landing-4b, whose agent was told "Merge it." after the close
 * offered the local merge into `main`, read the base's moved commit and
 * withheld the merge, the landing fact naming the state and not the words):
 * fixed lists of the words that ask for the merge, the push and neither,
 * beside the resume words, each on its word boundaries, a refusal of an act
 * or a time that puts it off read as neither. The landing fact reads the
 * owner's messages since the offer against them (`../shell/landing.ts`).
 */

/** The act a landing's offer named: the merge into the base where the remote names no forge, the push where it names one. */
export type LandingOffer = "merge" | "push";

/** What the owner's words answer the landing's offer: the merge, into the base they name where they name one, the push, or neither. */
export type LandingAnswer =
  | { readonly kind: "merge"; readonly base: string | undefined }
  | { readonly kind: "push" }
  | { readonly kind: "decline" };

/** The words that ask for the merge: merge it, merge, land it locally, go ahead with the merge, merge into a base. */
const MERGE_WORDS = /\b(?:merg(?:e|ing)|land (?:it|this|that|the change|the branch) locally)\b/i;

/** The words that ask for the push: push it, push the branch, open the pull request, land it where the remote is a forge. */
const PUSH_WORDS =
  /\b(?:push(?:ing)?|(?:open|raise|create|make) (?:a|the) (?:pull request|pr)|land (?:it|this|that|the change|the branch) (?:where|on|at) the (?:remote|forge)\w*)\b/i;

/** The words that land the change in the act the offer named. */
const LAND_WORDS = /\bland (?:it|this|that|the change|the branch)\b/i;

/** The words before an act that refuse it. */
const ACT_REFUSED =
  /\b(?:don['’]t|do not|not|never|no need to|no|without)\s+(?:\w+\s+){0,2}?(?:merg|push|land|open)/i;

/** An act the words put off, a time after it: "merge it later". */
const ACT_PUT_OFF =
  /\b(?:merg\w*|push\w*|land)\b(?:\s+\w+){0,3}?\s+(?:later|tomorrow|another time|next time|some other time|not now|not yet)\b/i;

/** The words that leave the branch, decline the landing or put it off, read where the words ask for no act. */
const LANDING_DECLINED =
  /\b(?:leave (?:the |this |that |my )?branch|leave it|keep the branch|not now|not yet|later|another time|next time|some other time|hold off|no landing)\b/i;

/** A message that opens on a no. */
const OPENS_NO = /^\s*(?:no|nope|nah)\b/i;

/** A question that asks for nothing to be done, unlike "Can you merge it?". */
const ASKS_NOTHING = (words: string): boolean =>
  /\?\s*$/.test(words) && !/^\s*(?:please\s+)?(?:can|could|would|will) you\b/i.test(words);

/** The base the words name after `into`, a quote and a closing stop aside. */
const INTO_BASE = /\binto\s+[`'"]?([A-Za-z0-9._/-]+)/i;

/**
 * What the owner's words answer the landing's offer (J-209 S1): neither
 * where they refuse an act or put it off, "Don't merge it." or "Merge it
 * later."; the merge where they hold the merge words, into the base they
 * name after `into`; the push where they hold the push words; neither where
 * they ask for no act and leave the branch, decline, put the landing off,
 * open on a no or read as a stop; and the one act the offer named on a yes,
 * such as "Yes, go ahead.", or on "land it". A question that asks nothing
 * done, words holding both acts, words off the lists and a resume's words
 * with neither act's, such as the run j217c-states-stop's "Carry on with
 * that change." (J-222 S1), answer nothing, which leaves the offer as the
 * record states it. Where no offer is noted, the words answer only where
 * they name the merge, the push or the landing (J-228 S1, the run
 * j201c-visuals, whose owner's "Yes, go ahead." to a proposal, in the turn
 * whose own close made the record done, read as the merge into main).
 * @param words the owner's message
 * @param offer the act the offer named
 * @param offered whether the offer was noted before the words came
 * @returns the answer, or undefined where the words answer none
 */
export function landingAnswer(
  words: string,
  offer: LandingOffer,
  offered = true,
): LandingAnswer | undefined {
  if (words.trim() === "" || ASKS_NOTHING(words)) return undefined;
  // Before the offer, only an act's words answer it (J-228 S1): a yes then answered a proposal or a review.
  if (!offered && !MERGE_WORDS.test(words) && !PUSH_WORDS.test(words) && !LAND_WORDS.test(words))
    return undefined;
  if (ACT_REFUSED.test(words) || ACT_PUT_OFF.test(words)) return { kind: "decline" };
  const merge = MERGE_WORDS.test(words);
  const push = PUSH_WORDS.test(words);
  if (merge && push) return undefined;
  if (
    !merge &&
    !push &&
    (LANDING_DECLINED.test(words) || OPENS_NO.test(words) || readsAsStop(words))
  )
    return { kind: "decline" };
  // A resume's words answer the stop and not the offer (J-222 S1): a yes beside them is the resume's.
  const act = merge
    ? "merge"
    : push
      ? "push"
      : LAND_WORDS.test(words) || (yesToProposal(words) && !readsAsResume(words))
        ? offer
        : undefined;
  if (act === undefined) return undefined;
  if (act === "push") return { kind: "push" };
  const base = INTO_BASE.exec(words)?.[1]?.replace(/[.,;:!]+$/, "");
  return { kind: "merge", base: base === "" ? undefined : base };
}

/**
 * Why a record's `stopped` line does not hold the owner's stop, or
 * undefined where it does (J-200 S1; the ledger guide, "Stops and
 * resumes"): the line quotes the owner's words that stopped the change and
 * reads as a stop, or, after `another change:`, the owner's request for
 * another change, which stops the one the session holds; where the hooks
 * journaled the owner's messages, one of them holds those words whole and
 * reads as a stop, the request aside.
 * @param stopped the record's stopped line
 * @param journal the owner's journaled messages
 * @returns the reason, after the record's path, or undefined
 */
export function stopNotHeld(
  stopped: string | undefined,
  journal: OwnerJournal,
): string | undefined {
  if (stopped === undefined) return "carries no stopped line";
  // Another change's request stops the change the session holds: its words, after the prefix, are the owner's request.
  const other = stopped.toLowerCase().startsWith(ANOTHER_CHANGE)
    ? stopped.slice(ANOTHER_CHANGE.length).trim()
    : undefined;
  const words = other ?? stopped;
  if (words === "")
    return `has the stopped line "${stopped}", which quotes no words of the owner's`;
  const stop = (text: string): boolean => other !== undefined || readsAsStop(text);
  if (!journal.kept)
    return stop(words) ? undefined : `has the stopped line "${stopped}", which reads as no stop`;
  const holding = journal.messages.filter((message) => holds(message, words));
  if (holding.length === 0)
    return `has the stopped line "${stopped}", ${unownedWords(words, journal.messages)}`;
  return holding.some(stop)
    ? undefined
    : `has the stopped line "${stopped}", and the owner's message that holds it reads as no stop`;
}

/** The prefix of a stopped line whose words are the owner's request for another change, which stops the change the session holds (J-200 S1). */
const ANOTHER_CHANGE = "another change:";
