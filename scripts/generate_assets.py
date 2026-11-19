"""Draw Livingo icons, the sample fika card, and a short voice-note tone."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICON = PUBLIC / "icons"
DEMO = PUBLIC / "demo"

LEAF = (47, 190, 106, 255)
LEAF_DARK = (23, 138, 72, 255)
CREAM = (255, 246, 234, 255)
INK = (28, 36, 48, 255)
GOLD = (255, 183, 3, 255)
CORAL = (255, 107, 107, 255)
WHITE = (255, 255, 255, 255)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def flame(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float) -> None:
    outer = [
        (cx, cy - 118 * scale),
        (cx + 78 * scale, cy - 10 * scale),
        (cx + 62 * scale, cy + 78 * scale),
        (cx, cy + 108 * scale),
        (cx - 62 * scale, cy + 78 * scale),
        (cx - 78 * scale, cy - 10 * scale),
    ]
    draw.polygon(outer, fill=GOLD)
    inner = [
        (cx, cy - 68 * scale),
        (cx + 40 * scale, cy + 8 * scale),
        (cx + 28 * scale, cy + 62 * scale),
        (cx, cy + 78 * scale),
        (cx - 28 * scale, cy + 62 * scale),
        (cx - 40 * scale, cy + 8 * scale),
    ]
    draw.polygon(inner, fill=CORAL)
    eye = 10 * scale
    draw.ellipse((cx - 26 * scale, cy + 4 * scale, cx - 26 * scale + eye, cy + 4 * scale + eye * 1.3), fill=INK)
    draw.ellipse((cx + 12 * scale, cy + 4 * scale, cx + 12 * scale + eye, cy + 4 * scale + eye * 1.3), fill=INK)
    draw.arc(
        (cx - 22 * scale, cy + 22 * scale, cx + 22 * scale, cy + 48 * scale),
        start=20,
        end=160,
        fill=INK,
        width=max(3, int(5 * scale)),
    )


def rounded_icon(size: int, maskable: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = int(size * (0.22 if not maskable else 0))
    if maskable:
        draw.rectangle((0, 0, size, size), fill=LEAF)
    else:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=LEAF)
    flame(draw, size // 2, int(size * 0.52), size / 420)
    return image


def write_icons() -> None:
    ICON.mkdir(parents=True, exist_ok=True)
    rounded_icon(512, False).save(ICON / "icon-512.png")
    rounded_icon(192, False).resize((192, 192), Image.Resampling.LANCZOS).save(ICON / "icon-192.png")
    rounded_icon(180, False).resize((180, 180), Image.Resampling.LANCZOS).save(ICON / "apple-touch-icon.png")
    rounded_icon(32, False).resize((32, 32), Image.Resampling.LANCZOS).save(ICON / "favicon-32.png")
    rounded_icon(512, True).save(ICON / "icon-maskable-512.png")


def write_fika() -> None:
    DEMO.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (960, 720), CREAM)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((36, 36, 924, 684), radius=48, fill=WHITE, outline=GOLD, width=8)
    draw.ellipse((620, 80, 900, 360), fill=(255, 214, 120, 255))
    draw.rounded_rectangle((150, 250, 430, 520), radius=36, fill=(111, 78, 55, 255))
    draw.ellipse((150, 200, 430, 320), fill=(255, 246, 234, 255))
    draw.ellipse((190, 230, 390, 330), fill=(92, 58, 38, 255))
    draw.rounded_rectangle((400, 340, 490, 470), radius=16, fill=(111, 78, 55, 255))
    draw.polygon([(250, 470), (330, 470), (310, 560), (270, 560)], fill=(255, 246, 234, 255))
    draw.text((150, 80), "fika", font=font(92, True), fill=INK)
    draw.text((150, 180), "a coffee break", font=font(36, True), fill=LEAF_DARK)
    image = image.filter(ImageFilter.SMOOTH)
    image.convert("RGB").save(DEMO / "fika.jpg", quality=86)


def write_tone() -> None:
    DEMO.mkdir(parents=True, exist_ok=True)
    framerate = 22050
    duration = 1.8
    notes = [(392.0, 0.0, 0.5), (523.25, 0.35, 0.95), (659.25, 0.8, 1.45), (784.0, 1.2, 1.8)]
    frames = int(framerate * duration)
    samples = bytearray()
    for index in range(frames):
        t = index / framerate
        acc = 0.0
        for freq, start, end in notes:
            if start <= t < end:
                env = min(1.0, (t - start) / 0.04) * min(1.0, (end - t) / 0.08)
                acc += math.sin(2 * math.pi * freq * t) * env
        value = int(max(-1.0, min(1.0, acc * 0.35)) * 32767)
        samples += struct.pack("<h", value)
    path = DEMO / "note.wav"
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(framerate)
        handle.writeframes(samples)


if __name__ == "__main__":
    write_icons()
    write_fika()
    write_tone()
    print("assets ready")
