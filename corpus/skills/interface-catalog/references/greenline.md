# Interface catalog: the practice's mechanics

This page holds where the catalog's data stands and its commands. Read it with `SKILL.md` when the work lands in the workspace.

## Where it stands

- The entries are `catalog/entries.json` in this skill's folder, one schema for every entry: its id, kind, register, platform, facets, tokens, contrast pairs, sketch, words and provenance. Never paste the file whole into a reply or a record; deal from it.
- A pick names its entries by their ids in the record's design section, beside the owner's words.

## Commands

- `greenline deal --register <site or app> --job <the page's job> --tone <words> --material <what is in hand>` deals three directions and prints the seed it drew under; the same ask deals the same three, `--reroll` draws once again on the owner's word alone, and the harness hook refuses a `--seed` the owner's words did not name and a `--reroll` they did not ask for, or a second one, and `--json` prints the entries' ids alone.
- `greenline inspect` shows the three side by side in its deal view, whose pick button writes `.greenline/ledger/<id>/design-pick.json`, and the catalog's entries as specimens in the Atlas's catalog.
