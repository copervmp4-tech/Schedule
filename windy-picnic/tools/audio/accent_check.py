"""British-accent check for narration takes (run in .venv-tts).

Scores each take four ways, so takes can be chosen by measurement rather than by ear:
  eng-us   CommonAccent ECAPA (SpeechBrain) cosine margin, England minus US (> 0 = more English)
  rhotic   how far F3 dips inside words that Received Pronunciation says without an "r"
           (morning, for, nicer, perfectly, afternoon...): a dip well below the speaker's
           usual F3 means an American-style r. Reported as the mean dip, 0 = none.
  bath     F2/F1 balance of the first vowel of "afternoon": low = back ɑː (British), high =
           front æ (American); only for takes that say it
  wer      speech-recognition read-back error against the script
  pitch    pitch movement (semitone s.d.), to keep the storytelling lively

Usage: .venv-tts/bin/python tools/audio/accent_check.py "text" take1.wav [take2.wav ...]
"""
import os, re, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
import torch, torchaudio
import parselmouth
from faster_whisper import WhisperModel

ACCENT_DIR = os.environ.get("ACCENT_MODEL", "/tmp/sb_accent_src")  # local copy of Jzuluaga/accent-id-commonaccent_ecapa
# words RP says without r (not followed by a vowel in the script), and where the r would be
RHOTIC = {"morning", "for", "perhaps", "nicer", "somewhere", "perfectly", "wonderful", "afternoon", "over", "under", "heather"}
_clf = _labs = _asr = None


def norm(w):
    return re.sub(r"[^a-z']", "", w.lower())


def accent_margin(path):
    global _clf, _labs
    if _clf is None:
        from speechbrain.inference.classifiers import EncoderClassifier
        _clf = EncoderClassifier.from_hparams(source=ACCENT_DIR, savedir=ACCENT_DIR + "_run")
        enc = _clf.hparams.label_encoder
        _labs = enc.decode_ndim(torch.arange(len(enc.ind2lab)))
    w, sr = torchaudio.load(path)
    w = torchaudio.functional.resample(w.mean(0, keepdim=True), sr, 16000)
    cos = _clf.classify_batch(w)[0][0]
    return float(cos[_labs.index("england")] - cos[_labs.index("us")])


def words(path):
    global _asr
    if _asr is None:
        _asr = WhisperModel("small.en", device="cpu", compute_type="int8")
    segs, _ = _asr.transcribe(path, beam_size=5, language="en", word_timestamps=True, initial_prompt="Pooh, Piglet.")
    return [(w.word, w.start, w.end) for s in segs for w in s.words]


# said naturally, the -ed of "asked" all but disappears ("asked Piglet"): not a misreading
SAME = {"ask": "asked"}


def wer(ref, hyp):
    r = [norm(x) for x in ref.split() if norm(x)]
    h = [SAME.get(norm(x), norm(x)) for x in hyp if norm(x)]
    d = np.arange(len(h) + 1)
    for i, rw in enumerate(r, 1):
        prev, d[0] = d.copy(), i
        for j, hw in enumerate(h, 1):
            d[j] = min(prev[j] + 1, d[j - 1] + 1, prev[j - 1] + (rw != hw))
    return d[len(h)] / max(1, len(r))


def formants(snd):
    fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500)
    pitch = snd.to_pitch(time_step=0.005, pitch_floor=75, pitch_ceiling=600)
    ts = np.arange(0.01, snd.duration - 0.01, 0.005)
    f0 = np.array([pitch.get_value_at_time(t) for t in ts])
    F = np.array([[fm.get_value_at_time(k, t) for k in (1, 2, 3)] for t in ts])
    voiced = np.isfinite(f0) & np.all(np.isfinite(F), axis=1)
    return ts, f0, F, voiced


def check(text, path):
    snd = parselmouth.Sound(path)
    ts, f0, F, voiced = formants(snd)
    f3_ref = np.median(F[voiced, 2]) if voiced.any() else np.nan
    ws = words(path)
    dips, bath = [], None
    for w, a, b in ws:
        n = norm(w)
        m = voiced & (ts >= a) & (ts <= b)
        if m.sum() < 4:
            continue
        if n in RHOTIC:
            # an r pulls F3 down; take the lowest stretch of the word's vowels
            dips.append(max(0.0, 1 - np.percentile(F[m, 2], 10) / f3_ref))
        if n == "afternoon":
            first = m & (ts <= a + (b - a) * 0.3)
            if first.sum() >= 3:
                bath = float(np.median(F[first, 1] / F[first, 0]))
    st = 12 * np.log2(f0[voiced] / np.median(f0[voiced])) if voiced.any() else np.array([0])
    return dict(eng_us=accent_margin(path), rhotic=float(np.mean(dips)) if dips else None, bath=bath,
                wer=wer(text, [w for w, _, _ in ws]), pitch=float(np.std(st)), heard=" ".join(w.strip() for w, _, _ in ws))


if __name__ == "__main__":
    text = sys.argv[1]
    for p in sys.argv[2:]:
        r = check(text, p)
        f = lambda v, d=2: "  -  " if v is None else f"{v:+.{d}f}"
        print(f"{os.path.basename(p):28s} eng-us {f(r['eng_us'])}  rhotic {f(r['rhotic'])}  bath {f(r['bath'])}  wer {r['wer']:.2f}  pitch {r['pitch']:.2f}  | {r['heard']}")
