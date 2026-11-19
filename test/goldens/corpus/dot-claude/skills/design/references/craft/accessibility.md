# Accessibility

Read this page with every interface write: the floor rules below hold `done` when they fail, and the judgment rules apply to every change.

## The rules you judge

1. Walk every flow twice: with the keyboard alone, then with a screen reader, confirming each control's name, role and state.
2. Native elements come first, and a role is removed rather than added where the element already has one; a role is chosen by what the component is, and the role's word never goes into its name.
3. An automated score is not conformance: check 200 percent zoom, a high-contrast mode, reduced motion and a focus order that follows the visual order by hand.
4. A finding cites a WCAG A or AA criterion, or a task a person with assistive technology cannot complete; AAA criteria and larger touch targets are recommendations, and an established density stays.
5. A composite widget keeps one tab stop with a roving focus, or an active descendant where focus must stay in an input: Escape closes, the arrows move within, Tab moves between.
6. A field's error is tied to the field; an update not tied to a control goes to a polite status region, and an alert is kept for an urgent error tied to no field.
7. After a route changes on the client, the title changes and focus moves to the new heading or the main region.
8. Alternative text follows purpose: empty when decorative, the meaning when informative, the action when the image is a control.
9. Headings describe their sections and form an outline; a skip link comes first where chrome precedes the main region; help that repeats appears in the same place on every page.
10. Native disabled means truly unavailable; a control that must stay focusable, to explain why it is unavailable, is marked disabled for assistive technology instead.

## SwiftUI

Use the native accessibility tree, never web roles: labels, values, hints, traits, grouping and reading order.

## Compose

Use the semantics tree: an empty content description only for decorative content; test the TalkBack order and merged semantics.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `text-contrast-aa`, floor: Text meets WCAG 2 AA contrast: 4.5:1, or 3:1 for large text, which is 24px, or 18.66px at weight 700 or more.
- `contrast-nontext`, floor: A control's boundary, its focus indicator and a meaningful graphic reach 3:1 against what is next to them.
- `contrast-apca-advisory`, finish: The APCA contrast of text is reported beside the WCAG 2 ratio and never blocks.
- `contrast-both-schemes`, floor: Where the home declares a dark scheme, text contrast holds in both schemes.
- `focus-visible`, floor: Every focus stop shows a visible change when reached by the keyboard.
- `focus-outline-removed`, floor: An outline removed on focus is replaced by an outline, ring, shadow or border change under :focus-visible.
- `focus-ring-instant`, reflex: A focus indicator appears at once and is not faded in by a transition.
- `focus-not-obscured`, floor: A focused element is never wholly covered by a sticky or fixed layer.
- `keyboard-operable`, floor: A click handler sits on a button or a link, or on an element with a role, tabindex 0 and a key handler.
- `role-widget-keys`, floor: An element given a widget role such as button or tab also handles the keys its pattern needs.
- `control-named`, floor: Every control has a non-empty accessible name; an icon-only control carries a label.
- `label-in-name`, floor: The accessible name of a control contains its visible label (WCAG 2.5.3).
- `img-alt-present`, floor: Every img element has an alt attribute, empty when the image is decorative.
- `svg-decorative-hidden`, floor: An svg or canvas is either hidden from assistive technology or named.
- `aria-hidden-focusable`, floor: Nothing focusable sits inside an aria-hidden subtree.
- `aria-ref-resolves`, floor: aria-labelledby, aria-describedby and aria-controls point at ids that exist.
- `html-lang`, floor: The html element declares the page's language.
- `page-title`, floor: The page has a non-empty title (WCAG 2.4.2).
- `viewport-zoom`, floor: The viewport meta never disables zoom: no user-scalable=no and no maximum-scale under 2.
- `target-size-floor`, floor: A pointer target is at least 24 by 24 CSS px, unless the WCAG 2.5.8 spacing, inline, user-agent or essential exception holds.
- `target-size-touch`, reflex: Under a coarse pointer at 390, a target is at least 44 by 44 CSS px.
- `decorative-layer-intercepts`, floor: A decorative layer above a control never takes its clicks.
- `text-spacing-survives`, floor: With line-height 1.5, paragraph spacing 2em, letter spacing 0.12em and word spacing 0.16em applied, no text clips or overlaps (WCAG 1.4.12).
- `text-resize-200`, floor: At 200% text size no content is lost or overlapped (WCAG 1.4.4).
- `autoplay-muted`, floor: Media that autoplays is muted (WCAG 1.4.2).
- `captions-track`, floor: A video has a captions track (presence only; whether it has speech is judged).
- `flash-limit`, floor: Nothing flashes more than three times in any one second.
- `link-not-colour-only`, floor: An inline link differs from the text around it by more than colour: an underline, or 3:1 against the text.
- `drag-alternative`, reflex: A drag interaction has a single-pointer alternative (WCAG 2.5.7); the pattern flags it for review.
