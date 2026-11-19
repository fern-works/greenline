import { shortId } from "../../core/progress.ts";
import type { Ref } from "../../core/inspector/documents.ts";
import { pathOf } from "./app/addresses.ts";

/*
 * The references the inspector's documents carry (J-154 S3, on J-156's
 * design): every change, plan, ticket, discussion, picture, note and skill
 * a document names is a reference, its id, the name the server gives it and
 * the page's address, so the client shows a name and never composes an
 * address.
 */

/** Words joined by hyphens as a sentence's start: `dense-list` reads `Dense list`. */
function humanised(words: string): string {
  const spaced = words.replace(/[-_]+/g, " ").trim();
  return spaced === "" ? words : `${spaced[0]?.toUpperCase() ?? ""}${spaced.slice(1)}`;
}

/**
 * A change's reference: its id without its date, humanised.
 * @param id the change's id
 * @returns the reference
 */
export function changeRef(id: string): Ref {
  return { id, name: humanised(shortId(id)), address: pathOf({ page: "change", id, part: null }) };
}

/**
 * A plan's reference: its folder's name without its number, humanised.
 * @param name the plan's folder name
 * @returns the reference
 */
export function planRef(name: string): Ref {
  return {
    id: name,
    name: humanised(name.replace(/^\d+[-_]/, "")),
    address: pathOf({ page: "plan", name, part: null }),
  };
}

/**
 * A ticket's reference: its id with its intent, at its place in the plan's tickets.
 * @param plan the plan's folder name
 * @param id the ticket's id
 * @param intent the ticket's intent; its name where it states one
 * @returns the reference
 */
export function ticketRef(plan: string, id: string, intent: string): Ref {
  return {
    id,
    name: intent.trim() === "" ? id : `${id} ${intent.trim()}`,
    address: pathOf({ page: "plan", name: plan, part: id }),
  };
}

/**
 * A discussion's reference: its idea where it states one, else its id without its date.
 * @param id the discussion's id
 * @param idea its idea in one line
 * @returns the reference
 */
export function discussionRef(id: string, idea: string): Ref {
  return {
    id,
    name: idea.trim() === "" ? humanised(shortId(id)) : idea.trim(),
    address: pathOf({ page: "discussion", id }),
  };
}

/**
 * A picture's reference: its title.
 * @param id the visual's id, its path under the home
 * @param title its title
 * @returns the reference
 */
export function pictureRef(id: string, title: string): Ref {
  return {
    id,
    name: title.trim() === "" ? id : title.trim(),
    address: pathOf({ page: "picture", id }),
  };
}

/**
 * A note's reference: its words, cut to a line.
 * @param id the mark's id
 * @param words the note the owner wrote
 * @returns the reference
 */
export function noteRef(id: string, words: string): Ref {
  const line = words.trim().split("\n")[0] ?? "";
  return {
    id,
    name: line === "" ? id : line.length > 80 ? `${line.slice(0, 79)}…` : line,
    address: pathOf({ page: "mark", id }),
  };
}

/**
 * A skill's reference: its name, at its place in the roster.
 * @param name the skill's name
 * @returns the reference
 */
export function skillRef(name: string): Ref {
  return { id: name, name, address: pathOf({ page: "roster", skill: name }) };
}
