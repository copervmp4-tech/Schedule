"""Original score for The Windy Picnic (F major), written against the film's timeline.

Themes
  Pooh's theme   C F F | G A F | B♭ A G | F – C | C F A | C' B♭ A | G E C | F   (3/4)
  Honey motif    C F A G | F            (glockenspiel, title and ending)
  Piglet's motif a nervous flute flutter C D C A | F

Sections (seconds)
  A  0.0–5.4    title: harp arpeggios, glockenspiel honey motif, page-turn glissando
  B  5.4–19.4   picnic waltz ♩=120: pizzicato theme, harp; Piglet's motif; "For us" on clarinet
  C  19.4–25.2  the wind builds (Dm → B♭ → C7), gust, the cloth flutters away
  —  25.2–26.2  comic silence: one plonk, a bassoon "hm?"
  D  26.75–33.75 the chase ♩≈137 2/4: pizzicato ostinato, bassoon then flute
  E  33.75–35.4 snag (flute trill), release (glockenspiel), bump (low pizzicato)
  F  35.4–39.25 thinking: harp and a slow bassoon line
  G  39.25–45.0 the clearing: strings open out, the cloth floats down on a falling line
  H  45.0–60.0  sharing: waltz ♩=96, clarinet theme, flute and clarinet in thirds, final chord
"""
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def m(name):
    """'Bb4' -> MIDI (C4 = 60)."""
    i = 2 if len(name) > 2 and name[1] in '#b' else 1
    return 12 * (int(name[i:]) + 1) + NOTE[name[:i]]


EV = []  # (inst, t, midi, dur, vel)


def n(inst, t, name, dur, vel=0.6):
    EV.append((inst, float(t), m(name) if isinstance(name, str) else name, float(dur), float(vel)))


def chord(inst, t, names, dur, vel=0.5, roll=0.0):
    for i, nm in enumerate(names):
        n(inst, t + i * roll, nm, dur - i * roll, vel)


def line(inst, t0, beat, notes, vel=0.6, legato=0.95):
    """notes: [(name or None, beats), ...]"""
    t = t0
    for nm, b in notes:
        if nm:
            n(inst, t, nm, b * beat * legato, vel)
        t += b * beat
    return t


def arp(inst, t0, step, names, dur, vel=0.5):
    for i, nm in enumerate(names):
        n(inst, t0 + i * step, nm, dur, vel)


