# App screens

Read this page when the change builds screens people work in rather than read: dashboards, admin, analytics, settings and billing, queues, builders and the detail of one object. An interface fragment shown on a site page follows these rules inside the fragment.

## The data and the jobs first

Before any layout, write eight to twelve lines: the objects with their fields and units, realistic magnitudes including a new account's, who opens the screen, how often and on what device, the next jobs in order of frequency, and the product's own things. Render from a data file with believable values: totals computed from the rows, a fact shown twice as one variable, every relative figure naming its baseline, no placeholder name and no invented proof.

## One question per screen

Each screen answers one question and shows one finding. The largest block answers the question; the finding is read first, beside the action it drives; every block answers a next question, and a block that answers none is removed. At 1440 by 900 every block the brief names shows, the headline block is about 200 to 360 pixels tall, long lists show four to six rows, and the most frequent job is one click away.

## The shell

Build the shell first, empty, and check it at 1440 and at 390 before the data goes in. Pick one of five frames: an open plane, a tinted frame around a white sheet, a ruled T-frame, an icon rail, or no sidebar. A labelled sidebar runs 210 to 292 pixels; it is never dark or saturated against a light canvas; it names the product and its scope, and each item goes to a screen, never to an anchor on the page. The shell is a ruling: write it into the interface rulings.

## Density

Density moves three settings together, the row pitch, the padding and the type size:

| Density | Data points | Rows | Padding | Body |
| --- | --- | --- | --- | --- |
| sparse | 6 to 25 | 56 to 92px | 20 to 24px | 14 to 16px |
| medium | 25 to 50 | 44 to 56px | 16 to 24px | 14px |
| dense | about 120 | 28px lists, 42px tables | framed with air | 13px |

Size each block for the data the account has now.

## Colour spent on data

Colour goes to data, status and the one primary action, and nowhere else: one accent family at about three percent of the pixels, the primary button near-black, red at most once per object, and on a dark screen the active item marked by brightness. Prefer tables to cards and grouping to boxes; numbers are right-aligned in tabular figures, and one hover highlight serves a list.

## The states of every block

Every block has its full, empty, loading and error states, and every row and control its hover, selected, focus and disabled states. A zero prints in the normal style; a missing value is a grey dash; an empty block keeps its frame and header and adds one sentence; a first run shows the frame with the first action and the setup's true progress; loading keeps the final layout with flat grey bars, no shimmer and no shift; an error stays inside the failed block, says what failed and when the data was last good, and offers to retry; stale data carries a freshness stamp. The view's filters, tabs and selection live in the address.

## Motion and the phone

Slow data shows its skeleton and crossfades into the block; nothing performs an entrance, motion is feedback only, and a transition the person starts lasts under 300 milliseconds. On a phone the navigation folds to a 48 pixel top bar with a sheet or a bottom bar of four or five items, a table becomes two-line rows below about 640 pixels with no field dropped, and touch targets reach 44 pixels.
