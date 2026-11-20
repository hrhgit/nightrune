# Web polish: a tall board for phones, and a cheaper frame

Measured on 2026-11-19 against `origin/main` at `837c784` ("before") and this branch ("after").
There is no issue for this change: the author asked for it directly.

## What a phone shows

`npm run scenes` (36 screenshots: 12 scenes × desktop 1280×800, phone 375×812 @2x, phone with reduced motion), run on both.

| Viewport | Smallest text on the board, before | after | Smallest text on a hand card, before | after | Clipped text | Console errors |
|---|---|---|---|---|---|---|
| desktop | 12.4 px | 12.4 px | 11.3 px | 11.3 px | 0 → 0 | 0 → 0 |
| phone | 4.1 px | 8.9 px | 7.7 px | 7.7 px | 0 → 0 | 0 → 0 |
| phone, reduced motion | 4.1 px | 8.9 px | 7.7 px | 7.7 px | 0 → 0 | 0 → 0 |

- On the phone the smallest board text is a line stone's name. After: names 8.9 px, effect text 11.9 px, slot numbers 10.4 px. Before: 4.1, 5.5 and 4.8 px.
- The overlapping text the report lists is the same set in every viewport, before and after: the animated "Blocked N", "fizzles", "+N" and "copy" labels drawn over a stone or a slot number.
- `phone-before.png` and `phone-after.png` are the `full-lines` scene from those two runs. `phone-game-striking.png` is the game page at 375×812 @2x during round 1 of seed 7.
- The scene page has 24 px side padding and the game page 16 px, so in the game the phone board is 343 px wide instead of 327 px, and everything on it is 5% larger than the scene numbers above.

In the game page at 375×812 (built files, driven by a script: tap a hand card, tap slot 2, tap "Fight round 1", wait for round 2):

| | before | after |
|---|---|---|
| Board on screen | 343×193 px | 343×413 px |
| A slot to tap | 37×34 px | 81×73 px |
| A hand card | 80×80 px | 80×80 px |
| Where the board starts (the header is three rows before, two after) | y = 165 px | y = 111 px |
| Bottom edge of the "Fight round" button | 598 px | 752 px |
| Page height | 956 px | 1110 px |
| Page scrolls sideways | no | no |

The cost of the tall board is height: the page is 154 px longer, and the "Fight round" button, which used to end 214 px above the bottom of an 812 px screen, now ends 60 px above it. On a shorter screen the player scrolls to reach it. The player's line (y = 439 to 512 px) and the hand (from y = 599 px) are next to each other.

The round played through on the phone layout with no page errors and no console errors or warnings; the hint, the slot's label ("Slot 2, Parry") and the status line ("Round 2. Energy 3. You 27 HP, Training Dummy 24 HP.") came from the page.
One page resized through 1440, 1000, 760, 690, 375, 320 and back to 1440 px wide took, in order: wide with the hand in the tray, the same, wide with the hand below (712 px), tall (480×578 px, centred), tall (343×413 px), tall (288×347 px; a slot is 68×62 px), and wide with the hand in the tray again, with no errors.

## What a frame costs

A one-off script, not in the repository, loaded both builds from disk in headless Chrome 157 on an Apple M2 Mac; `compare.json` is its output. It timed each animation-frame callback of the game page, which draws the whole board, plus a one-pixel read-back that makes the browser finish drawing before the clock stops. Each number is the median of 200 frames; the three numbers are three page loads. Seed 7, opening position, motion on.

| Viewport | Canvas pixels, before | after | ms per frame, before | after |
|---|---|---|---|---|
| phone 375×812 @3x | 2880×1620 (4.67 MP) for a 343×193 px board | 1029×1239 (1.27 MP) for 343×413 px | 63.5, 61.6, 60.4 | 5.1, 5.5, 5.6 |
| phone 375×812 @2x | 1920×1080 (2.07 MP) | 686×826 (0.57 MP) | 29.1, 28.6, 29.5 | 4.2, 4.8, 3.6 |
| desktop 1280×800 @1x | 960×540 (0.52 MP) | 912×513 (0.47 MP) | 9.9, 10.2, 10.6 | 4.2, 4.3, 4.0 |
| desktop 1440×900 @2x | 1920×1080 (2.07 MP) | 1904×1071 (2.04 MP) | 32.0, 31.0, 31.3 | 7.3, 7.5, 7.5 |

- Two things changed. The canvas now has the pixels it shows on screen, where it used to have 960×540 times the pixel ratio whatever its size on screen. And the sky, moon, trees and ground are painted once into two layers and copied each frame; before, every frame painted them again, with three gradients over the whole board.
- The last row is nearly the same number of pixels before and after, so its drop is the layers alone.
- No canvas was created during the 200 timed frames in any run (`canvasesCreatedDuring200Frames` is 0), so the layers are not repainted while the picture animates.
- Not measured: a real phone, Safari, Firefox, battery use. Headless Chrome on a laptop is not a phone's GPU; the numbers compare the two builds on one machine and say nothing about frame rate on a device.

## The wide picture did not change

At a 1008 px viewport and pixel ratio 1 the scene page's board is exactly 960×540 pixels in both builds, so any difference is in the drawing code. Five scenes, each with motion and with reduced motion (10 pairs of 518,400 pixels, raw canvas pixels compared channel by channel):

- at most 60 pixels differ by more than 1 level of 255 in any pair, at most 30 by more than 4, and the largest difference is 26 levels (an earlier run of the same comparison had one pair with 179 pixels over 1 level);
- the pixels over 4 levels are on the rim of the moon. That is how the circle's edge is smoothed on the layer compared with on the page's canvas (the author's reading of where they are; the cause is not verified).

The first comparison found two real differences, both fixed before this was written: the tree on the right edge had taken seeded numbers where it used to take the middle values, and the second curve of a strike bent 4 board units lower than before. `tests/layout.test.ts` now pins the wide strike path to its old numbers.

## What is checked, and what is not

- Checked by `tests/layout.test.ts` in `npm run check`: in both layouts nothing is outside the board, no stone sits on another stone, a number disc or an HP plaque, every strike runs from the attacking stone to the defending stone to the defending figure, the fit thresholds, and a slot of at least 44 CSS px each way at every width from 320 px.
- Measured, not gated: text size on screen (`npm run scenes`).
- Not checked: how the tall board feels to play by touch on a real device; the screenshots were looked at by the agent, not by a person.

Code and this note were written by Claude Code under the author's direction.
