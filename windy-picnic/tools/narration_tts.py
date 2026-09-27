"""Generate the narration clips with Kokoro-82M (Apache-2.0), running locally.

Usage:  python3 tools/narration_tts.py
Writes: assets/audio/narration/L*.wav (24 kHz mono) + narration_tokens.json

Voice: `bf_emma` (British English), one storyteller voice for the whole film,
reading the characters' lines in the audiobook manner.
"""
import json, os, warnings
warnings.filterwarnings("ignore")
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "narration")
VOICE = "bf_emma"
POOH = "[Pooh](/pˈuː/)"   # force a clean "poo" (no aspirated 'h')

# id: (text for TTS, speed)
LINES = {
    "L0": (f"In which {POOH} plans a picnic, and the wind comes too.", 0.84),
    "L1": (f"One breezy morning, {POOH} laid out a picnic: a cloth, a pot of honey, and a space just the size of a Piglet.", 0.86),
    "L2": ("“For me?” asked Piglet.", 0.88),
    "L3": (f"“For us,” said {POOH}.", 0.84),
    "L4": ("But the wind, it seemed, wanted to come too.", 0.86),
    "L5": ("So off they went, over the heather and under the pines, with the bees close behind, just in case.", 0.88),
    "L6": (f"“Perhaps,” said {POOH}, “it knows somewhere nicer.”", 0.82),
    "L7": ("It did.", 0.84),
    "L8": (f"It wasn't quite the picnic {POOH} had planned.", 0.84),
    "L9": ("But with Piglet beside him, it was a perfectly wonderful afternoon.", 0.80),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    pipe = KPipeline(lang_code="b")
    meta = {}
    for key, (text, speed) in LINES.items():
        chunks, toks, off = [], [], 0.0
        for r in pipe(text, voice=VOICE, speed=speed):
            a = r.audio.numpy()
            for t in r.tokens or []:
                if t.start_ts is not None:
                    toks.append([t.text, round(off + t.start_ts, 3), round(off + (t.end_ts or t.start_ts), 3)])
            chunks.append(a)
            off += len(a) / 24000
        audio = np.concatenate(chunks)
        sf.write(os.path.join(OUT, f"{key}.wav"), audio, 24000)
        meta[key] = {"text": text, "speed": speed, "dur": round(len(audio) / 24000, 3), "tokens": toks}
        print(key, f"{meta[key]['dur']:.2f}s")
    with open(os.path.join(OUT, "narration_tokens.json"), "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
