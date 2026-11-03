# Changes on `claude/improve-exercise-timer`

Five stages, one commit each (see `git log`). Existing defaults, saved settings (`et`, `et-mix` in localStorage) and workout behavior are unchanged unless listed under "Bug fixes".

## 1. Bug fixes (code review)
- **Settings validation**: training / exercises per cycle / cycles could be 0 (or empty), producing 0-second segments or an empty plan. Values are now clamped (min 1 for those three, 0 for the others; max 3600 s / 99 counts).
- **Display desync**: "循環 x/y · 動作 x/y" was read from the live inputs, which were unlocked while paused, so editing them mid-workout showed wrong numbers for the running plan. The display now uses a snapshot of the plan's settings, and settings stay locked while paused (until Reset/finish).
- **Skip on the last phase while paused** left the button saying "繼續" and settings locked; it now finishes properly ("開始", unlocked).
- **Wake lock**: pausing/resetting while the lock request was pending could leave the screen lock held; listeners were also added repeatedly. Fixed.
- **Unbounded workout length** could try to render a multi-hundred-MB WAV. Total is capped at 3 hours with a visible message.
- **Mix toggle** could be flipped mid-run (engine only switched on next start); it's disabled while running. Blob URL is released on Reset.
- **Service worker**: was cache-first forever (updates only via manual version bump). Now stale-while-revalidate, GET/same-origin only, `clients.claim()`.

## 2. Automated tests
- Pure logic moved from `index.html` to `timer-core.js` (no behavior change) so it can be tested in Node.
- `tests/core.test.js`: 16 unit tests (clamping, plan structure/offsets, `segAt`, beep schedule, WAV validity, time format).
- `tests/e2e.test.js`: Playwright + fake clock (full workout, pause/resume, skip, reset, clamping, length cap, persistence, plus later-stage features). Auto-skipped without Playwright.
- `package.json` scripts and `.github/workflows/test.yml` (CI). `.gitignore` for `node_modules`.

## 3. Accessibility & mobile
- **Contrast**: phase colors darkened so white text is ≥ 4.5:1 (warm was 2.2:1, training 3.3:1); secondary text uses an explicit muted color instead of opacity; control borders ≥ 3:1. Theme color updated.
- **ARIA**: `role="timer"`, `role="progressbar"` with values, polite live region announcing phase changes / pause / finish (not every second), decorative emoji hidden, `aria-describedby` on the mix option, `aria-keyshortcuts`.
- **Keyboard**: visible focus ring; `Space` start/pause, `S` skip, `R` reset (not while running); ignored inside inputs, no double-trigger on focused buttons.
- **Mobile layout**: `viewport-fit=cover` with safe-area insets on all sides, `100dvh`, 48 px buttons / 44 px inputs, numeric keypad (`inputmode`), fluid timer font size, labels no longer overflow at 320 px, landscape two-column layout, `prefers-reduced-motion`, `color-scheme`. Lock hint shown when settings are locked; legend clarified ("設定（時間單位：秒）").

## 4. Small features (additive)
- "接下來：<phase> <n> 秒 · 總剩餘 m:ss" line.
- Countdown in the tab title while running.
- "靜音嗶聲 Mute beeps" toggle (persisted as `et-mute`, effective immediately in both audio engines).

## 5. Docs
- README rewritten (features, limits, shortcuts, file map, testing, deploy). Manifest gets `lang`/`description`. This file.

## Notes / not done
- Audio behavior (iOS mute switch / Spotify mixing, screen-off beeps) can't be verified in headless Chromium; the tests check scheduling and state, not actual sound. Please sanity-check on a real iPhone.
- The Pages workflow still publishes the whole repo root (including `tests/`); harmless, but could be narrowed.
