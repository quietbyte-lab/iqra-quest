"""Build videos.json: map each Easy Quran Reading book page -> its YouTube lesson video.

Usage:
  yt-dlp --flat-playlist -J "https://www.youtube.com/playlist?list=PL26EQGdZaDnMwaFz5O1CwxDfWTI9xdKZ6" > playlist.json
  python parse_playlist.py
"""
import json, re, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(HERE, "playlist.json")
if not os.path.exists(src):
    sys.exit("playlist.json not found — run the yt-dlp command in the docstring first.")

data = json.load(open(src, encoding="utf-8-sig"))
entries = data.get("entries", [])

def pages_from_title(title):
    # "Page 52 and 53)", "Page 87 & 90)", "Page 16)", "Page 7 and 8)"
    m = re.search(r"Pages?\s+(\d+)(?:\s*(?:and|&)\s*(\d+))?", title, re.I)
    if m:
        return [int(g) for g in m.groups() if g]
    # "35) Madd with Alif ..." — leading number IS the page when no "Page" token
    m = re.match(r"\s*(\d+)\)", title)
    if m and "introduction" not in title.lower():
        n = int(m.group(1))
        # entries 01-06 are video indices, not pages; real leading-page numbers are >= 35
        if n >= 35:
            return [n]
    return []

videos = []
for e in entries:
    pages = pages_from_title(e.get("title", ""))
    videos.append({
        "id": e.get("id"),
        "title": e.get("title"),
        "url": f"https://youtu.be/{e.get('id')}",
        "duration_sec": e.get("duration"),
        "pages": pages,          # [] = intro / unmapped, review manually
    })

# page -> video lookup (a page may appear in more than one video, e.g. page 7 letter groups)
page_index = {}
for v in videos:
    for p in v["pages"]:
        page_index.setdefault(str(p), []).append(v["id"])

out = {"playlist": data.get("title"), "videos": videos, "page_index": page_index}
dst = os.path.join(HERE, "videos.json")
json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

mapped = [v for v in videos if v["pages"]]
all_pages = sorted({p for v in videos for p in v["pages"]})
print(f"videos: {len(videos)}  mapped: {len(mapped)}  unmapped: {len(videos)-len(mapped)}")
print(f"book pages covered: {all_pages[0]}..{all_pages[-1]} ({len(all_pages)} pages)")
missing = [p for p in range(all_pages[0], all_pages[-1]+1) if p not in all_pages]
print("pages with no video:", missing or "none")
for v in videos:
    if not v["pages"]:
        print("  unmapped:", v["title"])
print("wrote", dst)
