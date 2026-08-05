"""Download lesson audio for every book page the workbench covers (pages 7-30)."""
import subprocess, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from workbench import LESSONS, MEDIA, FF

os.makedirs(MEDIA, exist_ok=True)
todo = [(t, m['video']) for t, m in LESSONS.items()
        if not (os.path.exists(os.path.join(MEDIA, t + ".m4a"))
                and os.path.getsize(os.path.join(MEDIA, t + ".m4a")) > 100_000)]
print(f"{len(todo)} lessons to download")
for i, (tag, vid) in enumerate(todo, 1):
    dst = os.path.join(MEDIA, tag + ".m4a")
    for attempt in (1, 2, 3):
        r = subprocess.run(["yt-dlp", "-f", "ba[ext=m4a]/ba", "-o", dst, "--no-playlist",
                            "--ffmpeg-location", os.path.dirname(FF),
                            f"https://youtu.be/{vid}"], capture_output=True, text=True)
        if os.path.exists(dst) and os.path.getsize(dst) > 100_000:
            print(f"[{i}/{len(todo)}] {tag} ok ({os.path.getsize(dst)//1024} KB)")
            break
        time.sleep(4 * attempt)
    else:
        print(f"[{i}/{len(todo)}] {tag} FAILED")
    time.sleep(1)
print("done")
