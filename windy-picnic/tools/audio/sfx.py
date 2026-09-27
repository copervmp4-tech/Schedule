"""Synthesised sound effects and forest ambience (all original, made from noise and
oscillators): paper, cloth, wind, leaves, grass, footsteps, a ceramic honey pot,
bees and birdsong."""
import numpy as np
from scipy.signal import butter, sosfilt, lfilter

SR = 48000
RNG = np.random.default_rng(1926)


def t_(d):
    return np.arange(int(d * SR)) / SR


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def env_ad(n, a, d, shape=2.0):
    na = max(1, int(a * SR))
    e = np.ones(n)
    e[:na] = np.linspace(0, 1, na)
    rest = n - na
    if rest > 0:
        e[na:] = (1 - np.linspace(0, 1, rest)) ** shape
    return e


def stereo(x, pan=0.0, width=0.0):
    L = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    R = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    y = np.stack([x * L, x * R], axis=1)
    if width:
        d = int(0.0007 * SR)
        y[d:, 1] = y[d:, 1] * (1 - width) + y[:-d, 1] * width
    return y.astype(np.float32)


def pinkish(n):
    w = RNG.standard_normal(n)
    return lfilter([0.049922, -0.095993, 0.050612, -0.004408], [1, -2.494956, 2.017265, -0.522189], w)


def norm(x, peak=1.0):
    return x / (np.abs(x).max() + 1e-9) * peak


# ------------------------------------------------------------------ paper

def page_turn(d=1.0):
    n = int(d * SR)
    t = np.arange(n) / SR
    x = RNG.standard_normal(n)
    # a sweep of paper through the air, then the soft slap as it lies down
    center = 1800 + 2600 * np.sin(np.pi * np.clip(t / (d * 0.8), 0, 1))
    y = np.zeros(n)
    for i in range(0, n, 480):
        seg = x[i:i + 960]
        c = center[i]
        y[i:i + len(seg)] += bp(seg, c * 0.5, min(c * 1.6, 20000)) * np.hanning(len(seg))
    flutter = 1 + 0.5 * np.sin(2 * np.pi * (28 + 20 * t) * t)
    e = np.sin(np.pi * np.clip(t / (d * 0.82), 0, 1)) ** 1.5
    y = y * e * flutter
    slap = lp(RNG.standard_normal(n), 900) * np.exp(-np.clip(t - d * 0.8, 0, None) * 40) * (t > d * 0.8)
    crackle = hp(RNG.standard_normal(n) * (RNG.random(n) < 0.004), 3000) * e
    return norm(y + 0.8 * slap + 0.6 * crackle, 0.8)


def paper_rustle(d=0.6):
    n = int(d * SR)
    t = np.arange(n) / SR
    y = bp(RNG.standard_normal(n), 1500, 9000) * (0.4 + 0.6 * (RNG.random(n) < 0.03))
    y = lp(y, 7000) * env_ad(n, 0.05, d, 2)
    return norm(y, 0.6)


# ------------------------------------------------------------------ cloth

def cloth_flap(d=0.55, bright=1.0, rate=22):
    n = int(d * SR)
    t = np.arange(n) / SR
    base = lp(RNG.standard_normal(n), 1400 * bright) + 0.3 * bp(RNG.standard_normal(n), 2000, 5000)
    am = 0.35 + 0.65 * np.abs(np.sin(np.pi * rate * t + np.sin(t * 17)))
    e = env_ad(n, 0.03, d, 1.6)
    whoomp = np.sin(2 * np.pi * (70 + 40 * np.exp(-t * 12)) * t) * np.exp(-t * 9) * 0.5
    return norm(base * am * e + whoomp, 0.9)


def cloth_whisk(d=0.45):
    n = int(d * SR)
    t = np.arange(n) / SR
    x = RNG.standard_normal(n)
    y = np.zeros(n)
    for i in range(0, n, 240):
        c = 600 + 5000 * (i / n) ** 0.7
        seg = x[i:i + 480]
        y[i:i + len(seg)] += bp(seg, c * 0.6, min(c * 1.8, 20000)) * np.hanning(len(seg))
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.8 * np.exp(-t * 3)
    return norm(y * e, 0.9)


