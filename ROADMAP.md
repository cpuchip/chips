# chips — roadmap & record

The record of the drive. Newest state at the top of each section.

## Live

- **chips.cpuchip.net** — Dokploy NOCIX compose `chips/games`, auto-deploy on push to main.
  `/version` = deploy oracle (must equal the pushed short-sha).

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
