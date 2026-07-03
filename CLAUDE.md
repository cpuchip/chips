# chips — Claude Code project context

A suite of single-player and multiplayer browser games, live at
**chips.cpuchip.net**. Its own git repo (`github.com/cpuchip/chips`), nested in
the `scripture-study` workspace at `projects/chips/` and gitignored from the
parent. Sibling of first-orbit and deadweight; built on the same house harness
and the same discipline. Michael owns intent/vision (game choice, names, themes,
rules divergences); the agent owns the code within it.

## Games

- **Heatsink** — golf-family card game (Skyjo-inspired, made our own). You're
  assembling a chip; card values are heat; lowest total heat wins. Research:
  `docs/research/skyjo.md`. Ratified rules calls (2026-07-02 council): faithful
  core for v1 · round-closer must be STRICTLY lowest or their positive round
  score doubles (tie ⇒ doubled) · dark-PCB art direction · bots from day one.
- **Cooldown**, **Overclock** — reserved names for future games in the suite.

## The shape of the thing

- **`shared/`** — deterministic game engines, pure TypeScript, imported by BOTH
  client and server. No `Date.now()`, no bare `Math.random()` — RNG is injected
  (seeded mulberry32 in `shared/rng.ts`) so deals replay and tests are exact.
  `shared/heatsink/` holds types, deck, engine (state machine), bot, and
  `smoke.ts` (the oracle).
- **`server/`** — `ws` authoritative server: table registry (public tables +
  private 4-letter join codes), per-table engine instance, action validation,
  bot seats, redacted state broadcast (face-down card values NEVER leave the
  server). Serves `dist/` + same-origin `/ws` + `/healthz` + `/version`.
  `wstest.ts` is the over-the-wire oracle.
- **`src/`** — Svelte 5 client, DOM/CSS rendering (cards are DOM, not canvas).
  Suite home → game picker → table browser → play view.
- **`scripts/gen-assets/`** — Gemini (Nano Banana) asset pipeline; `.env` holds
  `GEMINI_API_KEY`.

## The discipline (inherited from first-orbit/deadweight)

1. **Build the oracle first.** New engine capability gets an assertion in
   `smoke.ts` (or `wstest.ts`) before/with the feature.
2. **Inverse hypothesis.** Include assertions that MUST fail/throw (illegal
   moves rejected); a test that can't fail proves nothing.
3. **The published artifact is the test.** `npm run build` then verify in a real
   browser (playwright-cli skill); dev mode hides prod-only crashes.
4. **`/version` is the deploy oracle.** `curl chips.cpuchip.net/version` must
   equal the pushed short-sha before a deploy is "done."
5. **Redaction is a security oracle.** wstest asserts face-down values are
   absent from client-visible state.

## Gates (run before every commit)

```bash
npm run smoke && npm run wstest && npm run compile && npm run build
```

Green all four, then commit. Pushing `main` auto-deploys via Dokploy.

## Conventions

- `.npmrc` sets `legacy-peer-deps=true`; use `npm ci --legacy-peer-deps`.
- Heatsink grid is column-major: 4 columns × 3 rows, cell index = col*3 + row.
- Keep `ROADMAP.md` current — it's the record of the drive. Workspace journal +
  memory live under the parent's `.spec/journal/` and memory.
