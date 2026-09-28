"""Voice prompts for the narration: short synthetic clips made with Kokoro-82M (Apache-2.0).

Chatterbox (tools/narration_chatterbox.py) takes its voice timbre from these clips, so every
voice in the film is synthetic: no real person's voice is copied.

Usage:  python3 tools/narration_voice_prompts.py
Writes: assets/audio/narration/prompts/{narrator,pooh,piglet}.wav
"""
import os, warnings
warnings.filterwarnings("ignore")
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "narration", "prompts")

# role: (Kokoro voice, text read for the prompt, speed). The texts are original.
PROMPTS = {
    "narrator": ("bf_emma", "Once upon a time, in a corner of the forest, there lived a small and very round bear. Every morning he would sit outside his door, and wonder, quite seriously, what the day might bring.", 0.95),
    "pooh": ("bm_george", "Well, I don't know. I was just thinking. It seems to me that a little something, at about this time of day, would be a very good idea.", 0.9),
    "piglet": ("bf_lily", "Oh! Oh dear. I didn't expect that at all. Is it really, really for me? How very kind. Thank you ever so much.", 1.0),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    pipe = KPipeline(lang_code="b")
    for role, (voice, text, speed) in PROMPTS.items():
        audio = np.concatenate([r.audio.numpy() for r in pipe(text, voice=voice, speed=speed)])
        sf.write(os.path.join(OUT, f"{role}.wav"), audio, 24000)
        print(role, f"{len(audio) / 24000:.1f}s")


if __name__ == "__main__":
    main()
