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

## v5 polish

Live page after `8d26446`. https://bryanralston.github.io/charades/ serves the polished player. `sw.js` is cache `charades-v5`, still network-first for navigations and `index.html`. No 402 or 429.

### What changed

Home has an animated color mesh, the app icon, and a standings card with team colors and mini bars. A crown shows on a team that is strictly ahead. A fresh game shows Play. A game with a category, a used card, or a score shows Continue and New Game. Continue opens the round step when a deck is already chosen.

Setup is two steps, each with a title and a back chevron. Choose a Deck leads with Mix as a full-width card, then large category cards with a glyph, a count, and a ring plus a check when selected. Round has the 30/60/90 control, an inset team list with a color dot, rename, swipe-to-delete, an Add Team row, and the Tap to start pill.

Play fills the screen with a deep version of the active category color in light and dark. The bottom hint fades after the first card. The ring timer is larger, with a thin track, and still pulses in the last 10 seconds.

The recap headline is the round score. Three or more points plays a short confetti burst. Guessed and passed lists stay. Standings use the same bars and crown. The card still on screen at time-up is marked used and listed as "Time's up". The extra Next up line is gone. The button remains.

A refresh during a round resumes at the prep screen for the same team and keeps that round's used cards. The flag is `sessionStorage` key `charades.round`. A finished round clears it, so a later refresh opens Home. An empty deck stays on Home and shows the empty-deck dialog. Pass still scores 0. `localStorage` key `charades.v1` is unchanged. The tilt math, sensor handlers, calibration, motion fallback, and the permission calls at the start of Tap to start are byte-identical to v4.

### Screenshots

Landscape frames are 844×390 unless noted. Files are in `qa/v5/`:

- `home-light.png`, `home-dark.png`, `home-932.png` (932×430)
- `setup-deck-light.png`, `setup-deck-dark.png`
- `setup-round-light.png`, `setup-round-dark.png`
- `prep-light.png`, `prep-dark.png`
- `play-light.png`, `play-dark.png`, `play-932.png` (932×430)
- `recap-light.png`, `recap-dark.png`
- `rotate-overlay.png` (portrait)

The v4 frames in `qa/redesign/` are unchanged.

### Size and counts

`index.html` on the live site is 101363 bytes. Miracles & Parables has 92 prompts. Movies has 168. Mix draws 1924 cards. Every category is still at least 40, and no prompt is in two categories.

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 55 passed, 0 console errors. Includes the v4 tilt poses, the byte-identical tilt check, the time-up card, and refresh-resume. |
| `node qa/shuffle_check.mjs` | 28 passed, 0 console errors. The mid-round reload lands on prep. The exhausted deck still opens on Home. |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 55 passed, 0 console errors |
| Live `sw.js` | HTTP 200, cache `charades-v5` |

### Open limits

- Rotation lock can keep the screen angle at 0 while the phone is sideways. Turn rotation lock off, or use the buttons.
- On a 390px-tall screen the round step hides the secondary New game button so Add Team and Tap to start both stay on screen. Home still offers New Game once a game is in progress. Category cards below the first row scroll. Mix is the first card and is fully visible.
- Mid-round resume is stored for that tab. A new tab opens the saved game on Home with Continue.
- The iPhone permission prompt was not exercised on a phone. This run used the headless sensor stubs.

## v6 touch-up

Live page after `ea2d8fa`. https://bryanralston.github.io/charades/ serves the v6 player. `sw.js` is cache `charades-v6`. Navigations and `index.html` stay network-first, and a slow network now gives up after about 2.5 seconds and uses the cache. No 402 or 429.

### What changed

The card still on screen at time-up is marked used and listed under its real name, with a gray "time's up" tag. Guessed and tilt-passed rows stay plain names.

Play uses a radial gradient for every category, from a saturated core to a deeper edge. Actions is orange (`#EA580C` to `#C2410C`). Sports and Christmas & Easter stay red, and their urgent timer digits and ring are white. The other decks keep a red urgent timer. Prompt text stays white.

Team names are borderless until the field is focused. A zero score keeps the name and the number at full contrast and dims only the bar. Deck cards share one grid: a fixed glyph row, a two-line name, and the count in the corner. The bottom play hint still fades after the first resolved card.

Resume keeps the team's points and continues with the time left. The remaining milliseconds are `sessionStorage` key `charades.roundMs`, next to `charades.round`. A finished round clears both. An empty deck still opens on Home.

Play requests a screen wake lock and asks for it again when the tab becomes visible. Hiding the tab pauses the timer. The ✕ on Play pauses too, with Resume and End round. The timer follows `performance.now()` and does not drain while paused.

