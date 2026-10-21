/** The dependency spine, executable (docs/CODE-STANDARDS.md §4).
 * Layers (dependencies point left): commons <- core <- shell, and
 * commons <- core <- corpus beside the shell: the corpus builds and
 * verifies the roster, and what runs in a workspace never imports it.
 * This config binds; the book teaches it.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies hide ownership and break the spine.",
      from: {},
      to: { circular: true },
    },
    {
      name: "commons-depends-on-nothing",
      severity: "error",
      comment: "The commons layer is dependency-free within the tree.",
      from: { path: "^src/commons/" },
      to: { path: "^src/", pathNot: "^src/commons/" },
    },
    {
      name: "core-below-shell",
      severity: "error",
      comment: "Core is pure: it never imports the shell (I/O, process, CLI).",
      from: { path: "^src/core/" },
      to: { path: "^src/", pathNot: "^src/(commons|core)/" },
    },
    {
      name: "product-never-imports-corpus",
      severity: "error",
      comment: "What runs in a workspace (commons, core, shell) never imports the corpus code.",
      from: { path: "^src/(commons|core|shell)/" },
      to: { path: "^src/corpus/" },
    },
    {
      name: "corpus-above-core",
      severity: "error",
      comment: "The corpus code imports only commons, core and itself, never the shell.",
      from: { path: "^src/corpus/" },
      to: { path: "^src/", pathNot: "^src/(commons|core|corpus)/" },
    },
  ],
  options: { doNotFollow: { path: "node_modules" }, tsPreCompilationDeps: true },
};
