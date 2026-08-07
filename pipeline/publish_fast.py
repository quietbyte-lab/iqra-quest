"""Publish per-word audio for a range of pages from the fast series into the app.

Alignment is POSITIONAL: the Nth utterance in the video is assumed to be the Nth word
on the page list. That holds because this series reads each item once in page order,
but it is an assumption, not verified audio — so the script reports the drift and
supports a per-page offset for correcting it by ear.

  python publish_fast.py f5              # pages 24-30, offsets from offsets.json
  python publish_fast.py f5 --dry        # show the mapping without writing anything
"""
import json, os, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, "clips_fast")
APP = os.path.abspath(os.path.join(HERE, "..", "app"))
OFFSETS = os.path.join(HERE, "offsets.json")

def book_pages():
    txt = open(os.path.join(APP, "data", "book.js"), encoding="utf-8").read()
    txt = txt[txt.index('=') + 1:].rstrip().rstrip(';')
    out = {}
    for pg, meta in json.loads(txt).get("pages", {}).items():
        out[int(pg)] = (meta.get("grid", []) + meta.get("strip", [])) \
            if meta.get("type") == "letters" else meta.get("words", [])
    return out

def write_manifest():
    root = os.path.join(APP, "audio")
    files = []
    for dirpath, _, names in os.walk(root):
        for n in names:
            if n.endswith(".mp3"):
                files.append(os.path.relpath(os.path.join(dirpath, n), APP).replace(os.sep, "/"))
    os.makedirs(root, exist_ok=True)
    json.dump(sorted(files), open(os.path.join(root, "manifest.json"), "w", encoding="utf-8"), indent=0)
    return len(files)

def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "f5"
    dry = "--dry" in sys.argv
    fast = json.load(open(os.path.join(HERE, "fast.json"), encoding="utf-8"))
    if tag not in fast:
        sys.exit(f"{tag} not in fast.json")
    d = fast[tag]
    book = book_pages()
    offsets = json.load(open(OFFSETS, encoding="utf-8")) if os.path.exists(OFFSETS) else {}

    clips = d["clips"]
    expected = [(pg, i, w) for pg in d["pages"] for i, w in enumerate(book.get(pg, []))]
    print(f"{tag}: {len(clips)} clips vs {len(expected)} words "
          f"(drift {len(clips) - len(expected):+d})")

    written, cursor = 0, 0
    for pg in d["pages"]:
        words = book.get(pg, [])
        off = int(offsets.get(str(pg), 0))
        start = cursor + off
        print(f"  page {pg:>3}: {len(words):>3} words  <- clips {start}..{start + len(words) - 1}"
              f"{'  (offset %+d)' % off if off else ''}")
        if not dry:
            dst_dir = os.path.join(APP, "audio", "pages", f"p{pg}")
            os.makedirs(dst_dir, exist_ok=True)
            for i in range(len(words)):
                k = start + i
                if k < 0 or k >= len(clips):
                    continue
                src = os.path.join(CLIPS, clips[k]["file"].replace("/", os.sep))
                if os.path.exists(src):
                    shutil.copyfile(src, os.path.join(dst_dir, f"{i + 1:02}.mp3"))
                    written += 1
        cursor += len(words)

    if not dry:
        n = write_manifest()
        print(f"\npublished {written} clips; manifest lists {n} audio files")
        print("The mapping is positional and UNVERIFIED — listen in the app, and if a")
        print("page is shifted, put e.g. {\"26\": -1} in pipeline/offsets.json and re-run.")

if __name__ == "__main__":
    main()
