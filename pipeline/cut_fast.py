"""v1 audio: cut per-word clips from the FAST series (one utterance per word).

The original series drills each word many times, so every clip was ambiguous. This
series reads each item once, in page order, so the utterances should line up with the
transcribed word lists and labelling becomes index matching rather than guesswork.

Measured over-segmentation is ~1.2-1.3x expected (vs ~10x for the slow series): the
extra segments are the intro and the talk between pages. Those are stripped by taking
only the longest run of evenly-spaced short utterances.

  python cut_fast.py detect     # segment + report how well each video lines up
  python cut_fast.py cut        # export clips_fast/<tag>/NNN.mp3 + fast.json
"""
import subprocess, re, os, json, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
MEDIA = os.path.join(HERE, "media_fast")
OUT = os.path.join(HERE, "clips_fast")
APP = os.path.abspath(os.path.join(HERE, "..", "app"))

COVERS = {
    "f1": [7],
    "f2": [7, 8],
    "f3": list(range(9, 19)),
    "f4": list(range(19, 24)),
    "f5": list(range(24, 31)),
}

def book_pages():
    txt = open(os.path.join(APP, "data", "book.js"), encoding="utf-8").read()
    txt = txt[txt.index('=') + 1:].rstrip().rstrip(';')
    out = {}
    for pg, meta in json.loads(txt).get("pages", {}).items():
        out[int(pg)] = (meta.get("grid", []) + meta.get("strip", [])) \
            if meta.get("type") == "letters" else meta.get("words", [])
    return out

def segments(path, mind=0.30, noise="-32dB"):
    r = subprocess.run([FF, "-i", path, "-af", f"silencedetect=noise={noise}:d={mind}",
                        "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(m.group(1)) for m in re.finditer(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(m.group(1)) for m in re.finditer(r"silence_end: ([\d.]+)", r.stderr)]
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))
    segs, prev = [], 0.0
    for s in starts:
        if s > prev + 0.05:
            segs.append([round(prev, 2), round(s, 2)])
        nxt = [e for e in ends if e > s]
        prev = nxt[0] if nxt else dur
    if prev < dur - 0.05:
        segs.append([round(prev, 2), round(dur, 2)])
    return segs, dur

def word_sized(segs, lo=0.22, hi=2.6):
    return [s for s in segs if lo <= s[1] - s[0] <= hi]

def longest_even_run(segs, max_gap=3.0):
    """The reading pass is a long stretch of evenly spaced utterances; intro chatter
    sits outside it separated by bigger pauses."""
    runs, cur = [], []
    for s in segs:
        if cur and s[0] - cur[-1][1] > max_gap:
            runs.append(cur); cur = []
        cur.append(s)
    if cur:
        runs.append(cur)
    return max(runs, key=len) if runs else []

def detect(report_only=True):
    book = book_pages()
    result = {}
    for tag, pages in COVERS.items():
        p = os.path.join(MEDIA, tag + ".m4a")
        if not os.path.exists(p):
            print(f"{tag}: no audio"); continue
        expected = sum(len(book.get(pg, [])) for pg in pages)
        best = None
        for mind in (0.22, 0.28, 0.34, 0.40, 0.46):
            segs, dur = segments(p, mind)
            ws = word_sized(segs)
            run = longest_even_run(ws)
            for cand, how in ((ws, "all"), (run, "run")):
                gap = abs(len(cand) - expected)
                if best is None or gap < best["gap"]:
                    best = {"gap": gap, "n": len(cand), "mind": mind, "how": how,
                            "segs": cand, "dur": dur}
        pct = 100 * best["n"] / max(1, expected)
        print(f"{tag}: pages {pages[0]}-{pages[-1]}  expected {expected:>3}  "
              f"got {best['n']:>3} ({pct:.0f}%)  [silence>{best['mind']}s, {best['how']}]")
        result[tag] = {"pages": pages, "expected": expected, **{k: best[k] for k in ("n", "mind", "how", "segs")}}
    json.dump({t: {k: v for k, v in d.items() if k != "segs"} | {"segs": d["segs"]}
               for t, d in result.items()},
              open(os.path.join(HERE, "fast_segments.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    return result

def cut():
    data = json.load(open(os.path.join(HERE, "fast_segments.json"), encoding="utf-8"))
    book = book_pages()
    manifest = {}
    for tag, d in data.items():
        src = os.path.join(MEDIA, tag + ".m4a")
        outdir = os.path.join(OUT, tag)
        os.makedirs(outdir, exist_ok=True)
        # flatten the expected word list across this video's pages, in order
        expect = [(pg, i, w) for pg in d["pages"] for i, w in enumerate(book.get(pg, []))]
        rows = []
        for k, (a, b) in enumerate(d["segs"]):
            name = f"{k:03}.mp3"
            dur = (b - a) + 0.26
            subprocess.run([FF, "-y", "-ss", str(max(0, a - 0.10)), "-to", str(b + 0.16),
                            "-i", src, "-af",
                            f"afade=t=in:d=0.03,afade=t=out:st={max(0.04, dur-0.09):.2f}:d=0.07,"
                            "loudnorm=I=-16:TP=-1.5:LRA=11",
                            "-codec:a", "libmp3lame", "-b:a", "96k",
                            os.path.join(outdir, name)], capture_output=True)
            guess = expect[k] if k < len(expect) else None
            rows.append({"i": k, "file": f"{tag}/{name}", "t": [a, b],
                         "page": guess[0] if guess else None,
                         "wi": guess[1] if guess else None,
                         "word": guess[2] if guess else None})
        manifest[tag] = {"pages": d["pages"], "expected": d["expected"], "clips": rows}
        print(f"{tag}: cut {len(rows)} clips")
    json.dump(manifest, open(os.path.join(HERE, "fast.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("wrote fast.json — align and confirm in align.html before publishing")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "detect"
    if cmd == "detect": detect()
    elif cmd == "cut": cut()
