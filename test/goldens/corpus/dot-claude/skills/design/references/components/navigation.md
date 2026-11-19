# Navigation

Read this page when the change builds or changes a site's navigation, an app's sidebar or a tab bar.

- **On a site.** A wordmark, three to five text links and one action, taking no more than about a tenth of the first screen. A fixed bar never covers content at any scroll position, and only one element sticks to the top.
- **In an app.** A labelled sidebar of 210 to 292 pixels, rows with a 32 pixel target on a 34 pixel pitch, 16 pixel icons, a grey pill marking the active item, group labels in sentence case, counts only on queues that need action. Each item goes to another screen, never an anchor on the same one.
- **Landmarks.** Each navigation region has its own label, a skip link leads to the main region, and scroll padding matches any sticky header. After a route changes on the client, the title changes and focus moves to the new heading. The current page is marked, and no link is dead.
- **Variants to deal.** Edge-aligned, a floating pill, a masthead, a slab, a search-led bar, or a banner over a bar that retracts.
- **Responsive collapse.** On a phone, a site keeps the wordmark and one action, its links in a full-screen sheet behind a "Menu" button or in the footer; an app's sidebar folds into a 48 pixel top bar or a bottom bar of four or five destinations, and a sidebar wider than 30 percent of the phone fails.
- **Native.** One stack per tab with typed routes, reset when the account changes; in React Native the drawer becomes permanent at 768 pixels and wider; on a Mac every important action also lives in the menu bar.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `nav-uses-links`, floor: Navigation is done with links; a click handler that changes the URL sits on an anchor.
- `narrow-nav-cue`, floor: At 320, navigation items are not clipped without a cue such as a menu.
- `single-sticky-top`, reflex: Only one element sticks to the top edge.