def cloth_poof(d=0.7):
    n = int(d * SR)
    t = np.arange(n) / SR
    y = lp(RNG.standard_normal(n), 700) * env_ad(n, 0.04, d, 2.5)
    y += 0.4 * bp(RNG.standard_normal(n), 800, 3000) * env_ad(n, 0.02, d * 0.5, 3)
    return norm(y, 0.7)


def flutter_loop(d, rate=14, bright=1.0):
    """Cloth streaming in the wind (a flag's flutter)."""
    n = int(d * SR)
    t = np.arange(n) / SR
    base = lp(RNG.standard_normal(n), 1800 * bright) + 0.25 * bp(RNG.standard_normal(n), 2500, 6000)
    r = rate * (1 + 0.25 * np.sin(t * 2.1))
    ph = 2 * np.pi * np.cumsum(r) / SR
    am = 0.2 + 0.8 * np.abs(np.sin(ph)) ** 3
    return norm(base * am, 0.8)


# ------------------------------------------------------------------ wind, leaves, grass

def wind_bed(wind100, dur):
    """Continuous wind shaped by the film's own wind curve (100 Hz)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = np.interp(t, np.arange(len(wind100)) / 100, wind100)
    body = pinkish(n)
    # moving band-pass: stronger wind sounds brighter and louder
    low = lp(body, 380)
    mid = bp(body, 300, 1400)
    hiss = bp(RNG.standard_normal(n), 1800, 7000) * 0.08
    gust = 0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t + np.sin(t * 0.7) * 2)
    y = low * (0.35 + 0.9 * w) + mid * (w ** 1.6) * (0.6 + 0.4 * gust) + hiss * w ** 2
    y *= (0.25 + w) ** 1.2
    L = y
    R = np.roll(y, int(0.013 * SR)) * 0.95 + 0.05 * y
    return np.stack([L, R], axis=1).astype(np.float32)


def leaves_bed(wind100, dur, amount=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = np.interp(t, np.arange(len(wind100)) / 100, wind100)
    density = 0.002 + 0.03 * np.clip(w - 0.2, 0, None) ** 1.5
    clicks = (RNG.random(n) < density) * RNG.standard_normal(n)
    y = bp(clicks, 1500, 8000)
    y = lfilter([1], [1, -0.7], y)
    y += bp(RNG.standard_normal(n), 3000, 9000) * 0.05 * np.clip(w - 0.3, 0, None)
    y *= amount
    return np.stack([y, np.roll(y, 311)], axis=1).astype(np.float32)


def grass_rustle(d=0.5):
    n = int(d * SR)
    y = bp((RNG.random(n) < 0.06) * RNG.standard_normal(n), 1800, 8000)
    y = lfilter([1], [1, -0.6], y) + 0.3 * bp(RNG.standard_normal(n), 2500, 7000)
    return norm(y * env_ad(n, 0.02, d, 1.8), 0.7)


# ------------------------------------------------------------------ footsteps & bumps

def step(who='pooh', seed=0):
    r = np.random.default_rng(seed)
    if who == 'pooh':
        d, f0, lo, hi = 0.14, 90 + r.random() * 20, 120, 900
    else:
        d, f0, lo, hi = 0.08, 170 + r.random() * 40, 300, 2200
    n = int(d * SR)
    t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * f0 * t * (1 - 0.3 * t / d)) * np.exp(-t * (45 if who == 'pooh' else 70))
    pad = bp(r.standard_normal(n), lo, hi) * np.exp(-t * 55)
    grass = bp((r.random(n) < 0.08) * r.standard_normal(n), 2500, 8000) * np.exp(-t * 25) * 0.6
    return norm(thud * 0.9 + pad * 0.6 + grass, 1.0)


def bump(d=0.35):
    n = int(d * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * (75 - 25 * t / d) * t) * np.exp(-t * 16)
    y += 0.5 * lp(RNG.standard_normal(n), 500) * np.exp(-t * 30)
    return norm(y, 1.0)


# ------------------------------------------------------------------ the honey pot

def ceramic(d=0.35, f=(910, 1870, 2620, 3900), dec=(28, 38, 50, 70), thud=0.8, seed=0):
    r = np.random.default_rng(seed)
    n = int(d * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k, (fk, dk) in enumerate(zip(f, dec)):
        fk = fk * (1 + (r.random() - 0.5) * 0.04)
        y += np.sin(2 * np.pi * fk * t + r.random() * 6) * np.exp(-t * dk) * (0.6 / (k + 1))
    y *= 0.35
    y += thud * np.sin(2 * np.pi * (140 - 60 * np.clip(t * 8, 0, 1)) * t) * np.exp(-t * 30)
    y += 0.3 * lp(r.standard_normal(n), 800) * np.exp(-t * 60)
    return norm(y, 1.0)


def honey_plip(d=0.18):
    n = int(d * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 14) + 280
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26)
    y += 0.2 * lp(RNG.standard_normal(n), 1200) * np.exp(-t * 40)
    return norm(y, 0.6)


# ------------------------------------------------------------------ bees

def bee(d, seed=0, base=None):
    r = np.random.default_rng(seed)
    n = int(d * SR)
    t = np.arange(n) / SR
    f0 = base or (205 + r.random() * 60)
    wob = 1 + 0.035 * np.sin(2 * np.pi * (5 + r.random() * 3) * t) + 0.02 * np.sin(2 * np.pi * 0.7 * t + r.random())
    ph = 2 * np.pi * np.cumsum(f0 * wob) / SR
    saw = sum(np.sin(k * ph) / k for k in range(1, 14))
    y = bp(saw, 180, 3500) * (0.75 + 0.25 * np.sin(2 * np.pi * 21 * t))
    return y.astype(np.float32)


# ------------------------------------------------------------------ birds

def chirp(kind, seed=0):
    r = np.random.default_rng(seed)
    if kind == 'tweet':
        d = 0.09 + r.random() * 0.05
        n = int(d * SR)
        t = np.arange(n) / SR
        f = 3200 + 1800 * (t / d) + 300 * np.sin(t * 90)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
    elif kind == 'seep':
        d = 0.22
        n = int(d * SR)
        t = np.arange(n) / SR
        f = 6200 - 900 * (t / d)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 3 * 0.6
    elif kind == 'trill':
        d = 0.5 + r.random() * 0.3
        n = int(d * SR)
        t = np.arange(n) / SR
        f = 4300 + 400 * np.sin(2 * np.pi * 18 * t)
        am = (np.sin(2 * np.pi * 22 * t) > 0.2).astype(float)
        am = lp(am, 200)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * am * np.sin(np.pi * t / d) ** 0.7 * 0.5
    else:  # woodpigeon coo, soft and low
        notes = [(0.0, 0.32, 1.0), (0.42, 0.55, 1.15), (1.05, 0.28, 0.95), (1.45, 0.35, 1.0)]
        d = 1.9
        n = int(d * SR)
        t = np.arange(n) / SR
        y = np.zeros(n)
        for s0, dd, k in notes:
            m = (t >= s0) & (t < s0 + dd)
            tt = t[m] - s0
            f = 430 * k * (1 + 0.04 * np.sin(np.pi * tt / dd))
            y[m] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / dd) ** 1.5
        y = lp(y + 0.3 * np.sin(2 * 2 * np.pi * 430 * t) * (y != 0), 1500) * 0.7
    return y.astype(np.float32)


def birdsong(dur, windows, seed=5):
    """Sparse, distant birdsong in the given (start, end, density) windows."""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    for (a, b, dens, pigeon) in windows:
        t = a
        while t < b:
            t += r.exponential(1 / dens)
            if t >= b:
                break
            kind = r.choice(['tweet', 'tweet', 'seep', 'trill'])
            c = chirp(kind, int(r.integers(1e6)))
            reps = 1 if kind != 'tweet' else int(r.integers(1, 4))
            pan = r.uniform(-0.8, 0.8)
            g = r.uniform(0.25, 0.6)
            for k in range(reps):
                i0 = int((t + k * (len(c) / SR + 0.05)) * SR)
                if i0 + len(c) < n:
                    out[i0:i0 + len(c)] += stereo(c * g, pan)
        if pigeon:
            for tp in pigeon:
                c = chirp('coo')
                i0 = int(tp * SR)
                if i0 + len(c) < n:
                    out[i0:i0 + len(c)] += stereo(c * 0.5, -0.5)
    # a touch of distance
    for ch in range(2):
        out[:, ch] = lp(out[:, ch], 7000)
    return out
