"""Recorded foley for the film: fetch the CC0 recordings, cut the pieces the film needs,
and save them to assets/audio/foley/ (OGG Vorbis, 48 kHz), where tools/audio/foley.py
picks them up. Every source is CC0 (public domain dedication); see CREDITS.md.

The pieces are chosen by measurement rather than by ear: the loudest clean onsets for
one-shot sounds (a cloth flap, a rustle of grass), the steadiest stretch for beds and
loops (bees, birds, leaves), trimmed and faded so they sit in the mix without clicks.

Usage: python3 tools/audio/foley_prep.py   (downloads to $FOLEY_CACHE, default /tmp/foley_src)
"""
import io, os, subprocess, zipfile
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "audio", "foley")
CACHE = os.environ.get("FOLEY_CACHE", "/tmp/foley_src")
SR = 48000

# Freesound recordings (all CC0 1.0), fetched as their high-quality previews
FREESOUND = {
    "575899": ("VMan533", "Single bumblebee.WAV", "https://cdn.freesound.org/previews/575/575899_3283195-hq.ogg"),
    "397113": ("Kinoton", "Bumblebee In Lavender", "https://cdn.freesound.org/previews/397/397113_2247456-hq.ogg"),
    "640188": ("apintofmild", "Woodland Atmos 05 03-06-2022.wav", "https://cdn.freesound.org/previews/640/640188_9813501-hq.ogg"),
    "640186": ("apintofmild", "Woodland Atmos 02 03-06-2022.wav", "https://cdn.freesound.org/previews/640/640186_9813501-hq.ogg"),
    "518671": ("jackmichaelking", "Numerous birds in Essex Woodland.WAV", "https://cdn.freesound.org/previews/518/518671_6089496-hq.ogg"),
    "811988": ("richwise", "Blackbird (isolated)", "https://cdn.freesound.org/previews/811/811988_1481531-hq.ogg"),
    "523389": ("Anya_Media", "Forest, close up of trees rustling in the wind.wav", "https://cdn.freesound.org/previews/523/523389_2010973-hq.ogg"),
    "364712": ("alegemaate", "Rustling Grass", "https://cdn.freesound.org/previews/364/364712_2531187-hq.ogg"),
    "330639": ("leonelmail", "Cloth Flapping On A Clothesline Gently", "https://cdn.freesound.org/previews/330/330639_4437257-hq.ogg"),
    "330638": ("leonelmail", "Cloth Flapping On A Clothesline Thickly", "https://cdn.freesound.org/previews/330/330638_4437257-hq.ogg"),
    "580967": ("PelicanPolice", "Fabric flaps", "https://cdn.freesound.org/previews/580/580967_13110737-hq.ogg"),
}
# Kenney sound packs (CC0), https://kenney.nl
KENNEY = {
    "impact": "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
    "rpg": "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip",
}


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        subprocess.run(["curl", "-sSL", "-m", "300", "-A", "Mozilla/5.0", "-o", path, url], check=True)
    return path


