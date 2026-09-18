---
name: "research"
description: "Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent."
---

A stage dispatches this method when a decision or task is waiting on a factual answer: wayfinder, grill-with-docs or to-spec names the question, and the answer goes back to that stage. Identify the decision or task waiting on the answer and use its existing owner; recency alone does not choose an initiative. The decision itself stays with the requesting stage: this method supplies cited evidence and does not settle the question. A read-only request returns its cited answer in the reply and writes nothing to the repository.

Spin up a **background agent** to do the research, so you keep working while it reads. Its reading is its own: cite the file it hands back, and do not record its sources as ones you consulted.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source: the question, the supported findings, the counterevidence, and the limits of the sources.
3. Save it as the owning initiative's `research/RSRCH-NNN.md`, with the supporting-artifact frontmatter `.greenline/WORK.md` defines, or under `.greenline/work/evidence/TKT-NNN/research/` when a compact ticket owns the question, and say where.

## Handoff

Consumes: the decision or task waiting on the answer, from wayfinder or to-spec, or from the request holder
Produces: research/RSRCH-NNN.md in the owning initiative, or a file under .greenline/work/evidence/TKT-NNN/research/ for a compact ticket; nothing for a read-only request
Evidence at: that file, cited claim by claim
Returns to: the requesting stage, with the citation and the pinned revision
