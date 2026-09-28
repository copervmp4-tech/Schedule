"""Place the narration phrases on the film timeline and derive the subtitles.

Reads  assets/audio/narration/segments/*.wav + segments.json   (tools/narration_chatterbox.py)
Writes build/narration_placed.wav      (48 kHz mono, each phrase loudness-matched)
       js/cues.js                      (timeline data shared with the animation)
       assets/subtitles.vtt / .srt     (English subtitles; the VTT marks who is speaking)

Each phrase is anchored to the picture: either its first word starts at a time, or a
named word lands on a moment (e.g. "Piglet" exactly as Piglet pops up), or it follows
the previous phrase after a short breath.
"""
import json, os, re
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import pyloudnorm as pyln

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEGDIR = os.path.join(ROOT, "assets", "audio", "narration", "segments")
SR = 48000
FILM_LEN = 60.0

# (segment, anchor): ("at", t) first word starts at t; ("word", w, t) word w starts at t;
# ("after", gap) starts gap seconds after the previous phrase's last word ends.
PLACE = [
    ("L0", ("at", 0.55)),
    ("L1a", ("at", 5.5)),
    ("L1b", ("word", "Piglet", 12.28)),
    ("L2a", ("at", 14.72)),
    ("L2b", ("after", 0.14)),
    ("L3a", ("at", 17.22)),
    ("L3b", ("after", 0.12)),
    ("L4", ("at", 19.95)),
    ("L5", ("at", 27.45)),
    ("L6a", ("at", 35.75)),
    ("L6b", ("after", 0.14)),
    ("L6c", ("after", 0.14)),
    ("L7", ("at", 43.35)),
    ("L8", ("at", 47.85)),
    ("L9", ("at", 51.5)),
]
SPEAKER_TAG = {"n": None, "pooh": "Pooh", "piglet": "Piglet"}

# Subtitle events: display lines, taken word by word from the spoken phrases in order.
# L0 is shown as the title card, so it is not repeated as a subtitle.
SUBS = [
    ["One breezy morning, Pooh laid out a picnic:", "a cloth, a pot of honey,"],
    ["and a space just the size of a Piglet!"],
    ["“For me?” asked Piglet."],
    ["“For us,” said Pooh."],
    ["But the wind, it seemed,", "wanted to come too."],
    ["So off they went, over the heather", "and under the pines,"],
    ["with the bees close behind,", "just in case."],
    ["“Perhaps…” said Pooh,", "“it knows somewhere nicer.”"],
    ["It did."],
    ["It wasn’t quite the picnic Pooh had planned."],
    ["But with Piglet beside him,", "it was a perfectly wonderful afternoon."],
]


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("’", "'"))


def fade(x, n, inout):
    n = min(n, len(x))
    r = np.linspace(0, 1, n)
    x = x.copy()
    if inout == "in":
        x[:n] *= r
    else:
        x[-n:] *= r[::-1]
    return x


