# Credits, sources and licences

## Source material

- **A. A. Milne, *Winnie-the-Pooh*, with decorations by E. H. Shepard (Methuen, London; E. P. Dutton, New York, 1926).**
  Pooh, Piglet, the Forest, the HUNNY pot, the *Mr Sanders* board over Pooh's door, Piglet's striped jumper and the bees all come from this book.
  - Consulted: Project Gutenberg eBook #67098, text and illustrations — https://www.gutenberg.org/ebooks/67098
  - Also named in the brief: the 1926 edition scan at University of South Florida Libraries — https://digitalcommons.usf.edu/childrens_lit_books/7/
    (Its download sits behind a bot-check page that blocked automated access from this build environment. The Gutenberg reproductions of the same 1926 illustrations were used instead.)
- No later books, films, merchandise, colourised editions or Disney designs were used as references.

## Made for this film (original)

- Story, screenplay, narration text and dialogue.
- All artwork. Characters, props, scenery, paper, ink and watercolour are drawn procedurally in JavaScript (`js/`), after studying Shepard's 1926 drawings. None of his illustrations are traced or reproduced.
- Animation, camera and choreography.
- The musical score (`tools/audio/score.py`), composed for the film's timings.
- The sound design: where every effect falls and how loud it is, the wind (synthesised to follow the film's own wind curve, `tools/audio/sfx.py`) and the honey's *plip*.
- The mix and master (`tools/build_audio.py`).

## Third-party components

| What | Author | Licence | Use |
|------|--------|---------|-----|
| Chatterbox TTS | Resemble AI | MIT | The narration and the characters' voices, generated locally (`tools/narration_chatterbox.py`). Its output carries an inaudible Perth watermark identifying it as AI speech |
| Kokoro-82M text-to-speech model (voices `bf_emma`, `bm_george`, `bf_lily`), with the misaki G2P | hexgrad | Apache-2.0 | Short synthetic voice prompts that give the narrator, Pooh and Piglet their timbre (`tools/narration_voice_prompts.py`) |
| VSCO-2 Community Edition sample library | Versilian Studios / Sam Gossner | CC0 1.0 | Instrument samples for the score: harp, clarinet, bassoon, flute, string sections (arco and pizzicato), contrabass pizzicato, glockenspiel |
| IM Fell English, IM Fell English SC | Igino Marini (the Fell Types) | SIL OFL 1.1 | Title page, *The End*, the pot label and door board |
| EB Garamond | Georg Duffner, Octavio Pardo | SIL OFL 1.1 | Subtitles and page text |
| Impact Sounds, RPG Audio | Kenney (kenney.nl) | CC0 1.0 | Footsteps in grass, cloth, paper (the page turn), a ceramic knock (the honey pot), a soft fall (Pooh's bump) |

### Recorded sounds from Freesound (all CC0 1.0)

Cut and levelled for the film by `tools/audio/foley_prep.py`; the pieces are in `assets/audio/foley/`. CC0 asks for no credit, but here it is with thanks:

| Sound | Recordist | Used for |
|------|--------|-----|
| [Single bumblebee.WAV](https://freesound.org/s/575899/) | VMan533 | Bees |
| [Bumblebee In Lavender](https://freesound.org/s/397113/) | Kinoton | Bees |
| [Woodland Atmos 05](https://freesound.org/s/640188/), [Woodland Atmos 02](https://freesound.org/s/640186/) | apintofmild | Birds on the heath and under the pines |
| [Numerous birds in Essex Woodland](https://freesound.org/s/518671/) | jackmichaelking | Birds in the clearing |
| [Blackbird (isolated)](https://freesound.org/s/811988/) | richwise | The blackbird's song |
| [Forest, close up of trees rustling in the wind](https://freesound.org/s/523389/) | Anya_Media | Leaves in the wind |
| [Rustling Grass](https://freesound.org/s/364712/) | alegemaate | Piglet in the long grass |
| [Cloth Flapping On A Clothesline Gently](https://freesound.org/s/330639/) / [Thickly](https://freesound.org/s/330638/) | leonelmail | The cloth lifting, flying, snagged and drifting |
| [Fabric flaps](https://freesound.org/s/580967/) | PelicanPolice | Shaking out the cloth |

The font licence texts are in `assets/fonts/`.

**Build tools** (not shipped with the film):

- Playwright's Chromium, for frame rendering.
- FFmpeg (imageio-ffmpeg static build) with libx264, libmp3lame and AAC.
- Python: NumPy, SciPy, soundfile and pyloudnorm.
- faster-whisper, for word timings and to check that the narration reads back exactly.
- torchaudio SQUIM, as one input to voice selection.
- The CommonAccent English accent classifier (Juan Zuluaga-Gomez et al., SpeechBrain, MIT) and Praat via parselmouth (GPL-3.0), to check the British accent.

## Rights note (not legal advice)

The 1926 *Winnie-the-Pooh* is in the public domain in the **United States** (US copyright expired at the end of 2021). Elsewhere it depends on the author's death date:

- **Milne's text** (Milne died in 1956) comes into the public domain in life + 70 countries on 1 January 2027.
- **Shepard's illustrations** (Shepard died in 1976) stay in copyright in life + 70 countries until the end of 2046.

This film's pictures are new drawings. The character designs, though, are deliberately based on Shepard's, so check local law before distributing outside the US.

"Winnie the Pooh" is also used as a trademark by The Walt Disney Company for its own products. This film:

- avoids Disney's designs, colours, voices and songs
- presents itself as a new adaptation of the 1926 book, not as an official product