Neutral is captured during the countdown, and only after readings stay within ±3° for 400 ms. If no sensor reading arrives, the countdown still starts after the forehead pause so buttons and headless Chrome can play. A non-upright reading holds the countdown on "Hold to forehead" until the phone is upright. Changing the screen angle calibrates again. Cards do not resolve while the rotate overlay is up. The overlay's `aria-hidden` is false only while it is showing.

Tap to start checks the deck and the teams before it asks for sensor permission. A second tap does not ask again. A start that will run also calls `requestFullscreen` and `screen.orientation.lock('landscape')` where the browser allows it, and ignores a failure. Correct and Pass ignore a second tap inside 600 ms. A long prompt is scaled in one step. Reduced motion shows the check and skip icons without the draw animation.

An Undo last card chip stays up for 5 seconds after a tilt. Always use buttons is a saved setting and ignores tilt scoring. Continue appears only after a card has been played. Deleting a team can be undone, and the last team stays. `localStorage` key `charades.v1` is unchanged except for the optional `settings.buttonsOnly` flag. Pass still scores 0. The tilt math and the sensor handlers (`noteReading`, `orientationLeads`, `onOrientation`, `onMotion`, `attachSensors`) are byte-identical to v5.

### Screenshots

Landscape frames are 844×390 unless noted. Files are in `qa/v6/`:

- `home-light.png`, `home-dark.png`, `home-932.png` (932×430)
- `setup-deck-light.png`, `setup-deck-dark.png`
- `setup-round-light.png`, `setup-round-dark.png`
- `prep-light.png`, `prep-dark.png`
- `play-light.png`, `play-dark.png`, `play-932.png` (932×430)
- `play-actions-light.png`, `play-actions-dark.png`
- `play-bible-stories-light.png`, `play-bible-stories-dark.png`
- `play-animals-light.png`, `play-animals-dark.png`
- `recap-light.png`, `recap-dark.png`
- `rotate-overlay.png` (portrait)
- `play-colors-contact.png` (all 16 category play backgrounds)

The v5 frames in `qa/v5/` are unchanged.

### Size and counts

`index.html` on the live site is 116193 bytes. Miracles & Parables has 92 prompts. Movies has 168. Mix draws 1924 cards. Every category is still at least 40, and no prompt is in two categories.

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 84 passed, 0 console errors. Includes the real-phone tilt poses at 90 and 270, the byte-identical tilt and sensor handlers, the time-up name and tag, refresh-resume with the time left, and a check for every A item. |
| `node qa/shuffle_check.mjs` | 28 passed, 0 console errors. The mid-round reload lands on prep. The exhausted deck still opens on Home. |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 84 passed, 0 console errors |
| Live `sw.js` | HTTP 200, cache `charades-v6` |

### Open limits

- If rotation lock keeps the screen angle at 0, the mapping still does not see a landscape forehead pose. Start calls `screen.orientation.lock('landscape')` where the browser allows it. A refusal is ignored.
- If no sensor reading arrives, the countdown starts after the forehead pause. A face-down reading during that pause holds the countdown until the phone is upright.
- On a 390px-tall screen the round step hides the secondary New game button so Add Team and Tap to start both stay on screen. Home still offers New Game once a card has been played.
- Mid-round resume, including the time left, is stored for that tab. A new tab opens the saved game on Home.
- The iPhone permission prompt was not exercised on a phone. This run used the headless sensor stubs.

## v7

Live page after `c083e33`. https://bryanralston.github.io/charades/ serves the v7 player. `sw.js` is cache `charades-v7`, asset version `7`. Navigations stay network-first, and a slow network still gives up after 2.5 seconds (live fallback measured 2515 ms) and uses the cache. No 402 or 429.

### What changed

Near-copy cards were collapsed to one idea, the named removals are gone, and numbered movie sequels are gone. Base titles stay, including Big Hero 6 and 101 Dalmatians. 102 Dalmatians is gone. Mary Poppins Returns stays. Ten vivid scenes were added: David and Goliath, Jonah Swallowed, Feeding the 5,000, Peter Denies Jesus, Paul Blinded, Daniel Prays, Zacchaeus Climbs Tree, Samson Pushes Pillars, Paul's Shipwreck, and Baby Moses Basket. No prompt is in two categories. Every deck is still at least 40.

A correct tilt flies the card down and bumps the score. A pass flies the card up and still scores 0. The last five seconds tick once each, then a distinct buzzer ends the round. Tones are layered WebAudio. There are no audio files. The countdown ends on GO!.

The first start explains why motion permission is needed, then deals a practice card whose text is "Nod down = Got it, Tip back = Pass". That card does not score and does not start the round timer. Later starts skip the tutorial and the forehead pause. A refresh mid-round still resumes on prep for the full pause, with the time left in `sessionStorage` key `charades.roundMs`.

