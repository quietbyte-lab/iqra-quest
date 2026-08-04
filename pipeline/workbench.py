"""Audio workbench: export EVERY clip from each lesson page so a human can label them.

  python workbench.py build     # cut every utterance -> clips/, write clips.json (+ my guesses)
  python workbench.py join      # build the joined/comparison clips defined in labels.json
  python workbench.py publish   # copy human-labelled clips into the app

The model cannot hear audio, so `guess` fields are only a starting point: they come from
Arabic ASR of each repetition cluster, which is unreliable for isolated letters.
The human corrects them in workbench.html.
"""
import subprocess, re, os, json, sys, shutil

FF = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, "media")
WORK = os.path.join(HERE, "work")
CLIPS = os.path.join(HERE, "clips")
APP = os.path.abspath(os.path.join(HERE, "..", "app"))

KEY = {
    'ا': 'alif', 'ب': 'baa', 'ت': 'taa', 'ث': 'thaa', 'ج': 'jeem', 'ح': 'haa', 'خ': 'khaa',
    'د': 'dal', 'ذ': 'thal', 'ر': 'raa', 'ز': 'zay', 'س': 'seen', 'ش': 'sheen', 'ص': 'saad',
    'ض': 'daad', 'ط': 'taaheavy', 'ظ': 'dhaa', 'ع': 'ayn', 'غ': 'ghayn', 'ف': 'faa',
    'ق': 'qaf', 'ك': 'kaf', 'ل': 'lam', 'م': 'meem', 'ن': 'noon', 'ه': 'ha', 'و': 'waw', 'ي': 'yaa',
}
LESSONS = {
    'p7a': dict(vowel='fathah', page=7,  title='Page 7 · Alif → Jeem',  expected=list('ابتثج'),  video='H1frGQrxNiI'),
    'p7b': dict(vowel='fathah', page=7,  title='Page 7 · Haa → Raa',    expected=list('حخدذر'),  video='SaERFp79YWs'),
    'p7c': dict(vowel='fathah', page=7,  title='Page 7 · Zay → Daad',   expected=list('زسشصض'),  video='m0M1B0-dbn8'),
    'p7d': dict(vowel='fathah', page=7,  title='Page 7 · Taa → Faa',    expected=list('طظعغف'),  video='IRgd5TYNsj8'),
    'p7e': dict(vowel='fathah', page=7,  title='Page 7 · Qaf → Noon',   expected=list('قكلمن'),  video='-xpqYfq_DS4'),
    'p7f': dict(vowel='fathah', page=7,  title='Page 7 · Waw → Yaa',    expected=list('وهي'),    video='BiVCgjmj6O4'),
    'p19': dict(vowel='kasrah', page=19, title='Page 19 · Kasrah',      expected=list('ابتثجحخدذرزسشصضطظعغفقكلمنوهي'), video='R7zOenr4_eo'),
    'p24': dict(vowel='dhammah', page=24, title='Page 24 · Dhammah',    expected=list('ابتثجحخدذرزسشصضطظعغفقكلمنوهي'), video='CSXIzbLdSLQ'),
}
VOWEL_TAIL = {'fathah': 'اى', 'kasrah': 'يى', 'dhammah': 'وؤ'}
STRIP = ''.join(chr(c) for c in range(0x64B, 0x653)) + '\u0640\u0670'

def bare(s):
    s = ''.join(c for c in s if c not in STRIP)
    return (s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
             .replace('ة', 'ه').replace('ى', 'ي').replace('ئ', 'ي').replace('ؤ', 'و'))

def detect(tag, noise="-32dB", mind=0.30, maxgap=2.5):
    path = os.path.join(MEDIA, tag + ".m4a")
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
    segs = [s for s in segs if 0.22 <= s[1] - s[0] <= 2.2]
    clusters, cur = [], []
    for s in segs:
        if cur and s[0] - cur[-1][1] > maxgap:
            clusters.append(cur); cur = []
        cur.append(s)
    if cur:
        clusters.append(cur)
    return clusters

