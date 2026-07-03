# chips

A suite of single-player and multiplayer browser games — live at **chips.cpuchip.net** (soon).

The name is the pun: game chips + [cpuchip](https://cpuchip.net). Sibling of
[first-orbit](https://orbit.cpuchip.net) and [deadweight](https://deadweight.cpuchip.net).

## Games

| Game | Status | Notes |
|------|--------|-------|
| *(Skyjo-inspired card game)* | research | First on the table — see [docs/research/skyjo.md](docs/research/skyjo.md) |

## Vision

- **A suite, not a single game.** One deploy, one lobby, many games. Each game playable solo
  (vs. AI or pass-and-play) and multiplayer (rooms, like first-orbit / deadweight).
- **Family-friendly, fun first.** Games you'd actually pull out on game night.
- **Own IP.** Inspired-by is fine; mechanics aren't copyrightable — but names, art, and rule
  text are ours, original.

## Architecture (planned)

Follows the proven house harness:

- **Client:** Vite + Svelte 5, canvas/DOM per game's needs
- **Server:** Node `ws`, authoritative for multiplayer rooms; turn-based games are cheap to sync
- **Shared:** deterministic game logic in `shared/` with headless test oracles (the
  first-orbit/deadweight discipline — sim logic testable without a browser)
- **Deploy:** single container, Dokploy on push to main, `/version` build stamp as deploy oracle

## Development

*(scaffolding coming — this repo is brand new)*
