# The inspector

[`greenline inspect` opens the repository as a local app in your browser]{claim: greenline inspect opens the repository as a local app in your browser} at
http://127.0.0.1:7433/ or your chosen `--port`. It ends when you stop the
process. Run it inside an initialized Git repository. Each page reads the
repository as it stands when you open it, again when you press Reload or `r`,
and again when you come back to the window; it contacts no service and keeps
no copy of what it shows.

Each page reads one document, built once and kept until something it shows
changes: a record or a file in a change's folder, a commit, the staged files
or the installed files. The first read of a page in a large repository takes
a second or two; after that it answers at once, and a change to one change's
folder rebuilds that change's page and the lists, not every page. Run
`greenline inspect --timing` to see each read's time and whether it came
from what was kept.

Every page has its own address, so you can bookmark one, share it with the
agent, or open the one the agent prints: `/changes/<id>` for a change,
`/plans/<name>` for a plan, `/knowledge/decisions` for the decisions book.
An address may end in a part of the page, a step or a heading, which opens
in place, and a file of a change's folder is `/changes/<id>/files/<name>`.
An address naming something the repository does not hold opens its page
with nothing on it, never an error. The addresses are grouped under five
places: `/` for what is moving, `/changes`, `/knowledge` for the map, the
pictures and the homes, `/interface` for your interface and its notes, and
`/practice` for the roster, the checks and the settings; a picture, a
drawing or a capture, opens at `/pictures/<id>`. The addresses of greenline
0.1 open the not-found page, which says so and offers the changes,
discussions and pictures the address's words name, so you find the page
that moved.

While it serves, it keeps `.greenline/tmp/inspect.json`, its address and
its process, which git ignores; it removes the file when it stops, and a
file left by a process that is gone counts as not serving. The agent reads
it, so its replies carry the address of the page your turn calls for in a
`View` row, and name each thing you can open, a change, its frame map, the
deal and a direction's sample, a report, a picture, a capture or a mark,
by its address rather than a file path. The agent gets each address from
`greenline view`, which you can run too:

```sh
greenline view now                         # what is moving, at /
greenline view waiting <id>                # what a change waits on from you
greenline view change <id>                 # a change's page
greenline view deal <id>                   # the three directions dealt
greenline view specimen <id> "Calm Ledger" # one direction by its name
greenline view report <id> design-1        # a report in the change's folder
greenline view capture <id> /members 390   # the newest capture of a page
greenline view mark <mark>                 # one mark
greenline view --help                      # every kind it names
```

It prints the full address and nothing else. Where the inspector is not
running, it starts one in the background on a free local port first, so
you never start it to follow a link; its process id stands in
`.greenline/tmp/inspect.json`, so you can stop it as you stop any process.
Every address is on 127.0.0.1.

## What you can read

Every page names things the way you would. A change shows as its name, its
id's words without the date, such as "Dense list", beside the agent's
sentence of why; a plan shows as its name, a discussion as its idea, a
picture as its title and a note as its words. The id stays the link's
address, and you see it when you hover over the name. Every list opens with
one line: how many there are, how many stand in each state, and the newest.
While a page reads it says what it is reading; a list with nothing in it
says what would appear there and why nothing does; and a read that fails
names what could not be read and why, with Read again beside it.

