# Design It Twice

When the user wants to explore alternative interfaces for a chosen deepening candidate, design the interface several times, one design after another. Based on "Design It Twice" (Ousterhout): your first idea is unlikely to be the best.

Uses the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before the first design, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints, not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2.

### 2. Make the designs, one after another

Make three or more designs in turn: yourself, one after another, or one fresh agent per design through the harness's delegation, each named in the section of the step it serves and counted in no cost, each started only once the one before it has returned its design. Never run them in parallel. Each agent gets the one brief every fresh agent gets, with this page as the skill it works by and its design's technical brief and constraint, below, as its extras; it starts no agent of its own and writes its design as its report, named for the step the design serves, which that step's section cites.

Each must produce a **radically different** interface for the deepened module.

Give each design a separate technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam). The brief is independent of the user-facing problem-space explanation in Step 1. Give each design a different design constraint:

- Design 1: "Minimize the interface: aim for 1–3 entry points max. Maximise leverage per entry point."
- Design 2: "Maximise flexibility: support many use cases and extension."
- Design 3: "Optimise for the most common caller: make the default case trivial."
- Design 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [SKILL.md](SKILL.md) vocabulary and GLOSSARY.md vocabulary in the brief so each design names things consistently with the architecture language and the project's domain language.

Each design gives:
1. Interface (types, methods, params, plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs: where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated: the user wants a strong read, not a menu.
