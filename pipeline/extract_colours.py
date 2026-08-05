"""Read the ACTUAL ink colour of every word on pages 7-30 of the scanned book.

The book prints in blue and red, and uses the colour to disambiguate which haraka
belongs to which letter. Rather than alternating colours arbitrarily in the app, this
reads the real thing off the page scans.

Method, per page:
  1. render at 200 dpi
  2. classify every pixel as red ink / blue ink / background
  3. drop table rulings (long straight runs) so borders don't count as ink
  4. group the remaining ink into rows, then into word cells within each row
  5. read the cells right-to-left, top-to-bottom -- the same order as the transcription
  6. per cell: if the ink is essentially one hue -> a single colour for the word,
     otherwise split the cell by x and give each letter its own colour

The result is only applied where the number of detected cells matches the number of
transcribed items for that page, so a mis-segmented page is skipped rather than
silently corrupting the data. Skipped pages keep the app's alternating fallback.

    python extract_colours.py            # all pages 7-30
    python extract_colours.py 16         # one page, with a diagnostic dump
"""
import os, sys, json
import numpy as np
import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.abspath(os.path.join(HERE, "..", "Easy Quran Reading_220812_052311.pdf"))
BOOK_JS = os.path.abspath(os.path.join(HERE, "..", "app", "data", "book.js"))
OUT = os.path.join(HERE, "colours.json")
DPI = 200

HARAKAT = set(range(0x64B, 0x653)) | {0x670}

def load_book():
    txt = open(BOOK_JS, encoding="utf-8").read()
    txt = txt[txt.index('=') + 1:].rstrip().rstrip(';')
    return json.loads(txt)["pages"]

def page_items(meta):
    if meta.get("type") == "letters":
        return meta.get("grid", []) + meta.get("strip", [])
    return meta.get("words", [])

def n_letters(word):
    return sum(1 for ch in word if ord(ch) not in HARAKAT and ch not in ('ـ', ' ', '،'))

def classify(rgb):
    """-> (is_red, is_blue) boolean masks of inked pixels."""
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    ink = (r + g + b) < 620                       # anything not near-white
    red = ink & (r - b > 28) & (r > 70)
    blue = ink & (b - r > 18)
    return red, blue

def strip_rules(mask):
    """Remove table borders.

    Borders are long UNBROKEN strokes, whereas a column of text is inked only in
    patches, so the longest contiguous run discriminates them far better than the
    total inked fraction (which left full-height borders in place and bridged rows).
    """
    m = mask.copy()
    h, w = m.shape

    def longest_runs(arr, axis):
        # longest contiguous True run along `axis` for every line
        a = arr if axis == 0 else arr.T
        n, k = a.shape
        best = np.zeros(k, dtype=np.int32)
        cur = np.zeros(k, dtype=np.int32)
        for i in range(n):
            row = a[i]
            cur = np.where(row, cur + 1, 0)
            best = np.maximum(best, cur)
        return best

    m[:, longest_runs(m, 0) > h * 0.20] = False      # vertical rules
    m[longest_runs(m, 1) > w * 0.20, :] = False      # horizontal rules
    return m

def bands(profile, min_gap, min_size):
    """Contiguous runs of True separated by gaps of at least min_gap."""
    out, start, gap = [], None, 0
    for i, v in enumerate(profile):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if i - gap - start >= min_size:
                    out.append((start, i - gap))
                start = None
    if start is not None and len(profile) - start >= min_size:
        out.append((start, len(profile)))
    return out

