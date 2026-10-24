"""Renders the app icons in apps/web/public from the SVGs in this folder.

Needs Google Chrome (headless, to rasterize the SVGs) and Pillow:

    python3 apps/web/icons/render.py

- icon.svg            home-screen / PWA icon (rounded square)
- icon-small.svg      16-48 px: bigger bubble, heavier stroke; also the tab favicon.svg
- icon-full-bleed.svg Apple touch icon (iOS rounds the corners itself)
- icon-maskable.svg   Android maskable icon (bubble kept in the safe zone)
"""

import io
import pathlib
import shutil
import struct
import subprocess
import tempfile

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RENDER = 1024  # render large, then downsample for clean anti-aliasing


def rasterize(svg: str) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        html = pathlib.Path(tmp, "icon.html")
        png = pathlib.Path(tmp, "icon.png")
        html.write_text(
            '<!doctype html><html><body style="margin:0;background:transparent">'
            f'<img src="{(HERE / svg).as_uri()}" style="display:block;width:{RENDER}px;height:{RENDER}px">'
            "</body></html>"
        )
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--default-background-color=00000000",
                f"--window-size={RENDER},{RENDER}",
                f"--screenshot={png}",
                html.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        image = Image.open(png).convert("RGBA")
        if image.size != (RENDER, RENDER):
            raise RuntimeError(f"Chrome rendered {svg} at {image.size}, expected {RENDER}px")
        return image


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.LANCZOS)


def write_ico(path: pathlib.Path, images: list[Image.Image]) -> None:
    """An .ico holding one PNG per size (supported by every current browser)."""
    pngs = []
    for image in images:
        buffer = io.BytesIO()
        image.save(buffer, "PNG")
        pngs.append((image.size[0], buffer.getvalue()))
    offset = 6 + 16 * len(pngs)
    entries, data = b"", b""
    for size, png in pngs:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(png), offset + len(data))
        data += png
    path.write_bytes(struct.pack("<HHH", 0, 1, len(pngs)) + entries + data)


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    icon = rasterize("icon.svg")
    small = rasterize("icon-small.svg")
    full_bleed = rasterize("icon-full-bleed.svg")
    maskable = rasterize("icon-maskable.svg")

    shutil.copyfile(HERE / "icon-small.svg", PUBLIC / "favicon.svg")
    write_ico(PUBLIC / "favicon.ico", [resized(small, n) for n in (16, 32, 48)])
    resized(full_bleed, 180).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    resized(icon, 192).save(PUBLIC / "icon-192.png", optimize=True)
    resized(icon, 512).save(PUBLIC / "icon-512.png", optimize=True)
    resized(maskable, 512).convert("RGB").save(PUBLIC / "icon-maskable-512.png", optimize=True)
    for name in sorted(p.name for p in PUBLIC.iterdir()):
        print(name)


if __name__ == "__main__":
    main()
