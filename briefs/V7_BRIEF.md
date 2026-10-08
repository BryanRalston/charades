# Charades v7 brief: content cleanup (B) + game feel and ending (C)

## Ground rules
- Builds on v6. Bump the sw.js cache to `charades-v7`.
- These stay byte-identical to v6:
  - the tilt math block (`/* tilt-math-start */` ... `/* tilt-math-end */`)
  - onOrientation, onMotion, attachSensors, noteReading
  - the motion fallback
  - the v6 calibration logic
  - the permission order in the start handler
- Keep the single inline file. No fonts, CDNs or audio files. Ideally under 150 KB.
- Keep localStorage (migrate safely if the format grows), resume, ?debug=1, the sw timeout fallback, and all v6
  reliability fixes.
- Pass stays at 0 points.

## B) Content cleanup
Actability matters more than count. 40+ per deck is still the floor.

### Collapse near-copies (keep one of each)
- Miracles & Parables comes down to about 55 real ideas:
  - Lost Coin / Swept Floor / Hidden Coin
  - Narrow Gate / Narrow Door
  - Yeast in Dough / Rising Dough
  - New Wineskins / New Skins
  - Vineyard Workers / Dawn Workers / Evening Workers
  - Withered Hand / Hand Made Whole
  - the five distance-healing cards
- Bible Stories:
  - the 3 rainbows
  - the 3 doves
  - Cloud by Day / Cloud Leads On
- Bible Animals:
  - Fat Cow / Thin Cow
  - Raven Pair / Noah Raven
  - at most 2 lambs and 1-2 big fish
- Christmas & Easter: Pink, Blue, Plastic and Hidden Egg become just Easter Egg.

### Remove
- Friendship Pad, Pew Pencil, Known Sheep, Sorted Sheep, Ready Feast, Healed at Once, Salt Steps, Boot Tray,
  Rock Badger, Doxology, Benediction, Pink Egg, Backpack Strap, Dairy Cow, Praying in Fish, Sudden Fig Tree,
  Methuselah, Dorcas, Thorny Soil.
- Numbered movie sequels (Toy Story 2/3/4, Despicable Me 2/3/4, etc.). Keep only the base title.

### Add vivid, actable scenes
- David and Goliath, Jonah Swallowed, Feeding the 5,000, Peter Denies Jesus, Paul Blinded, Daniel Prays,
  Zacchaeus Climbs Tree, Samson Pushes Pillars, Paul's Shipwreck, Baby Moses Basket.
- 1-3 words where possible, up to 4 for well-known scenes.
- No cross-category duplicates (keep the QC check). If an added scene collides with an existing card, keep one.

### Optional
- If it's cheap: an easy/medium/hard tag per card, as data only, with no UI yet.

## C) Game feel and ending

### Card motion and sound
- The card flies off in the tilt direction (down = correct, up = pass), and the next card scales in.
- The score chip bumps on each point.
- A tick each second for the last 5 s, then a distinct end buzzer.
- Richer, layered WebAudio tones (no external files; works offline).
- A "GO!" moment after 3-2-1.

### First-run tutorial
- Explain why motion permission is needed before the prompt.
- Then a practice card ("Nod down = Got it, Tip back = Pass"), confirmed live.
- The prep screen can be skipped after the first time.

### Match formats
- Endless (the current mode), First to 20, and 3 Rounds Each.
- The two finite formats end on a winner screen with a crown, confetti and a Rematch button.
- "Next up" goes straight to a pass-the-phone screen, not back to setup.

### Layout
- Make Mix a normal-height tile, so two rows of decks show at 390px tall.

## QC
- The same suite as v6:
  - real-phone tilt at angles 90 and 270
  - tilt byte-identity vs v6
  - every v6 A-item test
  - time-up name
  - refresh-resume
  - `qa/tilt_math_check.mjs`
  - `qa/shuffle_check.mjs`
  - no cross-category duplicates
  - 40+ per deck
- Plus tests for every new piece:
  - the fly-off direction
  - the tick and buzzer calls (mocked audio)
  - the GO moment
  - the tutorial flow, including the skip after the first run
  - each match format reaching its end condition
  - the winner screen and Rematch
  - the pass-the-phone flow
  - Mix tile height, with two rows visible at 844x390
  - the removed and collapsed cards are absent and the added scenes are present
- Take light and dark screenshots at 844x390, saved under `qa/v7/`:
  - home
  - setup step 1 (deck)
  - setup step 2 (round)
  - tutorial
  - play in 3 categories (one Christian, two Classic), each showing a different real prompt from that deck
    (not one forced prompt reused across shots)
  - recap
  - winner screen
  - pass-the-phone screen
- Commit, push main to BryanRalston/charades (authorized; no other repo), wait for Pages, and verify live: `sw.js`
  serves `charades-v7` and the live QC passes.
- Add a "v7" section to qa/REPORT.md covering:
  - what changed
  - per-category counts, with names exactly as on the page, and the Mix total
  - the screenshot list
  - the index.html file size
  - test results
  - any gaps
- Close any headless browsers you start.
- Stop on 402. On a 429, wait ~1 min, retry once, then stop.
- End with one short summary: commit shas, live check, sw version, file size, test counts, per-category counts,
  and the screenshot folder.
