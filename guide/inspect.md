# The inspector

`greenline inspect` opens the repository as a local browser page at
http://127.0.0.1:7433/ or your chosen `--port`. It ends when you stop the process.
Run it inside an initialized Git repository. The page reads the repository as
it stands each time you open a view or a record, and again when you press
Reload; it contacts no service and keeps no copy of what it shows.

## What you can read

Every view sits in one row at the top of the page. A list opens one record's
page, and the link above its title leads back.

- **Changes:** every change the practice made, those in progress first, each
  with its mode, its state and, for an open or stopped change, its "next"
  line. A change's page shows its front matter as a card, the line's seven
  steps in order (a skipped step as its one line), the check facts held
  against the commits they ran on, and the reports and briefs in its folder.
- **Plans:** each plan directory under `.greenline/plans/`, with its tickets'
  progress. A plan's page shows the planning change, the tickets ready to
  start, each ticket with its intent, scope, acceptance, the entries it comes
  after, its mode and the change records that name it, and the plan
  documents with their mark. Progress and the ready tickets are derived as
  `greenline status` derives them; nothing is written.
- **Knowledge:** the homes that outlive a change, where the repository keeps
  them: the work guide `.greenline/WORK.md`, the decisions book
  `.greenline/DECISIONS.md` with its root statements shown as a card per
  root, the decision records in docs/adr/ with each one's status and date,
  and `GLOSSARY.md`. A long document has an outline beside it.
- **Checks:** the diagnostics `greenline status` reports, errors first.
- **Receipts:** each garden consultation's receipt, its publication and every
  call's operation, outcome and units, with evidence limits kept separate.
- **Repository policy:** the decisions book and the House rulings in
  AGENTS.md, each with its editor, and the latest manual saves.
- **Installation:** harness and skill choices, the `proceed` and `trials`
  settings, the declared checks, the git hooks' registration and the
  harness adapters, the enabled connectors, actual installed files and
  changes compared with Git HEAD.

A link inside a record or a document opens in the page when it points at
something the page shows, such as a report, another change, a plan or a
knowledge home; a web address opens in a new tab; any other link is shown as
text. Images are named, never loaded.

Missing Git baselines and unreadable files are reported as unavailable. A
record or a tickets file that does not parse is shown with why. A file that
resolves outside the repository is refused, never read. Installed orphans
remain visible until you deliberately resolve them. The inspector never
starts garden or contacts a service.

## Saving a choice

Settings live in .greenline/manifest.json. The decisions book lives in .greenline/DECISIONS.md;
its repository-memory contract is in the installed WORK.md. House rulings are
dash bullets under `## House rulings` outside AGENTS.md's managed markers. The
stanza is optional; the inspector's editor can create it when you save actual rules.
You can edit these files directly or use the inspector. The record views
change nothing; only the repository policy and installation views save.

A save checks the revision your page opened. If another edit intervenes, it
refuses and keeps the draft on the page. A changed save records the file's latest
before/after hashes and time in .greenline/policy-changes.json. Git preserves
history; this compact marker is not a queue of assessments. [Saving does not
prove that the decision's consequences have been handled.]{claim: Local policy edits retain evidence and do not imply successful sync}

**Save and sync are separate actions.** Use Sync installation after changing
harnesses, skill availability or the trials. A failed sync leaves the saved choice intact.
Conflicting managed content and orphans require explicit resolution; user edits
are never silently erased. Connectors are enabled and disabled with
`greenline connectors`, not here. Credentials come from the process environment
and cannot be entered or saved here. Checks are declared with
`greenline check --declare`, and the hooks are turned on or off in the
manifest's `hooks`; the installation view shows both as they stand.

## When it refuses

Reload a stale editor before saving. Let another writer finish before retrying.
Repair malformed policy or receipt files using the named diagnostic. An occupied
port needs another port. Foreign browser origins are refused. A missing CLI
installation payload needs restoration before the inspector can render desired
output. `greenline status` can still report independent repository facts.

A receipt shows what garden returned to a request. It does not prove that a
model read, understood or applied that knowledge. With no connector enabled,
the page shows that no consultation was made.