[Five places sit in the bar at the top: Desk, Changes, Interface, Knowledge
and Practice, each with its tabs.]{claim: The inspector's places are Desk, Changes, Interface, Knowledge and Practice} Interface shows only where your manifest
names an interface. A list opens a record's page, and the link above its
title leads back. To the right of the places sit the search, Reload, the
light and dark switch and a dot saying how fresh the page is: Live just
after a read, then how long ago it read, and Stopped once the inspector no
longer answers.

Lists come in groups you open and close, each group's head saying how many
it holds, how they stand and, while it is closed, the mark of the state
that most needs you. A group opens by itself when it holds the step the
change is at, anything waiting on you or anything failed or stale, or when
it holds three things or fewer; one you open or close stays so while the
tab is open. A thing you can read, a step, a report, a changed file, an
installed file, folds open in place, and several can stand open at once.
Once open, its head offers **Read**, the page as written, **Source**, its
raw text with each line numbered and Copy, and **JSON**, the document the
app read, with its address. Your pick is kept in this browser for that
kind of thing, and the address follows the last fold you opened, with
`?view=source` or `?view=json` where you picked one, so a copied address
opens the same fold the same way.

- **Desk:** one sentence saying what is happening, then one card per
  change in progress, the one that waits on you first, at most three and
  then how many more: titled with the change's sentence, its steps as dots
  with the step it is at named, one line of its facts (its commits, its
  files with the lines added in green and removed in red, its last check
  and its last activity), [what it waits on from you in the agent's words
  with when it asked and its options as tiles side by side]{claim: The desk says what each change in progress waits on from you}, each with a
  Copy that copies its words and writes nothing (you answer in your
  session), or else what it does next, [then what it changed since your last
  look]{claim: The desk says what changed since your last look}, folded. Below,
  the last three changes closed, one row each: its name, its why on one
  line, its files and lines, a check badge, when it closed and how long it
  took; the newest stands open with its why whole, its folders, its checks
  in words and the span of its commits, and so does one whose check failed.
  At 1200 pixels and wider a column beside them, on a phone under them:
  what moved since your last look (the commits, the changes that opened,
  moved or closed, the pictures, and the files with their lines, folded),
  what needs your care in at most five lines (the pictures and pages that
  drifted, by change with how many commits behind, a failing check,
  greenline's health and your open notes, each with its mark), and the open
  discussions by their idea. Your last look is kept in this browser and set
  when you leave the desk.
- **Changes:** every change the practice made, the most recently active
  first: those open grouped as waiting on you, in progress, stopped and
  proposed, then the finished ones by the day they closed, or by plan with
  the grouping's switch. Each is one line: its mark, its name, a ticket's
  led by its ticket such as `T5 · List issue`, the agent's sentence, then
  for an open change its steps as dots with the step it is at named and for
  a finished one its size, its files with their lines, its commits, and
  when it closed or last moved, today a time, then yesterday, then a date,
  the whole time on hover. A row of chips filters the list by state, each
  chip with how many stand in it, a state none stands in dimmed in place;
  the filter and the grouping live in the address, `?state=done` and
  `?group=plan`, so a reload or a shared link keeps them. A change's page
  opens on a short head: its name, a line of chips (its state, its mode,
  its agents, its fix rounds, its review, its floors, the floors line every
  record states from its open), a line of its times
  (opened, closed, how long it took, its commits), and one sentence, the
  record's outcome line labelled Landed where the close wrote one, else the
  agent's why labelled Asked, never the close's prose. While it waits on
  you, a banner under the head asks its question with its options as tiles
  you pick, and Copy my answer copies the question with your pick for you
  to paste in your session; it writes nothing. An outcome card answers four
  questions, each row leading to its tab: [what changed, its files and
  lines; what was checked, each command's latest run and whether it saw the
  final code]{claim: A change page shows what changed and each check's latest run, and whether it saw the final code}; what was decided, the frame's questions by who answered them;
  and what the folder kept. Its steps follow as a line of stations, each
  opening its step. Four tabs, each its own address: **Overview**,
  `/changes/<id>`, what you decided, each question you answered with your
  words quoted and the proposal beside them, the agent's own settlements
  folded, and the frame's restatement rendered, with your words that
  confirmed it quoted under it at careful; **Steps**,
  `/changes/<id>/steps`, each step folded with its glyph, its state, its
  depth and what can be counted (the frame's questions and your answers, a
  looped step's rounds, a skipped step's one line), opening in place at its
  own address with its words, the reports and briefs it kept (a review's
  report beside its brief), its skill loads as chips by skill with every
  load behind them, and the skills the change owes by its trigger rows
  beside them, each marked loaded or owed, and under the frame the frame map; then what no step
  names, the pictures it made, its interface and your notes on its
  captures; **Code**, `/changes/<id>/code`, the files its commits touched,
  each folder a group with its lines, each file a row whose lines open
  under it, the net change across the change by default with the line
  numbers before and after and long runs of unchanged lines folded, or
  commit by commit, then the checks one row per command with its latest
  run and every run behind it, then the commits, the newest first, a commit
  that only wrote the record folded under the commit whose code it kept,
  each commit's trailers behind a toggle; and **Record**,
  `/changes/<id>/record`, the front matter's facts (only what the record
  states: where the work goes, the harness and model, the pages its close
  refreshed), what
  greenline status says of it, the close's paragraphs one row each, and
  the record's source with its lines numbered and Copy.
  A change that touches an interface shows its direction, the design
  section and any pick, and its latest interface check by tier; at
  `/changes/<id>/deal` it shows the three directions dealt for it, each on
  a sample page at 1440, 768 and 390 wide, with one reroll and a button to
  pick one ([the interface catalog](interface-catalog.md)). After a reroll
  the address carries `reroll=1`, in the agent's `View` row and from
  `greenline view deal` alike: the page shows the rerolled three you pick
  from, a pick records the direction shown, and the first three stay a
  link away as the deal's history. A pick you give in words, such as "the
  second one", is recorded the same way at your next message, with your
  words quoted, when it answers the message that dealt. A change with no
  deal kept and no pick, one that dealt nothing or whose deal went with
  its close, says "No deal for this change" and offers nothing; the
  catalog's samples stay in the Catalog tab.
  The frame map, where the frame asked a question or closed a node, and
  as the closing write left it, shows
  the nodes the frame opened, each a box you open with a click to its
  questions, every question with the answer the agent proposed, the answer
  taken and whether you or the agent decided it, and the research reports
  it drew on; the nodes left closed stand faint with why and the untouched
  ones are named in a line. The **Plans** tab lists each plan directory
  under `.greenline/plans/` with its tickets' progress; a plan's page shows
  the planning change, the tickets ready to start, each ticket with its
  intent, scope, acceptance, the entries it comes after, its mode and the
  change records that name it, and the plan documents with their mark.
  Progress and the ready tickets are derived as greenline status derives
  them; nothing is written. The **Discussions** tab holds ideas explored
  before they become changes, or instead of one, each a record under
  `.greenline/ledger/discussions/` (the [discussions page](discussions.md)):
  every discussion with its state, its idea, when it was last touched and
  the changes it promoted. A discussion's page has its idea as its title,
  its state with your words that set it quoted, the changes it promoted as
  a strip of their names, its frame map, the open questions and then the
  settled ones folded, its sections rendered, and its research reports,
  each opening in place. The desk shows the open and parked ones, and a
  change promoted from a discussion links to it at the head of its page.
- **Interface:** the **Pages** tab shows one card per page of your app,
  the newest capture on top: the page's address, the newest capture's
  picture, or where it kept none a wireframe drawn from the boxes of its
  elements (the landmarks filled, the buttons and links outlined, the text
  as grey bars), or where it kept neither a card of its facts; the newest
  capture's tier alone, as how far it stands behind the code; its three
  scores as chips, the floor's and the reflex's reds in their colour, the
  finish in grey with a line of it over the captures; the change that last
  captured it and when; the picture its latest capture could not take,
  with why, the address tried and when; and the earlier captures folded as
  quiet history. The cards group by page, by change or by tier. Below
  them, **Capture now** for your running page, which says why where it
  cannot take one, in the words the check uses, and refuses the viewer's
  own address, then your DESIGN.md's tokens as tiles with
  its own sample page ([the interface practice](interface.md)). The **Your
  notes** tab, `/interface/notes`, lists your marks by state, with before
  and after for each one the agent answered, and each mark has its own
  page, `/interface/notes/<id>`. The **Catalog** tab shows the installed
  interface catalog's entries as specimens, filtered by register, kind and
  the words you type. A capture opens at `/pictures/<id>`, lit under
  Interface: its address as its title, when and under which change and
  commit it was taken, its scores, and a link to a newer capture of the
  page where one stands, else **Capture again** with what it does written
  beside it (three new captures; this one stays). Its views are
  **Picture**, the capture at the width closest to your window, or its
  wireframe, with each of your notes a numbered pin and the notes listed
  beside it, under it on a phone, the first screen with the whole page a
  click away; **Elements**, each element's role, text and source; and
  **Manifest**, the capture's document. The picker and the pencil mark it
  ([marks](marks.md)); a finger scrolls the page unless the pencil draws.
- **Knowledge:** the **Overview**, `/knowledge`, a card per home with the
  question it answers, what it holds and when it was last written: the
  decisions book, the house rulings, the decision records, the glossary,
  the work guide, the atlas, the figures and the maps; a home not kept yet
  is quiet and says what makes it, and the atlas's says the sentence to say
  to the agent.
  The **Decisions** tab, `/knowledge/decisions`, reads the decisions book
  `.greenline/DECISIONS.md` rendered, each change it quotes by its name,
  its root statements counted and shown as a card per root; Source shows
  its text with each line numbered, and Edit opens the text beside its
  preview, with the line that says what saving does above Save, the
  draft's lines against the file in their colours, and when the file was
  last saved through this page. The **House rulings** tab,
  `/knowledge/rulings`, reads the rulings in AGENTS.md as a list, or says
  that none is written yet and what is kept there, with the same Source and
  Edit. The decision records in docs/adr/ with each one's status and date,
  each folding open in place, `GLOSSARY.md` and the work guide
  `.greenline/WORK.md` open from their cards; a long document has an
  outline beside it. The **Pictures** tab holds the figures, the diagrams,
  the map's and the journeys first, each card with the question its brief
  says it answers, its kind, its finish, text, branded SVG or
  interactive, its change, the commit it was made at, the commits since that touched its files and
  its tier, fresh, drifting or stale; the captures of your app are named in
  one line that leads to Interface, which holds them by page. A picture's
  page shows it in place, a drawing as an image and a page in a frame of
  its own, the same bytes its raw address serves, sandboxed by that
  address's policy, at `/pictures/<id>`, its path under the home, such as
  `/pictures/map/<slug>`. The **Maps** tab, `/knowledge/maps`, shows the
  interactive companions two skills make on your ask: the architecture map
  of `architecture-map` and the explanatory figures of `anatomy`, the maps
  first and the newest first, each live in its frame with its own controls
  working, the question it answers, who made it, the change that kept it,
  its commit, its tier with the commits since, the files it covers and a
  link that opens it full page; with none kept, "No map yet" and the
  sentence to say for each. The reply after a map or a figure is kept
  links this tab. The **Atlas** tab, `/knowledge/map`, the repository's map
  as bands of subsystems, each box with its summary on hover or focus, its
  files and journeys counted and a drifted one edged in amber, with the
  refreshes the index records; before the first page, "No atlas yet", the
  time the first pages take, that a fresh agent makes them on your ask, and
  the sentence to say to ask for it. The **Subsystems**
  tab, each subsystem's page with its summary, its journeys as a numbered
  path, what it calls and what calls it as two lists, and its files folded,
  then the repository's indexed documents with their tier, who wrote them
  and the files they cover, each document's page at
  `/knowledge/documents/<path>`.
- **Practice:** its home, `/practice`, says in one sentence whether
  greenline is healthy here, then a line per kind of finding greenline
  status reports, each with its sentence, how many, its code quiet at the
  right, its files folded, and the act that clears it (a link to sync the
  installation where the installed files no longer match the settings).
  Under it a tile of the roster, how many installed skills loaded and the
  share of each kind, with the most loaded, and a tile of the settings; the
  hooks with the declared checks and the receipts stand folded below. The
  **Roster** tab groups the skills by kind in the order the modes define,
  the steps, the starts and the habits, each with its kind's sentence and ranked by loads: a row per
  skill with its name, the first sentence of what it is for, its loads on a
  grey bar with the count aligned, its loads over the line as eight small
  cells with its own step in indigo, a step skill's loads at another step
  than its own, and when it last loaded; a row opens in place to its loads
  by step, whole or in part, and its changes, and a line under the roster
  counts, for the changes that owed a skill by its trigger rows, how many
  loaded it. The skills no change loaded
  fold into one line per kind, and those not installed fold last, with the
  way to install one. **Table** shows the same as one table, every number
  at once, with the roster's JSON beside it. Each skill has a page,
  `/practice/roster/<skill>`, with what it is for, its loads by step, the
  changes that loaded it and every load. A load says what entered the
  agent's context, not what it followed. The **Settings** tab shows the
  installation as a form: the harnesses, proceeding without waiting, the
  trials, the skills grouped by kind as the roster groups them with what
  each is for and its loads, and the connectors, with a bar at the foot
  naming the changes you have not saved, what saving writes and that the
  sync is separate; while the installed files do not match the settings a
  banner says so with Sync installation. The **Installed files** tab shows
  the files greenline put here as a tree by folder with their sizes, a
  changed file marked and opening its lines against Git HEAD, any other its
  text. The **Checks** tab shows the declared checks, the git hooks'
  registration and the harness adapters; the **Receipts** tab, each garden
  consultation's receipt, its publication and every call's operation,
  outcome and units, with evidence limits kept separate; and the **Policy**
  tab leads to the decisions book in Knowledge.

A link inside a record or a document opens in the app when it points at
something the app shows, such as a report, another change, a plan or a
knowledge home; a web address opens in a new tab; any other link is shown as
text. Images are named, never loaded.

Missing Git baselines and unreadable files are reported as unavailable. A
record or a tickets file that does not parse is shown with why. A file that
resolves outside the repository is refused, never read. Installed orphans
remain visible until you deliberately resolve them. The inspector never
starts garden or contacts a service.

## Finding and moving

Press `/`, or ⌘K (Ctrl K on Linux and Windows), to search the changes, the
plans, the skills, the subsystems, the pictures, the pages and the actions by
name. Every action has a key:

| Key                  | Does                                                     |
| -------------------- | -------------------------------------------------------- |
| `/` or ⌘K            | open the search                                          |
| `g` then `d c i k p` | go to Desk, Changes, Interface, Knowledge, Practice      |
| `j` `k`, then Enter  | move over the groups and the rows, and open a row's page |
| `o` or Space         | open or close the group or the fold you are on           |
| `l` `h`              | open, or close, the group or the fold you are on         |
| `]` `[`              | open, or close, every group and fold on the page         |
| `v`                  | turn the open fold's view: Read, Source, JSON            |
| Esc                  | close the search, or go back to the page above           |
| `r`                  | read the repository again                                |
| `t`                  | switch light and dark                                    |
| `c`                  | copy this page's address                                 |
| `?`                  | show the keys                                            |

The app follows your system's light or dark setting until you switch it with
Theme or `t`; your choice is kept in this browser.

On a phone the places move to a bar at the foot of the screen, five icons
each over its word, the place you are in marked; the search keeps its icon.
[Every page fits the screen, with no sideways scrolling, and a narrow screen
drops columns, never facts]{claim: The inspector fits a phone with no sideways scrolling}: a change's line becomes a small card with its
sentence on two lines.

## How it looks

Both looks use the same quiet surfaces, thin borders and dense rows, so a
page reads at a glance. One colour, an indigo, marks the one thing that is
chosen or current: the page you are on, a link, the step now, the primary
button. Every other colour means a state, and the same in every view: orange
for waiting on you, green for done, passed and fresh, red for failed and
stale, amber for drifting, blue for your notes, grey for stopped, dropped and
not run; besides the states, only lines added, `+148` in green, and removed,
`−57` in red, take a colour. A state always shows its word too, with a
small square beside it, outlined while the state is open and filled once it
is over, so you never need the colour to read it; in a long list the square
keeps the colour and the word goes grey, but for waiting on you and failed,
so the rare state stands out. A count drawn as a bar is grey, never green,
and a plain fact such as installed is a word alone. Each section opens with
a heading larger than what it holds, and a list sits in one box with its
groups banded. All text stays readable in both looks. The type
is Geist, shipped with greenline under its own licence and loaded from the
local server, never from the network. The catalogue, `/catalogue`, shows
the colours in both looks side by side, the type sizes and every part of the
app drawn from sample data.

## Saving a choice

Settings live in .greenline/manifest.json. The decisions book lives in
.greenline/DECISIONS.md; its repository-memory contract is in the installed
WORK.md. House rulings are dash bullets under `## House rulings` outside
AGENTS.md's managed markers. The stanza is optional; the inspector's editor
can create it when you save actual rules. You can edit these files directly
or use the inspector. The record views change nothing; Knowledge saves the
decisions book and the house rulings, Settings saves the installation, and
a picture's page deletes that picture.

**Delete this visual** removes a durable picture and its manifest after you
confirm, and the change's list of its pictures follows; like a save, it
checks the revision the page read and refuses a picture that changed since.
Git keeps the picture in its history.

A save checks the revision your page opened. If another edit intervenes, it
refuses and keeps your draft on the page. A changed save records the file's
latest before/after hashes and time in .greenline/policy-changes.json. Git
preserves history; this compact marker is not a queue of assessments.
[Saving does not prove that the decision's consequences have been
handled.]{claim: Local policy edits retain evidence and do not imply successful sync}

**Save and sync are separate actions.** Use Sync installation after changing
harnesses, skill availability or the trials. A failed sync leaves the saved
choice intact. Conflicting managed content and orphans require explicit
resolution; user edits are never silently erased. Connectors are enabled and
disabled with `greenline connectors`, not here. Credentials come from the
process environment and cannot be entered or saved here. Checks are declared
with `greenline check --declare`, and the hooks are turned on or off in the
manifest's `hooks`; Practice's Checks tab shows both as they stand.

## When it refuses

When a save is refused because the file changed, press Discard the draft to take the file as it stands, then edit again. Let another writer finish before
retrying. Repair malformed policy or receipt files using the named
diagnostic. An occupied port needs another port. Foreign browser origins are
refused. An address the app does not know shows a page saying so; the
addresses of the earlier one-page inspector, such as `#change/<id>`, name no
page now. A missing CLI installation payload needs restoration before the
inspector can render desired output. `greenline status` can still report
independent repository facts.

A receipt shows what garden returned to a request. It does not prove that a
model read, understood or applied that knowledge. With no connector enabled,
the page shows that no consultation was made.
