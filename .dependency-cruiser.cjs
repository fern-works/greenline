/** The dependency spine, executable (docs/CODE-STANDARDS.md §4).
 * Layers (dependencies point left): commons <- core <- shell.
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
  ],
  options: { doNotFollow: { path: "node_modules" }, tsPreCompilationDeps: true },
};
