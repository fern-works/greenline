---
name: reconcile-paper-sync
description: Use when a built app that was derived from a Paper design looks "slightly off" versus the design, or to verify a Paper-to-code implementation against its source. Covers using a local paper-sync project as the canonical oracle, porting the real fonts, extracting exact type/color/spacing values from canonical frames, and screenshot-diffing the running app against the paper-sync `?preview#<frame>` render.
---

# Reconcile a Built App with paper-sync

You make a running app match the Paper design it was built from, using the project's `paper-sync` output as the canonical reference render.

This is the verification-and-repair phase that follows `paper-to-code-components`. The conversion produces maintainable code; this skill confirms the result still looks like the design and closes the gaps where it drifted.

## When this applies

- A Paper-derived app (e.g. a Next.js site) renders close to the design but "slightly off."
- A `paper-sync` project exists (a `.paper-sync/<fileId>/` directory and usually a dev server such as `localhost:6006`).
- You want to verify a fresh Paper-to-code implementation before calling it done.

If there is no paper-sync project, fall back to the Paper screenshot as the oracle and apply the same method.

## RED/GREEN Intent

This skill prevents these reconciliation failures:

- Declaring parity from reading code instead of comparing rendered pixels
- Leaving the app on `system-ui`/Geist/Georgia fallbacks while the design uses real licensed fonts
- Collapsing the design's several typefaces into one font token
- "Fixing" a difference that is actually newer design work in paper-sync by inventing data to match it
- Dropping small decorations (code-chip backgrounds, hairlines, dashed outlines, badges) during conversion and never noticing

GREEN outcome: the running app, screenshotted at the frame's width, matches the paper-sync render on typeface, type scale, color, spacing, and per-element decoration — and any remaining differences are explicitly attributed to newer design iterations, not conversion bugs.

## 1. Find the paper-sync canonical

paper-sync mirrors the Paper file into the repo. For each Paper file it keeps:

1. `.paper-sync/<fileId>/.canonical/*.tsx` — the **verbatim** Paper export per frame, the source of truth for exact values. Frame files are named `page-1--frame-<id>-0.tsx` and carry a header comment with the Paper URL (`.../<FILE>/1-0/<FRAME>`).
2. `.paper-sync/<fileId>/paper.css` — `@font-face` declarations and the design's CSS.
3. `.paper-sync/<fileId>/public/paper-assets/fonts/*.otf` — the real font files.
4. A dev server with a preview route: `?preview#<FRAME>` renders a single frame alone (the frame id is the uppercase hash, e.g. `N66-0`).

Map the frame you are reconciling to its canonical file by matching visible text (`grep -l "We introduce React Bench" .canonical/*.tsx`). The on-disk `.canonical` can lag the running server; trust the live `?preview#<frame>` render for what the user sees, and the canonical `.tsx` for exact numeric values.

## 2. Fonts first — the biggest lever

Substituted fonts are the most common cause of "slightly off." Do this before chasing spacing.

1. List the families the canonical frame uses: `grep -ohE "font-\['[^']+'" <frame>.tsx | sort | uniq -c | sort -rn`. Expect several distinct families by role (body, serif display, UI/label, numeric/mono, code).
2. For each family, confirm the app self-hosts the real font via `@font-face` and maps it to its own token. If it instead falls back to Geist/Georgia/system, that is the bug.
3. Port any missing fonts from `public/paper-assets/fonts/*.otf` into the app (e.g. `public/fonts/`), add `@font-face` per weight/style, and point each token at the real family with the system stack only as fallback. Keep distinct typefaces as distinct tokens — do not collapse them.

See `paper-to-code-components` §8 for the porting rules.

## 3. Extract exact values from the canonical

The `.canonical/*.tsx` holds the real numbers. For any element that looks off, read its canonical class list and match:

1. Type: `text-[15px]/6` is 15px / line-height 24px; replicate size AND line-height, not just size.
2. Color: `color(display-p3 ...)` and hex — keep the exact gamut/value.
3. Decoration: backgrounds, borders, dashed outlines, underlines, radii, small markers.

Do not read sizes or colors off a screenshot when the canonical source is available.

## 4. Screenshot-diff the running app against the frame

1. Render both at the same width. A headless browser screenshot works without installing Playwright: drive a cached Chromium, e.g. `chrome-headless-shell --hide-scrollbars --force-device-scale-factor=2 --virtual-time-budget=6000 --window-size=<w>,<h> --screenshot=out.png <url>`. Allow time for `@font-face` to load before the shot.
2. Capture the app (`localhost:3000`) and the frame (`localhost:6006/?preview#<FRAME>`), then compare side by side.
3. Reconcile element stacking order (e.g. nav above vs below a header band), content width and text measure (same paragraph → same line count?), typeface, type scale, color, spacing, and every decoration. A flow/responsive layout will not be pixel-identical to absolute Paper coordinates — judge structural, typographic, and decorative fidelity, not coordinate equality.

## 5. Separate conversion drift from version drift

A difference has two possible causes; treat them differently:

- **Conversion drift** — the app dropped or substituted something the source frame has (a font, a code-chip background, a hairline). Fix it to match.
- **Version drift** — the paper-sync frame is a newer design than the export the app was built from (the frame header date / frame id differs; new elements like error bars or bullets appear that need data the app does not have). Do NOT invent data to fake it. Flag it to the user and let them decide whether to re-sync the app to the newer frame.

State which differences you fixed and which you attributed to a newer frame.

## Escape Hatches Closed

| You Think | Do This Instead |
|---|---|
| "The code matches the design, so it's fine." | Screenshot the build against the paper-sync frame and compare pixels. |
| "The font has a `system-ui` fallback, that's close enough." | The fallback is not the design. Self-host the real `.otf` from `public/paper-assets/fonts` and `@font-face` it. |
| "I'll match the new error bars / bullets in the frame." | Check the frame date/id first. If it's newer than the built export, that's version drift — flag it, don't invent data. |
| "I'll eyeball the sizes from the screenshot." | Read exact `text-[..]/..` and `color(display-p3 ..)` values from the `.canonical/*.tsx`. |
| "No Playwright installed, so I can't screenshot." | Drive a cached `chrome-headless-shell` with `--screenshot`; no install needed. |

## Before Marking Complete, You MUST:

1. Identify the canonical frame (file id + frame hash) the app section corresponds to
2. Confirm every typeface the frame uses is self-hosted via `@font-face` and mapped to its own token — no design text left on a fallback font
3. Match exact type size + line-height, colors, and decorations from the `.canonical/*.tsx`, not from a screenshot
4. Screenshot the running app against `?preview#<frame>` at matched width and reconcile the differences
5. Classify each remaining difference as conversion drift (fixed) or version drift (flagged to the user)
6. Re-run the app's `lint`/`build` after changes and report the screenshot comparison
