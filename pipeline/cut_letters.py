"""Cut a per-letter audio library from the teacher's letter-grid lessons.

The lessons drill ONE letter at a time with several repetitions, so the pipeline is:
  detect  - silence-detect utterances, group them into repetition clusters
  asr     - transcribe each cluster once (repetitions concatenated -> clearer ASR)
  match   - order-constrained alignment of clusters to the expected letter sequence
  cut     - export the cleanest repetition of each matched cluster

Because ASR on isolated Arabic letters is imperfect, output goes to a REVIEW set that a
human confirms by ear in verify.html; only approved clips are copied into the app.

Usage: python cut_letters.py detect|asr|match|cut|all
"""
import subprocess, re, os, json, sys

FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, "media")
WORK = os.path.join(HERE, "work")
REVIEW = os.path.join(HERE, "review")
os.makedirs(WORK, exist_ok=True)
os.makedirs(REVIEW, exist_ok=True)

KEY = {
    'ا': 'alif', 'ب': 'baa', 'ت': 'taa', 'ث': 'thaa', 'ج': 'jeem', 'ح': 'haa', 'خ': 'khaa',
    'د': 'dal', 'ذ': 'thal', 'ر': 'raa', 'ز': 'zay', 'س': 'seen', 'ش': 'sheen', 'ص': 'saad',
    'ض': 'daad', 'ط': 'taaheavy', 'ظ': 'dhaa', 'ع': 'ayn', 'غ': 'ghayn', 'ف': 'faa',
    'ق': 'qaf', 'ك': 'kaf', 'ل': 'lam', 'م': 'meem', 'ن': 'noon', 'ه': 'ha', 'و': 'waw', 'ي': 'yaa',
}
LESSONS = {
    'p7a': ('fathah', list('ابتثج')),
    'p7b': ('fathah', list('حخدذر')),
    'p7c': ('fathah', list('زسشصض')),
    'p7d': ('fathah', list('طظعغف')),
    'p7e': ('fathah', list('قكلمن')),
    'p7f': ('fathah', list('وهي')),
    'p19': ('kasrah', list('ابتثجحخدذرزسشصضطظعغفقكلمنوهي')),
    'p24': ('dhammah', list('ابتثجحخدذرزسشصضطظعغفقكلمنوهي')),
}
# how ASR tends to render "letter + vowel" (the vowel becomes a long vowel letter)
VOWEL_TAIL = {'fathah': 'اى', 'kasrah': 'يى', 'dhammah': 'وؤ'}
STRIP = ''.join(chr(c) for c in range(0x64B, 0x653)) + '\u0640\u0670'

def bare(s):
    s = ''.join(c for c in s if c not in STRIP)
    return (s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
             .replace('ة', 'ه').replace('ى', 'ي').replace('ئ', 'ي').replace('ؤ', 'و'))

# ---------------- stage 1: detect + cluster ----------------
def detect_file(tag, noise="-32dB", mind=0.30, maxgap=2.5):
    path = os.path.join(MEDIA, tag + ".m4a")
    r = subprocess.run([FF, "-i", path, "-af", f"silencedetect=noise={noise}:d={mind}", "-f", "null", "-"],
                       capture_output=True, text=True)
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
    segs = [s for s in segs if 0.25 <= s[1] - s[0] <= 1.9]
    clusters, cur = [], []
    for s in segs:
        if cur and s[0] - cur[-1][1] > maxgap:
            clusters.append(cur); cur = []
        cur.append(s)
    if cur:
        clusters.append(cur)
    return [{'segs': c} for c in clusters if len(c) >= 3]

