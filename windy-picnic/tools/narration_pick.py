"""Choose the narration takes by measurement (run in .venv-tts, after generating takes).

For every phrase in narration_chatterbox.SEGMENTS it scores each candidate take in a folder
of takes named <id>_c<cfg*100>_s<seed>.wav (see tools/audio/accent_check.py for the measures):
  - it must read back exactly (speech recognition against the script)
  - it must fit the picture: no more than 15% longer than the take it replaces
  - then: the most English accent (England-vs-US margin), no American r's, and lively pitch
Narrator tags read inside their whole line (`context`) are cut out at the pauses first.
The chosen takes go to assets/audio/narration/segments/; the settings are printed so they
can be written back into SEGMENTS.

Usage: .venv-tts/bin/python tools/narration_pick.py <takes-dir> [--write]
"""
import os, re, sys, json, shutil, tempfile
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "audio"))
from narration_chatterbox import SEGMENTS, OUT as SEGDIR  # noqa: E402
import accent_check as AC  # noqa: E402

# Short character lines can also be read inside a longer line and cut out, like the
# narrator's tags (takes named <id>X_...): the line around them steadies the delivery.
ALT_CONTEXT = {"L2a": "Oh! For me? Really?", "L6a": "Perhaps... it knows somewhere nicer."}


def trimmed_len(path):
    a, sr = sf.read(path)
    a = a.mean(axis=1) if a.ndim > 1 else a
    e = np.convolve(np.abs(a), np.ones(int(0.01 * sr)) / int(0.01 * sr), mode="same")
    idx = np.where(e > max(e.max() * 0.02, 1e-4))[0]
    return (idx[-1] - idx[0]) / sr if len(idx) else 0.0


def cut_tag(path, tag, out):
    """Cut the narrator's tag (e.g. 'asked Piglet') out of a take of the whole line."""
    a, sr = sf.read(path)
    ws = AC.words(path)
    want = [AC.norm(w) for w in tag.split() if AC.norm(w)]
    heard = [AC.norm(w) for w, _, _ in ws]
    for i in range(len(heard) - len(want) + 1):
        if heard[i: i + len(want)] == want:
            s0, e1 = ws[i][1], ws[i + len(want) - 1][2]
            prev_end = ws[i - 1][2] if i > 0 else 0.0
            nxt = ws[i + len(want)][1] if i + len(want) < len(ws) else len(a) / sr
            a0 = max(prev_end + 0.02, s0 - 0.08) if s0 - prev_end > 0.1 else (prev_end + s0) / 2
            a1 = min(e1 + 0.22, nxt - 0.03)
            sf.write(out, a[int(a0 * sr): int(a1 * sr)], sr)
            return round(a0, 3), round(a1, 3)
    return None


def main():
    takes = sys.argv[1]
    write = "--write" in sys.argv
    tmp = tempfile.mkdtemp()
    chosen = {}
    for sid, spec in SEGMENTS.items():
        ref_len = trimmed_len(os.path.join(SEGDIR, f"{sid}.wav"))
        rows = []
        for f in sorted(os.listdir(takes)):
            m = re.match(rf"{sid}(X?)_c(\d+)_s(\d+)\.wav$", f)
            if not m:
                continue
            path, cut = os.path.join(takes, f), None
            if "context" in spec or m.group(1):
                out = os.path.join(tmp, f)
                cut = cut_tag(path, spec["text"], out)
                if not cut:
                    continue
                path = out
            r = AC.check(spec["text"], path)
            dur = trimmed_len(path)
            short = dur < 1.0
            score = (0.35 if short else 1.0) * r["eng_us"] + 0.03 * r["pitch"] - 0.4 * abs(dur / ref_len - 1)
            if r["rhotic"] is not None:
                score -= 1.5 * max(0.0, r["rhotic"] - 0.12)
            ok = r["wer"] == 0 and dur <= ref_len * 1.15 + 0.05
            ctx = ALT_CONTEXT[sid] if m.group(1) else spec.get("context")
            rows.append((ok, score, f, path, cut, r, dur, int(m.group(2)) / 100, int(m.group(3)), ctx))
        rows.sort(key=lambda x: (not x[0], -x[1]))
        print(f"\n{sid} ({spec['speaker']}, was {ref_len:.2f}s): {spec['text']}")
        for ok, score, f, _, cut, r, dur, *_ in rows:
            rh = "  -  " if r["rhotic"] is None else f"{r['rhotic']:.2f}"
            print(f"  {'*' if ok else ' '} {f:24s} score {score:+.2f}  eng-us {r['eng_us']:+.2f}  rhotic {rh}  pitch {r['pitch']:.2f}  wer {r['wer']:.2f}  {dur:.2f}s")
        best = next((x for x in rows if x[0]), None)
        if best:
            chosen[sid] = dict(take=best[2], cfg=best[7], seed=best[8], cut=best[4], context=best[9], eng_us=round(best[5]["eng_us"], 3))
            if write:
                shutil.copy(best[3], os.path.join(SEGDIR, f"{sid}.wav"))
    print("\nchosen:", json.dumps(chosen, indent=1))


if __name__ == "__main__":
    main()
