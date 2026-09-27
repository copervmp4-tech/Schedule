"""Build the complete soundtrack: score + sound effects + ambience + narration.

    VSCO_DIR=/path/to/VSCO-2-CE python3 tools/build_audio.py

Inputs : build/narration_placed.wav           (tools/build_cues.py)
         tools/audio_events.json               (footsteps, wind, positions from the film)
         VSCO-2 Community Edition samples (CC0) for the score
Outputs: assets/audio/soundtrack.mp3 (+ soundtrack.js for file:// playback)
         build/soundtrack_master.wav, build/stems/*.wav, build/audio_report.txt
"""
import base64, json, os, subprocess, sys
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy.signal import butter, sosfilt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'audio'))
import sampler as S
import sfx as X
import score

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
SR = S.SR
DUR = 60.0
N = int(DUR * SR)


def db(x):
    return 10 ** (x / 20)


# ------------------------------------------------------------------ score

INSTR = {
    'harp': dict(folder='Strings/Harp', pat=r'_([A-G]#?-?\d)_', vel_re=None, pan=-0.25, gain=0.9, release=1.2, octave_fix=0),
    'clar': dict(folder='Woodwinds/Clarinet/susLong', pat=r'_([A-G]#?-?\d)_v', pan=0.15, gain=0.8, release=0.35, attack=0.03, octave_fix=12),
    'clarst': dict(folder='Woodwinds/Clarinet/stac', pat=r'_([A-G]#?-?\d)_v', pan=0.15, gain=0.7, release=0.1, octave_fix=12),
    'bsn': dict(folder='Woodwinds/Bassoon/sus', pat=r'_([A-G]#?-?\d)_v', vel_re=r'_v(\d)', pan=0.05, gain=0.8, release=0.35, attack=0.03, octave_fix=12),
    'bsnst': dict(folder='Woodwinds/Bassoon/stac', pat=r'_([A-G]#?-?\d)_v', vel_re=r'_v(\d)', pan=0.05, gain=0.85, release=0.12, octave_fix=12),
    'flute': dict(folder='Woodwinds/Flute/susNV', pat=r'_([A-G]#?-?\d)_v', pan=0.3, gain=0.65, release=0.35, attack=0.04, octave_fix=12),
    'flutest': dict(folder='Woodwinds/Flute/stac', pat=r'_([A-G]#?-?\d)_v', pan=0.3, gain=0.6, release=0.12, octave_fix=12),
    'vlnpz': dict(folder='Strings/Violin Section/Pizz', pat=r'_([A-G]#?-?\d)_v', pan=-0.35, gain=0.8, release=0.25, octave_fix=12),
    'vlapz': dict(folder='Strings/Viola Section/pizz', pat=r'_([A-G]#?-?\d)_v', pan=0.2, gain=0.6, release=0.2, octave_fix=12),
    'vcpz': dict(folder='Strings/Cello Section/pizzT', pat=r'_([A-G]#?-?\d)_v', pan=0.35, gain=0.8, release=0.3, octave_fix=12),
    'cbpz': dict(folder='Strings/Solo Contrabass/Pizz', pat=r'_([A-G]#?-?\d)_v', pan=0.4, gain=0.7, release=0.3, octave_fix=12),
    'vln': dict(folder='Strings/Violin Section/susVib', pat=r'_([A-G]#?-?\d)_v', pan=-0.4, gain=0.5, release=0.6, attack=0.12, octave_fix=12),
    'vla': dict(folder='Strings/Viola Section/susvib', pat=r'_([A-G]#?-?\d)_v', pan=0.1, gain=0.5, release=0.6, attack=0.12, octave_fix=12),
    'vc': dict(folder='Strings/Cello Section/susvib', pat=r'_([A-G]#?-?\d)_v', pan=0.35, gain=0.55, release=0.6, attack=0.1, octave_fix=12),
    'glock': dict(folder='Percussion/Glock', pat=r'_([A-G]#?-?\d)\.wav', vel_re=None, pan=-0.1, gain=0.45, release=1.2, octave_fix=12),
}


def render_score():
    ev = score.build()
    insts = {}
    out = np.zeros((N + SR * 3, 2), np.float32)
    for inst, t, midi, dur, vel in ev:
        if inst not in insts:
            spec = dict(INSTR[inst])
            folder = spec.pop('folder')
            insts[inst] = S.Instrument(inst, folder, **spec)
        clip = insts[inst].note(midi, vel, dur)
        S.place(out, clip, t)
    ir = S.make_reverb()
    wet = S.reverb(out, ir, wet=0.32)
    return wet[:N], len(ev)