def score(text, letter, vowel):
    letters = ''.join(c for c in bare(text) if '\u0621' <= c <= '\u064a')
    if not letters or letter not in letters:
        return 0.0
    tails = VOWEL_TAIL[vowel]
    syl = sum(1 for i in range(len(letters) - 1)
              if letters[i] == letter and letters[i + 1] in tails)
    return min(syl, 6) * 0.75 + min(letters.count(letter), 6) * 0.30 + (0.5 if letters[:1] == letter else 0)

def guess_for(text, vowel, expected):
    """My best reading of what this cluster is — starting point only."""
    if not text.strip():
        return {'letter': None, 'conf': 0, 'why': 'no speech recognised', 'alts': []}
    ranked = sorted(((score(text, L, vowel), L) for L in expected), reverse=True)
    top = [{'letter': L, 'score': round(s, 2)} for s, L in ranked[:3] if s > 0]
    if not top:
        return {'letter': None, 'conf': 0, 'why': 'sounds like explanation, not a drill', 'alts': []}
    best = top[0]
    conf = 'high' if best['score'] >= 2.5 else 'medium' if best['score'] >= 1.2 else 'low'
    return {'letter': best['letter'], 'conf': conf, 'why': f"ASR heard “{text.strip()[:60]}”",
            'alts': top[1:]}

