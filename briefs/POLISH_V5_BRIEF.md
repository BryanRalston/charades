# Charades v5 polish brief (from the Charades bot's review of v4)

v4 is clean, but it doesn't hit the "Apple built this" bar yet: Home is sparse, and Setup feels cramped and
form-like.

## Ground rules
- Bump the sw.js cache to `charades-v5`.
- Do NOT touch the tilt math, sensors, calibration, fallback or permission flow. Keep them byte-identical to v4:
  - the `/* tilt-math-start */` ... `/* tilt-math-end */` block
  - onOrientation, onMotion, attachSensors, noteReading, considerTilt, beginCalibration, tryFinishCalibration
  - the requestPermission calls at the top of the start tap
- Keep the single inline file. No fonts or CDNs. Ideally under 150 KB.
- Keep localStorage, the ?debug=1 readout and network-first loading as they are.

## 1) HOME: a real app's front door
- A rich hero: a soft animated gradient (or a category-color mesh) behind a real app-icon tile and the big
  "Charades" large title.
- If a game is in progress, show a primary "Continue" and a secondary "New Game".
- Replace the plain "Team 1 0" chips with a standings card: team colors, mini bars, and a crown on the leader.

## 2) SETUP at 390px tall: two clean steps
Split Setup into two steps (or an iOS-style sheet with tabs) so nothing is cramped.

Step 1, "Choose a Deck":
- Large cards, about 150x100, in a horizontally scrolling or 3-4 column grid.
- Each card has its gradient, a bigger glyph, the name, and the card count.
- Mix comes first as the hero card, with the shimmer visible without scrolling.
- A clear selected state: a ring and a checkmark.

Step 2, "Round":
- The segmented timer control.
- Teams as an iOS inset grouped list: a color dot per team, tap to rename, swipe-to-delete (a Delete button as
  the fallback), and a "+ Add Team" row.
- Then a big Start pill.

Keep a visible title and a back chevron on each step.

## 3) PLAY
- In both light and dark mode, fill the screen behind the prompt with a deep version of the active category's
  color, not a plain black or gray page.
- Fade the bottom hint after the first card.
- Make the ring timer a bit bigger, with a thin track.

## 4) RECAP
- One clear headline ("Team 1 scored 3!"), with a little confetti on 3 or more.
- Guessed and passed lists.
- A standings card with animated bars, team colors and a crown.
- A card still on screen at time-up goes into the passed list as "Time's up" and is marked used.
- Drop the duplicate "Next up" text and keep only the button.

## 5) STATE
- Refreshing mid-round resumes at the prep screen for the same team, keeping that round's used cards. It should not
  go back to Home.

## 6) Scoring
- Pass stays at 0 points (traditional). No change.

## QC
- Rerun the full functional suite:
  - real-phone tilt values at angles 90 and 270
  - `qa/tilt_math_check.mjs`
  - `qa/shuffle_check.mjs`
- Add new checks:
  - refresh-resume: a mid-round reload lands on prep for the same team, with the used cards kept
  - the time-up card: it shows in the passed list as "Time's up" and is marked used
  - the tilt block is byte-identical to v4
- Light and dark screenshots at 844x390 for every screen (home, setup step 1, setup step 2, prep, play, recap),
  saved under `qa/v5/`, plus 1-2 shots at 932x430 and the portrait rotate overlay.
- Commit, push main to BryanRalston/charades (authorized; no other repo), wait for Pages, and verify live:
  `sw.js` serves `charades-v5` and the live QC passes.
- Add a "v5 polish" section to qa/REPORT.md covering:
  - what changed
  - the screenshot list
  - the index.html file size
  - test results
  - any gaps
- Close any headless browsers you start.
- Stop on 402. On a 429, wait ~1 min, retry once, then stop.
- End with one short summary: commit shas, live check, sw version, file size, test counts, and the screenshot
  folder.
