# Charades feature map

Internal notes for this repo. The player page does not link here.

## What the game does

- Heads-up charades in the browser. The group sees a giant prompt while the player holds the phone to their forehead in landscape.
- Portrait shows a full-screen "Rotate your phone" overlay during the countdown and the round. Setup stays usable in portrait and asks the player to turn sideways.
- Tilt forward so the screen faces the floor: correct. Green flash, a short WebAudio beep, `navigator.vibrate` when the browser allows it, and one point.
- Tilt back so the screen faces the ceiling: pass. Orange flash and the next prompt. No point and no beep.
- A tilt counts once. The phone must come back within ±20° of upright, and at least 600ms must pass, before another tilt counts.
- Landscape-left (`screen.orientation.angle` 90) and landscape-right (270) are both mapped. Upside-down portrait (180) and upright portrait (0) are mapped too. The signed tilt uses beta and gamma in the screen's frame: positive means face-down.
- iPhone: the "Tap to start" button calls `DeviceOrientationEvent.requestPermission()` inside the click, before the round starts. If permission is denied or missing, the round still starts.
- Correct and Pass buttons are always on the play screen. Arrow down or right is correct. Arrow up or left is pass. Key repeat is ignored.
- Round length is 30, 60, or 90 seconds. The default is 60. A 3-2-1 countdown runs first. The last 10 seconds pulse. The round ends at 0.
- Teams or players can be added, renamed, and removed (at least one, at most eight). Turns rotate after each round. Scores are running totals.
- The recap lists prompts guessed and prompts passed that round.
- Teams, scores, whose turn it is, used prompts, the selected category, and the round length are stored in `localStorage` under `charades.v1`. A refresh keeps them. New game asks for confirmation, then clears that saved game.
- A prompt is used once it is guessed or passed. It is not dealt again until New game or Reshuffle. The card still on screen when time runs out is not marked used.
- If the chosen category, or the whole mix, has no prompts left, the page says so and offers Reshuffle. Reshuffle puts that category's used prompts back. Mix reshuffles every category.
- Sixteen categories, in order, under the headings Christian, Classic, and Mix. Mix deals from all sixteen and still skips prompts already used in the game.
- Prompts are one word or a short two-to-three word phrase. Movie prompts are G or PG family titles only.
- One `index.html` file with inline CSS and JavaScript. No external fonts or CDNs. `sw.js` and `manifest.webmanifest` cache the page, the manifest, and the icons so a second load can work offline.
- Paths are relative so the same files work at the site root and at a project subpath.

## Known limits

- Prompt lists are fixed in the page. Players cannot add cards.
- No accounts, rooms, or shared scoreboard across phones.
- English only.
- Desktop and denied motion sensors play with buttons or arrow keys. The tilt test uses spec-style beta and gamma, not a live phone.
- The page encourages landscape. It does not call `screen.orientation.lock`, because that call fails on many browsers.
- The service worker controls the page after the first successful load. It only caches same-origin GET responses.
- A refresh during a round returns to setup. Points already awarded and prompts already guessed or passed stay saved. The unspoken card can appear again.
- Pass does not subtract a point.
- Audio and vibration depend on the device. A blocked audio context or a missing vibrate API is ignored.
- This file is not linked from the player UI.
- GitHub Pages is not turned on from this tree. Publishing is a separate step.