def detect():
    data = {}
    for tag in LESSONS:
        if not os.path.exists(os.path.join(MEDIA, tag + ".m4a")):
            print("missing media:", tag); continue
        data[tag] = detect_file(tag)
        print(f"{tag}: {len(data[tag])} repetition clusters")
    json.dump(data, open(os.path.join(WORK, "clusters.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

# ---------------- stage 2: asr per cluster ----------------
def asr():
    from faster_whisper import WhisperModel
    # Whisper always processes a fixed 30s window, so per-call cost is constant:
    # use greedy decoding and pack as many repetitions as fit into that free window.
    model = WhisperModel("base", device="cpu", compute_type="int8",
                         cpu_threads=max(2, (os.cpu_count() or 4) - 1))
    path = os.path.join(WORK, "clusters.json")
    data = json.load(open(path, encoding="utf-8"))
    for tag, clusters in data.items():
        src = os.path.join(MEDIA, tag + ".m4a")
        for ci, cl in enumerate(clusters):
            if 'text' in cl:
                continue
            parts = []
            for j, (a, b) in enumerate(cl['segs'][:8]):
                p = os.path.join(WORK, f"part{j}.wav")
                subprocess.run([FF, "-y", "-ss", str(max(0, a - 0.12)), "-to", str(b + 0.15), "-i", src,
                                "-ar", "16000", "-ac", "1", p], capture_output=True)
                parts.append(p)
            lst = os.path.join(WORK, "list.txt")
            with open(lst, "w", encoding="utf-8") as fh:
                for p in parts:
                    fh.write(f"file '{p}'\n")
            joined = os.path.join(WORK, "join.wav")
            subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst,
                            "-ar", "16000", "-ac", "1", joined], capture_output=True)
            try:
                out, _ = model.transcribe(joined, language="ar", beam_size=1,
                                          condition_on_previous_text=False, vad_filter=False)
                cl['text'] = " ".join(s.text for s in out).strip()
            except Exception:
                cl['text'] = ""
            cl['bare'] = bare(cl['text'])
            json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{tag}: transcribed {len(clusters)} clusters")

# ---------------- stage 3: order-constrained match ----------------
def cluster_score(cl, letter, vowel):
    b = cl.get('bare', '')
    letters = ''.join(c for c in b if '\u0621' <= c <= '\u064a')
    if not letters or letter not in letters:
        return 0.0
    # ASR renders a drilled letter as an open syllable: kasrah -> بي, dhammah -> بو,
    # fathah -> با/ب. A cluster is a drill when that syllable repeats.
    tails = VOWEL_TAIL[vowel]
    syl = sum(1 for i in range(len(letters) - 1)
              if letters[i] == letter and letters[i + 1] in tails)
    solo = letters.count(letter)
    s = min(syl, 6) * 0.75 + min(solo, 6) * 0.30
    if letters[:1] == letter:
        s += 0.5
    if len(letters) <= 10:
        s += 0.3                                  # short = drill, not an explanation
    return s

def pick_seg(cl):
    """Longest repetition in the cluster is usually the clearest."""
    return max(cl['segs'], key=lambda x: x[1] - x[0])

def match():
    data = json.load(open(os.path.join(WORK, "clusters.json"), encoding="utf-8"))
    picks = {}
    for tag, clusters in data.items():
        vowel, expected = LESSONS[tag]
        # pass 1 — order-preserving global alignment (letters x clusters).
        # A greedy scan commits to early mistakes and blocks everything after it;
        # this maximises total evidence across the whole lesson instead.
        n, m = len(expected), len(clusters)
        MIN = 1.2
        sc = [[cluster_score(clusters[j], expected[i], vowel) for j in range(m)] for i in range(n)]
        dp = [[0.0] * (m + 1) for _ in range(n + 1)]
        bk = [[None] * (m + 1) for _ in range(n + 1)]
        for i in range(1, n + 1):
            for j in range(1, m + 1):
                best, mv = dp[i - 1][j], 'skipL'            # letter left unmatched
                if dp[i][j - 1] > best:
                    best, mv = dp[i][j - 1], 'skipC'        # cluster is not a letter drill
                pair = sc[i - 1][j - 1]
                if pair >= MIN and dp[i - 1][j - 1] + pair > best:
                    best, mv = dp[i - 1][j - 1] + pair, 'pair'
                dp[i][j], bk[i][j] = best, mv
        assign = {}
        i, j = n, m
        while i > 0 and j > 0:
            mv = bk[i][j]
            if mv == 'pair':
                assign[i - 1] = j - 1; i -= 1; j -= 1
            elif mv == 'skipC':
                j -= 1
            else:
                i -= 1
        chosen = []
        for k, letter in enumerate(expected):
            if k in assign:
                ci = assign[k]
                chosen.append({'letter': letter, 'vowel': vowel, 'tag': tag, 'ci': ci,
                               't': pick_seg(clusters[ci]), 'text': clusters[ci].get('text', ''),
                               'score': round(sc[k][ci], 2), 'method': 'asr'})
            else:
                chosen.append({'letter': letter, 'vowel': vowel, 'tag': tag, 'ci': None,
                               't': None, 'text': '', 'score': 0, 'method': None})

        # pass 2 — fill the gaps positionally, between the surrounding confident anchors
        used = {c['ci'] for c in chosen if c['ci'] is not None}
        for k, c in enumerate(chosen):
            if c['ci'] is not None:
                continue
            lo = max([chosen[j]['ci'] for j in range(k) if chosen[j]['ci'] is not None], default=-1)
            hi = min([chosen[j]['ci'] for j in range(k + 1, len(chosen)) if chosen[j]['ci'] is not None],
                     default=len(clusters))
            free = [i for i in range(lo + 1, hi) if i not in used]
            if free:
                i = free[0]
                used.add(i)
                c.update({'ci': i, 't': pick_seg(clusters[i]), 'text': clusters[i].get('text', ''),
                          'method': 'position'})
        picks[tag] = chosen
        a = sum(1 for c in chosen if c['method'] == 'asr')
        p = sum(1 for c in chosen if c['method'] == 'position')
        print(f"{tag} ({vowel}): {a} by ASR + {p} positional = {a+p}/{len(expected)}")
    json.dump(picks, open(os.path.join(HERE, "candidates.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

# ---------------- stage 4: cut to review folder ----------------
def cut():
    picks = json.load(open(os.path.join(HERE, "candidates.json"), encoding="utf-8"))
    n = 0
    manifest = []
    for tag, chosen in picks.items():
        src = os.path.join(MEDIA, tag + ".m4a")
        for c in chosen:
            if not c['t'] or c['letter'] not in KEY:
                continue
            a, b = c['t']
            outdir = os.path.join(REVIEW, c['vowel'])
            os.makedirs(outdir, exist_ok=True)
            name = KEY[c['letter']] + ".mp3"
            dst = os.path.join(outdir, name)
            dur = (b - a) + 0.25
            subprocess.run([FF, "-y", "-ss", str(max(0, a - 0.12)), "-to", str(b + 0.18), "-i", src,
                            "-af", f"afade=t=in:d=0.04,afade=t=out:st={max(0.04, dur-0.10):.2f}:d=0.08,"
                                   "loudnorm=I=-16:TP=-1.5:LRA=11",
                            "-codec:a", "libmp3lame", "-b:a", "96k", dst], capture_output=True)
            manifest.append({'vowel': c['vowel'], 'letter': c['letter'], 'key': KEY[c['letter']],
                             'file': f"{c['vowel']}/{name}", 'asr': c['text'], 'score': c['score'],
                             'method': c.get('method'), 'source': tag, 't': c['t']})
            n += 1
    json.dump(manifest, open(os.path.join(REVIEW, "manifest.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"cut {n} candidate clips into pipeline/review/ — confirm them in verify.html")

# ---------------- stage 5: publish approved clips into the app ----------------
def publish():
    """Copy only human-approved clips from review/ into app/audio/letters/."""
    import shutil
    app_audio = os.path.join(HERE, "..", "app", "audio", "letters")
    apath = os.path.join(HERE, "approvals.json")
    if not os.path.exists(apath):
        sys.exit("approvals.json not found — approve clips in verify.html and save the download here.")
    approvals = json.load(open(apath, encoding="utf-8"))   # {"fathah/baa.mp3": "ب", ...}
    n = 0
    for rel, letter in approvals.items():
        src = os.path.join(REVIEW, rel.replace("/", os.sep))
        if not os.path.exists(src) or letter not in KEY:
            print("skip", rel); continue
        vowel = rel.split("/")[0]
        outdir = os.path.join(app_audio, vowel)
        os.makedirs(outdir, exist_ok=True)
        shutil.copyfile(src, os.path.join(outdir, KEY[letter] + ".mp3"))
        n += 1
    print(f"published {n} approved clips to app/audio/letters/")
    print("Reminder: this is the teacher's voice — keep it out of any public repo until he approves.")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("detect", "all"): detect()
    if cmd in ("asr", "all"): asr()
    if cmd in ("match", "all"): match()
    if cmd in ("cut", "all"): cut()
    if cmd == "publish": publish()
