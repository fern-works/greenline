# Layout

Read this page when a change places things: grids, spacing, alignment, sections, panels and their order.

## The rules you judge

1. Group with space first, background shapes second and lines last; the gap between groups is at least twice the gap inside one.
2. A page has two or three anchor lines and everything aligns to them; left and right margins are equal at every width, and a bleed starts from a margin.
3. Constrain the measure of text, not the page: large type, pictures and colour fields may run full width. Outer margins are 16 to 32 pixels and never less than 16; very wide layouts cap at about 1760 to 1920 pixels.
4. Every empty stretch is closed by something, the picture, the type or a step in the ground; otherwise it is a hole, and the fix is a larger main element or a cut section, never filler.
5. The visual order matches the order in the document; what matters most sits at the top and the start, identity leads a row, and metadata and actions trail.
6. One primary action per view; beyond three secondary actions, the rest move behind a menu.
7. Controls look different from content, and bordered controls sit at least 12 pixels apart.
8. In a continuous band of interactive items, such as chart columns, tabs or rows, the spacing lives inside each item's target rather than between them.
9. Text containers grow with their content, sized with minimums and maximums, never fixed: translated strings grow, short labels most of all.
10. On a site, neighbouring sections never share a layout, and the system is broken once, on purpose.
11. Components adapt to their container; viewport breakpoints are for the page's own layout, fixed elements and the type scale, and every breakpoint comes from the content.

## Tailwind

The container class goes on the parent and the container variant on the descendants; the viewport's `md` is 768 pixels while the container's `@md` is 448, so never map one to the other. A clickable row takes its spacing as padding, not as a gap between rows.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `text-contained`, floor: With worst-case strings, text stays inside its box at every width.
- `text-not-covered`, floor: No other element paints over running or display text at any scroll position.
- `track-overflow`, floor: A grid track or flex child never pushes past the viewport.
- `trailing-action-reachable`, floor: The last action of a row is reachable at 320.
- `essential-truncation`, floor: An action label, a heading or an alert is never truncated at 320 without a way to read it whole.
- `radius-drift`, reflex: A radius the code uses is on the home's scale, within 0.5px.
- `safe-area-needs-cover`, reflex: env(safe-area-inset-*) is used only with viewport-fit=cover.
- `z-index-scale`, reflex: z-index comes from named layers, not arbitrary values.
- `section-gap`, finish: Sections are separated by room and their gaps vary.
