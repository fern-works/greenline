# The design home

[The agent reads three places before it touches an interface, and writes
them only with you.]{claim: The design home is read before an interface change and written only with the owner}

## DESIGN.md

DESIGN.md, at the root of the repository, holds your design system in
Google's DESIGN.md format, so your own design tools read the same file: the
tokens in its front matter (colors, typography, rounded, spacing and
components) and eight sections of prose, from the overview to the do's and
don'ts. greenline adds nothing to the format. Where two parts of the
repository look different on purpose, a site and an app, each folder may
hold a DESIGN.md of its own, and the nearest one governs a file.

```yaml
---
name: Prices
colors:
  ground: "#f4f3ef"
  ink: "#1d1d1b"
  accent: "#b3261e"
typography:
  body:
    fontFamily: Source Serif 4
    fontSize: 17px
rounded:
  md: 6px
---
```

Drift is a value the code uses that DESIGN.md does not name, or a token the
code no longer uses. `greenline status` prints it, such as `interface drift:
1 colour the code uses that DESIGN.md does not name`, and the check's drift
rules point at the file and the line.

## The interface rulings

Your taste, the decisions DESIGN.md has no place for, goes under
`## Interface` in the decisions book, `.greenline/DECISIONS.md`, one line
each:

| Line                                        | What it says                                                          |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `register: app at src/app`                  | the register of a folder: a site (landing, marketing, docs) or an app |
| `platform: web`                             | the platform, once you have confirmed it                              |
| `anti-reference: <what>`                    | a look you do not want                                                |
| `direction: <entry>, catalog <pin>, <date>` | the direction you picked, where the catalog dealt it                  |
| `shell: <what>`                             | the app's frame: its navigation and its working area                  |
| `waiver: <rule>: <reason>`                  | a reflex you waive for the whole repository, with why                 |
| `bar: <what>`                               | the quality bar you hold the interface to                             |
| `locked: <section>, <section>`              | the DESIGN.md sections your pick holds                                |

The agent proposes a direction, a shell or a waiver and writes it only on
your word. A change to a section of DESIGN.md the `locked:` line names
waits for your words: the agent quotes them in the record's `## Interface`
section as `- unlock <section>: "<your words>"` before the write, and the
hook refuses the write until it does. The record holds that section once,
wherever the agent writes it, beside the design section most often, and
your answer to a floor finding stands there too, `- floor <rule>: fixed`
or `- floor <rule>: waived, "<your words>"`.

## The survey

Where an interface exists and DESIGN.md does not, the agent offers the
survey, the start `design-survey`. It reads the code and the rendered
pages, measures with a small instrument it writes into the project and
declares as one of its checks, and asks you to confirm what it found: the
register of each folder, the platform, the faces and the colours that are
the system and the ones that are accidents. Then it writes DESIGN.md and
the rulings. `greenline check interface --survey` measures the colours,
faces, sizes, spacing and radii in use and writes them as rows of the
survey's sheet, `.greenline/ledger/interface/survey.json`; each row names
its one source, a command at a commit, a file the agent read, or your
confirmation.

## The path index

Each page of the interface the check rendered has an entry in
`.greenline/ledger/interface/paths.json`: its register, its last capture,
its scores by tier and how much of it uses the colours DESIGN.md names, and,
where its latest capture could not be taken, why, the address tried and
when, until a later capture clears it. The inspector's Interface place
shows it on its **Pages** tab, with each page's history. The path index and
the survey's sheet are your workspace's record, never ignored: they go in
the commit of the change's record or its folder, at the close or after it,
and greenline's git hooks admit them there and refuse them beside code once
the record is done; the check's `path index:` line says so.

## A redesign

To change how a working interface looks without breaking what it does, ask
for a redesign, the start `redesign`. It captures the before, writes the
kept list of every link, field, handler and heading the after must keep,
`.greenline/ledger/<id>/kept.json`, and hands the change on at careful. At
verify the same command checks the after against the list: a missing entry
is red unless the list records why it goes.
