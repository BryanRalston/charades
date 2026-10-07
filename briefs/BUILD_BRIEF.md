# Charades v1 build brief (from Charades bot, Bryan's request, gated by Grok Bot), 2026-10-07

GOAL: a phone "heads-up" charades game as a single static page, hosted on GitHub Pages at https://bryanralston.github.io/charades (new PUBLIC repo `bryanralston/charades`, Pages from main, index.html at root).

## GAMEPLAY
- The player holds the phone to their forehead in landscape, and a giant prompt faces the group. Lock or encourage landscape, and show a "rotate your phone" overlay in portrait.
- DeviceOrientation:
  - Tilt forward/face-down = CORRECT: green flash, a short beep via WebAudio, navigator.vibrate where supported, and +1.
  - Tilt back/face-up = PASS: orange flash, then the next prompt.
  - Use a neutral zone (the phone must return to within about ±20° of upright before another tilt counts) plus about a 600ms debounce, so one tilt counts once.
  - Handle landscape-left vs landscape-right (use the screen.orientation angle and gamma/beta mapping).
- iPhone: a big "Tap to start" button that calls DeviceOrientationEvent.requestPermission() inside the click handler. If permission is denied or unavailable, fall back gracefully.
- Always show Correct / Pass tap buttons as a fallback (for laptops and denied sensors), and support the keyboard arrows too.
- Round timer: default 60s, with options of 30/60/90. A 3-2-1 countdown before the start, a huge on-screen timer, and the last 10s pulse. The round ends automatically at 0.

## SCOREBOARD
- Add/remove teams or players, rotate turns automatically, and keep a running total across rounds.
- An end-of-round recap listing guessed vs passed prompts.
- Persist everything (teams, scores, turn, used prompts, settings) in localStorage so a refresh doesn't wipe the game. A "New game" button with a confirm step clears it.

## CONTENT (Christian-themed + classic, family-safe, kid-actable). UPDATED by Bryan, this REPLACES any earlier category list
Show exactly these 16 categories, in this order and under these exact names, grouped on the picker under the headings "Christian" and "Classic", plus a "Mix" option:
- Christian: 1) Bible Characters 2) Bible Stories 3) Miracles & Parables 4) Christmas & Easter 5) Church Life 6) Bible Animals 7) Bible Places & Things
- Classic: 8) Actions 9) Jobs 10) Sports 11) Animals 12) Chores 13) Movies (G/PG family-friendly titles only) 14) Everyday Objects 15) Foods 16) Outdoor Fun

PROMPT STYLE: traditional charades. Each prompt is one word or a short 2-3 word phrase someone can act out, e.g. "Noah's Ark", "Walking on Water", "Fishing", "Brushing Teeth", "Firefighter". No sentences, clues or explanations.
- At least 40 unique prompts per category.
- No repeats within a game: track used prompts per game. If a category runs out, say so and offer a reshuffle.
- Everything kid-actable and family-safe. Nothing scary, gory or mocking.

## STYLE/TECH
- Bright, kid-friendly colors, giant readable text (the prompt auto-fits) and big touch targets.
- A single self-contained index.html (inline CSS/JS, no external fonts or CDNs), plus a small service worker and manifest so it works offline after the first load. It must load fast.
- Add docs/FEATURE_MAP.md to the repo: an internal-only list of current capabilities and known limits. Do NOT link it from the player UI.

## QC before reporting
- The live URL loads.
- The tilt logic works (simulate deviceorientation events in devtools or with a headless test).
- The timer ends the round.
- Scores survive a refresh.
- The iOS permission button is present.
- There are no console errors.
- The report lists the category names and headings exactly as they appear on the live page, with a per-category prompt count (each at least 40).

Write the QC results to qa/REPORT.md, with screenshots in qa/.