# ------------------------------------------------------------------ sound effects

def pan_of(xs):
    return float(np.clip((xs - 0.5) * 1.6, -0.9, 0.9))


def build_sfx(ev):
    out = np.zeros((N + SR * 2, 2), np.float32)
    P = lambda clip, t, g_db, pan=0.0: S.place(out, X.stereo(clip, pan), t, db(g_db))
    T = ev['T']
    # the book
    P(X.paper_rustle(0.7), 0.02, -16)
    P(X.page_turn(1.05), T['pageTurn'][0] - 0.02, -9, 0.2)
    # shaking out the cloth
    P(X.cloth_flap(0.5, 1.0, 24), 7.28, -10, -0.1)
    P(X.cloth_flap(0.45, 0.8, 18), 7.78, -15, 0.0)
    P(X.cloth_poof(0.8), 9.1, -15, 0.0)
    # the honey pot
    P(X.ceramic(0.25, thud=0.2, seed=1), T['potPick'] + 0.02, -24, -0.15)
    P(X.ceramic(0.4, seed=2), T['potPlace'], -13, -0.05)
    # Piglet pops up from the long grass and trots over
    P(X.grass_rustle(0.55), T['pigletPop'] - 0.03, -14, 0.35)
    P(X.grass_rustle(0.45), 13.3, -18, 0.3)
    for e in ev['events']:
        if e['type'] != 'step':
            continue
        t = e['t']
        who = e['who']
        g = -17 if who == 'pooh' else -20
        if t > 39:
            g -= 4  # walking into the clearing: softer
        pan = -0.2 if who == 'pooh' else 0.1
        if t < 15:
            pan = 0.25
        P(X.step(who, seed=int(t * 1000)), t, g, pan)
    # Piglet's happy hop
    P(X.step('piglet', 9), T['hop'] + 0.55, -17, 0.15)
    # the breeze lifts a corner, then the gust takes the cloth
    fl = X.flutter_loop(2.3, 11, 0.9) * np.linspace(0.05, 1, int(2.3 * SR)) ** 1.5
    P(fl, 20.8, -21, -0.1)
    P(X.cloth_whisk(0.5), T['gust'] - 0.05, -8, 0.1)
    for i, tt in enumerate([23.2, 23.47, 23.7, 23.9, 24.06]):
        P(X.ceramic(0.18, f=(1150, 2380, 3350, 4700), dec=(45, 60, 80, 100), thud=0.05, seed=10 + i), tt, -18 - i * 3, -0.1)
    away = X.flutter_loop(2.2, 16, 1.0)
    k = np.linspace(1, 0, len(away)) ** 1.6
    away = away * k
    S.place(out, np.stack([away * 0.45, away * 1.0], axis=1).astype(np.float32), 23.3, db(-12))
    # pot scooped up; the run
    P(X.ceramic(0.2, thud=0.15, seed=20), 26.42, -22, -0.2)
    # Piglet's leap and landing
    P(X.cloth_whisk(0.35), 30.72, -24, 0.2)
    P(X.step('piglet', 31), 31.35, -14, 0.1)
    # snagged on the gorse
    P(X.grass_rustle(0.6), 33.72, -12, 0.25)
    flag = X.flutter_loop(1.3, 17, 1.1)
    P(flag * np.linspace(1, 0.8, len(flag)), 33.75, -13, 0.3)
    P(X.ceramic(0.3, thud=0.5, seed=30), 34.05, -16, -0.2)
    for h in (34.12, 34.55):
        P(X.step('piglet', int(h * 100)), h + 0.34, -18, 0.15)
    P(X.cloth_whisk(0.4), 34.93, -10, 0.35)
    P(X.bump(0.4), 35.35, -8, -0.15)
    drift = X.flutter_loop(5.0, 9, 0.7)
    P(drift * np.linspace(0.6, 0.05, len(drift)) ** 1.3, 35.1, -20, 0.5)
    P(X.ceramic(0.2, thud=0.15, seed=40), 39.12, -22, -0.2)
    # the cloth floats down into the clearing
    fall = X.flutter_loop(2.4, 6, 0.5)
    P(fall * np.hanning(len(fall)), 40.4, -22, 0.2)
    P(X.cloth_poof(0.9), 42.75, -14, 0.1)
    P(X.ceramic(0.3, thud=0.4, seed=50), 43.0, -18, -0.15)
    # sharing the honey
    P(X.ceramic(0.2, thud=0.1, seed=60), 45.72, -24, 0.0)
    P(X.honey_plip(), 46.95, -17, 0.12)
    P(X.ceramic(0.3, thud=0.4, seed=61), 48.92, -20, 0.0)
    P(X.honey_plip(), 49.35, -18, -0.1)
    rus = X.grass_rustle(0.9)
    P(X.lp(rus, 3000) * 0.8, 51.3, -22, 0.1)
    P(X.paper_rustle(0.6), 57.35, -22, 0.0)
    return out[:N]


