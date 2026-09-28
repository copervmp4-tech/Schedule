"""Assemble docs/storyboard.jpg from exported frames (build/frames, 60 fps).
   --vertical: docs/storyboard-vertical.jpg from the 9:16 film (build/frames-vertical)."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = [(1.5, 'Title page'), (4.9, 'The page turns'), (7.9, 'Pooh shakes out the cloth'), (10.4, '…a pot of honey'), (11.8, '…and a space'), (12.7, '…the size of a Piglet!'),
         (15.6, '"For me?"'), (18.1, '"For us."'), (21.9, 'The wind wants to come too'), (23.35, 'Whisked from under the pot'), (24.5, 'Away it sails'), (25.9, 'A look at each other'),
         (29.6, 'Over the heather…'), (32.2, '…under the pines, bees behind'), (34.6, 'Snagged on the gorse'), (35.6, 'Bump!'), (37.4, '"Perhaps it knows somewhere nicer."'), (41.4, 'Into the clearing'),
         (43.8, '"It did."'), (46.9, 'Honey for Piglet first'), (50.0, 'Then for Pooh'), (52.9, 'Side by side'), (56.2, 'A perfectly wonderful afternoon'), (59.5, 'The End')]
VERT = '--vertical' in sys.argv
W, H, cols, pad, cap = (216, 384, 8, 10, 34) if VERT else (400, 225, 4, 10, 34)
FRAMES = 'build/frames-vertical' if VERT else 'build/frames'
OUT = 'docs/storyboard-vertical.jpg' if VERT else 'docs/storyboard.jpg'
rows = (len(SHOTS) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (W + pad) + pad, rows * (H + cap + pad) + pad), (31, 26, 20))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype(os.path.join(ROOT, 'assets/fonts/EBGaramond[wght].ttf'), 13 if VERT else 17)
for i, (t, label) in enumerate(SHOTS):
    im = Image.open(os.path.join(ROOT, FRAMES, f'f{round(t * 60):05d}.jpg')).resize((W, H), Image.LANCZOS)
    x = pad + (i % cols) * (W + pad)
    y = pad + (i // cols) * (H + cap + pad)
    sheet.paste(im, (x, y))
    m, s = divmod(t, 60)
    lab = f'{int(m)}:{s:04.1f}  {label}'
    if VERT and len(lab) > 30:
        lab = lab[:29] + '…'
    d.text((x + 2, y + H + 6), lab, fill=(242, 232, 210), font=font)
sheet.save(os.path.join(ROOT, OUT), quality=84, optimize=True)
print(OUT, sheet.size)
