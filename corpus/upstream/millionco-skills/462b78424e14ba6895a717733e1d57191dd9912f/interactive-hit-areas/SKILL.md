---
name: interactive-hit-areas
description: Use when interactive elements that have visual spacing between them (chart bars/columns, list rows, nav items, segmented controls, tabs, calendar cells, icon buttons, legend chips) need hover or click to respond across the whole region with no dead zones. Triggers on "dead space", "deadspace", "gap between bars/items isn't clickable", "hover flickers between items", "have to aim precisely", "hit area too small", "highlight drops out between". Covers separating the hit area from the visual area, why gap/margin/space-between creates dead zones, and the flush-target + inner-spacing fix.
---

# Interactive Hit Areas

Separate the **hit area** (where pointer events land) from the **visual area** (what the user sees). Bugs happen when spacing is built so that the gap between items has no event handler — the pointer falls into a dead zone and hover/click does nothing or flickers.

## The core rule

**Visual spacing between interactive siblings must live INSIDE each hit target, never BETWEEN them.**

- WRONG: spacing via `gap`, `space-x`, or `margin` between the interactive elements. The space is empty DOM — no handler — so it's dead.
- RIGHT: interactive elements sit flush (no gap), each filling its full slot and carrying the handler; the visual element inside is made narrower/inset (padding, `max-width`, or a centered child) so it still *looks* spaced.

Result: the entire region is a continuous strip of live targets, but it looks identical to the spaced design.

## Symptom & detection

- Symptom: moving the pointer slowly between two items, the highlight blinks off in the space between them, or you must aim directly at the small visual element to trigger it.
- Detect: sweep the cursor horizontally/vertically across the whole component. If the active/hover state ever drops out while still inside the component's bounds, you have dead zones.
- The bigger the visual gap, the bigger the dead zone — so "nice airy spacing" makes it worse.

## The fix (general)

1. Identify the repeating slot (one item's full share of the axis — its *pitch*).
2. Make the interactive container fill that whole slot, flush against its neighbors (remove `gap`/`space-*`/`margin` between siblings; use `flex-1`/equal grid tracks).
3. Put the handler (`onMouseEnter`, `onClick`, `:hover`) on that full-slot container.
4. Recreate the visual spacing *inside*: center a narrower visual element (`max-width`, fixed width + `items-center`), or use `padding` on the container around full-bleed content. Padding is part of the element, so it stays a live target; margin/gap is not.

## React / Tailwind specifics

- Replace `gap-N` between hover/click items with `gap-0` (flush) and move the spacing inside each item (padding, or a centered child with `max-w-[Npx]`).
- Keep sibling rows that must stay column-aligned (e.g. bars and their labels/icons) on the **same gap setting** — if one row is flush and another has `gap`, their centers drift apart. Flush + `flex-1` on both keeps centers aligned.
- For lists/menus: put vertical rhythm as `py-*` on each row, not as `space-y-*` / `gap-*` between rows, when the whole row strip should be clickable.
- Accessibility tie-in: this is also how you hit the 24–44px minimum target size — grow the hit area with padding while keeping the glyph small.

## Worked example (bar chart)

Spaced bars where hovering anywhere over a bar's column highlights it:

```tsx
// Container: flush columns, NO gap — the whole width is live.
<div className="absolute inset-0 flex items-stretch">
  {bars.map((bar, i) => (
    <div
      key={bar.id}
      // flex-1 = one full slot/pitch; full height = hover above the bar too
      className="flex flex-1 flex-col items-center justify-end"
      onMouseEnter={() => setHovered(i)}
      onMouseLeave={() => setHovered(null)}
      style={{ opacity: hovered !== null && hovered !== i ? 0.4 : 1 }}
    >
      <span>{bar.value}</span>
      {/* visual spacing comes from the narrower CENTERED bar, not a gap */}
      <div className="w-full" style={{ maxWidth: 37, height: bar.value * UNIT }} />
    </div>
  ))}
</div>
```

Anti-pattern that caused the bug: `flex ... gap-2` with `w-full` bars. The bars touched their slots, so the only spacing was the 8px `gap` between columns — and that gap was dead to the pointer.

## When gaps between items ARE fine

Dead zones only matter when you want "anywhere in the region targets the nearest item." If items are meant to be discrete and the space between them is genuinely inert (e.g. cards on a page, unrelated buttons), `gap` is correct — don't force flush layouts everywhere. Apply this skill when the design intends a continuous interactive band with visual separation.
