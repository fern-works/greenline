# Tailwind

Read this page when the manifest's frameworks include tailwind. It holds interface mechanics only.

- **Container queries.** Components use container variants, where the container's `@md` means 448 pixels of container rather than 768 of viewport; the container class goes on a parent, and viewport breakpoints are kept for the page's layout and fixed elements. Version 3 needs the plugin.
- **Tokens.** Consolidating tokens deletes the dead ones and merges values within about five percent of each other in both schemes, after comparing light and dark; never inline a token as an arbitrary value.
- **Targets.** Spacing between interactive siblings goes inside each item as padding, not as a gap.
- **Variants.** Use the motion-safe, motion-reduce and hover-only variants, and a ring in the shadow rather than a border and a shadow.
- **Arbitrary values.** A value in brackets where a token exists is drift; the interface check names it.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `container-query-ancestor`, reflex: A container-query variant has a container ancestor.
