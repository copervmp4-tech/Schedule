/* The Windy Picnic — the Forest: paper-cut scenery, drawn once at start-up.

   The Forest is laid out as one long strip that the camera travels along:
     x ≈ -700 … 150   Pooh's house (a tree, with the name Sanders over the door)
     x ≈ 150 … 700    the picnic meadow
     x ≈ 700 … 3300   open heath with heather and gorse, then the pines
     x ≈ 3300         the gorse bush that catches the cloth
     x ≈ 3900 … 4300  two old trees, and a gap between them
     x ≈ 4300 … 5700  the sunny clearing
   Each depth layer has a parallax factor p (0 = sky, 1 = the ground the
   characters walk on, >1 = foreground). Elements are pre-rendered sprites:
   ink + wash on a paper cut-out with a soft shadow. */
(function () {
  const WP = window.WP;
  const { PAL, rng, lerp, clamp, TAU, makeCanvas, spline, pathFrom, rgba, fbm1, noise1 } = WP;
  const ink = WP.ink;

  const RES = 2.0; // sprite supersampling so close-ups stay crisp

  /* ------------------------------------------------------------ sprite core */

  function sprite(w, h, ax, ay, draw, o = {}) {
    const res = o.res ?? RES;
    const c = makeCanvas(w * res, h * res);
    const g = c.getContext('2d');
    g.scale(res, res);
    g.translate(ax, ay);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(g);
    let img = c, pad = 0;
    if (o.cutout !== false) {
      const cu = ink.cutout(c, { margin: (o.margin ?? 3) * res, shadow: o.shadow === null ? null : { x: 4 * res, y: 6 * res, blur: 9 * res, a: o.shadowA ?? 0.22 }, paper: o.paper });
      img = cu.canvas;
      pad = cu.pad;
    }
    return { img, ax: ax * res + pad, ay: ay * res + pad, res, w, h };
  }

  function drawSprite(ctx, s, x, y, scale = 1, flip = 1, sway = 0, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (sway) ctx.transform(1, 0, sway, 1, 0, 0);
    ctx.scale((scale * flip) / s.res, scale / s.res);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(s.img, -s.ax, -s.ay);
    ctx.restore();
  }

  /* ------------------------------------------------------------ foliage */

  /** A foliage mass: union of lumpy circles, washed, with scalloped pen edge and hatched underside. */
  function foliage(g, cx, cy, rx, ry, seed, o = {}) {
    const R = rng(seed);
    const blobs = [];
    const n = o.n ?? 9;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = Math.sqrt(R());
      blobs.push([cx + Math.cos(a) * rx * 0.62 * r, cy + Math.sin(a) * ry * 0.5 * r, (0.34 + R() * 0.3) * Math.min(rx, ry * 1.6) * (o.lump ?? 1)]);
    }
    const path = new Path2D();
    for (const [x, y, r] of blobs) {
      path.moveTo(x + r, y);
      path.ellipse(x, y, r, r * (o.flat ?? 0.8), 0, 0, TAU);
    }
    g.fillStyle = PAL.paperLight;
    g.fill(path);
    ink.wash(g, path, o.color ?? PAL.moss, { alpha: o.alpha ?? 0.55, edge: 0.6, edgeW: 8 });
    // shade the lower part: a soft graded wash, then hatching that thins out upwards
    g.save();
    g.clip(path);
    const gy0 = cy - ry * 0.35 + (o.shadeY ?? 0), gy1 = cy + ry * 0.9;
    const gr = g.createLinearGradient(0, gy0, 0, gy1);
    gr.addColorStop(0, rgba(o.shadeColor ?? PAL.mossDeep, 0));
    gr.addColorStop(1, rgba(o.shadeColor ?? PAL.mossDeep, 0.42));
    g.fillStyle = gr;
    g.fillRect(cx - rx * 1.6, gy0, rx * 3.2, gy1 - gy0 + ry);
    for (let b = 0; b < 3; b++) {
      const top = lerp(gy0, gy1, b / 3.2) + R() * 6;
      g.save();
      const band = new Path2D();
      band.rect(cx - rx * 1.6, top, rx * 3.2, ry * 3);
      g.clip(band);
      ink.hatch(g, [cx - rx * 1.2, cy - ry, rx * 2.4, ry * 2], { angle: (o.hAngle ?? -1.1) + b * 0.12, spacing: (o.hSp ?? 3.2) * (1.9 - b * 0.4), w: o.hW ?? 0.8, alpha: (o.hA ?? 0.55) * (0.55 + b * 0.2), seed: seed + 3 + b, minLen: 0.05, lenVar: 0.25, gapVar: 1.5 });
      g.restore();
    }
    g.restore();
    // scalloped leaf edge along each blob's upper arc
    g.strokeStyle = PAL.ink;
    for (const [x, y, r] of blobs) {
      const k = Math.max(4, Math.round(r / 5));
      for (let j = 0; j < k; j++) {
        const a0 = Math.PI + (j / k) * Math.PI * 1.25 - 0.1 + R() * 0.1;
        const a1 = a0 + (Math.PI * 1.1) / k;
        const pts = [];
        for (let q = 0; q <= 4; q++) {
          const a = lerp(a0, a1, q / 4);
          const bump = Math.sin((q / 4) * Math.PI) * r * 0.1;
          pts.push([x + Math.cos(a) * (r + bump), y + Math.sin(a) * (r + bump) * (o.flat ?? 0.8)]);
        }
        if (R() < (o.edgeProb ?? 0.8)) ink.stroke(g, pts, { w: o.edgeW ?? 1.3, seed: seed + j * 3.1 + x, wobble: 0.3, taper: [0.3, 0.3], alpha: 0.85 });
      }
    }
    // a few leaf flicks inside
    if (o.flicks !== false) {
      for (let i = 0; i < n * 3; i++) {
        const [x, y, r] = blobs[Math.floor(R() * blobs.length)];
        const a = R() * TAU, d = R() * r * 0.8;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.7;
        ink.stroke(g, [[px, py], [px + 3 + R() * 4, py - 2 - R() * 3]], { w: 0.9, seed: i + seed, wobble: 0.1, alpha: 0.5, taper: [0.3, 0.6] });
      }
    }
    return path;
  }

  /* ------------------------------------------------------------ trees */

  function pineSprite(h, seed, o = {}) {
    const R = rng(seed);
    const W = 520;
    return sprite(W, h + 60, W / 2, h + 20, (g) => {
      const lean = (R() - 0.5) * 30;
      const tw = o.trunkW ?? 26;
      // trunk: slightly crooked, tapering
      const C = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        C.push([lean * u * u + Math.sin(u * 5 + seed) * 6 * u, -u * h]);
      }
      const L = [], Rr = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, w = lerp(tw, tw * 0.35, u) * 0.5 + (i === 0 ? 8 : 0);
        L.push([C[i][0] - w, C[i][1]]);
        Rr.push([C[i][0] + w, C[i][1]]);
      }
      const trunkPts = spline(L, false, 4).concat(spline(Rr.reverse(), false, 4));
      const trunk = pathFrom(trunkPts);
      g.fillStyle = PAL.paperLight;
      g.fill(trunk);
      ink.wash(g, trunk, PAL.bark, { alpha: 0.5, edge: 0.4 });
      // Scots pine: the upper trunk glows a warm orange-honey
      g.save();
      g.clip(trunk);
      const gr = g.createLinearGradient(0, 0, 0, -h);
      gr.addColorStop(0, rgba(PAL.sepia, 0.0));
      gr.addColorStop(0.5, rgba(PAL.honey, 0.35));
      gr.addColorStop(1, rgba(PAL.honeyDeep, 0.5));
      g.fillStyle = gr;
      g.fillRect(-100, -h - 10, 200, h + 20);
      ink.hatch(g, [-tw, -h * 0.55, tw, h * 0.56], { angle: -1.52, spacing: 2.6, w: 0.9, alpha: 0.7, seed: seed + 1, minLen: 0.05, lenVar: 0.2, gapVar: 2 });
      g.restore();
      // bark flakes
      for (let i = 0; i < h / 22; i++) {
        const u = R() * 0.9, p = C[Math.floor(u * 8)];
        const x = p[0] + (R() - 0.5) * tw * 0.6, y = -u * h;
        ink.stroke(g, [[x - 3, y], [x + 3, y + 1.5]], { w: 1, seed: i, alpha: 0.6, wobble: 0.2 });
      }
      ink.stroke(g, spline(L, false, 4), { w: 1.8, seed: seed + 2, wobble: 1.2, taper: [0.02, 0.2] });
      ink.stroke(g, spline(Rr.slice().reverse(), false, 4), { w: 2.2, seed: seed + 3, wobble: 1.2, taper: [0.02, 0.2] });
      // branches and flat-topped crown clumps
      const nb = o.clumps ?? 5;
      for (let i = 0; i < nb; i++) {
        const u = lerp(0.58, 0.98, i / (nb - 1)) + (R() - 0.5) * 0.05;
        const p = C[Math.min(8, Math.round(u * 8))];
        const side = i % 2 ? 1 : -1;
        const len = (70 + R() * 90) * (1 - u * 0.45) * (o.spread ?? 1);
        const bx = p[0] + side * len, by = -u * h - 15 - R() * 30;
        ink.line(g, [[p[0], -u * h + 10], [p[0] + side * len * 0.5, -u * h - 4], [bx, by + 6]], { w: 2.4, seed: seed + i * 7, wobble: 1, taper: [0.1, 0.5] });
        foliage(g, bx, by, 60 + R() * 40, 26 + R() * 12, seed * 10 + i, { n: 7, flat: 0.55, color: PAL.mossDeep, alpha: 0.55, hSp: 2.8 });
      }
      foliage(g, C[8][0], -h - 10, 70, 30, seed * 10 + 99, { n: 8, flat: 0.55, color: PAL.mossDeep, alpha: 0.55, hSp: 2.8 });
    }, o);
  }

  function birchSprite(h, seed, o = {}) {
    const R = rng(seed);
    const W = 420;
    return sprite(W, h + 80, W / 2, h + 20, (g) => {
      const lean = (R() - 0.5) * 50;
      const C = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        C.push([lean * u + Math.sin(u * 4 + seed) * 8 * u, -u * h]);
      }
      const L = [], Rr = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, w = lerp(18, 6, u) * 0.5 + (i === 0 ? 5 : 0);
        L.push([C[i][0] - w, C[i][1]]);
        Rr.push([C[i][0] + w, C[i][1]]);
      }
      const trunk = pathFrom(spline(L, false, 4).concat(spline(Rr.slice().reverse(), false, 4)));
      g.fillStyle = PAL.paperLight;
      g.fill(trunk);
      ink.wash(g, trunk, PAL.paperDark, { alpha: 0.4, edge: 0.4 });
      // birch marks
      for (let i = 0; i < h / 16; i++) {
        const u = R() * 0.95, p = C[Math.floor(u * 8)];
        const w = lerp(9, 3, u);
        const y = -u * h;
        ink.stroke(g, [[p[0] - w * (0.2 + R() * 0.8), y], [p[0] + w * (R() * 0.8), y + 1]], { w: 1.8 + R() * 1.5, seed: i + seed, alpha: 0.8, wobble: 0.3 });
      }
      ink.stroke(g, spline(L, false, 4), { w: 1.3, seed: seed + 2, wobble: 0.8, taper: [0.02, 0.3] });
      ink.stroke(g, spline(Rr.slice().reverse(), false, 4), { w: 1.7, seed: seed + 3, wobble: 0.8, taper: [0.02, 0.3] });
      for (let i = 0; i < 6; i++) {
        const u = 0.45 + R() * 0.55;
        const p = C[Math.min(8, Math.round(u * 8))];
        const side = R() < 0.5 ? -1 : 1;
        const bx = p[0] + side * (40 + R() * 60), by = -u * h - 30 - R() * 40;
        ink.line(g, [[p[0], -u * h], [bx, by]], { w: 1.2, seed: seed + i, taper: [0.1, 0.7] });
        foliage(g, bx, by, 45 + R() * 30, 30 + R() * 16, seed * 7 + i, { n: 6, color: PAL.mossLight, shadeColor: PAL.moss, alpha: 0.5, hSp: 3.4, hA: 0.4, edgeW: 1 });
      }
      foliage(g, C[8][0], -h - 20, 55, 40, seed * 7 + 50, { n: 7, color: PAL.mossLight, shadeColor: PAL.moss, alpha: 0.5, hSp: 3.4, hA: 0.4, edgeW: 1 });
    }, o);
  }

  /** Massive old trunk that rises out of frame (frames the gap into the clearing). */
  function bigTrunkSprite(h, w, seed, o = {}) {
    const R = rng(seed);
    return sprite(w * 3.2, h + 40, w * 1.6, h, (g) => {
      const L = [[-w * 0.5 - 50, 0], [-w * 0.52, -40], [-w * 0.46, -h * 0.4], [-w * 0.44, -h * 0.8], [-w * 0.43, -h]];
      const Rr = [[w * 0.43, -h], [w * 0.44, -h * 0.8], [w * 0.47, -h * 0.4], [w * 0.52, -40], [w * 0.5 + 60, 0]];
      const pts = spline(L, false, 6).concat(spline(Rr, false, 6));
      const trunk = pathFrom(pts);
      g.fillStyle = PAL.paperLight;
      g.fill(trunk);
      ink.wash(g, trunk, o.color ?? PAL.bark, { alpha: 0.55, edge: 0.5, edgeW: 12 });
      g.save();
      g.clip(trunk);
      // deep shadow side, heavy hatching like Shepard's big trees
      const sh = new Path2D();
      sh.rect(w * 0.05 * (o.side ?? 1), -h - 10, w * (o.side ?? 1), h + 20);
      g.save();
      g.clip(sh);
      ink.hatch(g, [-w, -h, w * 2, h], { angle: -1.45, spacing: 2.4, w: 1.1, alpha: 0.8, seed: seed + 4, minLen: 0.03, lenVar: 0.12, gapVar: 1.2 });
      ink.hatch(g, [-w, -h, w * 2, h], { angle: -0.42, spacing: 4.2, w: 0.9, alpha: 0.38, seed: seed + 6, minLen: 0.02, lenVar: 0.06, gapVar: 2.2 });
      g.restore();
      ink.hatch(g, [-w, -h, w * 2, h], { angle: -1.53, spacing: 7, w: 1, alpha: 0.5, seed: seed + 5, minLen: 0.05, lenVar: 0.2, gapVar: 3 });
      g.restore();
      ink.stroke(g, spline(L, false, 6), { w: 3, seed: seed + 1, wobble: 2, taper: [0.02, 0.05] });
      ink.stroke(g, spline(Rr, false, 6), { w: 3.4, seed: seed + 2, wobble: 2, taper: [0.05, 0.02] });
      // roots
      for (let i = 0; i < 5; i++) {
        const x0 = (R() - 0.5) * w * 0.8;
        const dir = x0 < 0 ? -1 : 1;
        ink.line(g, [[x0, -30 - R() * 30], [x0 + dir * (30 + R() * 40), -8], [x0 + dir * (70 + R() * 60), 2]], { w: 2, seed: seed + 20 + i, taper: [0.1, 0.8] });
      }
      // a knot hole
      ink.line(g, [[-8, -h * 0.34], [0, -h * 0.36 - 12], [9, -h * 0.34], [0, -h * 0.34 + 10], [-8, -h * 0.34]], { w: 1.6, seed: seed + 30 });
    }, o);
  }

  /* ------------------------------------------------------------ Pooh's house */

  function houseTreeSprite() {
    const h = 900, w = 280;
    return sprite(900, h + 60, 450, h + 10, (g) => {
      const R = rng(501);
      const L = [[-w * 0.5 - 90, 0], [-w * 0.55, -50], [-w * 0.5, -h * 0.45], [-w * 0.46, -h]];
      const Rr = [[w * 0.46, -h], [w * 0.5, -h * 0.45], [w * 0.56, -50], [w * 0.5 + 100, 0]];
      const trunk = pathFrom(spline(L, false, 6).concat(spline(Rr, false, 6)));
      g.fillStyle = PAL.paperLight;
      g.fill(trunk);
      ink.wash(g, trunk, PAL.bark, { alpha: 0.5, edge: 0.5, edgeW: 12 });
      g.save();
      g.clip(trunk);
      const sh = new Path2D();
      sh.rect(-w * 0.62, -h, w * 0.3, h);
      sh.rect(w * 0.18, -h, w * 0.6, h);
      g.save();
      g.clip(sh);
      ink.hatch(g, [-w, -h, w * 2, h], { angle: -1.47, spacing: 2.6, w: 1.1, alpha: 0.75, seed: 503, minLen: 0.03, lenVar: 0.14, gapVar: 1.3 });
      ink.hatch(g, [-w, -h, w * 2, h], { angle: -0.45, spacing: 4.4, w: 0.9, alpha: 0.35, seed: 507, minLen: 0.02, lenVar: 0.06, gapVar: 2.2 });
      g.restore();
      ink.hatch(g, [-w, -h, w * 2, h], { angle: -1.54, spacing: 8, w: 1, alpha: 0.45, seed: 504, minLen: 0.05, lenVar: 0.2, gapVar: 3 });
      g.restore();
      ink.stroke(g, spline(L, false, 6), { w: 3.2, seed: 505, wobble: 2, taper: [0.02, 0.05] });
      ink.stroke(g, spline(Rr, false, 6), { w: 3.4, seed: 506, wobble: 2, taper: [0.05, 0.02] });
      // the door, set into the trunk
      const door = new Path2D();
      door.moveTo(-58, -2);
      door.lineTo(-58, -190);
      door.quadraticCurveTo(-58, -222, -20, -226);
      door.lineTo(22, -226);
      door.quadraticCurveTo(58, -222, 58, -190);
      door.lineTo(58, -2);
      door.closePath();
      g.fillStyle = PAL.paperLight;
      g.fill(door);
      ink.wash(g, door, PAL.moss, { alpha: 0.62, edge: 0.6 });
      g.save();
      g.clip(door);
      for (let i = -3; i <= 3; i++) ink.stroke(g, [[i * 16, -224], [i * 16 + 1, -4]], { w: 1.1, seed: 510 + i, alpha: 0.6, wobble: 0.6 });
      ink.hatch(g, [20, -226, 40, 226], { angle: -1.2, spacing: 3, w: 0.9, alpha: 0.6, seed: 512 });
      g.restore();
      ink.outline(g, spline([[-58, -2], [-58, -190], [-40, -222], [0, -228], [40, -222], [58, -190], [58, -2]], true, 4), { w: 2.4, seed: 513, breaks: 3 });
      // latch and knocker
      g.fillStyle = PAL.ink;
      g.beginPath();
      g.arc(38, -108, 4, 0, TAU);
      g.fill();
      ink.line(g, [[38, -104], [41, -92], [35, -92], [38, -104]], { w: 1.3, seed: 514 });
      // the board over the door with the name Sanders on it
      const bx = 0, by = -268;
      const board = pathFrom([[-78, by - 20], [80, by - 24], [82, by + 18], [-80, by + 20]]);
      g.fillStyle = PAL.paperLight;
      g.fill(board);
      ink.wash(g, board, PAL.paperDark, { alpha: 0.5, edge: 0.4 });
      ink.outline(g, [[-78, by - 20], [80, by - 24], [82, by + 18], [-80, by + 20]], { w: 1.8, seed: 515, breaks: 2 });
      g.save();
      g.translate(bx + 2, by + 1);
      g.rotate(-0.012);
      g.fillStyle = PAL.ink;
      g.font = '25px "IM Fell English SC", Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Mr Sanders', 0, 0);
      g.restore();
      // bell-pull beside the door
      ink.line(g, [[74, -250], [80, -210], [78, -150]], { w: 1.2, seed: 516 });
      g.beginPath();
      g.fillStyle = PAL.honeyDeep;
      g.moveTo(70, -268);
      g.quadraticCurveTo(74, -290, 80, -268);
      g.lineTo(84, -252);
      g.lineTo(66, -252);
      g.closePath();
      g.fill();
      ink.outline(g, [[70, -268], [74, -284], [80, -268], [84, -252], [66, -252]], { w: 1.4, seed: 517, breaks: 1 });
      // roots and a log step
      for (let i = 0; i < 6; i++) {
        const x0 = (R() - 0.5) * w * 1.1;
        const dir = x0 < 0 ? -1 : 1;
        ink.line(g, [[x0, -36 - R() * 30], [x0 + dir * (30 + R() * 40), -8], [x0 + dir * (80 + R() * 60), 2]], { w: 2, seed: 520 + i, taper: [0.1, 0.8] });
      }
      // ivy creeping up one side
      for (let i = 0; i < 26; i++) {
        const y = -40 - i * 22 - R() * 10, x = -w * 0.47 + Math.sin(i * 0.7) * 10;
        const leaf = WP.ellipsePts(x + (R() - 0.5) * 14, y, 9, 6, 7, R() * 3);
        const lp = pathFrom(spline(leaf, true, 3));
        g.fillStyle = rgba(PAL.moss, 0.7);
        g.fill(lp);
        ink.outline(g, spline(leaf, true, 3), { w: 0.9, seed: 560 + i, breaks: 1, wobble: 0.2 });
      }
    }, { res: 1.7 });
  }

  /* ------------------------------------------------------------ low plants */

  function gorseSprite(w, h, seed, o = {}) {
    const R = rng(seed);
    return sprite(w + 60, h + 40, (w + 60) / 2, h + 20, (g) => {
      const path = foliage(g, 0, -h * 0.5, w * 0.5, h * 0.62, seed, { n: 12, flat: 0.9, color: PAL.moss, shadeColor: PAL.mossDeep, alpha: 0.55, hSp: 2.8, hA: 0.55, flicks: false, edgeProb: 0.5 });
      // spines
      for (let i = 0; i < w * 0.9; i++) {
        const a = Math.PI + R() * Math.PI, r = Math.sqrt(R());
        const x = Math.cos(a) * w * 0.48 * r, y = -h * 0.5 + Math.sin(a) * h * 0.55 * r;
        const d = 3 + R() * 6;
        ink.stroke(g, [[x, y], [x + Math.cos(a) * d, y + Math.sin(a) * d]], { w: 0.9, seed: i + seed, wobble: 0.1, alpha: 0.75, taper: [0.2, 0.8] });
      }
      // honey-yellow flowers
      for (let i = 0; i < w * (o.flowers ?? 0.25); i++) {
        const a = Math.PI * 1.05 + R() * Math.PI * 0.9, r = 0.3 + R() * 0.7;
        const x = Math.cos(a) * w * 0.44 * r, y = -h * 0.52 + Math.sin(a) * h * 0.5 * r;
        g.fillStyle = rgba(i % 3 ? PAL.honeyLight : PAL.honey, 0.9);
        g.beginPath();
        g.ellipse(x, y, 2.6, 2, R() * 3, 0, TAU);
        g.fill();
      }
    }, o);
  }

  function heatherSprite(w, h, seed, o = {}) {
    const R = rng(seed);
    return sprite(w + 40, h + 30, (w + 40) / 2, h + 12, (g) => {
      // a low cushion of heather: many short sprigs topped with dusty flower heads
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const env = Math.pow(Math.sin(u * Math.PI), 0.6);
        pts.push([lerp(-w / 2, w / 2, u), -env * h * (0.7 + R() * 0.3)]);
      }
      pts.push([w / 2, 2], [-w / 2, 2]);
      const path = pathFrom(spline(pts, true, 4));
      ink.wash(g, path, PAL.mossLight, { alpha: 0.45, edge: 0.3 });
      g.save();
      g.clip(path);
      const gr = g.createLinearGradient(0, -h, 0, 0);
      gr.addColorStop(0, rgba(o.color ?? PAL.heather, 0.0));
      gr.addColorStop(0.5, rgba(PAL.mossDeep, 0.12));
      gr.addColorStop(1, rgba(PAL.mossDeep, 0.35));
      g.fillStyle = gr;
      g.fillRect(-w, -h - 10, w * 2, h + 20);
      g.restore();
      for (let i = 0; i < w * 0.7; i++) {
        const x = (R() - 0.5) * w * 0.95;
        const top = -Math.pow(Math.sin(((x + w / 2) / w) * Math.PI), 0.6) * h * (0.6 + R() * 0.45);
        const tx = x + (R() - 0.5) * 8, ty = top * (0.55 + R() * 0.5);
        ink.stroke(g, [[x, 0], [tx, ty]], { w: 0.7 + R() * 0.5, seed: i + seed, wobble: 0.3, alpha: 0.55, taper: [0.1, 0.8] });
        if (R() < 0.7) {
          g.fillStyle = rgba(R() < 0.6 ? (o.color ?? PAL.heather) : PAL.sepiaLight, 0.55 + R() * 0.3);
          g.beginPath();
          g.ellipse(tx, ty, 2 + R() * 1.5, 3 + R() * 2, (R() - 0.5), 0, TAU);
          g.fill();
        }
      }
    }, { cutout: false, ...o });
  }

  function brackenSprite(size, seed, o = {}) {
    const R = rng(seed);
    o = { cutout: false, ...o };
    const W = size * 2.6;
    return sprite(W, size * 1.4, W / 2, size * 1.3, (g) => {
      const fronds = o.fronds ?? 4;
      for (let f = 0; f < fronds; f++) {
        const dir = f % 2 ? 1 : -1;
        const len = size * (0.7 + R() * 0.5);
        const ang0 = -Math.PI / 2 + dir * (0.2 + R() * 0.5);
        const C = [];
        let x = (R() - 0.5) * 20, y = 0, a = ang0;
        for (let i = 0; i <= 10; i++) {
          C.push([x, y]);
          a += dir * 0.09;
          x += Math.cos(a) * len / 10;
          y += Math.sin(a) * len / 10;
        }
        ink.stroke(g, C, { w: 1.4, seed: seed + f, taper: [0.05, 0.8], wobble: 0.3 });
        for (let i = 2; i < 10; i++) {
          const [px, py] = C[i];
          const l = (1 - i / 11) * size * 0.28;
          for (const s of [-1, 1]) {
            const la = a - dir * 0.4 + s * 1.2;
            const tip = [px + Math.cos(la) * l, py + Math.sin(la) * l];
            const leaf = pathFrom([[px, py], [(px + tip[0]) / 2 + s * 2, (py + tip[1]) / 2 - 3], tip, [(px + tip[0]) / 2 - s * 2, (py + tip[1]) / 2 + 2]]);
            g.fillStyle = rgba(o.color ?? PAL.moss, 0.55);
            g.fill(leaf);
            ink.stroke(g, [[px, py], tip], { w: 0.9, seed: i * 3 + s + f * 30, wobble: 0.2, taper: [0.1, 0.7], alpha: 0.8 });
          }
        }
      }
    }, o);
  }

  function grassSprite(w, h, seed, o = {}) {
    const R = rng(seed);
    o = { cutout: false, ...o };
    return sprite(w + 40, h + 20, (w + 40) / 2, h + 8, (g) => {
      const n = Math.round(w * (o.density ?? 0.5));
      for (let i = 0; i < n; i++) {
        const x = (R() - 0.5) * w;
        const hh = h * (0.4 + R() * 0.6) * (1 - Math.abs(x / w) * 0.8);
        const bend = (R() - 0.5) * hh * 0.5;
        const pts = [[x, 0], [x + bend * 0.3, -hh * 0.5], [x + bend, -hh]];
        if (R() < 0.35) {
          g.strokeStyle = rgba(R() < 0.5 ? PAL.moss : PAL.honeyLight, 0.6);
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(pts[0][0], pts[0][1]);
          g.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
          g.stroke();
        }
        ink.stroke(g, spline(pts, false, 4), { w: 1.1, seed: i + seed, wobble: 0.2, taper: [0.05, 0.9], alpha: 0.8 });
      }
    }, o);
  }

  function flowersSprite(w, seed, o = {}) {
    const R = rng(seed);
    o = { cutout: false, ...o };
    return sprite(w + 40, 90, (w + 40) / 2, 80, (g) => {
      for (let i = 0; i < w * 0.09; i++) {
        const x = (R() - 0.5) * w, hh = 14 + R() * 34;
        ink.line(g, [[x, 0], [x + (R() - 0.5) * 8, -hh * 0.6], [x + (R() - 0.5) * 10, -hh]], { w: 0.9, seed: i + seed, alpha: 0.7 });
        const col = [PAL.paperLight, PAL.honeyLight, PAL.honey, PAL.blush, PAL.paperLight][i % 5];
        const fx = x + (R() - 0.5) * 10, fy = -hh;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * TAU;
          g.fillStyle = rgba(col, 0.95);
          g.beginPath();
          g.ellipse(fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 2.8, 1.8, a, 0, TAU);
          g.fill();
        }
        g.fillStyle = PAL.honeyDeep;
        g.beginPath();
        g.arc(fx, fy, 1.6, 0, TAU);
        g.fill();
        g.strokeStyle = rgba(PAL.ink, 0.5);
        g.lineWidth = 0.7;
        g.beginPath();
        g.arc(fx, fy, 5.2, 0, TAU);
        g.stroke();
      }
    }, o);
  }

  /* ------------------------------------------------------------ terrain bands */

  /** Rolling band of land for a layer (drawn live — cheap paths with texture). */
  function terrainTop(x, seed, base, amp, freq) {
    return base - amp * (0.6 * fbm1(x * freq + seed, 3) + 0.4 * Math.sin(x * freq * 0.37 + seed));
  }

  function drawBand(ctx, x0, x1, o) {
    const step = o.step ?? 24;
    const pts = [];
    for (let x = x0 - step; x <= x1 + step; x += step) pts.push([x, terrainTop(x, o.seed, o.base, o.amp, o.freq)]);
    const P = pts.concat([[x1 + step, o.bottom], [x0 - step, o.bottom]]);
    const path = pathFrom(P);
    ctx.fillStyle = o.fill;
    ctx.fill(path);
    if (o.wash) ink.wash(ctx, path, o.wash, { alpha: o.washA ?? 0.35, edge: o.edge ?? 0.3, edgeW: 10, texScale: o.texScale ?? 1 });
    if (o.line !== false) ink.stroke(ctx, pts, { w: o.lineW ?? 1.6, seed: o.seed, wobble: 1.5, taper: [0.01, 0.01], alpha: o.lineA ?? 0.7, color: o.lineColor ?? PAL.inkSoft, step: 6 });
    return pts;
  }

  /** Tileable ground texture: grass ticks and mottled patches, laid over the meadow band. */
  function groundTile() {
    const TW = 1024, TH = 512;
    const c = makeCanvas(TW, TH);
    const g = c.getContext('2d');
    const R = rng(3131);
    for (let i = 0; i < 26; i++) {
      const x = R() * TW, y = R() * TH, r = 60 + R() * 140;
      for (const dx of [-TW, 0, TW]) ink.bloom(g, x + dx, y, r, R() < 0.5 ? PAL.moss : PAL.honeyLight, 0.12, 0.45);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 2300; i++) {
      const x = R() * TW, y = R() * TH;
      const cluster = 2 + Math.floor(R() * 3);
      const len = 4 + R() * 9;
      g.strokeStyle = R() < 0.72 ? rgba(PAL.mossDeep, 0.28 + R() * 0.25) : rgba(PAL.ink, 0.25 + R() * 0.2);
      g.lineWidth = 0.8 + R() * 0.6;
      g.beginPath();
      for (let k = 0; k < cluster; k++) {
        const bx = x + k * 2.4, lean = (R() - 0.3) * 4;
        for (const dx of [-TW, 0, TW]) {
          g.moveTo(bx + dx, y);
          g.quadraticCurveTo(bx + dx + lean * 0.3, y - len * 0.5, bx + dx + lean, y - len);
        }
      }
      g.stroke();
    }
    return c;
  }

  /** Things very close to the lens are drawn a little out of focus and darker. */
  function softFocus(sp, blur, dark) {
    const c = makeCanvas(sp.img.width + blur * 6, sp.img.height + blur * 6);
    const g = c.getContext('2d');
    g.filter = `blur(${blur}px) brightness(${dark})`;
    g.drawImage(sp.img, blur * 3, blur * 3);
    return { ...sp, img: c, ax: sp.ax + blur * 3, ay: sp.ay + blur * 3 };
  }

  /* ------------------------------------------------------------ build all */

  async function build(progress = async () => {}) {
    const S = {};
    const R = rng(4242);
    await progress(0.05);
    S.house = houseTreeSprite();
    await progress(0.15);
    S.pines = [0, 1, 2, 3].map((i) => pineSprite(640 + i * 60, 60 + i, {}));
    await progress(0.3);
    S.pinesFar = [0, 1, 2].map((i) => pineSprite(520 + i * 50, 80 + i, { res: 0.8, shadowA: 0.12 }));
    S.birches = [0, 1, 2].map((i) => birchSprite(520 + i * 70, 90 + i, {}));
    await progress(0.45);
    S.bigTrunkL = bigTrunkSprite(1500, 220, 111, { side: 1 });
    S.bigTrunkR = bigTrunkSprite(1500, 250, 112, { side: -1, color: PAL.sepia });
    await progress(0.6);
    S.gorse = [0, 1, 2].map((i) => gorseSprite(160 + i * 50, 90 + i * 25, 200 + i, {}));
    S.snagGorse = gorseSprite(300, 170, 250, { flowers: 0.35 });
    S.heather = [0, 1, 2, 3].map((i) => heatherSprite(120 + i * 40, 36 + i * 8, 300 + i, {}));
    await progress(0.72);
    S.bracken = [0, 1, 2].map((i) => brackenSprite(90 + i * 30, 400 + i, {}));
    S.grass = [0, 1, 2, 3].map((i) => grassSprite(90 + i * 30, 50 + i * 16, 500 + i, { density: 0.45 }));
    S.tallGrass = grassSprite(170, 130, 555, { density: 0.9 });
    S.flowers = [0, 1].map((i) => flowersSprite(160 + i * 60, 600 + i, {}));
    S.groundTile = groundTile();
    S.fgBracken = [0, 1].map((i) => softFocus(brackenSprite(220 + i * 60, 700 + i, { res: 1.0 }), 2.5, 0.9));
    await progress(0.85);
    S.farClump = [0, 1, 2].map((i) => sprite(260, 170, 130, 160, (g) => {
      const RR = rng(800 + i);
      for (let k = 0; k < 4 + i; k++) {
        const x = (RR() - 0.5) * 150, hh = 70 + RR() * 80;
        ink.line(g, [[x, 0], [x + (RR() - 0.5) * 6, -hh]], { w: 1.4, seed: k + i * 10, alpha: 0.6 });
        foliage(g, x + (RR() - 0.5) * 20, -hh, 34 + RR() * 16, 13, 810 + k + i * 20, { n: 5, flat: 0.5, color: PAL.sage, shadeColor: PAL.moss, alpha: 0.5, hSp: 3.5, hA: 0.3, edgeW: 0.9, flicks: false });
      }
    }, { res: 1, shadowA: 0.08, margin: 2 }));
    await progress(1);
    return S;
  }

  WP.world = { build, drawSprite, drawBand, terrainTop, foliage, sprite, RES };
})();
