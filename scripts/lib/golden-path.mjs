/** Golden trees store the harness directories under undiscoverable
 * names (audit 4, R1): a committed `.claude/skills/` is auto-discovered
 * as a live skill root by dev sessions in this repo, which ADR 0007
 * forbids. The projection itself is unchanged; only the stored path is
 * mapped. Shared by the regen script and the goldens test. */
export function goldenPath(path) {
  if (path.startsWith(".claude/")) return `dot-claude/${path.slice(".claude/".length)}`;
  if (path.startsWith(".agents/")) return `dot-agents/${path.slice(".agents/".length)}`;
  return path;
}

/**
 * What enabling garden adds to or changes in the default projection: each
 * enabled file that is new or whose content differs. Enabling removes
 * nothing, so a default file missing from the enabled projection is refused.
 * Shared by the regen script and the goldens test.
 */
export function gardenDelta(disabled, enabled) {
  const before = new Map(disabled.map((file) => [file.path, file.content]));
  const after = new Set(enabled.map((file) => file.path));
  const missing = disabled.filter((file) => !after.has(file.path)).map((file) => file.path);
  if (missing.length > 0) throw new Error(`enabling garden removed ${missing.join(", ")}`);
  return enabled.filter((file) => before.get(file.path) !== file.content);
}
