/** The name-boundary row (J-4, 2026-09-14): the workshop's agent, the Fernworks agent, is named in no product file. */
const NAME = /fernworks[ \t]+agent/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|otf|eot|zip|gz|tgz|mp4|mp3|wav|bin)$/i;
const FROZEN = /^corpus\/(upstream|sources)\//;

/**
 * Whether the row reads a product file: every file under corpus/ and src/
 * that is not binary by extension and not among the frozen outside bytes
 * under corpus/upstream/ and corpus/sources/, which are records and never
 * house prose.
 * @param {string} file a repository-relative path
 * @returns {boolean} true when the row scans the file's text
 */
export const scannedFile = (file) => !BINARY.test(file) && !FROZEN.test(file);

/**
 * Every line of every page that carries the workshop agent's two-word name,
 * in any case and across any run of spaces on the line.
 * @param {{file: string, text: string}[]} pages the product's pages as read
 * @returns {string[]} one problem per matching line, `<file>:<line>: ...`
 */
export const nameLeaks = (pages) => {
  const out = [];
  for (const { file, text } of pages) {
    text.split("\n").forEach((line, i) => {
      const m = NAME.exec(line);
      if (m) {
        out.push(
          `${file}:${i + 1}: names the workshop's agent ("${m[0]}"), a name no product file carries`,
        );
      }
    });
  }
  return out;
};