def build():
    old = {}
    p = os.path.join(WORK, "clusters.json")
    if os.path.exists(p):                       # reuse ASR text from the earlier pass
        for tag, cls in json.load(open(p, encoding="utf-8")).items():
            for c in cls:
                if c.get('segs'):
                    old[(tag, round(c['segs'][0][0], 1))] = c.get('text', '')
    shutil.rmtree(CLIPS, ignore_errors=True)
    out = {'lessons': []}
    for tag, meta in LESSONS.items():
        src = os.path.join(MEDIA, tag + ".m4a")
        if not os.path.exists(src):
            print("missing", tag); continue
        os.makedirs(os.path.join(CLIPS, tag), exist_ok=True)
        clusters = detect(tag)
        lesson = dict(meta, tag=tag, clusters=[])
        for ci, segs in enumerate(clusters):
            text = old.get((tag, round(segs[0][0], 1)), '')
            reps = []
            for ri, (a, b) in enumerate(segs):
                name = f"{ci:03}_{ri}.mp3"
                dst = os.path.join(CLIPS, tag, name)
                dur = (b - a) + 0.26
                subprocess.run([FF, "-y", "-ss", str(max(0, a - 0.11)), "-to", str(b + 0.17),
                                "-i", src, "-af",
                                f"afade=t=in:d=0.04,afade=t=out:st={max(0.04, dur-0.10):.2f}:d=0.08,"
                                "loudnorm=I=-16:TP=-1.5:LRA=11",
                                "-codec:a", "libmp3lame", "-b:a", "96k", dst], capture_output=True)
                reps.append({'id': f"{tag}-{ci:03}-{ri}", 'file': f"{tag}/{name}",
                             'start': a, 'dur': round(b - a, 2)})
            lesson['clusters'].append({
                'id': f"{tag}-{ci:03}", 'start': segs[0][0], 'n': len(segs),
                'asr': text, 'guess': guess_for(text, meta['vowel'], meta['expected']),
                'likelyDrill': len(segs) >= 3, 'reps': reps})
        out['lessons'].append(lesson)
        print(f"{tag}: {len(clusters)} clusters, {sum(len(c) for c in clusters)} clips")
    json.dump(out, open(os.path.join(HERE, "clips.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    total = sum(len(c['reps']) for l in out['lessons'] for c in l['clusters'])
    print(f"wrote clips.json — {total} clips total")

def _labels():
    p = os.path.join(HERE, "labels.json")
    if not os.path.exists(p):
        sys.exit("labels.json not found — export it from workbench.html into pipeline/")
    return json.load(open(p, encoding="utf-8"))

def _clip_path(cid):
    tag = cid.split('-')[0]
    ci, ri = cid.split('-')[1], cid.split('-')[2]
    return os.path.join(CLIPS, tag, f"{ci}_{ri}.mp3")

def join():
    """Build the comparison/joined clips the human defined."""
    data = _labels()
    outdir = os.path.join(HERE, "joined")
    os.makedirs(outdir, exist_ok=True)
    for j in data.get('joins', []):
        parts = [_clip_path(c) for c in j['clips'] if os.path.exists(_clip_path(c))]
        if not parts:
            print("skip (no clips):", j.get('name')); continue
        gap = float(j.get('gap', 0.45))
        sil = os.path.join(WORK, "sil.wav")
        subprocess.run([FF, "-y", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=mono",
                        "-t", str(gap), sil], capture_output=True)
        lst = os.path.join(WORK, "j.txt")
        with open(lst, "w", encoding="utf-8") as fh:
            for k, p in enumerate(parts):
                if k: fh.write(f"file '{sil}'\n")
                fh.write(f"file '{p}'\n")
        name = re.sub(r'[^a-zA-Z0-9_-]+', '-', j.get('name') or 'joined').strip('-')
        dst = os.path.join(outdir, name + ".mp3")
        subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst,
                        "-codec:a", "libmp3lame", "-b:a", "96k", dst], capture_output=True)
        print("joined ->", os.path.relpath(dst, HERE), f"({len(parts)} clips)")

def _book():
    """Load app/data/book.js so a typed word can be resolved to page + index."""
    p = os.path.join(APP, "data", "book.js")
    if not os.path.exists(p):
        return {}
    txt = open(p, encoding="utf-8").read()
    txt = txt[txt.index('=') + 1:].rstrip().rstrip(';')
    pages = json.loads(txt).get('pages', {})
    idx = {}
    for pg, meta in pages.items():
        items = (meta.get('grid', []) + meta.get('strip', [])) if meta.get('type') == 'letters' \
                else meta.get('words', [])
        for i, w in enumerate(items):
            idx.setdefault(bare(w), (int(pg), i + 1))
    return idx

def publish():
    """Copy human-approved clips into the app."""
    data = _labels()
    words = _book()
    n_letter = n_word = n_cmp = 0
    for cid, lab in data.get('clips', {}).items():
        kind = lab.get('kind')
        src = _clip_path(cid)
        if not os.path.exists(src):
            continue
        if kind == 'letter' and lab.get('letter') in KEY and lab.get('vowel'):
            d = os.path.join(APP, "audio", "letters", lab['vowel'])
            os.makedirs(d, exist_ok=True)
            shutil.copyfile(src, os.path.join(d, KEY[lab['letter']] + ".mp3"))
            n_letter += 1
        elif kind == 'word':
            hit = words.get(bare(lab.get('word') or ''))
            if not hit:
                print(f"  ? word not found in book.js: {lab.get('word')!r} ({cid})"); continue
            page, index = hit
            d = os.path.join(APP, "audio", "pages", f"p{page}")
            os.makedirs(d, exist_ok=True)
            shutil.copyfile(src, os.path.join(d, f"{index:02}.mp3"))
            n_word += 1
    jdir = os.path.join(HERE, "joined")
    if os.path.isdir(jdir) and data.get('joins'):
        d = os.path.join(APP, "audio", "compare")
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(jdir):
            shutil.copyfile(os.path.join(jdir, f), os.path.join(d, f))
            n_cmp += 1
    write_manifest()
    print(f"published {n_letter} letter clips, {n_word} word clips, {n_cmp} comparison clips")
    print("Reminder: teacher's voice — keep it out of any public repo until he approves.")

def write_manifest():
    """List every published clip so the app knows what exists (and never requests what doesn't)."""
    root = os.path.join(APP, "audio")
    files = []
    for dirpath, _, names in os.walk(root):
        for n in names:
            if n.endswith(".mp3"):
                rel = os.path.relpath(os.path.join(dirpath, n), APP).replace(os.sep, "/")
                files.append(rel)
    os.makedirs(root, exist_ok=True)
    json.dump(sorted(files), open(os.path.join(root, "manifest.json"), "w", encoding="utf-8"), indent=0)
    print(f"manifest: {len(files)} audio files available to the app")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    {'build': build, 'join': join, 'publish': publish}[cmd]()
