"""Generate the app icons from code.

    py -3 tools/build_icons.py

Writes www/icon-192.png, www/icon-512.png and www/apple-touch-icon.png.

Deliberately code and not a binary blob: an icon nobody can open is an icon nobody can change, and
this project has no image tooling installed. Pure stdlib - zlib and struct are enough to write a
PNG, and adding Pillow to a project whose whole point is having no dependencies would be a poor
trade for three squares.

The mark is the app's own glyph, U+25E7 "square with left half black", in brand teal.
"""
import os
import struct
import zlib

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "www")

TEAL = (0x0E, 0x7C, 0x6B)
WHITE = (0xFF, 0xFF, 0xFF)


def png(path, size):
    """Solid teal tile with a white ◧ mark, centred."""
    # Geometry as fractions so every size is the same drawing, not three hand-tuned ones.
    m0 = int(size * 0.28)          # mark box left/top
    m1 = size - m0                 # right/bottom
    bw = max(2, int(size * 0.055))  # stroke width
    mid = (m0 + m1) // 2

    rows = []
    for y in range(size):
        row = bytearray([0])       # PNG filter byte: 0 = None
        for x in range(size):
            inside = m0 <= x < m1 and m0 <= y < m1
            on_border = inside and (x - m0 < bw or m1 - x <= bw or y - m0 < bw or m1 - y <= bw)
            left_half = inside and x < mid
            r, g, b = WHITE if (on_border or left_half) else TEAL
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))

    raw = b"".join(rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)   # 8-bit RGBA
    blob = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(blob)
    return len(blob)


for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    p = os.path.join(OUT, name)
    n = png(p, size)
    print("%-22s %4dx%-4d %6d bytes" % (name, size, size, n))
