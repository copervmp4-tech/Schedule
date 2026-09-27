/* The Windy Picnic — Pooh and Piglet, after E. H. Shepard's 1926 drawings.

   Both are drawn as articulated stuffed toys in a three-quarter view facing
   right (the caller flips them to face left). Units are pixels at scale 1 with
   the origin at the feet; Pooh stands about 290 high, Piglet about 160.

   Pooh (1926): an unclothed teddy bear — a round head with a short blunt
   muzzle and a dark oval nose, a dot of an eye under a little brow, two small
   round ears set high, no neck, a long pear-shaped tummy, soft tube arms
   without elbows and short stubby legs.

   Piglet (1926): a Very Small Animal with a large head, a short tapering snout,
   pointed upright ears, thin bare arms, very short legs, and a long
   horizontally striped knitted jumper. */
(function () {
  const WP = window.WP;
  const { spline, pathFrom, PAL, lerp, clamp, TAU, rgba } = WP;
  const ink = WP.ink;

  /* ------------------------------------------------------------ helpers */

  function shape(pts, per = 7) {
    const P = spline(pts, true, per);
    return { P, path: pathFrom(P) };
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

  /**
   * Soft tube (arm) along a bent centre line: starts at the pivot heading
   * straight down, curls forward by `curl` along its length.
   */
  function tube(len, w0, w1, curl, n = 10) {
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
      const w = lerp(w0, w1, u) * (1 + 0.06 * Math.sin(u * Math.PI)) * 0.5;
      L.push([p[0] - dy * w, p[1] + dx * w]);
      R.push([p[0] + dy * w, p[1] - dx * w]);
    }
    // rounded paw at the end
    const e = C[n], pe = C[n - 1];
    const ang = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
    const cap = [];
    for (let k = 1; k < 6; k++) {
      const a2 = ang + Math.PI / 2 - (k / 6) * Math.PI;
      cap.push([e[0] + Math.cos(a2) * w1 * 0.52, e[1] + Math.sin(a2) * w1 * 0.52]);
    }
    const pts = L.concat(cap, R.reverse());
    return { pts, end: e, dir: ang };
  }

  /** Paint one soft-toy part: paper, tint (slightly off-register), hatched shadow, pen outline. */
  function paint(ctx, P, path, st) {
    ctx.fillStyle = st.base ?? PAL.paperLight;
    ctx.fill(path);
    if (st.wash) {
      ctx.save();
      // watercolour laid a touch off the ink line, as a colourist would
      ctx.translate(st.reg?.[0] ?? 1.2, st.reg?.[1] ?? 1);
      ink.wash(ctx, path, st.wash, { alpha: st.washA ?? 0.34, edge: st.edge ?? 0.55, edgeW: st.edgeW ?? 7, texAlpha: 0.5 });
      ctx.restore();
    }
    if (st.shade) {
      const [dx, dy] = st.shade;
      ink.shadeCrescent(ctx, path, bbox(P), dx, dy, {
        angle: st.hAngle ?? -1.0, spacing: st.hSp ?? 3.6, w: st.hW ?? 0.85, alpha: st.hA ?? 0.62,
        seed: st.seed ?? 1, color: PAL.ink, wash: st.shadeWash ?? PAL.sepia, washAlpha: st.shadeWashA ?? 0.12, minLen: 0.1, lenVar: 0.45, bend: 1.5,
      });
    }
    if (st.outline !== false) {
      ink.outline(ctx, P, { w: (st.lw ?? 2.6) * 0.92, seed: st.seed ?? 1, breaks: st.breaks ?? 4, wobble: st.wob ?? 0.9, press: 0.55, gap: 0.01, color: PAL.ink });
    }
    if (st.fur) for (const f of st.fur) ink.ticks(ctx, P, { from: f[0], to: f[1], density: f[2] ?? 0.1, len: f[3] ?? 4, w: 1.15, seed: (st.seed ?? 1) + f[0] * 10, side: -1, prob: 0.75, lean: 0.9 });
  }
  function part(ctx, pts, st, per = 7) {
    const S = shape(pts, per);
    paint(ctx, S.P, S.path, st);
    return S;
  }

  function at(ctx, x, y, rot, fn, sx = 1, sy = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    fn();
    ctx.restore();
  }

  /* ------------------------------------------------------------ Pooh */

  const POOH_DEFAULT = {
    lean: 0, bob: 0, squash: 1, head: 0, headX: 0, headY: 0,
    armN: 0.28, armF: 0.2, armNCurl: 0.35, armFCurl: 0.3, legN: 0, legF: 0, legNLift: 0, legFLift: 0,
    sit: 0, eye: 1, blink: 0, lookX: 0, lookY: 0, mouth: 0, brow: 0, earWind: 0, t: 0,
    shade: [-8, -7], hold: null, holdFn: null,
  };

  const POOH = {
    // legs hang from inside the body; foot turns forward
    leg: [[-18, -14], [18, -14], [20, 18], [22, 34], [31, 40], [33, 48], [24, 52], [-12, 52], [-21, 44], [-20, 16]],
    legSit: [[-18, -14], [18, -14], [20, 18], [22, 34], [30, 40], [30, 48], [22, 52], [-12, 52], [-21, 44], [-20, 16]],
    body: [[-48, 6], [-12, 16], [28, 12], [50, -10], [57, -46], [50, -84], [34, -112], [14, -128], [-20, -128], [-40, -110], [-50, -76], [-54, -38], [-54, -8]],
    head: [[0, -95], [24, -90], [40, -76], [46, -63], [52, -56], [62, -53], [68, -46], [67, -37], [60, -31], [50, -26], [40, -15], [26, -4], [4, 0], [-22, -4], [-40, -18], [-47, -42], [-42, -70], [-26, -89]],
    ear: [[-13, 5], [-15, -6], [-10, -15], [0, -18], [10, -15], [15, -6], [13, 5]],
  };

  function poohEar(ctx, x, y, rot, wind, t, seed) {
    at(ctx, x, y, rot + wind * 0.22 * Math.sin(t * 19 + seed), () => {
      part(ctx, POOH.ear, { wash: PAL.poohFur, washA: 0.42, lw: 2.3, seed, breaks: 2 });
      ink.line(ctx, [[-6, 1], [-6, -7], [0, -11], [6, -7], [6, 1]], { w: 1.2, seed: seed + 2, taper: [0.3, 0.3], alpha: 0.7 });
    });
  }

  function poohArm(ctx, pose, near, seed) {
    const tb = tube(74, 31, 25, near ? pose.armNCurl : pose.armFCurl);
    part(ctx, tb.pts, { wash: PAL.poohFur, washA: 0.36, lw: 2.5, seed, breaks: 3, shade: pose.shade, hSp: 3.8, fur: near ? [[0.02, 0.3, 0.1, 3.5]] : null }, 3);
    return tb;
  }

  function poohLeg(ctx, pose, near, seed) {
    part(ctx, pose.sit > 0.5 ? POOH.legSit : POOH.leg, { wash: PAL.poohFur, washA: 0.36, lw: 2.7, seed, breaks: 3, shade: pose.shade, hSp: 3.8 });
    if (pose.sit > 0.5 && near) {
      // the sole shows when the legs stick out in front
      at(ctx, 26, 43, -0.15, () => {
        const pad = shape(WP.ellipsePts(0, 0, 6, 9, 10));
        paint(ctx, pad.P, pad.path, { wash: PAL.honey, washA: 0.3, lw: 1.5, seed: seed + 5, breaks: 1, edge: 0 });
      });
    }
  }

  function drawPooh(ctx, pose0) {
    const pose = Object.assign({}, POOH_DEFAULT, pose0);
    const t = pose.t;
    ctx.save();
    ctx.lineJoin = 'round';
    const sit = pose.sit;
    const hipY = lerp(-54, -28, sit);
    const legRotN = -(pose.legN + sit * 1.5);
    const legRotF = -(pose.legF + sit * 1.35);

    // far leg
    at(ctx, -20 + sit * 6, hipY + pose.bob * 0.4 - pose.legFLift, legRotF, () => poohLeg(ctx, pose, false, 21));

    const bodyFrame = () => {
      ctx.translate(0, hipY + pose.bob);
      ctx.rotate(pose.lean);
      ctx.scale(1 / Math.sqrt(pose.squash), pose.squash);
    };
    // body + far arm
    ctx.save();
    bodyFrame();
    at(ctx, -26, -104, -pose.armF, () => poohArm(ctx, pose, false, 31));
    part(ctx, POOH.body, {
      wash: PAL.poohFur, washA: 0.34, lw: 2.9, seed: 11, breaks: 4, shade: pose.shade, hSp: 3.5, hA: 0.6,
      fur: [[0.66, 0.92, 0.09, 4.5], [0.28, 0.36, 0.08, 3]],
    });
    // the round of the tummy
    ink.line(ctx, [[36, -14], [47, -44], [42, -74]], { w: 1.2, seed: 12, alpha: 0.5, taper: [0.4, 0.4] });
    ctx.restore();

    // near leg in front of the body bottom
    at(ctx, 16 + sit * 10, hipY + pose.bob * 0.4 - pose.legNLift, legRotN, () => poohLeg(ctx, pose, true, 22));

    // head, held things and near arm follow the body
    ctx.save();
    bodyFrame();
    if (pose.hold === 'behind' && pose.holdFn) pose.holdFn(ctx);
    ctx.save();
    ctx.translate(2 + pose.headX, -118 + pose.headY);
    ctx.rotate(pose.head);
    ctx.scale(0.94, 0.94);
    poohEar(ctx, -26, -86, -0.3, pose.earWind, t, 41);
    const H = part(ctx, POOH.head, { wash: PAL.poohFur, washA: 0.34, lw: 2.8, seed: 51, breaks: 4, shade: pose.shade, hSp: 3.5, hA: 0.5, fur: [[0.74, 0.99, 0.09, 4]] });
    // where the muzzle meets the face
    ink.line(ctx, [[47, -62], [45, -50], [47, -36]], { w: 1.2, seed: 52, alpha: 0.5, taper: [0.4, 0.4] });
    // nose
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.ellipse(64.5, -46, 5.4, 4.4, 0.2, 0, TAU);
    ctx.fill();
    // eye (a dot; blinks to a short line; 2 = a contented closed curve)
    const ex = 31 + pose.lookX * 2, ey = -59 + pose.lookY * 2;
    ctx.fillStyle = PAL.ink;
    if (pose.eye === 2) {
      ink.line(ctx, [[ex - 4.5, ey + 1.5], [ex, ey - 2], [ex + 4.5, ey + 1.5]], { w: 1.7, seed: 53, taper: [0.3, 0.3] });
    } else if (pose.blink > 0.5) {
      ink.line(ctx, [[ex - 4, ey + 0.5], [ex + 4, ey]], { w: 1.8, seed: 54, taper: [0.3, 0.3] });
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.8, 3.3 * (1 - pose.blink * 0.8), 0, 0, TAU);
      ctx.fill();
    }
    // brow — tells us what the bear is thinking
    const b = pose.brow;
    ink.line(ctx, [[ex - 7, ey - 9 - b * 2.5], [ex, ey - 11.5 - b * 3.5], [ex + 6, ey - 10 - b * 0.5]], { w: 1.25, seed: 55, alpha: 0.8, taper: [0.4, 0.4] });
    // mouth
    if (pose.mouth < -0.3) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(57, -33, 2.6, 3.1, 0, 0, TAU);
      ctx.stroke();
    } else {
      const m = pose.mouth;
      ink.line(ctx, [[62, -37], [57, -33.5 + m * 2], [51, -35.5 - m * 1.4]], { w: 1.45, seed: 56, taper: [0.3, 0.4] });
    }
    poohEar(ctx, 18, -90, 0.22, pose.earWind, t + 0.3, 42);
    ctx.restore();

    if (pose.hold === 'front' && pose.holdFn) pose.holdFn(ctx);
    at(ctx, 22, -106, -pose.armN, () => poohArm(ctx, pose, true, 32));
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
    leg: [[-5, -6], [5, -6], [5.5, 10], [9, 14], [11, 18], [7, 21], [-5, 21], [-6.5, 12]],
    body: [[-22, 4], [0, 8], [22, 4], [25, -18], [23, -40], [15, -54], [0, -59], [-13, -57], [-22, -46], [-25, -20]],
    head: [[-2, -56], [12, -54], [22, -46], [28, -40], [36, -37], [42, -33], [43, -26], [38, -21], [28, -17], [20, -8], [6, -3], [-10, -5], [-21, -15], [-26, -31], [-22, -46], [-13, -54]],
    ear: [[-6, 2], [-6, -8], [-2, -19], [1, -25], [5, -12], [7, 2]],
    sleeve: [[-7, -7], [7, -7], [7.5, 6], [0, 8.5], [-7.5, 6]],
  };

  function pigEar(ctx, x, y, rot, flop, wind, t, seed) {
    const f = flop + wind * 0.35 * Math.sin(t * 23 + seed * 2);
    at(ctx, x, y, rot, () => {
      const pts = PIG.ear.map(([px, py]) => {
        const k = clamp(-py / 25);
        const ang = f * k * k;
        const c = Math.cos(ang), s = Math.sin(ang);
        return [px * c - py * s, px * s + py * c];
      });
      part(ctx, pts, { wash: PAL.pigletSkin, washA: 0.5, lw: 1.9, seed, breaks: 2, edge: 0.6 }, 6);
      ink.line(ctx, [[0.5, -1], [pts[3][0] * 0.55, pts[3][1] * 0.55]], { w: 0.9, seed: seed + 1, alpha: 0.55, taper: [0.3, 0.3] });
    });
  }

  function pigArm(ctx, pose, near, seed) {
    const tb = tube(27, 8, 7, near ? pose.armNCurl : pose.armFCurl, 8);
    part(ctx, tb.pts, { wash: PAL.pigletSkin, washA: 0.5, lw: 1.6, seed, breaks: 2, edge: 0.5 }, 3);
    const sl = part(ctx, PIG.sleeve, { wash: PAL.mossDeep, washA: 0.7, lw: 1.7, seed: seed + 3, breaks: 1 }, 5);
    ctx.save();
    ctx.clip(sl.path);
    ctx.strokeStyle = PAL.ink;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-9, -3); ctx.lineTo(9, -3.5);
    ctx.moveTo(-9, 3); ctx.lineTo(9, 2.5);
    ctx.stroke();
    ctx.restore();
  }

  function pigLeg(ctx, pose, seed) {
    part(ctx, PIG.leg, { wash: PAL.pigletSkin, washA: 0.5, lw: 1.7, seed, breaks: 2, edge: 0.5 }, 6);
  }

  function jumper(ctx, pose) {
    const S = shape(PIG.body, 6);
    const { P, path } = S;
    ctx.fillStyle = PAL.paperLight;
    ctx.fill(path);
    ink.wash(ctx, path, PAL.mossLight, { alpha: 0.5, edge: 0.3 });
    ctx.save();
    ctx.clip(path);
    // knitted stripes: dark bands, inked with close hatching, narrow light gaps
    for (let i = 0; i < 9; i++) {
      const y0 = 7 - i * 7.3;
      const band = new Path2D();
      band.moveTo(-40, y0);
      band.quadraticCurveTo(0, y0 + 3, 40, y0);
      band.lineTo(40, y0 - 4.9);
      band.quadraticCurveTo(0, y0 - 1.9, -40, y0 - 4.9);
      band.closePath();
      ctx.fillStyle = rgba(PAL.mossDeep, 0.85);
      ctx.fill(band);
      ctx.save();
      ctx.clip(band);
      ink.hatch(ctx, [-30, y0 - 7, 60, 10], { angle: 0.04, spacing: 1.5, w: 0.95, alpha: 0.85, seed: 70 + i, minLen: 0.3, lenVar: 0.9, jitter: 0.3 });
      ctx.restore();
    }
    ctx.restore();
    ink.shadeCrescent(ctx, path, bbox(P), pose.shade[0], pose.shade[1], { angle: -1.1, spacing: 2.6, w: 0.8, alpha: 0.5, seed: 77, color: PAL.ink });
    ink.outline(ctx, P, { w: 2.1, seed: 78, breaks: 3, wobble: 0.5, press: 0.5 });
  }

  function drawPiglet(ctx, pose0) {
    const pose = Object.assign({}, PIGLET_DEFAULT, pose0);
    const t = pose.t;
    ctx.save();
    ctx.lineJoin = 'round';
    const sit = pose.sit;
    const hipY = lerp(-20, -10, sit);
    at(ctx, -8 + sit * 2, hipY + pose.bob * 0.4 - pose.legFLift, -(pose.legF + sit * 1.4), () => pigLeg(ctx, pose, 121));

    const bodyFrame = () => {
      ctx.translate(0, hipY + pose.bob);
      ctx.rotate(pose.lean);
      ctx.scale(1 / Math.sqrt(pose.squash), pose.squash);
    };
    at(ctx, 7 + sit * 4, hipY + pose.bob * 0.4 - pose.legNLift, -(pose.legN + sit * 1.5), () => pigLeg(ctx, pose, 122));
    ctx.save();
    bodyFrame();
    at(ctx, -13, -45, -pose.armF, () => pigArm(ctx, pose, false, 131));
    jumper(ctx, pose);
    ctx.restore();

    ctx.save();
    bodyFrame();
    ctx.save();
    ctx.translate(1 + pose.headX, -52 + pose.headY);
    ctx.rotate(pose.head);
    pigEar(ctx, -13, -48, -0.42 + pose.earF, -0.5 * pose.earF, pose.earWind, t, 141);
    part(ctx, PIG.head, { wash: PAL.pigletSkin, washA: 0.5, lw: 2.2, seed: 151, breaks: 4, shade: pose.shade, hSp: 3.1, hA: 0.45, edge: 0.6 });
    if (pose.blush > 0) ink.bloom(ctx, 15, -17, 8, '#d99a80', 0.3 * pose.blush, 0.8);
    // flat end of the snout
    ctx.save();
    ctx.translate(42, -29);
    ctx.rotate(-0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.2, 5.2, 0, 0, TAU);
    ctx.fillStyle = rgba('#dca78f', 0.8);
    ctx.fill();
    ctx.restore();
    ink.line(ctx, [[28, -40], [27, -30], [28, -19]], { w: 1.0, seed: 153, alpha: 0.45, taper: [0.4, 0.4] });
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.ellipse(42.5, -31.5, 0.9, 1.5, 0, 0, TAU);
    ctx.ellipse(42.2, -26.5, 0.9, 1.5, 0, 0, TAU);
    ctx.fill();
    // eye
    const ex = 22 + pose.lookX * 1.5, ey = -40 + pose.lookY * 1.5;
    if (pose.eye === 2) {
      ink.line(ctx, [[ex - 3.2, ey + 1], [ex, ey - 1.8], [ex + 3.2, ey + 1]], { w: 1.35, seed: 154, taper: [0.3, 0.3] });
    } else if (pose.blink > 0.5) {
      ink.line(ctx, [[ex - 3, ey], [ex + 3, ey]], { w: 1.45, seed: 155, taper: [0.3, 0.3] });
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.1, 2.6 * (1 - pose.blink * 0.8), 0, 0, TAU);
      ctx.fill();
    }
    // mouth
    if (pose.mouth < -0.3) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(32, -21, 1.9, 2.4, 0, 0, TAU);
      ctx.stroke();
    } else {
      const m = pose.mouth;
      ink.line(ctx, [[37, -22], [32, -19 + m * 1.6], [26, -21 - m * 1.1]], { w: 1.2, seed: 156, taper: [0.3, 0.4] });
    }
    pigEar(ctx, 6, -53, 0.18 + pose.earN, 0.45 * pose.earN, pose.earWind, t + 0.4, 142);
    ctx.restore();
    if (pose.hold && pose.holdFn) pose.holdFn(ctx);
    at(ctx, 13, -45, -pose.armN, () => pigArm(ctx, pose, true, 132));
    ctx.restore();
    ctx.restore();
  }

  /* ------------------------------------------------------------ motion helpers */

  /** Soft-toy walk / run cycle. phase in cycles; amp 0..1 (0 = standing); run 0..1. */
  function walkCycle(phase, amp = 1, run = 0) {
    const a = phase * TAU;
    const swing = Math.sin(a) * (0.38 + run * 0.32) * amp;
    const lift = Math.max(0, Math.cos(a)) * (5 + run * 9) * amp;
    const liftF = Math.max(0, -Math.cos(a)) * (5 + run * 9) * amp;
    const bob = (Math.abs(Math.sin(a)) - 0.5) * (4 + run * 8) * amp; // down at contact, up at passing
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

  WP.chars = { drawPooh, drawPiglet, walkCycle, blinkAt, tube };
})();
