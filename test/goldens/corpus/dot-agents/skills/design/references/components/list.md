# List

Read this page when the change builds or changes a list, a feed or a tree.

- **Pitch.** Two-line rows take at least 40 to 44 pixels; rows with media take the media's height plus 24 to 32; a tree indents about 8 pixels per level. Media is a 16 pixel logo, a 24 to 32 pixel avatar, or 48 pixels in a two-line row.
- **Keyboard.** A list is one tab stop with arrow navigation.
- **Targets.** A whole row is its target: the spacing goes inside each row as padding, never as a gap between rows, and one hover highlight serves the list.
- **Many.** Fixtures hold zero, one, the realistic count and ten times it, with empty, one-word and unbreakable strings. A long list rendered all at once is flagged against the project's own threshold. Each item's identity is stable, never its position.
- **Entrances.** A stagger plays only for an infrequent entrance, items 30 to 80 milliseconds apart, and a row in a virtualised list never animates in.
- **More.** Content beyond the edge shows a peek or a disclosure that names the count, such as "Show 12 more".
- **Native.** Rows are tappable end to end, support pull to refresh, and use a lazy stack rather than heavy custom rows.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `stagger-offset`, finish: Items that enter in a stagger are offset 30 to 80ms apart, and the stagger never blocks interaction while it plays.
- `collection-key-stable`, reflex: A list's item identity is stable, never its index.
- `long-list-virtualised`, reflex: A long list rendered eagerly is flagged; the threshold is the project's, never a floor.
