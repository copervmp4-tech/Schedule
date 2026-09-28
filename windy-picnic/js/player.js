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
  };

  const state = { ready: false, started: false, playing: false, captions: true, muted: false, lastCaption: '' };

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
      let now = this.ctx.currentTime - this.latency();
      if (this.ctx.getOutputTimestamp) {
        const ts = this.ctx.getOutputTimestamp();
        if (ts.contextTime > 0 && ts.performanceTime > 0) now = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
      const t = Math.max(0, now - this.startAt);
      if (t < this.lastT && this.lastT - t < 0.05) return this.lastT;
      this.lastT = t;
      return t;
    },

    async play(from) {
      this.offset = Math.max(0, Math.min(DUR, from));
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
    WP.film.render(ctx, Math.min(t, DUR), { cues: CUES, subtitles: state.captions, lite: perf.lite });
    if (state.playing && !perf.lite) {
      const ms = performance.now() - t0;
      perf.avg = perf.avg ? perf.avg * 0.9 + ms * 0.1 : ms;
      perf.slow = perf.avg > 30 ? perf.slow + 1 : 0;
      if (perf.slow > 45) {
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
    if (document.activeElement === ui.begin || document.activeElement === ui.replayBig) ui.play.focus({ preventScroll: true });
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
    if (!state.playing) draw(Sound.time());
  }
  function toggleMute() {
    state.muted = !state.muted;
    Sound.setMuted(state.muted);
    ui.mute.classList.toggle('muted', state.muted);
    ui.mute.setAttribute('aria-pressed', String(state.muted));
    ui.mute.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
  }
  function toggleFull() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (ui.stage.requestFullscreen || ui.stage.webkitRequestFullscreen).call(ui.stage);
  }

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
  window.PLAYER = { state, perf, Sound, play, pause, replay, seek };
})();
