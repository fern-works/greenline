# Table

Read this page when the change builds or changes a table of data.

- **Anatomy.** A header row 36 to 40 pixels tall, its labels 11 to 14 pixels in a muted grey and sentence case, no fill band, a sort mark on the active column only. No zebra striping; row rules are one pixel, a little darker than the surface. The identity column takes a third to a half of the width.
- **Numbers.** Numeric columns are right-aligned in tabular figures, with fixed decimals per measure: money 2, percentages 1 or 2, counts 0. A missing value is a grey dash, and a true zero is printed.
- **Density by register.** In an app, single-line rows run 36 to 53 pixels and rows with media 56 to 92; a dense screen takes 42 pixel rows and a 13 pixel body. A site's table breathes more and holds fewer columns.
- **States.** Loading keeps the final layout with grey bars at each value's real height, no shimmer. An error stays inside the table, says what failed and when the data was last good, and offers to retry. An empty table keeps its frame and header, with one sentence across the whole block.
- **Long and many.** An overview shows two to five rows with "View all" and a total, never pagination; a full list states its total, keeps the header in view and shows the range, such as "1 to 50 of 1,284". Fixtures hold zero, one, the realistic count and ten times it.
- **Keyboard and screen reader.** A data table has its header cells, scoped where it has two dimensions. An interactive grid moves with the arrows, Home and End, Control with Home and End, and Page Up and Page Down; on a desktop app add range selection with Shift, toggling with the command key, select all, Return and Delete.
- **Responsive collapse.** Below about 640 pixels a table becomes two-line rows, the identity and the key number on the first line and the other fields in a smaller grey on the second, none dropped; up to about 1100 pixels it keeps four or five columns. A table that must stay a table scrolls inside its own frame with its first column fixed.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `table-headers`, floor: A data table has header cells, scoped where it has two dimensions.
- `tabular-figures`, reflex: Numbers in columns and changing values use tabular figures.
