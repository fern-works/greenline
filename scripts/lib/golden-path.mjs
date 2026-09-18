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
