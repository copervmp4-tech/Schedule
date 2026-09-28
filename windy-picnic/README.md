# The Windy Picnic

*In which Pooh plans a picnic, and the wind comes too.*

A one-minute animated short in vanilla JavaScript and Canvas. It's an original story with Winnie-the-Pooh and Piglet as A. A. Milne and E. H. Shepard introduced them in *Winnie-the-Pooh* (1926). It looks like an old illustrated storybook come to life: cream paper, fine pen lines and hatching, paper cut-outs with soft shadows, and restrained washes of sepia, honey and moss.

Pooh lays out a little honey picnic for Piglet. A gust whisks the cloth away. The chase leads over the heather and under the pines to a sunlit clearing, where the two friends share the honey, and an imperfect afternoon turns out perfectly wonderful.

- **Length:** 60 s · 1920 × 1080 (16:9) · narration, original score, sound effects and English subtitles
- **Film file:** [`export/the-windy-picnic.mp4`](export/the-windy-picnic.mp4) (H.264 60 fps + AAC)

## Watch it

**Either** open `index.html` in a current browser (Chrome, Edge, Firefox or Safari). It also works straight from disk, because the soundtrack has a bundled fallback copy.

**Or** serve the folder and open the page:

```sh
cd windy-picnic
python3 -m http.server 8000
# then visit http://localhost:8000/
```

The page takes a few seconds to paint the scenery. Then press **Begin the story**; that first press also switches the sound on.

| Control | Button | Key |
|---|---|---|
| Play / pause | ▶ / ❚❚ | <kbd>Space</kbd> or <kbd>K</kbd> |
| Replay from the start | ↺ (also shown when the film ends) | <kbd>R</kbd> |
| Seek | drag the bar | <kbd>←</kbd> / <kbd>→</kbd> (5 s) |
| Subtitles on / off | CC | <kbd>C</kbd> |
| Mute | speaker | <kbd>M</kbd> |
| Full screen | ⛶ | <kbd>F</kbd> |

Picture and sound stay locked together: the pre-mixed soundtrack is the master clock, and every frame is drawn for exactly the moment you're hearing. That holds through pausing, seeking and replaying.

Subtitles appear on a paper caption slip that unrolls, and each word inks in as it is spoken. Characters' words are in italics, honey-brown for Pooh and moss-green for Piglet, with a tiny drawing of whoever is speaking. They also ship as [`assets/subtitles.vtt`](assets/subtitles.vtt) (with speaker tags) and [`.srt`](assets/subtitles.srt).

## What's in the folder

```
index.html            player page
css/                  page style + bundled font faces
js/util.js            maths, easing, seeded randomness, noise, palette
js/ink.js             pen strokes, hatching, watercolour washes, paper, cut-outs
js/characters.js      Pooh and Piglet rigs (after Shepard, 1926) and motion cycles
js/props.js           the HUNNY pot, bees, leaves
js/world.js           the Forest's scenery sprites (house tree, pines, birches, gorse, heather…)
js/cloth.js           the picnic cloth: a 3-D gingham sheet computed from time
js/film.js            camera, choreography, layers, lighting, title/end pages, subtitles
js/player.js          loading, Web Audio clock, controls
js/cues.js            generated: narration placement, word timings, subtitles
assets/audio/         soundtrack.mp3 (+ soundtrack.js for file://), narration phrases and voice prompts
assets/fonts/         IM Fell English, EB Garamond (OFL)
docs/script.md        the script, shot by shot
docs/storyboard.md    storyboard frames with timings
tools/                how the film was made (narration, cues, score, sound, export)
export/               the MP4
```

## How it was made

