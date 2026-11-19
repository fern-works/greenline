# explain: the practice's mechanics

This page holds where explain's work lands in the workspace and the commands its refresh reads, which `SKILL.md` names by their nouns. Read it with `SKILL.md` when the work lands in the workspace.

## Where its work lands

The change that writes or refreshes the atlas has its record at `.greenline/ledger/<id>.md`, its `## start` section naming explain and the pages. The atlas lives in the visual home, `.greenline/visuals/`:

- `atlas.json`, the index: its layers in order from the entry points to the foundations; each subsystem with its name, title, layer, one-line summary, the files it covers (a trailing `/` for a directory), the commit its page was read at, the date and the subsystems it calls; the refreshes, each with its change, its commit, whether it was whole, the pages it rewrote, the version of the practice it ran under and its cost.
- `subsystems/<name>.md`, each subsystem's page.
- `subsystems/<name>/<slug>.svg`, `.html` or `.md`, each journey, with its manifest `<slug>.visual.json` beside it in the form `.greenline/WORK.md` gives ("Durable visuals"), its `skill` `explain` or `diagram-design` and its `form` `journey`, and its `brief`, the six fields of the brief written first at `.greenline/tmp/<id>/pictures/<slug>.brief.md`, which the fresh agent copies into the manifest.
- `documents.json`, the documents index: each of the repository's own documents with its `path`, its `author`, `practice` or `owner`, the `files` it covers, the `commit` it was kept at and the `change` that kept it, null for discovery's; the hooks keep a listed document's commit when a change writes it.

```json
{
  "schema": "greenline.atlas/v1",
  "layers": ["entry", "core", "foundations"],
  "subsystems": [
    {
      "name": "http",
      "title": "The HTTP layer",
      "layer": "entry",
      "summary": "Hands each request to its handler and writes the answer.",
      "files": ["src/http/"],
      "commit": "0123abc",
      "read": "2026-10-25",
      "calls": []
    }
  ],
  "refreshes": [
    {
      "change": "2026-10-25-atlas",
      "commit": "0123abc",
      "whole": true,
      "pages": ["http"],
      "greenline": "0.2.0",
      "cost": "one agent, four minutes"
    }
  ]
}
```

A page's commit is `git rev-parse HEAD` when it was read, and the version is the one `greenline --version` prints.

## Drift and the refresh

`greenline status` reports a page whose covered files changed since the commit it was read at (GL0603), and a listed document that drifted the same way (GL0607). The files a page's refresh re-reads are those `git diff --name-only <commit>..HEAD -- <files>` names. The close's refresh writes each page's new commit into `atlas.json` and its refresh with its cost, and the record's `refreshes` line names the agent apart, counted nowhere, with its pages and its cost: `{ by: explain, pages: "http, map", cost: "one agent, four minutes" }`. Done waits until the touched pages are refreshed, or the owner's words "leave the pages" stand in the close section; a refresh of its own change records its cost in its front matter's `agents` and `rounds`.