Match formats are Endless, First to 20, and 3 Rounds Each. Endless still ends on the recap. The other two end on a winner screen with a crown, confetti, and Rematch. Rematch clears scores, used cards, and rounds played, keeps the teams, category, and format, and opens pass-the-phone. Next up opens pass-the-phone instead of setup. Tap to start on that screen starts the next turn. Mix is a normal-height deck tile, the same 112px as the other cards, and two rows are on screen at 844×390.

`localStorage` key `charades.v1` gains `roundsPlayed`, `settings.tutorialSeen`, and `settings.format`. Older saves still load. New Game keeps `tutorialSeen`. The tilt math and the sensor handlers (`noteReading`, `orientationLeads`, `onOrientation`, `onMotion`, `attachSensors`) are byte-identical to v6. The permission calls from `startLock = true` through `primeAudio()` are unchanged. Calibration is unchanged.

### Screenshots

Landscape frames are 844×390. Files are in `qa/v7/`:

- `home-light.png`, `home-dark.png`
- `setup-deck-light.png`, `setup-deck-dark.png`
- `setup-round-light.png`, `setup-round-dark.png`
- `tutorial-light.png`, `tutorial-dark.png`
- `play-bible-stories-light.png`, `play-bible-stories-dark.png` (Bible Stories prompt Raven Sent Out)
- `play-actions-light.png`, `play-actions-dark.png` (Actions prompt Folding Paper)
- `play-animals-light.png`, `play-animals-dark.png` (Animals prompt Zebra)
- `recap-light.png`, `recap-dark.png`
- `winner-light.png`, `winner-dark.png`
- `pass-light.png`, `pass-dark.png`

The three play prompts are different cards from those decks. The v6 frames in `qa/v6/` and the earlier folders are still there.

### Size and counts

`index.html` on the live site is 128521 bytes.

| Category | Prompts |
| --- | --- |
| Bible Characters | 115 |
| Bible Stories | 115 |
| Miracles & Parables | 58 |
| Christmas & Easter | 114 |
| Church Life | 116 |
| Bible Animals | 100 |
| Bible Places & Things | 118 |
| Actions | 130 |
| Jobs | 124 |
| Sports | 115 |
| Animals | 113 |
| Chores | 106 |
| Movies | 150 |
| Everyday Objects | 135 |
| Foods | 124 |
| Outdoor Fun | 120 |
| Mix | 1853 |

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 104 passed, 0 console errors. Includes the v6 tilt poses, byte-identical tilt and sensor handlers, fly-off direction, tick and buzzer, GO, the tutorial and the later skip, each match format, the winner screen and Rematch, pass-the-phone, the Mix tile, the removed cards, and the added scenes. |
| `node qa/shuffle_check.mjs` | 28 passed, 0 console errors. The mid-round reload lands on prep. The exhausted deck still opens on Home. |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 104 passed, 0 console errors |
| Live `index.html` | HTTP 200, 128521 bytes |
| Live `sw.js` | HTTP 200, cache `charades-v7`, `NETWORK_TIMEOUT_MS` 2500 |

### Open limits

- Cards do not carry an easy, medium, or hard tag. The prompt lists stay strings, which is what the checks read.
- If rotation lock keeps the screen angle at 0, the mapping still does not see a landscape forehead pose. Start calls `screen.orientation.lock('landscape')` where the browser allows it. A refusal is ignored.
- If no sensor reading arrives, a first start still waits out the forehead pause. A later start skips that pause. A face-down reading during the pause holds the countdown until the phone is upright.
- Mid-round resume, including the time left, is stored for that tab. A new tab opens the saved game on Home.
- The iPhone permission prompt was not exercised on a phone. This run used the headless sensor stubs.

## v8

Live page after `ee5177a`. https://bryanralston.github.io/charades/ serves the v8 player. `sw.js` is cache `charades-v8`, asset version `8`. Navigations stay network-first, and a slow network still gives up after 2.5 seconds (live fallback measured 2506 ms) and uses the cache. The 18 deck pictures are in that precache. No 402 or 429.

### 0a root cause

The v7 recap frame was a screenshot setup. The helper called `renderRecap` with a 3-point summary and a single guessed card after `clearGame` had set both team scores to 0. The headline is taken from that summary. The standings are painted from `state.teams`. Those two inputs had been given different numbers.

The scoring handlers already keep the headline, the lists, and the standings together. A correct guess increments the team score, the round points, and the guessed list in one step. A pass scores 0 and joins the passed list. When time runs out, the card on screen joins the passed list and is tagged "time's up".

