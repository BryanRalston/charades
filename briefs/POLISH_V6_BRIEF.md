# Charades v6 brief: touch-up + reliability (section A)

## Ground rules
- Bump the sw.js cache to `charades-v6`.
- These stay byte-identical to v5:
  - the tilt math block (`/* tilt-math-start */` ... `/* tilt-math-end */`)
  - onOrientation, onMotion, attachSensors, noteReading
  - the motion fallback
- Only two exceptions are allowed:
  - Calibration (beginCalibration / tryFinishCalibration, plus the minimal considerTilt hooks) may change, but ONLY
    as A2 below requires.
  - The start handler (onTapStart) may change, but ONLY as A3 below requires. requestPermission must stay the
    first async call, made synchronously in the tap.
- Keep the single inline file. No fonts or CDNs. Ideally under 150 KB.
- Keep localStorage, ?debug=1 and network-first loading as they are (A10 adds a timeout to the network-first loading).
- Pass stays at 0 points.

## Changes
1. **Recap.** The time-up card currently shows as a literal "Time's up" item. Show the actual card name (e.g.
   "Blanket Fort") with a small gray "time's up" tag or clock glyph beside it.
2. **Play colors.** Actions reads as muddy brown. Make every category's deep play color rich and saturated (e.g.
   Actions a deep orange, #C2410C to #EA580C). Check all 16 so none look brown, gray or muddy. Use a subtle radial
   gradient, not a flat fill. Keep the prompt text at strong contrast on every color.
3. **Team rows.** The name field shows a boxy input outline. Make it borderless so it looks like plain list text
   until tapped, with a focus ring only while editing.
4. **Light-mode recap and home.** Team 2's zero-score row is too faint. Keep zero rows at full text contrast and dim
   only the bar.
5. **Deck cards.** The glyph sits at a different height on some cards (Miracles & Parables, Christmas & Easter). Put
   the glyph, name and count on the same grid for every card, with names allowed 2 lines.
6. **Play hint.** Fade the bottom hint on Play after the first card, if that isn't already happening.


## A) Reliability and bugs (from three outside reviews; also part of v6)
1. **Wake lock and pause.** Request a screen wake lock (navigator.wakeLock) in beginPlay, and re-acquire it on
   visibilitychange. Auto-pause when the tab is hidden. Add a small ✕ on Play that pauses, with Resume / End round.
2. **Calibration** (the one place calibration logic may change):
   - Set neutral during the 3-2-1 countdown, and only once readings stay within ±3° for 400 ms.
   - Don't start the countdown until the phone is roughly upright on the forehead (show "Hold to forehead").
   - Recalibrate if screenAngle() changes mid-round.
   - Stop resolving cards while the portrait overlay is up.
3. **Start validation.** Validate category and teams BEFORE requestPermission, so the permission call is still the
   first async call in a handler that will actually start the game. Add a startLock against double taps.
4. **Button lockout.** Add a 600 ms lockout on the Correct/Pass buttons too (double taps currently score twice,
   ~L2123).
5. **Resume bug.** A mid-round refresh gives the same team a fresh full round while keeping its points
   (L1675-1693, 2178-2188). Resume with the remaining time, or void that round's points and restart it. Say which
   you chose.
6. **Timer.** Use performance.now() deltas and pause while hidden, instead of wall-clock time.
7. **Reduced motion.** Show the checkmark and skip icons statically. They currently stay invisible (L612-615 and
   766-771).
8. **Urgent timer on red decks.** On red decks (Sports, Christmas & Easter) the urgent timer is red on red. Use
   white with a pulsing ring instead.
9. **Continue and team delete.** Show "Continue" only after at least one card has been played (L1482). Add confirm
   or undo for team delete.
10. **sw.js.** Network-first with a ~2.5 s timeout, then fall back to cache (weak church Wi-Fi). Version the static
    assets too.
11. **fitPrompt.** Replace the while-loop (L1977-1991) with a single measure-and-scale step.
12. **Undo and buttons-only.** Show an "Undo last card" chip for 5 s after each tilt. Add an "Always use buttons"
    setting.
13. **Android.** Call requestFullscreen plus screen.orientation.lock('landscape') on start, where supported. Fix the
    rotate overlay's aria-hidden (L775).

## QC
- Run the full functional suite:
  - real-phone tilt at angles 90 and 270
  - tilt-math block and onOrientation/onMotion/attachSensors/noteReading byte-identical vs v5
  - the time-up card shows its real name, with the tag
  - refresh-resume
  - `qa/tilt_math_check.mjs`
  - `qa/shuffle_check.mjs`
- Add a test for every A item:
  - mocked wake lock re-acquired on visibilitychange
  - hidden-tab auto-pause and timer pause
  - the ✕ pause with Resume / End round
  - calibration stability gating and recalibration on an angle change
  - no resolving while the portrait overlay is up
  - validation before permission, and the startLock
  - the 600 ms button lockout
  - resume with the remaining time (or the voided round)
  - performance.now timer
  - the reduced-motion icons are visible
  - the urgent timer is white on red decks
  - Continue gating and the team-delete confirm/undo
  - the sw timeout fallback
  - fitPrompt with a single scale step
  - the undo chip and the Always-use-buttons setting
  - fullscreen and orientation lock called where supported
  - rotate overlay aria
- Take light and dark screenshots at 844x390, saved under `qa/v6/`:
  - play in at least 3 categories: Actions, one Christian category, and one other Classic category
  - recap
  - setup-round
  - setup-deck
  - home
- Make a contact sheet of all 16 categories' play backgrounds (`qa/v6/play-colors-contact.png`), to prove none are
  muddy.
- Commit, push main to BryanRalston/charades (authorized; no other repo), wait for Pages, and verify live: `sw.js`
  serves `charades-v6` and the live QC passes.
- Add a "v6 touch-up" section to qa/REPORT.md covering:
  - what changed
  - the screenshot list
  - the index.html file size
  - test results
  - any gaps
- Close any headless browsers you start.
- Stop on 402. On a 429, wait ~1 min, retry once, then stop.
- End with one short summary: commit shas, live check, sw version, file size, test counts, and the screenshot
  folder.
