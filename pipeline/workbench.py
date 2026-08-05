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
ALL_LETTERS = list('ابتثجحخدذرزسشصضطظعغفقكلمنوهي')
# Page 7's letter grid is taught across six videos; every other page has one video.
LETTER_LESSONS = {
    'p7a': dict(vowel='fathah', page=7,  title='Page 7 · Alif → Jeem',  expected=list('ابتثج'),  video='H1frGQrxNiI'),
    'p7b': dict(vowel='fathah', page=7,  title='Page 7 · Haa → Raa',    expected=list('حخدذر'),  video='SaERFp79YWs'),
    'p7c': dict(vowel='fathah', page=7,  title='Page 7 · Zay → Daad',   expected=list('زسشصض'),  video='m0M1B0-dbn8'),
    'p7d': dict(vowel='fathah', page=7,  title='Page 7 · Taa → Faa',    expected=list('طظعغف'),  video='IRgd5TYNsj8'),
    'p7e': dict(vowel='fathah', page=7,  title='Page 7 · Qaf → Noon',   expected=list('قكلمن'),  video='-xpqYfq_DS4'),
    'p7f': dict(vowel='fathah', page=7,  title='Page 7 · Waw → Yaa',    expected=list('وهي'),    video='BiVCgjmj6O4'),
    'p19': dict(vowel='kasrah', page=19, title='Page 19 · Kasrah letters',  expected=ALL_LETTERS, video='R7zOenr4_eo'),
    'p24': dict(vowel='dhammah', page=24, title='Page 24 · Dhammah letters', expected=ALL_LETTERS, video='CSXIzbLdSLQ'),
}
# Exercise pages: the child reads WORDS, so the target vocabulary is that page's word list.
EXERCISE_VIDEO = {
    8: 'YVobBo2io7M', 9: 'm2axU0WGPOY', 10: 'teeeOd5Lgac', 11: 'm_NlyUjUmCE', 12: 'MhOphzkzdCQ',
    13: 'zPJGHJOOFao', 14: 'aK_ayvAVREA', 15: 'JDYXTUIi9EI', 16: 'gMlrxoGTQI8', 17: 'spcfui6Ny_s',
    18: 'mcfDgbPADgo', 20: 'u2BasbNYxqU', 21: 'oI2v2zah524', 22: 'Kd3ET00tk4w', 23: 'ZodqPedUOVY',
    25: 'iJICmd3_oDk', 26: 'nepvaY-p4MA', 27: 'GnuGSLylaro', 28: 'sLcWvOprkVk', 29: 'C17t19gH3N4',
    30: '9ueklrRdc4U',
}
def page_vowel(n):
    return 'fathah' if n <= 18 else 'kasrah' if n <= 23 else 'dhammah'

def book_pages():
    """Word lists straight from the app's transcribed book data."""
    p = os.path.join(APP, "data", "book.js")
    if not os.path.exists(p):
        return {}
    txt = open(p, encoding="utf-8").read()
    txt = txt[txt.index('=') + 1:].rstrip().rstrip(';')
    out = {}
    for pg, meta in json.loads(txt).get('pages', {}).items():
        items = (meta.get('grid', []) + meta.get('strip', [])) if meta.get('type') == 'letters' \
                else meta.get('words', [])
        out[int(pg)] = items
    return out

def build_lessons():
    L = dict(LETTER_LESSONS)
    words = book_pages()
    for n, vid in sorted(EXERCISE_VIDEO.items()):
        L[f'p{n}'] = dict(vowel=page_vowel(n), page=n, title=f'Page {n} · words',
                          expected=ALL_LETTERS, words=words.get(n, []), video=vid, kind='exercise')
    return L

LESSONS = build_lessons()
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

def guess_word(text, words):
    """On exercise pages the vocabulary is known, so match the ASR text to that page's words.

    ASR is far better at whole words than at isolated letters, so these guesses are worth
    something — unlike the letter guesses, which the human had to correct wholesale.
    """
    import difflib
    t = bare(text)
    letters = ''.join(c for c in t if 'ء' <= c <= 'ي' or c == ' ').strip()
    if not letters or not words:
        return None
    best, best_r = None, 0.0
    for w in words:
        bw = bare(w)
        if not bw:
            continue
        r = max(difflib.SequenceMatcher(None, bw, chunk).ratio()
                for chunk in (letters, *letters.split())) if letters else 0
        if bw and bw in letters:
            r = max(r, 0.95)
        if r > best_r:
            best_r, best = r, w
    if best_r < 0.6:
        return None
    return {'word': best, 'conf': 'high' if best_r >= 0.85 else 'medium' if best_r >= 0.7 else 'low',
            'ratio': round(best_r, 2)}

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
    prev = {}
    cj = os.path.join(HERE, "clips.json")
    if os.path.exists(cj):        # keep already-cut lessons so a rebuild is incremental
        for L in json.load(open(cj, encoding="utf-8"))['lessons']:
            prev[L['tag']] = L
    out = {'lessons': []}
    for tag, meta in LESSONS.items():
        src = os.path.join(MEDIA, tag + ".m4a")
        if not os.path.exists(src):
            print("no audio yet:", tag); continue
        cut_dir = os.path.join(CLIPS, tag)
        if tag in prev and os.path.isdir(cut_dir) and os.listdir(cut_dir):
            out['lessons'].append(prev[tag])
            print(f"{tag}: kept ({len(prev[tag]['clusters'])} clusters)")
            continue
        os.makedirs(cut_dir, exist_ok=True)
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