The recap screenshot now sets Team 1 to 3 and Team 2 to 0, lists Running, Jumping, and Swimming as guessed, and lists Dancing and Singing as passed, with Singing tagged "time's up". A separate check plays that same round through `resolveRound` and `endRound`. The headline is "Team 1 scored 3! Total: 3.", the lists match, and the standings read 3 and 0.

### What changed

Winner lines follow the match format. First to 20 reads "Team 1 wins with 20 points!" Three rounds with two teams reads "Team 1 wins, 14 to 9, after 3 rounds each." A tied score reads "It's a tie at 20 points!" A tied three-round match reads "It's a tie at 9 points after 3 rounds each." With more than two teams, a rounds win reads "Team N wins with N points after 3 rounds each."

Light-mode standings keep the name and the score at full contrast. The measured color is `rgb(28, 28, 30)` and the opacity is 1 on Home, the recap, and the winner screen. Only the bar of a zero score is dimmed, to opacity 0.4.

Bible Animals keeps one Dove and one Raven. The deck is 113 cards. No prompt is in two categories. Hum It is the eighth Christian deck, 60 songs, starting with Jesus Loves Me and This Little Light of Mine. Jingle Bells stays in Christmas & Easter, so Hum It does not repeat it.

`briefs/` is in `.gitignore`. The briefs that were tracked are removed from the index. The files remain on disk. The player does not link `docs/FEATURE_MAP.md`.

Record reactions is an opt-in checkbox on the round step, off by default. With it off, `getUserMedia` is never called. With it on, the orientation and motion permission calls still run first, then the camera. A denied camera still reaches the countdown. The clip is the front camera composited on a canvas with the last card names and a check or an x, capped at the round length, and kept on the device. The recap shows the preview. Share uses `navigator.share` when it can, and otherwise downloads the file. Practice rounds are not recorded. A one-second fake-camera round on the live page produced a clip, stopped both tracks, and stopped because the cap was reached.

My Decks sits below the category picker. A named list of one prompt per line is stored in `localStorage` key `charades.v1` and can be dealt like any other deck. Mix includes those cards. Share writes a compressed `#d=` hash, or an uncompressed one when compression is missing, and draws an inline QR (versions 1 through 10). Opening the link offers Add deck, and the added prompts match the shared ones. A custom deck uses a gray gradient tile and has no image.

The round style is Act It, Describe It, or Hum It. Describe It is the default. The same label shows on the prep screen and the play screen. The style does not change tilt scoring.

Custom sits next to 30, 60, and 90. It opens a stepper from 10 to 300 seconds in steps of 5, shows the value on the segment (45s in the screenshot), and saves it in `charades.v1`. The default length is still 60. The timer ring and the last-10-second pulse follow the chosen length. The last five seconds still tick, and the round still ends on the buzzer.

Each Choose-a-Deck card shows its picture on top, then the name, then the count. The name and the count are page text. Every picture is a 640×360 WebP from commit `377a1fd`, brought in as `assets/decks/` only. The 18 files total 154916 bytes. Images lazy-load with width and height set. Card size was the same before and after decode. Mix and Bible Characters are both 155px tall, and two rows are on screen at 844×390. The tilt math and the sensor handlers (`noteReading`, `orientationLeads`, `onOrientation`, `onMotion`, `attachSensors`) are byte-identical to v7. Calibration is unchanged. Pass still scores 0.

### Screenshots

Landscape frames are 844×390. Files are in `qa/v8/`:

- `deck-light.png`, `deck-dark.png`
- `deck-share-light.png`, `deck-share-dark.png`
- `setup-style-light.png`, `setup-style-dark.png`
- `stepper-light.png`, `stepper-dark.png` (custom length 45s)
- `play-act-light.png`, `play-act-dark.png` (Act It, Actions prompt Bowling)
- `play-describe-light.png`, `play-describe-dark.png` (Describe It, Animals prompt Toucan)
- `play-hum-light.png`, `play-hum-dark.png` (Hum It, Hum It prompt Ants Go Marching)
- `recap-light.png`, `recap-dark.png` (Team 1 scored 3, standings 3 and 0)
- `recap-video-light.png`, `recap-video-dark.png` (fake-camera preview)
- `winner-light.png`, `winner-dark.png` (Team 1 at 20, Team 2 at 9, "Team 1 wins with 20 points!")

The three style prompts are different cards. The v7 frames in `qa/v7/` and the earlier folders are still there.

### Size and counts

`index.html` on the live site is 163805 bytes. That is over the 150 KB target. The deck pictures are separate files and are not part of that target.

