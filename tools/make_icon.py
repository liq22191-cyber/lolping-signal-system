"""Builds the app icons from the ping renders. Requires Pillow.

- build/icon.ico: Windows (16-256 px)
- build/icon.png: macOS app icon (1024 px; electron-builder turns it into an .icns)
- build/trayTemplate.png, trayOffTemplate.png (+ @2x): macOS menu bar template images (black, alpha only)
"""
from pathlib import Path

from PIL import Image

repo = Path(__file__).resolve().parents[1]
textures = repo / 'assets' / 'textures'
build = repo / 'build'
build.mkdir(exist_ok=True)

render = Image.open(textures / 'pingwheel_basicpingrender.png').convert('RGBA')
render.save(build / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# macOS icons keep a margin around the artwork (about 10% each side on the 1024 grid).
mac = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
art = render.resize((824, 824), Image.LANCZOS)
mac.alpha_composite(art, (100, 100))
mac.save(build / 'icon.png')

# Menu bar: an 18 pt template image is black with the shape in its alpha channel; macOS tints it.
ping = Image.open(textures / 'generic_ping.png').convert('RGBA')
for name, strength in (('trayTemplate', 1.0), ('trayOffTemplate', 0.4)):
    for scale, suffix in ((1, ''), (2, '@2x')):
        size = 18 * scale
        alpha = ping.resize((size, size), Image.LANCZOS).getchannel('A').point(lambda a: round(a * strength))
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.putalpha(alpha)
        out.save(build / f'{name}{suffix}.png')

print('wrote icon.ico, icon.png and the tray templates to', build)
