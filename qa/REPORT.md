# Charades v1 QC

Live GitHub Pages site. The public repo is https://github.com/BryanRalston/charades. Pages is built from `main` at `/`.

- Page: https://bryanralston.github.io/charades/
- Browser: headless Chrome, driven by `qa/headless_qc.mjs` over the DevTools protocol
- Command: `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs`
- Result: 44 checks passed. Console events: none. No 402 or 429.

Prompt counts below were read from the live page source. Headings and category names were read from the rendered live page.

These live responses were HTTP 200:

| URL | Content type |
| --- | --- |
| https://bryanralston.github.io/charades/ | text/html |
| https://bryanralston.github.io/charades/sw.js | application/javascript |
| https://bryanralston.github.io/charades/manifest.webmanifest | application/manifest+json |
| https://bryanralston.github.io/charades/icon-192.png | image/png |
| https://bryanralston.github.io/charades/icon-512.png | image/png |

## Checklist

| Check | Result |
| --- | --- |
| Live page loads | Pass |
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

Headings, in order, as rendered: Christian, Classic, Mix.

Category buttons under those headings, in order, with the prompt count in the live page:

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

The test fixed `screen.orientation.angle` and dispatched `deviceorientation` events on the live page. Positive tilt means the screen has turned face-down from upright.

Landscape-left (angle 90), Actions, 30-second round:

- Upright, beta 0 / gamma 90, is neutral.
- A 10° face-down tilt (beta 180 / gamma -80) did not score.
- A 40° face-down tilt (beta 180 / gamma -50) scored once, flashed green, and advanced the prompt. The same pose sent again did not score.
- Face-up (beta 0 / gamma 50) did not count until the phone had been upright again.
- Face-up sent inside 600ms did not count. After 750ms it counted once as a pass, flashed orange, and did not add a point. Holding that pose did not advance again.

Landscape-right (angle 270):

- Face-down (beta 180 / gamma 50) scored one correct.

Arrow down also scored one correct. The round then reached 0 by itself. The recap listed guessed prompts Patting Head, Brushing Teeth, and Hopping, and the passed prompt Blowing Kiss. It showed Team 1 scored 3, total 3, and set the next turn to Team 2.

After reload, Team 1 was still on 3, the turn was still Team 2, the round length was still 30, and Actions was still selected.

With every Actions prompt marked used, Tap to start showed "No prompts left in this category." Reshuffle dealt an Actions prompt again (Reading Book).

In a 420×800 portrait viewport the countdown showed the overlay text "Rotate your phone".

## Screenshots

Taken from the live page during this run:

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

Raw check output is in `qa/results.json`.

## Tilt fix

This section is the live re-test after the landscape-tilt fix. The checklist and counts above are the earlier Pages run and are left as history. The poses in that earlier tilt run used the mirrored gamma values, which is why they passed on a phone that did not tilt.

### Root cause

`screen.orientation.angle` is measured counter-clockwise. At angle 90 the phone's +x side points up. The old mapping used the opposite sign (`sy = -upX` at 90, `sy = upX` at 270), so an upright phone read about +/-180°. The neutral gate never reset. The first card could pass on its own, and later tilts did nothing. Buttons still worked.

### What changed

