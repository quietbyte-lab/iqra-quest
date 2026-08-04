"""Download (and optionally clip) the lesson video + audio for one book page.

Usage:
  python fetch_page.py 16                 # download full video for page 16 -> media/p16.mp4 + audio -> media/p16.m4a
  python fetch_page.py 16 2:10 4:45      # download only that section (requires ffmpeg on PATH)

Requires: pip install yt-dlp   and ffmpeg (winget install Gyan.FFmpeg) for clipping/audio.
Keep downloaded media private (family use) until the channel owner approves public distribution.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, "media")
os.makedirs(MEDIA, exist_ok=True)

if len(sys.argv) < 2:
    sys.exit(__doc__)
page = sys.argv[1]
section = f"*{sys.argv[2]}-{sys.argv[3]}" if len(sys.argv) >= 4 else None

index = json.load(open(os.path.join(HERE, "videos.json"), encoding="utf-8"))["page_index"]
if page not in index:
    sys.exit(f"No video mapped for page {page}. Check videos.json (page 31 is theory-only).")

for n, vid in enumerate(index[page]):
    suffix = f"_{n+1}" if len(index[page]) > 1 else ""
    base = os.path.join(MEDIA, f"p{page}{suffix}")
    # video for Learn mode
    cmd = ["yt-dlp", "-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4",
           "-o", base + ".mp4", f"https://youtu.be/{vid}"]
    if section:
        cmd += ["--download-sections", section]
    subprocess.run(cmd, check=True)
    # audio-only for Practice mode
    cmd = ["yt-dlp", "-f", "ba", "-x", "--audio-format", "m4a",
           "-o", base + ".m4a", f"https://youtu.be/{vid}"]
    if section:
        cmd += ["--download-sections", section]
    subprocess.run(cmd, check=True)
    print("saved", base + ".mp4", "and .m4a")
