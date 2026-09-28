/* The Windy Picnic — pen, ink, hatching, watercolour and paper.
   A small set of drawing primitives that give every element the look of an
   ink-and-wash storybook plate: tapered, slightly wobbly pen lines, loose
   parallel hatching, mottled washes with darker pooled edges, and paper
   cut-outs with soft shadows. */
(function () {
  const WP = window.WP;
  const { clamp, lerp, noise1, fbm1, rng, makeCanvas, PAL, rgba, TAU } = WP;

  /* ---------------------------------------------------------------- strokes */

  function resample(pts, step) {
    const out = [pts[0].slice()];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      let d = Math.hypot(x1 - x0, y1 - y0);
      while (acc + d >= step) {
        const r = (step - acc) / d;
        x0 = x0 + (x1 - x0) * r;
        y0 = y0 + (y1 - y0) * r;
        out.push([x0, y0]);
        d = Math.hypot(x1 - x0, y1 - y0);
        acc = 0;
      }
      acc += d;
    }
    const last = pts[pts.length - 1];
    const lo = out[out.length - 1];
    if (Math.hypot(last[0] - lo[0], last[1] - lo[1]) > step * 0.25) out.push(last.slice());
    return out;
  }

  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  /**
   * Variable-width pen stroke along a polyline.
   * o.w: nib width, o.seed, o.wobble: lateral wander, o.press: width variation,
   * o.taper: [in, out] fraction of length, o.color, o.alpha, o.step
   */
  function stroke(ctx, pts, o = {}) {
    if (!pts || pts.length < 2) return;
    const w = o.w ?? 2;
    const seed = o.seed ?? 1;
    const wob = o.wobble ?? 0.6;
    const press = o.press ?? 0.35;
    const [tin, tout] = o.taper ?? [0.12, 0.2];
    const minTip = o.minTip ?? 0.18;
    const L = polyLen(pts);
    if (L < 0.5) return;
    const step = o.step ?? clamp(L / 60, 0.8, 4);
    const P = resample(pts, step);
    const n = P.length;
    if (n < 2) return;
    const left = new Array(n), right = new Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const nx = -dy, ny = dx;
      if (i > 0) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const u = s / L;
      let tp = 1;
      if (u < tin) tp = lerp(minTip, 1, WP.smooth(u / tin));
      if (u > 1 - tout) tp = Math.min(tp, lerp(minTip, 1, WP.smooth((1 - u) / tout)));
      // o.heavy = { cx, cy, dx, dy, k }: the pen presses harder on the side of the form away from
      // the light (Shepard's outlines thicken along a figure's shadowed underside)
      let hv = 1;
      if (o.heavy) {
        const H = o.heavy;
        const rx = P[i][0] - H.cx, ry = P[i][1] - H.cy;
        const rl = Math.hypot(rx, ry) || 1;
        hv = 1 + H.k * Math.max(0, (rx * H.dx + ry * H.dy) / rl);
      }
      const ww = Math.max(0.15, w * hv * tp * (1 + press * noise1(s * 0.045 + seed * 7.13)) * 0.5);
      const off = wob * fbm1(s * 0.018 + seed * 3.7, 2);
      const cx = P[i][0] + nx * off, cy = P[i][1] + ny * off;
      left[i] = [cx + nx * ww, cy + ny * ww];
      right[i] = [cx - nx * ww, cy - ny * ww];
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    const prevA = ctx.globalAlpha;
    ctx.globalAlpha = prevA * (o.alpha ?? 1);
    ctx.fillStyle = o.color ?? PAL.ink;
    ctx.fill();
    ctx.globalAlpha = prevA;
  }

  /** Slice a polyline between fractions a..b of its length (b may exceed 1 for closed loops). */
  function slice(pts, a, b, closed) {
    const L = polyLen(closed ? pts.concat([pts[0]]) : pts);
    const P = closed ? pts.concat([pts[0]]) : pts;
    const out = [];
    const wrap = (u) => (closed ? ((u % 1) + 1) % 1 : clamp(u));
    const n = Math.max(3, Math.ceil(((b - a) * L) / 3));
    // cumulative lengths
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const u = wrap(lerp(a, b, k / n)) * L;
      if (u < cum[j]) j = 0;
      while (j < cum.length - 2 && cum[j + 1] < u) j++;
      const r = (u - cum[j]) / (cum[j + 1] - cum[j] || 1);
      out.push([lerp(P[j][0], P[j + 1][0], r), lerp(P[j][1], P[j + 1][1], r)]);
    }
    return out;
  }

  /**
   * Hand-inked outline of a closed shape: several overlapping pen strokes with
   * small gaps, the way an illustrator lifts the pen going round a form.
   */
  function outline(ctx, pts, o = {}) {
    const R = rng((o.seed ?? 1) * 9301 + 17);
    const k = o.breaks ?? 3;
    const start = o.start ?? R();
    const gaps = o.gap ?? 0.012;
    let u = start;
    for (let i = 0; i < k; i++) {
      const len = 1 / k + (R() - 0.5) * (0.35 / k);
      const a = u + gaps * (R() * 0.8 + 0.2);
      const b = i === k - 1 ? start + 1 + gaps * 0.5 : u + len;
      stroke(ctx, slice(pts, a, b, true), { ...o, seed: (o.seed ?? 1) + i * 13.1, taper: o.taper ?? [0.08, 0.12] });
      u = b - gaps * 0.5;
    }
  }

  /** Open line drawn through control points (spline smoothed). */
  function line(ctx, ctrl, o = {}) {
    const pts = ctrl.length > 2 ? WP.spline(ctrl, false, o.perSeg ?? 8) : ctrl;
    stroke(ctx, pts, o);
  }

  /** Little outward flicks along part of an outline: fur, grass edges, gorse spines. */
  function ticks(ctx, pts, o = {}) {
    const R = rng((o.seed ?? 3) * 7919);
    const from = o.from ?? 0, to = o.to ?? 1;
    const seg = slice(pts, from, to, o.closed ?? true);
    const L = polyLen(seg);
    const count = Math.floor(L * (o.density ?? 0.12));
    const P = resample(seg, L / Math.max(2, count));
    const side = o.side ?? 1;
    for (let i = 1; i < P.length - 1; i++) {
      if (R() > (o.prob ?? 0.8)) continue;
      const a = P[i - 1], b = P[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const nx = -dy * side, ny = dx * side;
      const len = (o.len ?? 5) * (0.5 + R());
      const lean = (o.lean ?? 0.5) * (R() - 0.3);
      const x0 = P[i][0] - nx * len * 0.25, y0 = P[i][1] - ny * len * 0.25;
      const x1 = P[i][0] + (nx + dx * lean) * len, y1 = P[i][1] + (ny + dy * lean) * len;
      stroke(ctx, [[x0, y0], [x1, y1]], { w: o.w ?? 1.1, seed: i + (o.seed ?? 0), wobble: 0.2, taper: [0.2, 0.7], color: o.color, alpha: o.alpha });
    }
  }

  /* ---------------------------------------------------------------- hatching */

  /**
   * Loose parallel hatching inside the current clip.
   * bbox = [x, y, w, h] in current coordinates.
   */
  function hatch(ctx, bbox, o = {}) {
    const R = rng((o.seed ?? 5) * 104729);
    const ang = o.angle ?? -0.9;
    const sp = o.spacing ?? 6;
    const w = o.w ?? 1;
    const [bx, by, bw, bh] = bbox;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const r = Math.hypot(bw, bh) / 2 + 4;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const n = Math.ceil((2 * r) / sp);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.color ?? PAL.ink;
    ctx.globalAlpha *= o.alpha ?? 0.8;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const d = -r + i * sp + (R() - 0.5) * sp * (o.jitter ?? 0.5);
      // stroke fragments along this line
      let s = -r + R() * sp * 2;
      while (s < r) {
        const len = (o.minLen ?? 0.35) * r + R() * r * (o.lenVar ?? 1.2);
        const e = Math.min(r, s + len);
        const bend = (R() - 0.5) * (o.bend ?? 2);
        const x0 = cx + ca * s - sa * d, y0 = cy + sa * s + ca * d;
        const x1 = cx + ca * e - sa * d, y1 = cy + sa * e + ca * d;
        const mx = (x0 + x1) / 2 - sa * bend, my = (y0 + y1) / 2 + ca * bend;
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(mx, my, x1, y1);
        s = e + sp * (0.5 + R() * (o.gapVar ?? 2));
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Shepard-style shading: strokes that start at the contour on the shadowed side and
   * reach inward, longer and deeper where the form turns furthest from the light, so
   * the shaded area has a ragged, hand-made inner edge rather than a band.
   *   P, path : the closed outline;  o.dir : unit vector pointing away from the light
   *   o.angle : stroke direction;  o.depth / o.len : how far in they reach (px)
   */
  function edgeHatch(ctx, P, path, o) {
    const R = rng((o.seed ?? 1) * 7717 + 13);
    let cx = 0, cy = 0;
    for (const p of P) { cx += p[0]; cy += p[1]; }
    cx /= P.length; cy /= P.length;
    const Q = resample(P.concat([P[0]]), o.spacing ?? 2.6);
    const ha = [Math.cos(o.angle ?? -1.35), Math.sin(o.angle ?? -1.35)];
    const thr = o.threshold ?? 0.08;
    const draw = (depthK, lenK, prob, rotA) => {
      const c = Math.cos(rotA), s = Math.sin(rotA);
      const h = [ha[0] * c - ha[1] * s, ha[0] * s + ha[1] * c];
      ctx.beginPath();
      for (let i = 0; i < Q.length - 1; i++) {
        const a = Q[Math.max(0, i - 2)], b = Q[Math.min(Q.length - 1, i + 2)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        let nx = ty, ny = -tx;
        if ((Q[i][0] - cx) * nx + (Q[i][1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
        const f = nx * o.dir[0] + ny * o.dir[1];
        if (f <= thr) continue;
        const k = Math.pow((f - thr) / (1 - thr), 0.75);
        if (R() > prob * (0.3 + 0.7 * k)) continue;
        let dx = h[0], dy = h[1];
        if (dx * nx + dy * ny > 0) { dx = -dx; dy = -dy; }
        const along = Math.abs(dx * nx + dy * ny);
        const depth = R() * (o.depth ?? 20) * depthK * k * (1 - 0.65 * along);
        const L = (o.len ?? 30) * lenK * k * (0.45 + 0.75 * R());
        const x0 = Q[i][0] + nx * 1.5 - nx * depth, y0 = Q[i][1] + ny * 1.5 - ny * depth;
        const x1 = x0 + dx * L, y1 = y0 + dy * L;
        const bend = (R() - 0.5) * L * 0.14;
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 - dy * bend, (y0 + y1) / 2 + dx * bend, x1, y1);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.clip(path);
    if (o.wash) {
      // a faint sepia shade laid under the strokes
      const moved = new Path2D();
      moved.addPath(path, new DOMMatrix([1, 0, 0, 1, -o.dir[0] * (o.depth ?? 20) * 0.8, -o.dir[1] * (o.depth ?? 20) * 0.8]));
      const both = new Path2D();
      both.addPath(path);
      both.addPath(moved);
      ctx.save();
      ctx.clip(both, 'evenodd');
      ctx.globalAlpha *= o.washAlpha ?? 0.1;
      ctx.fillStyle = o.wash;
      ctx.fill(path);
      ctx.restore();
    }
    ctx.strokeStyle = o.color ?? PAL.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = o.w ?? 1;
    ctx.globalAlpha *= o.alpha ?? 0.8;
    draw(1, 1, 1, 0);
    if (o.cross) {
      // a few crossing strokes where the shadow is deepest
      ctx.globalAlpha *= o.cross;
      ctx.lineWidth = (o.w ?? 1) * 0.85;
      draw(0.55, 0.5, 0.45, 0.95);
    }
    ctx.restore();
  }

  /** Hatch the crescent of `path` that lies away from the light. */
  function shadeCrescent(ctx, path, bbox, dx, dy, o = {}) {
    ctx.save();
    ctx.clip(path);
    const both = new Path2D();
    both.addPath(path);
    both.addPath(path, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    ctx.clip(both, 'evenodd');
    if (o.wash) {
      ctx.fillStyle = o.wash;
      ctx.globalAlpha = o.washAlpha ?? 0.25;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    }
    hatch(ctx, bbox, o);
    if (o.cross) {
      // crosshatch only the deepest part of the shadow: a thinner crescent, strokes at a crossing angle
      ctx.restore();
      ctx.save();
      ctx.clip(path);
      const deep = new Path2D();
      deep.addPath(path);
      deep.addPath(path, new DOMMatrix([1, 0, 0, 1, dx * 0.45, dy * 0.45]));
      ctx.clip(deep, 'evenodd');
      hatch(ctx, bbox, { ...o, angle: (o.angle ?? -0.9) + 1.15, spacing: (o.spacing ?? 6) * 1.35, alpha: (o.alpha ?? 0.8) * o.cross, seed: (o.seed ?? 5) + 99 });
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- washes */

  let WASH_TEX = null, WASH_PAT = null;
  function washTexture() {
    if (WASH_TEX) return WASH_TEX;
    const S = 384;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const nA = WP.makeNoise2(11), nB = WP.makeNoise2(23), nC = WP.makeNoise2(37);
    const RG = rng(4711); // seeded: every renderer (and every export worker) paints the same grain
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const f1 = nA((x / S) * 4, (y / S) * 4, 4, 4);
        const f2 = nB((x / S) * 12, (y / S) * 12, 12, 12);
        const f3 = nC((x / S) * 48, (y / S) * 48, 48, 48);
        const gran = RG() < 0.006 ? 0.9 : 1; // pigment granules
        // light-grey mottling: multiplied onto a wash, it varies its density
        let v = 1 - 0.16 * Math.pow(f1, 1.6) - 0.07 * f2 - 0.05 * f3;
        v *= gran;
        const k = (y * S + x) * 4;
        const c8 = Math.round(clamp(v) * 255);
        img.data[k] = Math.min(255, c8 + 4);
        img.data[k + 1] = Math.round(c8 * 0.975);
        img.data[k + 2] = Math.round(c8 * 0.92);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    WASH_TEX = c;
    return c;
  }

  /**
   * Watercolour wash: flat tint + mottled pigment + darker pooled edge.
   * Coordinates are the caller's current (local) space, so the texture moves with the object.
   */
  function wash(ctx, path, color, o = {}) {
    ctx.save();
    ctx.clip(path);
    ctx.globalAlpha = o.alpha ?? 0.6;
    ctx.fillStyle = color;
    ctx.fill(path);
    if (o.texture !== false) {
      if (!WASH_PAT) WASH_PAT = ctx.createPattern(washTexture(), 'repeat');
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = o.texAlpha ?? 0.6;
      const s = o.texScale ?? 1;
      if (s !== 1 || o.texOffset) {
        WASH_PAT.setTransform(new DOMMatrix([s, 0, 0, s, (o.texOffset || [0, 0])[0], (o.texOffset || [0, 0])[1]]));
      } else WASH_PAT.setTransform(new DOMMatrix());
      ctx.fillStyle = WASH_PAT;
      ctx.fill(path);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (o.edge !== 0) {
      ctx.globalAlpha = (o.edge ?? 0.28) * (o.alpha ?? 0.6);
      ctx.strokeStyle = o.edgeColor ?? color;
      ctx.lineWidth = o.edgeW ?? 5;
      ctx.stroke(path);
      ctx.lineWidth = (o.edgeW ?? 5) * 0.4;
      ctx.globalAlpha = (o.edge ?? 0.28) * 1.4 * (o.alpha ?? 0.6);
      ctx.stroke(path);
    }
    ctx.restore();
  }

  /** Soft radial bloom of colour (watercolour blot / light) */
  function bloom(ctx, x, y, r, color, a = 0.3, squash = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, squash);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.6, rgba(color, a * 0.55));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- paper */

  function makePaper(W, H, seed = 7) {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const nA = WP.makeNoise2(seed), nB = WP.makeNoise2(seed + 1), nC = WP.makeNoise2(seed + 2);
    const base = [242, 232, 210];
    const R = rng(seed * 31);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const m = nA(x / 260, y / 260) * 0.6 + nB(x / 70, y / 70) * 0.3 + nC(x / 9, y / 9) * 0.1;
        const speck = R() < 0.0009 ? -28 * R() : 0;
        const d = (m - 0.5) * 16 + speck + (R() - 0.5) * 5;
        const k = (y * W + x) * 4;
        img.data[k] = base[0] + d;
        img.data[k + 1] = base[1] + d * 0.98;
        img.data[k + 2] = base[2] + d * 0.9;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // fibres
    g.lineCap = 'round';
    for (let i = 0; i < W * H * 0.00045; i++) {
      const x = R() * W, y = R() * H, a = R() * TAU, l = 6 + R() * 22;
      g.strokeStyle = R() < 0.5 ? 'rgba(255,250,236,0.35)' : 'rgba(150,120,80,0.10)';
      g.lineWidth = 0.6 + R() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    return c;
  }

  /** Grey grain for a multiply pass over the whole frame (ties every layer to one sheet of paper). */
  function makeGrain(W, H, seed = 99) {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const nA = WP.makeNoise2(seed), nB = WP.makeNoise2(seed + 5);
    const R = rng(seed);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tooth = nB(x / 2.2, y / 2.2);
        const cloud = nA(x / 180, y / 180);
        let v = 250 - tooth * 16 - cloud * 10 - (R() < 0.0006 ? 60 * R() : 0);
        // vignette / aged edges
        const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
        const e = Math.min(ex * 1.8, ey * 3.2);
        v -= Math.pow(clamp(1 - e / 0.2), 2.2) * 34;
        const k = (y * W + x) * 4;
        img.data[k] = v;
        img.data[k + 1] = v - 3;
        img.data[k + 2] = v - 9;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------------------------------------------------------------- cut-outs */

  /**
   * Turn a painted element (transparent canvas) into a paper cut-out: a thin
   * paper margin all round plus a soft drop shadow, as if snipped from a page
   * and laid on the scene.
   */
  function cutout(src, o = {}) {
    const m = o.margin ?? 4;
    const sh = o.shadow ?? { x: 5, y: 7, blur: 10, a: 0.28 };
    const pad = Math.ceil(m + (sh ? sh.blur * 2 + Math.max(Math.abs(sh.x), Math.abs(sh.y)) : 0) + 2);
    const c = makeCanvas(src.width + pad * 2, src.height + pad * 2);
    const g = c.getContext('2d');
    // dilated silhouette
    const sil = makeCanvas(c.width, c.height);
    const sg = sil.getContext('2d');
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      sg.drawImage(src, pad + Math.cos(a) * m, pad + Math.sin(a) * m);
    }
    sg.drawImage(src, pad, pad);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = o.paper ?? PAL.paperLight;
    sg.fillRect(0, 0, c.width, c.height);
    if (sh) {
      g.save();
      g.shadowColor = `rgba(60,40,20,${sh.a})`;
      g.shadowBlur = sh.blur;
      g.shadowOffsetX = sh.x;
      g.shadowOffsetY = sh.y;
      g.drawImage(sil, 0, 0);
      g.restore();
    } else g.drawImage(sil, 0, 0);
    g.drawImage(src, pad, pad);
    WP.freeCanvas(sil);
    return { canvas: c, pad };
  }

  WP.ink = { stroke, outline, line, ticks, hatch, shadeCrescent, edgeHatch, wash, bloom, slice, resample, polyLen, makePaper, makeGrain, washTexture, cutout };
})();
