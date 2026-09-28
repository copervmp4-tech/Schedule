/* The Windy Picnic — player: loading, sound, clock, controls.

   The soundtrack (narration, score, effects and ambience, pre-mixed) is the
   master clock: the picture is drawn for whatever moment the listener is
   hearing, so pausing, seeking and replaying always keep sound and picture
   together. If sound can't start, a silent wall clock keeps the film going. */
(function () {
  const WP = window.WP;
  const $ = (id) => document.getElementById(id);
  const canvas = $('film');
  const ctx = canvas.getContext('2d');
  const DUR = WP.film.DUR;
  const CUES = (window.CUES && window.CUES.subtitles) || [];

  const ui = {
    cover: $('cover'), begin: $('begin'), beginLabel: $('beginLabel'), coverNote: $('coverNote'),
    loading: $('loading'), bar: $('loadingBar'), replayCard: $('replayCard'), replayBig: $('replayBig'),
    play: $('playPause'), replay: $('replay'), scrub: $('scrub'), fill: $('scrubFill'), time: $('time'),
    cc: $('cc'), mute: $('mute'), full: $('full'), live: $('captionLive'), stage: $('stage'),
    room: $('room'), controls: $('controls'), captions: $('captions'),
  };

  const state = { ready: false, started: false, playing: false, captions: true, muted: false, lastCaption: '', narrow: false, immersive: false, pseudoFull: false, subLift: 0 };
  const touch = matchMedia('(pointer: coarse)').matches;

  /* ------------------------------------------------------------ sound */

  const Sound = {
    ctx: null, buffer: null, src: null, gain: null, startAt: 0, offset: 0, failed: false, lastT: 0,
    wallStart: 0, // fallback clock when there is no audio

    async load() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio unavailable');
      this.ctx = new AC({ latencyHint: 'playback' });
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      const bytes = await fetchSoundtrack();
      this.buffer = await new Promise((res, rej) => {
        const p = this.ctx.decodeAudioData(bytes, res, rej);
        if (p && p.then) p.then(res, rej);
      });
    },

    latency() {
      if (!this.ctx) return 0;
      return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) * 0.5;
    },

    time() {
      if (this.failed || !this.buffer) {
        return state.playing ? this.offset + (performance.now() - this.wallStart) / 1000 : this.offset;
      }
      if (!state.playing) return this.offset;
      // The audio clock ticks in blocks (every 3–20 ms depending on the browser), which makes
      // motion judder if used raw. getOutputTimestamp pairs it with the page clock, so we can
      // read the audio position at this exact moment, then keep it from ever stepping back.
      const base = this.ctx.currentTime - this.latency();
      let now = base;
      if (this.ctx.getOutputTimestamp) {
        const ts = this.ctx.getOutputTimestamp();
        // a stale timestamp (the output device paused or changed: headphones, full screen,
        // a phone call) would throw the picture far ahead; only use it while it agrees
        const est = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
        if (ts.contextTime > 0 && ts.performanceTime > 0 && Math.abs(est - base) < 0.25) now = est;
      }
      const t = Math.max(0, now - this.startAt);
      if (t < this.lastT && this.lastT - t < 0.05) return this.lastT;
      this.lastT = t;
      return t;
    },

    async play(from) {
      this.offset = Math.max(0, Math.min(DUR, from));
      // iPhone: let the film be heard even with the ring/silent switch on (Safari 17+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
      if (this.failed || !this.buffer) {
        this.wallStart = performance.now();
        return;
      }
      try {
        if (this.ctx.state !== 'running') await this.ctx.resume();
      } catch (e) { /* fall through to the silent clock */ }
      this.stopSource();
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.gain);
      const when = this.ctx.currentTime + 0.03;
      src.start(when, this.offset);
      this.startAt = when - this.offset;
      this.lastT = 0;
      this.src = src;
    },

    pause() {
      this.offset = this.time();
      this.stopSource();
    },

    stopSource() {
      if (this.src) {
        try { this.src.stop(); } catch (e) { /* already stopped */ }
        this.src.disconnect();
        this.src = null;
      }
    },

    setMuted(m) {
      if (this.gain) this.gain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    },
  };

  async function fetchSoundtrack() {
    // served over http(s): fetch the MP3; opened from disk: use the base64 copy
    if (location.protocol !== 'file:') {
      try {
        const r = await fetch('assets/audio/soundtrack.mp3');
        if (r.ok) return await r.arrayBuffer();
      } catch (e) { /* try the embedded copy */ }
    }
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'assets/audio/soundtrack.js';
      s.onload = res;
      s.onerror = () => rej(new Error('soundtrack missing'));
      document.head.appendChild(s);
    });
    const bin = atob(window.SOUNDTRACK_MP3);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    window.SOUNDTRACK_MP3 = null;
    return u8.buffer;
  }

  /* ------------------------------------------------------------ drawing */

  let raf = 0;
  function frame() {
    raf = 0;
    const t = Sound.time();
    draw(t);
    if (state.playing) {
      if (t >= DUR) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }
  }

  // If frames are slow (no accelerated canvas), switch to the lighter render after a short while.
  const perf = { avg: 0, slow: 0, lite: false };
  function draw(t) {
    const t0 = performance.now();
    // subtitles go in the picture, unless the picture is too small to read them there
    // with the controls floating over the picture, lift the subtitles clear of them
    const lift = state.immersive && !ui.room.classList.contains('idle') ? 1 : 0;
    state.subLift += (lift - state.subLift) * (state.playing ? 0.18 : 1);
    WP.film.render(ctx, Math.min(t, DUR), { cues: CUES, subtitles: state.captions && !state.narrow, lite: perf.lite, subLift: state.subLift * 120 });
    if (state.narrow) htmlCaptions(t);
    if (state.playing && !perf.lite) {
      const ms = performance.now() - t0;
      perf.avg = perf.avg ? perf.avg * 0.9 + ms * 0.1 : ms;
      perf.slow = perf.avg > 30 ? perf.slow + 1 : 0;
      if (perf.slow > (WP.lowMem ? 20 : 45)) {
        perf.lite = true;
        console.info('The Windy Picnic: switching to the lighter render for smoother playback.');
      }
    }
    const p = Math.min(1, t / DUR);
    ui.fill.style.width = p * 100 + '%';
    ui.scrub.setAttribute('aria-valuenow', t.toFixed(1));
    ui.time.textContent = `${fmt(t)} / ${fmt(DUR)}`;
    // mirror subtitles for screen readers
    const cue = CUES.find((c) => t >= c.start && t <= c.end);
    const text = cue ? cue.text.replace(/\n/g, ' ') : '';
    if (text !== state.lastCaption) {
      state.lastCaption = text;
      if (text && state.captions) ui.live.textContent = text;
    }
  }

  // The subtitles set as text below the film (phone held upright): the words ink in as they
  // are spoken, characters' words in italic and in their colours, as in the picture.
  const capState = { cue: null, spans: [] };
  function htmlCaptions(t) {
    const cue = state.captions ? CUES.find((c) => t >= c.start && t <= c.end) : null;
    if (cue !== capState.cue) {
      capState.cue = cue;
      capState.spans = [];
      ui.captions.textContent = '';
      if (cue && cue.lines) {
        for (const words of cue.lines) {
          const line = document.createElement('div');
          line.className = 'line';
          words.forEach((w, i) => {
            const sp = document.createElement('span');
            sp.className = 'w ' + (w.sp === 'n' ? 'n' : w.sp);
            sp.textContent = w.w;
            line.appendChild(sp);
            if (i < words.length - 1) line.appendChild(document.createTextNode(' '));
            capState.spans.push([sp, w.t]);
          });
          ui.captions.appendChild(line);
        }
      }
    }
    for (const [sp, wt] of capState.spans) sp.classList.toggle('said', t >= wt - 0.02);
  }

  function fmt(t) {
    const s = Math.max(0, Math.min(DUR, Math.floor(t + 0.0001)));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------ transport */

  async function play(from) {
    if (!state.ready) return;
    state.started = true;
    ui.cover.classList.add('gone');
    ui.replayCard.hidden = true;
    // keep keyboard focus on a visible control (the cover's button is going away)
    if (!touch && (document.activeElement === ui.begin || document.activeElement === ui.replayBig)) ui.play.focus({ preventScroll: true });
    if (from == null) from = Sound.time() >= DUR - 0.05 ? 0 : Sound.time();
    await Sound.play(from);
    state.playing = true;
    setPlayingUI();
    kick();
  }

  function pause() {
    if (!state.playing) return;
    Sound.pause();
    state.playing = false;
    setPlayingUI();
    draw(Sound.offset);
  }

  function replay() {
    Sound.stopSource();
    state.playing = false;
    play(0);
  }

  function finish() {
    Sound.stopSource();
    Sound.offset = DUR;
    state.playing = false;
    setPlayingUI();
    draw(DUR);
    ui.replayCard.hidden = false;
  }

  function seek(t) {
    t = Math.max(0, Math.min(DUR, t));
    ui.replayCard.hidden = t < DUR - 0.05 || state.playing;
    if (state.playing) {
      Sound.play(t);
    } else {
      Sound.offset = t;
      draw(t);
    }
  }

  function setPlayingUI() {
    ui.play.classList.toggle('playing', state.playing);
    ui.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    wake();
  }

  /* ------------------------------------------------------------ controls */

  ui.begin.addEventListener('click', () => play(0));
  ui.replayBig.addEventListener('click', replay);
  ui.play.addEventListener('click', () => (state.playing ? pause() : play()));
  ui.replay.addEventListener('click', replay);
  ui.cc.addEventListener('click', toggleCaptions);
  ui.mute.addEventListener('click', toggleMute);
  ui.full.addEventListener('click', toggleFull);

  function toggleCaptions() {
    state.captions = !state.captions;
    ui.cc.classList.toggle('on', state.captions);
    ui.cc.setAttribute('aria-pressed', String(state.captions));
    ui.room.classList.toggle('show-captions', state.captions);
    if (!state.playing) draw(Sound.time());
  }
  function toggleMute() {
    state.muted = !state.muted;
    Sound.setMuted(state.muted);
    ui.mute.classList.toggle('muted', state.muted);
    ui.mute.setAttribute('aria-pressed', String(state.muted));
    ui.mute.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
  }
  // Full screen takes the film and its controls together. Where a page may not go full
  // screen (iPhone Safari), the page covers the screen itself instead.
  function toggleFull() {
    const d = document, el = ui.room;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    if (state.pseudoFull) {
      state.pseudoFull = false;
      layout();
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const pseudo = () => { state.pseudoFull = true; layout(); };
    if (!req) return pseudo();
    try {
      Promise.resolve(req.call(el)).then(() => {
        // phones: turn the picture sideways where the browser lets us
        if (touch && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }, pseudo);
    } catch (e) { pseudo(); }
  }

  /* ------------------------------------------------------------ layout */

  // narrow: the film is too small for subtitles inside it (a phone held upright)
  // immersive: the film fills the screen and the controls float over it
  function layout() {
    const d = document;
    const full = !!(d.fullscreenElement || d.webkitFullscreenElement) || state.pseudoFull;
    const landscapePhone = touch && innerWidth > innerHeight && innerHeight < 560;
    state.immersive = full || landscapePhone;
    ui.room.classList.toggle('immersive', state.immersive);
    ui.room.classList.toggle('pseudo-full', state.pseudoFull);
    ui.room.classList.toggle('portrait', innerHeight > innerWidth);
    // measure after the layout classes apply
    state.narrow = false;
    ui.room.classList.remove('narrow');
    state.narrow = ui.stage.getBoundingClientRect().width < 600;
    ui.room.classList.toggle('narrow', state.narrow);
    ui.room.classList.toggle('show-captions', state.captions);
    ui.full.setAttribute('aria-label', full ? 'Leave full screen' : 'Full screen');
    if (!state.immersive) ui.room.classList.remove('idle');
    else wake();
    if (!state.narrow) { capState.cue = null; ui.captions.textContent = ''; }
    if (state.ready && !state.playing) draw(Sound.time());
  }
  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 200));
  document.addEventListener('fullscreenchange', layout);
  document.addEventListener('webkitfullscreenchange', layout);

  // floating controls fade out after a few seconds of playing untouched
  let idleTimer = 0;
  function wake() {
    ui.room.classList.remove('idle');
    clearTimeout(idleTimer);
    if (state.immersive && state.playing) idleTimer = setTimeout(() => ui.room.classList.add('idle'), 2800);
  }
  const controlsHidden = () => ui.room.classList.contains('idle');
  ui.room.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') wake(); });
  ui.controls.addEventListener('pointerdown', wake);

  // a tap on the picture: on a touch screen with the controls floating, it shows or hides
  // them; otherwise it plays or pauses, as a video would
  ui.stage.addEventListener('click', (e) => {
    if (!state.started || e.target.closest('button')) return;
    if (touch && state.immersive) {
      if (controlsHidden() || !state.playing) wake();
      else { clearTimeout(idleTimer); ui.room.classList.add('idle'); }
      return;
    }
    state.playing ? pause() : play();
    wake();
  });

  // scrubbing
  let dragging = false, wasPlaying = false;
  const posFromEvent = (e) => {
    const r = ui.scrub.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * DUR;
  };
  ui.scrub.addEventListener('pointerdown', (e) => {
    if (!state.ready || !state.started) return;
    dragging = true;
    wasPlaying = state.playing;
    if (state.playing) pause();
    ui.scrub.setPointerCapture(e.pointerId);
    seek(posFromEvent(e));
  });
  ui.scrub.addEventListener('pointermove', (e) => { if (dragging) seek(posFromEvent(e)); });
  ui.scrub.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (wasPlaying) play();
  });
  ui.scrub.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      seek(Sound.time() + (e.key === 'ArrowLeft' ? -5 : 5));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') {
      if (e.target.tagName === 'BUTTON' && k === ' ') return; // let the focused button act
      e.preventDefault();
      if (!state.started) play(0);
      else state.playing ? pause() : play();
    } else if (k === 'r' && state.ready) replay();
    else if (k === 'c') toggleCaptions();
    else if (k === 'm') toggleMute();
    else if (k === 'f') toggleFull();
    else if (k === 'escape' && state.pseudoFull) toggleFull();
    else if ((k === 'arrowleft' || k === 'arrowright') && state.started) seek(Sound.time() + (k === 'arrowleft' ? -5 : 5));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing) pause();
  });

  /* ------------------------------------------------------------ start-up */

  async function boot() {
    const fonts = ['118px "IM Fell English"', 'italic 50px "IM Fell English"', '12px "IM Fell English SC"', '500 46px "EB Garamond"'];
    try {
      await Promise.all(fonts.map((f) => document.fonts.load(f)));
    } catch (e) { /* fall back to Georgia */ }
    const soundP = Sound.load().catch((e) => {
      console.warn('Soundtrack unavailable, playing silently:', e);
      Sound.failed = true;
    });
    const step = (p) => new Promise((res) => {
      ui.bar.style.width = Math.round(p * 90) + '%';
      ui.beginLabel.textContent = `Preparing the pages… ${Math.round(p * 100)}%`;
      requestAnimationFrame(() => setTimeout(res, 0));
    });
    layout();
    await WP.film.init(step);
    // a poster frame: the finished title page
    WP.film.render(ctx, 3.9, { cues: CUES, subtitles: false, poster: true });
    await soundP;
    ui.bar.style.width = '100%';
    ui.loading.classList.add('done');
    state.ready = true;
    ui.begin.disabled = false;
    ui.play.disabled = false;
    ui.replay.disabled = false;
    ui.beginLabel.textContent = 'Begin the story';
    if (Sound.failed) ui.coverNote.textContent = 'Sound could not be loaded — the film will play silently';
    ui.begin.focus({ preventScroll: true });
  }

  boot().catch((e) => {
    console.error(e);
    ui.beginLabel.textContent = 'Sorry — the pages could not be prepared';
  });

  // for automated checks
  window.PLAYER = { state, perf, Sound, play, pause, replay, seek, layout, toggleFull };
})();
