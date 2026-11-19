---
name: "state-machines"
description: "Find the implicit state machines in the app: each flow whose states live in flags or status fields, drawn as a map. Use for \"find all of the implicit state machines in my app\", for states, transitions or a lifecycle the code never names, or when a record's flags contradict each other."
---

# State machines

state-machines is the start for these words of the owner's, or a request that means them:

find all of the implicit state machines in my app

An implicit state machine is a flow whose states the code holds without naming them: a set of flags, a nullable field, a status string, an order the calls must come in. The start finds each one, names its states and its transitions, and marks the transitions no code names and the states no code means. It draws the map and changes no code; a fix the map suggests is a change of its own, under the mode the owner approves.

Before the first file is read, read [method.md](method.md): where the machines hide, how each one is read, and the map's form.

## Handoff

Consumes: the request, and the code it names or the whole application
Produces: the map of the machines found, in the reply with no change open, and inside a change as .greenline/ledger/<id>/state-machines.md, which the record's start section cites
Next: frame, under the mode the owner approves, for a fix the map names; otherwise none, the map staying in the reply
