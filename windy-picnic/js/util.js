/* The Windy Picnic — shared maths, easing, seeded randomness and noise.
   Everything in the film is a pure function of time, so all randomness is seeded. */
(function () {
  const WP = (window.WP = window.WP || {});

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, x) => clamp((x - a) / (b - a));
  const smooth = (t) => t * t * (3 - 2 * t);
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const TAU = Math.PI * 2;

  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
    smooth,
    smoother,
  };

  /** Progress of t through [a,b], eased. */
  function seg(t, a, b, fn = smooth) {
    return fn(invLerp(a, b, t));
  }

  /** Damped oscillation that starts at time t0 (for wobbles, settles). */
  function wobble(t, t0, freq = 3, decay = 4, amp = 1) {
    if (t < t0) return 0;
    const d = t - t0;
    return amp * Math.sin(d * freq * TAU) * Math.exp(-d * decay);
  }

  /** Keyframe track: keys = [[time, value, easeFn?], ...] (value may be number or array). */
  function track(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i];
      const [t1, v1, fn] = keys[i + 1];
      if (t <= t1) {
        const p = (fn || ease.inOutSine)(invLerp(t0, t1, t));
        if (Array.isArray(v0)) return v0.map((x, j) => lerp(x, v1[j], p));
        return lerp(v0, v1, p);
      }
    }
    return keys[keys.length - 1][1];
  }

  /** Mulberry32 seeded PRNG. */
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash1(n) {
    n = (n << 13) ^ n;
    return 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0;
  }
  function hashf(x) {
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  /** Smooth 1D value noise in [-1,1]. */
  function noise1(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = hashf(i) * 2 - 1;
    const b = hashf(i + 1) * 2 - 1;
    return lerp(a, b, smoother(f));
  }
  function fbm1(x, oct = 3) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise1(x * f + i * 17.3);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }

  /** 2D value noise (periodic when px/py given) in [0,1]. */
  function makeNoise2(seed) {
    const R = rng(seed);
    const P = 256;
    const perm = new Uint8Array(P * 2);
    const vals = new Float32Array(P);
    for (let i = 0; i < P; i++) {
      perm[i] = i;
      vals[i] = R();
    }
    for (let i = P - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < P; i++) perm[P + i] = perm[i];
    const v = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
    return function (x, y, px = 256, py = 256) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
      const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
      const u = smoother(xf), w = smoother(yf);
      return lerp(lerp(v(x0, y0), v(x1, y0), u), lerp(v(x0, y1), v(x1, y1), u), w);
    };
  }

  /** Closed/open Catmull-Rom spline sampled into a dense polyline. */
  function spline(pts, closed = true, perSeg = 10) {
    const out = [];
    const n = pts.length;
    const get = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let k = 0; k < perSeg; k++) {
        const t = k / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }

  function pathFrom(pts, closed = true) {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    if (closed) p.closePath();
    return p;
  }

  function ellipsePts(cx, cy, rx, ry, n = 12, rot = 0, jitter = 0, seed = 1) {
    const R = rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const j = 1 + (R() - 0.5) * jitter;
      const x = Math.cos(a) * rx * j, y = Math.sin(a) * ry * j;
      out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return out;
  }

  function transformPts(pts, m) {
    // m: [a,b,c,d,e,f] like canvas transform
    return pts.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  }
  function rotPts(pts, ang, ox = 0, oy = 0) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  /** Give a scratch canvas's memory back at once (some browsers, Safari especially, count
      canvas memory until garbage collection, and stop drawing when over their limit). */
  function freeCanvas(c) {
    if (c) c.width = c.height = 0;
  }
  // Phones and small tablets keep less painted detail in memory (set by the page before loading).
  const lowMem = !!(window.WP_OPTS && window.WP_OPTS.lowMem);

  function rgba(hex, a = 1) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function mixHex(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  // Film palette: restrained cream, sepia, muted honey-brown and moss-green.
  const PAL = {
    paper: '#f2e8d2',
    paperLight: '#f8f1e0',
    paperDark: '#e2d3b3',
    ink: '#2b2118',
    inkSoft: '#4a3a2a',
    sepia: '#7a5a3a',
    sepiaLight: '#b39269',
    honey: '#c3934a',
    honeyDeep: '#a87332',
    honeyLight: '#e2c38a',
    moss: '#7d8a4e',
    mossDeep: '#5c6a36',
    mossLight: '#b3b98a',
    sage: '#a7ad84',
    heather: '#9a7c70',
    bark: '#8a6a4c',
    sky: '#efe4c8',
    skyWarm: '#f1d9a8',
    blush: '#e6c3ad',
    poohFur: '#d6a45e',
    pigletSkin: '#f0c7ad',
  };

  Object.assign(WP, {
    clamp, lerp, invLerp, smooth, smoother, TAU, ease, seg, wobble, track, rng, hash1, hashf,
    noise1, fbm1, makeNoise2, spline, pathFrom, ellipsePts, transformPts, rotPts, makeCanvas, freeCanvas, lowMem, rgba, mixHex, PAL,
  });
})();
