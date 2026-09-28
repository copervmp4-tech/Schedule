/* The Windy Picnic — Pooh and Piglet, after E. H. Shepard's 1926 drawings.

   Both are articulated stuffed toys in a three-quarter view facing right (the
   caller flips them to face left). Units are pixels at scale 1, origin at the
   feet; Pooh stands about 290 high, Piglet about 165. Proportions were measured
   from the 1926 plates (figure height = 1):

   Pooh — ears ≈0.12 across, set on top of a broad head that fills the top third;
   head and body share one back line (no neck), the chin shows only as a jaw
   line across the chest; a short blunt muzzle with the nose at its tip and a dot
   of an eye right at its root; a pear-shaped tummy that leans back and sits over
   short round legs; short thick arms starting just under the jaw.

   Piglet — a head wider than tall (≈1.45 : 1) tapering to a level snout with a
   flat end, the eye at the snout's root; big leaf-shaped ears, the far one
   often flopped out sideways; a barrel of a knitted jumper about half his
   height, striped almost black; thin bare arms; very short legs.

   The drawing is line-led like the book: pale paper tint, a bold broken pen
   outline pressed harder on the shadowed side, and hatching that follows the
   form. */
(function () {
  const WP = window.WP;
  const { spline, pathFrom, PAL, lerp, clamp, TAU, rgba } = WP;
  const ink = WP.ink;

  const TINT = { pooh: ['#d9a95f', 0.1], piglet: ['#ecb9a0', 0.2] };
  const BASE = '#fbf6ea'; // the figures are a shade lighter than the page, as in the book

  /* ------------------------------------------------------------ helpers */

  function shape(pts, per = 7) {
    const P = spline(pts, true, per);
    return { P, path: pathFrom(P), per, n: pts.length, cum: null };
  }
  function bbox(P) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of P) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return [x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4];
  }
  /** Fraction of the outline's length at control point i (splines sample `per` points per segment). */
  function fracAt(S, i) {
    const P = S.P;
    if (!S.cum) {
      S.cum = [0];
      for (let k = 1; k <= P.length; k++) S.cum.push(S.cum[k - 1] + Math.hypot(P[k % P.length][0] - P[k - 1][0], P[k % P.length][1] - P[k - 1][1]));
    }
    return S.cum[Math.min(P.length, Math.round(i * S.per))] / S.cum[P.length];
  }
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const scaleV = (v, k) => [v[0] * k, v[1] * k];

  /**
   * Soft tube (arm) along a bent centre line: starts at the pivot heading
   * straight down and curls forward by `curl` along its length. The shoulder
   * end is rounded too, so it stays inside the body whatever the angle.
   */
  function tube(len, w0, w1, curl, n = 10, paw = 0.56) {
    const C = [];
    let x = 0, y = 0, a = Math.PI / 2;
    const ds = len / n;
    for (let i = 0; i <= n; i++) {
      C.push([x, y]);
      a -= (curl / n) * (0.4 + 1.2 * (i / n));
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
    }
    const L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const p = C[i], q = C[Math.min(n, i + 1)], o = C[Math.max(0, i - 1)];
      let dx = q[0] - o[0], dy = q[1] - o[1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const u = i / n;
      const w = lerp(w0, w1, u) * (1 + 0.05 * Math.sin(u * Math.PI)) * 0.5;
      L.push([p[0] - dy * w, p[1] + dx * w]);
      R.push([p[0] + dy * w, p[1] - dx * w]);
    }
    const e = C[n], pe = C[n - 1];
    const ang = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
    const cap = [];
    for (let k = 1; k < 6; k++) {
      const a2 = ang + Math.PI / 2 - (k / 6) * Math.PI;
      cap.push([e[0] + Math.cos(a2) * w1 * paw, e[1] + Math.sin(a2) * w1 * paw]);
    }
    const top = [[0, -w0 * 0.35]];
    const pts = L.concat(cap, R.reverse(), top);
    return { pts, end: e, dir: ang, nL: L.length, nCap: cap.length };
  }

  /**
   * Paint one soft-toy part: paper, a pale tint, hatching on the shadowed side
   * (following the form), then the pen outline, pressed harder away from the light.
   *   st.shade  [dx,dy]  light offset in this part's frame (crescent width)
   *   st.open   [i0,i1]  control-point range left un-inked (where a part joins another)
   */
  function paint(ctx, S, st) {
    const { P, path } = S;
    const seed = st.seed ?? 1;
    ctx.fillStyle = st.base ?? BASE;
    ctx.fill(path);
    if (st.tint) ink.wash(ctx, path, st.tint[0], { alpha: st.tint[1], edge: st.edge ?? 0.35, edgeW: 6, texAlpha: 0.4 });
    const bb = bbox(P);
    if (st.shade) {
      const l = Math.hypot(st.shade[0], st.shade[1]) || 1;
      const size = Math.min(bb[2], bb[3]);
      ink.edgeHatch(ctx, P, path, {
        dir: [-st.shade[0] / l, -st.shade[1] / l], angle: st.hAngle ?? -1.35, spacing: st.hSp ?? 2.6,
        depth: st.hDepth ?? size * 0.25, len: st.hLen ?? size * 0.4, w: st.hW ?? 0.95, alpha: st.hA ?? 0.8,
        seed, color: PAL.ink, cross: st.cross ?? 0, wash: PAL.sepia, washAlpha: st.shadeWashA ?? 0.1, threshold: st.hThr ?? 0.08,
      });
    }
    if (st.inside) st.inside(S);
    if (st.outline === false) return;
    let heavy = null;
    if (st.shade) {
      const l = Math.hypot(st.shade[0], st.shade[1]) || 1;
      heavy = { cx: bb[0] + bb[2] / 2, cy: bb[1] + bb[3] / 2, dx: -st.shade[0] / l, dy: -st.shade[1] / l, k: st.heavy ?? 0.85 };
    }
    const o = { w: st.lw ?? 3, seed, breaks: st.breaks ?? 3, wobble: st.wob ?? 1.0, press: 0.6, gap: 0.012, color: PAL.ink, heavy, minTip: 0.12 };
    if (st.open) {
      const [a, b] = st.open;
      const fA = fracAt(S, a), fB = fracAt(S, b % S.n) + (b >= S.n ? 1 : 0);
      ink.stroke(ctx, ink.slice(P, fB, fA + 1, true), { ...o, taper: [0.07, 0.07] });
    } else ink.outline(ctx, P, o);
    if (st.fur) for (const f of st.fur) ink.ticks(ctx, P, { from: f[0], to: f[1], density: f[2] ?? 0.1, len: f[3] ?? 4, w: 1.2, seed: seed + f[0] * 10, side: -1, prob: 0.7, lean: 0.9 });
  }
  function part(ctx, pts, st, per = 7) {
    const S = shape(pts, per);
    paint(ctx, S, st);
    return S;
  }

  /*
   * Rigid parts (a body, a head, an ear, a leg, an arm at a given bend) look the same
   * every frame in their own frame, so each is painted once into a bitmap at 2.6× and then
   * stamped. The drawing is identical; the per-frame cost drops from thousands of pen
   * strokes to a handful of image draws, which is what keeps playback smooth.
   */
  const CACHE = new Map();
  const CRES = 2.6;
  const q = (v, step) => Math.round(v / step) * step;
  const skey = (sh) => sh ? sh.map((v) => v.toFixed(1)).join(',') : '-';
  function cachedPart(ctx, key, makeS, st, extra) {
    let e = CACHE.get(key);
    if (!e) {
      const S = makeS();
      const bb = bbox(S.P);
      const m = (st.lw ?? 3) * 2.5 + 12;
      const x0 = bb[0] - m, y0 = bb[1] - m;
      const c = document.createElement('canvas');
      c.width = Math.ceil((bb[2] + m * 2) * CRES);
      c.height = Math.ceil((bb[3] + m * 2) * CRES);
      const g = c.getContext('2d');
      g.scale(CRES, CRES);
      g.translate(-x0, -y0);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      if (st.custom) st.custom(g, S);
      else paint(g, S, st);
      if (extra) extra(g, S);
      e = { S, c, x0, y0, w: c.width / CRES, h: c.height / CRES };
      CACHE.set(key, e);
    }
    const iq = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(e.c, e.x0, e.y0, e.w, e.h);
    ctx.imageSmoothingQuality = iq;
    return e.S;
  }

  function at(ctx, x, y, r, fn) {
    ctx.save();
    ctx.translate(x, y);
    if (r) ctx.rotate(r);
    fn();
    ctx.restore();
  }

  /** Hatched shadow a head casts on the chest just under the jaw (clipped by the caller to the body). */
  function castUnder(ctx, S, dx, dy, o) {
    const moved = new Path2D();
    moved.addPath(S.path, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    const both = new Path2D();
    both.addPath(S.path);
    both.addPath(S.path, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    ctx.save();
    ctx.clip(moved);
    ctx.clip(both, 'evenodd');
    if (o.rect) {
      const r = new Path2D();
      r.rect(...o.rect);
      ctx.clip(r);
    }
    ctx.globalAlpha *= 0.14;
    ctx.fillStyle = PAL.sepia;
    ctx.fill(moved);
    ctx.globalAlpha /= 0.14;
    ink.hatch(ctx, bbox(S.P).map((v, i) => (i < 2 ? v - 20 : v + 40)), { angle: o.angle ?? -1.25, spacing: o.spacing ?? 2.8, w: o.w ?? 0.9, alpha: o.alpha ?? 0.75, seed: o.seed ?? 9, minLen: 0.05, lenVar: 0.2 });
    ctx.restore();
  }

  /** Hatched shadow that the outline `pts` casts (offset dx,dy) onto whatever is clipped. */
  function castFrom(ctx, pts, dx, dy, o = {}) {
    const S = shape(pts, 3);
    const moved = new Path2D();
    moved.addPath(S.path, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    const both = new Path2D();
    both.addPath(S.path);
    both.addPath(moved);
    ctx.save();
    ctx.clip(moved);
    ctx.clip(both, 'evenodd');
    ctx.globalAlpha *= 0.1;
    ctx.fillStyle = PAL.sepia;
    ctx.fill(moved);
    ctx.globalAlpha /= 0.1;
    const bb = bbox(S.P);
    ink.hatch(ctx, [bb[0] - 10, bb[1] - 10, bb[2] + 20 + Math.abs(dx), bb[3] + 20 + Math.abs(dy)], { angle: o.angle ?? -1.4, spacing: o.spacing ?? 2.2, w: o.w ?? 1.1, alpha: o.alpha ?? 0.8, seed: o.seed ?? 5, minLen: 0.2, lenVar: 0.6 });
    ctx.restore();
  }
  const xform = (pts, x, y, a) => pts.map((p) => { const q = rot(p, a); return [q[0] + x, q[1] + y]; });

  /* ------------------------------------------------------------ Pooh */

  const POOH_DEFAULT = {
    lean: 0, bob: 0, squash: 1, head: 0, headX: 0, headY: 0,
    armN: 0.28, armF: 0.2, armNCurl: 0.35, armFCurl: 0.3, legN: 0, legF: 0, legNLift: 0, legFLift: 0,
    sit: 0, eye: 1, blink: 0, lookX: 0, lookY: 0, mouth: 0, brow: 0, earWind: 0, t: 0,
    shade: [-8, -7], hold: null, holdFn: null,
  };

  const POOH = {
    // hip frame (origin between the hips). The back rises straight up into the head; the
    // tummy leans forward and overhangs the tops of the legs.
    body: [[-28, 10], [-6, 17], [17, 10], [37, -12], [51, -38], [56, -64], [52, -92], [40, -114], [25, -130], [8, -152], [-20, -164], [-41, -154], [-46, -128], [-48, -100], [-49, -68], [-46, -34], [-39, -6]],
    // head frame (origin at the neck, under the middle of the jaw)
    head: [[-14, 3], [6, 1], [22, -6], [34, -13], [43, -21], [49, -28], [53, -36], [51, -44], [44, -49], [38, -53], [33, -62], [25, -73], [12, -81], [-5, -85], [-22, -81], [-35, -70], [-43, -53], [-45, -33], [-44, -14], [-35, -1]],
    // leg frame (origin at the hip joint); the foot turns forward
    leg: [[-16, -18], [16, -18], [17, 16], [20, 30], [29, 37], [35, 44], [33, 52], [21, 56], [-8, 56], [-17, 50], [-18, 16]],
    ear: [[-12, 8], [-16, -2], [-14, -12], [-6, -17], [4, -17], [12, -12], [16, -2], [12, 8]],
    neckY: -132,
  };

  function poohEar(ctx, x, y, r, wind, t, seed, shade) {
    at(ctx, x, y, r + wind * 0.2 * Math.sin(t * 19 + seed), () => {
      cachedPart(ctx, 'pooh.ear.' + seed + skey(shade), () => shape(POOH.ear), { tint: TINT.pooh, lw: 3.1, seed, open: [7, 8], shade: shade, hDepth: 6, hLen: 9, hSp: 2.8, hA: 0.7, hAngle: -0.9 }, (g) => {
        // the cup of the ear
        ink.line(g, [[-8, 4], [-9, -5], [-3, -10], [4, -9], [8, -3]], { w: 1.5, seed: seed + 2, taper: [0.3, 0.4], alpha: 0.85 });
      });
    });
  }

  function poohArm(ctx, pose, near, seed) {
    const curl = q(near ? pose.armNCurl : pose.armFCurl, 0.04);
    const top = 27; // index of the rounded shoulder cap in tube()'s outline
    cachedPart(ctx, 'pooh.arm.' + seed + '.' + curl.toFixed(2) + skey(pose.shade), () => shape(tube(66, 34, 27, curl, 10, 0.6).pts, 3), {
      tint: TINT.pooh, lw: 3.2, seed, shade: pose.shade, hAngle: 1.45, hSp: 2.2, hW: 1.05, hDepth: 11, hLen: 24,
      open: [top - 1, top + 2],
    });
  }

  function poohLeg(ctx, pose, near, seed, r) {
    const sole = pose.sit > 0.5 && near;
    cachedPart(ctx, 'pooh.leg.' + seed + (sole ? '.sole' : '') + skey(pose.shade), () => shape(POOH.leg),
      { tint: TINT.pooh, lw: 3.4, seed, shade: pose.shade, hAngle: 1.5, hSp: 2.2, hW: 1.05, hDepth: 12, hLen: 22, open: [0, 1] },
      sole ? (g) => {
        // the sole shows when the legs stick out in front
        g.save();
        g.translate(8, 51);
        part(g, WP.ellipsePts(0, 0, 13, 5, 10), { tint: [PAL.honey, 0.25], lw: 1.6, seed: seed + 5, breaks: 1, edge: 0 });
        g.restore();
      } : null);
  }

  function drawPooh(ctx, pose0) {
    const pose = Object.assign({}, POOH_DEFAULT, pose0);
    const t = pose.t;
    const sh = pose.shade;
    ctx.save();
    ctx.lineJoin = 'round';
    const sit = pose.sit;
    const hipY = lerp(-56, -20, sit);
    const legRotN = -(pose.legN + sit * 1.5);
    const legRotF = -(pose.legF + sit * 1.35);

    // both legs first: the tummy overhangs their tops
    at(ctx, -18 + sit * 6, hipY + pose.bob * 0.4 - pose.legFLift, legRotF, () => poohLeg(ctx, pose, false, 21, legRotF));
    at(ctx, 14 + sit * 10, hipY + pose.bob * 0.4 - pose.legNLift, legRotN, () => poohLeg(ctx, pose, true, 22, legRotN));

    const bodyFrame = () => {
      ctx.translate(0, hipY + pose.bob);
      ctx.rotate(pose.lean);
      ctx.scale(1 / Math.sqrt(pose.squash), pose.squash);
    };
    const headFrame = () => {
      ctx.translate(pose.headX, POOH.neckY + pose.headY);
      ctx.rotate(pose.head);
    };
    ctx.save();
    bodyFrame();
    at(ctx, -24, -122, -pose.armF, () => poohArm(ctx, pose, false, 31));
    const BS = cachedPart(ctx, 'pooh.body' + skey(sh), () => shape(POOH.body), {
      tint: TINT.pooh, lw: 3.8, seed: 11, shade: sh, hAngle: -1.42, hSp: 2.0, hW: 1.15, hDepth: 34, hLen: 52, hA: 0.85, cross: 0.45,
      fur: [[0.7, 0.9, 0.05, 2.6]],
    }, (g) => {
      // the round of the tummy
      ink.line(g, [[34, -18], [45, -46], [42, -78]], { w: 1.3, seed: 12, alpha: 0.55, taper: [0.4, 0.4] });
    });
    // the near arm's shadow on the tummy
    ctx.save();
    ctx.clip(BS.path);
    const armPts = tube(66, 34, 27, pose.armNCurl, 10, 0.6).pts;
    const l = Math.hypot(sh[0], sh[1]) || 1;
    castFrom(ctx, xform(armPts, 20, -122, -pose.armN), (-sh[0] / l) * 9, (-sh[1] / l) * 7, { seed: 14 });
    ctx.restore();

    if (pose.hold === 'behind' && pose.holdFn) pose.holdFn(ctx);

    ctx.save();
    headFrame();
    poohEar(ctx, -17, -80, -0.22, pose.earWind, t, 41, sh);
    cachedPart(ctx, 'pooh.head' + skey(sh), () => shape(POOH.head), { tint: TINT.pooh, lw: 3.6, seed: 51, shade: sh, hAngle: -1.05, hSp: 2.2, hDepth: 12, hLen: 20, hA: 0.7, hThr: 0.45, open: [18, 20], fur: [[0.74, 0.86, 0.05, 2.4]] }, (g) => {
      // where the muzzle meets the face
      ink.line(g, [[37, -52], [35, -41], [37, -29]], { w: 1.2, seed: 52, alpha: 0.45, taper: [0.4, 0.4] });
    });
    // nose, a blob at the tip of the muzzle
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.ellipse(49.5, -38.5, 5.4, 4.4, 0.35, 0, TAU);
    ctx.fill();
    // eye: a dot at the root of the muzzle (blinks to a short line; 2 = a contented closed curve)
    const ex = 21 + pose.lookX * 2, ey = -41 + pose.lookY * 2;
    ctx.fillStyle = PAL.ink;
    if (pose.eye === 2) {
      ink.line(ctx, [[ex - 4.5, ey + 1.5], [ex, ey - 2], [ex + 4.5, ey + 1.5]], { w: 1.8, seed: 53, taper: [0.3, 0.3] });
    } else if (pose.blink > 0.5) {
      ink.line(ctx, [[ex - 4, ey + 0.5], [ex + 4, ey]], { w: 1.9, seed: 54, taper: [0.3, 0.3] });
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.7, 3.2 * (1 - pose.blink * 0.8), 0, 0, TAU);
      ctx.fill();
    }
    // brow — a small slanting stroke that tells us what the bear is thinking
    const b = pose.brow;
    ink.line(ctx, [[ex - 8, ey - 10 - b * 2.5], [ex - 1, ey - 12.5 - b * 3.5], [ex + 6, ey - 10.5 - b * 0.5]], { w: 1.4, seed: 55, alpha: 0.85, taper: [0.4, 0.4] });
    // mouth, tucked under the muzzle
    if (pose.mouth < -0.3) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(40, -21, 2.8, 3.3, 0, 0, TAU);
      ctx.stroke();
    } else {
      const m = pose.mouth;
      ink.line(ctx, [[46, -24.5], [41, -21.5 + m * 1.8], [35, -22.5 - m * 1.4]], { w: 1.4, seed: 56, taper: [0.3, 0.4], alpha: 0.9 });
    }
    poohEar(ctx, 21, -82, 0.24, pose.earWind, t + 0.3, 42, sh);
    ctx.restore();

    if (pose.hold === 'front' && pose.holdFn) pose.holdFn(ctx);
    at(ctx, 20, -122, -pose.armN, () => poohArm(ctx, pose, true, 32));
    if (pose.hold === 'over' && pose.holdFn) pose.holdFn(ctx);
    ctx.restore();
    ctx.restore();
  }

  /* ------------------------------------------------------------ Piglet */

  const PIGLET_DEFAULT = {
    lean: 0, bob: 0, squash: 1, head: 0, headX: 0, headY: 0,
    armN: 0.2, armF: 0.15, armNCurl: 0.2, armFCurl: 0.2, legN: 0, legF: 0, legNLift: 0, legFLift: 0, sit: 0,
    earN: 0, earF: 0, earWind: 0, eye: 1, blink: 0, lookX: 0, lookY: 0, mouth: 0.4, blush: 0.5, t: 0,
    shade: [-6, -5], hold: null, holdFn: null,
  };

  const PIG = {
    leg: [[-5.5, -12], [5.5, -12], [5.5, 8], [8, 12], [12, 15], [12, 19], [7, 21], [-4, 21], [-6.5, 16], [-6, 4]],
    // the jumper, hip frame: a barrel, fuller at the back and bottom
    body: [[-22, 3], [0, 7], [21, 3], [27, -14], [28, -36], [23, -56], [13, -72], [2, -80], [-9, -80], [-19, -72], [-28, -55], [-32, -32], [-30, -11]],
    // head frame (origin at the neck): wider than tall, tapering to a level snout
    head: [[-12, 1], [4, 0], [16, -4], [25, -9], [31, -12.5], [37, -15], [42.5, -17], [44, -22], [42.5, -27], [37, -28.5], [31, -30], [29, -36], [24, -43], [14, -49], [1, -51], [-11, -48], [-20, -41], [-25, -30], [-24, -17], [-20, -7]],
    // leaf-shaped ear, pointing up from its base
    ear: [[-8, 1], [-9, -8], [-6, -16], [0, -24], [6, -15], [9, -7], [8, 1]],
    neck: [2, -79],
  };

  function pigEar(ctx, x, y, r, flop, wind, t, seed, shade) {
    const f = q(flop + wind * 0.35 * Math.sin(t * 23 + seed * 2), 0.04);
    // ears bend along their length (floppy near the tip)
    const bend = ([px, py]) => {
      const k = clamp(-py / 27);
      return rot([px, py], f * k * k);
    };
    at(ctx, x, y, r, () => {
      cachedPart(ctx, 'pig.ear.' + seed + '.' + f.toFixed(2) + skey(shade), () => shape(PIG.ear.map(bend), 6),
        { tint: TINT.piglet, lw: 2.4, seed, open: [6, 7], shade, hDepth: 4, hLen: 7, hSp: 2.2, hA: 0.6, edge: 0.5 }, (g) => {
          // the fold down the middle
          ink.line(g, [[0.5, -1], bend([0.5, -8]), bend([0.5, -16])], { w: 1, seed: seed + 1, alpha: 0.7, taper: [0.3, 0.5] });
        });
    });
  }

  function pigArm(ctx, pose, near, seed) {
    const curl = q(near ? pose.armNCurl : pose.armFCurl, 0.04);
    const top = 23; // index of the shoulder cap in tube()'s outline (n = 8)
    cachedPart(ctx, 'pig.arm.' + seed + '.' + curl.toFixed(2) + skey(pose.shade), () => shape(tube(38, 7, 5.6, curl, 8, 0.9).pts, 3),
      { tint: TINT.piglet, lw: 2.1, seed, shade: pose.shade, hAngle: 1.45, hDepth: 3, hLen: 10, hSp: 2.2, hA: 0.6, edge: 0.5, open: [top - 1, top + 2] });
  }

  function pigLeg(ctx, pose, seed, r) {
    cachedPart(ctx, 'pig.leg.' + seed + skey(pose.shade), () => shape(PIG.leg, 6),
      { tint: TINT.piglet, lw: 2.3, seed, shade: pose.shade, hAngle: 1.5, hDepth: 4, hLen: 9, hSp: 2.2, hA: 0.6, edge: 0.5, open: [0, 1] });
  }

  function jumper(ctx, pose) {
    return cachedPart(ctx, 'pig.jumper' + skey(pose.shade), () => shape(PIG.body, 6), { lw: 2.8, custom: (g, S) => paintJumper(g, S, pose) });
  }
  function paintJumper(ctx, S, pose) {
    const { P, path } = S;
    ctx.fillStyle = PAL.paperLight;
    ctx.fill(path);
    ink.wash(ctx, path, PAL.moss, { alpha: 0.3, edge: 0.3 });
    ctx.save();
    ctx.clip(path);
    // knitted stripes: bands of close ink hatching over a moss-green wash, with thin pale gaps,
    // curving round the barrel of his body
    for (let i = 0; i < 10; i++) {
      const y0 = 7 - i * 8.6;
      const sag = 3.2 - i * 0.12;
      const band = new Path2D();
      band.moveTo(-45, y0 - 1);
      band.quadraticCurveTo(-2, y0 + sag, 40, y0 - 1);
      band.lineTo(40, y0 - 6.8);
      band.quadraticCurveTo(-2, y0 - 6.8 + sag, -45, y0 - 6.8);
      band.closePath();
      ctx.fillStyle = rgba(PAL.mossDeep, 0.9);
      ctx.fill(band);
      ctx.save();
      ctx.clip(band);
      ink.hatch(ctx, [-40, y0 - 10, 80, 14], { angle: 0.05, spacing: 1.2, w: 1.1, alpha: 0.95, seed: 70 + i, minLen: 0.35, lenVar: 0.9, jitter: 0.3 });
      ctx.restore();
    }
    ctx.restore();
    const l0 = Math.hypot(pose.shade[0], pose.shade[1]) || 1;
    ink.edgeHatch(ctx, P, path, { dir: [-pose.shade[0] / l0, -pose.shade[1] / l0], angle: -1.4, spacing: 2.2, depth: 12, len: 22, w: 0.9, alpha: 0.6, seed: 77 });
    const l = Math.hypot(pose.shade[0], pose.shade[1]) || 1;
    const bb = bbox(P);
    ink.outline(ctx, P, { w: 2.8, seed: 78, breaks: 3, wobble: 0.7, press: 0.6, heavy: { cx: bb[0] + bb[2] / 2, cy: bb[1] + bb[3] / 2, dx: -pose.shade[0] / l, dy: -pose.shade[1] / l, k: 0.8 } });
    return S;
  }

  function drawPiglet(ctx, pose0) {
    const pose = Object.assign({}, PIGLET_DEFAULT, pose0);
    const t = pose.t;
    const sh = pose.shade;
    ctx.save();
    ctx.lineJoin = 'round';
    const sit = pose.sit;
    const hipY = lerp(-20, -9, sit);
    const rF = -(pose.legF + sit * 1.4), rN = -(pose.legN + sit * 1.5);
    at(ctx, -10 + sit * 2, hipY + pose.bob * 0.4 - pose.legFLift, rF, () => pigLeg(ctx, pose, 121, rF));
    at(ctx, 8 + sit * 4, hipY + pose.bob * 0.4 - pose.legNLift, rN, () => pigLeg(ctx, pose, 122, rN));

    const bodyFrame = () => {
      ctx.translate(0, hipY + pose.bob);
      ctx.rotate(pose.lean);
      ctx.scale(1 / Math.sqrt(pose.squash), pose.squash);
    };
    const headFrame = () => {
      ctx.translate(PIG.neck[0] + pose.headX, PIG.neck[1] + pose.headY);
      ctx.rotate(pose.head);
    };
    const HS = shape(PIG.head, 7);

    ctx.save();
    bodyFrame();
    at(ctx, -18, -66, -pose.armF, () => pigArm(ctx, pose, false, 131));
    const JS = jumper(ctx, pose);
    // the head's shadow on the top of the jumper
    ctx.save();
    ctx.clip(JS.path);
    headFrame();
    castUnder(ctx, HS, 2, 7, { rect: [-40, -20, 80, 40], seed: 79, spacing: 2.2, alpha: 0.6 });
    ctx.restore();

    ctx.save();
    headFrame();
    pigEar(ctx, -9, -44, -1.0 + pose.earF, -0.55 * pose.earF, pose.earWind, t, 141, sh);
    cachedPart(ctx, 'pig.head' + skey(sh), () => HS, { tint: TINT.piglet, lw: 2.8, seed: 151, shade: sh, hAngle: -1.0, hDepth: 10, hLen: 14, hSp: 2.3, hA: 0.7, edge: 0.55 });
    if (pose.blush > 0) ink.bloom(ctx, 11, -14, 8, '#d99a80', 0.22 * pose.blush, 0.8);
    // the flat end of the snout
    ctx.save();
    ctx.translate(43.1, -22);
    ctx.rotate(-0.05);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 4.0, 0, 0, TAU);
    ctx.fillStyle = rgba('#d8a088', 0.3);
    ctx.fill();
    ctx.restore();
    ink.line(ctx, [[42.1, -26], [41.1, -22], [42.1, -18.2]], { w: 1.2, seed: 153, alpha: 0.85, taper: [0.3, 0.3] });
    // eye: a dot at the root of the snout
    ctx.fillStyle = PAL.ink;
    const ex = 26 + pose.lookX * 1.5, ey = -23.5 + pose.lookY * 1.5;
    if (pose.eye === 2) {
      ink.line(ctx, [[ex - 3.2, ey + 1], [ex, ey - 1.8], [ex + 3.2, ey + 1]], { w: 1.45, seed: 154, taper: [0.3, 0.3] });
    } else if (pose.blink > 0.5) {
      ink.line(ctx, [[ex - 3, ey], [ex + 3, ey]], { w: 1.5, seed: 155, taper: [0.3, 0.3] });
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.1, 2.5 * (1 - pose.blink * 0.8), 0, 0, TAU);
      ctx.fill();
    }
    // mouth: a little line under the root of the snout
    if (pose.mouth < -0.3) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(31, -10.5, 1.8, 2.2, 0, 0, TAU);
      ctx.stroke();
    } else {
      const m = pose.mouth;
      ink.line(ctx, [[35.5, -13.5], [31, -10.5 + m * 1.4], [26.5, -11.5 - m * 1.1]], { w: 1.3, seed: 156, taper: [0.3, 0.4] });
    }
    pigEar(ctx, 12, -48, 0.1 + pose.earN, 0.45 * pose.earN, pose.earWind, t + 0.4, 142, sh);
    ctx.restore();

    if (pose.hold && pose.holdFn) pose.holdFn(ctx);
    at(ctx, 15, -64, -pose.armN, () => pigArm(ctx, pose, true, 132));
    ctx.restore();
    ctx.restore();
  }

  /* ------------------------------------------------------------ motion helpers */

  /** Soft-toy walk / run cycle. phase in cycles; amp 0..1 (0 = standing); run 0..1. */
  function walkCycle(phase, amp = 1, run = 0) {
    const a = phase * TAU;
    const swing = Math.sin(a) * (0.38 + run * 0.3) * amp;
    // feet lift smoothly (no corner at the contact) and the body rises and falls once a step
    const lift = Math.pow(Math.max(0, Math.cos(a)), 1.6) * (5 + run * 8) * amp;
    const liftF = Math.pow(Math.max(0, -Math.cos(a)), 1.6) * (5 + run * 8) * amp;
    const bob = -0.5 * Math.cos(2 * a) * (4 + run * 7) * amp;
    return {
      legN: swing, legF: -swing, legNLift: lift, legFLift: liftF,
      armN: -swing * (0.8 + run * 0.5) + 0.25, armF: swing * (0.8 + run * 0.5) + 0.2,
      bob, lean: (0.03 + run * 0.13) * amp + Math.cos(a * 2) * 0.012 * amp,
      head: -Math.cos(a * 2 + 0.7) * 0.025 * amp,
    };
  }

  /** Natural blinking: 0..1 closure for time t (seeded per character). */
  function blinkAt(t, seed = 0) {
    const period = 3.3 + (seed % 3) * 0.8;
    const ph = (t + seed * 1.37) % period;
    if (ph < 0.15) return Math.sin((ph / 0.15) * Math.PI);
    return 0;
  }

  /** Pooh's body frame (hips, lean, squash) as a matrix from his feet, for this pose. */
  function poohBodyMatrix(pose0) {
    const pose = Object.assign({}, POOH_DEFAULT, pose0);
    const hipY = lerp(-56, -20, pose.sit);
    return new DOMMatrix()
      .translate(0, hipY + pose.bob)
      .rotate((pose.lean * 180) / Math.PI)
      .scale(1 / Math.sqrt(pose.squash), pose.squash);
  }
  /** Piglet's body frame as a matrix from his feet, for this pose. */
  function pigletBodyMatrix(pose0) {
    const pose = Object.assign({}, PIGLET_DEFAULT, pose0);
    const hipY = lerp(-20, -9, pose.sit);
    return new DOMMatrix()
      .translate(0, hipY + pose.bob)
      .rotate((pose.lean * 180) / Math.PI)
      .scale(1 / Math.sqrt(pose.squash), pose.squash);
  }

  // near arms: shoulder in the body frame, and the paw end of the arm for a curl
  const ARMS = {
    pooh: { shoulder: [20, -122], end: (c) => tube(66, 34, 27, q(c, 0.04), 10, 0.6).end, body: poohBodyMatrix, dflt: POOH_DEFAULT },
    piglet: { shoulder: [15, -64], end: (c) => tube(38, 7, 5.6, q(c, 0.04), 8, 0.9).end, body: pigletBodyMatrix, dflt: PIGLET_DEFAULT },
  };
  /** The near-arm angle (armN) that points the paw at a target given in the character's feet
      frame; with the body leaning in far enough, the paw lands right on it. */
  function reachArmN(who, pose0, target) {
    const A = ARMS[who], pose = Object.assign({}, A.dflt, pose0);
    const tb = A.body(pose).inverse().transformPoint(new DOMPoint(target[0], target[1]));
    const e = A.end(pose.armNCurl);
    let a = Math.atan2(e[1], e[0]) - Math.atan2(tb.y - A.shoulder[1], tb.x - A.shoulder[0]);
    while (a - pose.armN > Math.PI) a -= TAU;
    while (a - pose.armN < -Math.PI) a += TAU;
    return a;
  }
  /** Where a character's near paw is, in their feet frame. */
  function pawAt(who, pose0) {
    const A = ARMS[who], pose = Object.assign({}, A.dflt, pose0);
    const r = rot(A.end(pose.armNCurl), -pose.armN);
    const p = A.body(pose).transformPoint(new DOMPoint(A.shoulder[0] + r[0], A.shoulder[1] + r[1]));
    return [p.x, p.y];
  }

  WP.chars = { drawPooh, drawPiglet, walkCycle, blinkAt, tube, poohBodyMatrix, pigletBodyMatrix, reachArmN, pawAt };
})();
