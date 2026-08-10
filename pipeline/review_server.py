"""Serve the audio-review page AND accept its answers.

The review page used to end in a "download this file and send it to me" step, which
meant a helper had to finish everything before any of it counted. Now the page posts
each batch of ten straight back here, this writes it into manual_audio.json, and the
very next batch is positioned using what was just confirmed. Nothing waits for the
end of a page.

    python pipeline/review_server.py          # then open http://localhost:8700/review_audio.html

Two files are written, both merge-on-write so several helpers and several sessions
never overwrite each other:

  manual_audio.json    "page:wi" -> clip file        the confirmed matches
  split_requests.json  list of clips holding more than one sound, with who asked
"""
import json, re, shutil, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# The words are Arabic and the Windows console is cp1252 by default, which would
# turn every log line into a crash mid-request.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PICKS = HERE / 'manual_audio.json'
SPLITS = HERE / 'split_requests.json'
PORT = 8700


def load(path, empty):
    if not path.exists():
        return empty
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return empty


def write(path, data):
    # keep one backup, so a bad merge is never the end of someone's afternoon
    if path.exists():
        shutil.copy2(path, path.with_suffix('.json.bak'))
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(path)


KEY_RE = re.compile(r'^\d{1,3}:\d{1,4}$')
CLIP_RE = re.compile(r'^[\w./-]{1,80}$')


def state():
    return {'picks': load(PICKS, {}), 'splits': load(SPLITS, [])}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def translate_path(self, path):
        # the page borrows the app's Amiri font (../app/fonts/…), which lives outside
        # the served folder — resolve those few paths against the repository root
        clean = path.split('?')[0].split('#')[0]
        if clean.startswith('/app/'):
            return str(ROOT.joinpath(*[p for p in clean[1:].split('/') if p not in ('', '.', '..')]))
        return super().translate_path(path)

    def log_message(self, fmt, *args):  # only the answers are worth printing
        first = str(args[0]) if args else ''
        if 'api/' in first:
            super().log_message(fmt, *args)

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split('?')[0]
        if route == '/api/state':
            return self.send_json(state())
        if route == '/favicon.ico':
            return self.send_json({}, 404)
        if route in ('/', '/pipeline/', '/pipeline/review_audio.html'):
            # this used to be served from the repository root, so old links kept
            # /pipeline/ in them — send them on rather than showing a 404
            self.send_response(302)
            self.send_header('Location', '/review_audio.html')
            self.end_headers()
            return None
        return super().do_GET()

    def do_POST(self):
        route = self.path.split('?')[0]
        if route not in ('/api/save', '/api/split'):
            return self.send_error(404)
        try:
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n).decode('utf-8')) if n else {}
        except (ValueError, json.JSONDecodeError):
            return self.send_json({'error': 'bad json'}, 400)

        who = str(body.get('who') or 'anon')[:40]

        if route == '/api/save':
            picks = load(PICKS, {})
            added = 0
            for k, v in (body.get('picks') or {}).items():
                if not (KEY_RE.match(str(k)) and CLIP_RE.match(str(v))):
                    continue
                if picks.get(k) != v:
                    added += 1
                picks[k] = v
            # "skip" means the device voice stays — remember it so the word is not
            # asked again, but never write it as if it were a clip
            for k in (body.get('skipped') or []):
                if KEY_RE.match(str(k)):
                    picks[k] = 'none'
                    added += 1
            write(PICKS, picks)
            print(f'  saved {added} answer(s) from {who} — {len(picks)} total')
            return self.send_json({'ok': True, 'saved': added, **state()})

        # /api/split — a helper heard two sounds in one clip and said so straight away
        splits = load(SPLITS, [])
        clip = str(body.get('clip') or '')
        if not CLIP_RE.match(clip):
            return self.send_json({'error': 'bad clip'}, 400)
        entry = {'clip': clip, 'page': body.get('page'), 'wi': body.get('wi'),
                 'word': str(body.get('word') or '')[:20],
                 'note': str(body.get('note') or '')[:300], 'who': who}
        splits = [s for s in splits if s.get('clip') != clip] + [entry]
        write(SPLITS, splits)
        self.send_json({'ok': True, **state()})   # answer first; logging must never cost a report
        print(f'  SPLIT requested by {who}: {clip} ({entry["word"]}) {entry["note"]}')
        return None


if __name__ == '__main__':
    print(f'Review server on http://localhost:{PORT}/review_audio.html')
    print(f'  answers  -> {PICKS}')
    print(f'  splits   -> {SPLITS}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
