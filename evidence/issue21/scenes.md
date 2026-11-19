# Issue #21: card faces show their effect text

Screenshots from `npm run scenes` (desktop viewport, 1280×800), after the change:

- `full-lines.png`: every slot filled at level 3, plus Slash and Parry in the hand. Parry level 3
  ("Blocks 9 damage from the opposing slot only.") wraps to three lines on the line stones
  (104×94, the smallest stone) and in the hand; the 9 is drawn in weight 700 and the defense color.
  Enemy Straw Swing stones show their text and no cost gems. No top-right medallion.
- `echo-after-whetstone.png`: the Slash grown by 1 reads "Deals 5 damage to the opposing slot."
  with 5 highlighted; the Echo's text has no highlighted part.
- `parry-block.png`: while an impact animates, its "Blocked 3" label is drawn over the stone and
  covers the effect text under it until it fades. The "fizzles" label does the same
  (`whetstone-fizzle` scene). The labels were placed before this change; they used to cover the rune.

What `npm run scenes` reported for the card text (36 screenshots, 3 viewports, no errors):

- No card text is clipped, and no card text overlaps its stone's name.
- The overlaps it lists are between card text and the animated "Blocked N" and "fizzles" labels
  above, plus "+1"/"copy" labels over slot numbers, which this change does not touch.
- Card text size on screen, desktop viewport: 11.4 px on line stones, 10.4 px on hand cards
  (Parry) and 10.4 px on full-lines' Slash. On the 375 px phone viewport line-stone text is
  3.7–4.1 px, at the board scale that already draws stone names at 4.1 px there; hand cards below
  the board show 7.1 px. The script lists text under 12 px as small; it does not fail on it.

The fit is checked in CI by `tests/card-face.test.ts`, which measures each wrapped line with the
advance widths from the Alegreya Sans font files the page loads.