| Category | Prompts |
| --- | --- |
| Bible Characters | 115 |
| Bible Stories | 115 |
| Miracles & Parables | 58 |
| Christmas & Easter | 114 |
| Church Life | 116 |
| Bible Animals | 113 |
| Bible Places & Things | 118 |
| Hum It | 60 |
| Actions | 130 |
| Jobs | 124 |
| Sports | 115 |
| Animals | 113 |
| Chores | 106 |
| Movies | 150 |
| Everyday Objects | 135 |
| Foods | 124 |
| Outdoor Fun | 120 |
| Mix | 1926 |

Custom decks are saved on the device and are not part of the 1926.

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 130 passed, 0 console errors. Includes the v7 checks, the honest recap, winner wording, light-mode contrast, the Bible Animals merge, Hum It, styles, the fake camera, the deck round-trip and QR, custom length, and the 18 deck pictures with stable card sizes. |
| `node qa/shuffle_check.mjs` | 29 passed, 0 console errors. Seventeen categories, 1926 cards. Mix reshuffle holds back the latest 24 (deck 1902). The mid-round reload lands on prep. The exhausted deck still opens on Home. |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 130 passed, 0 console errors |
| Live `index.html` | HTTP 200, 163805 bytes |
| Live `sw.js` | HTTP 200, cache `charades-v8`, asset version `8`, `NETWORK_TIMEOUT_MS` 2500 |

### Open limits

- Cards do not carry an easy, medium, or hard tag. The prompt lists stay strings, which is what the checks read.
- If rotation lock keeps the screen angle at 0, the mapping still does not see a landscape forehead pose. Start calls `screen.orientation.lock('landscape')` where the browser allows it. A refusal is ignored.
- If no sensor reading arrives, a first start still waits out the forehead pause. A later start skips that pause. A face-down reading during the pause holds the countdown until the phone is upright.
- Mid-round resume, including the time left, is stored for that tab. A new tab opens the saved game on Home.
- The iPhone permission prompt was not exercised on a phone. This run used the headless sensor stubs.
- The camera path was exercised with a fake headless camera. It was not exercised on a phone.
- The inline QR covers versions 1 through 10. A longer deck than that returns no code.
- Custom length is 10 to 300 seconds, in steps of 5.
- Jingle Bells is only in Christmas & Easter.
- `index.html` is 163805 bytes, over the 150 KB target. The 18 deck pictures add 154916 bytes beside it.
- Projector mode and kids picture mode were left out.

## v8.1

Live page after `794fd1a`. https://bryanralston.github.io/charades/ serves the v8.1 player. `sw.js` is cache `charades-v8-1`, asset version `8.1`. Navigations stay network-first, and a slow network still gives up after 2.5 seconds (live fallback measured 2515 ms) and uses the cache. `prompts.js` and the 18 deck pictures are in that precache. No 402 or 429.

### What changed

The My Decks editor no longer sits under the deck list. A "+ New deck" tile is inside the scrolling list. Tapping it opens a sheet with the name, the prompts, Save, and Cancel. Saved decks stay in that list, with Share. On a short landscape screen the card pictures are 52px tall so two full rows fit above Next.

When the style and the deck are both Hum It, prep and play show that name once. A different deck still shows its own name under the style.

The screenshot script closes the Share deck window and the Add-deck offer before the play, recap, and winner frames. Each of those frames checks that `#share-modal`, `#deck-offer`, `#pause-modal`, `#confirm-modal`, and `#deck-empty` are hidden. The recap and winner frames still use a headline, card lists, and standings that agree.

The built-in prompt lists, including Hum It, moved to `prompts.js`. The page loads that file, and the service worker precaches it, so a reload after install still has the lists offline. The tilt math and the sensor handlers are byte-identical to v8. Calibration and the permission order are unchanged.

### Measurements

| Viewport | Scroll area | Full rows | Card height | Row tops |
| --- | --- | --- | --- | --- |
| 844×390 | 280px, from y 64 | 2 | 94px | 77, 188 |
| 390×844 | 722px, from y 52 | 3 | 167px | 73, 272, 449 |

At 844×390, six cards sit fully inside the scroll area. A third row starts lower and is not fully on screen. At 390×844, five cards sit fully inside, across three rows.

### File sizes

| File | Bytes |
| --- | --- |
| Live `index.html` | 140606 |
| Live `prompts.js` | 25950 |

140606 is under the 150 KB target. The 18 deck pictures remain separate files, 154916 bytes.

### Screenshots

Files are in `qa/v8_1/`:

