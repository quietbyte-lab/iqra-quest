# Iqra Quest — رحلة اقرأ

A gamified reading companion for the **Easy Quran Reading (Baghdadi Primer)** book,
built for a five-year-old learning to read Arabic. Covers **pages 7–30**: the fathah,
kasrah and dhammah chapters.

**Try it:** open the GitHub Pages link for this repo. Add it to your home screen on a
phone and it behaves like a native app, offline included.

## What it does

- **Today** — the day's missions: new pages are read every day, revision is spread across the week
- **Word by word** — a page never appears as a wall of text; one large word at a time, in
  sprints of six, so the task always looks finishable
- **Hint card** — stuck on a word? It breaks down into its pieces, showing each letter as
  it appears joined up and again on its own, with the harakat at every level
- **Letter cards** — all 28 letters plus the shapes the book adds (hamza on its seats,
  ة، ى، لا), each with real words from the book showing the letter in context
- **Atlas** — the book as regions to travel through, with souvenirs collected along the way
- **Parents** — enter the teacher's weekly homework once; track completion and see which
  words needed retries

## Typography

Set in **Amiri**, a classical Naskh in the tradition of the Bulaq press, because the book
uses the joined forms that modern simplified faces flatten — ح tucking under س in سُحِرَ,
the س‑م join in رُسِم, the looped medial ه in بُهِت. Word size is measured against the
screen rather than fixed, since Arabic fallback fonts vary widely in how much of the em
box their glyphs occupy.

## Audio

The app plays a recorded clip where one exists and otherwise falls back to the device's
Arabic voice, so audio can be filled in gradually. **No teacher recordings are included
in this repository.** The lesson videos are embedded from YouTube; nothing is
redistributed here.

## Running it locally

```bash
python -m http.server 8642 --directory app
```

No build step, no dependencies — plain HTML, CSS and JavaScript. Progress is stored in
the browser.

## Credits

Built as a personal study aid for the *Easy Quran Reading with Baghdadi Primer* book by
Abu Anas / Moustafa Elgindy, and the accompanying YouTube lesson series. All rights in
the book and the lessons remain with their authors. Fonts (Amiri, Noto Naskh Arabic,
Reem Kufi, Aref Ruqaa) are used under the SIL Open Font Licence.
