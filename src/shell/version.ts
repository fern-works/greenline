/**
 * The CLI version. tsdown replaces `__GREEN_LINE_VERSION__` with the
 * `version` field from package.json at build time (see tsdown.config.ts);
 * under vitest the declaration is erased and the constant stays
 * undefined, which is fine because the bundle is the only surface that
 * prints it.
 */
declare const __GREEN_LINE_VERSION__: string;

export const CLI_VERSION: string = __GREEN_LINE_VERSION__;
