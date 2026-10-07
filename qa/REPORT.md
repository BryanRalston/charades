# Charades v1 QC

Local static server only. No GitHub repo, push, or Pages site was created. Publishing is a later step.

- Page: http://127.0.0.1:8765/
- Server: `python -m http.server 8765 --bind 127.0.0.1` from `C:\Users\bryma\dev\charades`
- Browser: headless Chrome, driven by `qa/headless_qc.mjs` over the DevTools protocol
- Result: 44 checks passed after the decks were expanded. Console events: none. No 402 or 429.
- Shuffle check: `node qa/shuffle_check.mjs` passed 28 checks. A round's cards were unique and not in list order, the next round did not repeat them, and Reshuffle held back the most recent 24.

`sw.js`, `manifest.webmanifest`, `icon-192.png`, and `icon-512.png` each returned HTTP 200.

## Checklist

| Check | Result |
| --- | --- |
| Local page loads | Pass |
| Headings and category names match the brief | Pass |
| Each category has at least 40 prompts | Pass |
| Face-down tilt scores Correct once | Pass |
| Face-up tilt scores Pass once | Pass |
| A second event in the same tilt does not score | Pass |
| The phone must return to neutral, then wait 600ms | Pass |
| Landscape-right uses the flipped gamma mapping | Pass |
| Timer counts down, pulses in the last 10 seconds, and ends the round | Pass |
| Score, turn, round length, and category survive a refresh | Pass |
| Tap to start is on the page and calls `requestPermission` | Pass |
| Empty category offers Reshuffle | Pass |
| Console errors | 0 |

## What the page shows

Headings, in order: Christian, Classic, Mix.

Category buttons under those headings, in order, with the prompt count in the page:

| Heading | Category | Prompts |
| --- | --- | --- |
| Christian | Bible Characters | 130 |
| Christian | Bible Stories | 130 |
| Christian | Miracles & Parables | 120 |
| Christian | Christmas & Easter | 126 |
| Christian | Church Life | 120 |
| Christian | Bible Animals | 111 |
| Christian | Bible Places & Things | 124 |
| Classic | Actions | 130 |
| Classic | Jobs | 124 |
| Classic | Sports | 117 |
| Classic | Animals | 118 |
| Classic | Chores | 112 |
| Classic | Movies | 180 |
| Classic | Everyday Objects | 136 |
| Classic | Foods | 124 |
| Classic | Outdoor Fun | 122 |
| Mix | Mix | 2024 cards drawn from the 16 lists |

Mix is a heading plus one button labeled Mix. It has no list of its own. A Mix game deals from all 2024 category-and-prompt cards and still skips any card already used in that game.

Each new card is drawn at random from the prompts not yet guessed or passed. When a category, or the whole mix, is used up, Reshuffle returns the older cards and holds the most recent 24 out, so the cards just played do not come back immediately. If 24 or fewer were used, they all return.

## Tilt run

The test fixed `screen.orientation.angle` and dispatched `deviceorientation` events. Positive tilt means the screen has turned face-down from upright.

Landscape-left (angle 90), Actions, 30-second round:

- Upright, beta 0 / gamma 90, is neutral.
- A 10° face-down tilt (beta 180 / gamma -80) did not score.
- A 40° face-down tilt (beta 180 / gamma -50) scored once, flashed green, and advanced the prompt. The same pose sent again did not score.
- Face-up (beta 0 / gamma 50) did not count until the phone had been upright again.
- Face-up sent inside 600ms did not count. After 750ms it counted once as a pass, flashed orange, and did not add a point. Holding that pose did not advance again.

Landscape-right (angle 270):

- Face-down (beta 180 / gamma 50) scored one correct.

Arrow down also scored one correct. The round then reached 0 by itself. The recap listed the guessed and passed prompts, showed Team 1 scored 3, total 3, and set the next turn to Team 2.

After reload, Team 1 was still on 3, the turn was still Team 2, the round length was still 30, and Actions was still selected.

With every Actions prompt marked used, Tap to start showed "No prompts left in this category." Reshuffle dealt an Actions prompt again.

In a 420×800 portrait viewport the countdown showed the overlay text "Rotate your phone".

## Screenshots

- `qa/01-setup.png` — headings, categories, and Tap to start
- `qa/02-play.png` — prompt and timer
- `qa/03-correct.png` — green face-down flash
- `qa/04-pass.png` — orange face-up flash
- `qa/05-urgent.png` — timer in the last 10 seconds
- `qa/06-recap.png` — guessed, passed, and the new total
- `qa/07-refresh.png` — score 3 and Team 2 still up after reload
- `qa/08-portrait.png` — rotate overlay
- `qa/09-empty.png` — category exhausted
- `qa/10-reshuffle.png` — a prompt dealt again

Raw check output is in `qa/results.json`. The run is `node qa/headless_qc.mjs` while the static server is up.
