# Card

Read this page when the change builds or changes cards.

- **A row of peers.** Three to six across at equal widths with one gap and no orphan; cards sharing a row share a bottom edge; a blank band of more than 40 pixels inside a card is a warning.
- **The edge.** A border or a shadow, never both; a ring inside the shadow at a low alpha draws the edge, with a transparent one pixel border so a forced-colours mode still draws it.
- **Corners.** A nested corner's radius is the outer radius less the padding between them; pictures carry a faint inset outline.
- **Clicking.** A clickable card takes one stretched link over it, its own actions layered above that rather than nested inside; a disabled card drops the link, and a card that only informs takes no hover highlight.
- **Style defaults.** A shadow on a resting card, a card inside a card and a row of cards each topped by an icon are style defaults: avoid them unless the direction wants them.
- **Responsive collapse.** Cards answer their container, not the viewport, such as one column below 400 pixels of container.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `no-shadow-plus-border`, finish: An elevated surface carries a ring inside its shadow or a border, not both.
- `shadow-ring-forced-colors`, reflex: A surface edge drawn only by a box-shadow ring also has a transparent border, so forced colours draw it.
- `style-icon-card-row`, reflex: A row of equal cards each topped by an icon is a style default, waivable.
- `style-nested-cards`, reflex: A card inside a card is a style default, waivable.
- `style-resting-shadow`, reflex: A shadow on a resting surface is a style default, waivable.
- `concentric-radius`, finish: A nested corner's radius is the outer radius less the inset.
