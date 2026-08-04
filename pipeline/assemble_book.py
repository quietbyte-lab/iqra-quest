"""Merge transcription batches into app/data/book.js"""
import json, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"D:\Claude Code\Easy Quran Reading Book\app\data\book.js"

pages = {}
for f in sorted(glob.glob(os.path.join(HERE, "trans_*.json"))):
    for pg in json.load(open(f, encoding="utf-8")):
        p = pg["page"]
        entry = {"type": pg["type"]}
        if pg["type"] == "letters":
            entry["vowel"] = pg.get("vowel", "fathah")
            entry["grid"] = pg["grid"]
            entry["strip"] = pg.get("strip", [])
        elif pg["type"] == "examples":
            entry["type"] = "exercise"          # app reads words; keep rows for future UI
            entry["rows"] = pg["rows"]
            entry["words"] = [w for r in pg["rows"] for w in (r["beginning"], r["inside"], r["end"])]
        else:
            entry["type"] = "exercise"
            words = list(pg.get("pairs", [])) + list(pg.get("words", []))
            words += pg.get("phrases", [])
            if pg.get("passage"):
                words += [s.strip() for s in pg["passage"].split("۞") if s.strip()]
            entry["words"] = words
        pages[p] = entry

missing = [p for p in range(7, 31) if p not in pages]
print("pages assembled:", sorted(pages))
print("missing:", missing or "none")
total_words = sum(len(v.get("words", [])) + len(v.get("grid", [])) + len(v.get("strip", [])) for v in pages.values())
print("total items:", total_words)

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("window.BOOK=" + json.dumps({"pages": pages}, ensure_ascii=False) + ";")
print("wrote", OUT)
