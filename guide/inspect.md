# The inspector

`greenline inspect` opens the repository as a local browser document at
http://127.0.0.1:7433/ or your chosen `--port`. It ends when you stop the process.
Run it inside an initialized Git repository.

## What you can read

- **Work and checks:** current artifacts and read-only diagnostics.
- **Receipts and accounts:** each garden consultation's receipt, its
  publication and every call's operation, outcome and units, and the
  contributor declarations, with evidence limits kept separate.
- **Repository policy:** the decisions book, root statements, latest manual-save
  evidence and the House rulings in AGENTS.md.
- **Installation:** harness and skill choices, the enabled connectors, actual
  installed files and changes compared with Git HEAD.

Missing Git baselines and unreadable files are reported as unavailable. Installed
orphans remain visible until you deliberately resolve them. The inspector never
starts garden or contacts a service.

## Saving a choice

Settings live in .greenline/manifest.json. The decisions book lives in .greenline/DECISIONS.md;
its repository-memory contract is in the installed WORK.md. House rulings are
dash bullets under `## House rulings` outside AGENTS.md's managed markers. The
stanza is optional; the inspector's editor can create it when you save actual rules.
You can edit these files directly or use the inspector.

A save checks the revision your page opened. If another edit intervenes, it
refuses and keeps the draft on the page. A changed save records the file's latest
before/after hashes and time in .greenline/policy-changes.json. Git preserves
history; this compact marker is not a queue of assessments. [Saving does not
prove that the decision's consequences have been handled.]{claim: Local policy edits retain evidence and do not imply successful sync}

**Save and sync are separate actions.** Use Sync installation after changing
harnesses or skill availability. A failed sync leaves the saved choice intact.
Conflicting managed content and orphans require explicit resolution; user edits
are never silently erased. Connectors are enabled and disabled with
`greenline connectors`, not here. Credentials come from the process environment
and cannot be entered or saved here.

## When it refuses

Reload a stale editor before saving. Let another writer finish before retrying.
Repair malformed policy or receipt files using the named diagnostic. An occupied
port needs another port. Foreign browser origins are refused. A missing CLI
installation payload needs restoration before the inspector can render desired
output. `greenline doctor` can still report independent repository facts.

A receipt shows what garden returned to a request. It does not prove that a
model read, understood or applied that knowledge. With no connector enabled,
the page shows that no consultation was made.
