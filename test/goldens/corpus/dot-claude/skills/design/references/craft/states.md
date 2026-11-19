# States

Read this page when a change shows data, waits for it, fails, or depends on who is looking.

## The rules you judge

1. Find the states in the code's branches: for the data, loading, empty, error, one, typical, long, partly resolved and stale; for the account, its plan, its role and its permissions; for the feature, its flags, its limits and its locks. An unreachable state is not built; a state the design shows and the code lacks is listed as missing.
2. Each state has a trigger, a scope, an exit and a way to recover.
3. Empty is never one state: missing, loading and failed are different, and so are unavailable and not applicable.
4. Disabled is a last resort: the state explains itself, or the control stays focusable and says why it is unavailable.
5. Optimistic feedback comes with a plan for failure, and accepted locally is kept apart from confirmed by the server.
6. Resolve the overlaps: a repeated submit, editing during a save, leaving and returning, and an old response arriving after a newer one.
7. Worst-case data is plausible or drawn from the schema's limits, and covers empty, one, and a thousand or more.
8. Decide truncation per field: wrap identifiers; cut secondary text at its end with a way to the whole; cut in the middle where items differ at their ends; clamp a card's preview to two lines; never cut a number, an amount or a date.
9. Fixtures look like the product, and every state is checked again after any visual change.

## SwiftUI

Load with a task on the view, with explicit loading and error states and redacted placeholders.

## Compose

Keep the offline, empty and retry paths reachable with TalkBack.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `no-raw-empty`, floor: Missing data never renders as 'undefined', 'null', 'NaN' or '[object Object]'.
- `console-clean`, reflex: The page loads with no console errors and no uncaught exceptions.
- `hover-state-present`, finish: Buttons and links have a hover state.
- `press-feedback`, finish: A press is answered within 100ms.
