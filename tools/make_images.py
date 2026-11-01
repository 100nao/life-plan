"""背景画像とキャラクター（アバター）を生成（Pillow）。外部素材は使わない。"""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
OUT = 'images'

def blobs(name, base, colors, seed, size=(1200, 800), blur=140, grain=True):
    random.seed(seed)
    W, H = size
    im = Image.new('RGB', size, base)
    for (c, x, y, r) in colors:
        layer = Image.new('RGB', size, base); mask = Image.new('L', size, 0)
        d = ImageDraw.Draw(mask); d.ellipse([x*W - r*W, y*H - r*W, x*W + r*W, y*H + r*W], fill=255)
        layer.paste(Image.new('RGB', size, c), mask=mask)
        im = Image.composite(layer, im, mask.filter(ImageFilter.GaussianBlur(blur)))
    im = im.filter(ImageFilter.GaussianBlur(blur // 3))
    if grain:
        n = Image.effect_noise(size, 9).convert('RGB')
        im = Image.blend(im, ImageChops.overlay(im, n), 0.06)
    im.save(f'{OUT}/bg-{name}.jpg', quality=84, optimize=True, progressive=True)

def hills(name, sky_top, sky_bot, layers, sun, seed, size=(1200, 800)):
    random.seed(seed); W, H = size
    im = Image.new('RGB', size)
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line([(0, y), (W, y)], fill=tuple(int(sky_top[i] + (sky_bot[i] - sky_top[i]) * t) for i in range(3)))
    if sun:
        g = Image.new('L', size, 0); ImageDraw.Draw(g).ellipse([sun[0]*W-90, sun[1]*H-90, sun[0]*W+90, sun[1]*H+90], fill=255)
        im = Image.composite(Image.new('RGB', size, sun[2]), im, g.filter(ImageFilter.GaussianBlur(60)))
    for k, (col, base_y, amp, freq, blur) in enumerate(layers):
        m = Image.new('L', size, 0); md = ImageDraw.Draw(m)
        ph = random.random() * 6; ph2 = random.random() * 6
        pts = [(x, base_y*H + amp*H*(math.sin(x/W*freq*math.pi*2 + ph)*.6 + math.sin(x/W*freq*2.3*math.pi*2 + ph2)*.4)) for x in range(0, W + 8, 8)]
        md.polygon(pts + [(W, H), (0, H)], fill=255)
        im = Image.composite(Image.new('RGB', size, col), im, m.filter(ImageFilter.GaussianBlur(blur)))
    im = im.filter(ImageFilter.GaussianBlur(2))
    n = Image.effect_noise(size, 8).convert('RGB'); im = Image.blend(im, ImageChops.overlay(im, n), 0.05)
    im.save(f'{OUT}/bg-{name}.jpg', quality=84, optimize=True, progressive=True)

# 1) かすみ（パステルのぼかし）
blobs('mist', (246, 244, 250), [((255, 214, 224), .15, .2, .32), ((203, 226, 255), .85, .15, .35), ((214, 244, 228), .55, .95, .38), ((255, 236, 205), .95, .85, .25)], 1)
# 2) 朝焼け（ピーチ×ラベンダー）
blobs('sunrise', (252, 236, 228), [((255, 196, 170), .1, .9, .4), ((214, 196, 255), .9, .1, .4), ((255, 226, 190), .5, .4, .3), ((255, 180, 200), .9, .9, .28)], 2)
# 3) 森（やわらかな丘）
hills('forest', (226, 240, 236), (244, 246, 236), [((196, 222, 206), .52, .06, 1.2, 10), ((160, 200, 178), .64, .05, 1.7, 6), ((118, 170, 146), .78, .04, 2.2, 4), ((88, 142, 120), .9, .03, 2.8, 3)], (.72, .3, (255, 246, 214)), 3)
# 4) 海（夕凪）
hills('ocean', (214, 230, 248), (250, 236, 226), [((196, 218, 240), .6, .012, 3, 3), ((160, 196, 228), .7, .01, 4, 3), ((128, 176, 214), .82, .008, 5, 2), ((104, 156, 200), .93, .006, 6, 2)], (.3, .52, (255, 226, 200)), 4)

# サムネイル（設定の選択用）
for n in ['mist', 'sunrise', 'forest', 'ocean']:
    t = Image.open(f'{OUT}/bg-{n}.jpg'); t.thumbnail((240, 160)); t.save(f'{OUT}/bg-{n}-thumb.jpg', quality=80)

# キャラクター「ミライ」：ふんわりした丸いおばけ風のキャラ（立体っぽい陰影）
S = 1024
def avatar():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    body = Image.new('L', (S, S), 0); bd = ImageDraw.Draw(body)
    bd.ellipse([212, 150, 812, 760], fill=255)                     # 頭
    bd.rounded_rectangle([212, 450, 812, 900], radius=120, fill=255)  # 胴
    for i in range(5):                                             # すそのフリル
        cx = 212 + 60 + i * 120; bd.ellipse([cx - 70, 830, cx + 70, 960], fill=255)
    body = body.filter(ImageFilter.GaussianBlur(3))
    # 陰影：左上が明るい放射グラデーション
    shade = Image.new('RGB', (S, S)); px = shade.load()
    for y in range(0, S, 2):
        for x in range(0, S, 2):
            dx, dy = (x - 420) / 520, (y - 330) / 620
            t = min(1, math.sqrt(dx*dx + dy*dy))
            c = (int(250 - 40*t), int(236 - 52*t), int(222 - 62*t))
            px[x, y] = c
            if x+1 < S: px[x+1, y] = c
            if y+1 < S: px[x, y+1] = c; px[x+1 if x+1 < S else x, y+1] = c
    shade = shade.filter(ImageFilter.GaussianBlur(6))
    im.paste(shade, (0, 0), body)
    d = ImageDraw.Draw(im)
    # ハイライト
    hl = Image.new('L', (S, S), 0); ImageDraw.Draw(hl).ellipse([320, 210, 520, 330], fill=120); hl = hl.filter(ImageFilter.GaussianBlur(40))
    im = Image.composite(Image.new('RGBA', (S, S), (255, 255, 255, 255)), im, ImageChops.multiply(hl, body))
    d = ImageDraw.Draw(im)
    # 目・ほっぺ・口
    for ex in (420, 604):
        d.ellipse([ex - 30, 430, ex + 30, 500], fill=(58, 44, 40, 255))
        d.ellipse([ex - 12, 442, ex + 4, 460], fill=(255, 255, 255, 255))
    cheek = Image.new('L', (S, S), 0); cd = ImageDraw.Draw(cheek)
    cd.ellipse([318, 505, 408, 560], fill=170); cd.ellipse([616, 505, 706, 560], fill=170)
    cheek = cheek.filter(ImageFilter.GaussianBlur(14))
    im = Image.composite(Image.new('RGBA', (S, S), (255, 150, 150, 255)), im, cheek)
    d = ImageDraw.Draw(im)
    d.arc([474, 500, 550, 560], start=20, end=160, fill=(120, 70, 60, 255), width=10)
    # 足元の影
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse([300, 950, 724, 1000], fill=(0, 0, 0, 60)); sh = sh.filter(ImageFilter.GaussianBlur(16))
    out = Image.alpha_composite(sh, im)
    for sz in (256, 128):
        out.resize((sz, sz), Image.LANCZOS).save(f'{OUT}/avatar-{sz}.png', optimize=True)
avatar()
print('ok')
