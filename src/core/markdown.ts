/**
 * Heading syntax shared by installed-document inspection and repository rule parsing.
 */

/** A heading line: its level and its text, ATX style. */
export const HEADING: RegExp = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