- `deck-light.png`, `deck-dark.png` at 844×390
- `deck-portrait.png` at 390×844
- `new-deck-closed.png`, `new-deck-open.png`
- `play-hum-light.png`, `play-hum-dark.png` (Hum It shown once, prompt Head Shoulders Knees)

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 158 passed, 0 console errors. Includes the v8 checks, the deck-list height at both viewports, the + New deck save and share, Hum It shown once, closed dialogs on the play, recap, and winner shots, and `prompts.js` served from the service worker cache. |
| `node qa/shuffle_check.mjs` | 29 passed, 0 console errors. Seventeen categories, 1926 cards. Mix reshuffle holds back the latest 24 (deck 1902). |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 158 passed, 0 console errors |
| Live `index.html` | HTTP 200, 140606 bytes |
| Live `prompts.js` | HTTP 200, 25950 bytes |
| Live `sw.js` | HTTP 200, cache `charades-v8-1`, asset version `8.1`, `NETWORK_TIMEOUT_MS` 2500 |

### Open limits

- At 844×390 a third deck row is only partly on screen. Two full rows are inside the scroll area.
- Cards do not carry an easy, medium, or hard tag.
- If rotation lock keeps the screen angle at 0, the mapping still does not see a landscape forehead pose.
- Mid-round resume, including the time left, is stored for that tab.
- The iPhone permission prompt was not exercised on a phone. The camera path used a fake headless camera.
- The inline QR covers versions 1 through 10.
- Custom length is 10 to 300 seconds, in steps of 5.
- Jingle Bells is only in Christmas & Easter.
- Projector mode and kids picture mode were left out.

## v8.2

Live page after `fd9281a`. https://bryanralston.github.io/charades/ serves the v8.2 player. `sw.js` is cache `charades-v8-2`, asset version `8.2`. Navigations stay network-first, and a slow network still gives up after 2.5 seconds (live fallback measured 2506 ms) and uses the cache. `prompts.js` and the 18 deck pictures are in that precache. No 402 or 429.

### What changed

Round setup has a Level control: Kids, Adults, or All. The default is All, and the choice is saved in localStorage. Deck counts on Choose a Deck follow that level. Mix is the sum of the built-in lists for the chosen level. Custom decks stay at their full count and ignore the level.

Every built-in prompt is tagged Kids or Adults in `prompts.js`. Each deck has at least 40 of each. No prompt is repeated anywhere. Adults means harder cards (longer or less obvious), and the lists stay Christian and family-safe.

Each team has its own level. A new team copies the global level. Changing the global level updates teams that still match the previous global level. On a team's turn, cards come from that team's level and the same chosen decks. One shared used-set keeps a prompt from coming back. Kids and Adults show a small badge on the pass-the-phone card, the prep line, the play HUD, the recap line, and the standings. A Kids turn uses slightly larger prompt text.

The tilt math and the sensor handlers are byte-identical to v8.1. Calibration and the permission order are unchanged.

The screenshot script treats the deck editor as one of the dialogs that must be closed. It writes only `qa/v8_2/`. The older screenshot folders are left as they were.

### Deck counts

| Deck | Kids | Adults | All |
| --- | --- | --- | --- |
| Bible Characters | 43 | 72 | 115 |
| Bible Stories | 53 | 62 | 115 |
| Miracles & Parables | 46 | 47 | 93 |
| Christmas & Easter | 61 | 53 | 114 |
| Church Life | 46 | 70 | 116 |
| Bible Animals | 52 | 61 | 113 |
| Bible Places & Things | 45 | 73 | 118 |
| Actions | 115 | 45 | 160 |
| Jobs | 51 | 83 | 134 |
| Sports | 49 | 66 | 115 |
| Animals | 59 | 54 | 113 |
| Chores | 50 | 56 | 106 |
| Movies | 55 | 95 | 150 |
| Everyday Objects | 120 | 50 | 170 |
| Foods | 72 | 52 | 124 |
| Outdoor Fun | 50 | 70 | 120 |
| Hum It | 55 | 45 | 100 |
| Mix | 1022 | 1054 | 2076 |

### Samples

Bible Stories. Kids: Noah's Ark, Baby Moses, Burning Bush, Red Sea, Coat of Colors. Adults: Tower of Babel, Olive Branch, Balaam's Donkey, Elijah's Chariot, Widow's Oil.

Actions. Kids: Running, Jumping, Swimming, Dancing, Sleeping. Adults: Rowing Boat, Pitching Tent, Juggling, Bowling, Ice Skating.

Hum It. Kids: Jesus Loves Me, This Little Light of Mine, Father Abraham, Happy Birthday, Twinkle Twinkle. Adults: Amazing Grace, How Great Thou Art, Holy Holy Holy, Blessed Assurance, What a Friend.

### Measurements

| Viewport | Scroll area | Full rows | Card height | Row tops |
| --- | --- | --- | --- | --- |
| 844×390 | 280px, from y 64 | 2 | 94px | 77, 188 |
| 390×844 | 722px, from y 56 | 3 | 167px | 77, 275, 453 |

