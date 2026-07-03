# Asset provenance

All art and audio is generated on a local, license-clean pipeline (Dave's
asset-harness: ComfyUI). Deterministic seeds — rerunning a seed reproduces the asset.

## Art (Z-Image Turbo + ControlNet + BiRefNet — Apache-2.0/MIT chain)

| Asset | Seed | Notes |
|-------|------|-------|
| `assets/logo.png`, `favicon.png` | 7001 | chip mark, glowing copper die |
| `assets/card-back.png` | 7002 | PCB card back |
| `assets/table-bg.webp` | 7003 | dark board texture |

## Audio

SFX generated with **Stable Audio 3 Medium Base** — Stability AI Community License
(free commercial < $1M org revenue; we own the outputs; stack bundles the T5Gemma
text encoder under the Gemma Terms — recorded here per the harness discipline).
Music generated with **ACE-Step 1.5** (MIT), instrumental only. Post-processing:
loudnorm + trim/loop via the harness `optimize_audio.py`.

| File | Seed | Event |
|------|------|-------|
| `sfx/card_deal.ogg` | 702 | new round dealt |
| `sfx/card_flip.ogg` | 701 | draw / reveal |
| `sfx/card_place.ogg` | 703 | card lands on the discard |
| `sfx/chip_click.ogg` | 704 | (reserve: UI click) |
| `sfx/ui_confirm.ogg` | 705 | your-turn cue |
| `sfx/cooldown_vent.ogg` | 706 | column etched |
| `sfx/heat_double.ogg` | 708 | closer's heat doubled |
| `sfx/round_chime.ogg` | 709 | round settled |
| `sfx/win_fanfare.ogg` | 710 | you won the game |
| `sfx/chips_menu_lofi.ogg` | 801 | menu bed (home/lobby only, loop) |

Sound is user-controllable: the ⚙ settings popover has independent toggles for
sound effects and menu music, persisted per browser (`chips-sfx`, `chips-music`).
