"""生成应用图标：1024x1024 圆角方形渐变底 + 白色进度环（270 度弧）。"""
import math
import struct
import zlib

SIZE = 1024
RADIUS = 96  # 圆角半径

# 渐变端色：#4a9eff -> #14b8a6
C1 = (0x4A, 0x9E, 0xFF)
C2 = (0x14, 0xB8, 0xA6)

CX = CY = SIZE / 2
RING_R = 300       # 环中心半径
RING_W = 88        # 环宽
ARC_DEG = 270      # 进度弧角度（从正上方顺时针）
GAP_DEG = 360 - ARC_DEG


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_rounded_rect(x, y):
    """圆角方形内判定"""
    if x < 0 or y < 0 or x >= SIZE or y >= SIZE:
        return False
    # 四角圆角检查
    for cx, cy in ((RADIUS, RADIUS), (SIZE - RADIUS, RADIUS),
                   (RADIUS, SIZE - RADIUS), (SIZE - RADIUS, SIZE - RADIUS)):
        in_corner_box = (
            (cx == RADIUS and x < RADIUS or cx != RADIUS and x >= SIZE - RADIUS)
            and (cy == RADIUS and y < RADIUS or cy != RADIUS and y >= SIZE - RADIUS)
        )
        if in_corner_box:
            return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2
    return True


def ring_alpha(x, y):
    """进度环像素判定，返回 (是否环上, 是否进度弧段)"""
    dx, dy = x - CX, y - CY
    dist = math.hypot(dx, dy)
    if not (RING_R - RING_W / 2 <= dist <= RING_R + RING_W / 2):
        return False, False
    # 角度：0 = 正上方，顺时针
    ang = math.degrees(math.atan2(dx, -dy)) % 360
    # 缺口居中于底部
    gap_start = 360 - GAP_DEG / 2
    gap_end = GAP_DEG / 2
    in_gap = ang >= gap_start or ang <= gap_end
    return True, not in_gap


rows = []
for y in range(SIZE):
    row = bytearray()
    row.append(0)  # filter type
    for x in range(SIZE):
        if not in_rounded_rect(x, y):
            row += bytes((0, 0, 0, 0))
            continue
        on_ring, on_arc = ring_alpha(x, y)
        if on_ring:
            if on_arc:
                row += bytes((255, 255, 255, 255))       # 进度弧：白色
            else:
                base = lerp(C1, C2, y / SIZE)
                row += bytes((base[0] // 2, base[1] // 2, base[2] // 2, 90))  # 轨道：半透明深色
        else:
            row += bytes((*lerp(C1, C2, y / SIZE), 255))
    rows.append(bytes(row))

raw = b"".join(rows)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw, 6))
       + chunk(b"IEND", b""))

import os
os.makedirs("assets", exist_ok=True)
with open("assets/icon.png", "wb") as f:
    f.write(png)
print("icon written:", os.path.abspath("assets/icon.png"), len(png), "bytes")