def build():
    EV.clear()
    # ------------------------------------------------------------------ A: title
    n('harp', 0.25, 'F2', 3.0, 0.5)
    arp('harp', 0.3, 0.19, ['F3', 'A3', 'C4', 'F4', 'A4', 'C5'], 2.6, 0.42)
    chord('vc', 0.3, ['F2'], 2.7, 0.3)
    chord('vla', 0.3, ['C4', 'A4'], 2.7, 0.28)
    for t, nm, d in [(0.95, 'C6', 0.4), (1.35, 'F6', 0.4), (1.75, 'A6', 0.4), (2.15, 'G6', 0.8), (2.95, 'F6', 1.6)]:
        n('glock', t, nm, d, 0.42)
    n('harp', 2.95, 'Bb2', 1.4, 0.45)
    arp('harp', 3.0, 0.17, ['F3', 'Bb3', 'D4', 'F4'], 1.3, 0.38)
    chord('vla', 3.0, ['Bb3', 'D4'], 1.3, 0.28)
    chord('vc', 3.0, ['F2'], 1.3, 0.28)
    chord('vc', 4.2, ['C3'], 1.15, 0.3)
    chord('vla', 4.2, ['Bb3', 'E4'], 1.15, 0.3)
    n('flute', 3.9, 'C5', 1.45, 0.32)
    # page-turn glissando (C7) landing on F
    gl = ['C4', 'E4', 'G4', 'Bb4', 'C5', 'E5', 'G5', 'Bb5', 'C6', 'E6']
    arp('harp', 4.45, 0.085, gl, 1.2, 0.5)

    # ------------------------------------------------------------------ B: picnic waltz ♩=120
    B0, beat = 5.4, 0.5
    bars = [B0 + 1.5 * k for k in range(10)]
    waltz = [('F2', ['A3', 'C4', 'F4']), ('C3', ['A3', 'C4', 'F4']), ('C3', ['Bb3', 'C4', 'E4']), ('F2', ['A3', 'C4', 'F4']),
             ('D3', ['A3', 'D4', 'F4'])]
    for k, (bass, ch) in enumerate(waltz):
        t = bars[k]
        n('harp', t, bass, 1.4, 0.5)
        n('vcpz', t, bass, 0.4, 0.35)
        chord('harp', t + beat, ch, 0.45, 0.33)
        chord('harp', t + 2 * beat, ch, 0.45, 0.3)
    # Pooh's theme, lightly, on pizzicato violins
    line('vlnpz', bars[0], beat, [('C5', 1), ('F5', 1), ('F5', 1), ('G5', 1), ('A5', 1), ('F5', 1), ('Bb5', 1), ('A5', 1), ('G5', 1), ('F5', 2), ('C5', 1)], 0.45)
    n('glock', 10.9, 'C6', 0.6, 0.35)  # the pot set down (on beat 3)
    chord('vla', bars[4], ['A3', 'D4'], 1.5, 0.22)
    # Piglet pops up: his little flute flutter
    for i, nm in enumerate(['C6', 'D6', 'C6', 'A5']):
        n('flutest', 12.34 + i * 0.12, nm, 0.12, 0.5)
    n('flute', 12.82, 'F5', 0.5, 0.35)
    n('harp', 12.9, 'F2', 1.4, 0.4)
    # tip-toe pizzicato as he trots out
    for i, nm in enumerate(['A5', 'C6', 'A5', 'F5', 'A5', 'C6']):
        n('vlnpz', 13.4 + i * 0.25, nm, 0.2, 0.38 - i * 0.02)
    # "For me?" — tender strings
    chord('vla', bars[6], ['Bb3', 'D4', 'F4'], 1.5, 0.3)
    chord('vc', bars[6], ['Bb2'], 1.5, 0.3)
    arp('harp', bars[6], 0.25, ['Bb2', 'F3', 'Bb3', 'D4', 'F4', 'Bb4'], 1.4, 0.35)
    chord('vla', bars[7], ['Bb3', 'D4', 'F4'], 0.75, 0.3)
    chord('vla', bars[7] + 0.75, ['Bb3', 'C4', 'E4'], 0.75, 0.32)
    chord('vc', bars[7], ['G2'], 0.75, 0.3)
    chord('vc', bars[7] + 0.75, ['C3'], 0.75, 0.32)
    # "For us" — warm F major, the theme on clarinet
    chord('vc', bars[8], ['F2'], 2.2, 0.35)
    chord('vla', bars[8], ['C4', 'A4'], 2.2, 0.33)
    chord('vln', bars[8], ['F5'], 2.0, 0.25)
    arp('harp', bars[8], 0.16, ['F2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4'], 1.9, 0.4)
    line('clar', bars[8] + 0.15, 0.42, [('C4', 1), ('F4', 1), ('F4', 1), ('G4', 1), ('A4', 1.4)], 0.4)
    n('glock', 18.15, 'A6', 0.5, 0.35)
    n('glock', 18.35, 'C7', 0.7, 0.32)

    # ------------------------------------------------------------------ C: the wind
    chord('vc', 19.4, ['D3'], 1.7, 0.28)
    chord('vla', 19.4, ['F3', 'A3'], 1.7, 0.26)
    n('flute', 19.8, 'A5', 1.3, 0.3)
    chord('vc', 21.0, ['Bb2'], 1.25, 0.32)
    chord('vla', 21.0, ['D4', 'F4'], 1.25, 0.32)
    n('flute', 21.05, 'Bb5', 1.1, 0.34)
    chord('vc', 22.2, ['C3'], 0.9, 0.42)
    chord('vla', 22.2, ['E4', 'G4'], 0.9, 0.42)
    chord('vln', 22.2, ['Bb4'], 0.9, 0.4)
    arp('harp', 22.35, 0.06, ['C4', 'E4', 'G4', 'Bb4', 'C5', 'E5', 'G5', 'Bb5', 'C6', 'E6', 'G6'], 0.8, 0.5)
    arp('flutest', 22.42, 0.075, ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6'], 0.09, 0.55)
    # the gust!
    chord('vln', 23.05, ['F4', 'A4', 'C5', 'F5'], 0.45, 0.8)
    chord('vla', 23.05, ['C4', 'A4'], 0.45, 0.75)
    chord('vc', 23.05, ['F2', 'C3'], 0.45, 0.75)
    n('glock', 23.05, 'F6', 1.0, 0.55)
    # ...and the cloth flutters away (getting softer as it goes)
    for i, nm in enumerate(['F6', 'E6', 'D6', 'C6', 'Bb5', 'A5', 'G5', 'F5', 'E5', 'D5', 'C5']):
        n('flutest', 23.25 + i * 0.13, nm, 0.12, 0.5 - i * 0.035)
        if i % 2 == 0:
            n('harp', 23.25 + i * 0.13 + 0.06, m(nm) - 12, 0.4, 0.3 - i * 0.02)
    # comic silence, one plonk, a bassoon "hm?"
    n('vcpz', 25.45, 'F2', 0.6, 0.45)
    n('bsnst', 25.9, 'C3', 0.18, 0.55)
    n('bsnst', 26.12, 'F3', 0.22, 0.6)
    # pick-up into the chase
    arp('clarst', 26.3, 0.064, ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5'], 0.07, 0.45)

    # ------------------------------------------------------------------ D: the chase, 2/4
    D0, q = 26.75, 0.4375
    e = q / 2
    chords = [('F2', 'C3', ['A3', 'C4']), ('F2', 'C3', ['A3', 'C4']), ('Bb2', 'F3', ['Bb3', 'D4']), ('F2', 'C3', ['A3', 'C4']),
              ('G2', 'D3', ['Bb3', 'D4']), ('C3', 'G3', ['Bb3', 'E4']), ('F2', 'C3', ['A3', 'C4']), ('C3', 'G2', ['Bb3', 'E4'])]
    for k, (b1, b2, up) in enumerate(chords):
        t = D0 + k * 2 * q
        for j, bn in enumerate([b1, b2, b1, b2]):
            n('vcpz', t + j * e, bn, 0.2, 0.42 if j % 2 == 0 else 0.34)
        n('cbpz', t, m(b1) - 12, 0.4, 0.4)
        for j in (1, 3):
            chord('vlapz', t + j * e, up, 0.18, 0.3)
    tune = [['F3', 'A3', 'C4', 'A3'], ['F3', 'A3', 'C4', 'F4'], ['D4', 'C4', 'Bb3', 'D4'], ['C4', 'A3', 'F3', 'C3'],
            ['Bb3', 'D4', 'G4', 'D4'], ['E4', 'G4', 'C4', 'E4'], ['F4', 'C4', 'D4', 'F4'], ['E4', 'G4', 'C5', None]]
    for k, bar in enumerate(tune):
        for j, nm in enumerate(bar):
            if nm:
                n('bsnst', D0 + k * 2 * q + j * e, nm, 0.18, 0.5)
                if k >= 4:
                    n('flutest', D0 + k * 2 * q + j * e, m(nm) + 24, 0.14, 0.42)
    # the bees join in
    for i, nm in enumerate(['C7', 'A6', 'C7', 'F7']):
        n('glock', 29.45 + i * 0.22, nm, 0.4, 0.28)
    # Piglet's leap
    arp('harp', 30.7, 0.05, ['F4', 'A4', 'C5', 'F5', 'A5', 'C6', 'F6'], 0.6, 0.42)
    n('vcpz', 31.35, 'C2', 0.5, 0.5)

    # ------------------------------------------------------------------ E: snag, release, bump
    chord('vla', 33.75, ['Bb3', 'E4'], 1.2, 0.3)
    chord('vc', 33.75, ['C3'], 1.2, 0.3)
    for i in range(16):
        n('flutest', 33.8 + i * 0.07, 'C6' if i % 2 == 0 else 'D6', 0.07, 0.3 + i * 0.015)
    for i, nm in enumerate(['C7', 'A6', 'F6', 'C6']):
        n('glock', 34.95 + i * 0.08, nm, 0.5, 0.45 - i * 0.05)
    n('cbpz', 35.35, 'F1', 0.6, 0.6)
    n('bsnst', 35.36, 'F2', 0.25, 0.7)
    n('vcpz', 35.36, 'F2', 0.5, 0.5)

    # ------------------------------------------------------------------ F: thinking
    for t, bass, up in [(35.8, 'D2', ['A3', 'C4', 'F4']), (37.0, 'G2', ['Bb3', 'D4', 'F4']), (38.2, 'C3', ['Bb3', 'D4', 'F4']), (38.75, 'C3', ['Bb3', 'E4', 'G4'])]:
        n('harp', t, bass, 1.2, 0.32)
        arp('harp', t + 0.1, 0.12, up, 1.0, 0.26)
    n('bsn', 35.9, 'A3', 1.05, 0.28)
    n('bsn', 37.05, 'Bb3', 1.1, 0.28)
    n('bsn', 38.25, 'G3', 0.5, 0.3)
    n('bsn', 38.78, 'C4', 0.45, 0.32)

    # ------------------------------------------------------------------ G: the clearing
    G0, gb = 39.25, 0.714
    for k, (bass, up) in enumerate([('F2', ['C3', 'F3', 'A3', 'C4']), ('Bb2', ['F3', 'Bb3', 'D4', 'F4'])]):
        t = G0 + k * 3 * gb
        n('harp', t, bass, 2.0, 0.4)
        arp('harp', t + gb, gb / 2, up, 1.2, 0.3)
        n('vcpz', t, bass, 0.5, 0.3)
    chord('vla', 40.4, ['D4', 'F4'], 2.3, 0.3)
    chord('vc', 40.4, ['Bb2'], 2.3, 0.3)
    chord('vln', 40.9, ['Bb4', 'D5'], 1.8, 0.25)
    # the cloth floats down
    for t, nm in [(40.5, 'A5'), (41.0, 'G5'), (41.5, 'F5'), (41.95, 'E5'), (42.35, 'D5')]:
        n('flute', t, nm, 0.48, 0.38)
    n('flute', 42.8, 'C5', 1.2, 0.36)
    n('glock', 42.8, 'F6', 1.4, 0.4)
    chord('vc', 42.8, ['F2'], 2.2, 0.34)
    chord('vla', 42.8, ['C4', 'A4'], 2.2, 0.32)
    chord('vln', 42.8, ['F5'], 2.0, 0.24)
    arp('harp', 42.8, 0.12, ['F2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4', 'C5'], 2.0, 0.42)
    n('clar', 44.25, 'C5', 0.28, 0.38)
    n('clar', 44.55, 'F5', 0.6, 0.42)

    # ------------------------------------------------------------------ H: sharing, ♩=96 waltz
    H0, hb = 45.0, 0.625
    hbars = [H0 + 3 * hb * k for k in range(6)]
    hchords = [('F2', ['A3', 'C4', 'F4']), ('F2', ['A3', 'C4', 'F4']), ('C3', ['Bb3', 'C4', 'E4']), ('F2', ['A3', 'C4', 'F4']),
               ('F2', ['A3', 'C4', 'F4']), ('Bb2', ['Bb3', 'D4', 'F4'])]
    for k, (bass, up) in enumerate(hchords):
        t = hbars[k]
        n('harp', t, bass, 1.8, 0.42)
        chord('harp', t + hb, up, 0.55, 0.27)
        chord('harp', t + 2 * hb, up, 0.55, 0.25)
        chord('vc', t, [bass], 1.8, 0.22)
        chord('vla', t, up[1:], 1.8, 0.2)
    line('clar', hbars[0], hb, [('C4', 1), ('F4', 1), ('F4', 1), ('G4', 1), ('A4', 1), ('F4', 1), ('Bb4', 1), ('A4', 1), ('G4', 1), ('F4', 2), ('C4', 1)], 0.4)
    # last phrase in thirds, slowing
    fl = [('C5', 0, 0.58), ('F5', 0.58, 0.58), ('A5', 1.16, 0.58), ('C6', 1.74, 0.6), ('Bb5', 2.34, 0.6), ('A5', 2.94, 0.62),
          ('G5', 3.56, 0.72), ('E5', 4.28, 0.68)]
    cl = ['A4', 'C5', 'F5', 'A5', 'G5', 'F5', 'E5', 'C5']
    for (nm, off, d), c in zip(fl, cl):
        n('flute', hbars[4] + off, nm, d * 0.96, 0.36)
        n('clar', hbars[4] + off, c, d * 0.96, 0.32)
    chord('vc', 56.0, ['C3'], 1.0, 0.24)
    chord('vla', 56.0, ['Bb3', 'E4'], 1.0, 0.22)
    # final chord
    T_END = 57.5
    arp('harp', T_END, 0.07, ['F2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4', 'C5', 'F5'], 2.4, 0.46)
    chord('vc', T_END, ['F2', 'C3'], 2.3, 0.3)
    chord('vla', T_END, ['A3', 'C4', 'F4'], 2.3, 0.28)
    chord('vln', T_END, ['A4', 'C5'], 2.2, 0.22)
    n('flute', T_END, 'F5', 2.2, 0.3)
    n('clar', T_END, 'A4', 2.2, 0.28)
    for t, nm in [(T_END + 0.1, 'C6'), (T_END + 0.45, 'F6'), (T_END + 0.8, 'A6')]:
        n('glock', t, nm, 1.8, 0.34)
    return list(EV)