At 844×390, six cards sit fully inside the scroll area. A third row starts lower and is not fully on screen. At 390×844, five cards sit fully inside, across three rows. The Level control sits on the round step, above the deck list.

### File sizes

| File | Bytes |
| --- | --- |
| Live `index.html` | 145835 |
| Live `prompts.js` | 28926 |

145835 is under the 150 KB target. The 18 deck pictures remain separate files.

### Screenshots

Files are in `qa/v8_2/`, light and dark, at 844×390:

- `setup-level-light.png`, `setup-level-dark.png` (Level control, All selected)
- `teams-light.png`, `teams-dark.png` (Team 1 Kids, Team 2 Adults)
- `pass-kids-light.png`, `pass-kids-dark.png`
- `pass-adults-light.png`, `pass-adults-dark.png`
- `play-kids-light.png`, `play-kids-dark.png` (Running, Kids badge)
- `play-adults-light.png`, `play-adults-dark.png` (Parallel Parking, Adults badge)
- `recap-light.png`, `recap-dark.png` (Team 1 scored 3, Kids badge, standings Kids and Adults)

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 186 passed, 0 console errors. Includes the v8.1 checks, per-deck Kids and Adults counts, the Level control, kids-only and adults-only draws, per-team draws, badges, resume, custom decks ignoring the level, and closed dialogs on the v8.2 shots. |
| `node qa/shuffle_check.mjs` | 46 passed, 0 console errors. Seventeen categories, 2076 cards. Mix reshuffle holds back the latest 24 (deck 2052). |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 186 passed, 0 console errors |
| Live `index.html` | HTTP 200, 145835 bytes |
| Live `prompts.js` | HTTP 200, 28926 bytes |
| Live `sw.js` | HTTP 200, cache `charades-v8-2`, asset version `8.2`, `NETWORK_TIMEOUT_MS` 2500 |

### Open limits

- At 844×390 a third deck row is only partly on screen. Two full rows are inside the scroll area.
- Adults means a harder card. The lists stay family-safe. A badge appears for Kids and Adults. Custom decks ignore the level.
- If rotation lock keeps the screen angle at 0, the mapping still does not see a landscape forehead pose.
- Mid-round resume, including the time left and each team's level, is stored for that tab.
- The iPhone permission prompt was not exercised on a phone. The camera path used a fake headless camera.
- The inline QR covers versions 1 through 10.
- Custom length is 10 to 300 seconds, in steps of 5.
- Jingle Bells is only in Christmas & Easter.
- Projector mode and kids picture mode were left out.

## v8.3

Live page after `6cd4709`. https://bryanralston.github.io/charades/ serves the v8.3 player. `sw.js` is cache `charades-v8-3`, asset version `8.3`. Navigations stay network-first, and a slow network still gives up after 2.5 seconds (live fallback measured 2515 ms) and uses the cache. No 402 or 429.

### What changed

Miracles & Parables is one card per miracle or parable. The floor for that deck only is 30 Kids and 30 Adults. Every other deck stays at 40 of each. The combined deck is 68 cards.

Actions drops Folding a Map, Parking a Car, and Waving Down a Ride, and adds Ironing a Shirt, Wrapping a Gift, and Unlocking a Door. Adults stays at 45.

Standings put the level badge on its own line above the team name. The name stays on one line. The badge does not cover the score bar. The same layout is on the home, recap, and winner screens.

Kids prompts are one or two words. Hum It is the exception. Movies replaces Puss in Boots with Karate Kid. Hum It kids replaces I Am a Sunbeam with Hokey Pokey. The first two Hum It kids songs stay Jesus Loves Me and This Little Light of Mine.

A near-duplicate check flags close paraphrases inside a deck and prints the allowed pairs. The tilt math and the sensor handlers are byte-identical to v8.2. Calibration and the permission order are unchanged.

Screenshots for this round are only in `qa/v8_3/`. Older folders are left as they were.

### Miracles & Parables

Kids (32): Ten Lepers, Jairus Daughter, Fig Tree, Peter's Mother, Bent Woman, Great Catch, Withered Hand, Raising Lazarus, Lost Sheep, Lost Coin, Mustard Seed, The Sower, Widow's Son, Four Thousand, Severed Ear, Drowned Pigs, Freed Boy, One Leper, Tabitha Raised, Snake Bite, Open Prison, Ten Lamps, Priceless Pearl, New Wineskins, Narrow Gate, Rich Fool, Vineyard Workers, Wedding Feast, Good Shepherd, Hidden Treasure, Two Sons, Yeast Dough.

