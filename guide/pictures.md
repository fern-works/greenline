# The pictures

The agent explains with pictures as well as words, on three layers: a
picture inside a reply, a durable picture kept in the repository, and the
atlas, the repository's map with a page per subsystem.

## In the reply

Where the shape of something explains better than a paragraph, the reply
carries one small picture, without your asking: pseudocode, a call tree, a
component tree, a file tree, a shape diff that shows what changes, or a box
drawing of a flow, a sequence or a set of states. Each is text, at most 72
columns wide and twelve nodes, so it shows the same in a terminal, an app
and a pull request.

The agent decides from a table, not a feeling: show-me's method names, for
each kind of turn and each shape a reply explains, the picture that fits or
none.

| The turn                     | A flow or a sequence | A set of states | A hierarchy | The parts and their joins | A change to a shape | An algorithm |
| ---------------------------- | -------------------- | --------------- | ----------- | ------------------------- | ------------------- | ------------ |
| A plain answer               | none                 | none            | none        | none                      | none                | none         |
| A proposal                   | call tree            | box drawing     | file tree   | component tree            | shape diff          | pseudocode   |
| A build turn that moved code | call tree            | box drawing     | file tree   | component tree            | shape diff          | pseudocode   |
| An explanation               | box drawing          | box drawing     | file tree   | component tree            | shape diff          | pseudocode   |
| A close                      | none                 | none            | none        | none                      | shape diff          | none         |

A question about how something works is an explanation, so it gets its
picture too.

Where the harness hands the reply's text to its hooks, the next turn's
status line names a picture drawn past its cap, such as `picture: one past
its cap at turn 3 (14 nodes, 60 columns; the caps are 12 and 72); draw the
next within them, the part that decides`, and a turn that changed code and
drew nothing, `picture: the turn changed 2 files and drew no shape; draw
the resulting shape where one moved, in show-me's form for it`. Neither
stops the agent. Every text picture is counted: its boxes, a tree's lines,
a sequence's lifelines or the labels an arrow chain joins, so no drawing
reads as zero nodes.

Where the shape a turn wants is larger than twelve nodes or 72 columns, the
reply draws the part that decides and may offer the whole picture once in
the change, in one line:

```text
Picture offered: the whole request path, a sequence of eighteen nodes, branded SVG; say keep
```

The finish is `text`, `branded SVG` or `interactive`. Say keep and the
picture is made; say nothing and it is not. The hooks count these lines per
change: the next turn's status line names a second offer in the same
change, and an offer to remake a picture that drifted, went stale or was
deleted, since a remake is yours to ask for, never the agent's to offer.

A mermaid diagram renders only on some surfaces, so the agent draws one only
where the status line says the surface renders it. A hook cannot yet tell
the Codex desktop app, the one surface below that renders mermaid, from the
Codex CLI, so for now the status line says `renders text` everywhere and the
agent draws every picture in text.

| Surface                                                 | A mermaid block | The text pictures |
| ------------------------------------------------------- | --------------- | ----------------- |
| Claude Code in a terminal                               | its source      | rendered          |
| Claude Code's desktop app, VS Code extension and mobile | its source      | rendered          |
| The Codex desktop app                                   | rendered        | rendered          |
| The Codex CLI                                           | its source      | rendered          |
| A headless run                                          | its source      | rendered          |

`greenline status` prints the running surface's row, and the status line at
each turn names what it renders, such as `surface: renders text`.

## Durable pictures

