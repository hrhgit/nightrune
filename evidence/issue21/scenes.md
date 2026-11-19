# Issue #21: card faces show their effect text

Screenshots from `npm run scenes` (desktop viewport, 1280×800), after the author's change on 2026-11-19: the face shows a short phrase (`Deal 9`, `Block 9`, `Next card +2`, `Copy previous card`); the aria-label and the log keep the full sentence.

- `full-lines.png`: every slot filled at level 3, plus Slash and Parry in the hand. The number is drawn in weight 700 and its effect's color. Enemy Straw Swing stones show their phrase and no cost gems. No top-right medallion.
- `echo-after-whetstone.png`: the Slash grown by 1 reads `Deal 5` with 5 highlighted; the Echo's phrase has no highlighted part.
- `parry-block.png`: while an impact animates, its "Blocked 3" label is drawn over the stone and covers the phrase under it until it fades. The "fizzles" label does the same (`whetstone-fizzle` scene). The labels were placed before this change.

What `npm run scenes` reported (36 screenshots, 3 viewports):

- No console errors, no clipped text, and no card text overlaps its stone's name.
- The overlaps it lists are between card text and the animated "Blocked N" and "fizzles" labels, plus "+1"/"copy" labels over slot numbers, which this change does not touch.
- Card text size on screen: on the desktop viewport no card phrase is under 12 px (the shorter phrase let the size cap rise from 12 to 16 board px). On the 375 px phone viewport line-stone phrases are 5.5–6.8 px (they were 3.7–4.1 px as sentences); the whole board is scaled down there, and a phone layout is a separate ticket. Hand cards below the board show 9.5 px.

The fit is checked in CI by `tests/card-face.test.ts`, which measures each wrapped line with the advance widths from the Alegreya Sans font files the page loads.
