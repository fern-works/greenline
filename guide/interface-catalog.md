# The interface catalog

The catalog holds entries of design language the agent deals directions
from: palettes with their text and ground pairs, type pairings, materials
for a site or an app, heroes, page shapes, app shells and screen patterns,
motion registers, and the regions a page needs for the job it does, such as
a sign-up or a subscription. Each entry is data: its tokens in DESIGN.md's
groups, or a sketch of its rows and slots, its reasons and its pitfalls,
and where it came from. Every colour pair meets the contrast floor, and no
entry carries another site's copy, images, logos or code.

## Installing it

The catalog is an extra skill, `interface-catalog`, installed only when you
ask for it. Name it under `skills.include` in `.greenline/manifest.json` and
run `greenline sync`:

```json
"skills": { "include": ["interface-catalog"], "exclude": [] }
```

Without it, the design step composes three directions itself from the
material you have and the job the page does.

## A deal

[At the design step the agent deals three directions.]{claim: At design the agent deals three directions you can see and pick} Each is a material, a
palette, a type pairing, a composition and a motion register, drawn from
the entries that suit your register and platform; the page's job gives the
regions, the same for the three. Your tone, your sector and the material
you have weigh the draw, and a composition that needs photographs is never
dealt to a product that has none. You may ask for one reroll, or answer
with a direction of your own.

`greenline deal` deals the same way from the command line:

```text
greenline deal --register site --job sign-up --tone calm --material copy,logo
```

It prints the catalog's pin, which the direction you pick names in your
rulings, the seed it drew under, and each direction's entries with their
reasons and pitfalls, never the whole catalog. The same ask deals the same
three; `--reroll` draws once more.

## Seeing the three

Where your harness shows cards, you pick in them. Where it does not, open
the inspector at the address `greenline deal` prints on the change's
branch, `/changes/<id>/deal` with the ask in its query, so the view deals
the same three: it draws each direction on a sample
page of your register, at 1440, 768 and 390 wide, light and, where the
palette has one, dark. Its pick button records your choice in the change's
folder, and the agent reads it at your next message and writes it into the
design section and DESIGN.md. Interface's **Catalog** tab shows every entry as
a specimen, filtered by register, kind and the words you type.
