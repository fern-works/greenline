# Responsive

Read this page when a change must hold across widths, inputs and devices, the phone above all.

## The rules you judge

1. The phone is a second composition, never the desktop shrunk: rewrite the line breaks, recrop pictures to portrait, keep one dominant thing on the first screen, with margins of 16 to 20 pixels, body text of 16 to 18 and targets at least 44 pixels high.
2. The wider layout holds until it stops fitting; breakpoints come from the content, and the smallest and largest sizes are tried first.
3. Branch on capability, hover and pointer, never on the device or its user agent: touch and mouse live together.
4. Viewport units follow the role: the dynamic height for an app's shell and anything pinned to the bottom, the small height for a first screen.
5. Name what the browser keeps for touch: vertical panning on a horizontal carousel, nothing only on a surface that owns every axis; prefer native scroll snapping.
6. An app's root stops overscroll and its inner scrollers contain it; a document keeps pull to refresh.
7. A site's phone navigation shows the wordmark and one action, its links in a full-screen sheet or the footer; on a desktop it takes no more than about a tenth of the first screen.
8. Real hardware is the bar: an older phone, the keyboard open, landscape once, the installed mode; a claim you could not check is marked unverified.
9. A safe-area inset of zero is valid, and an installed app that hides the browser's chrome gives its own way back.

## The web on iOS

Safari colours its bars from fixed or sticky elements spanning the edges, so set the top element's ground on purpose; a translucent status bar needs the top safe-area padding.

## Compose

Adapt to the window's size class and the space available, never to a device's name.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `viewport-device-width`, floor: The viewport meta sets width=device-width, never a fixed width.
- `reflow-320`, floor: At 320 CSS px the page does not scroll sideways and no text is clipped (WCAG 1.4.10); data tables scroll inside their own box.
- `full-height-unit`, reflex: A full-height block uses dvh or svh rather than 100vh on a phone.
