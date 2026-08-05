"""Download the Arabic calligraphy fonts the letter cards use.

Windows ships almost no real Kufi or Ruqaa face, so without these the app can only
show one writing style. All four are SIL Open Font Licence — free to use, bundle and
redistribute, so they are safe to ship with the app (unlike the teacher's audio).

    python fetch_fonts.py
"""
import os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.abspath(os.path.join(HERE, "..", "app", "fonts"))

# jsDelivr mirrors of the Google Fonts repo (upstream: github.com/google/fonts, OFL)
FONTS = {
    "Amiri-Regular.woff2":
        "https://cdn.jsdelivr.net/fontsource/fonts/amiri@latest/arabic-400-normal.woff2",
    "ReemKufi-Regular.woff2":
        "https://cdn.jsdelivr.net/fontsource/fonts/reem-kufi@latest/arabic-400-normal.woff2",
    "ArefRuqaa-Regular.woff2":
        "https://cdn.jsdelivr.net/fontsource/fonts/aref-ruqaa@latest/arabic-400-normal.woff2",
    "NotoNaskhArabic-Regular.woff2":
        "https://cdn.jsdelivr.net/fontsource/fonts/noto-naskh-arabic@latest/arabic-400-normal.woff2",
}

os.makedirs(DEST, exist_ok=True)
ok = 0
for name, url in FONTS.items():
    dst = os.path.join(DEST, name)
    if os.path.exists(dst) and os.path.getsize(dst) > 5000:
        print(f"have  {name}")
        ok += 1
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
        if len(data) < 5000:
            raise ValueError(f"suspiciously small ({len(data)} bytes)")
        with open(dst, "wb") as fh:
            fh.write(data)
        print(f"saved {name}  ({len(data)//1024} KB)")
        ok += 1
    except Exception as e:
        print(f"FAILED {name}: {e}")

print(f"\n{ok}/{len(FONTS)} fonts in {DEST}")
if ok:
    print("Reload the app — letter cards will now show several writing styles.")
    print("These fonts are OFL licensed, so they can ship with the public version.")
