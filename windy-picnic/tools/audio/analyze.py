"""Plot short-term loudness of each stem and the mix (a way to 'see' the balance)."""
import sys, os
import numpy as np, soundfile as sf, pyloudnorm as pyln
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
B = sys.argv[1]; out = sys.argv[2]
SR = 48000
meter = pyln.Meter(SR, block_size=0.4)
def st(x, win=1.0, hop=0.1):
    n = len(x); res = []
    for i in range(0, n - int(win*SR), int(hop*SR)):
        seg = x[i:i+int(win*SR)]
        e = np.mean(seg**2)
        res.append(10*np.log10(e + 1e-12) - 0.691 + 3.01)  # approx LUFS-ish (no K-weighting)
    return np.arange(len(res))*hop + win/2, np.array(res)
fig, ax = plt.subplots(2, 1, figsize=(18, 9), sharex=True)
for name, col in [('narration','k'),('music','b'),('sfx','r'),('bees','orange'),('ambience','g')]:
    x, _ = sf.read(os.path.join(B, 'stems', name + '.wav'))
    t, l = st(x.mean(axis=1))
    ax[0].plot(t, l, col, label=name, lw=1)
m, _ = sf.read(os.path.join(B, 'soundtrack_master.wav'))
t, l = st(m.mean(axis=1))
ax[0].plot(t, l, 'm', label='MIX', lw=2, alpha=0.5)
ax[0].set_ylim(-60, -5); ax[0].grid(True, alpha=0.3); ax[0].legend(ncol=6); ax[0].set_ylabel('dB (1 s RMS)')
for x0 in [4.35, 5.4, 12.36, 19.4, 23.05, 25.2, 26.75, 33.75, 35.35, 39.25, 42.8, 45, 57.5]:
    ax[0].axvline(x0, color='gray', lw=0.5)
ax[1].specgram(m.mean(axis=1), NFFT=2048, Fs=SR, noverlap=1536, cmap='magma', vmin=-120)
ax[1].set_ylim(0, 10000); ax[1].set_xlabel('s')
plt.tight_layout(); plt.savefig(out, dpi=70)
