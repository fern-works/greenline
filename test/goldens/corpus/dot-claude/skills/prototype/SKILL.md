---
name: "prototype"
description: "Build a throwaway prototype, a spike, to answer one design question. Use when the user wants to sanity-check whether a state model or logic feels right, mock up a couple of UI options, or 'just try it and see'."
---

# Prototype

A decision or plan dispatches this method when one experimental question stands in its way: the requesting stage names the question, and the answer goes back to it. Establish the question, which branch below it needs, and whether the result is disposable or intended to ship; resolve that distinction when the request leaves it open, and use the existing task's owner. A promising prototype does not silently become production code: the validated decision moves into the real code by the normal path, and the disposable code never enters the shipping source tree. This method publishes no external issue and needs no tracker.

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Keep the prototype code out of the shipping source tree: a runnable experiment lives in `.greenline/tmp/prototype/`, in the owner's evidence home, or in an isolated throwaway checkout of the project when it needs the real modules and pages around it (mirror the project's module and routing conventions there, so context stays obvious), and name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
2. **Trivial to run.** A UI prototype starts from one documented command run from the experiment's directory or isolated checkout with the tools already available: `pnpm <name>`, `python <path>`, `bun <path>`, etc.; the shipping task runner gains no prototype entry. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: copy what the decision relies on into the owning ticket's evidence home first, and cite that copy; a prototype built in an isolated checkout may also be kept on a throwaway branch, out of main, with a context pointer to that branch on the owning ticket, `.greenline/work/tickets/TKT-NNN.md`, which is context and never evidence. Capture the answer too (the verdict, the question it settled, and its limits) in the ticket or a commit; when an initiative owns the question, its `prototypes/PROTO-NNN.md` carries the question, the answer, the limits and the branch pointer. The main branch keeps only the validated decision.

## Handoff

Consumes: one experimental question and whether its result is disposable or meant to ship, from the requesting decision or plan
Produces: prototypes/PROTO-NNN.md in the owning initiative, or the answer on the owning ticket with the relied-on copy in its evidence home; for a prototype built in an isolated checkout, a throwaway branch with its pointer as context; disposable code never in shipping implementation
Evidence at: the owner's evidence home, where the relied-on copy is promoted from .greenline/tmp/prototype/ or an isolated throwaway checkout; a throwaway branch, when one exists, is a context pointer and never evidence
Returns to: the requesting decision or plan, with the answer and its limits