def page_colours(doc, pno, items, debug=False):
    page = doc[pno - 1]
    pix = page.get_pixmap(dpi=DPI)
    rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    red, blue = classify(rgb)
    ink = strip_rules(red | blue)
    red = red & ink
    blue = blue & ink
    if ink.sum() < 500:
        return None, "almost no ink found"

    H, W = ink.shape

    def segment(row_gap, col_gap):
        rows = bands(ink.sum(1) > W * 0.004, min_gap=row_gap, min_size=int(DPI * 0.05))
        out = []
        for (y0, y1) in rows:
            cols = bands(ink[y0:y1 + 1].sum(0) > 0, min_gap=col_gap, min_size=int(DPI * 0.04))
            cols.sort(key=lambda c: -c[0])                   # right-to-left
            out += [(y0, y1, x0, x1) for (x0, x1) in cols]
        return rows, out

    # Page layouts differ (grid sizes, harakat spacing), so rather than force one set of
    # thresholds on every page, search for the pair that recovers exactly the number of
    # words we transcribed. A page where nothing fits is skipped, not guessed at.
    # Matching the word COUNT is not proof of correct segmentation — a page can split
    # into 10 ragged rows and still total 24. The book lays these pages out as a regular
    # grid, so also require every row to hold the same number of cells. Anything that
    # only matches on count is rejected rather than trusted.
    cells, chosen = None, None
    for rg in [0.30, 0.26, 0.22, 0.19, 0.16, 0.13, 0.11, 0.09]:
        for cg in [0.30, 0.26, 0.22, 0.19, 0.16, 0.13, 0.11, 0.09, 0.07]:
            rows, cand = segment(int(DPI * rg), int(DPI * cg))
            if len(cand) != len(items) or not rows:
                continue
            per_row = [sum(1 for c in cand if c[0] == y0) for (y0, _) in rows]
            if len(set(per_row)) != 1:            # ragged -> not a real grid
                continue
            cells, chosen = cand, (rg, cg, f"{len(rows)}x{per_row[0]}")
            break
        if cells:
            break
    if debug:
        _, c0 = segment(int(DPI * 0.10), int(DPI * 0.085))
        print(f"page {pno}: default segmentation {len(c0)} cells, transcribed {len(items)}")
        print(f"  chosen params: {chosen}")
    if not cells:
        return None, f"no segmentation matched {len(items)} words"

    out = []
    for (y0, y1, x0, x1), word in zip(cells, items):
        rsub = red[y0:y1 + 1, x0:x1 + 1]
        bsub = blue[y0:y1 + 1, x0:x1 + 1]
        rn, bn = int(rsub.sum()), int(bsub.sum())
        if rn + bn == 0:
            out.append("blue"); continue
        frac = rn / (rn + bn)
        if frac > 0.80:
            out.append("red")
        elif frac < 0.20:
            out.append("blue")
        else:
            # mixed cell: split by x into as many slices as the word has letters and
            # colour each slice by its own dominant hue (RTL: first letter is rightmost)
            n = max(1, n_letters(word))
            width = (x1 - x0 + 1) / n
            per = []
            for k in range(n):
                xa = int(x1 - (k + 1) * width) + 1
                xb = int(x1 - k * width)
                xa = max(x0, xa); xb = min(x1, xb)
                rr = int(red[y0:y1 + 1, xa:xb + 1].sum())
                bb = int(blue[y0:y1 + 1, xa:xb + 1].sum())
                per.append("red" if rr > bb else "blue")
            out.append(per)
    return out, None

def main():
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    book = load_book()
    doc = fitz.open(PDF)
    result, skipped = {}, []
    pages = [only] if only else sorted(int(p) for p in book)
    for p in pages:
        meta = book.get(str(p))
        if not meta:
            continue
        items = page_items(meta)
        cols, err = page_colours(doc, p, items, debug=bool(only))
        if cols is None:
            skipped.append((p, err))
            continue
        uniform = sum(1 for c in cols if isinstance(c, str))
        result[str(p)] = cols
        print(f"page {p:>3}: {len(cols):>3} words  ({uniform} single-colour, {len(cols)-uniform} mixed)")
    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\nextracted {len(result)} pages -> {os.path.relpath(OUT, HERE)}")
    if skipped:
        print("skipped (kept app fallback):")
        for p, e in skipped:
            print(f"  page {p}: {e}")

if __name__ == "__main__":
    main()