- Landscape tilt now uses `sy = upX` at angle 90 and `sy = -upX` at angle 270. Upright reads 0. Face-down reads positive and counts as correct. Face-up reads negative and counts as pass. That sign matches the on-screen help.
- Each round averages the first 300ms, at least 5 readings, as neutral, and clamps that neutral to +/-50°. A move of 35° from neutral scores. The phone must return within 15°, and 600ms must pass, before another tilt scores. Calibration readings do not score.
- `deviceorientation` is listened for on `window`, with no feature-detect gate. Null beta/gamma events are ignored. If no usable orientation event arrives within about 1s of play, `devicemotion` `accelerationIncludingGravity` is used as the same up vector. If both arrive, orientation wins.
- Tap to start calls `DeviceOrientationEvent.requestPermission()` and `DeviceMotionEvent.requestPermission()` synchronously, before any other work in that tap. Listeners attach only after a grant. Browsers without that API attach on load. A denial still starts the round and leaves the buttons working. The grant is not stored.
- A status pill during the countdown and the round says "Tilt on" while a usable sensor event arrived in the last second, and "Tilt off, use buttons" otherwise.
- `?debug=1` shows beta, gamma, screen angle, up.z, pitch, neutral, delta, source, permission, events per second, and the last trigger. Without the flag the readout stays hidden.
- The yellow "Rotate your phone sideways" note hides in landscape. The portrait "Rotate your phone" overlay is unchanged.
- Service worker cache is `charades-v3`. Navigations and `index.html` are network-first with cache fallback. `skipWaiting()` and `clients.claim()` stay in place.
- Prompt lists were cleaned so Mix does not repeat a card. Filler that read like a clue was removed from Bible Stories, Miracles & Parables, and Christmas & Easter. Reworded duplicates were collapsed to the first listed card, including The Prodigal Son, which was already the named card. Dinah was removed, along with names and objects that are hard for kids to act: Othniel, Bezalel, Jochebed, Asa, Jehoshaphat, Manasseh, Ephraim, Obadiah, Phoebe, Apollos, Aquila, Melchizedek, Red Heifer, Mercy Seat, and Hyssop Branch. Movies lost Turning Red, Lightyear, Strange World, Hotel Transylvania, Bedknobs and Broomsticks, Shrek, Shrek 2, Shrek the Third, Shrek Forever After, Fantasia, and The Karate Kid. Fantasia 2000 stayed.
- Where the same prompt was in two categories, the earlier category in the page kept it. That dropped 18 later copies, including Red Sea, Olive Branch, Balaam's Donkey, Upper Room, Empty Tomb, Bethlehem Star, and Wise Men from the later list, Fig Tree from Bible Places & Things, Whale, Horse, Frog, Pig, and Dog from Animals, Blowing Bubbles, Walking Dog, Bowling, and Ice Skating from the later list, and Jump Rope from Outdoor Fun.
- Miracles & Parables needed 12 added cards to stay at 100: Wedding at Cana, Official's Son, Peter's Mother, Bent Woman, Two Blind Men, Leper Healed, Servant Healed, Great Catch, Five Loaves, Two Fish, Bread Multiplied, and Cana Wedding.

### Live page

Pages build for `ba88605` reached status `built`. These responses were HTTP 200, and the bodies contained `charades-v3`, `Tilt off, use buttons`, and `debug`:

- https://bryanralston.github.io/charades/
- https://bryanralston.github.io/charades/sw.js

Headings on the live page, in order: Christian, Classic, Mix.

| Heading | Category | Prompts |
| --- | --- | --- |
| Christian | Bible Characters | 117 |
| Christian | Bible Stories | 112 |
| Christian | Miracles & Parables | 100 |
| Christian | Christmas & Easter | 118 |
| Christian | Church Life | 120 |
| Christian | Bible Animals | 109 |
| Christian | Bible Places & Things | 118 |
| Classic | Actions | 130 |
| Classic | Jobs | 124 |
| Classic | Sports | 115 |
| Classic | Animals | 113 |
| Classic | Chores | 108 |
| Classic | Movies | 169 |
| Classic | Everyday Objects | 136 |
| Classic | Foods | 124 |
| Classic | Outdoor Fun | 120 |
| Mix | Mix | 1933 cards drawn from the 16 lists |

