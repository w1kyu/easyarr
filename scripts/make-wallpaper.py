#!/usr/bin/env python3
"""Regenerate EasyArr's own wallpaper (dashboard/web/src/assets/wallpaper.webp). Needs Pillow.

A tiny, pre-blurred image scales up smoothly in the browser, so the UI needs no CSS blur
on the full-screen background (cheap on low-power devices).
"""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 640, 400
OUT = Path(__file__).resolve().parent.parent / "dashboard/web/src/assets/wallpaper.webp"
BLOBS = [  # cx, cy, rx, ry, rgb, alpha
    (150, 120, 210, 150, (124, 58, 237), 200),  # violet
    (500, 100, 230, 140, (37, 99, 235), 190),  # blue
    (400, 340, 260, 130, (14, 165, 233), 130),  # sky
    (90, 360, 170, 120, (219, 39, 119), 90),  # pink
    (320, 200, 120, 90, (99, 102, 241), 70),  # indigo
]


def main() -> None:
    img = Image.new("RGBA", (W, H), (11, 11, 20, 255))
    for cx, cy, rx, ry, rgb, alpha in BLOBS:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=rgb + (alpha,))
        img = Image.alpha_composite(img, layer)
    img = img.filter(ImageFilter.GaussianBlur(70)).convert("RGB")
    random.seed(7)
    px = img.load()
    for y in range(H):
        for x in range(W):
            n = random.randint(-3, 3)
            r, g, b = px[x, y]
            px[x, y] = tuple(max(0, min(255, c + n)) for c in (r, g, b))
    img.save(OUT, "WEBP", quality=82)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
