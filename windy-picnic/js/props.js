/* The Windy Picnic — props: the HUNNY pot, bees, leaves, grass. */
(function () {
  const WP = window.WP;
  const { spline, pathFrom, PAL, lerp, clamp, TAU, rgba, rng, noise1 } = WP;
  const ink = WP.ink;

  /* ---------------------------------------------------------------- honey pot
     A ribbed earthenware crock with a paper label lettered HUNNY, as in the 1926
     book. Origin at the base; about 72 high. */
  const POT = [[-22, 0], [22, 0], [29, -12], [32, -32], [29, -50], [23, -60], [22, -64], [26, -66], [26, -71], [-26, -71], [-26, -66], [-22, -64], [-23, -60], [-29, -50], [-32, -32], [-29, -12]];

  function drawPot(ctx, o = {}) {
    ctx.save();
    if (o.tilt) ctx.rotate(o.tilt);
    const P = spline(POT, true, 5);
    const path = pathFrom(P);
    ctx.fillStyle = PAL.paperLight;
    ctx.fill(path);
    ink.wash(ctx, path, PAL.honeyDeep, { alpha: 0.62, edge: 0.5, edgeW: 7 });
    // glaze highlight
    ctx.save();
    ctx.clip(path);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = PAL.paperLight;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, -56);
    ctx.quadraticCurveTo(-25, -34, -19, -10);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // ribs: curved bands following the round of the crock
    for (let i = 0; i < 7; i++) {
      const y = -8 - i * 7.8;
      const half = 29 - Math.abs(y + 32) * 0.18;
      ink.line(ctx, [[-half, y - 1.5], [0, y + 2.5], [half, y - 1.5]], { w: 1.1, seed: 300 + i, alpha: 0.55, taper: [0.2, 0.2], color: PAL.ink });
    }
    // shadow side
    ink.shadeCrescent(ctx, path, [-34, -74, 68, 76], -8, -3, { angle: -1.2, spacing: 3.4, w: 0.9, alpha: 0.5, seed: 311, color: PAL.ink });
    ctx.restore();
    // label (wraps round the crock)
    const lab = new Path2D();
    lab.moveTo(-19, -44);
    lab.quadraticCurveTo(0, -41, 19, -44);
    lab.lineTo(18, -24);
    lab.quadraticCurveTo(0, -21, -18, -24);
    lab.closePath();
    ctx.fillStyle = PAL.paperLight;
    ctx.fill(lab);
    ink.wash(ctx, lab, PAL.paperDark, { alpha: 0.35, edge: 0.3 });
    ctx.strokeStyle = PAL.inkSoft;
    ctx.lineWidth = 1;
    ctx.stroke(lab);
    ctx.save();
    ctx.fillStyle = PAL.ink;
    ctx.font = '12px "IM Fell English SC", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // letters sit on the curve of the label
    const word = 'HUNNY';
    for (let i = 0; i < word.length; i++) {
      const u = (i - 2) / 2.4;
      ctx.save();
      ctx.translate(u * 14.5, -32.5 + u * u * 1.6);
      ctx.scale(1 - Math.abs(u) * 0.18, 1);
      ctx.rotate(u * 0.06);
      ctx.fillText(word[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
    // mouth of the pot with honey inside
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -70, 23, 5.5, 0, 0, TAU);
    ctx.fillStyle = rgba('#5a3a18', 0.85);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -69, 19, 3.8, 0, 0, TAU);
    ctx.fillStyle = rgba(PAL.honey, 0.95);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = PAL.honeyLight;
    ctx.beginPath();
    ctx.ellipse(-5, -69.8, 7, 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ink.outline(ctx, P, { w: 2.4, seed: 320, breaks: 2 });
    ink.line(ctx, [[-25, -66], [0, -64], [25, -66]], { w: 1.2, seed: 321, alpha: 0.8 });
    if (o.drip) {
      // a drip of honey over the lip
      ctx.fillStyle = rgba(PAL.honey, 0.9);
      ctx.beginPath();
      ctx.moveTo(14, -67);
      ctx.quadraticCurveTo(18, -60 + o.drip * 4, 16, -54 + o.drip * 6);
      ctx.quadraticCurveTo(13, -58, 11, -66);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- bees
     Shepard's bees are tiny inky bodies with pale wings. */
  function drawBee(ctx, o = {}) {
    const t = o.t ?? 0;
    const flap = Math.sin(t * 190 + (o.seed ?? 0)) * 0.5 + 0.5;
    ctx.save();
    if (o.rot) ctx.rotate(o.rot);
    // wings (behind)
    ctx.fillStyle = 'rgba(250,246,232,0.78)';
    ctx.strokeStyle = rgba(PAL.inkSoft, 0.7);
    ctx.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(-1, -3);
      ctx.rotate(-0.5 + s * 0.25 - flap * 0.5);
      ctx.scale(1, 0.35 + flap * 0.65);
      ctx.beginPath();
      ctx.ellipse(0, -5, 3.4, 6, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // body
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 4.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(PAL.honey, 0.9);
    ctx.fillRect(-2.6, -3.6, 1.6, 7.2);
    ctx.fillRect(0.9, -3.9, 1.5, 7.8);
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(6.3, -0.6, 2.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-6.5, 0);
    ctx.lineTo(-8.8, 0.8);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- leaves */
  const LEAF = [[0, 0], [5, -3], [10, -4], [15, -2], [19, 0], [15, 2.4], [10, 4], [5, 3.2]];
  const LEAF_PATH = pathFrom(spline(LEAF, true, 4));
  const LEAF_COLORS = [PAL.honey, PAL.sepiaLight, PAL.moss, PAL.honeyDeep, PAL.mossLight];

  function drawLeaf(ctx, x, y, rot, flip, size, colorIdx, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(size, size * flip);
    ctx.translate(-9, 0);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = rgba(LEAF_COLORS[colorIdx % LEAF_COLORS.length], 0.85);
    ctx.fill(LEAF_PATH);
    ctx.strokeStyle = rgba(PAL.ink, 0.8);
    ctx.lineWidth = 0.9 / size;
    ctx.stroke(LEAF_PATH);
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(17, 0);
    ctx.lineWidth = 0.6 / size;
    ctx.stroke();
    ctx.restore();
  }

  WP.props = { drawPot, drawBee, drawLeaf };
})();
