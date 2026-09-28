"""Expressive narration with Chatterbox TTS (Resemble AI, MIT licence), run locally on CPU.

Each phrase is generated separately so it can be acted: the storyteller's lines warmly
and with rise and fall, Piglet's "For me?" small and breathless, Pooh's lines slow and kind.
Voice timbres come from the synthetic prompts in assets/audio/narration/prompts/.
The settings and seeds below are the takes chosen for the film, picked from about a hundred
candidates by measuring pitch movement, loudness dynamics and exact speech-recognition
read-back (the chosen takes themselves are kept in assets/audio/narration/segments/).

Setup (Chatterbox pins its own torch, so give it its own environment):
    python3 -m venv .venv-tts
    .venv-tts/bin/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
    .venv-tts/bin/pip install chatterbox-tts
Usage:
    .venv-tts/bin/python tools/narration_chatterbox.py
    python3 tools/narration_align.py
Chatterbox marks its output with an inaudible Perth watermark identifying it as AI speech.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPTS = os.path.join(ROOT, "assets", "audio", "narration", "prompts")
OUT = os.path.join(ROOT, "assets", "audio", "narration", "segments")

# id: speaker ('n' narrator, 'pooh', 'piglet'), text, exaggeration, cfg_weight, seed.
# The narrator's short tags ("asked Piglet.") come out flat when spoken alone, so they are
# read inside their whole line (`context`) and cut out at the silences either side (`cut`, s).
SEGMENTS = {
    "L0": dict(speaker="n", text="In which Pooh plans a picnic, and the wind comes too.", ex=0.7, cfg=0.6, seed=12),
    "L1a": dict(speaker="n", text="One breezy morning, Pooh laid out a picnic: a cloth, a pot of honey,", ex=0.85, cfg=0.6, seed=1),
    "L1b": dict(speaker="n", text="and a space just the size of a Piglet!", ex=0.6, cfg=0.9, seed=1),
    "L2a": dict(speaker="piglet", text="For me?", ex=0.7, cfg=0.75, seed=6),
    "L2b": dict(speaker="n", text="asked Piglet.", context='"For me?" asked Piglet.', cut=(0.96, 1.72), ex=0.5, cfg=0.6, seed=1),
    "L3a": dict(speaker="pooh", text="For us.", ex=0.5, cfg=0.9, seed=12),
    "L3b": dict(speaker="n", text="said Pooh.", context='"For us," said Pooh.', cut=(0.82, 1.43), ex=0.7, cfg=0.75, seed=13),
    "L4": dict(speaker="n", text="But the wind, it seemed, wanted to come too.", ex=0.8, cfg=0.6, seed=1),
    "L5": dict(speaker="n", text="So off they went, over the heather and under the pines, with the bees close behind, just in case.", ex=0.8, cfg=0.9, seed=12),
    "L6a": dict(speaker="pooh", text="Perhaps...", ex=0.7, cfg=0.9, seed=3),
    "L6b": dict(speaker="n", text="said Pooh,", context='"Perhaps," said Pooh, "it knows somewhere nicer."', cut=(0.72, 1.45), ex=0.5, cfg=0.6, seed=1),
    "L6c": dict(speaker="pooh", text="it knows somewhere nicer.", ex=0.6, cfg=0.6, seed=2),
    "L7": dict(speaker="n", text="It did.", ex=0.8, cfg=0.6, seed=1),
    "L8": dict(speaker="n", text="It wasn't quite the picnic Pooh had planned.", ex=0.7, cfg=0.6, seed=1),
    "L9": dict(speaker="n", text="But with Piglet beside him, it was a perfectly wonderful afternoon.", ex=0.9, cfg=0.9, seed=12),
}
PROMPT_FOR = {"n": "narrator", "pooh": "pooh", "piglet": "piglet"}
SPEAKER = {"n": "narrator", "pooh": "pooh", "piglet": "piglet"}


def main():
    import torch
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    os.makedirs(OUT, exist_ok=True)
    model = ChatterboxTTS.from_pretrained(device="cpu")
    for sid, s in SEGMENTS.items():
        torch.manual_seed(s["seed"])
        wav = model.generate(s.get("context", s["text"]), audio_prompt_path=os.path.join(PROMPTS, PROMPT_FOR[s["speaker"]] + ".wav"),
                             exaggeration=s["ex"], cfg_weight=s["cfg"], temperature=0.8)
        if "cut" in s:
            a, b = (int(x * model.sr) for x in s["cut"])
            wav = wav[:, a:b]
        ta.save(os.path.join(OUT, f"{sid}.wav"), wav, model.sr)
        print(sid, f"{wav.shape[-1] / model.sr:.2f}s")


if __name__ == "__main__":
    main()