A picture worth keeping, or one larger than twelve nodes or 72 columns, is
never drawn in the reply: the agent counts before it draws and draws the
part that decides. A durable picture is kept only when you ask for one,
under the change it belongs to, offered at most once per change as above
and never as a lost one's remake. Before it is drawn, its skill writes the
picture's brief: the question it answers, its form, its node count, its
finish, its palette by the style guide, and who reads it. `greenline picture
keep` reads the brief into the manifest, so a weak choice of form or finish
is visible with its reason, and `greenline status` names a kept picture
without one (GL0606). The brief is read under the name the picture is
kept as, so a keep with none says so at once, naming the two places it
looked. The agent, or a fresh agent its picture
skill starts, draws it in the change's working folder, and `greenline
picture keep` writes it into the change's folder of the home with its
manifest, your words recorded as its `ask`. Nothing else writes a change's
folder: the harness hooks refuse a write there by hand, by a script or by
a `git restore`, and name after the tool a write the command's words hid.
A kept picture is never written over: a remake is kept under a new name
with `--replaces <name>`, and `greenline status` then names the first one
as replaced (GL0609), yours to delete in the inspector; nothing is
deleted for you. An anatomy figure keeps its page alone in the home: its
build script and model are the change's record, copied into
`.greenline/ledger/<id>/sources/<slug>/`. A
fresh agent a picture skill starts is the skill's, not one of the change's
steps, so the mode's count of fresh agents leaves it out, whatever the
mode, quick and its one agent included, and the status line names it
apart, `1 fresh agent counted in its events, and 1 by diagram-design that
a method started, counted nowhere and listed nowhere, neither in the
record's starts nor in its agents count`. The reply that follows gives you the
picture's address in the viewer.
Each kind of picture has its skill, all of them installed by default, and
show-me's table of kinds names the picture for each shape:

| Kind of picture                              | Made by           |
| -------------------------------------------- | ----------------- |
| a change's, a plan's or a decision's diagram | diagram-design    |
| the change in the whole, over the app's map  | diagram-design    |
| the repository's map                         | architecture-map  |
| the explanatory figure of a concept          | anatomy           |
| a subsystem's journey                        | the explain start |

A state chart the agent drew can be checked afterwards with the
verify-formally start, which the agent offers after the chart; the check is
no picture of its own.

Every durable picture lives in `.greenline/visuals/`: a change's under its
id, the map under `map/`, the atlas's pages and journeys under
`subsystems/`, the project's diagram style guide `style-guide.md` with its
manifest `style-guide.visual.json`, and the captures of a page you take from
the inspector while no change is open under `interface/`. Beside each picture stands its manifest, `<slug>.visual.json`,
with its title, its kind, the skill that made it, the change, the commit it
was made at, the files it covers, what it shows and who made it, `madeBy`,
which `greenline picture keep` reads from what the hooks saw on Claude Code
and Codex, never from the agent's word, a write tool's or a shell
command's write of the file alike: `agent` for a fresh agent,
`session` where the agent you talk to drew it itself, which `greenline
status` names for a change's picture (GL0604) and the inspector shows
beside the picture. Both harnesses' hooks name the fresh agent on each of
its tool calls, so a picture a helper drew reads as the agent's on either;
where the hooks saw no write of the file, the manifest names no maker
rather than guess, and the keep's own command fills none after it. A git
command that moves the working tree, a stash, a checkout or a merge, is
no write of the agent's: the hooks write no maker after it, so a manifest
git brings back stays as git wrote it and the merge after it finds the
tree clean. A capture `greenline check interface` writes is the
check's own: it carries no maker, raises no GL0604, and the inspector shows
it as the interface check's. A change's picture is kept
only while its change is open with your yes: `greenline picture keep`
refuses one before the yes, an ask in words you never said, a fragment of
your message, a question that asks for no picture, and a manifest naming a
file its commit does not hold. The ask is your whole message asking for a
lasting picture, or a whole sentence of it, as you said it. A picture keeps
its bytes in the repository: one that loads a script, a font or an image
from the web is named by status (GL0608). When the change closes, a
picture takes the commit it closes at only where no file it covers changed
since the picture's own commit; a picture whose files changed keeps its
commit, so status still names its drift after the close and the close
section names it; a fresh one is drawn only when you ask. A picture you
delete in the inspector stays deleted: status names it (GL0610), as your
delete where the inspector's mark on the change's list stands, and the
agent restores nothing. A [capture](./marks.md) you take from the inspector is yours and needs
no change: while a change is open it stands in that change's folder, and
while none is open under `interface/` with no change named. The change record links its pictures, and the folder beside the record
holds `visuals.json`, the list of them, which the hooks keep.

## How stale a picture is

