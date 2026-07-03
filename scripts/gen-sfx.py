"""chips SFX — round 2: the three game-moment sounds the 2026-07-02 starter set
didn't cover (doubling burn, round chime, win fanfare). Import-the-module +
external-set pattern; seeds continue the chips block (708–710)."""

from pathlib import Path

from generate_sfx import generate

SERVER = "http://127.0.0.1:8189"
OUT = Path(__file__).parent / "outputs_chips2"

SFX = [
    {"name": "heat_double", "seconds": 1.8, "seed": 708, "loop": False, "lufs": -16,
     "neg": "music, melody, voice, harsh white noise",
     "prompt": "A hot electrical sizzle flaring up, a short crackling surge of heat with a "
               "deep whoomp of ignition underneath, punchy and dry, close perspective, "
               "ends quickly."},
    {"name": "round_chime", "seconds": 1.6, "seed": 709, "loop": False, "lufs": -16,
     "neg": "voice, noise, hiss",
     "prompt": "A soft warm two-note digital chime, gentle synthetic bell tones descending, "
               "rounded and pleasant, clean and dry, close perspective, short decay."},
    {"name": "win_fanfare", "seconds": 2.6, "seed": 710, "loop": False, "lufs": -16,
     "neg": "voice, vocals, noise, hiss",
     "prompt": "A short triumphant synth fanfare, three rising warm analog synthesizer notes "
               "ending on a bright sustained major chord with a soft shimmer, celebratory, "
               "clean, dry, close perspective."},
]

if __name__ == "__main__":
    for item in SFX:
        p = generate(SERVER, item, OUT)
        print(f"generated {item['name']} (seed {item['seed']}) -> {p}")