def build_bees(ev):
    """Each bee is a little buzzing voice, panned and levelled by where it is on screen."""
    out = np.zeros((N, 2), np.float32)
    pos = ev['beesOnScreen']
    fr = 20
    tgrid = np.arange(N) / SR
    maxb = max(len(p) for p in pos)
    for b in range(maxb):
        voice = X.bee(DUR, seed=100 + b)
        pan = np.zeros(len(pos))
        gain = np.zeros(len(pos))
        for i, p in enumerate(pos):
            if b < len(p):
                x, y, z = p[b]
                on = 1.0 if -0.1 < x < 1.1 and -0.1 < y < 1.1 else 0.25
                pan[i] = np.clip((x - 0.5) * 1.6, -0.95, 0.95)
                gain[i] = on * (0.5 + 0.35 * z)
        # smooth the tracks (avoid clicks when bees appear)
        k = np.ones(6) / 6
        gain = np.convolve(gain, k, mode='same')
        pan = np.convolve(pan, k, mode='same')
        g = np.interp(tgrid, np.arange(len(pos)) / fr, gain)
        pn = np.interp(tgrid, np.arange(len(pos)) / fr, pan)
        L = np.cos((pn + 1) * np.pi / 4) * np.sqrt(2)
        R = np.sin((pn + 1) * np.pi / 4) * np.sqrt(2)
        out[:, 0] += voice * g * L
        out[:, 1] += voice * g * R
    # quieter once they have settled down in the clearing
    t = np.arange(N) / SR
    out *= (1 - 0.55 * np.clip((t - 44.5) / 1.5, 0, 1))[:, None]
    return out * db(-27)


def build_ambience(ev):
    w = np.array(ev['wind100'], dtype=np.float64)
    wind = X.wind_bed(w, DUR)
    leaves = X.leaves_bed(w, DUR)
    birds = X.birdsong(DUR, [(5.6, 19.2, 0.55, [8.2]), (19.4, 22.5, 0.2, None), (26.8, 39.5, 0.35, None), (40.0, 59.5, 0.65, [45.8, 53.4])])
    t = np.arange(N) / SR
    # no forest under the title page; it fades in as the page turns, and thins at the very end
    fade = np.clip((t - 4.4) / 1.0, 0, 1) * (1 - 0.6 * np.clip((t - 57.5) / 2.5, 0, 1))
    # the clearing is sheltered: less wind, more birds
    shelter = 1 - 0.55 * np.clip((t - 40.5) / 3, 0, 1)
    gust = 1 + 1.2 * np.clip(np.interp(t, np.arange(len(w)) / 100, w) - 0.35, 0, None)
    amb = (wind * db(-14) * (shelter * gust)[:, None] + leaves * db(-20) + birds * db(-22)) * fade[:, None]
    return amb.astype(np.float32)


# ------------------------------------------------------------------ mix

