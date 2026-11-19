# Dark mode

Read this page when the home declares a dark scheme, or a change adds one.

## The rules you judge

1. Every surface, text and border token has a dark value; no one-off colours and no raw white or black in components.
2. The dark palette is derived, never the light ramp reversed: lower the accent's chroma, widen the dark end, and measure every pair again.
3. The ground is a deep tinted tone and the ink a soft light, not pure white on pure black unless the direction wants stark two-tone on purpose.
4. Depth comes from lighter surface steps and rings, not shadows or glows; borders sit around white at a low alpha.
5. Semantic colours are a little desaturated, and type a little lighter in weight than on a light page.
6. Nested surfaces use alpha so the layers stay visible; a surface that must hide what lies behind it, a dialog, a popover or a sticky header, is opaque.
7. One switching mechanism, the media query or a class, never both; increased-contrast overrides are set for each scheme.
8. The theme colour is set per scheme to the colour at the top of the page, and a class-based switch updates it from script.

## Tailwind

Pair each token with its dark variant in one place, never at each use.

## SwiftUI and Compose

Use the semantic colours and the theme, and test the dark theme on the device.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `dark-scheme-declared`, reflex: A page with dark rules declares color-scheme dark for them.
