"""アプリアイコン (PNG) を生成するスクリプト。 python3 tools/make_icons.py

v1.8.6〜：アイコンは icons/master.png（黒背景に白い双峰＋コーラル色の旗、3D風の
マスター画像 1600x1600）から各サイズを派生させる。ここで旧デザイン（セージ
グリーンの描画）を再生成しないこと。デザインを変えるときは master.png を
差し替えてからこのスクリプトを回す。
"""
from PIL import Image
import os

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "icons")
MASTER = os.path.join(OUT, "master.png")

master = Image.open(MASTER).convert("RGB")

# maskable の余白色はマスター四隅の平均（≒ #1A1A1A）
_corners = [master.getpixel(p) for p in [(4, 4), (master.width - 5, 4), (4, master.height - 5), (master.width - 5, master.height - 5)]]
BG = tuple(round(sum(c[i] for c in _corners) / len(_corners)) for i in range(3))


def save_resized(size, name):
    master.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)


save_resized(180, "icon-180.png")   # apple-touch-icon（iOSが角丸にする）
save_resized(192, "icon-192.png")
save_resized(512, "icon-512.png")
save_resized(32, "favicon-32.png")

# maskable：図柄を約80%に縮小し、同系の黒背景に中央配置（セーフゾーン確保）
_canvas = Image.new("RGB", (512, 512), BG)
_inner = round(512 * 0.8)
_canvas.paste(master.resize((_inner, _inner), Image.LANCZOS), ((512 - _inner) // 2, (512 - _inner) // 2))
_canvas.save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)

print("icons generated from master.png:", sorted(os.listdir(OUT)))
