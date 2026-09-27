"""A small sample player for the VSCO-2 Community Edition (CC0) instrument library,
plus a synthetic concert-hall reverb.

Samples are loaded once, trimmed to their attack, checked for pitch (so an octave
naming convention can't trip us up), then transposed by resampling."""
import glob, os, re
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt, fftconvolve

SR = 48000
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
VSCO = os.environ.get('VSCO_DIR', '/tmp/vsco')


def midi_of(name):
    m = re.match(r'([A-G]#?)(-?\d)', name)
    return 12 * (int(m.group(2)) + 1) + NOTE[m.group(1)]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def load(path):
    a, sr = sf.read(path, dtype='float32', always_2d=True)
    if a.shape[1] == 1:
        a = np.repeat(a, 2, axis=1)
    a = a[:, :2]
    if sr != SR:
        a = np.stack([resample_poly(a[:, c], SR, sr) for c in range(2)], axis=1).astype(np.float32)
    # trim leading silence so every note speaks on its beat
    env = np.abs(a).max(axis=1)
    peak = env.max() + 1e-9
    idx = np.argmax(env > peak * 0.02)
    a = a[max(0, idx - int(0.004 * SR)):]
    return a


def estimate_f0(a, lo=40, hi=2500):
    """Autocorrelation pitch of the steady part of a sample."""
    x = a[:, 0] + a[:, 1]
    n = len(x)
    seg = x[min(int(0.08 * SR), n // 4): min(int(0.08 * SR) + 8192, n)]
    if len(seg) < 2048:
        return None
    seg = seg - seg.mean()
    seg = seg * np.hanning(len(seg))
    ac = np.fft.irfft(np.abs(np.fft.rfft(seg, 2 * len(seg))) ** 2)[: len(seg)]
    lag0, lag1 = int(SR / hi), int(SR / lo)
    if lag1 >= len(ac):
        lag1 = len(ac) - 1
    ac[:lag0] = 0
    lag = lag0 + np.argmax(ac[lag0:lag1])
    if ac[lag] <= 0:
        return None
    return SR / lag


class Instrument:
    def __init__(self, name, folder, pat=r'([A-G]#?-?\d)', vel_re=r'_v(\d)', pan=0.0, gain=1.0, release=0.25,
                 attack=0.0, octave_fix=None, sustain=False, check=True):
        self.name, self.pan, self.gain, self.release, self.attack, self.sustain = name, pan, gain, release, attack, sustain
        self.samples = {}  # midi -> {vel -> [arrays]}
        files = sorted(glob.glob(os.path.join(VSCO, folder, '*.wav')))
        if not files:
            raise FileNotFoundError(folder)
        for f in files:
            b = os.path.basename(f)
            m = re.search(pat, b)
            if not m:
                continue
            midi = midi_of(m.group(1))
            vm = re.search(vel_re, b) if vel_re else None
            v = int(vm.group(1)) if vm else 1
            self.samples.setdefault(midi, {}).setdefault(v, []).append(f)
        # octave sanity check by measured pitch
        self.shift = 0
        if octave_fix is not None:
            self.shift = octave_fix
        elif check:
            diffs = []
            for midi in list(self.samples)[:: max(1, len(self.samples) // 5)]:
                vs = self.samples[midi]
                a = load(vs[max(vs)][0])
                f0 = estimate_f0(a)
                if f0:
                    est = 69 + 12 * np.log2(f0 / 440)
                    d = est - midi
                    diffs.append(12 * round(d / 12))
            if diffs:
                vals, counts = np.unique(diffs, return_counts=True)
                self.shift = int(vals[np.argmax(counts)])
        if self.shift:
            self.samples = {m + self.shift: v for m, v in self.samples.items()}
        self.keys = np.array(sorted(self.samples))
        self.cache = {}
        self.rr = {}

    def get(self, path):
        if path not in self.cache:
            self.cache[path] = load(path)
        return self.cache[path]

    def note(self, midi, vel=0.7, dur=0.5):
        """Render one note (stereo float32) of `dur` seconds plus release."""
        k = self.keys[np.argmin(np.abs(self.keys - midi) + (self.keys > midi) * 0.1)]
        layers = self.samples[k]
        vs = sorted(layers)
        v = vs[min(len(vs) - 1, int(vel * len(vs)))]
        opts = layers[v]
        n = self.rr.get((k, v), 0)
        self.rr[(k, v)] = n + 1
        a = self.get(opts[n % len(opts)])
        if abs(midi - k) > 4:
            print(f'  warning: {self.name} note {midi} transposed {midi - k:+d} semitones from sample {k}')
        ratio = 2 ** ((midi - k) / 12)
        total = int((dur + self.release) * SR)
        src_len = int(total * ratio) + 2
        seg = a[: min(len(a), src_len)]
        if len(seg) < 4:
            return np.zeros((1, 2), np.float32)
        if abs(ratio - 1) > 1e-4:
            xi = np.arange(0, len(seg) - 1, ratio)
            i0 = xi.astype(int)
            fr = (xi - i0)[:, None]
            seg = seg[i0] * (1 - fr) + seg[i0 + 1] * fr
        out = seg[:total].copy()
        # envelope: optional soft attack, release after dur
        if self.attack > 0:
            na = min(len(out), int(self.attack * SR))
            out[:na] *= np.linspace(0, 1, na)[:, None]
        nd = int(dur * SR)
        if nd < len(out):
            nr = len(out) - nd
            out[nd:] *= np.linspace(1, 0, nr)[:, None] ** 1.5
        g = self.gain * (0.25 + 0.75 * vel) ** 1.3
        L = np.cos((self.pan + 1) * np.pi / 4) * np.sqrt(2)
        R = np.sin((self.pan + 1) * np.pi / 4) * np.sqrt(2)
        out[:, 0] *= g * L
        out[:, 1] *= g * R
        return out.astype(np.float32)


def place(buf, clip, t, gain=1.0):
    i0 = int(round(t * SR))
    if i0 >= len(buf):
        return
    if i0 < 0:
        clip = clip[-i0:]
        i0 = 0
    n = min(len(clip), len(buf) - i0)
    buf[i0:i0 + n] += clip[:n] * gain


def make_reverb(seconds=2.4, rt_low=1.9, rt_mid=1.6, rt_high=0.8, seed=3):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2), np.float32)
    bands = [(None, 400, rt_low), (400, 3500, rt_mid), (3500, None, rt_high)]
    for c in range(2):
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, rt in bands:
            if lo is None:
                sos = butter(2, hi, 'low', fs=SR, output='sos')
            elif hi is None:
                sos = butter(2, lo, 'high', fs=SR, output='sos')
            else:
                sos = butter(2, [lo, hi], 'band', fs=SR, output='sos')
            acc += sosfilt(sos, noise) * np.exp(-6.9 * t / rt)
        ir[:, c] = acc
    pre = int(0.022 * SR)
    ir = np.concatenate([np.zeros((pre, 2), np.float32), ir])
    # a few early reflections
    for d, g in [(0.011, 0.5), (0.019, 0.35), (0.029, 0.3), (0.041, 0.2)]:
        k = int(d * SR)
        ir[k, 0] += g
        ir[k + 37, 1] += g * 0.9
    ir /= np.sqrt((ir ** 2).sum(axis=0)).max()
    return ir


def reverb(x, ir, wet=0.3):
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return (x * (1 - wet * 0.3) + y * wet).astype(np.float32)
