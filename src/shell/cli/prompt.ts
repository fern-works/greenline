import { readSync, writeSync } from "node:fs";

/**
 * The one interactive surface (`docs/SPEC.md` §4): a question with a
 * closed set of answers, asked only when no flag decided and a person
 * is at the terminal. Every prompt keeps a flag equivalent, so
 * headless runs never block; they fail closed with the flag named.
 */

/** One answer a prompt accepts: the key the caller reads, the label shown. */
export interface PromptChoice {
  readonly key: string;
  readonly label: string;
}

/** Ask a closed question; the chosen key, or undefined when no answer came. */
export interface PromptPort {
  readonly choose: (question: string, choices: readonly PromptChoice[]) => string | undefined;
  readonly input?: (question: string) => string | undefined;
}

/** How many times an unrecognised answer is re-asked before giving up. */
const ATTEMPTS = 3;

/** Bytes read per call while waiting for the newline. */
const CHUNK = 256;

/** Reads up to this many chunks for one answer; a longer line is refused. */
const MAX_CHUNKS = 16;

/**
 * A terminal-backed prompt, or undefined when either stream is not a
 * TTY (a pipe, a CI job, a headless agent). Reads synchronously so
 * the command flow stays a plain function of its inputs.
 */
export function createTtyPrompt(
  stdin: { readonly fd: number; readonly isTTY?: boolean },
  stdout: { readonly fd: number; readonly isTTY?: boolean },
): PromptPort | undefined {
  if (!stdin.isTTY || !stdout.isTTY) return undefined;
  const pending = { text: "" };
  return {
    input: (question) => {
      writeSync(stdout.fd, `${question}\n> `);
      return readLine(stdin.fd, pending);
    },
    choose: (question, choices) => {
      const menu = choices.map((choice, index) => `  ${index + 1}) ${choice.label}`).join("\n");
      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        writeSync(stdout.fd, `${question}\n${menu}\n> `);
        const answer = readLine(stdin.fd, pending);
        if (answer === undefined) return undefined;
        const byNumber = choices[Number(answer) - 1];
        if (byNumber !== undefined) return byNumber.key;
        const byKey = choices.find((choice) => choice.key === answer);
        if (byKey !== undefined) return byKey.key;
      }
      return undefined;
    },
  };
}

/** One trimmed line from the descriptor; undefined at end of input or on error. */
function readLine(fd: number, pending: { text: string }): string | undefined {
  const buffer = Buffer.alloc(CHUNK);
  let text = pending.text;
  pending.text = "";
  for (let chunk = 0; chunk < MAX_CHUNKS; chunk += 1) {
    const newline = text.indexOf("\n");
    if (newline !== -1) {
      pending.text = text.slice(newline + 1);
      return text.slice(0, newline).trim();
    }
    let length: number;
    try {
      length = readSync(fd, buffer, 0, CHUNK, null);
    } catch {
      return undefined;
    }
    if (length === 0) return text === "" ? undefined : text.trim();
    text += buffer.toString("utf8", 0, length);
  }
  const newline = text.indexOf("\n");
  if (newline < 0) return undefined;
  pending.text = text.slice(newline + 1);
  return text.slice(0, newline).trim();
}
