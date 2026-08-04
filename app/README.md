# Iqra Quest — رحلة اقرأ (v1)

Gamified companion app for the **Easy Quran Reading (Baghdadi Primer)** book.
Covers **pages 7–30** (Fathah chapter, Kasrah chapter, Dhammah chapter).

## Run locally

Any static server works:

```bash
cd app
python -m http.server 8080
```

Then open http://localhost:8080. (Opening `index.html` directly also works —
data is loaded via script tags, not fetch.)

## Deploy to GitHub Pages

Push the `app/` folder contents to a GitHub repo, then Settings → Pages →
deploy from branch. The app is a PWA: on a phone, "Add to Home Screen" makes
it feel like a native app and it works offline after first load.

## First-time setup (in the app)

1. Open **Parents** (answer the math gate).
2. Set which day the week starts (your teacher-meeting day).
3. Pick this week's **new pages** (read every day) and the **revision range**.
4. Save — the child's Today screen now shows the missions.

## Audio

The 🔊 button plays a real audio file when one exists and otherwise falls back to
the device's Arabic text-to-speech, so audio can be filled in gradually.

### Cutting the teacher's audio — the workbench

Automatic labelling is unreliable (Arabic ASR cannot tell ح from خ from ه on an isolated
letter), so the pipeline cuts **every** clip and a human decides what each one is.

```bash
python workbench.py build                          # cut every clip -> pipeline/clips/ + clips.json
python -m http.server 8700 --directory pipeline    # then open workbench.html
```

In the workbench you can, per clip: play each take, ★ the best one, say what it actually is
(letter sound / word / comparison / not useful), and leave a comment on how it should be used.
The **join tray** builds comparison clips — add several takes, preview the sequence, name it
(e.g. `seen-vs-saad`) and save it. There's also a free-text notes box for overall feedback.

Export `labels.json` into `pipeline/`, then:

```bash
python workbench.py join      # renders the comparison clips -> pipeline/joined/
python workbench.py publish   # copies labelled clips into the app
```

Anything left unlabelled keeps using the device's text-to-speech, so partial work is fine.

### File layout

- **Letters** (reused app-wide): `audio/letters/{fathah|kasrah|dhammah}/{key}.mp3`
  where `key` is the letter name lowercased, letters only — e.g. `ba.mp3`,
  `taa.mp3`, `taaheavy.mp3` (ط), `alif.mp3`. Cut them from the page 7 / 19 / 24
  videos (see `../pipeline/fetch_page.py`), e.g. with ffmpeg silence detection.
- **Words** (per exercise page): `audio/pages/p{N}/01.mp3 … 24.mp3`
  in the page's word order.

The app checks for the file first and only falls back to TTS if it's missing —
so you can add audio page by page.

## Videos

Learn mode embeds the teacher's YouTube lesson for each page directly
(`data/videos.js`, generated from the playlist by `../pipeline/parse_playlist.py`).
No videos are downloaded or redistributed by the app itself.

## Data

- `data/book.js` — transcribed page content (letter grids + word lists) for pages 7–30.
  Transcribed from the scanned book; if you spot a wrong haraka or letter, just edit the word string.
- `data/videos.js` — book page → YouTube video ID(s).

## Structure

- `index.html` + `css/app.css` + `js/` — the whole app, no build step, no dependencies.
- Progress, stars, cards, and homework are stored in `localStorage` on the device.
