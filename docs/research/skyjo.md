# Skyjo — Rules Research

Research for chips' first game: a Skyjo-inspired card game we make our own.
Compiled 2026-07-02 from the sources listed at the bottom.

## What Skyjo is

Skyjo (Alexander Bernhardt, published by Magilano, 2015) is a light card game in the
**"golf" family** — lowest score wins. Each player manages a personal grid of 12 face-down
cards and spends the round swapping high cards out for low ones while managing hidden
information. 2–8 players (best 3–5), ~15 min per round, ages 8+, BGG complexity ~1.1/5.

Why it works: rules teach in under 5 minutes, every turn is a real decision
(known discard vs. unknown draw), and the column-elimination rule adds one tactical layer
that rewards planning without ever making the game heavy. High luck, real agency.

## The deck

150 cards, values −2 to 12:

| Value | Copies |
|-------|--------|
| −2    | 5      |
| −1    | 10     |
| 0     | **15** |
| 1–12  | 10 each (×12 values = 120) |

Total: 5 + 10 + 15 + 120 = 150. Note the fat zero count — "safe" boards are common by
design, and −2s are genuinely rare treasures.

## Setup

1. Deal 12 cards face-down to each player; arrange **4 columns × 3 rows** without looking.
   (Columns are 3 tall — that's what the column-of-three rule operates on.)
2. Rest of the deck is the draw pile; flip one card to start the discard pile.
3. Each player flips any 2 of their own cards face-up.
4. Highest sum of revealed cards goes first.

## A turn

Choose one:

**A. Take the top discard** (known card) → you **must** swap it into your grid, replacing
any card (face-up or face-down); the replaced card goes face-up onto the discard pile.

**B. Draw from the deck** (unknown card), look at it, then either:
   - **Swap** it into your grid (replaced card to the discard pile), or
   - **Discard** it — but then you **must flip one of your face-down cards** face-up.

Either way, every turn reveals information: a swap exposes what you replaced; a
discarded draw forces a flip. The round only ever marches toward full reveal.

## Column elimination (the signature rule)

If the three cards of one **vertical column** are all face-up and all the **same value**,
the whole column is immediately discarded — those cards score nothing. This:

- triggers whether the third match arrives by swap or by flip,
- applies **even during end-of-round reveal**,
- removes negative-value columns too (three −2s are gone, like it or not — it's a rule,
  not a choice).

Killing a column of 12s erases 36 points; deliberately "collecting" a column of high
matches is the main strategic arc of a round.

## Round end and scoring

- The round ends when one player's 12 cards are all face-up. **Every other player gets one
  final turn**, then all remaining face-down cards are flipped (column rule still applies).
- Everyone sums their face-up grid; that's the round score, added to a running total.
- **The closer's gamble:** if the player who ended the round does not have the lowest round
  score, their round score is **doubled** — and the doubling only applies if their score is
  positive.
- Game ends when someone crosses **100 total points**; lowest total wins.

**Ambiguity to settle for our implementation:** translations differ on whether the closer
must have the *strictly* lowest score (tie ⇒ doubled) or whether a tie is safe. Most
English rule writeups say "does not have the lowest score" without addressing ties.
We should pick one, state it in our rules, and consider making it a room option.

## Strategy shape (matters for AI opponents + balancing)

- Expected value of an unknown card ≈ **+3**; assume ~4–5 for planning conservatively.
- Keep cards ≤4; dump 10–12s on sight.
- Early game: blind draws are attractive (bad draw still buys information via forced flip).
- Collect matching mid/high cards in one column rather than micro-optimizing single swaps.
- Keep ~3 cards face-down late for flexibility; never close the round without estimating
  whether you're actually lowest (the doubling rule punishes overconfidence).
- Low player interaction overall — you race your own board; the discard pile is the only
  shared surface.

## Official variants

- **Skyjo Action (2019):** adds an action-card deck (peek at a row/column, swap within
  your grid, swap with another player, force-everyone-flips, take-any-discard, defense
  cards to block) and **star cards** (wildcards that complete columns; drawing/activating
  one lets you take an action card). Unused action cards score +10 at round end. More
  interaction, more chaos, 30–40 min.
- **Skyjo Junior:** simplified for young kids.
- **Big-group variant:** 9 cards in a 3×3 grid, one initial flip, supports more players.

## The family (adjacent games worth knowing)

- **Golf** — the public-domain ancestor; standard 52-card deck, 2×3 grid, match-two-in-a-
  column-for-zero. Skyjo is "Golf with better packaging" plus the custom deck.
- **Play Nine** — golf-family with a golf *theme*, 8 cards, pair-matching.
- **Cabo / Rat-a-Tat Cat** — hidden-grid memory games with peek/swap powers (Cabo's
  special abilities are a good reference for our own twist cards).
- **The Crew, MLEM** — not golf-family, but already analyzed in the workspace games
  research for mechanics that create trust/press-your-luck tension.

## Making it our own

Mechanics are not copyrightable, but **the SKYJO name, art, and rule text are protected**.
So: new name, new theme, original art, rules written in our own words, and at least one
mechanical idea that's genuinely ours. Directions to explore (proposals, not decisions):

1. **On-brand re-theme — "circuit board" (fits the chips suite):** you're assembling a
   chip; card values are **heat**. Lowest total heat wins. Negative cards are heatsinks.
   A matched column is an optimized module that gets etched away. Natural names:
   **Heatsink**, **Cooldown**, **Overclock**. The theme gives art direction (traces,
   solder, silicon) that no Skyjo clone has.
2. **A twist of our own** (pick one, keep it light):
   - *Draft-a-power:* completing a column grants a small one-shot power (peek / shield /
     nudge) — Skyjo Action's fun without a second deck.
   - *Shared objective card* per round ("first to clear a column of 7+" style bounties) —
     adds a race dimension without direct attack.
   - *Solo mode vs. house AI* with daily-seed leaderboard (same shuffle for everyone that
     day — very webby, very replayable).
3. **Design principles carried over from the workspace games research** (`games/` in the
   scripture-study workspace): fun first; mechanics should create the feeling, not the
   flavor text; prefer positive-sum interaction over take-that; always leave a redemption
   path (a bad early board should stay winnable — Skyjo's column rule already does this).

## Implementation notes (for when we build)

- Pure turn-based state machine — trivially serializable; server-authoritative MP is a
  message relay + validator, far simpler than orbit/deadweight's realtime sims.
- The whole game logic belongs in `shared/` with a headless oracle: deck composition test,
  column-elimination trigger cases (swap-completes, flip-completes, reveal-completes,
  negative column), closer-doubling cases, full simulated-game invariants (card
  conservation: grid + piles always sum to 150).
- AI opponent v1 is easy: EV-based greedy (swap if drawn card beats worst known/expected
  card; column-hunt heuristic). The strategy notes above are the spec.

## Sources

- [Official SKYJO Rules — officialgamerules.org](https://officialgamerules.org/game-rules/skyjo/)
- [Skyjo rules — gamerules.com](https://gamerules.com/rules/skyjo/)
- [How to Play Skyjo — Geeky Hobbies](https://www.geekyhobbies.com/how-to-play-skyjo-card-game-rules-and-instructions/)
- [Skyjo — BoardGameGeek](https://boardgamegeek.com/boardgame/204135/skyjo) (+ [deck-distribution thread](https://boardgamegeek.com/thread/2226327/card-number-distribution))
- [Skyjo overview + review + strategy — skyjo.info](https://www.skyjo.info/blog/skyjo-card-game-overview)
- [Skyjo vs. Golf comparison — huddlearoundgames.com](https://huddlearoundgames.com/skyjo-vs-golf/)
- [Skyjo review — coopboardgames.com](https://coopboardgames.com/cooperative-board-game-reviews/skyjo/)
- [Skyjo strategy — boostyourplay.com](https://boostyourplay.com/win-at-skyjo-12-tips-and-strategies-to-win-more-often/)
- [Skyjo Action rules — Geeky Hobbies](https://www.geekyhobbies.com/skyjo-action-rules/)
- [Skyjo deep dive — cardanoir.com](https://cardanoir.com/family-party-card-games/skyjo-card-game-the-low-score-battle-hiding-in-plain-sight/)
