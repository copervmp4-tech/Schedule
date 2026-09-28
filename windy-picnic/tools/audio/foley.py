"""Recorded foley in place of the synthesised effects (tools/audio/sfx.py).

The pieces in assets/audio/foley/ are real recordings, all CC0 (see foley_prep.py and
CREDITS.md): footsteps in grass, cloth, paper, a ceramic crock, a soft fall, flapping
cloth, rustling grass and leaves, bumblebees, and English woodland birds.

Each function keeps the signature of the synthesised effect it replaces, and each piece is
matched in loudness to that effect, so the mix balance tuned in build_audio.py still
holds and only the sound itself changes. The wind (which follows the film's own wind
curve) and the tiny honey "plip" stay synthesised; anything not defined here falls through
to sfx.py.
"""
import os
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import sfx as _synth

SR = _synth.SR
DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assets", "audio", "foley")
_CACHE = {}
stereo, lp, hp, bp, norm = _synth.stereo, _synth.lp, _synth.hp, _synth.bp, _synth.norm


def __getattr__(name):  # everything else: the synthesised version
    return getattr(_synth, name)


def clip(name, mono=True):
    key = (name, mono)
    if key not in _CACHE:
        a, sr = sf.read(os.path.join(DIR, name + ".ogg"), always_2d=True)
        assert sr == SR, name
        _CACHE[key] = a.mean(axis=1) if mono else a
    return _CACHE[key].copy()


def pitch(x, semis):
    """Shift pitch (and length) by resampling, as a tape would."""
    if abs(semis) < 1e-3:
        return x
    num, den = 1000, int(round(1000 * 2 ** (semis / 12)))
    return resample_poly(x, num, den, axis=0)


