# Performance

Read this page when a change animates, loads media or fonts, or makes a page feel slow.

## The rules you judge

1. Name the cause before changing code, in this order: which properties animate; whether the page is busy during the motion; a render every frame; a slowdown that grows with content, such as an inherited custom property; an animated custom property; a blur over 20 pixels; and only then a will-change hint.
2. The budget is the 8 millisecond frame of a 120 hertz screen on a mid-range phone; a fast laptop proves nothing.
3. Swap to a cheaper property: scale for size, translate for position, opacity for showing and hiding, a drop shadow for a box shadow, and a measured flip for a true resize.
4. Batch the reads of layout before the writes.
5. Motion that plays while the page navigates or hydrates moves to CSS or the Web Animations API.
6. Record each measurement's build, viewport, device, throttling and cache; keep mobile and desktop apart, and field and lab apart; report the median of three runs; label a measured value, a tool's estimate and a hypothesis differently.
7. A budget of about 300 KB of script and 100 KB of styles is a starting point; the project's own number wins.
8. Remove a resource only after its owner and its use are confirmed; a tool's estimate of zero savings proves nothing.
9. An animated blur stays under 20 pixels; 2 to 5 pixels is enough for a crossfade.

## React

Write motion to a ref's style or a motion value, never to state each frame.

## React Native on iOS

A high-refresh screen stays at 60 frames a second until the app opts into the higher rate.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `img-dimensions`, reflex: An image reserves its space with width and height or an aspect ratio.
- `lcp-not-lazy`, reflex: The largest first-screen image is not lazy-loaded.
