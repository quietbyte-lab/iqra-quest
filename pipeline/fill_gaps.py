"""Recover audio that the clip filter threw away.

Clips were kept only if they were 0.22-2.6s long. Where the teacher reads several
letters with short pauses, silence detection merges them into one longer segment, which
then failed that filter and was discarded — leaving multi-second holes in the timeline.

This re-examines each hole with a shorter silence threshold and splices whatever it
finds back into fast.json, in time order. Nothing already cut is disturbed, and picks
are stored by filename so existing choices survive.

  python fill_gaps.py f5              # report the holes
  python fill_gaps.py f5 --apply      # re-cut them and splice the clips in
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
MEDIA = os.path.join(HERE, "media_fast")
CLIPS = os.path.join(HERE, "clips_fast")
MIN_GAP = 1.2          # holes worth investigating
SIL = 0.16             # tighter than the original pass, to separate quick letters

def segments(src, a, b, mind=SIL, noise="-30dB"):
    r = subprocess.run([FF, "-ss", str(a), "-to", str(b), "-i", src,
                        "-af", f"silencedetect=noise={noise}:d={mind}", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(m.group(1)) for m in re.finditer(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(m.group(1)) for m in re.finditer(r"silence_end: ([\d.]+)", r.stderr)]
    span = b - a
    segs, prev = [], 0.0
    for s in starts:
        if s > prev + 0.05:
            segs.append([prev, s])
        nxt = [e for e in ends if e > s]
        prev = nxt[0] if nxt else span
    if prev < span - 0.05:
        segs.append([prev, span])
    # offset back to absolute time; keep anything that could be a spoken item
    return [[round(a + s, 2), round(a + e, 2)] for s, e in segs if 0.18 <= e - s <= 3.5]

def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "f5"
    apply = "--apply" in sys.argv
    fp = os.path.join(HERE, "fast.json")
    data = json.load(open(fp, encoding="utf-8"))
    clips = data[tag]["clips"]
    src = os.path.join(MEDIA, tag + ".m4a")

    holes = []
    for i in range(len(clips) - 1):
        gap = clips[i + 1]["t"][0] - clips[i]["t"][1]
        if gap >= MIN_GAP:
            holes.append((i, clips[i]["t"][1], clips[i + 1]["t"][0], gap))
    total = sum(h[3] for h in holes)
    print(f"{tag}: {len(holes)} holes, {total:.1f}s of audio never cut")

    added = 0
    for n, (i, a, b, gap) in enumerate(holes):
        found = segments(src, a, b)
        print(f"  after clip {i+1:>3}: {gap:5.1f}s hole -> {len(found)} segment(s) recovered")
        if not apply:
            continue
        for j, (s, e) in enumerate(found):
            name = f"g{i:03}_{j}.mp3"
            dst = os.path.join(CLIPS, tag, name)
            d = (e - s) + 0.2
            subprocess.run([FF, "-y", "-ss", str(max(0, s - 0.06)), "-to", str(e + 0.10),
                            "-i", src, "-af",
                            f"afade=t=in:d=0.03,afade=t=out:st={max(0.04, d-0.09):.2f}:d=0.07,"
                            "loudnorm=I=-16:TP=-1.5:LRA=11",
                            "-codec:a", "libmp3lame", "-b:a", "96k", dst], capture_output=True)
            clips.append({"i": -1, "file": f"{tag}/{name}", "t": [s, e],
                          "page": None, "wi": None, "word": None})
            added += 1

    if apply:
        clips.sort(key=lambda c: c["t"][0])       # keep strict time order
        for n, c in enumerate(clips):
            c["i"] = n
        json.dump(data, open(fp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"\nadded {added} recovered clips; {tag} now has {len(clips)}")
        print("Reload the review page — your saved picks are unaffected.")

if __name__ == "__main__":
    main()
