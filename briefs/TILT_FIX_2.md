# Charades: tilt fix 2 (overrides item 3 of TILT_FIX_BRIEF.md where they conflict)

The root cause is now confirmed. Apply everything here, then finish everything in both briefs.

## 1) ROOT CAUSE: mirrored landscape mapping (index.html ~L523-524)
- Browsers report `screen.orientation.angle` counter-clockwise, so at angle 90 the phone's +x side points up.
  The mapping is mirrored. Change it to:
  `if (angle === 90) sy = upX; else if (angle === 270) sy = -upX;`
- Right now an upright phone reads about +/-180 degrees. The first card auto-passes and nothing registers after it.
- Verified in node with the corrected mapping, at both angle 90 and angle 270:
  - upright reads 0
  - 30 degrees face-down reads +30
  - 30 degrees face-up reads -30
- Fix the POSES in `qa/headless_qc.mjs`. They use the same mirrored values, which is why the 44 checks passed.
  Use real-phone values and test both angles:
  - angle 90: upright `beta ~0, gamma ~-90`; face-down `[180, 50]`; face-up `[0, -50]`
  - angle 270: upright `[0, 90]`; face-down `[180, -50]`; face-up `[0, 50]`
- Item 3 of the first brief (calibrated pitch) can stay layered on top only if it agrees with this corrected
  mapping: neutral calibration, delta trigger, hysteresis and no-trigger-on-first-reading. If in doubt, use this
  corrected mapping. The tilt math unit test must cover angles 90 and 270 with the values above.

## 2) CACHE
- Bump `CACHE` in sw.js from `charades-v2` to `charades-v3` (plus the network-first navigation from brief 1).

## 3) CONTENT CLEANUP (traditional charades only)
- Remove filler prompts that read like clues:
  - Bible Stories: Sorry City, Running Prophet, Short Man Tree, Two Women, Boy Awake, Quiet Cave, Baby Cries,
    Night Leaving, Brothers Bow, Well Kindness, Extra Grain, Night Call, Faraway Queen, Family Reunion,
    Fish Swallow, Giant Soldier, Horns Blow, Door Shuts.
  - Miracles & Parables: Yes Then No, No Then Yes, Low Seat, Open Chairs, Kept Grudge, Come Forth, Little Girl Up,
    Mouth Coin, Fair Pay.
  - Christmas & Easter: Name Called, Go and Tell, Joyful Morning, Clean Feet, Folded Cloth.
- Collapse reworded duplicates, keeping ONE of each (the first listed):
  - Coin in Fish / Coin from Mouth
  - Man Through Roof / Mat Through Roof / Rolled Up Mat / Four Friends
  - House on Rock / Rock House / Wise Builder
  - House on Sand / Sandy House / Foolish Builder
  - Priceless Pearl / Costly Pearl
  - Hidden Treasure / Buried Treasure
  - Ten Lamps / Wise Lamps / Empty Lamps / Extra Oil
  - Prodigal Son / Lost Son Home / Father Runs / Best Robe
  - Ten Lepers / One Man Thanks / Thank You Return
  - Jairus Daughter / Girl Awakes
  - Calming the Storm / Quiet Storm
  - Walking on Water / Walking Wave
  - Persistent Widow / Widow Keeps Asking
  - Friend at Midnight / Knock at Midnight
  - Matching Socks / Pairing Socks / Shoe Pairing
  - Taking Out Trash / Emptying Trash
- Remove Dinah (not family-safe).
- Remove names and objects kids can't act: Othniel, Bezalel, Jochebed, Asa, Jehoshaphat, Manasseh, Ephraim,
  Obadiah, Phoebe, Apollos, Aquila, Melchizedek, Red Heifer, Mercy Seat, Hyssop Branch.
- Movies, remove: Turning Red, Lightyear, Strange World, Hotel Transylvania, Bedknobs and Broomsticks,
  all Shrek titles, Fantasia, The Karate Kid.
- Cross-category duplicates: keep each prompt in only ONE category, so Mix never repeats a prompt. Known cases:
  Red Sea, Olive Branch, Balaam's Donkey, Upper Room, Empty Tomb, Bethlehem Star, Wise Men, Fig Tree, Whale, Horse,
  Frog, Pig, Dog, Blowing Bubbles, Walking Dog, Bowling, Ice Skating, Jump Rope.
  Add a QC check that no prompt (case-insensitive, trimmed) appears in two categories.
- Replacements are fine if they're real, well-known, actable 1-3 word prompts. Every category must stay at 40+
  (keep the existing QC check).

## 4) Small fixes
- Hide the yellow "Rotate your phone sideways" note when the phone is already in landscape.
- Update docs/FEATURE_MAP.md. It wrongly says Pages is off and that the landscape mapping was correct.
- Keep the "Tilt on" / "Tilt off, use buttons" sensor status and the ?debug=1 readout from the first brief.

## Report and ship
- qa/REPORT.md "Tilt fix" section must also include:
  - the new per-category counts, with names exactly as they appear on the live page
  - the Mix total
  - the content-cleanup summary
  - the cross-category duplicate check result
- Re-run the full QC suite (`headless_qc.mjs` with the fixed POSES at 90 and 270, `shuffle_check.mjs`, and the
  tilt math check), commit, push main, wait for Pages, verify live (`sw.js` serves `charades-v3`), and re-run QC
  against the live URL.
- Stop on 402. On a 429, wait ~1 min, retry once, then stop.
- End with: commit shas, live check results, sw cache version, per-category counts and the Mix total.
