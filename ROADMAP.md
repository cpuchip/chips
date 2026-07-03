# chips — roadmap & record

The record of the drive. Newest state at the top of each section.

## Live

- **chips.cpuchip.net** — Dokploy NOCIX compose `chips/games`, auto-deploy on push to main.
  `/version` = deploy oracle (must equal the pushed short-sha).

## v1.1 — the one-screen UX redesign, SHIPPED 2026-07-02

Research-driven relayout (`docs/ux-notes.md`): 100dvh zoned shell (status bar /
opponent chip strip / piles+banner action zone / my board in the thumb arc),
height-aware card sizing, flat mini-grids for opponents, page never scrolls.
Verified 0 overflow at 360×640 → 1920×1080; phone-playable (all targets ≥44px).
Michael's playtest feedback drove it ("keep everything on one screen… enable
play on the phones"). NOT yet done from the same research: the juice layer
(card flip/deal animations, etch spark, score count-up, SFX) — Balatro's
lesson says that's the next-biggest feel win.

## v1.2 — the juice layer, SHIPPED 2026-07-02

Sound + motion (Michael: "let the juice flow!… make sure theres a settings with an
option to turn off sounds"): 10 locally-generated audio assets (provenance:
`docs/assets.md`), WebAudio SFX diff-driven from state transitions
(`src/soundDiff.ts`), menu lofi bed at home/lobby only, ⚙ settings with persisted
sound-effects/music toggles. Animations: deal slide, 3D flip-in, cyan etch flash,
discard pop, mini pops, active-board breathing, round-end count-up, doubling shake;
`prefers-reduced-motion` disables all. Verified through the real UI to a game-over
overlay (doubling toast + ×2 + count-up), zero console errors. Michael's ears are
the final SFX-quality gate — re-roll any clip by seed via `scripts/gen-sfx.py`.

## Heatsink v1 — SHIPPED 2026-07-02

Council-ratified calls (Michael, 2026-07-02): faithful golf-family core ·
closer must be STRICTLY lowest or positive round score doubles (tie ⇒ doubled) ·
sleek dark-PCB art · bots from day one.

- `shared/heatsink/` engine: 150-card deck (−2..12 heat), 4×3 grids, flip-2 openings,
  take-discard / draw-then-place-or-toss turns, etch rule (matching columns vanish),
  closer's gamble, game over at 100. Seeded RNG throughout — deals replay exactly.
- EV-greedy bot on the redacted view (provably can't cheat); fills seats, plays solo
  tables, autopilots disconnected humans.
- ws server: public tables + private 4-letter codes, rejoin-by-key with auto-reattach,
  state persistence across redeploys, sweep GC.
- Svelte 5 client: home/lobby/game screens, dark-PCB theme, generated art
  (local asset-harness: logo, card back, table texture — seeds 7001–7003).
- Oracles: `npm run smoke` (61 engine assertions incl. bot-vs-bot sweeps),
  `npm run wstest` (19 over-the-wire assertions incl. redaction + autopilot).

## Next (unordered ideas, Michael's call on priority)

- **Playtest with the family** → balance/UX feedback drives v1.x.
- **Our twist as a table option:** etch grants a small one-shot power (peek/shield/nudge).
- **Daily-seed solo challenge:** same shuffle for everyone that day, local leaderboard.
- Card flip/deal animations; sound (asset-harness audio track is coming up).
- Per-card generated face art (asset-gen can do a coherent 15-value set).
- Spectators; turn timers as a table option; mobile layout polish.
- **Cooldown** and **Overclock** — the next games (names reserved, concepts open).
- MCP buddy (read tables / advise via chat) like first-orbit's, if wanted.

## Lessons kept

- Windows test-harness children: `kill()` only reaches the shell wrapper — `taskkill /T`
  AWAITED; stderr must be piped, not inherited, or an orphan holds the pipeline open.
- ws test clients: attach every listener at construction; an await gap between
  construction and listener setup silently loses events.
- Rigged mini-states can't satisfy full-deck conservation checks — compare before/after
  multisets instead.
- Trust live probes over stale snapshot files when the timeline looks impossible.