def loud(x):
    """Level of the audible part of a clip (frames within 30 dB of its loudest)."""
    m = x if x.ndim == 1 else x.mean(axis=1)
    w = int(0.01 * SR)
    n = max(1, len(m) // w)
    e = np.sqrt((m[: n * w].reshape(n, w) ** 2).mean(axis=1) + 1e-12)
    return np.sqrt((e[e > e.max() * 10 ** (-30 / 20)] ** 2).mean())


def match(x, ref):
    """As loud as the synthesised effect. Real transients (a page, a flap) can peak far above
    it at the same loudness, which the tuned levels never allowed for, so any peak more than
    2 dB over the synthesised one is rounded off with a soft saturation."""
    y = x * loud(ref) / (loud(x) + 1e-12)
    cap = np.abs(ref).max() * 10 ** (2 / 20)
    if np.abs(y).max() > cap:
        y = cap * np.tanh(y / cap)
    return y.astype(np.float32)


def match_mean(x, ref):
    """For beds: the same energy over the whole length (the synthesised beds are sparse)."""
    r = lambda a: np.sqrt((np.asarray(a, np.float64) ** 2).mean() + 1e-12)
    return (x * r(ref) / r(x)).astype(np.float32)


def fit(x, d, fade_out=0.03):
    """Cut or pad a one-shot to d seconds, with a soft tail."""
    n = int(d * SR)
    y = np.zeros((n,) + x.shape[1:], np.float32)
    y[: min(n, len(x))] = x[:n]
    k = min(n, int(fade_out * SR))
    y[n - k:] = (y[n - k:].T * np.linspace(1, 0, k)).T
    return y


def tile(x, n, start=0):
    """A loop, played from `start`, repeated to n samples."""
    reps = int(np.ceil((n + start) / len(x))) + 1
    return np.concatenate([x] * reps)[start: start + n]


def layer(*parts):
    n = max(len(p) for p in parts)
    y = np.zeros(n, np.float32)
    for p in parts:
        y[: len(p)] += p
    return y


# ------------------------------------------------------------------ paper

def page_turn(d=1.0):
    y = layer(clip("page_0"), np.pad(clip("page_1") * 0.6, (int(0.28 * SR), 0)))
    return match(fit(y, d, 0.2), _synth.page_turn(d))


def paper_rustle(d=0.6):
    y = layer(clip("page_2"), np.pad(clip("page_1") * 0.5, (int(0.15 * SR), 0)))
    return match(fit(lp(y, 6000), d, 0.15), _synth.paper_rustle(d))


# ------------------------------------------------------------------ cloth

def cloth_flap(d=0.55, bright=1.0, rate=22):
    k = int(rate) % 6
    y = layer(clip(f"flap_{k}"), clip(f"cloth_{k % 4}") * 0.5)
    if bright < 0.9:
        y = lp(y, 5000)
    return match(fit(y, d, 0.1), _synth.cloth_flap(d, bright, rate))


def cloth_whisk(d=0.45):
    # the swish of air stays synthesised; the cloth itself is recorded
    air = _synth.cloth_whisk(d)
    y = layer(air * 0.6, fit(clip("cloth_0"), d) + fit(np.pad(clip("flap_2") * 0.7, (int(0.06 * SR), 0)), d))
    return match(fit(y, d, 0.08), air)


def cloth_poof(d=0.7):
    air = _synth.cloth_poof(d)
    y = layer(air * 0.7, np.pad(clip("cloth_3") * 0.6, (int(0.05 * SR), 0)))
    return match(fit(y, d, 0.2), air)


def flutter_loop(d, rate=14, bright=1.0):
    """Cloth streaming in the wind: a real sheet flapping on a line, gently or thickly."""
    src = clip("flutter_thick" if rate >= 14 or bright >= 1.0 else "flutter_gentle")
    start = int((rate * 7919) % max(1, len(src) - 1))
    y = tile(src, int(d * SR), start)
    if bright < 0.8:
        y = lp(y, 4500)
    return match(y, _synth.flutter_loop(d, rate, bright))


# ------------------------------------------------------------------ grass, feet, falls

def grass_rustle(d=0.5):
    k = int(d * 100) % 4
    return match(fit(clip(f"grass_{k}"), d, 0.15), _synth.grass_rustle(d))


def step(who="pooh", seed=0):
    r = np.random.default_rng(seed)
    x = fit(clip(f"step_{int(r.integers(5))}"), 0.28, 0.08)
    if who == "pooh":
        # a soft, heavy paw: lower and duller than a boot
        y = lp(pitch(x, -4 + r.uniform(-0.6, 0.6)), 2400)
    else:
        y = hp(pitch(x, 3.5 + r.uniform(-0.6, 0.6)), 220)[: int(0.16 * SR)]
    return match(y, _synth.step(who, seed))


def bump(d=0.35):
    thump = _synth.bump(d)
    y = layer(thump * 0.6, clip("soft_fall"))
    return match(fit(y, max(d, 0.5), 0.15), thump)


# ------------------------------------------------------------------ the honey pot

def ceramic(d=0.35, f=(910, 1870, 2620, 3900), dec=(28, 38, 50, 70), thud=0.8, seed=0):
    """An earthenware crock: a real ceramic knock, pitched down for a heavier pot; the
    little rattles (a high first partial) are pitched up instead."""
    r = np.random.default_rng(seed)
    x = clip(f"pot_{int(r.integers(5))}")
    y = pitch(x, 2.5 if f[0] > 1000 else -3.5 + r.uniform(-0.5, 0.5))
    if thud > 0.3:
        low = _synth.ceramic(d, f, dec, thud, seed)
        y = layer(y, lp(low, 400) * 0.8)
    return match(fit(y, max(d, 0.3), 0.08), _synth.ceramic(d, f, dec, thud, seed))


# ------------------------------------------------------------------ bees

def bee(d, seed=0, base=None):
    """A bumblebee: a real one, looped, each bee a little higher or lower than the next."""
    r = np.random.default_rng(seed)
    src = clip(f"bee_{seed % 2}")
    src = pitch(src, r.uniform(-1.5, 1.5))
    y = tile(src, int(d * SR), int(r.integers(len(src))))
    return match(y, _synth.bee(min(d, 8.0), seed, base))


# ------------------------------------------------------------------ the wood

def leaves_bed(wind100, dur, amount=1.0):
    """Leaves stirring in the trees, rising and falling with the film's wind."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = np.interp(t, np.arange(len(wind100)) / 100, wind100)
    y = tile(clip("leaves", mono=False), n, int(3.7 * SR))
    g = np.clip((w - 0.08) * 1.8, 0.12, 1.4) * amount
    y = y * g[:, None]
    return match_mean(y, _synth.leaves_bed(wind100, dur, amount))


def birdsong(dur, windows, seed=5):
    """English woodland birds: a bed that thins and thickens with the windows' density,
    the clearing livelier than the heath, and a blackbird singing out at the marked times
    (where the synthesised version had a woodpigeon)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    wood = tile(clip("birds_wood", mono=False), n)
    clearing = tile(clip("birds_clearing", mono=False), n, int(2.0 * SR))
    xf = np.clip((t - 39.5) / 1.5, 0, 1)[:, None]
    bed = wood * (1 - xf) + clearing * xf
    dens = np.zeros(n)
    for (a, b, d, _) in windows:
        m = (t >= a) & (t < b)
        dens[m] = d
    # smooth the density steps into gentle swells
    k = int(0.8 * SR)
    dens = np.convolve(dens, np.ones(k) / k, mode="same")
    bed = bed * np.clip(dens / 0.55, 0, 1.3)[:, None]
    out = bed.astype(np.float32)
    calls = [tp for (_, _, _, p) in windows if p for tp in p]
    for i, tp in enumerate(calls):
        c = clip(f"blackbird_{i % 3}")
        i0 = int(tp * SR)
        if i0 + len(c) < n:
            out[i0: i0 + len(c)] += stereo(c * 0.35, -0.45 + 0.4 * i)
    return match_mean(out, _synth.birdsong(dur, windows, seed))
