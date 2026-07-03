# Heatsink UX notes — the one-screen redesign (2026-07-02)

Research + audit that drove the v1.1 layout. Sources at the bottom.

## Principles taken from the research

1. **Every element earns its screen space; contextual minimalism.** Show what the player
   needs *every second*; everything else is on-demand (tooltips, overlays) or momentary
   (toasts). Great game UI disappears.
2. **HUD zones.** Status: top. Persistent info: edges/corners. **Interaction: bottom, in
   the thumb arc.** The center stays visually calm so the action reads.
3. **Visual weight = priority.** The numbers that decide the game (your cards, the discard,
   whose turn) get size + contrast; bookkeeping (totals, deck count) goes small and dim.
4. **Balatro's zoning:** dark cool backdrop makes saturated cards pop; info left / status
   top / interaction bottom; background shifts announce mode changes; feedback is layered
   (motion + color + sound) rather than verbose.
5. **Mobile:** touch targets ≥44px; frequent actions in the bottom thumb arc; safe areas;
   test the smallest phone. Page never scrolls — if a strip overflows, IT scrolls, not the
   page.
6. **Same-family reference (skyjo.danteb.com):** side-by-side boards beat stacked; the
   active player's board is enlarged + outlined; one instruction line, prominent.

## Audit of v1.0 (measured, 4-player game)

| Viewport | Page height | Overflow (scroll) |
|----------|------------|-------------------|
| 1280×720 | 1080px | **+360px** |
| 390×844 (phone) | 1079px | **+235px** |

- Opponent boards rendered nearly as large as the player's own — status information
  occupying the interaction zone's budget. My grid (the only thing I can click) sat half
  below the fold on both viewports.
- Phone: opponents wrapped into a vertical stack (~500px) before the piles appeared.
- Mini card-back art was illegible noise at 24px.
- The page scrolled; the header scrolled away with it.

## The v1.1 layout

A fixed `100dvh` grid, page overflow hidden. Rows:

```
┌──────────────────────────────────────────┐
│ top bar: heatsink · round N · ⚠closer · Leave │  status zone (slim)
│ [opponent strip: compact mini-boards]     │  info zone (scrolls horizontally if crowded)
│                                           │
│    [stack] [discard] [held]  ← banner     │  action zone (calm center)
│                                           │
│ [ MY GRID — biggest thing on screen ]     │  interaction zone (thumb arc)
└──────────────────────────────────────────┘
```

- **Card size is height-aware:** `--card-w: clamp(40px, min(19vw, 9vh), 88px)` — three rows
  of my cards always fit; on phones width limits, on desktops height limits.
- **Opponents become status chips:** name + live heat + running total on one line, a flat
  mini-grid below (solid heat-colored slabs, no card art at mini size — value or blank).
  One horizontal row, never wraps; the strip itself scrolls when 5+ opponents.
- **Banner joins the piles row** — one action zone, minimal eye travel between "what's
  happening" and "what I can take."
- **Chrome cut:** per-opponent "total" line folded into the chip header; card legs hidden
  at small sizes; panel borders thinned; `touch-action: manipulation` everywhere tappable.
- Round-end / game-over stay as overlays (already one-screen).

## Verification

Playwright at 390×844, 768×1024, 1280×720, 1920×1080: screenshot + assert
`document.documentElement.scrollHeight <= window.innerHeight` mid-game with 3 opponents.

## Sources

- [Game UI/UX Design Principles: HUD, Menus, Feedback — StraySpark](https://www.strayspark.studio/blog/game-ui-ux-design-principles)
- [Balatro Design Analysis — cccChoice](https://medium.com/@yyh19971004/balatro-design-analysis-visual-packaging-and-interactive-feedback-cc6fa6a65370)
- [Balatro: Juicy Feedback — Blake Crosley](https://blakecrosley.com/guides/design/balatro)
- [The Card Games UI Design of Fairtravel Battle — GDKeys](https://gdkeys.com/the-card-games-ui-design-of-fairtravel-battle/)
- [A Technical Guide to Mobile Game UI/UX — Appnality](https://www.appnality.com/blog/guide-to-mobile-game-ui-ux-design/)
- [Game UI Design: Principles & Best Practices — Generalist Programmer](https://generalistprogrammer.com/tutorials/game-ui-design-best-practices)
- [UI and UX in Games — Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-guides/ui-and-ux-in-games-building-menus-huds-and-feedback-systems)
- [Deckbuilder UI Design Best Practices — Gunslinger's Revenge](https://www.gunslingersrevenge.com/posts/development/deckbuilder-ui-design-best-practices.html)
- Live references: skyjo.danteb.com (side-by-side boards, active enlarged), cardgames.io
  (one-screen table, controls bottom).
