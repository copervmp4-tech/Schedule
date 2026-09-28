/* The Windy Picnic — the picnic cloth.

   A 13×9 grid of points in 3-D (X right, Y up, Z into the scene) computed
   directly from time, so any frame can be drawn on its own. The cloth has a
   few "behaviours" — shaken out, lying flat, lifting in the breeze, flying,
   snagged like a flag, settling like a falling leaf — blended at the seams.
   It is drawn as gingham quads shaded by their facing, with an inked hem. */
(function () {
  const WP = window.WP;
  const { PAL, lerp, clamp, invLerp, smooth, ease, TAU, rgba, fbm1, noise1, track } = WP;
  const ink = WP.ink;

  const NU = 13, NV = 9;
  const W = 300, D = 170;
  const MEADOW = { x: 380, z: 70 };
  const CLEARING = { x: 4150, z: 62 };
  const SNAG = { x: 3395, y: 150, z: 70 };

  // oblique storybook projection shared by everything on the ground plane
  const proj = (X, Y, Z) => [X + Z * 0.18, -Y - Z * 0.36];

  function grid(fn) {
    const out = new Array(NU * NV);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) out[j * NU + i] = fn(i / (NU - 1), j / (NV - 1));
    return out;
  }

  function flat(c, t, ripple = 0, lift = 0) {
    return grid((u, v) => {
      let y = 0;
      if (ripple) y += ripple * Math.max(0, Math.sin(u * 7 - t * 9 + v * 2)) * (1 - u) * 0.8;
      if (lift) {
        const k = Math.pow(1 - u, 2.2) * (1 - 0.35 * v);
        y += lift * k * (0.75 + 0.25 * Math.sin(t * 17 - u * 9 + v * 3));
      }
      return [c.x + (u - 0.5) * W, y, c.z + (v - 0.5) * D];
    });
  }

  /** Generic free sheet: centre, orientation, dome and travelling waves. */
  function sheet(p, t) {
    const cy = Math.cos(p.yaw || 0), sy = Math.sin(p.yaw || 0);
    const cp = Math.cos(p.pitch || 0), sp = Math.sin(p.pitch || 0);
    const cr = Math.cos(p.roll || 0), sr = Math.sin(p.roll || 0);
    const sc = p.scale ?? 1;
    return grid((u, v) => {
      const a = (u - 0.5) * W * sc * (p.sx ?? 1), b = (v - 0.5) * D * sc * (p.sz ?? 1);
      const du = 2 * u - 1, dv = 2 * v - 1;
      let h = (p.dome || 0) * (1 - du * du) * (1 - dv * dv);
      h += (p.waveA || 0) * Math.sin(u * (p.waveK ?? 1.6) * TAU - t * (p.waveW ?? 9) + v * 1.3) * (0.35 + 0.65 * Math.abs(du));
      h += (p.waveA || 0) * 0.45 * Math.sin(v * 1.2 * TAU - t * (p.waveW ?? 9) * 1.3 + u * 2);
      h -= (p.edgeDrop || 0) * (du * du + dv * dv) * 0.5;
      // roll about X-axis-ish (a stays), pitch tilts depth into height, yaw turns
      let x = a, y = h, z = b;
      // pitch (around X)
      let y1 = y * cp - z * sp, z1 = y * sp + z * cp;
      // roll (around Z)
      let x2 = x * cr - y1 * sr, y2 = x * sr + y1 * cr;
      // yaw (around Y)
      const x3 = x2 * cy + z1 * sy, z3 = -x2 * sy + z1 * cy;
      return [p.c[0] + x3, p.c[1] + y2, p.c[2] + z3];
    });
  }

  function flag(t, strength = 1) {
    return grid((u, v) => {
      const k = u;
      const wave = Math.sin(u * 2.2 * TAU - t * 13 + v * 0.8) * 26 * k * strength + Math.sin(u * 1.1 * TAU - t * 7) * 12 * k;
      return [
        SNAG.x + u * W * 0.88 + Math.sin(t * 5 + v * 2) * 6 * k,
        SNAG.y + (0.5 - v) * D * 0.7 - u * u * 55 + wave * 0.6,
        SNAG.z + (v - 0.5) * D * 0.35 + wave,
      ];
    });
  }

  function mix(A, B, k) {
    if (k <= 0) return A;
    if (k >= 1) return B;
    return A.map((a, i) => [lerp(a[0], B[i][0], k), lerp(a[1], B[i][1], k), lerp(a[2], B[i][2], k)]);
  }

  // Centre path while flying (x, y, z) keyed in film time.
  const FLY = [
    [23.05, [MEADOW.x, 0, MEADOW.z]],
    [23.4, [MEADOW.x + 240, 60, MEADOW.z - 10], ease.inQuad],
    [24.2, [MEADOW.x + 560, 330, MEADOW.z - 30], ease.linear],
    [25.2, [MEADOW.x + 1050, 720, MEADOW.z - 40], ease.outQuad],
    [26.8, [1420, 330, 40], ease.inOutSine],
    [28.4, [1850, 280, 50], ease.inOutSine],
    [29.7, [2250, 330, 40], ease.inOutSine],
    [31.0, [2560, 120, 50], ease.inOutSine],
    [31.9, [2860, 290, 40], ease.inOutSine],
    [33.0, [3180, 240, 60], ease.inOutSine],
    [33.75, [SNAG.x + 60, SNAG.y + 30, SNAG.z], ease.outQuad],
  ];
  const DRIFT = [
    [35.0, [SNAG.x + 140, SNAG.y + 40, SNAG.z]],
    [36.4, [3600, 380, 50], ease.outQuad],
    [38.4, [3820, 470, 40], ease.inOutSine],
    [40.4, [4010, 440, 50], ease.inOutSine],
    [41.6, [4090, 230, 56], ease.inOutSine],
    [42.8, [CLEARING.x, 0, CLEARING.z], ease.inOutQuad],
  ];

  function state(t) {
    // Before the shake-out the cloth is a folded bundle in Pooh's arms (drawn by the film).
    if (t < 7.35) return null;
    // shaken out (7.35–9.25): springs open above the grass, domes on air, floats down
    if (t < 9.8) {
      const s = invLerp(7.35, 9.25, t);
      const c0 = [278, 199, MEADOW.z - 20]; // where the folded bundle is when Pooh flings it
      const c1 = [MEADOW.x - 10, 175, MEADOW.z];
      const c2 = [MEADOW.x, 0, MEADOW.z];
      const k1 = ease.outCubic(clamp(s / 0.35));
      const k2 = ease.inOutSine(clamp((s - 0.3) / 0.7));
      const c = [lerp(lerp(c0[0], c1[0], k1), c2[0], k2), lerp(lerp(c0[1], c1[1], k1), c2[1], k2), lerp(lerp(c0[2], c1[2], k1), c2[2], k2)];
      const open = ease.outBack(clamp(s / 0.3), 1.2);
      const sh = sheet({
        c, scale: lerp(0.25, 1, clamp(open)), pitch: lerp(-1.2, 0, ease.inOutSine(clamp((s - 0.15) / 0.6))), roll: 0.35 * (1 - clamp(s / 0.7)) * Math.sin(s * 5),
        dome: 55 * Math.sin(clamp((s - 0.35) / 0.65) * Math.PI) + 10 * (1 - s), waveA: 22 * Math.pow(1 - clamp(s), 2), waveK: 1.2, waveW: 11,
      }, t);
      const fl = flat(MEADOW, t);
      // settle: edges touch first, the air escapes from the middle
      if (s >= 1) {
        const k = clamp((t - 9.25) / 0.5);
        return mix(sheet({ c: c2, dome: 9 * Math.sin(k * Math.PI) * (1 - k), waveA: 0 }, t), fl, ease.outCubic(k));
      }
      // stop parts of the sheet going under the ground
      for (const p of sh) p[1] = Math.max(p[1], 0);
      return sh;
    }
    if (t < 20.8) return flat(MEADOW, t, t > 19.6 ? 3 * clamp(t - 19.6) : 0);
    if (t < 23.05) return flat(MEADOW, t, 4, 48 * ease.inQuad(invLerp(20.8, 23.0, t)) + 8 * Math.sin(t * 3));
    if (t < 33.75) {
      const c = track(FLY, t);
      const s = invLerp(23.05, 23.6, t);
      const fly = sheet({
        c, pitch: 0.35 * Math.sin(t * 1.3) + (t < 25.2 ? -0.5 * s : 0), roll: 0.45 * Math.sin(t * 0.9 + 1) + (t < 25.2 ? -0.35 : 0), yaw: 0.25 * Math.sin(t * 0.7),
        dome: 22, waveA: 30 + 10 * Math.sin(t * 2), waveK: 1.5, waveW: 10, edgeDrop: 10,
      }, t);
      if (t < 23.6) return mix(flat({ x: c[0], z: MEADOW.z }, t, 4, 50), fly, ease.inOutSine(s));
      return fly;
    }
    if (t < 35.0) {
      const k = clamp((t - 33.75) / 0.3);
      const fl = flag(t);
      if (k < 1) {
        const c = track(FLY, t);
        return mix(sheet({ c, dome: 22, waveA: 30, waveK: 1.5, waveW: 10 }, t), fl, ease.outCubic(k));
      }
      return fl;
    }
    if (t < 43.4) {
      const c = track(DRIFT, t);
      const s = invLerp(40.4, 42.8, t);
      const calm = clamp((t - 38) / 4);
      const free = sheet({
        c, pitch: lerp(0.3 * Math.sin(t * 1.4), 0.28 * Math.sin(t * 3.1) * (1 - s), calm), roll: lerp(0.5 * Math.sin(t * 1.1), 0.4 * Math.sin(t * 2.6 + 0.5) * (1 - s), calm),
        yaw: 0.2 * Math.sin(t * 0.8) * (1 - s), dome: lerp(20, 34 * Math.sin(Math.min(1, s * 1.15) * Math.PI * 0.9) + 6, calm), waveA: lerp(26, 6 * (1 - s), calm), waveK: 1.4, waveW: lerp(10, 5, calm), edgeDrop: 12 * (1 - s),
      }, t);
      if (t < 35.35) return mix(flag(t), free, ease.inOutSine(clamp((t - 35.0) / 0.35)));
      if (t > 42.8) {
        const k = clamp((t - 42.8) / 0.6);
        return mix(sheet({ c: [CLEARING.x, 0, CLEARING.z], dome: 12 * (1 - k) * Math.cos(k * 5), waveA: 0 }, t), flat(CLEARING, t), ease.outCubic(k));
      }
      for (const p of free) p[1] = Math.max(p[1], 0);
      return free;
    }
    return flat(CLEARING, t, 0.6);
  }

  /* ------------------------------------------------------------ drawing */

  const L = normalize([-0.45, 0.8, -0.4]);
  function normalize(v) {
    const d = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / d, v[1] / d, v[2] / d];
  }

  const CREAM = [246, 238, 220], GREEN = [125, 138, 78], DARK = [74, 60, 42];

  /**
   * The cloth cut into drawable pieces for depth sorting with everything else:
   *   decal(ctx)  draws the quads lying flat on the ground (they go under everything)
   *   items       [{ z, sub, draw(ctx) }] for the quads off the ground, keyed by how far
   *               back they are, so a character standing on or behind the cloth and the
   *               cloth passing in front of a character are both drawn the right way round.
   */
  function pieces(G) {
    const S = G.map(([x, y, z]) => proj(x, y, z));
    const quads = [];
    for (let j = 0; j < NV - 1; j++) {
      for (let i = 0; i < NU - 1; i++) {
        const a = j * NU + i, b = a + 1, c = a + NU + 1, d = a + NU;
        const P = [G[a], G[b], G[c], G[d]];
        const e1 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const e2 = [P[3][0] - P[1][0], P[3][1] - P[1][1], P[3][2] - P[1][2]];
        let n = normalize([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
        // viewer looks from the front and a little above
        const facing = n[1] * 0.35 - n[2] * 0.94;
        let back = false;
        if (facing < 0) { n = [-n[0], -n[1], -n[2]]; back = true; }
        const lit = clamp(0.62 + 0.45 * (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), 0.35, 1.05);
        const ymean = (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4;
        const zmean = (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4;
        const ymax = Math.max(P[0][1], P[1][1], P[2][1], P[3][1]);
        const zmax = Math.max(P[0][2], P[1][2], P[2][2], P[3][2]);
        const border = [];
        if (j === 0) border.push([a, b]);
        if (i === NU - 2) border.push([b, c]);
        if (j === NV - 2) border.push([c, d]);
        if (i === 0) border.push([d, a]);
        quads.push({ idx: [a, b, c, d], i, j, lit, back, depth: zmean - ymean * 0.15, key: zmax - ymean * 0.15, flat: ymax < 2.5, border });
      }
    }
    const drawQuad = (ctx, q) => {
      const si = q.i % 2 === 0, sj = q.j % 2 === 0;
      const g = (si ? 1 : 0) + (sj ? 1 : 0);
      const k = g === 2 ? 0.62 : g === 1 ? 0.3 : 0.02;
      let col = CREAM.map((cv, m) => lerp(cv, GREEN[m], k * (q.back ? 0.65 : 1)));
      const shade = q.back ? q.lit * 0.86 : q.lit;
      col = col.map((cv, m) => (shade < 1 ? lerp(DARK[m], cv, 0.35 + 0.65 * shade) : lerp(cv, 255, (shade - 1) * 2)));
      const fill = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      const [a, b, c, d] = q.idx;
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(S[a][0], S[a][1]);
      ctx.lineTo(S[b][0], S[b][1]);
      ctx.lineTo(S[c][0], S[c][1]);
      ctx.lineTo(S[d][0], S[d][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // woven texture along alternate rows
      ctx.strokeStyle = rgba(PAL.mossDeep, 0.18);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      if (q.j % 2 === 0) { ctx.moveTo(S[a][0], S[a][1]); ctx.lineTo(S[b][0], S[b][1]); }
      if (q.j === NV - 2 && (NV - 1) % 2 === 0) { ctx.moveTo(S[d][0], S[d][1]); ctx.lineTo(S[c][0], S[c][1]); }
      ctx.stroke();
      // the inked hem, a piece at a time
      for (const [p0, p1] of q.border) {
        const x0 = S[p0][0], y0 = S[p0][1], x1 = S[p1][0], y1 = S[p1][1];
        const l = Math.hypot(x1 - x0, y1 - y0) || 1;
        const ex = ((x1 - x0) / l) * 0.8, ey = ((y1 - y0) / l) * 0.8;
        ink.stroke(ctx, [[x0 - ex, y0 - ey], [x1 + ex, y1 + ey]], { w: 1.9, seed: 900 + p0 * 0.37 + p1 * 0.11, wobble: 0.25, press: 0.25, taper: [0, 0], minTip: 1 });
      }
    };
    const flat = quads.filter((q) => q.flat).sort((q1, q2) => q2.depth - q1.depth);
    const lifted = quads.filter((q) => !q.flat);
    return {
      S,
      decal: (ctx) => { for (const q of flat) drawQuad(ctx, q); },
      items: lifted.map((q) => ({ z: q.key, sub: q.depth, draw: (ctx) => drawQuad(ctx, q) })),
    };
  }

  /** The whole cloth on its own, back to front. */
  function draw(ctx, G) {
    const pc = pieces(G);
    pc.decal(ctx);
    pc.items.sort((a, b) => b.z - a.z || b.sub - a.sub).forEach((it) => it.draw(ctx));
    return pc.S;
  }

  /** Folded cloth bundle (held by Pooh before he shakes it out); origin at its centre. */
  function drawBundle(ctx) {
    const pts = [[-30, -16], [26, -20], [32, 14], [-28, 18]];
    const P = WP.spline(pts, true, 4);
    const path = WP.pathFrom(P);
    ctx.fillStyle = 'rgb(246,238,220)';
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = rgba(PAL.moss, 0.55);
    for (let i = -3; i < 4; i++) ctx.fillRect(i * 12 - 4, -30, 6, 60);
    for (let j = -2; j < 3; j++) ctx.fillRect(-40, j * 12 - 3, 80, 6);
    ctx.restore();
    ink.outline(ctx, P, { w: 1.8, seed: 901, breaks: 2 });
    ink.line(ctx, [[-26, -4], [0, -1], [28, -6]], { w: 1.1, seed: 902, alpha: 0.7 });
    ink.line(ctx, [[-24, 7], [4, 9], [30, 5]], { w: 1.1, seed: 903, alpha: 0.7 });
  }

  WP.cloth = { state, draw, pieces, drawBundle, proj, MEADOW, CLEARING, SNAG, NU, NV };
})();