The cross-category duplicate check passed: no trimmed prompt, ignoring case, appears in two categories.

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed. Upright is 0 at angles 90 and 270. 30° face-down is +30. 30° face-up is -30. The QC poses are about +40, -40, and -10. Motion gravity matches. Hysteresis and the 600ms debounce hold. |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 52 passed, 0 console errors |
| `node qa/shuffle_check.mjs` | 28 passed, 0 console errors. Each category is still at least 100. Reshuffle still holds back the latest 24. |
| `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 52 passed, 0 console errors |

On the live page, angle 90 upright is beta 0 / gamma -90. A small tilt (beta 0 / gamma -80) read -10 and did not score. Face-down (beta 180 / gamma 50) read +40 and scored correct once. Face-up (beta 0 / gamma -50) read -40 and scored pass once after a return to neutral and 600ms. Angle 270 face-down (beta 180 / gamma -50) read +40 and scored correct. With orientation removed, devicemotion gravity for the same face-down pose scored correct and the source was motion. The pill read "Tilt off, use buttons" before events and "Tilt on" while they arrived. `requestPermission` ran twice before the click handler returned. The sideways note was hidden in landscape and still shown in portrait. No 402 or 429.

Screenshots in `qa/` are from this live run. The play shot shows the tilt status pill between the team name and the timer.

### `?debug=1`

Open https://bryanralston.github.io/charades/?debug=1 on the phone. A small readout stays on screen through setup and play. Leave the flag off for a normal game. Nothing else about the round changes.

### Still needs a real phone

- The iPhone Safari permission prompt, and that a denial keeps the buttons working.
- Android Chrome, where there is no permission call and listeners attach on load.
- The motion-fallback sign on a device that does not emit deviceorientation.
- Whether 35° from the forehead feels right.
- Rotation lock. If the browser keeps reporting angle 0 while the phone is sideways, this mapping will not read upright as 0. Turn rotation lock off, or use the buttons.

## Redesign

Live page after `15ee869`. https://bryanralston.github.io/charades/ serves the new player. `sw.js` is cache `charades-v4`, still network-first for navigations and `index.html`. No 402 or 429.

### What changed

The page is a light and dark app: system font, frosted sheets, an 8pt grid, and one accent per category. Home opens a setup sheet. Play starts with a Hold to forehead prep, a 3-2-1 countdown, a ring timer, and edge Correct and Pass buttons. Correct is a green wash and a rising chime. Pass is an orange wash and a low blip. The round ends with a short flourish. `prefers-reduced-motion` turns the motion off.

Gameplay, `localStorage` key `charades.v1`, the single inline file, the tilt mapping, calibration, permission order, motion fallback, and `?debug=1` readout are unchanged. A refresh during a round returns to home.

Miracles & Parables dropped eight reworded duplicates and kept Wedding at Cana, Loaves and Fish, Great Catch, Ten Lepers, and Two Blind Men. Movies no longer includes Fantasia 2000.

### Screenshots

Landscape frames are 844×390. The rotate overlay is portrait. Files are in `qa/redesign/`:

- `home-light.png`, `home-dark.png`
- `setup-light.png`, `setup-dark.png`
- `prep-light.png`, `prep-dark.png`
- `play-light.png`, `play-dark.png`
- `recap-light.png`, `recap-dark.png`
- `rotate-overlay.png`

### Size and counts

`index.html` on the live site is 88834 bytes. Miracles & Parables has 92 prompts. Movies has 168. Mix draws 1924 cards. Every category is still at least 40, and no prompt is in two categories.

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 52 passed, 0 console errors. Real-phone poses at angle 90 and 270. |
| `node qa/shuffle_check.mjs` | 28 passed, 0 console errors |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 52 passed, 0 console errors |
| Live `sw.js` | HTTP 200, cache `charades-v4` |

### Open limits

- Rotation lock can keep the screen angle at 0 while the phone is sideways. The corrected mapping then does not see an upright forehead pose. Turn rotation lock off, or use the buttons. The page still does not call `screen.orientation.lock`.
- On a 390px-tall landscape screen the category list scrolls, so Mix starts below the first view. The Setup title card is hidden at that height so the timer, both teams, Add Team, and Tap to start stay on screen.
- The iPhone permission prompt and a real denied-sensor round were not exercised on a phone. This run used the headless sensor stubs.
- Audio and vibration still depend on the device. A pass does not subtract a point. The card still showing when time runs out is not marked used.