def load(path, mono=True):
    a, sr = sf.read(path, always_2d=True)
    if sr != SR:
        g = np.gcd(SR, sr)
        a = resample_poly(a, SR // g, sr // g, axis=0)
    return a.mean(axis=1) if mono else a[:, :2] if a.shape[1] > 1 else np.repeat(a, 2, axis=1)


def kenney(pack, member):
    z = zipfile.ZipFile(fetch(KENNEY[pack], f"kenney_{pack}.zip"))
    name = next(n for n in z.namelist() if n.endswith("/" + member) or n == member)
    return load(io.BytesIO(z.read(name)))


def fs(sid, mono=True):
    return load(fetch(FREESOUND[sid][2], f"fs_{sid}.ogg"), mono)


def rms_db(x, win=0.02):
    m = x if x.ndim == 1 else x.mean(axis=1)
    w = int(win * SR)
    n = len(m) // w
    return 20 * np.log10(np.sqrt((m[: n * w].reshape(n, w) ** 2).mean(axis=1)) + 1e-9), w


def fade(x, fin=0.005, fout=0.03):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    ramp = lambda n: np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    if a:
        x[:a] = (x[:a].T * ramp(a)).T
    if b:
        x[-b:] = (x[-b:].T * ramp(b)[::-1]).T
    return x


def trim_quiet(x, below=45):
    """Cut leading and trailing silence (more than `below` dB under the peak)."""
    e, w = rms_db(x, 0.005)
    idx = np.where(e > e.max() - below)[0]
    return x[max(0, idx[0] * w - int(0.004 * SR)): min(len(x), (idx[-1] + 1) * w + int(0.02 * SR))]


def peak_norm(x, db=-1.0):
    return x / (np.abs(x).max() + 1e-9) * 10 ** (db / 20)


def rms_norm(x, db=-20.0):
    return x * 10 ** (db / 20) / (np.sqrt((x ** 2).mean()) + 1e-9)


def events(x, n, min_gap=0.4, max_len=0.7, pre=0.04, above=16):
    """The n strongest separate onsets in a recording, each cut until it has died away."""
    e, w = rms_db(x)
    floor = np.percentile(e, 20)
    rise = np.diff(e, prepend=e[0])
    cand = [i for i in range(1, len(e) - 1) if e[i] > floor + above and rise[i] > 4 and e[i] >= e[i - 1]]
    cand.sort(key=lambda i: -e[i])
    picked = []
    for i in cand:
        if all(abs(i - j) * w / SR > min_gap for j in picked):
            picked.append(i)
        if len(picked) == n:
            break
    out = []
    for i in sorted(picked):
        peak = i + int(np.argmax(e[i: i + int(0.1 * SR / w)]))
        end = peak
        while end < len(e) - 1 and e[end] > e[peak] - 30 and (end - i) * w / SR < max_len:
            end += 1
        a = max(0, i * w - int(pre * SR))
        out.append(fade(x[a: end * w], 0.004, 0.04))
    return out


def phrases(x, n, gap=0.35, min_len=1.2, max_len=3.5):
    """Whole phrases of song: stretches well above the background, with short breaths inside
    them bridged over; the n longest (up to max_len), in their original order."""
    e, w = rms_db(x, 0.02)
    on = e > np.percentile(e, 30) + 12
    runs, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and (on[j] or on[j: j + int(gap / 0.02)].any()):
                j += 1
            runs.append((i, j))
            i = j
        else:
            i += 1
    runs = [r for r in runs if min_len <= (r[1] - r[0]) * 0.02 <= max_len] or runs
    runs = sorted(sorted(runs, key=lambda r: -(r[1] - r[0]))[:n])
    return [fade(x[max(0, a * w - int(0.06 * SR)): b * w + int(0.15 * SR)], 0.03, 0.25) for a, b in runs]


def steady(x, length, hop=0.25):
    """The stretch of `length` seconds whose level is highest and steadiest (for loops)."""
    e, w = rms_db(x, 0.1)
    L = int(length / 0.1)
    best, bi = -1e9, 0
    for i in range(0, len(e) - L, max(1, int(hop / 0.1))):
        seg = e[i: i + L]
        score = np.median(seg) - 1.5 * np.std(seg) - 0.5 * max(0, np.median(seg) - seg.min() - 12)
        if score > best:
            best, bi = score, i
    a = int(bi * 0.1 * SR)
    return x[a: a + int(length * SR)]


def loopable(x, xf=0.5):
    """Crossfade the tail into the head so the piece loops without a seam."""
    n = int(xf * SR)
    head, body, tail = x[:n], x[n:-n] if len(x) > 2 * n else x[n:], x[-n:]
    k = np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    k = k[:, None] if x.ndim == 2 else k
    return np.concatenate([body, tail * (1 - k) + head * k])


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    sf.write(os.path.join(OUT, name + ".ogg"), np.asarray(x, np.float32), SR, format="OGG", subtype="VORBIS")
    print(f"  {name:22s} {len(x) / SR:5.2f}s")


def main():
    print("footsteps, cloth, paper, the pot, a soft fall (Kenney)")
    for i in range(5):
        save(f"step_{i}", peak_norm(trim_quiet(kenney("impact", f"footstep_grass_00{i}.ogg"))))
        save(f"pot_{i}", peak_norm(trim_quiet(kenney("impact", f"impactPlate_light_00{i}.ogg"))))
    for i in range(1, 5):
        save(f"cloth_{i - 1}", peak_norm(trim_quiet(kenney("rpg", f"cloth{i}.ogg"))))
    for i in range(1, 4):
        save(f"page_{i - 1}", peak_norm(trim_quiet(kenney("rpg", f"bookFlip{i}.ogg"))))
    save("book_open", peak_norm(trim_quiet(kenney("rpg", "bookOpen.ogg"))))
    falls = [trim_quiet(kenney("impact", f"impactSoft_heavy_00{i}.ogg")) for i in range(5)]
    save("soft_fall", peak_norm(max(falls, key=lambda f: np.sqrt((f[: int(0.1 * SR)] ** 2).mean()))))

    print("cloth flapping, grass, bees (Freesound)")
    for i, f in enumerate(events(fs("580967"), 6, min_gap=0.5, max_len=0.6)):
        save(f"flap_{i}", peak_norm(f))
    save("flutter_gentle", rms_norm(loopable(steady(fs("330639", mono=False), 12)), -20))
    save("flutter_thick", rms_norm(loopable(steady(fs("330638", mono=False), 12)), -20))
    for i, f in enumerate(events(fs("364712"), 4, min_gap=0.6, max_len=1.0, above=20)):
        save(f"grass_{i}", peak_norm(f))
    save("bee_0", rms_norm(loopable(steady(fs("575899"), 8), 0.3), -20))
    save("bee_1", rms_norm(loopable(steady(fs("397113"), 8), 0.3), -20))

    print("birds and leaves (Freesound, English woodland)")
    wood = np.concatenate([steady(fs("640188", mono=False), 30), steady(fs("640186", mono=False), 14)])
    save("birds_wood", rms_norm(loopable(wood, 1.0), -24))
    save("birds_clearing", rms_norm(loopable(steady(fs("518671", mono=False), 24), 1.0), -24))
    for i, f in enumerate(phrases(fs("811988"), 3)):
        save(f"blackbird_{i}", peak_norm(f))
    save("leaves", rms_norm(loopable(steady(fs("523389", mono=False), 40), 1.0), -24))


if __name__ == "__main__":
    main()
