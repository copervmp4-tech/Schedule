/* The Windy Picnic — the film itself: camera, choreography and frame rendering.
   render(ctx, t) draws the complete frame for film time t (seconds). */
(function () {
  const WP = window.WP;
  const { PAL, lerp, clamp, invLerp, smooth, ease, seg, wobble, track, rng, TAU, rgba, fbm1, noise1, makeCanvas } = WP;
  const ink = WP.ink;
  const { drawPooh, drawPiglet, walkCycle, blinkAt } = WP.chars;
  const { drawPot, drawBee, drawLeaf } = WP.props;
  const CL = WP.cloth;
  const W = 1920, H = 1080;
  const DUR = 60;

  /* ================================================================ timing */

  const T = {
    pageTurn: [4.35, 5.4],
    fling: 7.35, clothDown: 9.25,
    pigletPop: 12.36, pigletOut: 13.4, pigletStop: 14.35,
    forMe: 14.72, forUs: 17.2, hop: 18.15,
    leaf: 19.5, lift: 20.8, gust: 23.05, cut1: 25.2,
    run: 26.75, snag: 33.75, free: 34.95, bump: 35.35, rise: 38.75, walk: 39.25, land: 42.8,
    cut2: 45.0, lean: 51.3,
    pull: 51.0, plate: [55.6, 57.4], end: 57.5,
  };

  /* ================================================================ wind */

  function wind(t) {
    let w = 0.16 + 0.05 * noise1(t * 0.7);
    w += 0.45 * seg(t, 19.3, 22.6) + 0.55 * seg(t, 22.4, 23.05, ease.inCubic) - 0.5 * seg(t, 23.4, 25.5);
    w -= 0.05 * seg(t, 26, 27);
    w -= 0.2 * seg(t, 35, 39) + 0.12 * seg(t, 40, 43);
    return clamp(w + 0.08 * noise1(t * 2.3 + 4) * seg(t, 19, 20), 0.05, 1.2);
  }
  const WINT = new Float32Array(DUR * 100 + 2);
  for (let i = 1; i < WINT.length; i++) WINT[i] = WINT[i - 1] + wind(i / 100) / 100;
  const windInt = (t) => WINT[clamp(Math.floor(t * 100), 0, WINT.length - 1)];

  /* ================================================================ camera */

  function camera(t) {
    let c;
    if (t < T.gust) {
      c = track([
        [0, [70, -232, 1.18]], [5.2, [70, -232, 1.18]],
        [9.5, [222, -196, 1.42], ease.inOutSine], [14.2, [335, -176, 1.62], ease.inOutSine],
        [16.0, [372, -160, 1.95], ease.inOutSine], [19.2, [378, -160, 2.0], ease.inOutSine],
        [22.9, [392, -176, 1.8], ease.inOutSine], [23.05, [392, -176, 1.8]],
      ], t);
    } else if (t < T.cut1) {
      c = track([[23.05, [392, -176, 1.8]], [24.1, [610, -330, 1.3], ease.inOutCubic], [25.2, [730, -420, 1.16], ease.outQuad]], t);
    } else if (t < 26.6) {
      c = track([[25.2, [348, -150, 2.15]], [26.6, [362, -156, 2.05], ease.inOutSine]], t);
    } else if (t < 33.4) {
      const px = poohX(t) + 250;
      const k = seg(t, 26.6, 27.7, ease.inOutSine);
      c = [lerp(362, px, k), lerp(-156, -200, k), lerp(2.05, 1.5, k)];
    } else if (t < 35.3) {
      const k = seg(t, 33.4, 34.4, ease.inOutSine);
      c = [lerp(poohX(33.4) + 250, 3345, k), lerp(-200, -218, k), lerp(1.5, 1.6, k)];
    } else if (t < 39.2) {
      c = track([[35.3, [3345, -218, 1.6]], [36.0, [3318, -180, 1.84], ease.inOutSine], [38.9, [3322, -184, 1.88], ease.inOutSine], [39.2, [3330, -190, 1.84]]], t);
    } else if (t < T.cut2) {
      c = track([[39.2, [3330, -190, 1.84]], [40.4, [3520, -250, 1.36], ease.inOutSine], [42.7, [4060, -262, 1.16], ease.inOutSine], [43.6, [4040, -205, 1.5], ease.inOutSine], [45, [4052, -200, 1.56], ease.inOutSine]], t);
    } else {
      const k = track([[45, [4142, 2.2]], [51.0, [4148, 2.34], ease.inOutSine], [57.2, [4165, 1.1], ease.inOutCubic], [60, [4165, 1.08]]], t);
      // hold the picnic just above the subtitle band while pulling back
      c = [k[0], -26 - 262 / k[1] - 24 * seg(t, 53, 57.2), k[1]];
    }
    return { x: c[0], y: c[1], z: c[2] };
  }

  function layerXf(cam, p) {
    const z = Math.pow(cam.z, p);
    return { z, ox: W / 2 - cam.x * p * z, oy: H / 2 - cam.y * p * z };
  }

  /* ================================================================ Pooh */

  const RUN0 = 26.75, RUN1 = 34.0;
  const POOH_HOME = 185;              // by his door, where the picnic starts
  const POOH_MEADOW = 255;            // where Pooh stands by the cloth, after one step
  const STEP = [10.02, 10.55];        // that step, carrying the pot to the cloth
  const POOH_SNAG = 3225;             // where he pulls up by the gorse
  const POOH_WALK = 39.72;            // he sets off into the clearing once he has the pot again
  const WALK_V = (185 * (42.7 - 39.25)) / (42.7 - POOH_WALK); // arriving where he always did
  function poohX(t) {
    if (t < 9.8) return POOH_HOME;
    if (t < RUN0) return lerp(POOH_HOME, POOH_MEADOW, seg(t, STEP[0], STEP[1], ease.inOutSine));
    if (t < RUN1) {
      // accelerate, run, and pull up by the gorse
      const a = 26.75, b = 27.35, c = 33.3, d = 34.0;
      const v = (POOH_SNAG - POOH_MEADOW) / (0.5 * (b - a) + (c - b) + 0.5 * (d - c));
      if (t < b) return POOH_MEADOW + v * 0.5 * ((t - a) * (t - a)) / (b - a);
      const xb = POOH_MEADOW + v * 0.5 * (b - a);
      if (t < c) return xb + v * (t - b);
      const xc = xb + v * (c - b);
      const u = (t - c) / (d - c);
      return xc + v * (d - c) * (u - 0.5 * u * u);
    }
    if (t < POOH_WALK) return poohX(RUN1 - 1e-6);
    if (t < 42.7) return poohX(RUN1 - 1e-6) + WALK_V * (t - POOH_WALK) - WALK_V * 0.5 * Math.pow(seg(t, 42.2, 42.7), 2) * 0.5;
    if (t < T.cut2) return poohX(42.699);
    return 4060;
  }
  const POOH_STRIDE = 150;
  const PIG_RUN = 118, PIG_WALK = 92, PIG_TROT = 60;

  const poohTracks = {
    lean: [[0, 0], [6.5, 0], [6.95, -0.07], [7.35, 0.1, ease.outQuad], [7.9, 0], [9.1, 0], [10.9, 0.04], [11.4, 0.02],
      [16.9, 0.0], [17.45, 0.15], [18.5, 0.12], [19.1, 0], [22.6, 0.03], [23.1, -0.13, ease.outQuad], [23.7, -0.06], [24.4, 0], [25.2, 0.12], [25.75, 0.1], [25.95, 0], [26.2, 0.02], [26.62, 0.04], [26.72, -0.08], [26.85, 0.05]],
    armN: [[0, 0.62], [6.9, 0.62], [7.12, 0.3], [7.35, 1.95, ease.outQuad], [7.8, 1.35], [8.5, 0.35], [9.1, 0.35], [9.7, 0.6], [10.9, 0.6],
      [11.45, 1.4, ease.outBack], [12.3, 1.35], [12.7, 0.45], [16.9, 0.32], [17.35, 1.25, ease.outBack], [17.7, 1.15], [18.0, 1.05], [18.3, 1.1], [18.8, 0.4], [22.9, 0.3], [23.12, 0.85, ease.outQuad], [23.7, 0.55], [24.5, 0.32], [26.2, 0.35], [26.55, 0.62]],
    armNCurl: [[0, 0.95], [6.9, 0.95], [7.2, 0.2], [8.5, 0.35], [9.1, 0.35], [9.7, 0.95], [10.9, 0.95], [11.45, -0.15], [12.3, -0.1], [12.7, 0.35], [17.3, 0.35], [17.4, -0.2], [17.7, -0.1], [18.0, 1.9], [18.3, 1.95], [18.8, 0.35], [26.2, 0.35], [26.55, 0.95]],
    armF: [[0, 0.55], [6.9, 0.55], [7.12, 0.25], [7.35, 1.75, ease.outQuad], [7.8, 1.2], [8.5, 0.25], [9.1, 0.25], [9.7, 0.55], [10.9, 0.55], [11.3, 0.2], [22.9, 0.22], [23.12, 0.7], [23.7, 0.45], [24.5, 0.22], [26.2, 0.25], [26.55, 0.55]],
    head: [[0, 0.05], [5.5, 0.05], [6.4, -0.08], [7.2, 0.0], [7.5, -0.12], [8.5, 0.02], [9.0, 0.1], [10.2, 0.04], [10.9, 0.05], [11.3, 0.06], [12.2, -0.04], [12.7, -0.02], [13.6, 0.02], [14.6, 0.14], [16.9, 0.13], [17.4, 0.2], [18.6, 0.12], [19.6, 0.0], [20.1, 0.1], [20.9, 0.18], [22.8, 0.16], [23.2, -0.2], [23.8, -0.38], [24.6, -0.42], [25.2, 0.25], [25.75, 0.22], [25.95, 0.05], [26.4, 0.2], [26.6, 0.0]],
    mouth: [[0, 0.5], [22.95, 0.4], [23.05, -1], [24.6, -1], [24.7, 0.0], [25.8, 0.0], [26.1, 0.4]],
    brow: [[0, 0], [20.9, 0], [21.3, 1], [22.8, 1], [23.1, 1.5], [24.8, 0.5], [25.2, 0.8], [26.2, -0.5], [26.8, 0]],
    lookY: [[0, 0], [23.2, -0.6], [24.9, -0.8], [25.2, 0.8], [25.8, 0.5], [26.0, 0]],
    lookX: [[0, 0], [11.2, 0.6], [12.3, 0.6], [12.6, 0]],
    squash: [[0, 1], [9.5, 1], [9.62, 0.97], [9.8, 1]],
  };
  const poohTracks2 = {
    // snag, bump, thinking, walk and the clearing
    lean: [[33.3, 0.12], [34.0, -0.04], [34.45, 0.02], [34.7, -0.12], [34.95, -0.16], [35.1, 0.06], [35.25, -0.14], [35.35, 0.05], [35.8, 0.02], [38.7, 0.05], [39.1, 0.05], [42.6, 0.04], [43.9, 0.06], [44.3, 0]],
    armN: [[33.3, 0.62], [33.9, 0.6], [34.3, 0.75], [34.55, 2.05, ease.outQuad], [34.95, 2.35], [35.15, 1.7], [35.35, 0.9], [35.9, 0.9], [36.4, 2.45], [38.6, 2.45], [38.95, 0.9], [39.2, 0.7], [39.7, 0.6], [43.25, 0.6], [43.9, 0.3]],
    armNCurl: [[33.3, 0.95], [33.9, 0.95], [34.3, 0.4], [34.55, -0.15], [34.95, -0.2], [35.35, 0.4], [36.4, 1.55], [38.6, 1.55], [38.95, 0.4], [39.6, 0.95], [43.25, 0.95], [43.9, 0.35]],
    armF: [[33.3, 0.55], [33.9, 0.55], [34.3, 0.6], [34.55, 0.6], [34.95, 0.9], [35.15, 1.4], [35.35, 0.7], [35.9, 0.55], [38.8, 0.55], [39.6, 0.55], [43.25, 0.55], [43.9, 0.2]],
    head: [[33.3, 0.0], [33.9, -0.25], [34.2, 0.12], [34.5, -0.42], [34.95, -0.5], [35.3, -0.1], [35.5, 0.15], [36.0, -0.26], [37.2, -0.3], [38.2, -0.22], [38.8, 0.05], [39.3, 0.0], [42.6, -0.05], [43.1, 0.1], [43.4, 0.12]],
    mouth: [[33.3, 0.3], [34.9, 0.3], [35.0, -1], [35.5, -1], [35.7, 0.1], [37.6, 0.1], [38.1, 0.6], [42.9, 0.5], [43.5, 0.9]],
    brow: [[33.3, 0], [34.9, 0.5], [35.2, 1.5], [35.6, 0.8], [36.3, 1.2], [38.0, 0.9], [38.5, 0], [42.6, 0], [43.0, -0.4]],
    lookY: [[33.3, 0], [34.3, -0.8], [35.0, -1], [35.4, 0], [36.2, -0.7], [38.5, -0.6], [38.8, 0]],
    lookX: [[33.3, 0], [36.2, 0.6], [38.6, 0.6], [38.8, 0]],
    squash: [[33.3, 1], [35.3, 1], [35.36, 0.84], [35.55, 1.03], [35.75, 1]],
  };
  const poohTracks3 = {
    // sitting in the clearing: "you first" with an open paw, then his own turn, a long bow
    // to dip a paw in (aimed at the pot mouth in pooh()), and a lick
    lean: [[45, 0.02], [45.6, 0.02], [45.95, 0.1], [46.45, 0.08], [46.8, 0.02], [48.8, 0.02], [49.2, 0.72], [49.45, 0.72], [49.85, 0.0], [50.4, -0.03], [51.4, -0.02], [52.6, 0.04], [60, 0.04]],
    armN: [[45, 0.5], [45.6, 0.55], [45.95, 1.35, ease.outBack], [46.45, 1.3], [46.75, 0.55], [48.8, 0.55], [49.2, 1.0], [49.45, 1.0], [49.9, 2.3], [50.3, 2.3], [50.7, 0.55], [60, 0.55]],
    armNCurl: [[45, 0.8], [45.6, 0.8], [45.95, -0.15], [46.45, -0.1], [46.75, 0.8], [48.8, 0.8], [49.2, 0.3], [49.45, 0.3], [49.9, 1.6], [50.3, 1.6], [50.7, 0.9]],
    armF: [[45, 0.4], [45.6, 0.45], [45.95, 0.7], [46.45, 0.65], [46.75, 0.4], [49.0, 0.4], [49.3, 0.6], [49.8, 0.4], [60, 0.4]],
    head: [[45, 0.14], [45.6, 0.16], [46.0, 0.05], [46.8, 0.14], [47.6, 0.12], [48.3, 0.02], [48.9, 0.1], [49.25, -0.15], [49.5, -0.12], [49.9, -0.06], [50.4, -0.04], [51.3, 0.02], [52.0, 0.22], [53.4, 0.24], [54.6, -0.08], [60, -0.1]],
    mouth: [[45, 0.5], [47.8, 0.5], [48.2, 1], [49.8, 0.8], [50.4, 1], [60, 1]],
    eye: [[45, 1], [50.2, 1]],
    brow: [[45, 0], [60, 0]],
    lookY: [[45, 0.4], [46, 0], [46.7, 0.5], [48.9, 0.3], [49.2, 1], [49.45, 0.8], [49.7, 0], [52.0, 0.8], [53.4, 0.8], [54.6, -0.2], [60, -0.2]],
    lookX: [[45, 0.3], [60, 0.3]],
    squash: [[45, 1], [60, 1]],
  };

  function tracksAt(tr, t) {
    const o = {};
    for (const k in tr) o[k] = track(tr[k], t);
    return o;
  }
  /** Keyframes come in three sets (before the snag, the snag to the clearing, the clearing);
      the first hand-over is blended over 0.4 s so nothing jumps. The second is a cut. */
  function blendTracks(A, B, C, t) {
    if (t >= T.cut2) return tracksAt(C, t);
    if (t < 33.3) return tracksAt(A, t);
    const b = tracksAt(B, t);
    const k = seg(t, 33.3, 33.7);
    if (k >= 1) return b;
    const a = tracksAt(A, 33.3);
    const o = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === undefined) o[key] = b[key];
      else if (b[key] === undefined) o[key] = a[key];
      else o[key] = lerp(a[key], b[key], k);
    }
    return o;
  }

  function pooh(t) {
    const s = { x: poohX(t), z: 64, facing: 1, pose: {}, hold: null };
    const P = s.pose;
    Object.assign(P, blendTracks(poohTracks, poohTracks2, poohTracks3, t));
    P.t = t;
    P.blink = blinkAt(t, 1);
    P.shade = [-8, -7];
    // idle breathing
    P.bob = Math.sin(t * 2.1) * 1.2;
    // happy eyes
    const happy = (a, b) => t > a && t < b;
    if (happy(13.05, 13.75) || happy(17.55, 18.45) || happy(43.4, 44.3) || happy(48.3, 48.9) || happy(50.2, 51.0) || happy(53.2, 55.0) || t > 56.4) P.eye = 2;
    if (t < 7.35) s.hold = 'bundle';
    else if (potInPaw(t)) s.hold = 'pot';
    const carrying = s.hold;

    // walking / running cycles
    if (t >= STEP[0] && t < STEP[1]) {
      const amp = 0.7 * seg(t, STEP[0], STEP[0] + 0.12) * (1 - seg(t, STEP[1] - 0.14, STEP[1]));
      Object.assign(P, blendCycle(P, walkCycle((poohX(t) - POOH_HOME) / 160, amp, 0), amp, carrying));
    }
    if (t >= RUN0 && t < RUN1 + 0.3) {
      const amp = seg(t, RUN0, RUN0 + 0.35) * (1 - seg(t, 33.35, 34.05));
      Object.assign(P, blendCycle(P, walkCycle((poohX(t) - POOH_MEADOW) / POOH_STRIDE + 0.1, amp, 0.85), amp, carrying));
      s.z = lerp(64, 40, seg(t, RUN0, 28));
    }
    if (t >= RUN1) s.z = 40;
    if (t >= POOH_WALK && t < T.cut2) {
      const amp = seg(t, POOH_WALK, POOH_WALK + 0.3) * (1 - seg(t, 42.2, 42.75));
      Object.assign(P, blendCycle(P, walkCycle((poohX(t) - poohX(POOH_WALK)) / 115, amp, 0.05), amp, carrying));
      s.z = lerp(40, 58, seg(t, POOH_WALK, 42.7));
    }
    // tiptoe reach for the snagged cloth
    if (t > 34.35 && t < 35.0) {
      const k = seg(t, 34.35, 34.6) * (1 - seg(t, 34.9, 35.0));
      P.legNLift = 7 * k; P.legFLift = 7 * k; P.bob = (P.bob || 0) - 9 * k;
    }
    // bump! sits down hard, then gets up again
    if (t >= 35.25 && t < T.walk) {
      P.sit = seg(t, 35.25, 35.38, ease.inQuad) * (1 - seg(t, 38.75, 39.1));
      P.legN = 0.1 * wobble(t, 35.38, 2, 5, 1);
    }
    if (t >= T.cut2) {
      s.x = 4060;
      s.z = 64;
      P.sit = 1;
      P.bob = Math.sin(t * 1.9) * 0.9 + (t > 50.3 && t < 50.9 ? -3 * Math.sin((t - 50.3) / 0.6 * Math.PI) : 0);
      P.legN = 0.05; P.legF = 0.12;
    }
    // bowing to pick up or set down the pot
    const pe = potEvent(t);
    if (pe) {
      const w = bowW(pe, t);
      for (const k in pe.pose) P[k] = lerp(P[k] ?? 0, pe.pose[k], w);
      P.bob = lerp(P.bob || 0, 0, w);
    }
    // his own turn: a paw right into the pot, where it stands in front of him
    const dip = seg(t, 49.05, 49.3) * (1 - seg(t, 49.45, 49.7));
    if (dip > 0) {
      const sp = CLEAR_POT, [gx, gy] = groundXY(sp.x, sp.z);
      const k = POT_SCALE * (1 - sp.z * 0.0006);
      P.armN = lerp(P.armN, WP.chars.reachArmN('pooh', P, toLocal(s, gx + 2 * k, gy - 60 * k)), dip);
    }
    P.earWind = clamp((wind(t) - 0.25) * 1.4, 0, 1);
    const tk = talking('pooh', t);
    if (tk !== null) P.mouth = tk > 0.45 ? -1 : 0.4;
    return s;
  }

  /** Mouth movement while a character is speaking their own line (from the narration cues). */
  function talking(who, t) {
    const L = window.CUES && window.CUES.lines;
    if (!L) return null;
    for (const k in L) {
      const c = L[k];
      if (c.speaker !== who || t < c.speechStart - 0.03 || t > c.speechEnd + 0.05) continue;
      // open and close about five times a second, easing at the ends of the phrase
      const u = (t - c.speechStart) * 5.2;
      const open = 0.5 - 0.5 * Math.cos(u * TAU);
      const env = seg(t, c.speechStart - 0.03, c.speechStart + 0.06) * (1 - seg(t, c.speechEnd - 0.06, c.speechEnd + 0.05));
      return env * open;
    }
    return null;
  }

  function blendCycle(P, C, amp, hold) {
    const o = {};
    for (const k of ['legN', 'legF', 'legNLift', 'legFLift', 'bob']) o[k] = C[k];
    o.lean = (P.lean || 0) + C.lean;
    o.head = (P.head || 0) + C.head;
    if (!hold) {
      o.armN = lerp(P.armN, C.armN, amp);
      o.armF = lerp(P.armF, C.armF, amp);
    } else {
      o.armN = P.armN + (C.armN - 0.25) * 0.15;
      o.armF = P.armF + (C.armF - 0.2) * 0.15;
    }
    return o;
  }

  /* ================================================================ Piglet */

  const PIG_CLEARING = 4255; // sitting just clear of Pooh's bow
  function pigletX(t) {
    if (t < T.pigletOut) return 578;
    if (t < T.pigletStop) return lerp(578, 470, seg(t, T.pigletOut, T.pigletStop, ease.inOutSine));
    if (t < 26.8) return 470;
    if (t < 34.0) {
      const a = 26.8, b = 27.3, c = 33.35, d = 34.0, v = 462;
      if (t < b) return 470 + v * 0.5 * ((t - a) * (t - a)) / (b - a);
      const xb = 470 + v * 0.5 * (b - a);
      if (t < c) return xb + v * (t - b);
      const xc = xb + v * (c - b);
      const u = (t - c) / (d - c);
      return xc + v * (d - c) * (u - 0.5 * u * u);
    }
    const x34 = pigletX(33.9999);
    if (t < T.walk + 0.15) return x34 + lerp(0, -40, seg(t, 35.6, 36.3));
    if (t < T.cut2) return x34 - 40 + 185 * (t - T.walk - 0.15) * (1 - 0.25 * seg(t, 42.2, 42.8));
    return lerp(PIG_CLEARING, 4170, seg(t, T.lean, T.lean + 0.9, ease.inOutSine));
  }

  const pigTracks = {
    head: [[12.3, 0.1], [12.8, -0.05], [13.1, 0.08], [13.35, -0.02], [14.3, -0.12], [14.7, -0.22], [16.8, -0.2], [17.3, -0.28], [18.1, -0.26], [18.6, -0.1], [19.6, 0.05], [20.2, -0.1], [20.9, 0.25], [22.8, 0.2], [23.2, 0.35], [23.7, 0.25], [24.0, -0.35], [24.8, -0.45], [25.2, 0.3], [25.75, 0.25], [25.95, -0.12], [26.3, -0.05], [26.6, 0]],
    armN: [[12.3, 0.2], [14.3, 0.25], [14.6, 1.35, ease.outBack], [16.7, 1.3], [17.1, 0.3], [18.1, 0.35], [18.3, 1.2], [18.7, 0.3], [22.9, 0.3], [23.25, 2.4, ease.outQuad], [23.85, 2.3], [24.1, 0.35], [26.25, 0.35], [26.4, 2.1, ease.outBack], [26.7, 1.9], [26.85, 0.3]],
    armNCurl: [[12.3, 0.2], [14.3, 0.2], [14.6, 1.6], [16.7, 1.6], [17.1, 0.2], [26.3, 0.2], [26.4, -0.2], [26.8, 0.2]],
    armF: [[12.3, 0.15], [14.3, 0.2], [14.6, 1.25, ease.outBack], [16.7, 1.2], [17.1, 0.2], [18.1, 0.25], [18.3, 1.1], [18.7, 0.2], [22.9, 0.2], [23.25, 2.2, ease.outQuad], [23.85, 2.1], [24.1, 0.25]],
    armFCurl: [[12.3, 0.2], [14.3, 0.2], [14.6, 1.6], [16.7, 1.6], [17.1, 0.2]],
    earN: [[12.3, 0], [12.5, -0.4], [12.75, 0.25], [13.0, -0.1], [13.2, 0], [14.6, -0.15], [16.8, -0.12], [17.3, 0], [18.4, -0.3], [18.7, 0.2], [18.9, 0], [23.1, 0.9], [23.8, 0.7], [24.2, 0], [25.9, 0], [26.1, -0.3], [26.3, 0]],
    earF: [[12.3, 0], [12.5, -0.3], [12.75, 0.2], [13.0, -0.05], [13.2, 0], [18.4, -0.25], [18.7, 0.2], [18.9, 0], [23.1, 0.9], [23.8, 0.7], [24.2, 0]],
    mouth: [[12.3, 0.2], [14.6, -1], [16.0, -1], [16.3, 0.6], [18.0, 1], [22.9, 0.5], [23.05, -1], [24.8, -1], [25.0, -0.2], [26.2, 0.3]],
    lookY: [[12.3, 0], [14.5, -0.6], [16.8, -0.6], [17.3, -0.8], [18.5, 0], [20.9, 0.8], [22.8, 0.8], [23.2, 0], [24.0, -0.8], [25.0, -0.9], [25.2, 0.8], [25.8, 0.4], [26.0, -0.4], [26.3, 0]],
    squash: [[12.3, 1], [23.25, 1], [23.35, 0.8], [23.8, 0.82], [24.0, 1]],
    lean: [[12.3, 0], [14.3, 0], [14.6, -0.06], [16.8, -0.05], [17.2, 0], [23.1, 0.12], [23.35, 0.3], [23.8, 0.28], [24.0, 0], [26.4, 0], [26.65, -0.1], [26.8, 0.05]],
  };
  const pigTracks2 = {
    head: [[33.3, 0], [33.9, -0.3], [34.9, -0.4], [35.3, -0.1], [35.6, 0.05], [36.3, -0.2], [37.0, -0.22], [37.8, -0.12], [38.6, -0.35], [39.2, -0.05], [42.6, -0.08], [43.0, -0.28], [43.6, -0.22], [44.4, -0.1]],
    armN: [[33.3, 0.3], [33.95, 0.35], [34.15, 2.2], [34.4, 1.2], [34.6, 2.3], [34.85, 1.3], [35.2, 0.35], [36.2, 0.35], [36.5, 1.2], [37.2, 1.15], [37.5, 0.3], [42.6, 0.3], [43.1, 0.9], [43.6, 0.3]],
    armF: [[33.3, 0.25], [33.95, 0.3], [34.15, 2.0], [34.4, 1.1], [34.6, 2.1], [34.85, 1.2], [35.2, 0.25], [42.6, 0.25], [43.1, 0.8], [43.6, 0.25]],
    armNCurl: [[33.3, 0.2], [36.3, 0.2], [36.5, 1.5], [37.2, 1.5], [37.5, 0.2]],
    earN: [[33.3, 0.2], [34.3, -0.3], [34.6, 0.3], [34.9, -0.2], [35.2, 0], [35.4, -0.4], [35.7, 0.1], [36.0, 0], [42.9, 0], [43.1, -0.35], [43.4, 0.1], [43.6, 0]],
    earF: [[33.3, 0.2], [34.3, -0.2], [34.6, 0.3], [34.9, -0.2], [35.2, 0], [42.9, 0], [43.1, -0.3], [43.4, 0.1], [43.6, 0]],
    mouth: [[33.3, 0.3], [35.3, -1], [35.8, -0.6], [36.2, 0.2], [42.9, 0.4], [43.3, 1]],
    lookY: [[33.3, 0], [33.9, -0.8], [35.2, -0.6], [35.6, 0.3], [36.3, -0.7], [37.5, -0.6], [38.6, -0.8], [39.2, 0], [43.0, -0.7], [43.8, -0.4]],
    squash: [[33.3, 1]],
    lean: [[33.3, 0.1], [34.0, 0], [36.4, 0.0], [36.6, 0.06], [37.3, 0.04], [37.6, 0], [42.9, 0], [43.2, 0.06], [43.6, 0]],
  };
  const pigTracks3 = {
    head: [[45, -0.05], [45.7, 0.05], [46.3, 0.1], [46.8, 0.18], [47.4, -0.05], [47.8, -0.1], [48.3, -0.18], [48.9, -0.05], [49.6, 0.05], [50.4, -0.05], [51.3, -0.05], [52.2, 0.12], [53.2, 0.1], [54.6, -0.05], [60, -0.05]],
    armN: [[45, 0.35], [46.5, 0.4], [46.8, 1.3], [47.15, 1.25], [47.4, 1.8], [47.8, 2.1], [48.3, 2.0], [48.7, 0.4], [60, 0.4]],
    armNCurl: [[45, 0.3], [46.5, 0.3], [46.8, 0.1], [47.15, 0.1], [47.5, 1.5], [48.3, 1.5], [48.7, 0.3]],
    armF: [[45, 0.3], [60, 0.3]],
    earN: [[45, 0], [47.9, 0], [48.1, -0.45], [48.4, 0.15], [48.6, 0], [60, 0]],
    earF: [[45, 0], [47.9, 0], [48.1, -0.4], [48.4, 0.12], [48.6, 0], [60, 0]],
    mouth: [[45, 0.5], [47.8, 0.5], [48.0, 1], [60, 1]],
    lookY: [[45, 0.4], [46, 0.3], [46.8, 0.6], [47.5, 0], [52.2, -0.3], [60, -0.3]],
    lean: [[45, 0], [46.55, 0], [46.9, 0.5], [47.15, 0.47], [47.5, 0.02], [51.3, 0], [52.2, 0.2], [60, 0.2]],
    squash: [[45, 1], [48.0, 1], [48.1, 0.92], [48.3, 1.03], [48.45, 1]],
    blush: [[45, 0.5], [47.9, 0.5], [48.2, 1], [60, 1]],
  };

  // when Piglet turns round: [time, new facing]; each turn takes 0.2 s
  const PIG_TURNS = [[23.8, 1], [25.75, -1], [26.2, 1], [35.5, -1], [38.85, 1], [42.85, -1]];
  function pigletFacing(t) {
    let f = -1;
    for (const [t0, to] of PIG_TURNS) {
      if (t >= t0 + 0.2) f = to;
      else if (t > t0) return lerp(f, to, ease.inOutSine((t - t0) / 0.2));
    }
    return f;
  }

  // A jump lifts all of Piglet, legs and all (bob only bounces his body on his legs); the
  // height follows a thrown-ball arc, with a squash as he takes off and lands.
  const hopArc = (u) => 4 * u * (1 - u);
  const hopSquash = (u) => -0.12 * Math.exp(-((u / 0.08) ** 2)) - 0.1 * Math.exp(-(((u - 1) / 0.08) ** 2));

  function piglet(t) {
    const s = { x: pigletX(t), z: 90, facing: pigletFacing(t), pose: {}, hidden: 0, jump: 0 };
    const P = s.pose;
    Object.assign(P, blendTracks(pigTracks, pigTracks2, pigTracks3, t));
    P.t = t;
    P.blink = blinkAt(t, 2);
    P.shade = s.facing < 0 ? [8, -6] : [-6, -5]; // light from the upper left, whichever way he faces
    P.bob = Math.sin(t * 2.6 + 1) * 0.8;
    if (t < T.pigletOut) {
      s.z = 138;
      // pops up from behind the long grass, with a springy overshoot
      const k = seg(t, T.pigletPop, T.pigletPop + 0.32, ease.outBack);
      s.rise = lerp(78, 0, clamp(k, 0, 1.2));
      if (t < T.pigletPop) s.rise = 90;
      P.bob -= 6 * wobble(t, T.pigletPop + 0.3, 2.5, 6, 1);
    } else if (t < T.pigletStop + 0.1) {
      s.z = lerp(138, 92, seg(t, T.pigletOut, T.pigletStop));
      const amp = seg(t, T.pigletOut, T.pigletOut + 0.2) * (1 - seg(t, T.pigletStop - 0.2, T.pigletStop));
      Object.assign(P, blendCycle(P, walkCycle((578 - pigletX(t)) / 60, amp, 0.2), amp, null));
    }
    // happy hop on "For us"
    if (t > T.hop && t < T.hop + 0.6) {
      const u = (t - T.hop) / 0.6;
      s.jump = hopArc(u) * 42;
      P.squash = 1 + 0.07 * Math.sin(u * Math.PI) + hopSquash(u);
      P.legN = lerp(P.legN, 0.25, Math.sin(u * Math.PI));
      P.legF = lerp(P.legF, -0.15, Math.sin(u * Math.PI));
      P.armN = lerp(P.armN, 2.2, Math.sin(u * Math.PI));
      P.armF = lerp(P.armF, 2.0, Math.sin(u * Math.PI));
    }
    // turns to watch the cloth fly off, turns back to Pooh, turns to run

    if (t >= 26.8 && t < 34.3) {
      const amp = seg(t, 26.8, 27.1) * (1 - seg(t, 33.4, 34.05));
      Object.assign(P, blendCycle(P, walkCycle((pigletX(t) - 470) / PIG_RUN, amp, 1), amp, null));
      s.z = lerp(90, 58, seg(t, 26.8, 28));
      // a leap for the dipping cloth
      if (t > 30.7 && t < 31.35) {
        const u = (t - 30.7) / 0.65;
        s.jump = hopArc(u) * 95;
        P.armN = lerp(P.armN, 2.6, Math.sin(u * Math.PI));
        P.armF = lerp(P.armF, 2.4, Math.sin(u * Math.PI));
        P.legN = lerp(P.legN, 0.5, Math.sin(u * Math.PI));
        P.legF = lerp(P.legF, -0.3, Math.sin(u * Math.PI));
        P.head = -0.35 * Math.sin(u * Math.PI);
        P.earN = 0.7 * Math.sin(u * Math.PI);
        P.earF = 0.6 * Math.sin(u * Math.PI);
      }
      if (t > 31.35 && t < 31.6) P.squash = 1 - 0.15 * Math.sin(((t - 31.35) / 0.25) * Math.PI);
    }
    if (t >= 34.0 && t < T.cut2) {
      s.z = 58; // in front of the snagged cloth, so we see him hop for it
      // two hopeful hops by the gorse
      for (const h0 of [34.12, 34.55]) {
        if (t <= h0 || t >= h0 + 0.36) continue;
        const u = (t - h0) / 0.36;
        s.jump = hopArc(u) * 30;
        P.squash = (P.squash ?? 1) + hopSquash(u) * 0.8;
      }
      // steps back and turns to Pooh while he sits and thinks

      if (t > 35.6 && t < 36.3) {
        const amp = 0.6 * seg(t, 35.6, 35.72) * (1 - seg(t, 36.15, 36.3));
        Object.assign(P, blendCycle(P, walkCycle((t - 35.6) * 2.2, amp, 0), amp, null));
      }
    }
    if (t >= T.walk + 0.15 && t < T.cut2) {
      const amp = seg(t, T.walk + 0.15, T.walk + 0.45) * (1 - seg(t, 42.3, 42.85));
      Object.assign(P, blendCycle(P, walkCycle((pigletX(t) - pigletX(T.walk + 0.15)) / PIG_WALK, amp, 0.1), amp, null));
      s.z = lerp(58, 96, seg(t, T.walk, 42.8));

    }
    if (t >= T.cut2) {
      s.z = 56;
      s.facing = -1;
      P.sit = 1;
      P.bob = Math.sin(t * 2.2) * 0.7;
      if (t > T.lean && t < T.lean + 0.9) {
        // shuffles closer
        const u = (t - T.lean) / 0.9;
        P.bob -= Math.abs(Math.sin(u * Math.PI * 3)) * 4;
      }
      P.legN = 0.1; P.legF = 0.2;
    }
    P.earWind = clamp((wind(t) - 0.2) * 1.6, 0, 1.2);
    if (t > 22.8 && t < 24.2) {
      // ears blown back by the gust
      const k = seg(t, 22.8, 23.1) * (1 - seg(t, 23.9, 24.2));
      P.earN = lerp(P.earN, -0.9, k);
      P.earF = lerp(P.earF, -0.8, k);
    }
    // dips a paw into the honey Pooh holds out to him
    const dip = seg(t, 46.55, 46.85) * (1 - seg(t, 47.1, 47.4));
    if (dip > 0) {
      const pS = pooh(t), m = potMatrix(pot(t, pS), pS);
      const q = m.transformPoint(new DOMPoint(12, -61));
      P.armN = lerp(P.armN, WP.chars.reachArmN('piglet', P, toLocal(s, q.x, q.y)), dip);
    }
    const happy = (a, b) => t > a && t < b;
    if (happy(18.2, 18.9) || happy(43.4, 44.2) || happy(48.1, 49.2) || t > 52.3) P.eye = 2;
    const tk = talking('piglet', t);
    if (tk !== null) P.mouth = tk > 0.45 ? -1 : 0.3;
    return s;
  }

  /* ================================================================ the pot */

  // Pooh really handles the pot. To pick it up or set it down he bows until his paw is at
  // the pot; while he has it, it goes wherever that paw goes. Each hand-off blends a bow
  // in over `pre` seconds, holds it for `hold` and lets it go over `post`. The pot changes
  // hands at tc, in the middle of the hold, where paw and pot are exactly together.
  const POT_SCALE = 0.82;
  const POT_OFF = [-37, 60]; // pot base from the near paw while he carries it (his frame, unscaled)
  const BOW = { lean: 0.9, armN: 0.95, armNCurl: 0.3, armF: 0.9, head: 0.1, lookY: 1 };
  // in a hurry, and with Piglet close by, he keeps his eyes (and his head) up on the cloth
  const BOW_UP = Object.assign({}, BOW, { head: -0.55, lookY: -0.7 });
  // spot 'here': the pot stands wherever this first bow puts his paw
  const POT_EVENTS = [
    { kind: 'pick', tc: 9.55, pre: 0.42, hold: 0.08, post: 0.45, pose: BOW, spot: 'here' },
    { kind: 'put', tc: 10.9, pre: 0.4, hold: 0.12, post: 0.4, pose: BOW },
    { kind: 'pick', tc: 26.42, pre: 0.26, hold: 0.04, post: 0.3, pose: BOW_UP },
    { kind: 'put', tc: 34.2, pre: 0.24, hold: 0.05, post: 0.24, pose: BOW_UP },
    { kind: 'pick', tc: 39.36, pre: 0.3, hold: 0.06, post: 0.34, pose: BOW_UP },
    { kind: 'put', tc: 43.25, pre: 0.4, hold: 0.1, post: 0.4, pose: BOW },
  ];
  // after the cut the pot stands on the cloth between them, where both can reach into it
  const CLEAR_POT = { x: 4180, z: 30 };
  /** How far into its bow Pooh is for hand-off e at time t (0..1, 1 through the hold). */
  function bowW(e, t) {
    const a = e.tc - e.hold / 2, b = e.tc + e.hold / 2;
    if (t <= a - e.pre || t >= b + e.post) return 0;
    if (t < a) return ease.inOutSine((t - a + e.pre) / e.pre);
    if (t <= b) return 1;
    return 1 - ease.inOutSine((t - b) / e.post);
  }
  const potEvent = (t) => POT_EVENTS.find((e) => t > e.tc - e.hold / 2 - e.pre && t < e.tc + e.hold / 2 + e.post) || null;
  /** Does Pooh have the pot at time t (from a pick until the next put)? */
  function potInPaw(t) {
    let held = false;
    for (const e of POT_EVENTS) {
      if (t < e.tc) break;
      held = e.kind === 'pick';
    }
    return held;
  }

  // A character's own frame: origin at the feet, unscaled, x forward.
  const poohScale = (pS) => 1 - pS.z * 0.0006;
  /** A point in world space, in a character's own frame. */
  function toLocal(c, wx, wy) {
    const [px, py] = groundXY(c.x, c.z), sc = 1 - c.z * 0.0006, f = c.facing;
    return [(wx - px) / (sc * (Math.abs(f) < 0.04 ? 0.04 * Math.sign(f || 1) : f)), (wy - py - (c.rise || 0) + (c.jump || 0)) / sc];
  }
  /** A spot on the ground (x, z), in Pooh's frame. */
  const toPooh = (pS, x, z) => toLocal(pS, ...groundXY(x, z));
  function fromPooh(pS, lx, ly) {
    const [px, py] = groundXY(pS.x, pS.z), sc = poohScale(pS);
    const gx = px + lx * sc * pS.facing, gy = py + ly * sc;
    const z = -gy / 0.36;
    return { x: gx - z * 0.18, z };
  }
  const poohPaw = (P) => WP.chars.pawAt('pooh', P);
  /** The pot's base and angle in Pooh's frame while he holds it. */
  function potHeldLocal(pS, t, e, w) {
    const P = pS.pose;
    const [px, py] = poohPaw(P);
    // it turns with his body as he straightens up, and stands upright whenever it meets the ground
    const a = (P.lean || 0) * (1 - w);
    let ox = POT_OFF[0], oy = POT_OFF[1];
    if (e && e.delta && t > e.tc) { ox += e.delta[0] * w; oy += e.delta[1] * w; }
    const c = Math.cos(a), s = Math.sin(a);
    return { x: px + ox * c - oy * s, y: py + ox * s + oy * c, a };
  }
  // Where the pot stands between hand-offs: a put leaves it where his paw set it down, and
  // a pick finds it there (any small difference is taken up while he straightens).
  let SPOTS = false;
  function potSpots() {
    if (SPOTS) return;
    SPOTS = true;
    let last = null;
    for (const e of POT_EVENTS) {
      const pS = pooh(e.tc);
      const L = potHeldLocal(pS, e.tc, null, 1);
      if (e.kind === 'put' || e.spot === 'here') e.spot = fromPooh(pS, L.x, L.y);
      else {
        e.spot = last;
        const g = toPooh(pS, last.x, last.z);
        e.delta = [g[0] - L.x, g[1] - L.y];
      }
      e.ratio = (1 - e.spot.z * 0.0006) / poohScale(pS);
      last = e.spot;
    }
  }
  /** Where the pot stands on the ground at time t (when Pooh doesn't have it). */
  function potGround(t) {
    potSpots();
    if (t >= T.cut2) return { spot: CLEAR_POT, put: null };
    let put = null;
    for (const e of POT_EVENTS) if (e.tc <= t && e.kind === 'put') put = e;
    return put ? { spot: put.spot, put } : { spot: POT_EVENTS[0].spot, put: null };
  }

  /** The pot at time t. `local` (in Pooh's frame) is set whenever he is handling it, so that
      it is drawn with him, between his body and his near arm; otherwise it is drawn on its own. */
  function pot(t, pS = pooh(t)) {
    potSpots();
    const e = potEvent(t), w = e ? bowW(e, t) : 0;
    if (potInPaw(t)) {
      const L = potHeldLocal(pS, t, e, w);
      L.s = POT_SCALE * (e ? lerp(1, e.ratio, w) : 1);
      return { held: true, local: L, e, w };
    }
    const g = potGround(t);
    let tilt = 0;
    // rocking while the cloth is whisked out from under it
    if (t > T.gust + 0.12 && t < 26.5) tilt += 0.16 * wobble(t, T.gust + 0.12, 2.4, 2.2, 1) + 0.05 * wobble(t, T.gust + 0.5, 3.2, 3, 1);
    // settling with a little rock after being set down
    if (g.put) tilt += 0.035 * wobble(t, g.put.tc, 3.2, 7, 1);
    const o = { x: g.spot.x, z: g.spot.z, tilt, e, w };
    if (e) {
      const [lx, ly] = toPooh(pS, o.x, o.z);
      o.local = { x: lx, y: ly, a: tilt, s: (POT_SCALE * (1 - o.z * 0.0006)) / poohScale(pS) };
    }
    return o;
  }
  /** The pot's matrix in world space (its base at the origin). */
  function potMatrix(pt, pS) {
    if (pt.local) {
      const [px, py] = groundXY(pS.x, pS.z), sc = poohScale(pS);
      return new DOMMatrix().translate(px, py).scale(sc * pS.facing, sc)
        .translate(pt.local.x, pt.local.y).rotate((pt.local.a * 180) / Math.PI).scale(pt.local.s);
    }
    const [x, y] = groundXY(pt.x, pt.z);
    const s = POT_SCALE * (1 - pt.z * 0.0006);
    return new DOMMatrix().translate(x, y).rotate((pt.tilt * 180) / Math.PI).scale(s);
  }
  /** Its shadow on the grass: full on the ground, fading and shrinking as he lifts it away. */
  function potShadow(pt, pS) {
    if (!pt.held) return { x: pt.x, z: pt.z, a: 0.3, lift: 0 };
    if (!pt.e || pt.w <= 0) return null;
    const sp = pt.e.spot, [gx, gy] = toPooh(pS, sp.x, sp.z);
    const lift = Math.max(0, gy - pt.local.y) * poohScale(pS);
    return { x: sp.x + (pt.local.x - gx) * poohScale(pS) * pS.facing, z: sp.z, a: 0.3 * pt.w, lift };
  }

  /* ================================================================ bees */

  function bees(t) {
    const out = [];
    potSpots();
    const meadowPot = POT_EVENTS[1].spot, snagPot = POT_EVENTS[3].spot;
    // two bees idle round the pot on the meadow, then are blown away by the gust
    if (t > 10.6 && t < 24.5) {
      for (let i = 0; i < 2; i++) {
        const ph = t * (1.3 + i * 0.4) + i * 2;
        let x = meadowPot.x + 60 + Math.cos(ph) * (45 + i * 18) + noise1(t * 1.3 + i * 9) * 15;
        let y = -95 - Math.sin(ph * 1.6) * 30 + noise1(t * 1.7 + i) * 12 - i * 30;
        const enter = seg(t, 10.6 + i * 1.2, 12 + i * 1.2);
        x = lerp(-250 + i * 60, x, enter);
        y = lerp(-420, y, enter);
        let rot = 0;
        if (t > 22.7) {
          const k = t - 22.7;
          x += k * k * 420 + k * 120;
          y -= k * k * 120 - Math.sin(k * 9 + i) * 20;
          rot = k * 14 * (i ? -1 : 1);
        }
        out.push({ x, y, z: 70, rot, seed: i });
      }
    }
    // the bees come back — with friends — and follow the honey; while it stands by the gorse
    // they circle it, and when Pooh picks it up again they follow on. They keep just behind
    // Pooh and the pot all the way, so nothing changes places when he picks it up.
    if (t > 29.4 && t < 45) {
      const circling = seg(t, 34.0, 34.9) * (1 - seg(t, 39.2, 40.0));
      for (let i = 0; i < 5; i++) {
        const lag = 0.5 + i * 0.28;
        const tt = t - lag;
        let x = poohX(tt) - 60 - i * 34 + noise1(t * 2 + i * 5) * 26;
        let y = -150 - i * 13 + noise1(t * 2.4 + i * 3) * 28 + Math.sin(t * 8 + i) * 6;
        if (circling > 0) {
          const cx = snagPot.x + Math.cos(t * (1.8 + i * 0.3) + i) * (45 + i * 12);
          const cy = -60 - Math.sin(t * (2.3 + i * 0.2) + i) * 22 - i * 9;
          x = lerp(x, cx, circling);
          y = lerp(y, cy, circling);
        }
        const enter = seg(t, 29.4 + i * 0.15, 30.3 + i * 0.15);
        x = lerp(x - 900, x, enter);
        out.push({ x, y, z: 45, rot: noise1(t * 3 + i) * 0.3, seed: i + 3 });
      }
    }
    if (t >= 45) {
      for (let i = 0; i < 3; i++) {
        const cx = [4400, 3880, 4470][i], cy = [-90, -70, -170][i];
        const ph = t * (1.1 + i * 0.25) + i * 1.7;
        const x = cx + Math.cos(ph) * (30 + i * 8) + noise1(t + i * 4) * 12;
        const y = cy + Math.sin(ph * 1.5) * 18 + noise1(t * 1.3 + i) * 8;
        out.push({ x, y, z: 60, rot: 0, seed: i + 9 });
      }
    }
    return out;
  }

  /* ================================================================ leaves (screen space) */

  const LEAVES = (() => {
    const R = rng(77);
    const L = [];
    const add = (n, t0, t1, speed, fall, size) => {
      for (let i = 0; i < n; i++) L.push({ t0: lerp(t0, t1, R()), y0: R() * 900 - 100, x0: -80 - R() * 300, speed: speed * (0.7 + R() * 0.6), fall: fall * (0.6 + R() * 0.8), size: size * (0.8 + R() * 0.7), spin: (R() - 0.5) * 8, flip: 2 + R() * 5, col: Math.floor(R() * 5), ph: R() * 10, life: 6 });
    };
    add(5, 5.5, 18, 520, 60, 1.7);
    add(1, 19.4, 19.5, 700, 40, 1.8);
    add(46, 19.6, 24.4, 1300, 70, 1.9);
    add(18, 26.5, 39, 900, 60, 1.7);
    const clearing = [];
    for (let i = 0; i < 10; i++) clearing.push({ t0: 40 + i * 2.1 + R(), x0: 200 + R() * 1500, y0: -60, fall: 90 + R() * 50, size: 1.4 + R() * 0.7, spin: (R() - 0.5) * 3, flip: 1.5 + R() * 2, col: Math.floor(R() * 5), ph: R() * 10, sway: 60 + R() * 60 });
    return { L, clearing };
  })();

  function drawLeaves(ctx, t, cam) {
    for (const l of LEAVES.L) {
      const age = t - l.t0;
      if (age < 0 || age > l.life) continue;
      const travel = (windInt(t) - windInt(l.t0)) * l.speed;
      const x = l.x0 + travel;
      const y = l.y0 + age * l.fall + Math.sin(age * 2.3 + l.ph) * 40;
      if (x < -60 || x > W + 60) continue;
      const flip = Math.cos(age * l.flip + l.ph);
      drawLeaf(ctx, x, y, age * l.spin + l.ph, flip, l.size * 1.3, l.col, 0.95);
    }
    if (t > 40) {
      for (const l of LEAVES.clearing) {
        const age = t - l.t0;
        if (age < 0 || age > 14) continue;
        const x = l.x0 + Math.sin(age * 0.9 + l.ph) * l.sway + age * 12;
        const y = l.y0 + age * l.fall;
        if (y > H + 40) continue;
        drawLeaf(ctx, x, y, Math.sin(age * 1.2 + l.ph) * 1.2 + l.ph, Math.cos(age * l.flip + l.ph), l.size * 1.2, l.col, 0.9);
      }
    }
  }

  /* ================================================================ scenery layout */

  let A = null;

  function layout(S) {
    const R = rng(1234);
    const L = { far: [], midFar: [], mid: [], ground: [], groundFront: [], fg: [] };
    const tt = WP.world.terrainTop;
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const flip = () => (R() < 0.5 ? 1 : -1);
    // Elements are placed by the world x the camera will be looking at (X), converted
    // to the layer's own coordinates (X * p), so each region of the Forest has the
    // right backdrop behind it.
    // far ridge: clumps of pines on the skyline
    for (let X = -2000; X < 6500; X += 700 + R() * 1400) {
      const x = X * 0.12;
      L.far.push({ s: pick(S.farClump), x, y: tt(x, 3, -120, 34, 0.0022) + 6, sc: 0.55 + R() * 0.35, flip: flip() });
    }
    // middle distance: heath with small pines, gorse and heather
    for (let X = -1500; X < 6000; X += 300 + R() * 520) {
      const x = X * 0.28, y = tt(x, 7, -40, 22, 0.003) + 10, r = R();
      if (r < 0.4) L.midFar.push({ s: pick(S.pinesFar), x, y, sc: 0.42 + R() * 0.22, flip: flip(), sway: 0.4 });
      else if (r < 0.7) L.midFar.push({ s: pick(S.gorse), x, y: y + 4, sc: 0.45 + R() * 0.2, flip: 1 });
      else L.midFar.push({ s: pick(S.heather), x, y: y + 4, sc: 0.6 + R() * 0.3, flip: 1 });
    }
    // mid layer
    const midY = (x) => tt(x, 11, -12, 16, 0.004) + 14;
    for (let X = -1200; X < 5600; X += 170 + R() * 260) {
      const x = X * 0.55, y = midY(x), r = R();
      const region = X < 900 ? 'meadow' : X < 1800 ? 'heath' : X < 3350 ? 'pines' : X < 3750 ? 'edge' : X < 4650 ? 'clearing' : 'beyond';
      if (region === 'pines' && r < 0.7) L.mid.push({ s: pick(S.pines), x, y, sc: 0.75 + R() * 0.25, flip: flip(), sway: 1 });
      else if (region === 'meadow' && r < 0.35) L.mid.push({ s: pick(S.birches), x, y, sc: 0.7 + R() * 0.2, flip: flip(), sway: 1 });
      else if (region === 'heath' && r < 0.25) L.mid.push({ s: pick(S.pines), x, y, sc: 0.65 + R() * 0.2, flip: flip(), sway: 1 });
      else if ((region === 'edge' || region === 'beyond') && r < 0.55) L.mid.push({ s: R() < 0.5 ? pick(S.birches) : pick(S.pines), x, y, sc: 0.75 + R() * 0.25, flip: flip(), sway: 1 });
      else if (region === 'clearing' && r < 0.2) L.mid.push({ s: pick(S.birches), x, y, sc: 0.6 + R() * 0.15, flip: flip(), sway: 1 });
      else if (r < 0.8) L.mid.push({ s: pick(S.gorse), x, y: y + 6, sc: 0.55 + R() * 0.3, flip: flip(), sway: 0.2 });
      else L.mid.push({ s: pick(S.heather), x, y: y + 6, sc: 0.9 + R() * 0.4, flip: 1, sway: 0.2 });
    }
    L.mid.sort((a, b) => a.y - b.y);
    // ground plane (p = 1)
    const back = (x, z) => [x + z * 0.18, -z * 0.36];
    L.ground.push({ s: S.house, x: -330, y: -40, sc: 1, flip: 1, z: 110 });
    L.ground.push({ s: S.houseTuft, x: -330, y: -40, sc: 1, flip: 1, z: 109.5, sway: 0.3 });
    for (let x = -700; x < 5400; x += 60 + R() * 110) {
      if (x > -520 && x < -150) continue;
      if (x > 3280 && x < 3560) continue;
      const z = 170 + R() * 180;
      const [px, py] = back(x, z);
      const r = R();
      const inClearing = x > 3800 && x < 4600;
      if (inClearing) {
        if (r < 0.7) L.ground.push({ s: pick(S.flowers), x: px, y: py, sc: 1.1 + R() * 0.5, flip: 1, sway: 0.8, z });
        else L.ground.push({ s: pick(S.grass), x: px, y: py, sc: 0.8 + R() * 0.4, flip: flip(), sway: 1, z });
        continue;
      }
      if (x > 900 && x < 3300 && r < 0.14) L.ground.push({ s: pick(S.gorse), x: px, y: py, sc: 0.7 + R() * 0.3, flip: flip(), sway: 0.3, z });
      else if (r < 0.5) L.ground.push({ s: pick(S.heather), x: px, y: py, sc: 1.1 + R() * 0.5, flip: 1, sway: 0.4, z });
      else if (r < 0.82) L.ground.push({ s: pick(S.grass), x: px, y: py, sc: 0.9 + R() * 0.5, flip: flip(), sway: 1, z });
      else L.ground.push({ s: pick(S.bracken), x: px, y: py, sc: 0.7 + R() * 0.3, flip: flip(), sway: 0.6, z });
    }
    // the gorse bush that catches the cloth
    const [sx, sy] = back(CL.SNAG.x, 120);
    L.ground.push({ s: S.snagGorse, x: sx, y: sy, sc: 1.0, flip: 1, sway: 0.15, z: 120 });
    // two old trees that frame the clearing
    L.ground.push({ s: S.bigTrunkL, x: 3640, y: -118, sc: 0.8, flip: 1, z: 330 });
    L.ground.push({ s: S.bigTrunkR, x: 4660, y: -128, sc: 0.85, flip: 1, z: 360 });
    L.ground.sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
    // things in front of the characters on the ground plane
    const [gx, gy] = back(592, 118);
    L.groundFront.push({ s: S.tallGrass, x: gx, y: gy, sc: 1.1, flip: 1, sway: 1, until: 26, z: 118 });
    for (const [x, z] of [[3930, -40], [4380, -30], [4480, -60]]) {
      const [px, py] = back(x, z);
      L.groundFront.push({ s: pick(S.flowers), x: px, y: py, sc: 0.9, flip: 1, sway: 0.8, from: 39, z });
    }
    // foreground (p = 1.35): grass along the bottom and a few big trunks that sweep past in the chase
    for (let X = -1200; X < 5400; X += 150 + R() * 200) {
      const r = R();
      L.fg.push({ s: r < 0.6 ? pick(S.grass) : pick(S.fgBracken), x: X * 1.35, y: 250 + R() * 50, sc: r < 0.6 ? 1.7 + R() * 0.5 : 0.9 + R() * 0.3, flip: flip(), sway: 1 });
    }
    // big soft bracken fronds sweeping past low in the frame during the chase (never over the characters)
    for (const X of [1150, 1650, 2150, 2700, 3150]) L.fg.push({ s: pick(S.fgBracken), x: X * 1.35, y: 330, sc: 1.6, flip: flip(), sway: 1 });
    return L;
  }

  function drawLayer(ctx, items, xf, t, p, cullPad = 400) {
    const w = wind(t);
    for (const it of items) {
      if (it.until && t > it.until) continue;
      if (it.from && t < it.from) continue;
      const sx = xf.ox + it.x * xf.z;
      const approxW = (it.s.w * it.sc * xf.z) / 1.6 + cullPad;
      if (sx < -approxW || sx > W + approxW) continue;
      const sway = it.sway ? it.sway * (0.02 + w * 0.06) * Math.sin(t * (1.3 + (it.x % 7) * 0.1) + it.x * 0.01) + it.sway * w * 0.05 : 0;
      WP.world.drawSprite(ctx, it.s, it.x, it.y, it.sc, it.flip, sway);
    }
  }

  /* ================================================================ init */

  let SCENE, ACT, SIL, SHADOW, PAPER, GRAIN, SKY, TITLE, PLATE_MASK, GROUND_PAT;

  function makeSky() {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    g.drawImage(PAPER, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, rgba('#e9dcb9', 0.55));
    gr.addColorStop(0.55, rgba(PAL.skyWarm, 0.28));
    gr.addColorStop(1, rgba(PAL.paperLight, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // pale watercolour clouds
    const R = rng(21);
    for (let i = 0; i < 14; i++) {
      const x = R() * W, y = 80 + R() * 330, r = 90 + R() * 160;
      ink.bloom(g, x, y, r, i % 3 ? '#fbf6ea' : '#e8d6b0', 0.35, 0.45);
    }
    ink.bloom(g, 380, 150, 420, '#f6dca0', 0.35, 0.9);
    return c;
  }

  function makeTitle() {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    g.drawImage(PAPER, 0, 0);
    // an ink frame, as on an old title page
    g.strokeStyle = rgba(PAL.ink, 0.8);
    g.lineWidth = 1.4;
    g.strokeRect(150, 110, W - 300, H - 220);
    g.lineWidth = 0.8;
    g.strokeRect(162, 122, W - 324, H - 244);
    return c;
  }

  function makePlateMask(w, h) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const n = WP.makeNoise2(5);
    const feather = 34;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
        const d = Math.min(dx, dy) + (n(x / 30, y / 30) - 0.5) * 26 + (n(x / 4, y / 4) - 0.5) * 7;
        const a = clamp(d / feather);
        img.data[(y * w + x) * 4 + 3] = Math.round(smooth(a) * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Paint all the scenery (a few seconds); `progress(p)` is awaited between steps so a page can update. */
  async function init(progress = async () => {}) {
    SCENE = makeCanvas(W, H);
    ACT = makeCanvas(W, H);
    SIL = makeCanvas(W, H);
    SHADOW = makeCanvas(W / 8 + 2, H / 8 + 2);
    PAPER = ink.makePaper(W, H, 7);
    await progress(0.08);
    GRAIN = ink.makeGrain(W, H, 99);
    SKY = makeSky();
    TITLE = makeTitle();
    PLATE_MASK = makePlateMask(640, 360);
    await progress(0.16);
    const S = await WP.world.build((p) => progress(0.16 + p * 0.74));
    A = { S, L: layout(S) };
    bakeBands();
    await progress(0.93);
    const tiny = makeCanvas(1, 1).getContext('2d');
    for (let i = 0; i <= DUR * 30; i++) {
      const t = i / 30;
      drawPooh(tiny, pooh(t).pose);
      drawPiglet(tiny, piglet(t).pose);
      if (i % 300 === 0) await progress(0.93 + 0.07 * (i / (DUR * 30)));
    }
    await progress(1);
  }

  /* ================================================================ frame */

  function groundXY(x, z, y = 0) {
    return [x + z * 0.18, -y - z * 0.36];
  }

  // Distant land is baked once into long strips (one per depth layer); the mid layer's
  // trees still sway, so they are drawn live on top of their baked band.
  const BAND_DEF = [
    { p: 0.12, res: 1.0, items: 'far', bake: true, o: { seed: 3, base: -120, amp: 34, freq: 0.0022, fill: '#e3dcc0', wash: PAL.sage, washA: 0.35, lineA: 0.35, lineW: 1.2 } },
    { p: 0.28, res: 1.15, items: 'midFar', bake: true, o: { seed: 7, base: -40, amp: 22, freq: 0.003, fill: '#dfd8b8', wash: PAL.mossLight, washA: 0.4, lineA: 0.45 } },
    { p: 0.55, res: 1.3, items: 'mid', bake: false, o: { seed: 11, base: -12, amp: 16, freq: 0.004, fill: '#d9d2ad', wash: PAL.moss, washA: 0.32, lineA: 0.55 } },
  ];
  function bakeBands() {
    for (const B of BAND_DEF) {
      // the stretch of this layer the camera ever sees
      let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
      for (let t = T.pageTurn[0]; t <= DUR; t += 0.05) {
        const xf = layerXf(camera(t), B.p);
        xa = Math.min(xa, -xf.ox / xf.z); xb = Math.max(xb, (W - xf.ox) / xf.z);
        ya = Math.min(ya, -xf.oy / xf.z); yb = Math.max(yb, (H - xf.oy) / xf.z);
      }
      xa -= 60; xb += 60;
      const top = Math.max(ya, -900), bottom = Math.min(yb, B.o.base + 700);
      if (WP.lowMem && !B.lowRes) { B.res *= 0.8; B.lowRes = true; }
      const c = makeCanvas((xb - xa) * B.res, (bottom - top) * B.res);
      const g = c.getContext('2d');
      g.scale(B.res, B.res);
      g.translate(-xa, -top);
      WP.world.drawBand(g, xa, xb, { ...B.o, bottom: bottom + 40 });
      if (B.bake) {
        for (const it of A.L[B.items]) WP.world.drawSprite(g, it.s, it.x, it.y, it.sc, it.flip, 0);
      }
      B.img = c; B.x0 = xa; B.y0 = top;
    }
  }

  function drawBands(ctx, cam, t) {
    for (const B of BAND_DEF) {
      const xf = layerXf(cam, B.p);
      ctx.save();
      ctx.setTransform(xf.z, 0, 0, xf.z, xf.ox, xf.oy);
      ctx.drawImage(B.img, B.x0, B.y0, B.img.width / B.res, B.img.height / B.res);
      if (!B.bake) drawLayer(ctx, A.L[B.items], xf, t, B.p);
      ctx.restore();
    }
    return layerXf(cam, 1);
  }

  function drawGround(ctx, xf, t) {
    ctx.save();
    ctx.setTransform(xf.z, 0, 0, xf.z, xf.ox, xf.oy);
    const x0 = -xf.ox / xf.z, x1 = (W - xf.ox) / xf.z;
    const band = WP.world.drawBand(ctx, x0, x1, { seed: 19, base: -128, amp: 10, freq: 0.003, bottom: 2400, fill: '#e6dcbc', wash: PAL.mossLight, washA: 0.5, lineA: 0.5, lineW: 1.4 });
    if (!GROUND_PAT) GROUND_PAT = ctx.createPattern(A.S.groundTile, 'repeat');
    const gp = WP.pathFrom(band.concat([[x1 + 30, 2400], [x0 - 30, 2400]]));
    GROUND_PAT.setTransform(new DOMMatrix([0.8, 0, 0, 0.8, 0, -40]));
    ctx.fillStyle = GROUND_PAT;
    ctx.fill(gp);
    // a sandy path along the heath
    ctx.save();
    const path = new Path2D();
    path.moveTo(x0 - 50, -2);
    for (let x = x0 - 50; x <= x1 + 50; x += 40) path.lineTo(x, -6 + Math.sin(x * 0.004) * 6);
    for (let x = x1 + 50; x >= x0 - 50; x -= 40) path.lineTo(x, 34 + Math.sin(x * 0.003 + 1) * 8);
    path.closePath();
    ink.wash(ctx, path, PAL.honeyLight, { alpha: 0.28, edge: 0.2, edgeW: 14 });
    ctx.restore();
    drawLayer(ctx, A.L.ground, xf, t, 1);
    ctx.restore();
  }

  function contactShadow(ctx, x, z, rx, a, lift = 0) {
    const [px, py] = groundXY(x, z);
    const k = 1 / (1 + lift / 80);
    ctx.save();
    ctx.translate(px, py + 2);
    ctx.scale(1, 0.26);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * k);
    g.addColorStop(0, `rgba(60,42,22,${a * k})`);
    g.addColorStop(1, 'rgba(60,42,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx * k, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawActors(ctx, xf, t) {
    const pS = pooh(t), gS = piglet(t), pt = pot(t, pS);
    const G = CL.state(t);
    const clothUp = G ? Math.max(...G.map((p) => p[1])) : 0;
    ctx.save();
    ctx.setTransform(xf.z, 0, 0, xf.z, xf.ox, xf.oy);
    // ground contact shadows (on the scene, beneath the cut-outs)
    contactShadow(ctx, pS.x, pS.z, 75, 0.3, -Math.min(0, pS.pose.bob || 0));
    if (!gS.rise || gS.rise < 40) contactShadow(ctx, gS.x, gS.z, 42, 0.28, gS.jump - Math.min(0, gS.pose.bob || 0));
    const psh = potShadow(pt, pS);
    if (psh) contactShadow(ctx, psh.x, psh.z, 36, psh.a, psh.lift);
    if (G && clothUp < 400) {
      const cx = G[Math.floor(G.length / 2)];
      contactShadow(ctx, cx[0], cx[2], 170, 0.22 * clamp(1 - clothUp / 400), cx[1]);
    }
    ctx.restore();

    // everything that moves is a cut-out: draw to ACT, then lay it on with a paper edge
    const a = ACT.getContext('2d');
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, W, H);
    a.setTransform(xf.z, 0, 0, xf.z, xf.ox, xf.oy);
    const items = [];
    const CP = G ? CL.pieces(G) : null;
    if (CP) {
      // the parts of the cloth lying on the grass go under everything...
      CP.decal(a);
      // ...with the shadows of whoever is standing on it (painted onto the cloth only)
      a.save();
      a.globalCompositeOperation = 'source-atop';
      contactShadow(a, pS.x, pS.z, 75, 0.3, -Math.min(0, pS.pose.bob || 0));
      if (!gS.rise || gS.rise < 40) contactShadow(a, gS.x, gS.z, 42, 0.28, gS.jump - Math.min(0, gS.pose.bob || 0));
      if (psh) contactShadow(a, psh.x, psh.z, 36, psh.a, psh.lift);
      a.restore();
      // ...and the parts off the ground are sorted with the characters by depth
      for (const it of CP.items) items.push(it);
    }
    // while Pooh handles the pot it is drawn with him (the hold callback runs in his body frame)
    const holdPot = (pose) => (g) => {
      const L = pt.local;
      const m = WP.chars.poohBodyMatrix(pose).inverse()
        .translate(L.x, L.y).rotate((L.a * 180) / Math.PI).scale(L.s);
      g.save();
      g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      drawPot(g, {});
      g.restore();
    };
    const bundle = (g) => {
      // the folded cloth dips with the wind-up, then goes up with the fling; at 7.35 it
      // is exactly where the opening cloth starts, so one becomes the other
      const up = seg(t, 7.12, 7.35, ease.outQuad), dip = seg(t, 6.9, 7.12) * (1 - up);
      g.save();
      g.translate(44 + 14 * up, -58 + 10 * dip - 95 * up);
      g.rotate(-0.3 * up);
      CL.drawBundle(g);
      g.restore();
    };
    items.push({ z: pS.z, draw: () => {
      const [px, py] = groundXY(pS.x, pS.z);
      a.save();
      a.translate(px, py);
      const sc = 1 - pS.z * 0.0006;
      a.scale(sc * pS.facing, sc);
      const pose = Object.assign({}, pS.pose);
      if (pt.local) { pose.hold = 'front'; pose.holdFn = holdPot(pose); }
      if (pS.hold === 'bundle') { pose.hold = 'front'; pose.holdFn = bundle; }
      drawPooh(a, pose);
      a.restore();
    } });
    if (t >= T.pigletPop - 0.02) items.push({ z: gS.z, draw: () => {
      const [px, py] = groundXY(gS.x, gS.z);
      a.save();
      if (gS.rise) {
        a.beginPath();
        a.rect(px - 400, py - 800, 800, 800 + 1);
        a.clip();
      }
      a.translate(px, py + (gS.rise || 0) - gS.jump);
      const sc = 1 - gS.z * 0.0006;
      a.scale(sc * (Math.abs(gS.facing) < 0.04 ? Math.sign(gS.facing || 1) * 0.04 : gS.facing), sc);
      drawPiglet(a, gS.pose);
      a.restore();
    } });
    if (!pt.local) items.push({ z: pt.z + 0.5, draw: () => {
      const m = potMatrix(pt, pS);
      a.save();
      a.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      drawPot(a, {});
      a.restore();
    } });
    // bees and the grass in front of the path join the same depth order
    for (const b of bees(t)) {
      items.push({ z: b.z - 0.25, draw: () => {
        const [bx, by] = groundXY(b.x, b.z, -b.y);
        a.save();
        a.translate(bx, by);
        a.scale(1.9, 1.9);
        drawBee(a, { t, seed: b.seed, rot: b.rot });
        a.restore();
      } });
    }
    for (const it of A.L.groundFront) {
      if ((it.until && t > it.until) || (it.from && t < it.from)) continue;
      items.push({ z: it.z, draw: () => drawLayer(a, [it], xf, t, 1) });
    }
    items.sort((i1, i2) => i2.z - i1.z || (i2.sub ?? 0) - (i1.sub ?? 0));
    for (const it of items) it.draw(a);
    // paper margin + soft shadow, worked only inside the actors' bounds
    const bb = actorBounds(xf, pS, gS, pt, G, t);
    const s = SIL.getContext('2d');
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(bb.x - 8, bb.y - 8, bb.w + 16, bb.h + 16);
    const m = 3.2 * Math.sqrt(xf.z);
    const taps = LITE ? 4 : 8;
    for (let i = 0; i < taps; i++) {
      const an = (i / taps) * TAU + (LITE ? Math.PI / 4 : 0);
      s.drawImage(ACT, bb.x, bb.y, bb.w, bb.h, bb.x + Math.cos(an) * m, bb.y + Math.sin(an) * m, bb.w, bb.h);
    }
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = PAL.paperLight;
    s.fillRect(bb.x - 8, bb.y - 8, bb.w + 16, bb.h + 16);
    s.globalCompositeOperation = 'source-over';
    // soft shadow: the silhouette shrunk to an eighth and stretched back (bilinear = blur)
    const sh = SHADOW.getContext('2d');
    const q = 8;
    sh.setTransform(1, 0, 0, 1, 0, 0);
    sh.globalCompositeOperation = 'source-over';
    sh.clearRect(0, 0, SHADOW.width, SHADOW.height);
    sh.drawImage(SIL, bb.x - 8, bb.y - 8, bb.w + 16, bb.h + 16, (bb.x - 8) / q, (bb.y - 8) / q, (bb.w + 16) / q, (bb.h + 16) / q);
    sh.globalCompositeOperation = 'source-in';
    sh.fillStyle = 'rgb(60,40,20)';
    sh.fillRect(0, 0, SHADOW.width, SHADOW.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.2;
    const ox = 4 * xf.z, oy = 6 * xf.z;
    ctx.drawImage(SHADOW, (bb.x - 24) / q, (bb.y - 24) / q, (bb.w + 48) / q, (bb.h + 48) / q, bb.x - 24 + ox, bb.y - 24 + oy, bb.w + 48, bb.h + 48);
    ctx.globalAlpha = 1;
    ctx.drawImage(SIL, bb.x - 8, bb.y - 8, bb.w + 16, bb.h + 16, bb.x - 8, bb.y - 8, bb.w + 16, bb.h + 16);
    ctx.drawImage(ACT, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
    ctx.restore();
    return { pS, gS };
  }

  /** The clearing's patch of sunlight, warm on the grass where the cloth comes to rest. */
  function sunPool(ctx, xf, t) {
    const k = seg(t, 39.8, 42.5);
    if (k <= 0) return;
    const [px, py] = groundXY(CL.CLEARING.x, CL.CLEARING.z);
    ctx.save();
    ctx.setTransform(xf.z, 0, 0, xf.z, xf.ox, xf.oy);
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(px, py);
    ctx.scale(1, 0.34);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 620);
    g.addColorStop(0, `rgba(120,95,40,${0.55 * k})`);
    g.addColorStop(0.55, `rgba(110,85,35,${0.25 * k})`);
    g.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-620, -620, 1240, 1240);
    ctx.restore();
  }

  function actorBounds(xf, pS, gS, pt, G, t) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (wx0, wy0, wx1, wy1) => {
      x0 = Math.min(x0, xf.ox + wx0 * xf.z); y0 = Math.min(y0, xf.oy + wy0 * xf.z);
      x1 = Math.max(x1, xf.ox + wx1 * xf.z); y1 = Math.max(y1, xf.oy + wy1 * xf.z);
    };
    let [px, py] = groundXY(pS.x, pS.z);
    add(px - 230, py - 420, px + 230, py + 40);
    [px, py] = groundXY(gS.x, gS.z);
    add(px - 120, py - 300 - gS.jump, px + 120, py + 40);
    if (!pt.held) { [px, py] = groundXY(pt.x, pt.z); add(px - 70, py - 110, px + 70, py + 20); }
    if (G) for (const v of G) { const [cx, cy] = CL.proj(v[0], v[1], v[2]); add(cx - 12, cy - 12, cx + 12, cy + 12); }
    for (const b of bees(t)) { const [bx, by] = groundXY(b.x, b.z, -b.y); add(bx - 20, by - 20, bx + 20, by + 20); }
    for (const it of A.L.groundFront) {
      if ((it.until && t > it.until) || (it.from && t < it.from)) continue;
      add(it.x - it.s.w * it.sc * 0.6, it.y - it.s.h * it.sc * 1.1, it.x + it.s.w * it.sc * 0.6, it.y + 30);
    }
    const pad = 24;
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
    x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  function drawForeground(ctx, cam, t) {
    const xf = layerXf(cam, 1.35);
    ctx.save();
    ctx.setTransform(xf.z, 0, 0, xf.z, xf.ox, xf.oy);
    drawLayer(ctx, A.L.fg, xf, t, 1.35, 600);
    ctx.restore();
    // live swaying grass blades along the very bottom edge
    const w = wind(t);
    ctx.save();
    ctx.lineCap = 'round';
    const R = rng(55);
    const off = ((cam.x * 1.5) % 2400 + 2400) % 2400;
    for (let i = 0; i < 90; i++) {
      const bx = ((i * 41.3 + R() * 30 - off) % 2400 + 2400) % 2400 - 240;
      const h = 60 + R() * 110;
      const bend = (0.15 + w * 0.9) * h * 0.5 + Math.sin(t * (2 + R() * 2) + i) * (6 + w * 18);
      ctx.strokeStyle = rgba(i % 3 ? PAL.mossDeep : PAL.ink, 0.75);
      ctx.lineWidth = 2.2 + R() * 1.6;
      ctx.beginPath();
      ctx.moveTo(bx, H + 10);
      ctx.quadraticCurveTo(bx + bend * 0.2, H - h * 0.55, bx + bend, H - h);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* dappled light: warm patches drifting over the scene (screen space) */
  function dapple(ctx, t, cam) {
    const strength = 0.55 + 0.35 * seg(t, 27, 29) * (1 - seg(t, 37, 40)) + 0.2 * seg(t, 40, 44);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const R = rng(909);
    for (let i = 0; i < 9; i++) {
      const x = ((R() * W * 1.6 - cam.x * 0.9 * (0.6 + R() * 0.4) + noise1(t * 0.15 + i) * 120) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
      const y = 250 + R() * 700 + noise1(t * 0.2 + i * 3) * 60;
      const r = 160 + R() * 260;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const warm = i % 3 !== 0;
      g.addColorStop(0, warm ? `rgba(255,236,190,${0.55 * strength})` : `rgba(70,60,30,${0.35 * strength})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function sunRays(ctx, t, amt) {
    if (amt <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 6; i++) {
      const x0 = 250 + i * 190 + Math.sin(t * 0.3 + i) * 30;
      const w = 70 + (i % 3) * 50;
      const g = ctx.createLinearGradient(x0, 0, x0 + 500, H);
      g.addColorStop(0, `rgba(255,226,160,${0.16 * amt})`);
      g.addColorStop(1, 'rgba(255,226,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, -20);
      ctx.lineTo(x0 + w, -20);
      ctx.lineTo(x0 + w + 560, H + 20);
      ctx.lineTo(x0 + 560 - w * 0.4, H + 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScene(ctx, t) {
    const cam = camera(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // sky moves hardly at all
    const P = PROF, now = () => (PROF.flush && ctx.getImageData(0, 0, 1, 1), performance.now());
    let q = now();
    ctx.drawImage(SKY, -((cam.x * 0.02) % 40) - 20, -cam.y * 0.03 - 16, W + 40, H + 30);
    const gxf = drawBands(ctx, cam, t);
    P.bands = now() - q; q = now();
    drawGround(ctx, gxf, t);
    P.ground = now() - q; q = now();
    if (!LITE) sunPool(ctx, gxf, t);
    drawActors(ctx, gxf, t);
    P.actors = now() - q; q = now();
    drawForeground(ctx, cam, t);
    P.fg = now() - q; q = now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawLeaves(ctx, t, cam);
    if (!LITE) dapple(ctx, t, cam);
    P.fx = now() - q;
    sunRays(ctx, t, seg(t, 39.5, 42) * (t < T.cut2 ? 1.25 : 0.7) + seg(t, 52, 56) * 0.5);
    // painterly light: warm from the upper left, a soft sepia shade gathering low on the right
    const L1 = (0.5 + 0.25 * seg(t, 39.5, 43)) * (LITE ? 0 : 1);
    ctx.globalCompositeOperation = 'soft-light';
    let lg = ctx.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, `rgba(255,236,196,${0.55 * L1})`);
    lg.addColorStop(0.55, 'rgba(255,236,196,0)');
    lg.addColorStop(1, `rgba(70,50,30,${0.45 * L1})`);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    // time of day: warmer and softer towards the end
    const warm = 0.1 + 0.3 * seg(t, 44, 58);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(255,222,172,${warm})`;
    ctx.fillRect(0, 0, W, H);
    // low afternoon sun glowing in from the upper left of the clearing
    const glow = 0.18 * seg(t, 39.5, 43) + 0.22 * seg(t, 50, 57);
    if (glow > 0) {
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(W * 0.28, -H * 0.1, 0, W * 0.28, -H * 0.1, H * 1.25);
      g.addColorStop(0, `rgba(255,214,150,${glow})`);
      g.addColorStop(0.5, `rgba(255,214,150,${glow * 0.35})`);
      g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ================================================================ title and end pages */

  function inkText(ctx, text, x, y, font, reveal, color = PAL.ink, align = 'center') {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const w = m.width;
    const left = align === 'center' ? x - w / 2 : x;
    // soft left-to-right reveal, as though the ink were just drying
    const g = ctx.createLinearGradient(left - 40, 0, left + w + 40, 0);
    const r = clamp(reveal, 0, 1);
    g.addColorStop(0, color);
    g.addColorStop(clamp(r * 1.05), color);
    g.addColorStop(clamp(r * 1.05 + 0.08), 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r >= 1 ? color : g;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawTitlePage(ctx, t, poster = false) {
    ctx.drawImage(TITLE, 0, 0);
    // three bees looping over a dotted flight path
    ctx.save();
    ctx.translate(960, 250);
    ctx.strokeStyle = rgba(PAL.ink, 0.55);
    ctx.setLineDash([2, 7]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const x = lerp(-230, 230, u), y = Math.sin(u * TAU * 1.5) * 26 - Math.sin(u * Math.PI) * 20;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.12 + i * 0.3) % 1);
      const x = lerp(-230, 230, u), y = Math.sin(u * TAU * 1.5) * 26 - Math.sin(u * Math.PI) * 20;
      ctx.save();
      ctx.translate(x, y - 6);
      ctx.scale(2.2, 2.2);
      drawBee(ctx, { t, seed: i });
      ctx.restore();
    }
    ctx.restore();
    inkText(ctx, 'The Windy Picnic', 960, 470, '118px "IM Fell English", Georgia, serif', seg(t, 0.2, 1.6, ease.linear));
    // ornament rule
    const k = seg(t, 1.0, 2.0);
    ctx.save();
    ctx.globalAlpha = k;
    ink.line(ctx, [[960 - 190 * k, 520], [960, 516], [960 + 190 * k, 520]], { w: 1.6, seed: 3, taper: [0.3, 0.3] });
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.ellipse(960, 518, 6, 4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    inkText(ctx, 'In which Pooh plans a picnic,', 960, 612, 'italic 50px "IM Fell English", Georgia, serif', seg(t, 1.1, 2.4, ease.linear), PAL.inkSoft);
    inkText(ctx, 'and the wind comes too', 960, 676, 'italic 50px "IM Fell English", Georgia, serif', seg(t, 2.2, 3.4, ease.linear), PAL.inkSoft);
    // a little honey pot vignette
    if (poster) return;
    ctx.save();
    ctx.globalAlpha = seg(t, 1.8, 2.8);
    ctx.translate(960, 850);
    ctx.scale(1.25, 1.25);
    drawPot(ctx, {});
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = seg(t, 2.2, 3.0);
    drawLeaf(ctx, 1030, 790 + Math.sin(t * 1.5) * 4, 0.6 + Math.sin(t) * 0.1, 1, 1.8, 0);
    ctx.restore();
  }

  /** Page turn: the title page folds away from the right, revealing the scene beneath. */
  function drawPageTurn(ctx, t, pageCanvas) {
    const u = seg(t, T.pageTurn[0], T.pageTurn[1], ease.inOutSine);
    if (u >= 1) return;
    // fold line: moves right → left, tilted
    const fx = lerp(W + 60, -W * 0.55, u);
    const tilt = 0.22;
    const topX = fx + H * tilt * 0.5, botX = fx - H * tilt * 0.5;
    ctx.save();
    // remaining flat part of the page (left of the fold)
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(topX, -10);
    ctx.lineTo(botX, H + 10);
    ctx.lineTo(-10, H + 10);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.drawImage(pageCanvas, 0, 0);
    // shading near the fold
    const gs = ctx.createLinearGradient(fx - 160, 0, fx, 0);
    gs.addColorStop(0, 'rgba(90,60,30,0)');
    gs.addColorStop(1, 'rgba(90,60,30,0.18)');
    ctx.fillStyle = gs;
    ctx.fillRect(fx - 300, 0, 400, H);
    ctx.restore();
    // the lifted flap: mirror of the turned part, showing the plain back of the page
    const flapW = (W + 60 - fx) * 0.55;
    ctx.beginPath();
    ctx.moveTo(topX, -10);
    ctx.lineTo(topX - flapW - 30, -10);
    ctx.quadraticCurveTo(fx - flapW - 70, H / 2, botX - flapW + 20, H + 10);
    ctx.lineTo(botX, H + 10);
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(40,25,10,0.35)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = -18;
    ctx.fillStyle = PAL.paperLight;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(PAPER, 0, 0);
    const gf = ctx.createLinearGradient(fx - flapW, 0, fx, 0);
    gf.addColorStop(0, 'rgba(120,90,50,0.22)');
    gf.addColorStop(0.7, 'rgba(255,250,235,0.1)');
    gf.addColorStop(1, 'rgba(120,90,50,0.25)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = gf;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // shadow the flap casts onto the revealed scene
    const gsh = ctx.createLinearGradient(fx, 0, fx + 140, 0);
    gsh.addColorStop(0, 'rgba(40,25,10,0.3)');
    gsh.addColorStop(1, 'rgba(40,25,10,0)');
    ctx.beginPath();
    ctx.moveTo(topX, -10);
    ctx.lineTo(topX + 200, -10);
    ctx.lineTo(botX + 200, H + 10);
    ctx.lineTo(botX, H + 10);
    ctx.closePath();
    ctx.fillStyle = gsh;
    ctx.fill();
    ctx.restore();
  }

  function drawEndPage(ctx, t) {
    const k = seg(t, T.plate[0], T.plate[1], ease.inOutCubic);
    // page behind the plate
    ctx.drawImage(PAPER, 0, 0);
    // starts exactly full frame, so the first frame of the plate is the scene itself
    const pw = lerp(W, W * 0.64, k), ph = lerp(H, H * 0.64, k);
    const cx = W / 2, cy = lerp(H / 2, 470, k);
    // the scene, printed as a plate on the page with soft deckled edges (the edges fade in)
    const plate = ACT.getContext('2d');
    plate.setTransform(1, 0, 0, 1, 0, 0);
    plate.globalCompositeOperation = 'source-over';
    plate.clearRect(0, 0, W, H);
    plate.drawImage(SCENE, cx - pw / 2, cy - ph / 2, pw, ph);
    plate.globalCompositeOperation = 'destination-in';
    plate.drawImage(PLATE_MASK, cx - pw / 2, cy - ph / 2, pw, ph);
    plate.globalCompositeOperation = 'source-over';
    ctx.drawImage(ACT, 0, 0);
    const edge = 1 - seg(t, T.plate[0], T.plate[0] + 0.5);
    if (edge > 0) {
      ctx.globalAlpha = edge;
      ctx.drawImage(SCENE, cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.globalAlpha = 1;
    }
    inkText(ctx, 'The End', 960, 918, 'italic 76px "IM Fell English", Georgia, serif', seg(t, 57.5, 58.6, ease.linear));
    ctx.save();
    ctx.globalAlpha = seg(t, 58.4, 59.3) * 0.85;
    inkText(ctx, 'after Winnie-the-Pooh by A. A. Milne, with decorations by E. H. Shepard (1926)', 960, 978, '26px "IM Fell English", Georgia, serif', 1, PAL.inkSoft);
    ctx.restore();
  }

  /* ================================================================ subtitles */

  /*
   * Subtitles as a caption slip pasted into the storybook: a deckled paper strip with a
   * thin inner rule and leaf ornaments that unrolls from the middle. Each word inks in
   * as it is spoken (unread words wait in pale sepia, so you can still read ahead).
   * Characters' words are set in italic and coloured — honey-brown for Pooh, moss for
   * Piglet — with a tiny drawing of whoever is speaking at the start of the slip.
   * Cue format: { start, end, lines: [[{ w, t, sp }]] }, sp = 'n' | 'pooh' | 'piglet'.
   */
  const SUB = {
    size: 44, lh: 56, padX: 58, padY: 17, bottom: 56,
    ink: { n: '#2b2118', pooh: '#83531f', piglet: '#4f5e2c' },
    pale: 'rgba(122, 90, 58, 0.52)',
  };
  const subFont = (sp) => (sp === 'n' ? `500 ${SUB.size}px "EB Garamond", Georgia, serif` : `italic 500 ${SUB.size + 1}px "EB Garamond", Georgia, serif`);
  const SUB_LAYOUT = new Map();

  function layoutCue(ctx, cue) {
    if (SUB_LAYOUT.has(cue)) return SUB_LAYOUT.get(cue);
    const space = (() => { ctx.font = subFont('n'); return ctx.measureText(' ').width; })();
    const lines = cue.lines.map((words) => {
      let x = 0;
      const placed = words.map((wd, i) => {
        ctx.font = subFont(wd.sp);
        const ww = ctx.measureText(wd.w).width;
        const g = { ...wd, x, ww };
        x += ww + (i < words.length - 1 ? space : 0);
        return g;
      });
      return { words: placed, width: x };
    });
    const first = cue.lines[0][0];
    const icon = first && first.sp !== 'n' ? first.sp : null;
    const inner = Math.max(...lines.map((l) => l.width)) + (icon ? 62 : 0);
    const L = { lines, icon, w: inner + SUB.padX * 2, h: lines.length * SUB.lh + SUB.padY * 2 };
    // deckled outline of the slip, seeded by the cue so it never shimmers
    const R = rng(Math.floor(cue.start * 1000) + 7);
    const pts = [];
    const n = 36;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const per = 2 * (L.w + L.h);
      let d = u * per, x, y;
      if (d < L.w) { x = d; y = 0; }
      else if ((d -= L.w) < L.h) { x = L.w; y = d; }
      else if ((d -= L.h) < L.w) { x = L.w - d; y = L.h; }
      else { d -= L.w; x = 0; y = L.h - d; }
      pts.push([x - L.w / 2 + (R() - 0.5) * 3.2, y - L.h / 2 + (R() - 0.5) * 3.2]);
    }
    L.path = WP.pathFrom(pts);
    L.tilt = (R() - 0.5) * 0.008;
    SUB_LAYOUT.set(cue, L);
    return L;
  }

  function subIcon(ctx, sp, x, y) {
    // a thumbnail head in the book's manner: Pooh's round head and ears, or Piglet's pointed ears and snout
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = SUB.ink[sp];
    ctx.fillStyle = '#fbf6ea';
    ctx.lineJoin = 'round';
    if (sp === 'pooh') {
      for (const ex of [-11, 10]) { ctx.beginPath(); ctx.arc(ex, -12, 6, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 14, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(11, 3, 7, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = SUB.ink[sp];
      ctx.beginPath(); ctx.ellipse(17, 1.5, 2.6, 2.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -3, 1.6, 0, TAU); ctx.fill();
    } else {
      const ear = (dx, r) => { ctx.save(); ctx.translate(dx, -10); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(-5, -9, 0, -15); ctx.quadraticCurveTo(5, -9, 5, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); };
      ear(-8, -0.9); ear(5, 0.1);
      ctx.beginPath(); ctx.ellipse(0, 0, 12.5, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(12, 2, 6.5, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = SUB.ink[sp];
      ctx.beginPath(); ctx.arc(4, -1, 1.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(18, 2, 0.9, 2.2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function subLeaf(ctx, x, y, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.strokeStyle = 'rgba(122, 90, 58, 0.75)';
    ctx.fillStyle = 'rgba(125, 138, 78, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(9, -1, 16, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -1); ctx.quadraticCurveTo(10, -9, 17, -9); ctx.quadraticCurveTo(13, -2, 6, -1); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, -2); ctx.quadraticCurveTo(14, 4, 20, 3); ctx.quadraticCurveTo(15, -2, 9, -2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawSubtitles(ctx, t, cues, lift = 0) {
    if (!cues) return;
    const cue = cues.find((c) => t >= c.start && t <= c.end);
    if (!cue || !cue.lines) return;
    const L = layoutCue(ctx, cue);
    const open = ease.outCubic(seg(t, cue.start, cue.start + 0.32, ease.linear));
    const out = seg(t, cue.end - 0.28, cue.end);
    ctx.save();
    ctx.translate(W / 2, H - SUB.bottom - L.h / 2 - out * 6 - lift);
    ctx.rotate(L.tilt);
    ctx.globalAlpha = 1 - out;
    // unroll from the middle
    ctx.beginPath();
    ctx.rect((-L.w / 2 - 8) * open, -L.h / 2 - 12, (L.w + 16) * open, L.h + 24);
    ctx.clip();
    ctx.save();
    ctx.shadowColor = 'rgba(40, 25, 10, 0.28)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(249, 243, 228, 0.95)';
    ctx.fill(L.path);
    ctx.restore();
    const gr = ctx.createLinearGradient(0, -L.h / 2, 0, L.h / 2);
    gr.addColorStop(0, 'rgba(255, 252, 242, 0.5)');
    gr.addColorStop(1, 'rgba(226, 211, 179, 0.35)');
    ctx.fillStyle = gr;
    ctx.fill(L.path);
    // a printer's rule inside the edge, and leaves at each end
    ctx.strokeStyle = 'rgba(122, 90, 58, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-L.w / 2 + 9, -L.h / 2 + 8, L.w - 18, L.h - 16);
    subLeaf(ctx, -L.w / 2 + 14, 4, 1);
    subLeaf(ctx, L.w / 2 - 14, 4, -1);
    // words
    const textLeft = -L.w / 2 + SUB.padX + (L.icon ? 62 : 0);
    if (L.icon) subIcon(ctx, L.icon, -L.w / 2 + SUB.padX + 22, 2);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    L.lines.forEach((line, li) => {
      const x0 = textLeft + (L.w - SUB.padX * 2 - (L.icon ? 62 : 0) - line.width) / 2;
      const y = -L.h / 2 + SUB.padY + SUB.lh * (li + 0.5) + 1;
      for (const wd of line.words) {
        const k = wd.t == null ? 1 : ease.outQuad(seg(t, wd.t - 0.06, wd.t + 0.16, ease.linear));
        ctx.font = subFont(wd.sp);
        if (k < 1) {
          ctx.fillStyle = SUB.pale;
          ctx.fillText(wd.w, x0 + wd.x, y);
        }
        if (k > 0) {
          ctx.globalAlpha = (1 - out) * k;
          ctx.fillStyle = SUB.ink[wd.sp] || SUB.ink.n;
          ctx.fillText(wd.w, x0 + wd.x, y);
          ctx.globalAlpha = 1 - out;
        }
      }
    });
    ctx.restore();
  }

  /* ================================================================ compose */

  function render(ctx, t, opts = {}) {
    t = clamp(t, 0, DUR);
    // lite: a lighter render for machines without accelerated canvas (a few blend passes skipped)
    LITE = !!opts.lite;
    const sctx = SCENE.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (t < T.pageTurn[0]) {
      drawTitlePage(ctx, t, opts.poster);
    } else {
      drawScene(sctx, t);
      if (t < T.plate[0]) ctx.drawImage(SCENE, 0, 0);
      else drawEndPage(ctx, t);
      // a soft dissolve into the picnic, from the moment just before the cut (everyone is still)
      if (t >= T.cut2 && t < T.cut2 + DISSOLVE) {
        drawScene(sctx, T.cut2 - 0.001);
        ctx.globalAlpha = 1 - ease.inOutSine((t - T.cut2) / DISSOLVE);
        ctx.drawImage(SCENE, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (t < T.pageTurn[1]) {
        const pg = makeTitleSnapshot(t);
        drawPageTurn(ctx, t, pg);
      }
    }
    // one sheet of paper under everything
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(GRAIN, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // fade in from the blank page at the very start
    if (t < 0.25) {
      ctx.fillStyle = `rgba(242,232,210,${1 - t / 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (opts.subtitles !== false) drawSubtitles(ctx, t, opts.cues, opts.subLift || 0);
  }

  const PROF = {};
  const DISSOLVE = 0.7;
  let LITE = false;
  let SNAP = null;
  function makeTitleSnapshot(t) {
    if (!SNAP) SNAP = makeCanvas(W, H);
    const g = SNAP.getContext('2d');
    drawTitlePage(g, t);
    return SNAP;
  }

  /* ================================================================ sound cues (for the soundtrack builder) */

  function soundEvents() {
    const ev = [];
    const steps = (who, fnPhase, t0, t1, stride) => {
      let prev = null;
      for (let t = t0; t < t1; t += 0.002) {
        const ph = fnPhase(t);
        if (prev !== null) {
          for (const c of [0.25, 0.75]) {
            const a = prev - Math.floor(prev), b = ph - Math.floor(ph);
            if ((a < c && b >= c) || (Math.floor(ph) > Math.floor(prev) && c < b)) {
              if (Math.floor(ph) > Math.floor(prev) && !(a < c) && !(c < b)) continue;
              ev.push({ t: +t.toFixed(3), type: 'step', who });
            }
          }
        }
        prev = ph;
      }
    };
    steps('pooh', (t) => (poohX(t) - POOH_MEADOW) / POOH_STRIDE + 0.1, RUN0 + 0.15, 33.95, POOH_STRIDE);
    steps('piglet', (t) => (pigletX(t) - 470) / PIG_RUN, 26.95, 33.95, PIG_RUN);
    steps('piglet', (t) => (578 - pigletX(t)) / 60, T.pigletOut + 0.1, T.pigletStop, 60);
    steps('pooh', (t) => (poohX(t) - poohX(POOH_WALK)) / 115, POOH_WALK + 0.2, 42.6, 115);
    steps('pooh', (t) => (poohX(t) - POOH_HOME) / 160, STEP[0] + 0.1, STEP[1] - 0.05, 160);
    steps('piglet', (t) => (pigletX(t) - pigletX(T.walk + 0.15)) / PIG_WALK, T.walk + 0.3, 42.7, PIG_WALK);
    ev.sort((a, b) => a.t - b.t);
    // wind strength, bee positions on screen and the cloth's screen position (20 Hz) for panning
    const wind100 = [], beesOnScreen = [], clothOnScreen = [];
    for (let i = 0; i <= DUR * 100; i++) wind100.push(+wind(i / 100).toFixed(4));
    for (let i = 0; i <= DUR * 20; i++) {
      const t = i / 20;
      const xf = layerXf(camera(t), 1);
      beesOnScreen.push(bees(t).map((b) => {
        const [bx, by] = groundXY(b.x, b.z, -b.y);
        return [+((xf.ox + bx * xf.z) / W).toFixed(3), +((xf.oy + by * xf.z) / H).toFixed(3), +xf.z.toFixed(3)];
      }));
      const G = t >= 7.35 ? CL.state(t) : null;
      if (G) {
        const c = G[Math.floor(G.length / 2)];
        const [cx, cy] = CL.proj(c[0], c[1], c[2]);
        clothOnScreen.push([+((xf.ox + cx * xf.z) / W).toFixed(3), +((xf.oy + cy * xf.z) / H).toFixed(3), +c[1].toFixed(1)]);
      } else clothOnScreen.push(null);
    }
    // the pot's hand-offs: the moment paw and pot meet
    const pot = POT_EVENTS.map((e) => ({ kind: e.kind, t: e.tc }));
    return { T, events: ev, pot, wind100, beesOnScreen, clothOnScreen };
  }

  /** The pot's base in world space at time t, however it is being carried (for checks). */
  function potWorld(t) {
    const pS = pooh(t), m = potMatrix(pot(t, pS), pS);
    return [m.e, m.f];
  }
  /** Pooh's near paw in world space (for checks). */
  function poohPawWorld(t) {
    const pS = pooh(t), [lx, ly] = poohPaw(pS.pose), [px, py] = groundXY(pS.x, pS.z), sc = poohScale(pS);
    return [px + lx * sc * pS.facing, py + ly * sc];
  }

  WP.film = { PROF, init, render, camera, wind, pooh, piglet, pot, potWorld, poohPawWorld, POT_EVENTS, soundEvents, T, DUR, W, H };
})();
