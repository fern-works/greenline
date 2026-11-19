# The interview

Frame reads this page when it interviews the owner, after the repository's documents, and runs the interview to its end; a start's own questions are asked here at any depth, in one round.

In the interview, the user is the owner of the request.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Before asking anything, write down your current best read of what the user wants in **one sentence**, plus an honest confidence number (0–100%):

```
HYPOTHESIS: You want a way to answer "how are we doing?" in standup, and "dashboard" was the convention that came to mind.
CONFIDENCE: ~30% — missing: who it's for, what "metrics" means in context, and what success looks like
```

The number forces honesty. If you wrote down a high number but can't actually predict the user's reactions to the next three questions you'd ask, the number is wrong. Start at the confidence level you can defend.

When confidence is below ~70%, append a brief reason on the same line — what's still unresolved or missing. This tells the user exactly what the interview needs to surface, and prevents the number from being a vague signal.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask at most three questions a round, those the others hang on first: number each question and give your recommended answer; its node goes in the record's list form and a card's header, never in the reply. Then wait for the user's answers before the next round.

Format a round like so:

```
1. **<question title>** <the question in a sentence or two, its choices named in plain words>
   1. <your recommended answer, a word or a short phrase> (Recommended): <why, in a few words>
   2. <another answer you weighed>
   3. <another answer you weighed>

2. **<question title>** <the question>
   1. <your recommended answer> (Recommended): <why>
   2. <another answer you weighed>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

### The nodes

The design tree's branches start from thirteen nodes, each a subject an engineer asks about:

- **purpose**: the outcome wanted, for whom, and why now
- **scope**: what is in, and what is explicitly out
- **adjacent**: the code and the features beside it that it touches or could break
- **journey**: the path a user or a caller takes through it, start to end, the unhappy paths included
- **surface**: what that user or caller meets: a command, an API, a screen, a message, a file
- **data**: what is stored, moved or changed, its shape and its lifetime, and what must migrate
- **behaviour**: what happens in each case, the edge cases and the errors
- **security**: who may do it, what it exposes, the secrets and the trust boundaries
- **performance**: the sizes, the latency and the load it must hold
- **operations**: how it is deployed, configured, observed and rolled back
- **verification**: how you will both know it works: the tests, the checks, the evidence
- **constraints**: the binding limits: compatibility, platforms, dependencies, time and the repository's rules
- **generic**: a question that fits no node above

Open only the nodes the request touches, and never ask a question for a node's sake. Say in one line which nodes you left closed, each with why, so the user can open one. Purpose and scope go in the first round: every other branch hangs off them.

Put each round where the status line's `questions` fact sends it. Where it says `questions cards` and the harness offers you its question tool, ask the round through it: at most three cards, one per question, its node in the card's header, your recommended answer the first option, its label ending "(Recommended)" and its description the reason, the other answers you weighed after it, each option a label of a word or two the owner can answer with, the first one's ending "(Recommended)", so "yes" takes every recommendation. A card whose first option lacks that label is named back to you once, for the next round. A card's free text is the owner's answer: read it and say how you read it, "I read that as yes", never as the card's failure. A choice too small for a card is yours: decide it and say so in the notes. Where it says `questions reply`, where no question tool is offered to you, or where the tool refuses the round or returns no answer, put every question of the round in the reply that ends your turn, in the form above: each question numbered, its answers numbered under it, your recommended answer the first, labelled (Recommended) with its reason in a few words, the other answers you weighed after it. Then wait there for the answers: a question put through a side channel the user may not see is not asked. Where it says `questions reply`, do not call a question tool even where one is offered, since no one there answers it, as under `codex exec`. The user's next message is the round's answers: read each by its number, as 1.2 for the first question's second answer, or by the user's own words, "yes" taking every recommended answer, and say how you read an answer given in words. A decision the scope the user accepted already settles is yours: decide it within that scope and name it to the user as your choice; one it leaves open still goes to the user. The hypothesis and its confidence are your notes in the record's frame section: in a reply, say what is still open, never a percentage. A check's waiver is asked as design's references say, once per workspace.

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in the repository's glossary, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Listen for "want vs. should want"

The most dangerous answers are the ones where the user says what a thoughtful answer *sounds like* rather than what they actually want. Watch for:

- Answers that pattern-match best-practice talk ("I want it to be scalable", "clean architecture") without specifics
- Answers that defer to convention ("the way most apps do it", "the standard approach")
- Phrases like "I should probably…", "I think I'm supposed to…", "good engineering practice says…"
- Buzzwords as goals — when "modern", "scalable", "robust" are the answer instead of a specific outcome

When you hear these, the question to ask is:

> *"If you didn't have to justify this to anyone, what would you actually want?"*

That single question often does more work than the previous five.

### Restate intent in the user's own words

When your confidence is high, write back what you now think the user wants. Keep it tight (5–8 lines), use their language where possible, and structure it so the user can confirm or correct line by line:

```
Here's what I now think you want:

- Outcome:      <one line>
- User:         <one line — who benefits>
- Why now:      <one line — what changed>
- Success:      <one line — how we know it worked>
- Constraint:   <one line — the binding limit>
- Out of scope: <one line — what we're explicitly not doing>

Yes / no / refine?
```

Including "Out of scope" is non-negotiable. Half of misalignment is silent disagreement about what is *not* being built.

Separate what they said from assumptions. Invite correction
   and incorporate their answer before treating this as the design brief. At careful, put it through the round's channel and wait: the hooks note that it was put, and the owner's words after it, quoted in the record's `confirmed` line, open the work outside the change's homes ([greenline.md](greenline.md), "The depths").

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed; a start's own questions end with their one round. Do not act on it until the user confirms you have reached a shared understanding.
