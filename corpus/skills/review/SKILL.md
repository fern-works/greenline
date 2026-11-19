---
name: "review"
description: "Review a change's commits for defects along two axes, Standards (the repository's documented standards, the smell baseline and the excess lens) and Spec (does the code do what its acceptance asked), by a reviewer briefed with the change record's front matter, its acceptance and its commits and never the builder's diagnosis, then judge every finding and act on it in the mode's fix round, at the depth the change's mode gives the review step. Use when the mode reaches review, or when the owner asks to review the branch, to review since X or a PR, or what can be deleted."
---

# Review

Review reads a change's commits for defects along two axes before the change is verified: Standards, how the code is written, and Spec, whether it does what was asked. The reviewer never fixes what it finds, and the builder never edits a report.

Before the reviewers start, read [method.md](method.md): who reads the reviewer's brief at each depth, the intent stated, and the findings judged and acted on; and [references/greenline.md](references/greenline.md), "Fresh agents", when you start them.

## Handoff

Consumes: the change record's front matter and its acceptance, the plan section's acceptance criteria, the ticket's entry in the plan directory's tickets.md, or the frame section where the mode skipped the plan; the change's commits by their trailer
Produces: the review section of .greenline/ledger/<id>.md, one line at the inline depth, and at the independent depth the builder's judgment of every finding citing each reviewer's report .greenline/ledger/<id>/review-<n>.md; each fix as a commit carrying the trailer; the reply alone when asked for by name with no change open
Next: the next step of the change's mode
