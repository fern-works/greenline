---
name: "architecture-survey"
description: "Scan a codebase for deepening opportunities and present them as a visual report, then grill through the one you pick. Use for 'survey the architecture', 'where would deepening pay off', 'refactor what next', 'tech debt', 'this repo is a mess, where do I start', or a scoped architecture review."
---

# Architecture survey

Architecture survey is the start for a question about the code's structure as a whole: "refactor what next", "tech debt", "this repo is a mess, where do I start", or a scoped architecture review. It runs only when the request asks for a survey or the owner names it, never as a step put before a change the owner asked for: a first change's orientation is a habit of that change's frame.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

Before the walk, read [method.md](method.md): the report, its home, the walk's reader, the candidates and the grilling loop.

## Handoff

Consumes: the repository; .greenline/visuals/map/snapshot.json when architecture-map has written it (optional); GLOSSARY.md and the decision records
Produces: the offline HTML report under .greenline/tmp/<id>/, never opened, its path and the viewer's address told to the owner, copied into the change's folder under .greenline/ledger/<id>/ only when a finding taken up cites it; its result in the knowledge homes under a quick record; the survey returns to the owner, and a recommendation is not authorization
Next: frame, under the mode the owner approves, for a finding the owner takes up; otherwise none, the survey staying in the reply
