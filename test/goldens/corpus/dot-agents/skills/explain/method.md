# Explain: the method

"How does X work" and "end to end" mean the code's path, unless the owner names the practice.

The atlas is durable: its pages, its journeys and its index are edits, so propose the mode and wait, as AGENTS.md says, open the change's record with a `## start` section naming explain and the pages it will write, and run the line from `frame`. A fresh agent, started by the change's build or its close with the skill's brief, makes the map, each atlas page and its journey and every durable diagram; the session draws only inline. The close names the pages it wrote.

## The walk

Produce the explanation someone needs to start working in a part of the code: enough for a working mental model, never annotated source code. When the question is "what is wrong with it", the findings are review's or diagnose's, and the explanation stays clear of verdicts.

1. **Scope the question**: a subsystem, a feature flow, a runtime trace ("what happens when..."). If the subject is vague, state your best reading of it in one line and proceed; the owner will redirect you.
2. **Assess the size.** A single module or a narrow function: one pass, read and explain. A cross-cutting subsystem: split the ground into two to four slices (the data model, the driving path, the configuration and composition is a common cut), cover each, then reconcile them.
3. **Trace, never guess.** From an entry point, follow the call chain: callers, callees, data flow, types. Read the code; a file's name does not say what it does at run time. You are done tracing when you can describe the whole path from input to output without hand-waving one step. "I could not determine how X connects to Y", said plainly, beats a smooth invention.
4. **Collect what a newcomer would get wrong**: the surprising default, the invariant that lives one file away from where it fires, the historical remnant. When the question is really why, read the history and the repository's decision home.

## The form

- **Overview**: a paragraph or two: what it is, what it does, why it exists. Enough to decide whether to keep reading.
- **Key concepts**: the few types, modules or contracts needed to understand the rest, one line each. Never exhaustive.
- **How it works**: what triggers it, the steps, where the data goes, the decision points. Prose that names real files and functions so the reader can go and look; a code block only where the snippet is load-bearing.
- **A journey**: the path a request, an event or a value takes through it, drawn in one of the reply's six forms, most often a call tree or a box drawing, at most 72 columns and twelve nodes.
- **Where things live**: the short map of the directories and files a reader needs to start working here. Not every file.
- **Gotchas**: the non-obvious things that trip people, each with its anchor.

Match the depth to the question: a narrow ask gets the overview and how it works, and stops. The explanation stands alone, so that someone who only wants to understand never wades through anything else. A subsystem's page and its journey are kept in the atlas only on the owner's ask; nothing is offered.

## The atlas

The atlas is the repository's map kept as pages: one page per subsystem in the form above, with the files it covers and the commit it was read at, one or more journeys through it, and an index the inspector reads, beside the map `architecture-map` draws. Its pages are for the next agent and the owner, who read them cold. show-me's table of kinds says which journey fits which shape.

### Discovery

When the atlas has no pages, propose the candidate subsystems before writing any; the owner's ask for the map runs this discovery:

- A repository with code: read its tree, its entry points (the commands, the servers, the exported packages, the jobs), the dependency graph between its directories or modules, and its hot spots, the files the history changes most. Propose one subsystem per cohesive part, four to twelve, each with a name, a one-line summary, the files it covers and its layer, from the entry points down to the foundations.
- A repository with little or no code: propose them from its plan's modules, its design or the request's parts, each as it will stand once built, its files the paths it will hold.

Show the candidates in the reply as a table with a box drawing of their layers, and write nothing until the owner picks; the owner's pick, a rename or a merge included, is final. Beside them, list the repository's own documents, the README at the top and the pages under `docs/`, each with the files it covers and whether the owner wrote it, for the documents index; a repository with many pages gets the pages the owner picks. A document the owner wrote is named for its refresh, never rewritten unasked. A map the owner asked for is carried to its last page under the change's record, and the close names any page not made.

### Pages and journeys

For each picked subsystem, the fresh agent writes its page in the form above and at least one journey: the path a newcomer would trace first, then any other worth keeping, a request through it, an event, a state chart of what it holds, a sequence across its neighbours. A journey is a durable visual of any kind and either system: a drawing `diagram-design` makes, or a text page with a box drawing in one of the six forms. Read before you write: every claim on a page is one you traced. Before the fresh agent draws a journey, write its brief, one line a field: the question the journey answers, in its reader's words; its form; its node count; its finish, text, branded SVG or interactive; its palette; and its reader.

### Refresh

A page drifts when a commit since it was read touched a file it covers; the status line counts the drifting pages, and the close names the pages its change touched. The close refreshes them without asking: one fresh agent, started with this skill's brief, re-reads only the files that changed since each page's commit and rewrites only those pages and their journeys, and the map when a page changed, up to three pages; every other page stays as it stands, and the record's `refreshes` line names the pages and the agent's cost. Past three pages, or for the whole atlas, the refresh waits for the owner's ask and is a change of its own. The whole atlas is re-read at most once per minor version of the practice, unless the owner names it.