def main():
    meta = json.load(open(os.path.join(SEGDIR, "segments.json")))
    meter = pyln.Meter(SR)
    track = np.zeros(int(FILM_LEN * SR))
    placed, stream = {}, []
    prev_end = 0.0
    for sid, anchor in PLACE:
        m = meta[sid]
        a, sr = sf.read(os.path.join(SEGDIR, f"{sid}.wav"))
        if a.ndim > 1:
            a = a.mean(axis=1)
        a = resample_poly(a, SR, sr)
        words = [w for w in m["words"] if norm(w[0])]
        first = words[0][1]
        if anchor[0] == "at":
            start = anchor[1] - first
        elif anchor[0] == "word":
            w = next(w for w in words if norm(w[0]) == norm(anchor[1]))
            start = anchor[2] - w[1]
        else:
            start = prev_end + anchor[1] - first
        # loudness-match each phrase (the final level is set in the mix); the narrator a
        # touch louder than the characters' quieter asides
        loud = meter.integrated_loudness(np.pad(a, (0, max(0, SR // 2 - len(a)))))
        target = -20.0 if m["speaker"] == "n" else -21.0
        a = fade(fade(a * 10 ** ((target - loud) / 20), 240, "in"), 2400, "out")
        i0 = int(round(start * SR))
        if i0 < 0:
            a, i0 = a[-i0:], 0
        track[i0:i0 + len(a)] += a[: max(0, len(track) - i0)]
        ws = [[w[0], round(start + w[1], 3), round(start + w[2], 3), m["speaker"], sid] for w in words]
        placed[sid] = {"start": round(start, 3), "speechStart": ws[0][1], "speechEnd": ws[-1][2], "speaker": m["speaker"]}
        if prev_end and ws[0][1] < prev_end + 0.08:
            print(f"WARNING {sid} starts {prev_end - ws[0][1]:.2f}s before the previous phrase ends")
        prev_end = ws[-1][2]
        stream += ws
    if prev_end > 57.3:
        print(f"WARNING narration ends at {prev_end:.2f}s, after the end plate begins")
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    sf.write(os.path.join(ROOT, "build", "narration_placed.wav"), track.astype(np.float32), SR)

    # subtitles: consume spoken words in order, matching them to the display words
    k = 0
    while k < len(stream) and stream[k][4] == "L0":  # the title line is on the title page
        k += 1
    subs = []
    for lines in SUBS:
        out_lines, flat = [], []
        for line in lines:
            row = []
            for dw in line.split(" "):
                if k >= len(stream):
                    raise SystemExit(f"ran out of spoken words at {dw!r}")
                sw = stream[k]
                if norm(dw) != norm(sw[0]):
                    print(f"note: display {dw!r} ~ spoken {sw[0]!r}")
                row.append({"w": dw, "t": sw[1], "e": sw[2], "sp": sw[3]})
                flat.append(row[-1])
                k += 1
            out_lines.append(row)
        text = "\n".join(lines)
        subs.append({"start": round(flat[0]["t"] - 0.3, 2), "end": round(flat[-1]["e"] + 0.7, 2), "text": text,
                     "lines": [[{"w": w["w"], "t": w["t"], "sp": w["sp"]} for w in row] for row in out_lines]})
    # never overlap; keep each on screen long enough to read (~17 chars/s, min 1.4 s)
    for i, s in enumerate(subs):
        nxt = subs[i + 1]["start"] - 0.06 if i + 1 < len(subs) else FILM_LEN
        need = max(1.4, len(s["text"]) / 17.0)
        s["end"] = round(min(max(s["end"], s["start"] + need), nxt), 2)

    cues = {"duration": FILM_LEN, "lines": placed, "subtitles": subs}
    with open(os.path.join(ROOT, "js", "cues.js"), "w") as f:
        f.write("// Generated by tools/build_cues.py - narration placement and subtitles (word timings, speakers).\n")
        f.write("window.CUES = " + json.dumps(cues, ensure_ascii=False) + ";\n")

    def ts(t, sep):
        h, mm = int(t // 3600), int(t % 3600 // 60)
        return f"{h:02d}:{mm:02d}:{t % 60:06.3f}".replace(".", sep)

    def vtt_text(s):
        rows = []
        for row in s["lines"]:
            parts, cur, buf = [], None, []
            for w in row:
                if w["sp"] != cur and buf:
                    parts.append((cur, " ".join(buf)))
                    buf = []
                cur = w["sp"]
                buf.append(w["w"])
            parts.append((cur, " ".join(buf)))
            rows.append(" ".join(f"<v {SPEAKER_TAG[sp]}>{txt}</v>" if SPEAKER_TAG[sp] else f"<v Narrator>{txt}</v>" for sp, txt in parts))
        return "\n".join(rows)

    with open(os.path.join(ROOT, "assets", "subtitles.vtt"), "w") as f:
        f.write("WEBVTT\n\n")
        for i, s in enumerate(subs, 1):
            f.write(f"{i}\n{ts(s['start'], '.')} --> {ts(s['end'], '.')}\n{vtt_text(s)}\n\n")
    with open(os.path.join(ROOT, "assets", "subtitles.srt"), "w") as f:
        for i, s in enumerate(subs, 1):
            f.write(f"{i}\n{ts(s['start'], ',')} --> {ts(s['end'], ',')}\n{s['text']}\n\n")
    for sid, v in placed.items():
        print(f"{sid:4s} {v['speaker']:7s} speech {v['speechStart']:6.2f} - {v['speechEnd']:6.2f}")
    for s in subs:
        print(f"{s['start']:6.2f}-{s['end']:6.2f}  {s['text']!r}")


if __name__ == "__main__":
    main()
