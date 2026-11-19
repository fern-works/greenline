# Type

Read this page when a change sets or changes text: its faces, sizes, weights, spacing or measure.

## The rules you judge

1. Use few sizes, set well apart: body, small and display carry most pages; a lead and a heading size join only where needed, five is the ceiling, and two sizes that look nearly alike become one. On a desktop site the display size is at least four times the body.
2. Size carries hierarchy, not weight: emphasis inside a role is one weight step, never a new size, and when every line is bold nothing stands out.
3. Line height follows the role: display 0.85 to 1.1, headings 1.2 to 1.3, a lead 1.3 to 1.4, body 1.45 to 1.6 and looser for long reading. Check any line height under 1 by eye for descenders touching the next line.
4. Letter spacing tightens as size grows: display -0.02 to -0.05em, headings from 24px -0.01 to -0.02em, body 0, small capitals about 0.06em.
5. Set heading measure in `ch` so lines break where you mean them to: about 14ch for display, 20ch for a page heading, 40 to 52ch for a lead. Rewrite a break that leaves one word alone or splits a phrase.
6. One or two families, each with a fixed job; no third face for labels, numbers or quotes, and no two faces inside one headline. A serif over a sans reads as deliberate; two near-identical sans faces read as a mistake.
7. One size dominates each screen, and no section heading rivals the first screen's.
8. Light text on a dark ground drops a weight step or gains a little spacing and leading; weights 100 to 300 appear only at 28px and up.
9. A heading has at least twice as much space above it as below it.
10. A face drawn for display never sets body text, and no new typeface is proposed unless the change asks for one.

## SwiftUI

Use the system's text styles so text follows Dynamic Type, and try the largest sizes before adding truncation or fixed frames.

## Tailwind

Keep each heading level's classes in one component or in the base layer, never repeated at each use.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `prose-measure`, reflex: A paragraph's line holds 45 to 75 characters; over 88 is flagged.
- `body-size`, reflex: Running text is at least 16px on the site register and at least 13px in the app register.
- `text-under-11`, reflex: No readable text is set under 11px.
- `input-font-16`, reflex: On a phone an input's text is at least 16px, which keeps the browser from zooming.
- `tight-leading`, reflex: Running text over two lines has a line height of at least 1.3.
- `heading-levels`, reflex: Heading levels descend without skipping.
- `one-h1`, reflex: A page has exactly one h1.
- `family-count`, reflex: A page uses at most three type families.
- `font-loaded`, reflex: Every declared face and used weight is loaded, not synthesised.
- `font-display`, reflex: @font-face declares font-display.
- `headline-two-lines`, reflex: A headline wraps to at most two lines at every width.
- `caps-tracking`, reflex: Uppercase text is tracked at least 0.06em.
- `heading-balance`, finish: Large headings set text-wrap: balance or pretty.
- `font-drift`, reflex: A face the code uses is one the home declares.
- `size-drift`, reflex: A font size the code uses is on the home's ramp, within 0.5px.
- `user-select-root`, reflex: Text stays selectable: no user-select:none on html, body or a text container.
- `style-default-face`, reflex: A stock display face (Inter, Roboto, Arial and their kin) is a style default, waivable.
- `style-eyebrow`, reflex: A small tracked label above a heading is a style default, waivable.
- `style-numbered-labels`, reflex: Ornamental 01/02/03 section numbers are a style default, waivable.
- `style-mono-costume`, reflex: Monospace outside code and data is a style default, waivable.
- `flat-type-scale`, finish: Adjacent sizes in the type scale differ by at least 1.25.
