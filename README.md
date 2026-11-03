# Exercise Timer

Interval timer (warm up / training / rest / cycles / break between cycles), all adjustable.
Static page (PWA), no build step, no runtime dependencies.

## Features
- Phases: warm up → (training → rest) × exercises per cycle → break between cycles → repeat; colour-coded, with a progress bar.
- Beeps at each phase start and a countdown at the end of each phase (5 s for training/rest, 3 s otherwise); a longer beep when the workout is done.
- Shows **next up** and **total time remaining**; the countdown is also shown in the browser tab title.
- **Mix with music**: on = Web Audio beeps that play over Spotify etc. (silent when the iPhone mute switch is on); off = media-style audio that also sounds in silent mode but pauses other music.
- **Mute beeps** toggle (works while running).
- Keeps counting with the screen off (wall-clock based; audio and screen wake lock are re-synced on return), works offline once installed.
- Settings are remembered on the device. Settings are locked while a workout is running or paused; press Reset to edit.

### Input limits
Training, exercises per cycle and cycles are at least 1; seconds fields go up to 3600, counts up to 99; total workout length is capped at 3 hours. Empty/invalid values fall back to the lower bound.

### Keyboard shortcuts
| Key | Action |
| --- | --- |
| `Space` | Start / pause / resume |
| `S` | Skip to the next phase |
| `R` | Reset (ignored while running, so a stray key can't end a workout) |

Shortcuts are ignored while typing in a field. All controls are reachable with Tab and have a visible focus ring; phase changes are announced to screen readers (the per-second countdown is not).

## Files
| File | Purpose |
| --- | --- |
| `index.html` | UI, styles, audio engines, state machine |
| `timer-core.js` | Pure logic shared by the browser and the tests: config clamping, plan building, beep schedule, WAV rendering, time formatting |
| `sw.js` | Service worker (stale-while-revalidate cache for offline use) |
| `manifest.webmanifest`, `icon-*.png` | PWA metadata |
| `tests/` | Unit tests (`core.test.js`) and browser tests (`e2e.test.js`) |

When you add or rename a file that must work offline, add it to the list in `sw.js` and bump the cache name (`et-vN`).

## Develop & test
```sh
npm install                      # only needed for the browser tests (Playwright)
npx playwright install chromium  # once
npm test                         # unit + browser tests
npm run test:unit                # unit tests only, no dependencies (Node 20+)
npm run serve                    # http://localhost:8000
```
Browser tests are skipped automatically if Playwright/Chromium isn't available. CI (`.github/workflows/test.yml`) runs everything on every push except `main` and on pull requests.

## Deploy
Push to `main`, then Settings → Pages → Source: GitHub Actions (`.github/workflows/pages.yml`).

## iPhone
Open the Pages URL in Safari → Share → Add to Home Screen.
