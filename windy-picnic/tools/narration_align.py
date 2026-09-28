"""Trim each chosen narration phrase and measure its word timings with Whisper.

Usage:  python3 tools/narration_align.py        (needs faster-whisper)
Reads:  assets/audio/narration/segments/*.wav    (tools/narration_chatterbox.py)
Writes: assets/audio/narration/segments/segments.json  {id: {speaker, text, words: [[w, start, end]]}}

A phrase whose transcript does not match its script is reported, so a mumbled or
garbled take can't slip into the film unnoticed.
"""
import json, os, re, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEGDIR = os.path.join(ROOT, "assets", "audio", "narration", "segments")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from narration_chatterbox import SEGMENTS  # noqa: E402  (script text and speakers)


def norm_words(s):
    s = s.lower().replace("’", "'").replace("pooh", "pooh")
    return [w for w in re.sub(r"[^a-z' ]", " ", s).split() if w]


def trim(a, sr, pad_in=0.06, pad_out=0.25):
    env = np.abs(a)
    win = int(0.01 * sr)
    e = np.convolve(env, np.ones(win) / win, mode="same")
    thr = max(e.max() * 0.02, 1e-4)
    idx = np.where(e > thr)[0]
    i0 = max(0, idx[0] - int(pad_in * sr))
    i1 = min(len(a), idx[-1] + int(pad_out * sr))
    return a[i0:i1]


def main():
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    meta, bad = {}, []
    for sid, spec in SEGMENTS.items():
        path = os.path.join(SEGDIR, f"{sid}.wav")
        a, sr = sf.read(path)
        if a.ndim > 1:
            a = a.mean(axis=1)
        a = trim(a, sr)
        sf.write(path, a.astype(np.float32), sr)
        segs, _ = model.transcribe(path, beam_size=5, language="en", word_timestamps=True, initial_prompt="Pooh, Piglet.")
        words = [[w.word.strip(), round(w.start, 3), round(w.end, 3)] for s in segs for w in s.words]
        heard = norm_words(" ".join(w[0] for w in words))
        want = norm_words(spec["text"])
        if heard != want:
            bad.append((sid, " ".join(want), " ".join(heard)))
        meta[sid] = {"speaker": spec["speaker"], "text": spec["text"], "words": words}
        print(f"{sid:4s} {len(a) / sr:5.2f}s  {' '.join(w[0] for w in words)}")
    with open(os.path.join(SEGDIR, "segments.json"), "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    for sid, want, heard in bad:
        print(f"MISMATCH {sid}: script {want!r} / heard {heard!r}")


if __name__ == "__main__":
    main()
