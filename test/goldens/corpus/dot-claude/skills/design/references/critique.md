# Critique

Read this page as the fresh reviewer of a change whose record says it touches an interface, and as the builder writing that reviewer's brief. The review judges the rendered interface, the captures verify keeps, and reads the code only to support what the render shows. The brief carries the facets in play, the captures and the change's design section, never the builder's own verdict.

## Before judging

1. Write each screen's purpose in one line, marked "assumed" where nobody stated it. Review against the home: a choice DESIGN.md or the interface rulings already made is not a finding.
2. On a change, review the change: give each finding its status, introduced, a regression or already there, read the removed lines, follow each changed component to at most five places that use it, and list no more than three findings that were already there.

## Your own reading

Look before you measure, one pass at a time, at each width:

- a one-second look and a five-second look: what reads first, and is it the screen's purpose;
- squint: is there one focal point, and does the hierarchy hold;
- cover the logo: could this be any product's page;
- edges and space: two or three left edges, not six; is every empty stretch closed by something;
- type: a clear jump from body to headline, few sizes, a readable measure;
- colour: its proportions, and whether colour stands in for hierarchy;
- states: empty, loading, error, long and many, as the captures show them;
- the phone: a second composition, or the desktop shrunk.

## The ten heuristics

Score each from 0 to 4, where 0 is absent or broken, 2 is partly met and 4 is fully met, against a register frozen for the run, so no item can be dropped to raise the total:

1. the system shows what it is doing;
2. it speaks the person's language and follows the world's order;
3. the person can undo, leave and go back;
4. it is consistent inside itself and with its platform;
5. it prevents mistakes before they happen;
6. it shows options rather than asking the person to remember them;
7. it serves the expert's shortcuts without blocking the beginner;
8. it carries nothing the task does not need;
9. its errors say what happened and how to recover;
10. help is findable where it is needed.

## Cognitive load

Name what the screen must do, mark what does not serve that, and propose removing or demoting it; then check the labels, the chrome and the motion again. Stop before a needed decision is hidden. One action leads; related things sit together; nothing asks for what is already known.

## The generated look

Look first for the compositional tells: no focal point, flat hierarchy, one layout repeated, timid colour, borders doing the work of space. Then run the removal test on each candidate: state its role, and where removing it loses nothing, propose its removal; otherwise propose the smallest fix inside the existing system. A deliberate bold choice is not a defect, and no score or guess about who made the page is given.

## The check's output, last

Only after your own reading, open the interface check's findings: the registry's rules by tier and category, for the facets in play. Read them as evidence beside yours, never as the review: a clean check means nothing it measures failed, and the judged rules on the craft pages are yours to apply.

## Findings and the verdict

- Each finding names its rule or heuristic, the element by its role and name, the capture and the width, and the evidence; one you inferred is written as the check that would settle it.
- Try to kill each finding before you report it: reopen the evidence, drop what does not hold, and leave out taste, ratified choices and anything outside the change.
- Report at most fifteen findings, the three that matter first; never pad, and "no supported findings" is a result.
- Sort them as blocking, should-fix and note, taking the milder bucket when unsure; a floor finding is blocking.
- End with one word, `approve`, `revise` or `block`, then the strengths that must survive, then a coverage line: the pages, widths, schemes and probes read, and what was not.
