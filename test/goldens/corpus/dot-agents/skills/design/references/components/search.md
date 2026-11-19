# Search

Read this page when the change builds or changes a search box, a filter field or a command palette. No source covers search alone; these rules gather what several do.

- **Suggestions.** A search box with a suggestion list keeps focus in its input and points to the active option; the arrows move the highlight, Enter picks, Escape closes, and the first row is highlighted on opening.
- **Sizes.** A search field in a toolbar is 30 to 36 pixels tall; in a top bar it sits centred with a hint of its shortcut. A command palette opens no taller than the smaller of 440 pixels or about three quarters of the viewport.
- **Pace.** Input is debounced, about a quarter of a second; the count of results and the loading state go through a polite status region, such as "12 results".
- **No results.** The empty result names the query and offers to clear the filters.
- **Focus.** A wrapper around the field lights up while the field inside it has focus.
