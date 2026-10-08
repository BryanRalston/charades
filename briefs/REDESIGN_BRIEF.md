# Charades: redesign brief (from Bryan, via the Charades bot)

A full visual and interaction redesign, top of the line, like an app Apple built.

KEEP EXACTLY AS THEY ARE:
- gameplay
- data
- localStorage
- offline single-file setup
- the tilt fix (mapping, calibration, permissions, motion fallback)
- the ?debug=1 readout
- network-first loading

This is a visual and interaction pass only, plus one small content item at the end.

## Type
- System font stack: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif.
- Large-title headers, tight tracking on big text, clear hierarchy.
- The in-game prompt is huge, bold, and auto-fit with clamp() so it never wraps awkwardly.

## Layout
- Generous whitespace on an 8pt grid.
- Continuous rounded corners: about 20-28px on cards, 14px on buttons.
- Respect safe-area insets; use viewport-fit=cover.

## Materials
- Frosted-glass bars and sheets (backdrop-filter blur with a translucent fill).
- Soft layered shadows and 1px hairline borders.
- Light and dark mode via prefers-color-scheme, both polished.

## Color
- A calm neutral base with one vivid accent per category.
- Each category card gets a soft gradient and an inline-SVG glyph in an SF Symbols style: book, dove, star, cross,
  church, lamb, mountain, running figure, briefcase, ball, paw, broom, film, lamp, apple, sun.
- iOS-style grouped headers for Christian and Classic.
- Mix gets a special shimmering card.

## Controls
- An iOS segmented control for 30/60/90s.
- iOS-style list rows for teams: tap to rename, swipe or tap to delete, and a '+ Add Team' row.
- Full-width pill primary buttons.
- Pressed states scale to about 0.97.

## Motion
- Spring-like easing: cubic-bezier(.2,.8,.2,1).
- Cards slide between prompts.
- The 3-2-1 countdown scales and fades.
- Correct shows a full-screen green wash with a self-drawing checkmark. Pass shows an orange wash with a skip arrow.
- A circular progress-ring timer turns red and pulses for the last 10s.
- Honor prefers-reduced-motion.

## Feedback
- Short WebAudio tones: a soft rising chime for correct, a soft low blip for pass, and an end-of-round flourish.
- navigator.vibrate where supported.

## Screens
1. Home: big title 'Charades', a subtitle, the Play button, and a compact score summary.
2. Setup sheet: category grid, timer control, teams.
3. 'Hold to forehead' prep screen: an animated illustration of the tilt gestures, plus the Tilt on / Use buttons
   status.
4. Play: full-bleed prompt, ring timer, a small score chip, and discreet Correct/Pass buttons at the edges.
5. Recap: a card listing guessed cards (green check) and passed cards (gray), the round score, a 'Next up: Team X'
   button, and an animated standings leaderboard.

## Polish
- No layout shift.
- 60fps: animate transform and opacity only.
- 44pt minimum touch targets.
- A real app icon and splash in the manifest.
- theme-color matching the mode.
- apple-mobile-web-app-capable plus a status bar style, so it runs full screen from the Home Screen.

## Keep it fast
- Still one inline HTML file. No external fonts or CDNs.
- Ideally under about 150KB.
- Bump the sw.js cache to charades-v4.

## Content item (Miracles & Parables)
Drop the reworded duplicates added last round, keeping one of each:

| Keep | Drop |
| --- | --- |
| Wedding at Cana | Cana Wedding, Water to Wine |
| Loaves and Fish | Five Loaves, Two Fish, Bread Multiplied |
| Great Catch | Catch of Fish |
| Ten Lepers | Leper Healed |
| Two Blind Men | Healing Blind Eyes |

Also remove "Fantasia 2000" from Movies.

Keep 40+ cards per category and keep the no-cross-category-duplicates QC check.

## QC
- Screenshot every screen in light and dark mode on a landscape phone viewport (844x390), plus one portrait shot of
  the rotate overlay.
- Rerun all functional checks with the corrected real-phone tilt values (angle 90 and 270), plus the tilt math
  check and the shuffle check.
- Commit, push main to BryanRalston/charades (authorized; no other repo), wait for Pages, and verify live:
  sw.js serves charades-v4 and the live QC passes.
- Add a "Redesign" section to qa/REPORT.md covering:
  - what changed
  - the screenshot list
  - the index.html file size
  - test results
  - the new Miracles & Parables count
  - open limits
- Stop on 402. On a 429, wait ~1 min, retry once, then stop.
- End with one short summary: commit sha(s), live check, sw cache version, file size, test counts, Miracles &
  Parables count, and the screenshot folder.