def envelope(x, attack=0.03, release=0.35):
    """Smoothed level of a mono signal (for ducking)."""
    a = np.abs(x)
    ka = np.exp(-1 / (attack * SR))
    kr = np.exp(-1 / (release * SR))
    # block-wise to keep it fast
    hop = 240
    blocks = a[: len(a) // hop * hop].reshape(-1, hop).max(axis=1)
    env = np.zeros_like(blocks)
    prev = 0.0
    ka_b, kr_b = ka ** hop, kr ** hop
    for i, v in enumerate(blocks):
        k = ka_b if v > prev else kr_b
        prev = k * prev + (1 - k) * v
        env[i] = prev
    return np.interp(np.arange(len(x)), np.arange(len(env)) * hop, env)


def limiter(x, ceiling_db=-1.2, look=0.004, release=0.08):
    ceil = db(ceiling_db)
    peak = np.abs(x).max(axis=1)
    n = int(look * SR)
    from scipy.ndimage import maximum_filter1d
    pk = maximum_filter1d(peak, size=2 * n + 1)
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    kr = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    prev = 1.0
    for i in range(0, len(g), 64):
        blk = g[i:i + 64]
        m = blk.min()
        prev = m if m < prev else prev * kr ** 64 + (1 - kr ** 64) * 1.0
        prev = min(prev, 1.0)
        out[i:i + 64] = min(prev, m) if m < prev else prev
    return x * out[:, None]


def main():
    os.makedirs(os.path.join(BUILD, 'stems'), exist_ok=True)
    ev = json.load(open(os.path.join(ROOT, 'tools', 'audio_events.json')))
    nar, sr = sf.read(os.path.join(ROOT, 'build', 'narration_placed.wav'), dtype='float32')
    assert sr == SR
    nar = nar[:N]
    nar = np.pad(nar, (0, N - len(nar)))
    print('rendering score...')
    music, nev = render_score()
    print('  notes', nev)
    sfx = build_sfx(ev)
    bees = build_bees(ev)
    amb = build_ambience(ev)

    # narration, gently presence-lifted and centred
    sos = butter(2, 90, 'high', fs=SR, output='sos')
    nar_f = sosfilt(sos, nar)
    NAR = np.stack([nar_f, nar_f], axis=1).astype(np.float32)

    # ducking keyed from the narration
    env = envelope(nar_f)
    speech = np.clip(env / (np.percentile(env[env > 1e-4], 60) + 1e-9), 0, 1)
    duck_music = db(-5.5 * speech)
    duck_amb = db(-4 * speech)

    # music automation (dB): lift the title and the clearing, sit the busy chase further back
    auto_k = [(0, 3), (0.6, 1), (4.0, 1), (4.4, 3), (5.4, 0), (26.6, 0), (27.3, -4.5), (33.2, -4.5), (33.7, 0),
              (39.2, 0), (40.0, 5), (43.0, 5), (44.2, 2.5), (47.6, 1), (57.3, 2), (60, 2)]
    ta = np.arange(N) / SR
    auto = db(np.interp(ta, [k[0] for k in auto_k], [k[1] for k in auto_k]))
    music = music * auto[:, None]

    stems = {
        'narration': NAR * db(0.0),
        'music': music * db(2.5) * duck_music[:, None],
        'sfx': sfx * db(-1.0),
        'bees': bees * db(-14.0) * duck_amb[:, None],
        'ambience': amb * duck_amb[:, None],
    }
    mix = sum(stems.values())
    # gentle fades at the very start and end
    t = np.arange(N) / SR
    mix *= (np.clip(t / 0.03, 0, 1) * np.clip((DUR - t) / 0.8, 0, 1))[:, None]

    meter = pyln.Meter(SR)
    loud = meter.integrated_loudness(mix)
    target = -16.0
    mix = mix * db(target - loud)
    mix = limiter(mix, -1.2)
    final_loud = meter.integrated_loudness(mix)
    for k, v in stems.items():
        sf.write(os.path.join(BUILD, 'stems', f'{k}.wav'), (v * db(target - loud)).astype(np.float32), SR, subtype='FLOAT')
    master = os.path.join(BUILD, 'soundtrack_master.wav')
    sf.write(master, mix.astype(np.float32), SR, subtype='PCM_24')

    # report: levels per stem and per section
    rep = [f'integrated loudness {final_loud:.1f} LUFS (target {target}), sample peak {20*np.log10(np.abs(mix).max()):.2f} dBFS']
    for k, v in stems.items():
        v2 = v * db(target - loud)
        try:
            rep.append(f'  {k:10s} {meter.integrated_loudness(v2):6.1f} LUFS  peak {20*np.log10(np.abs(v2).max()+1e-9):6.1f} dBFS')
        except Exception:
            pass
    for a, b in [(0, 5.4), (5.4, 19.4), (19.4, 26.7), (26.7, 35.4), (35.4, 45), (45, 60)]:
        seg = mix[int(a * SR):int(b * SR)]
        rep.append(f'  section {a:5.1f}-{b:5.1f}s  {meter.integrated_loudness(seg):6.1f} LUFS')
    open(os.path.join(BUILD, 'audio_report.txt'), 'w').write('\n'.join(rep) + '\n')
    print('\n'.join(rep))

    # encodings for the player
    mp3 = os.path.join(ROOT, 'assets', 'audio', 'soundtrack.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', master, '-codec:a', 'libmp3lame', '-b:a', '192k', mp3], check=True)
    b64 = base64.b64encode(open(mp3, 'rb').read()).decode()
    with open(os.path.join(ROOT, 'assets', 'audio', 'soundtrack.js'), 'w') as f:
        f.write('// The soundtrack as base64 MP3, so the film also plays when index.html is opened straight from disk.\n')
        f.write(f'window.SOUNDTRACK_MP3 = "{b64}";\n')
    print('wrote', mp3, os.path.getsize(mp3) // 1024, 'KB')


if __name__ == '__main__':
    main()
