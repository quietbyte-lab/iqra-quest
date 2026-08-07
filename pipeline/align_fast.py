"""Align clips to words by LISTENING to them, not by counting positions.

Positional mapping failed because the video does not spend one utterance per book cell:
page 24's letter grid has 29 cells but far fewer utterances, so every later page drifted.

This instead transcribes each clip and matches it against that page range's known
vocabulary — a closed set of ~250 words — then aligns the sequence monotonically, so a
missing or merged clip costs one word rather than shifting everything after it.

  python align_fast.py asr f5        # transcribe the clips (slow, resumable)
  python align_fast.py align f5      # match + align, write alignment.json
  python align_fast.py publish f5    # copy only confident matches into the app
"""
import json, os, sys, subprocess, shutil, difflib

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, "clips_fast")
WORK = os.path.join(HERE, "work")
APP = os.path.abspath(os.path.join(HERE, "..", "app"))
FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
os.makedirs(WORK, exist_ok=True)

STRIP = ''.join(chr(c) for c in range(0x64B, 0x653)) + '\u0640\u0670'
def bare(s):
    s = ''.join(c for c in (s or '') if c not in STRIP)
    return (s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
             .replace('ة', 'ه').replace('ى', 'ي').replace('ئ', 'ي').replace('ؤ', 'و')
             .replace(' ', ''))

def book_pages():
    txt = open(os.path.join(APP, "data", "book.js"), encoding="utf-8").read()
    txt = txt[txt.index('=') + 1:].rstrip().rstrip(';')
    out = {}
    for pg, meta in json.loads(txt).get("pages", {}).items():
        out[int(pg)] = (meta.get("grid", []) + meta.get("strip", [])) \
            if meta.get("type") == "letters" else meta.get("words", [])
    return out

def asr(tag):
    from faster_whisper import WhisperModel
    model = WhisperModel("base", device="cpu", compute_type="int8",
                         cpu_threads=max(2, (os.cpu_count() or 4) - 1))
    fast = json.load(open(os.path.join(HERE, "fast.json"), encoding="utf-8"))[tag]
    path = os.path.join(WORK, f"asr_{tag}.json")
    done = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    todo = [c for c in fast["clips"] if str(c["i"]) not in done]
    print(f"{tag}: {len(todo)} clips to transcribe")
    for n, c in enumerate(todo):
        src = os.path.join(CLIPS, c["file"].replace("/", os.sep))
        wav = os.path.join(WORK, "a.wav")
        subprocess.run([FF, "-y", "-i", src, "-ar", "16000", "-ac", "1", wav],
                       capture_output=True)
        try:
            segs, _ = model.transcribe(wav, language="ar", beam_size=1,
                                       condition_on_previous_text=False, vad_filter=False)
            done[str(c["i"])] = " ".join(s.text for s in segs).strip()
        except Exception:
            done[str(c["i"])] = ""
        json.dump(done, open(path, "w", encoding="utf-8"), ensure_ascii=False)
        if n % 25 == 0:
            print(f"  {n}/{len(todo)}")
    print(f"{tag}: transcribed {len(done)} clips")

# ASR writes the short vowels as long ones: بُسِطَ comes back as "بوسيطو", تَتُ as "تاتو".
# Comparing letter-for-letter therefore punishes correct matches, so compare the
# CONSONANT SKELETON — drop ا/و/ي from both sides and the two line up.
def skel(s):
    return ''.join(c for c in bare(s) if c not in 'اوي')

def score(heard, word):
    h, w = bare(heard), bare(word)
    if not h or not w:
        return 0.0
    hs, ws = skel(heard), skel(word)
    if not hs or not ws:
        return 0.0
    # A clip of the teacher EXPLAINING is much longer than the word being drilled.
    # Without this guard a one-letter target like أُ ("ا") matched the sentence
    # "الكسرة" at 0.95, because containment is meaningless for short targets.
    if len(hs) > 2 * len(ws) + 2:
        return 0.0
    if ws == hs:
        return 1.0
    # containment only counts when the target is long enough to be distinctive
    if len(ws) >= 3 and (ws in hs or hs in ws):
        return 0.9
    best = difflib.SequenceMatcher(None, ws, hs).ratio()
    full = difflib.SequenceMatcher(None, w, h).ratio()
    if len(w) >= 4 and (w in h or h in w):
        full = max(full, 0.95)
    return max(best, full)

