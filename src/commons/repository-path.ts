/** A portable path beneath a repository; the root itself is represented separately by `.`. */
export function isRepositoryPath(path: string): boolean {
  return (
    path.trim().length > 0 &&
    !/[\\:?<>|*]/.test(path) &&
    [...path].every((character) => character.charCodeAt(0) >= 32) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}