A picture covers files, and the code moves on. [`greenline status` counts the
commits since a picture's commit that touched the files it covers, and names
each picture that is no longer fresh as a notice]{claim: Each durable picture says how stale it is, counted in commits}:

- **fresh**: no commit since touched its files;
- **drifting**: one did, with the number of commits;
- **stale**: its commit is not in the history, or a file it covered then is gone.

The notice, GL0601, names the tier and what the drift reaches, the capture
or the picture and the record of the change that links it, and who drew
it:

```text
name the visual '2026-10-27-shelf/loan-to-letter', "How one loan travels
to the nightly letter", drawn by a fresh agent, to the owner: it is at the
tier drifting, reaching the visual and change 2026-10-27-shelf's record,
which links it, as 2 commits since bc63a93 touched the files it covers;
the owner may delete it in greenline inspect, and the reply offers no
remake, which is the owner's ask alone; warning GL0601
```

The arithmetic counts commits, never days. The status line says how many
pictures and atlas pages drifted, such as `drift: 2 visuals changed since
their commits`. A notice never fails status. The agent names a drifted
picture to you and offers nothing: a remake happens only when you ask for
one.

## The atlas

The atlas is the repository's map kept as pages. Ask "how does X work", or
for the map of the subsystems, and the explain start traces the answer from
the code. For the first pages it proposes the candidate subsystems, from the
tree, the entry points, the dependencies and the files that change most, or
from the plan's modules on a new repository, and writes nothing until you
pick. Each picked subsystem then gets a page with the files it covers and the
commit it was read at, and one or more journeys through it, each a durable
picture. `.greenline/visuals/atlas.json` is the index.

When a change touches a page's files, the page drifts and status reports
it. The close of that change refreshes it without asking: one fresh agent
re-reads only the files that changed and rewrites only the pages and
journeys they touch, and the map when a page changed, up to three pages,
its cost in the change's record. The change cannot be marked done until
they are refreshed, unless you tell the agent to leave the pages, and a
page the refresh rewrote cannot go unnamed in the record's `refreshes`
line, whatever you said. Past
three pages the close names the larger refresh, made as a change of its own
when you ask. The whole atlas is re-read at most once per minor version of the
practice, unless you ask for it.

## The map and the documents

A repository with no map yet says so: the status line reads `atlas: none`.
The agent makes the map's first pages when you ask for them: a fresh agent
reads the repository and writes a page per subsystem with the map over
them, in about ten minutes. Your ask runs the explain start's discovery,
and your pick of the subsystems is final. Once a map stands, the status
line names a large change since it, such as a new top-level module with
code, a commit to a schema, a migration, a state machine or a flow, a
change across two subsystems, twenty commits since the map was made, or a
third of the pages drifting, so the agent can tell you the map is behind.

The repository's own documents, its README and the pages under `docs/`,
drift like atlas pages. Discovery lists them in
`.greenline/visuals/documents.json`, each with the files it covers and
whether you or the practice wrote it, and the status line counts those that
drifted, such as `docs: 1 page drifting: README.md`. The close names a
document its change made stale; a document you wrote is refreshed only on
your ask.

## In the inspector

`greenline inspect` shows every durable picture in Knowledge's
**Pictures** tab, the map and the journeys first: one card each with its
title, the question its brief says it answers, its kind, its finish, its change, the commit it was made at, the commits since and
its tier as a word. A picture opens in place at
`/pictures/<id>`, its path under the home without the suffix, such as
`/pictures/<change>/<slug>` or `/pictures/map/<slug>`: a drawing as an image, a page in a frame
that cannot reach the inspector, a text page rendered. **Delete this visual**
removes the picture and its manifest after you confirm; a picture that
changed since the page read it is refused, and you read it again first. The
change's page lists the pictures it made and the refreshes its record
holds, the **Maps** tab, `/knowledge/maps`, shows the architecture maps and
the anatomy figures live, each in its frame with the question it answers,
its change, its commit, its tier and the files it covers, the **Atlas** tab
draws the subsystems in bands with their tiers, or says "No atlas yet", the
Subsystems tab lists the indexed
documents with their tiers, and the desk lists what drifted, documents
included. See
[The inspector](./inspect.md).
