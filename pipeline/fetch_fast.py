"""Download the FAST series (one utterance per word) covering book pages 7-30.

The original series drills each word many times, which made every clip ambiguous:
a run of repetitions had to be identified before it could be labelled. This older
series reads each item once, in page order, so silence-segmentation should line up
1:1 with the transcribed word list — turning labelling into simple index matching.
"""
import subprocess, os, time

FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin"
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "media_fast")
os.makedirs(DEST, exist_ok=True)

# tag -> (video id, book pages it covers)
VIDEOS = {
    "f1": ("wsDUhDENScc", [7]),
    "f2": ("qxPWYHuQ2BA", [7, 8]),
    "f3": ("lj6s3CgAeTY", list(range(9, 19))),
    "f4": ("iUImSB1dHIc", list(range(19, 24))),
    "f5": ("ILMuH8Gp3cI", list(range(24, 31))),
}

for tag, (vid, pages) in VIDEOS.items():
    dst = os.path.join(DEST, tag + ".m4a")
    if os.path.exists(dst) and os.path.getsize(dst) > 100_000:
        print(f"have {tag} (pages {pages[0]}-{pages[-1]})")
        continue
    for attempt in (1, 2, 3):
        subprocess.run(["yt-dlp", "-f", "ba[ext=m4a]/ba", "-o", dst, "--no-playlist",
                        "--ffmpeg-location", FF, f"https://youtu.be/{vid}"],
                       capture_output=True, text=True)
        if os.path.exists(dst) and os.path.getsize(dst) > 100_000:
            print(f"{tag} ok — pages {pages[0]}-{pages[-1]} ({os.path.getsize(dst)//1024} KB)")
            break
        time.sleep(4 * attempt)
    else:
        print(f"{tag} FAILED")
print("done")
