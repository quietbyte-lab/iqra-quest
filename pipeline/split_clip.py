"""Split a clip that caught two words into two clips.

Silence detection sometimes joins two letters spoken close together. Rather than work
around it in the review page, split the clip itself: find the quietest moment in its
middle and cut there, then splice the two halves into fast.json in place of the original.

Existing picks are stored by FILENAME, so they survive — only the display numbers after
the split shift by one.

  python split_clip.py f5 12          # split the clip shown as "12" in the review page
  python split_clip.py f5 12 --at 0.6 # or force the cut 0.6s in
"""
import json, os, re, subprocess, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
CLIPS = os.path.join(HERE, "clips_fast")
MEDIA = os.path.join(HERE, "media_fast")

def quietest_point(src, lo=0.30, hi=0.70):
    """Find the lowest-energy moment in the middle of the clip, in seconds."""
    r = subprocess.run([FF, "-i", src, "-af", "astats=metadata=1:reset=0.05,"
                        "ametadata=print:key=lavfi.astats.Overall.RMS_level",
                        "-f", "null", "-"], capture_output=True, text=True)
    pts = []
    t = None
    for line in r.stderr.splitlines():
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            t = float(m.group(1))
        m = re.search(r"RMS_level=(-?[\d.inf]+)", line)
        if m and t is not None:
            try:
                pts.append((t, float(m.group(1))))
            except ValueError:
                pass
    if not pts:
        return None
    dur = pts[-1][0]
    mid = [(t, v) for t, v in pts if lo * dur <= t <= hi * dur]
    if not mid:
        return None
    return min(mid, key=lambda x: x[1])[0]

def main():
    tag = sys.argv[1]
    shown = int(sys.argv[2])            # the number printed in the review page
    forced = None
    if "--at" in sys.argv:
        forced = float(sys.argv[sys.argv.index("--at") + 1])

    fpath = os.path.join(HERE, "fast.json")
    data = json.load(open(fpath, encoding="utf-8"))
    clips = data[tag]["clips"]
    k = shown - 1
    if not (0 <= k < len(clips)):
        sys.exit(f"clip {shown} out of range (1..{len(clips)})")
    c = clips[k]
    src = os.path.join(CLIPS, c["file"].replace("/", os.sep))
    a, b = c["t"]
    length = b - a
    cut = forced if forced is not None else quietest_point(src)
    if cut is None or not (0.15 < cut < length - 0.15):
        cut = length / 2
        print(f"no clear pause found — splitting at the midpoint ({cut:.2f}s)")
    else:
        print(f"splitting at the quietest point: {cut:.2f}s of {length:.2f}s")

    base = os.path.splitext(os.path.basename(c["file"]))[0]
    out = []
    for suffix, (s, e) in (("a", (a, a + cut)), ("b", (a + cut, b))):
        name = f"{base}{suffix}.mp3"
        dst = os.path.join(CLIPS, tag, name)
        d = (e - s) + 0.2
        subprocess.run([FF, "-y", "-ss", str(max(0, s - 0.06)), "-to", str(e + 0.10),
                        "-i", os.path.join(MEDIA, tag + ".m4a"), "-af",
                        f"afade=t=in:d=0.03,afade=t=out:st={max(0.04, d-0.09):.2f}:d=0.07,"
                        "loudnorm=I=-16:TP=-1.5:LRA=11",
                        "-codec:a", "libmp3lame", "-b:a", "96k", dst], capture_output=True)
        out.append({"i": c["i"], "file": f"{tag}/{name}", "t": [round(s, 2), round(e, 2)],
                    "page": c.get("page"), "wi": c.get("wi"), "word": c.get("word")})
        print(f"  wrote {name}  ({s:.2f}s -> {e:.2f}s)")

    clips[k:k + 1] = out                 # splice in place, keeping order
    for n, cc in enumerate(clips):
        cc["i"] = n                      # renumber so indices stay contiguous
    json.dump(data, open(fpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n{tag} now has {len(clips)} clips. Reload the review page —")
    print(f"clip {shown} is now two clips; your saved picks are unaffected.")

if __name__ == "__main__":
    main()
