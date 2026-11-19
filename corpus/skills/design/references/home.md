# The home

Read this page when the lock is written or read: the owner's taste lives in DESIGN.md and in the interface rulings, and every interface change reads both before its first write.

## DESIGN.md

DESIGN.md stands at the workspace's root in the format of Google's DESIGN.md spec, unchanged, so the owner's own design tools read the same file:

- front matter in YAML: `name`, with `version` and `description`, then the token groups `colors`, `typography`, `rounded`, `spacing` and `components`, each a mapping, never a list;
- a typography token is a named scale using only `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` and `letterSpacing`; a dimension is px, em or rem;
- a token names another as `{group.name}`, such as `{colors.primary}`, and every reference resolves, with no cycle;
- token names are letters, digits and hyphens, named by purpose: category, role, variant, state;
- then the prose in eight sections, in this order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.

The tokens are the binding values and the prose says how to apply them. Outside the Overview, every sentence changes an implementation choice; a Don't is written only where the owner stated the prohibition. Where two roots' registers differ, each root holds a DESIGN.md of its own, and the file nearest a path governs it whole.

## What the lock writes

On the owner's pick, write:

1. the direction's tokens into DESIGN.md's groups, semantic tokens over primitives, each surface paired with its foreground, every pair meeting the floor in each scheme the file declares;
2. the sections the direction settles, each in its place in the order;
3. the rulings' lines: the register at each root, the platform, the direction with its catalog entry, the catalog's pin and the date, the shell, any anti-reference, the bar, and `locked:` with the sections the pick settled.

A write that changes a locked section, its prose or its tokens, waits for the owner's words: the harness hook refuses it until the change record's `## Interface` section quotes them, `- unlock <section>: "<their words>"`, or `- unlock all: "<their words>"` for a new pick. Never edit a locked section to clear a finding: put the finding to the owner.

Keep an existing token format and its names: a workspace that already has tokens keeps them, and the lock adds or replaces only what the pick changes. Record decisions the owner made, never accidents: a value repeated by chance is not intent, and a value enters the tokens only once it is used in at least three places or the owner names it.

## The rulings

The interface rulings are dash lines under the decisions book's `## Interface` heading: `register: app at src`, one per root; `platform: web`; `anti-reference: <text>`; `direction: <entry>, catalog <pin>, <date>`; `shell: <text>`; `waiver: <rule>: <reason>`; `bar: <text>`; and `locked: <section>, <section>`, the DESIGN.md sections the owner's pick holds. A standing waiver clears a reflex rule for the workspace; it carries a reason of at least a sentence that names what it protects, and no standing waiver clears a floor rule.

## Reading the home

- At quick, work inside the lock and write one line.
- At regular, where the lock covers the root, read it and deal nothing.
- At close, update the home with what the change settled, in the same commit.

## Drift

Drift is a value the code uses that DESIGN.md does not name, or a token the code no longer uses. A colour within 6 per channel of a token is the token, and a length within half a pixel; anything else is a finding of the drift rules below, read by purpose first and value second: an exact match, a semantic match under another name, an ambiguous value, or a gap the home lacks. A token group the file does not declare raises no finding. On every update, compare the file group by group, added, removed and changed, and restore any accepted decision a rewrite dropped unless the owner replaced it.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `home-ref-resolves`, reflex: Every token reference in DESIGN.md resolves, with no cycle.
- `home-primary`, reflex: A DESIGN.md with colours names a primary.
- `home-section-order`, reflex: DESIGN.md's sections follow the format's order.
- `home-dropped-tokens`, reflex: No unknown DESIGN.md key holds token-like values the readers would drop.
- `home-orphans`, finish: A colour the home declares is used somewhere.
