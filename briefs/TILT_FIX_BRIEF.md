# Charades: tilt fix brief

Repo: C:\Users\bryma\dev\charades (public: https://github.com/BryanRalston/charades, main = e0cc8f0)
Live: https://bryanralston.github.io/charades/

## Bug
Bryan tested the live game on his real phone. Tilting does nothing; only the Correct/Pass buttons work.
We don't know if it was an iPhone or an Android phone, so the fix must work on BOTH iPhone Safari and Android Chrome.

## Likely root cause (verify it, don't take it on faith)
1. `tiltDegrees()` maps landscape with the wrong sign. With `screen.orientation.angle === 90`, the phone is turned
   counter-clockwise, so the device's RIGHT edge points up. In that pose a real phone reports gamma ~= -90, not +90.
   Earth-up in device coords is then upX = -cos(b)*sin(g) = +1, and the code's `sy = -upX` gives ~-1, so
   `atan2(-sz, sy)` sits near +/-180. |tilt| never drops under NEUTRAL_DEG, so the gate never resets: at most one
   random trigger, then nothing. The headless QC POSES use the same mirrored convention (90 uses gamma +90), which
   is why the 44 checks passed.
2. The tilt is absolute, with no calibration. If the phone's rotation lock keeps the screen angle at 0 while the
   phone is held sideways, `sy = upY ~= 0`, so the value is noise near +/-90 and again never neutral.
3. Nothing on screen says whether sensor events are arriving at all, so we can't tell a permission or event failure
   from a mapping failure.

## Required changes

### 1. iOS permission (Start/Play tap)
- Inside the Start/Play click handler, call `DeviceOrientationEvent.requestPermission()` and, if motion is used,
  `DeviceMotionEvent.requestPermission()` SYNCHRONOUSLY, as the first thing the handler does. No `await`, promise,
  timer or async helper may run before either call. Start both calls before awaiting either result.
- Attach the sensor listeners only after the result is `'granted'`. On browsers without `requestPermission`
  (Android Chrome, desktop), attach them right away.
- Don't remember the grant across reloads. After any page reload or restart, ask again on the next Start tap.
  It's fine to ask on every Start tap; iOS answers instantly once granted.
- If permission is denied or throws, show the "Tilt off, use buttons" status (see 4) and keep playing with the buttons.

### 2. Event sources
- Listen to `'deviceorientation'` on `window`. Don't gate it on `'ondeviceorientation' in window`,
  `window.DeviceOrientationEvent` or any other feature check that can be false or unreliable on Android Chrome.
  Just add the listener.
- Ignore events whose beta and gamma are null. Desktop Chrome fires one of those.
- Fallback: if no usable deviceorientation event arrives within about 1 s of play starting, also use
  `'devicemotion'` with `accelerationIncludingGravity`. Normalize the vector, using the spec sign: lying flat and
  face-up gives z ~= +9.8. Use it as the up vector.
- If both sources work, prefer orientation and keep motion as a live backup.

### 3. Mapping: screen-angle independent, calibrated, no wraparound
Recommended approach (it removes both the landscape sign bug and the gamma +/-90 wraparound):
- Compute the Earth-up unit vector in device coordinates:
  - from orientation: `up = [-cos(b)*sin(g), sin(b), cos(b)*cos(g)]`
  - from motion: `a / |a|`
- Forward/back tilt on the forehead is the screen normal turning toward the floor or the sky. Use
  `pitch = asin(clamp(up.z, -1, 1))` in degrees. It runs from -90 to +90, is continuous, and doesn't depend on
  landscape-left vs landscape-right or on rotation lock. So the gamma wraparound and the sign flip between 90 and
  270 can't make the threshold unreachable. Upright on the forehead gives pitch ~= 0. Screen toward the floor gives
  negative pitch. Screen toward the sky gives positive pitch.
- Still read the screen angle (`screen.orientation.angle`, falling back to `window.orientation`, then to
  width > height) for the debug readout and any rotate-to-landscape UI. If you keep an angle-based gamma mapping
  anywhere, note the correct convention: angle 90 gives neutral gamma ~= -90, and angle 270 gives ~= +90.
- Calibration: once the countdown ends and play starts, average the first ~300 ms (at least 5 readings) of pitch
  as `neutral`. Recalibrate at the start of every round.
- Trigger when `delta = pitch - neutral` crosses 35 degrees:
  - delta <= -35 (screen tips toward the floor, "face-down") = CORRECT
  - delta >= +35 (screen tips toward the sky, "face-up") = PASS
  This keeps the current on-screen help ("Tilt face-down: correct. Tilt face-up: pass.").
- Hysteresis: after a trigger, the next trigger needs a return to |delta| <= 15 first. Keep the 600 ms debounce.
  Don't let the very first reading of a round trigger anything; the old gate started as "neutral", so a bad
  first reading could fire.
- Make sure 35 degrees is reachable even if the neutral pose isn't exactly vertical. If |neutral| > 50, clamp the
  neutral to +/-50 so the user can still reach the threshold in at least one direction.

### 4. On-screen sensor status during play
- Show a small, unobtrusive pill during countdown and play:
  - "Tilt on" while usable sensor events arrived in the last ~1 s
  - "Tilt off, use buttons" otherwise (no events, permission denied, or a desktop without sensors)
- Update it live, so it changes if events start or stop.

### 5. Hidden debug readout: `?debug=1`
- Only when the URL has `debug=1`, show a small live overlay during play (and setup) with:
  beta, gamma, screen angle, up.z / pitch, neutral, delta, source (`orientation` | `motion` | `none`),
  permission result, events per second, and the last trigger.
- Without `?debug=1`, nothing is shown and nothing changes.

### 6. Service worker so phones actually get the new build
- Bump `CACHE` in sw.js from `charades-v2` to `charades-v3`.
- The current fetch handler is cache-first for everything, so a phone that already has v2 keeps serving the old
  index.html on the first reload. Make navigations / index.html network-first with cache fallback (offline still
  works), keep `skipWaiting()`, and add `clients.claim()` in activate.

## Tests (run before commit)
1. Add `qa/tilt_math_check.mjs`, pure Node with no browser, that imports or copies the exact mapping functions and
   checks with simulated values:
   - Angle 90 (realistic convention): neutral `[beta 0, gamma -90]`; face-down `[180, 50]` must give delta <= -35
     (CORRECT); face-up `[0, -50]` must give delta >= +35 (PASS); a small tilt `[0, -80]` must give no trigger.
   - Angle 270: neutral `[0, 90]`; face-down `[180, -50]` gives CORRECT; face-up `[0, 50]` gives PASS; small
     `[0, 80]` gives nothing.
   - Also the old mirrored convention (90 with gamma +90): it must still work, because the math is angle-independent.
   - Rotation lock (angle reported 0 while sideways) must give the same results.
   - The wraparound path: sweep gamma through +/-90 and beta through +/-180 with no jump in pitch bigger than a
     few degrees.
   - The motion fallback: gravity vectors for neutral, face-down and face-up give the same triggers.
   - Hysteresis and debounce: hold, no-return, and return-then-trigger cases.
2. Update `qa/headless_qc.mjs`:
   - fix POSES to the realistic convention (keep one run with the old convention too)
   - add checks for the status pill ("Tilt on" after events, "Tilt off, use buttons" with no events)
   - add a check for the `?debug=1` overlay (present with the flag, absent without)
   - add a check that the motion fallback triggers when only devicemotion events are fired
   - add a check that the iOS path calls `requestPermission` synchronously in the click (a stub that records
     whether it was called before the click handler returned)
3. Re-run the full existing QC suite (`qa/headless_qc.mjs` and `qa/shuffle_check.mjs`) locally. Everything must pass.

## Ship
- Commit (clear message), push `main` to BryanRalston/charades. Pushing to this repo is authorized; don't touch
  any other repo.
- Wait for the GitHub Pages deploy to finish, then verify live:
  - curl https://bryanralston.github.io/charades/ and https://bryanralston.github.io/charades/sw.js, and confirm the
    new code is served (e.g. "Tilt off, use buttons", "debug", and `charades-v3`)
  - re-run `CHARADES_URL=https://bryanralston.github.io/charades/ node qa/headless_qc.mjs` against the live URL
- Add a "Tilt fix" section to `qa/REPORT.md` covering:
  - the root cause
  - what changed
  - test results (math check plus live QC counts)
  - the new sw cache version
  - how to use `?debug=1`
  - what still needs a real-phone test (iPhone Safari permission prompt, Android Chrome, motion fallback sign on a
    real device, threshold feel)
  Commit and push that report too.
- Stop on any 402 or credit error. On a 429, wait ~1 min, retry once, then stop.
- Finish with one short summary: commit sha(s), live check results, sw cache version.