1. **Research.** Studied the 1926 illustrations (Project Gutenberg #67098) and measured the characters' proportions from them (each figure cropped to its own height, landmarks read off a grid):
   - **Pooh**, an unclothed teddy bear:
     - ears about 0.12 of his height, set on top of a head that fills the top third
     - one back line running from head to seat, with no neck
     - a short blunt muzzle with the nose at its tip, and a dot of an eye at its root
     - a pear-shaped tummy that leans back over short round legs
     - short thick arms starting just under the jaw
   - **Piglet**:
     - a head about 1.45 times wider than tall, with a round cranium and a short level snout with a flat end
     - the eye at the snout's root
     - big leaf-shaped ears, the far one flopping sideways
     - a barrel of a jumper about half his height, striped almost black
     - thin bare arms and very short legs
   - The HUNNY pots, the *Mr Sanders* door, the heath-and-pine Forest

   The characters were then checked side by side, and as silhouette overlays, against the 1926 figures in matching poses until the proportions lined up.
2. **Script** ([docs/script.md](docs/script.md)). Original story, narration and dialogue, sized for about 35 s of speech in a 60 s film so pictures and pauses carry the rest.
3. **Narration** (`tools/narration_voice_prompts.py`, `tools/narration_chatterbox.py`, `tools/narration_align.py`). A warm British storyteller, with Pooh and Piglet speaking their own lines:
   - Piglet's "For me?" is small and breathless.
   - Pooh's "For us" and "Perhaps… it knows somewhere nicer" are slow and kind.

   It's performed with Chatterbox, an expressive text-to-speech model run locally. The voice timbres come from short synthetic Kokoro clips, so no real person's voice is copied. Every phrase was generated several ways (emotion strength, pacing, seed), about a hundred takes in all. Takes were picked by measurement:
   - exact speech-recognition read-back
   - pitch movement and loudness dynamics
   - sensible pace

   The chosen narrator takes move about 1.3–1.8× more in pitch than the first version's flatter reading (a standard deviation of 2.7–3.9 semitones, against 2.1). Short narrator tags like "asked Piglet." are read inside their whole sentence, for natural intonation, and cut out at the silences. The finished mix transcribes back to the script with 0% word error.
4. **Cue sheet** (`tools/build_cues.py`). Places each phrase on the timeline, anchored to the picture: "Piglet!" lands as he pops up from the grass, "a pot of honey" as Pooh picks it up, and "…come too" ends just before the gust. It leaves a comic pause before "and a space just the size of a Piglet", and derives the word-by-word subtitle timings and speakers.
5. **Picture** (`js/`). Every element is drawn in code:
   - characters that are line-led, like the book: figures a shade lighter than the page with only a faint tint, and a bold broken pen outline pressed harder on the side away from the light
   - hatching that starts at the contour and fades inward the way Shepard's does, plus the shadow an arm casts on the tummy
   - mottled watercolour with pooled edges
   - paper cut-outs with a cream margin and soft shadow
   - five parallax depths
   - dappled light, falling leaves, bees, swaying grass

   The picnic cloth is a 3-D gingham sheet whose shape comes straight from time: shaken out, lying flat, lifting, flying, snagged like a flag, settling like a leaf. Each frame is a pure function of *t*, so any moment can be drawn on its own; that's what makes seeking and the export exact.
6. **Score** (`tools/audio/score.py`). An original piece in F major for harp, clarinet, bassoon, flute, strings and glockenspiel, played on the CC0 VSCO-2 samples. It is scored to the picture: Pooh's theme, Piglet's flute flutter, the gust, a comic silence, a pizzicato chase, the snag, the reveal and a closing waltz.
7. **Sound** (`tools/audio/sfx.py`). All effects and ambience are synthesised. Footsteps are placed from the characters' actual foot contacts, bees are panned by their position on screen, and the wind follows the film's own wind curve.
8. **Mix** (`tools/build_audio.py`). Music and ambience duck under the voice. The master is normalised to −16 LUFS, peak-limited to −1.2 dBFS, and checked with loudness plots, spectrograms and chord analysis.
9. **Export** (`tools/export_video.mjs`). Chromium renders all 3,600 frames at 60 fps (4 in parallel); FFmpeg encodes H.264 with the 48 kHz master.

### Rebuilding (optional)

```sh
pip install kokoro soundfile numpy scipy pyloudnorm
python3 tools/narration_voice_prompts.py  # synthetic voice prompts (Kokoro)
.venv-tts/bin/python tools/narration_chatterbox.py   # narration phrases (see the setup notes in the file)
python3 tools/narration_align.py          # trim + word timings (faster-whisper)
python3 tools/build_cues.py               # timeline, subtitles
node tools/dev/export_audio_data.mjs      # footsteps, wind, bee positions from the film
git clone --filter=blob:none --sparse https://github.com/sgossner/VSCO-2-CE /tmp/vsco   # CC0 samples
VSCO_DIR=/tmp/vsco python3 tools/build_audio.py
node tools/export_video.mjs               # needs Playwright + ffmpeg with libx264
```

For the VSCO sample folders to check out sparsely, see `tools/build_audio.py`. `tools/dev/` holds the review harnesses used during production: frame grabs, filmstrips, pop and collision scans, profiling and player tests.

## Delivery notes and limitations

- **The narration is synthetic.** It's Chatterbox text-to-speech, voiced from synthetic Kokoro prompts, and it carries Chatterbox's inaudible watermark marking it as AI speech. I couldn't listen to the audio in this environment, so the takes, pacing and mix were judged by measurement instead:
  - transcription accuracy
  - pitch and loudness movement
  - loudness curves per stem
  - spectrograms
  - chord (chroma) checks against the written score

  The narrator's "asked Piglet" is spoken the way people naturally say it, with the *-ed* nearly swallowed.

  A listen by a person with fresh ears is still worthwhile; the levels are set in one place in `tools/build_audio.py`.
- **The score and effects are original** but made by rule, not by ear: sampled chamber instruments for the music, synthesised effects. They're clean and in time, but not the equal of a live recording session.
- **The animation is procedural.** The characters are articulated rigs drawn with pen-and-wash code: keyframed poses with walk/run cycles, squash, overlap and blinks. It isn't frame-by-frame hand drawing, and there is one three-quarter view of each character (turned left or right) rather than full turnarounds.
- **Reference access.** The USF Libraries scan named in the brief is behind a bot-check page this build environment couldn't pass. The same 1926 illustrations were studied from Project Gutenberg.
- **Performance.** The characters' parts are painted once into bitmaps at load and then stamped each frame, so the characters cost well under a millisecond a frame to draw. The player reads the audio clock against the display clock, so motion advances evenly with no judder. It still wants a browser with hardware-accelerated canvas for a steady 60 fps. If frames run slow, as with software-only rendering, the player switches itself to a lighter render that skips a few full-screen light-blend passes. On very slow machines the picture may still drop frames, but it stays in sync with the sound. The MP4 plays anywhere.
- **Rights.** See [CREDITS.md](CREDITS.md). The 1926 book is public domain in the US; Shepard's illustrations are still in copyright in some other countries.
