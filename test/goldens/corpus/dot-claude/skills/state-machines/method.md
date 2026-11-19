# State machines: the method

## Where they hide

- Flags that travel together on one record, `paid`, `refunded`, `cancelled`, where only some combinations are meant.
- A nullable field whose presence marks a stage, such as a shipped date or a cancellation reason.
- A status string or an enumeration compared in more than one place, each branch listing the values it handles.
- An order the calls must come in: a setup before a start, a callback that must run once, a close after every open.
- A retry, a timeout, a scheduled job or a webhook that moves a record when no user acts.

Search for the fields set in more than one place, the conditions over the same fields, the branches over a status, and the comments that say "must", "before", "after" or "only when".

## Reading one

For each machine:

1. Name it by the thing that changes: an order, a session, a subscription, a connection.
2. List its states as the data can hold them, every combination of its fields, and mark the ones the code means.
3. List each transition: the event that triggers it, its guard and the code that makes it, by file and function.
4. Mark what the map exists for: the states the data allows and no code means, the transitions two places make differently, and the transitions no code names, a state reached only because a flag was left set or a step was skipped.

Read the code each transition runs; a function's name is no evidence of what it does.

## The map

One map for the application, one entry per machine, each drawn in the state form of the reply's pictures, within 72 columns and twelve nodes:

```text
order: draft ──▶ placed ──▶ paid ──▶ shipped
                   │          │
                   ▼          ▼
               cancelled   cancelled   (paid to cancelled: no code names it)
```

Under each picture, a table: the state or the transition, where the code holds it, whether the code names it, and what goes wrong there. Close the map with the machines in order of risk, the one whose unnamed transitions touch money, stored data, a public contract or who may act first. Offer each fix as a change of its own: a named type for the states, one function for the transitions, and a test for each unnamed transition, red first.
