"""アプリアイコン (PNG) を生成するスクリプト。 python3 tools/make_icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)
TOP, BOTTOM = (122, 178, 163), (84, 140, 128)  # セージグリーンのグラデーション


def draw_icon(size, pad_ratio=0.0, rounded=False):
    S = size * 4  # 4倍で描いて縮小（アンチエイリアス）
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (S, y)], fill=c)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    else:
        md.rectangle([0, 0, S, S], fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    p = S * pad_ratio
    inner = S - 2 * p

    def X(v):
        return p + v * inner

    # 太陽
    r = inner * 0.09
    cx, cy = X(0.27), X(0.27)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(250, 214, 165, 255))
    # 山（奥）
    d.polygon([(X(0.12), X(0.80)), (X(0.62), X(0.80)), (X(0.37), X(0.44))], fill=(255, 255, 255, 170))
    # 山（手前）
    d.polygon([(X(0.30), X(0.80)), (X(0.90), X(0.80)), (X(0.60), X(0.36))], fill=(255, 255, 255, 255))
    # 旗
    fx, fy = X(0.60), X(0.36)
    w = max(2, int(inner * 0.018))
    d.line([(fx, fy), (fx, fy - inner * 0.17)], fill=(255, 255, 255, 255), width=w)
    d.polygon([(fx, fy - inner * 0.17), (fx + inner * 0.12, fy - inner * 0.135), (fx, fy - inner * 0.10)],
              fill=(240, 160, 120, 255))
    # 地面のライン
    d.rounded_rectangle([X(0.12), X(0.80), X(0.90), X(0.83)], radius=int(inner * 0.015), fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def save(img, name, flatten=True):
    if flatten:
        bg = Image.new("RGB", img.size, BOTTOM)
        bg.paste(img, (0, 0), img)
        img = bg
    img.save(os.path.join(OUT, name))


save(draw_icon(180, 0.06), "icon-180.png")            # apple-touch-icon（iOSが角丸にする）
save(draw_icon(192, 0.06), "icon-192.png")
save(draw_icon(512, 0.06), "icon-512.png")
save(draw_icon(512, 0.16), "icon-maskable-512.png")   # maskable 用に余白多め
save(draw_icon(32, 0.0, rounded=True), "favicon-32.png", flatten=False)
print("icons generated:", sorted(os.listdir(OUT)))
