"""Sinh PWA icons (PNG) bằng Pillow.

- icon-192.png:    icon thường 192x192
- icon-512.png:    icon thường 512x512
- icon-maskable.png: 512x512, có safe zone (Android maskable)
- favicon.png:     32x32

Chỉ chạy 1 lần. Cài Pillow trước: pip install Pillow
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "icons"
OUT.mkdir(exist_ok=True)

THEME = (26, 115, 232)   # #1A73E8 (Google blue)
BG = (255, 255, 255)
TEXT = (255, 255, 255)


def find_font(size: int) -> ImageFont.ImageFont:
    """Tìm font hỗ trợ Unicode cho ký tự '?' / 'Q' / '✓'."""
    candidates = [
        r"C:\Windows\Fonts\seguiemj.ttf",   # Segoe UI Emoji
        r"C:\Windows\Fonts\seguisb.ttf",    # Segoe UI Semibold
        r"C:\Windows\Fonts\arialbd.ttf",    # Arial Bold
    ]
    for c in candidates:
        if Path(c).exists():
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_icon(size: int, path: Path, maskable: bool = False, text: str = "Q"):
    img = Image.new("RGBA", (size, size), THEME + (255,))
    draw = ImageDraw.Draw(img)
    if maskable:
        # Maskable: nội dung quan trọng nằm trong vòng tròn safe-zone (~80%)
        # Vẽ background full + foreground co lại 80%.
        pass  # full color background đã đáp ứng

    # Vẽ vòng tròn nền sáng
    margin = size * (0.12 if maskable else 0.08)
    bbox = [margin, margin, size - margin, size - margin]
    if not maskable:
        draw.ellipse(bbox, fill=(255, 255, 255, 240))

    # Vẽ text "Q" hoặc tick
    font_size = int(size * (0.45 if maskable else 0.55))
    font = find_font(font_size)
    bbox_t = draw.textbbox((0, 0), text, font=font)
    tw = bbox_t[2] - bbox_t[0]
    th = bbox_t[3] - bbox_t[1]
    x = (size - tw) // 2 - bbox_t[0]
    y = (size - th) // 2 - bbox_t[1]
    color = (255, 255, 255) if maskable else THEME
    draw.text((x, y), text, fill=color, font=font)

    img.save(path)
    print(f"  ✓ {path.name}  ({size}x{size})")


print("Đang sinh icons...")
make_icon(192, OUT / "icon-192.png")
make_icon(512, OUT / "icon-512.png")
make_icon(512, OUT / "icon-maskable.png", maskable=True)
make_icon(32, OUT / "favicon.png")
print(f"Xong! Lưu vào {OUT}")
