# Copy

Read this page when a change writes or changes the words on an interface: labels, buttons, headings, messages and empty states.

## The rules you judge

1. Inventory the existing strings first: the noun for each object, the verb for each action and the case each kind of element uses; new copy reuses them.
2. An action keeps one name from the button to the menu, the toast and the confirmation.
3. Tone follows the stakes: warm for success, onboarding and empty states, neutral for routine actions and settings, calm and plain for errors and destructive steps, serious and explicit for data loss and security.
4. An error says what happened, what it affects and what to do next, beside the field that failed; a requirement known in advance shows before the input, and an error that keeps firing means the interaction is redesigned.
5. Prefer undo for a frequent action that can be reversed; confirm an irreversible action, one that touches others or one that loses much at once, its title naming the action and the object, its body stating what is lost with counts.
6. Status copy never claims success before the system confirms it.
7. A toggle is labelled for its on state, and a mention of a setting links to it rather than describing the way there.
8. Use the specific noun and the real number; sharpen or cut any sentence a competitor could print unchanged, and drop idioms that will not translate. The verb fits the input: tap, click or select.
9. Proof is never invented; where none exists, say what is true by construction, and list any sample detail for the owner to confirm.
10. On a site, write the argument first, one claim and its proof per section: a headline of about four to six words, a supporting line of twenty-two words or fewer, buttons of one to three words.
11. An empty state says what the place is and gives one next action; a filtered empty state names the query and offers a way to clear it.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `no-placeholder-copy`, floor: No placeholder copy ships: lorem ipsum, 'John Doe', 'Acme' and their kin.
- `no-invented-metric`, floor: A figure in the copy shaped like a claim ('10x faster', 'trusted by N', 'N% uptime') is confirmed by the owner or removed; the pattern flags it.
- `jsonld-honest`, floor: Structured data claims no rating, price or review that the page does not show.
- `typographic-glyphs`, finish: Visible text uses the ellipsis and curly quotes, not three dots and straight quotes.
- `error-copy`, reflex: An error message is not 'Oops' or 'Something went wrong' alone.
- `link-text-specific`, reflex: Link text names its destination, never 'click here' alone.
- `plural-rules`, reflex: Counts read correctly: no '1 members' or '0 member'.
- `intl-format`, reflex: Dates and numbers are formatted by Intl with a locale, not by hand.
- `style-stock-phrases`, reflex: Stock marketing words ('seamless', 'unleash', 'elevate') are a style default, waivable.
- `style-template-punctuation`, reflex: Middle-dot lists and trailing arrows as decoration are a style default, waivable.