def lang(model_size="base"):
    """Is the teacher DRILLING a sound (Arabic) or EXPLAINING (English)?

    Two independent methods, then scored against each other:
      A  auto-detect  — one language-ID pass over the clip.
      B  forced pair  — transcribe the SAME clip twice, once forced to Arabic and once
                        forced to English, and see which reading the model is more
                        confident in (mean token log-probability).

    Neither is trusted alone. Where A and B agree we treat the verdict as reliable;
    where they disagree the clip is flagged and BOTH readings are shown to the human,
    who decides. Forcing Arabic onto English speech produces confident-looking garbage
    (e.g. "لدينا ثلاثة لطيفة now"), which is exactly what poisoned the first attempt.
    """
    from faster_whisper import WhisperModel
    model = WhisperModel(model_size, device="cpu", compute_type="int8",
                         cpu_threads=max(2, (os.cpu_count() or 4) - 1))
    data = json.load(open(os.path.join(HERE, "clips.json"), encoding="utf-8"))
    outp = os.path.join(WORK, "lang.json")
    out = json.load(open(outp, encoding="utf-8")) if os.path.exists(outp) else {}

    def read(wav, language):
        segs, info = model.transcribe(wav, language=language, beam_size=1,
                                      condition_on_previous_text=False, vad_filter=False)
        segs = list(segs)
        text = " ".join(s.text for s in segs).strip()
        lp = sum(s.avg_logprob for s in segs) / len(segs) if segs else -9.0
        return text, round(lp, 3), info

    todo = [(L, c) for L in data['lessons'] for c in L['clusters']
            if c['id'] not in out and len(c['reps']) >= 2]
    print(f"{len(todo)} clusters to analyse (model={model_size})")
    for k, (L, c) in enumerate(todo):
        src = os.path.join(MEDIA, L['tag'] + ".m4a")
        parts = []
        for j, r in enumerate(c['reps'][:8]):
            p = os.path.join(WORK, f"lp{j}.wav")
            subprocess.run([FF, "-y", "-ss", str(max(0, r['start'] - 0.11)),
                            "-to", str(r['start'] + r['dur'] + 0.17), "-i", src,
                            "-ar", "16000", "-ac", "1", p], capture_output=True)
            parts.append(p)
        lst = os.path.join(WORK, "lp.txt")
        with open(lst, "w", encoding="utf-8") as fh:
            for p in parts:
                fh.write(f"file '{p}'\n")
        joined = os.path.join(WORK, "lp.wav")
        subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst,
                        "-ar", "16000", "-ac", "1", joined], capture_output=True)
        try:
            # ---- method A: auto language ID (cheap)
            try:
                a_lang, a_prob, _ = model.detect_language(joined)
            except Exception:
                _, _, info = read(joined, None)
                a_lang, a_prob = info.language, info.language_probability
            # ---- method B: forced Arabic (also gives the text we need downstream)
            ar_t, ar_lp, _ = read(joined, 'ar')
            # ---- method C: does the Arabic reading match a word this page actually teaches?
            # Strongest signal available — the page vocabulary is a closed set of ~24 words,
            # so a high match is decisive and lets us skip the English pass entirely.
            words = L.get('words') or []
            gw = guess_word(ar_t, words) if words else None
            rec = {'auto': {'lang': a_lang, 'prob': round(float(a_prob), 3)},
                   'ar': {'text': ar_t, 'lp': ar_lp},
                   'wordMatch': gw}
            if gw and gw['ratio'] >= 0.85:
                rec.update({'en': {'text': '', 'lp': None}, 'forced': 'ar', 'margin': None,
                            'agree': a_lang == 'ar', 'conf': 'high', 'verdict': 'ar',
                            'decidedBy': 'page-vocabulary'})
            else:
                en_t, en_lp, _ = read(joined, 'en')
                forced = 'ar' if ar_lp >= en_lp else 'en'
                margin = round(abs(ar_lp - en_lp), 3)
                agree = (a_lang == 'ar') == (forced == 'ar')
                conf = 'high' if (agree and margin >= 0.25 and a_prob >= 0.70) else \
                       'medium' if agree else 'low'
                rec.update({'en': {'text': en_t, 'lp': en_lp}, 'forced': forced,
                            'margin': margin, 'agree': agree, 'conf': conf,
                            'verdict': forced if agree else 'unsure',
                            'decidedBy': 'both-methods'})
            out[c['id']] = rec
        except Exception as e:
            out[c['id']] = {'verdict': 'error', 'conf': 'low', 'err': str(e)[:120]}
        json.dump(out, open(outp, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        if k % 25 == 0:
            print(f"  {k}/{len(todo)}")
    report(out)

def report(out=None):
    """Honest scoreboard: how often did the two language methods actually agree?"""
    if out is None:
        out = json.load(open(os.path.join(WORK, "lang.json"), encoding="utf-8"))
    both = {k: v for k, v in out.items() if v.get('decidedBy') == 'both-methods'}
    vocab = {k: v for k, v in out.items() if v.get('decidedBy') == 'page-vocabulary'}
    agree = sum(1 for v in both.values() if v.get('agree'))
    # where the page vocabulary settled it, treat that as ground truth and score method A
    autoRight = sum(1 for v in vocab.values() if v.get('auto', {}).get('lang') == 'ar')
    print(f"\n=== how the two language methods compared ({len(out)} clusters) ===")
    if both:
        print(f"  judged by both methods:      {len(both)}")
        print(f"    agreed:                    {agree} ({100*agree/len(both):.0f}%)")
        print(f"    disagreed -> 'unsure':     {len(both)-agree}  (both readings shown to you)")
    if vocab:
        print(f"  settled by page vocabulary:  {len(vocab)}  (a real word from that page)")
        print(f"    ...of these, my auto-detect method called it Arabic: "
              f"{autoRight}/{len(vocab)} ({100*autoRight/len(vocab):.0f}%)")
        print(f"    ^ this is the fairest test of my method: the word match is near-certain,")
        print(f"      so anything my method missed here is my method being wrong.")
    print(f"  verdict Arabic (drills):     {sum(1 for v in out.values() if v.get('verdict')=='ar')}")
    print(f"  verdict English (talking):   {sum(1 for v in out.values() if v.get('verdict')=='en')}")
    print(f"  unsure (needs your ear):     {sum(1 for v in out.values() if v.get('verdict')=='unsure')}")

def relabel():
    """Fold the language analysis back into clips.json without re-cutting audio."""
    p = os.path.join(HERE, "clips.json")
    data = json.load(open(p, encoding="utf-8"))
    lp = os.path.join(WORK, "lang.json")
    if not os.path.exists(lp):
        sys.exit("run `python workbench.py lang` first")
    L2 = json.load(open(lp, encoding="utf-8"))
    changed = 0
    for L in data['lessons']:
        words = L.get('words') or []
        for c in L['clusters']:
            r = L2.get(c['id'])
            if not r:
                continue
            verdict = r.get('verdict', 'unsure')
            c['speech'] = verdict
            c['conf'] = r.get('conf', 'low')
            c['agree'] = r.get('agree', False)
            c['arText'] = (r.get('ar') or {}).get('text', '')
            c['enText'] = (r.get('en') or {}).get('text', '')
            c['margin'] = r.get('margin', 0)
            if verdict == 'ar':
                c['asr'] = c['arText'] or c.get('asr', '')
                c['likelyDrill'] = len(c['reps']) >= 2
                if words:                                    # exercise page -> match a word
                    gw = guess_word(c['asr'], words)
                    c['guessWord'] = gw
                    c['guess'] = ({'letter': None, 'conf': gw['conf'],
                                   'why': f"heard “{c['asr'][:50]}”", 'alts': []}
                                  if gw else guess_for(c['asr'], L['vowel'], L['expected']))
                else:
                    c['guess'] = guess_for(c['asr'], L['vowel'], L['expected'])
            elif verdict == 'en':
                c['likelyDrill'] = False
                c['guessWord'] = None
                c['guess'] = {'letter': None, 'conf': 0, 'alts': [],
                              'why': f"both methods say this is English: “{c['enText'][:55]}”"}
            else:                                            # methods disagreed — ask the human
                c['likelyDrill'] = len(c['reps']) >= 2
                c['guessWord'] = None
                c['guess'] = {'letter': None, 'conf': 0, 'alts': [],
                              'why': 'my two methods disagreed — see both readings below'}
            changed += 1
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    drills = sum(1 for L in data['lessons'] for c in L['clusters'] if c.get('likelyDrill'))
    unsure = sum(1 for L in data['lessons'] for c in L['clusters'] if c.get('speech') == 'unsure')
    print(f"updated {changed} clusters — {drills} drills, {unsure} flagged unsure")

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
    {'build': build, 'lang': lang, 'report': report, 'relabel': relabel,
     'join': join, 'publish': publish}[cmd]()
