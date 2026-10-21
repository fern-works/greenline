# Prototype

Frame reads this page when a frame question can be answered only by trying: whether a logic or state model feels right, what a screen should look like, or which of several shapes a design with no precedent should take. Establish the question, which branch below it needs, and whether the result is disposable or meant to ship. A promising prototype does not silently become production code: the validated decision moves into the real code through the change's build, and the disposable code never enters the shipping source tree. The answer returns to frame, and the frame section cites it.

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](prototype/LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → [UI.md](prototype/UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## When to sketch more than one

When a novel interaction or architectural decision has no established precedent, explore several concrete alternatives before implementation. Building the wrong thing costs more than exploring three options.

**The rule.** When the right answer is not obvious, build 2-3 competing prototypes or sketches. Compare them side by side. Only then commit. Design it twice is this rule by another name. A second flavor of the first shape does not count.

**When it applies:**
- Novel UI interactions (no prior art in the codebase)
- Architectural choices with multiple viable approaches
- Product design decisions where user experience depends on feel, not logic

**When it doesn't:**
- Mechanical implementation where the pattern is established
- Bug fixes or refactors with a clear target state
- Changes where constraints dictate a single viable approach

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why
- YAGNI ruthlessly - remove unnecessary features from every approach and design

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Keep the prototype code out of the shipping source tree: a runnable experiment lives in the change's own working files, under its own id; one that needs the real modules and pages around it lives on a throwaway branch in the one checkout, discarded or kept on the owner's word; and a sketch that touches no source may live in a scratch directory outside the repository. Never a worktree, never a second checkout. Name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
2. **Trivial to run.** A UI prototype starts from one documented command run from the experiment's directory or its throwaway branch with the tools already available: `pnpm <name>`, `python <path>`, `bun <path>`, etc.; the shipping task runner gains no prototype entry. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture it when done.** Capture the prototype itself as a **primary source**: copy what the decision relies on into the change's folder, and cite that copy; a prototype built on a throwaway branch may be kept there, out of main, on the owner's word, with a pointer to that branch in the frame section, which is context and never evidence. Capture the answer too (the verdict, the question it settled, and its limits) in the frame section; when the work splits into tickets, the prototypes of its plan directory carry the question, the answer, the limits and the branch pointer. The change's build, not frame, folds the validated decision into the real code. The main branch keeps only the validated decision.
