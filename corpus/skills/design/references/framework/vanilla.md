# Plain CSS

Read this page when the manifest's frameworks name the plain style layer, vanilla CSS. It holds interface mechanics only.

- **Support.** Ship what both WebKit and Blink support, gate newer features behind feature queries, and treat a feature one engine lacks as optional.
- **Native first.** Real HTML elements before roles; gap, inset, aspect ratio, the dynamic viewport height, logical properties, container queries, sticky positioning and scroll snapping.
- **Colour.** OKLCH, colour mixing and light-dark values with a declared colour scheme.
- **Popovers.** The popover attribute with anchor positioning replaces a simple floating menu; give the anchor a name and point the popover at it.
- **Entrances.** Starting styles with discrete transitions, entering in about 300 milliseconds and leaving in about 150; reveals driven by scrolling sit under a no-preference reduced-motion query.