Adults (36): House on Rock, Wedding at Cana, Man Through Roof, Loaves and Fish, Calming the Storm, Friend at Midnight, The Prodigal Son, Wheat and Weeds, Counting the Cost, Dragnet of Fish, Unforgiving Servant, Pool of Bethesda, Two Blind Men, Muddy Eyes Open, Deaf Ears Open, Mute Man Speaks, Walking on Water, Woman Touches Hem, Centurion's Servant, The Good Samaritan, The Talents, Persistent Widow, Sheep and Goats, Vine and Branches, Pharisee and Tax Collector, Two Debtors, Salt and Light, Faithful Steward, Wise Manager, Beautiful Gate, Wicked Tenants, Rich Man and Lazarus, Growing Seed, Great Banquet, Lamp on Stand, Coin in Fish.

### Deck counts

| Deck | Kids | Adults | All |
| --- | --- | --- | --- |
| Bible Characters | 42 | 73 | 115 |
| Bible Stories | 50 | 64 | 114 |
| Miracles & Parables | 32 | 36 | 68 |
| Christmas & Easter | 61 | 53 | 114 |
| Church Life | 46 | 70 | 116 |
| Bible Animals | 52 | 61 | 113 |
| Bible Places & Things | 45 | 72 | 117 |
| Actions | 115 | 45 | 160 |
| Jobs | 51 | 83 | 134 |
| Sports | 49 | 66 | 115 |
| Animals | 59 | 54 | 113 |
| Chores | 50 | 56 | 106 |
| Movies | 52 | 98 | 150 |
| Everyday Objects | 120 | 50 | 170 |
| Foods | 72 | 52 | 124 |
| Outdoor Fun | 50 | 70 | 120 |
| Hum It | 55 | 45 | 100 |
| Mix | 1001 | 1048 | 2049 |

### Measurements

| Viewport | Scroll area | Full rows | Card height | Row tops |
| --- | --- | --- | --- | --- |
| 844×390 | 280px, from y 64 | 2 | 94px | 77, 188 |
| 390×844 | 722px, from y 56 | 3 | 167px | 77, 275, 453 |

At 844×390, six cards sit fully inside the scroll area. A third row starts lower and is not fully on screen. At 390×844, five cards sit fully inside, across three rows. The Kids deck shot shows Mix at 1001, Bible Characters at 42, Bible Stories at 50, Miracles & Parables at 32, Christmas & Easter at 61, and Church Life at 46.

### File sizes

| File | Bytes |
| --- | --- |
| Live `index.html` | 146337 |
| Live `prompts.js` | 28263 |

146337 is under the 150 KB target.

### Screenshots

Files are in `qa/v8_3/`, light and dark, at 844×390:

- `recap-light.png`, `recap-dark.png` (Team 1 scored 3, Kids badge above the name, Adults badge above Team 2, score bar clear of the badge)
- `deck-kids-light.png`, `deck-kids-dark.png` (Choose a Deck at the Kids level)

### Tests

| Check | Result |
| --- | --- |
| `node qa/tilt_math_check.mjs` | 34 passed |
| `node qa/headless_qc.mjs` on http://127.0.0.1:8765/ | 189 passed, 0 console errors. Includes the v8.2 checks, the 30/30 Miracles floor, one-or-two-word Kids prompts, the near-duplicate allowlist, and standings names on one line with badges clear of the bar at 844×390. |
| `node qa/shuffle_check.mjs` | 46 passed, 0 console errors. Seventeen categories, 2049 cards. Mix reshuffle holds back the latest 24 (deck 2025). |
| Live `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` | 189 passed, 0 console errors |
| Live `index.html` | HTTP 200, 146337 bytes |
| Live `prompts.js` | HTTP 200, 28263 bytes |
| Live `sw.js` | HTTP 200, cache `charades-v8-3`, asset version `8.3`, `NETWORK_TIMEOUT_MS` 2500 |

### Open limits

- At 844×390 a third deck row is only partly on screen. Two full rows are inside the scroll area.
- Adults means a harder card. The lists stay family-safe. A badge appears for Kids and Adults. All has no badge. Custom decks ignore the level.
- Miracles & Parables is the only deck with a 30/30 floor.
- Cards do not carry a tag beyond Kids or Adults.
- If rotation lock keeps the screen angle at 0, the mapping still does not see a landscape forehead pose.
- Mid-round resume, including the time left and each team's level, is stored for that tab.
- The iPhone permission prompt was not exercised on a phone. The camera path used a fake headless camera.
- The inline QR covers versions 1 through 10.
- Custom length is 10 to 300 seconds, in steps of 5.
- Jingle Bells is only in Christmas & Easter.
- Projector mode and kids picture mode were left out.

