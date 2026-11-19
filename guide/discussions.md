# Discussions

A discussion is an idea you explore with the agent before it is work, or
instead of work: whether to build something, what it should be, or how it
could go. [It never becomes code by itself.]{claim: A discussion never becomes code by itself} You can start one while a change
is being built, and the change's work goes on untouched.

## When the agent opens one

The agent reads each request by its shape. A request for something to
deliver is a change; a whether, a what or a how about something not yet
built is a discussion. It says which it read your request as, and when it
is unsure it offers the other in one sentence. One word from you switches
it: "make it a change", or "let's just discuss it".

A discussion needs no mode, no proposal, no branch and no yes. The agent
thinks the idea through the way it frames a change at the written depth,
the same subjects and the same questions with a recommended answer each,
and it may propose research when a question waits on a fact the repository
does not hold. It writes nothing but the discussion's record and its
folder: no code, no change record, no check.

## Where it is kept

Each discussion is one record, `.greenline/ledger/discussions/<id>.md`,
with a folder of the same name for the research reports it cites. The
record holds the idea in one line, its state, its questions with the
answers you gave, the research and the questions still open. Its id is a
date and a short name, such as `2026-10-21-offline-mode`.

The record and its folder are committed in a commit of their own, where you
sit, with the trailer `Greenline-Discussion: <id>`. The git hooks let that
commit through even while no change is open, and there refuse one that
mixes the discussion's files with any other. Nothing of a discussion reaches a branch
but those commits.

## Its states

At the end of a discussion session the agent asks you what becomes of it,
with its recommendation, and sets the state only on your answer, quoting
your words in the record:

| State      | What it means                                           |
| ---------- | ------------------------------------------------------- |
| `open`     | it is being explored, and can be picked up again        |
| `parked`   | set aside, with when to come back to it                 |
| `declined` | not to be built, with the reason kept                   |
| `promoted` | it became one or more changes, each named in the record |
| `merged`   | it joined another discussion, which the record names    |

[The agent never moves a state on its own reading.]{claim: A discussion's state moves only on the owner's words} The git hook refuses a
commit that moves the state without new words of yours in the record.

## From a discussion to changes

When you say a discussion should become work, it is promoted: a small one
to one change, a large one to several, or to a planning change whose plan
splits it into tickets. Each change gets its own proposal, which says that
it comes from the discussion, and on your yes its record opens with
`from: <id>`. Its frame starts from what the discussion decided and asks
you none of it again; only what the discussion left open is asked. The
discussion's research reports are copied into the change's folder, under a
folder named for the discussion, so the
change stands on its own. A change may come from more than one discussion.
The discussion's `changes` line names each change it became, and where a
record's `from` line names a discussion that does not name it,
`greenline status` says so, GL0482, for the agent to correct whichever of
the two lines is wrong.

## Seeing them

Ask the agent what is up, or what to work on, and it lists the stopped
changes and the open and parked discussions, recommends one and waits for
your pick. `greenline status` lists them beside the changes, each with its
state and its idea, and the status line names the open and parked ones at
every turn, such as `discussions: 1 open (2026-10-21-offline-mode), 1
parked`. The [status reference](./status.md) gives the three codes a
discussion can raise.

In the [inspector](./inspect.md), the **Discussions** tab under Changes lists every
discussion with its state, its idea, when it was last touched and the
changes it promoted. A discussion's page draws its frame map, the subjects
it opened and closed, with its decisions, its open questions, its research
and the changes it became; a change promoted from a discussion links back
to it at the head of its page.

## Its working files

A research agent's scratch for a discussion goes under
`.greenline/tmp/<id>/`, which git ignores. Once a discussion is declined,
promoted or merged, `greenline tidy --discussion <id>` removes them; the
reports in its folder stay.