def align(tag):
    fast = json.load(open(os.path.join(HERE, "fast.json"), encoding="utf-8"))[tag]
    heard = json.load(open(os.path.join(WORK, f"asr_{tag}.json"), encoding="utf-8"))
    book = book_pages()
    words = [(pg, i, w) for pg in fast["pages"] for i, w in enumerate(book.get(pg, []))]
    clips = fast["clips"]
    C, W = len(clips), len(words)
    S = [[score(heard.get(str(clips[c]["i"]), ""), words[w][2]) for w in range(W)]
         for c in range(C)]
    # monotonic alignment: a clip may be skipped, a word may have no clip
    NEG = -0.35
    dp = [[0.0] * (W + 1) for _ in range(C + 1)]
    bk = [[None] * (W + 1) for _ in range(C + 1)]
    for i in range(1, C + 1):
        for j in range(1, W + 1):
            best, mv = dp[i - 1][j] + NEG, 'skipC'
            if dp[i][j - 1] + NEG > best:
                best, mv = dp[i][j - 1] + NEG, 'skipW'
            pair = dp[i - 1][j - 1] + S[i - 1][j - 1]
            if pair > best:
                best, mv = pair, 'pair'
            dp[i][j], bk[i][j] = best, mv
    pairs, i, j = {}, C, W
    while i > 0 and j > 0:
        mv = bk[i][j]
        if mv == 'pair':
            pairs[j - 1] = (i - 1, S[i - 1][j - 1]); i -= 1; j -= 1
        elif mv == 'skipC': i -= 1
        else: j -= 1
    out = []
    for w in range(W):
        pg, wi, word = words[w]
        c, sc = pairs.get(w, (None, 0))
        out.append({"page": pg, "wi": wi, "word": word,
                    "clip": clips[c]["file"] if c is not None else None,
                    "heard": heard.get(str(clips[c]["i"]), "") if c is not None else "",
                    "score": round(sc, 2)})
    json.dump(out, open(os.path.join(HERE, f"alignment_{tag}.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    good = [o for o in out if o["score"] >= 0.55]
    print(f"{tag}: {len(good)}/{W} words matched at >=0.55")
    for pg in fast["pages"]:
        g = [o for o in out if o["page"] == pg and o["score"] >= 0.55]
        tot = sum(1 for o in out if o["page"] == pg)
        print(f"  page {pg:>3}: {len(g):>3}/{tot:<3} confident")

def publish(tag, thresh=0.55):
    out = json.load(open(os.path.join(HERE, f"alignment_{tag}.json"), encoding="utf-8"))
    n = 0
    for o in out:
        if not o["clip"] or o["score"] < thresh:
            continue
        d = os.path.join(APP, "audio", "pages", f"p{o['page']}")
        os.makedirs(d, exist_ok=True)
        src = os.path.join(CLIPS, o["clip"].replace("/", os.sep))
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(d, f"{o['wi'] + 1:02}.mp3")); n += 1
    root = os.path.join(APP, "audio")
    files = [os.path.relpath(os.path.join(d, f), APP).replace(os.sep, "/")
             for d, _, fs in os.walk(root) for f in fs if f.endswith(".mp3")]
    json.dump(sorted(files), open(os.path.join(root, "manifest.json"), "w", encoding="utf-8"), indent=0)
    print(f"published {n} verified clips; manifest lists {len(files)}")
    print("Words below the confidence threshold keep the device voice rather than a guess.")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "align"
    tag = sys.argv[2] if len(sys.argv) > 2 else "f5"
    {"asr": asr, "align": align, "publish": publish}[cmd](tag)
