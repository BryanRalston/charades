# Charades feature map

Internal notes for this repo. The player page does not link here.

## What the game does

- Heads-up charades in the browser. The group sees a giant prompt while the player holds the phone to their forehead in landscape.
- Portrait shows a full-screen "Rotate your phone" overlay during the countdown and the round. Setup stays usable in portrait and asks the player to turn sideways.
- Tilt forward so the screen faces the floor: correct. Green flash, a soft rising chime, one point, and `navigator.vibrate` while the browser still treats the last tap as active. A later tilt does not call vibrate, because Chrome records an error when vibration is blocked. The Correct button vibrates on that tap.
- Tilt back so the screen faces the ceiling: pass. Orange flash, a soft low blip, and the next prompt. No point.
- A tilt counts once. Neutral is set during the 3-2-1 countdown, and only after readings stay within ±3° for 400 ms. The countdown waits until the phone is roughly upright. If no sensor reading arrives, the countdown still starts after the forehead pause so buttons and a desktop browser can play. A screen-angle change starts that calibration again. From the neutral pose, 35° face-down counts as correct and 35° face-up counts as pass. The phone must come back within 15° of that neutral pose, and at least 600ms must pass, before another tilt counts. The Correct and Pass buttons use the same 600 ms lockout. Cards do not resolve while the portrait overlay is up.
- Landscape-left (`screen.orientation.angle` 90) and landscape-right (270) are both mapped. Browsers report that angle counter-clockwise, so at 90 the phone's +x side points up. The signed tilt uses that corrected screen axis: positive means face-down. Upside-down portrait (180) and upright portrait (0) are mapped too.
- During the countdown and the round, a small status pill says "Tilt on" while a usable sensor event arrived in the last second, and "Tilt off, use buttons" otherwise.
- Adding `?debug=1` to the page address shows a live readout of beta, gamma, screen angle, up.z, pitch, neutral, delta, source, permission, events per second, and the last trigger. Without that flag the readout stays hidden.
- iPhone: "Tap to start" checks the deck and the teams first. A tap that will not start does not ask for sensor permission. When the tap will start, it calls `DeviceOrientationEvent.requestPermission()` and `DeviceMotionEvent.requestPermission()` synchronously, before any other async work, and a second tap is ignored until that request finishes. Listeners attach only after a grant. Android Chrome and desktop browsers have no permission call, so the listeners attach on load. A denial still starts the round. The grant is not saved; the next visit asks again. A start also requests fullscreen and `screen.orientation.lock('landscape')` where the browser allows it. A failure is ignored.
- Correct and Pass buttons are always on the play screen. Arrow down or right is correct. Arrow up or left is pass. Key repeat is ignored.
- Round length is 30, 60, or 90 seconds. The default is 60. A short "Hold to forehead" prep screen runs, then a 3-2-1 countdown. The ring timer uses `performance.now()` and turns red and pulses in the last 10 seconds. On Sports and Christmas & Easter the urgent digits and ring are white. The round ends at 0 with a short flourish. A screen wake lock is requested when play starts and again when the tab becomes visible. Hiding the tab pauses the round. A small ✕ on Play pauses too, with Resume and End round. A refresh during a round keeps the team's points and continues with the time left.
- Teams or players can be added, renamed, and removed (at least one, at most eight). Turns rotate after each round. Scores are running totals.
- The recap headline is the round score. It lists prompts guessed and prompts passed. A card still on screen when time runs out is marked used and listed under its real name with a gray "time's up" tag. Three or more points plays a short confetti burst. Standings show team colors, bars, and a crown for a team that is strictly ahead. A zero score keeps the name and the number at full contrast and dims only the bar.
- Teams, scores, whose turn it is, used prompts, the selected category, and the round length are stored in `localStorage` under `charades.v1`. A refresh keeps them. New game asks for confirmation, then clears that saved game.
- A prompt is used once it is guessed, passed, or still on screen when the timer hits zero. Each new card is drawn at random from the prompts not yet used, so a round is not the list in page order. A used prompt stays out until New game, or until a reshuffle lets it back in. Pass stays at 0 points.
- If the chosen category, or the whole mix, has no prompts left, the page says so and offers Reshuffle. Reshuffle returns the older used prompts and holds back the most recent 24, so the cards just played do not show up again right away. If 24 or fewer prompts were used, they all return. Mix does this across every category.
- Sixteen categories, in order, under the headings Christian, Classic, and Mix. Each category has at least 40 prompts. Mix deals from all sixteen and still skips prompts already used in the game. Each prompt belongs to only one category, so Mix does not deal the same words twice. The earlier category in the page keeps the prompt.
- Prompts are one word or a short two-to-three word phrase. Movie prompts are G or PG family titles only.
- One `index.html` file with inline CSS and JavaScript. No external fonts or CDNs. `sw.js` uses cache `charades-v6`. A navigation or `index.html` request tries the network first, waits about 2.5 seconds, then falls back to the cache, so a phone picks up a new build on weak Wi-Fi and still opens offline. Other same-origin files stay cache-first. The manifest, icons, and splash are cached with that version.
- Paths are relative so the same files work at the site root and at a project subpath.

## Known limits

- Prompt lists are fixed in the page. Players cannot add cards.
- No accounts, rooms, or shared scoreboard across phones.
- English only.
- Desktop and denied motion sensors play with buttons or arrow keys. The tilt test uses spec-style beta and gamma, not a live phone.
- If a phone's rotation lock keeps reporting screen angle 0 while the phone is held sideways, the corrected landscape mapping does not see an upright forehead pose. Turn rotation lock off, or use the buttons.
- The page encourages landscape. The yellow "Rotate your phone sideways" note hides when the phone is already landscape. The rotate overlay's `aria-hidden` is false only while that overlay is showing. Start calls `screen.orientation.lock('landscape')` where it is supported. If a phone's rotation lock keeps reporting screen angle 0, the mapping is unchanged.
- The service worker controls the page after the first successful load. It only caches same-origin GET responses. Navigations update that cache from the network when the response is OK and not a redirect.
- A refresh during a round resumes at the prep screen for the same team and keeps the time left. Prompts already guessed or passed stay used. The unspoken card is not restored and can be dealt again. The resume flag is `sessionStorage` key `charades.round`, and the remaining milliseconds are `charades.roundMs`. Neither is a new `localStorage` field. A finished round clears both, so a refresh then returns home. If the deck is already empty, the refresh stays on home and shows the empty-deck dialog. Resume keeps the team's points. An "Undo last card" chip appears for 5 seconds after a tilt. "Always use buttons" is an optional saved setting. Continue is shown only after a card has been played. Deleting a team can be undone for a few seconds, and the last team stays.
- Pass does not subtract a point.
- Audio and vibration depend on the device. A blocked audio context or a missing vibrate API is ignored.
- This file is not linked from the player UI.
- GitHub Pages serves this repo from `main` at https://bryanralston.github.io/charades/.
