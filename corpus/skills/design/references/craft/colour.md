# Colour

Read this page when a change sets or changes colour: a palette, a token, a fill, a border or a status.

## The rules you judge

1. A colour system is ramps, not picked swatches: one neutral ramp, one accent ramp, and only the status ramps the product shows; every step serves a named role. A second accent hue joins only where two things must be told apart at a glance.
2. Decide the shares before colouring: the ground takes 70 to 90 percent of the page and the accent less than 5 percent of any screen; the accent marks the action and at most one other recurring thing, and headings stay in ink.
3. Each view has one filled primary action, its colour on the fill rather than the label.
4. Primitives are named by hue and never used in components; semantic tokens are named by their job, and no token is borrowed because its value fits today.
5. A ramp keeps one hue end to end and is built with a colour library, not by eye, its steps finer at the light end; a new system starts in OKLCH, and an existing one keeps its notation.
6. A raised surface is one tone step from its ground; add space before a second tone, and never nest panels.
7. A contrast fix changes lightness, never hue, and the pair is measured as it renders, alpha and what lies beneath included.
8. Neighbouring colour fields differ in lightness, not only hue, and each field has its own ink.
9. Warmth comes from low-chroma grounds, deep inks or photographs, never from beige; a colour the brand owns is kept and noted even where a default would avoid it.
10. Where photographs carry the colour the interface stays neutral, and photographs are never tinted with the brand.

## Tailwind

White text on a `500` fill often fails 4.5:1; move the fill to `600` and measure again.

## SwiftUI and Compose

Take colours from the system's semantic colours or the theme, never literals in a view.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `tokens-not-raw`, reflex: Components use the home's tokens; a raw colour or length where a token exists is drift.
- `colour-drift`, reflex: A colour the code uses is one the home declares, within 6 per channel.
- `gamut-fallback`, reflex: An oklch colour beyond sRGB is preceded by an sRGB value.
- `status-hue-accent`, reflex: A status hue sits at least 15 degrees from the accent.
- `style-gradient`, reflex: A gradient fill on a large box, a button or text is a style default, waivable.
- `style-purple-default`, reflex: The stock violet and indigo accents are a style default, waivable.
- `style-cream-terracotta`, reflex: Cream ground with a terracotta accent is a style default, waivable.
- `style-glass`, reflex: More than one backdrop-blurred layer is a style default, waivable.
- `style-glow`, reflex: A coloured glow or radial wash is a style default, waivable.
- `meta-description`, finish: A page has a meta description and its social image is absolute.
