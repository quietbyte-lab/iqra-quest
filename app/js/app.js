/* Iqra Quest — رحلة اقرأ · v1 (pages 7–30) */
'use strict';

// ---------------- state ----------------
// ⚠ TESTING ONLY — set to false before publishing. Makes the Parents lock a trivial
// sum so the homework screen can be reached quickly while trying things out.
const EASY_PARENT_GATE = false;

const STORE_KEY = 'iqra-quest-v1';
const DEFAULT_STATE = {
  wordDone: {},                                   // page -> { wordIndex: dateKey } so a
                                                  // half-finished page can be resumed
  gems: 0, certificates: [], unlocks: [],         // revision currency + what it bought
  stickers: [], chestCount: 0,                    // sticker album + chests since last reward
  stars: 0, lang: 'en', weekStart: 6,            // 6 = Saturday
  homework: null,                                 // {newPages:[], revFrom, revTo}
  firstDone: {}, completions: {},                 // per page
  daily: {},                                      // dateKey -> {taskId:true, chest:true}
  streak: { count: 0, last: null },
  cards: [],                                      // collected letter cards
  retries: {}, lookups: {},                       // weekKey -> data (teacher report)
};
let state = load();
function load() {
  try { return Object.assign(structuredClone(DEFAULT_STATE), JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); }
  catch { return structuredClone(DEFAULT_STATE); }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

// ---------------- i18n ----------------
function t(key, ...args) {
  const v = I18N[state.lang][key];
  if (typeof v === 'function') return args.length ? v(...args) : v;   // curried: t('k')(x) works
  return v;
}
function applyDir() { document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = state.lang; }

// ---------------- dates & week ----------------
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDay = k => t('daysShort')[new Date(k + 'T12:00').getDay()] || '';
const todayKey = () => dkey(new Date());
function weekStartDate(ref = new Date()) {
  const d = new Date(ref); d.setHours(12, 0, 0, 0);
  while (d.getDay() !== state.weekStart) d.setDate(d.getDate() - 1);
  return d;
}
// The week runs from the chosen start day to the chosen end day, so it can be shorter
// than 7 days (e.g. Mon->Thu) when the teacher only sets homework for part of the week.
function weekLength() {
  const end = state.weekEnd == null ? (state.weekStart + 6) % 7 : state.weekEnd;
  return ((end - state.weekStart + 7) % 7) + 1;
}
function weekDates() {
  const s = weekStartDate(), out = [];
  for (let i = 0; i < weekLength(); i++) {
    const d = new Date(s); d.setDate(s.getDate() + i); out.push(dkey(d));
  }
  return out;
}
const weekKey = () => dkey(weekStartDate());
function dayIndexInWeek(dateKey = todayKey()) { return weekDates().indexOf(dateKey); }

// ---------------- homework & tasks ----------------
function revPool() {
  const hw = state.homework;
  if (!hw || hw.revFrom == null || hw.revTo == null) return [];
  const out = [];
  for (let p = hw.revFrom; p <= hw.revTo; p++) if (BOOK.pages[p]) out.push(p);
  return out;
}
// The parent picks how many revision pages per day; the pool then CYCLES so the whole
// range keeps coming back round. With 24-29 at 3/day: Mon 24,25,26 · Tue 27,28,29 ·
// Wed 24,25,26 again, and so on — spaced repetition rather than a one-time deal-out.
function revAssignedTo(dayIdx) {
  const pool = revPool();
  if (!pool.length) return [];
  const per = Math.max(1, state.homework?.revPerDay || 1);
  const start = (dayIdx * per) % pool.length;
  const out = [];
  for (let i = 0; i < Math.min(per, pool.length); i++) out.push(pool[(start + i) % pool.length]);
  return out;
}
function revDoneThisWeek(p) { return weekDates().some(dk => state.daily[dk] && state.daily[dk]['rev-' + p]); }
function dayRecord(dateKey = todayKey()) { return state.daily[dateKey] || {}; }
function tasksFor(dateKey = todayKey()) {
  const hw = state.homework; if (!hw) return [];
  const rec = dayRecord(dateKey), di = weekDates().indexOf(dateKey);
  const tasks = [];
  for (const p of (hw.newPages || [])) {
    const first = !state.firstDone[p];
    tasks.push({ id: 'new-' + p, page: p, kind: first ? 'learn' : 'daily', done: !!rec['new-' + p] });
  }
  // Revision repeats across the week now, so "done" is per-day, never per-week —
  // otherwise Wednesday's repeat of page 24 would arrive already ticked off.
  for (const p of revAssignedTo(di === -1 ? 0 : di)) {
    tasks.push({ id: 'rev-' + p, page: p, kind: 'rev', done: !!rec['rev-' + p] });
  }
  // learn tasks first? keep book order: dailies (known) first, then first-time, then revision
  tasks.sort((a, b) => (a.kind === 'rev') - (b.kind === 'rev') || (a.kind === 'learn') - (b.kind === 'learn') || a.page - b.page);
  return tasks;
}
function dayComplete(dateKey) { const ts = tasksFor(dateKey); return ts.length > 0 && ts.every(x => x.done); }

// ---------------- content helpers ----------------
// What is actually NEW on this page, derived from the book data rather than asserted.
// If nothing is new, say so honestly — it is practice, and pretending otherwise is
// how a child stops trusting the label.
function pageSummary(p) {
  const pg = BOOK.pages[p];
  if (!pg) return '';
  const vowel = pg.vowel || (p <= 18 ? 'fathah' : p <= 23 ? 'kasrah' : 'dhammah');
  if (pg.type === 'letters') return t('sumLetters')(t('v_' + vowel));
  const words = pg.words || [];
  const lens = words.map(w => baseLettersOf(w).length);
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const hasSentence = words.some(w => w.includes(' '));
  // first page in the book to introduce this vowel in words?
  const firstOfVowel = { fathah: 8, kasrah: 20, dhammah: 25 }[vowel] === p;
  if (hasSentence) return t('sumSentences');
  if (firstOfVowel) return t('sumFirstWords')(t('v_' + vowel));
  if (avg < 2.6) return t('sumBlend')(t('v_' + vowel));
  return t('sumPractice')(Math.round(avg), t('v_' + vowel));
}

function pageItems(p) {                            // what the child reads on this page
  const pg = BOOK.pages[p];
  if (!pg) return [];
  if (pg.type === 'letters') return [...pg.grid, ...(pg.strip || [])];
  return pg.words;
}
const HARAKA_RE = /[ً-ْٰ]/;
function baseLettersOf(word) { return [...word].filter(ch => !HARAKA_RE.test(ch) && ch !== 'ـ').map(baseLetter); }
function newCardLetters(p) {                       // letters this page would add to the collection
  const pg = BOOK.pages[p]; if (!pg) return [];
  const words = pg.type === 'letters' ? (pg.strip || []) : pg.words;   // cards come from CONNECTED usage
  const found = [];
  for (const w of words) for (const L of baseLettersOf(w))
    if (LETTERS[L] && !state.cards.includes(L) && !found.includes(L)) found.push(L);
  return found;
}
function vowelsUnlocked() {
  const done = Object.keys(state.completions).map(Number);
  const maxP = Math.max(7, ...done, ...(state.homework?.newPages || []));
  const v = ['fathah'];
  if (maxP >= 19) v.push('kasrah');
  if (maxP >= 24) v.push('dhammah');
  return v;
}
const CHAPTERS = [
  { id: 'fathah', icon: '🌾', from: 7, to: 18, inV1: true },
  { id: 'kasrah', icon: '🏞️', from: 19, to: 23, inV1: true },
  { id: 'dhammah', icon: '🏜️', from: 24, to: 30, inV1: true },
  { id: 'madd', icon: '🏔️', from: 31, to: 51, inV1: false },
  { id: 'tanween', icon: '🌲', from: 52, to: 59, inV1: false },
  { id: 'sukoon', icon: '🌊', from: 60, to: 68, inV1: false },
  { id: 'rules', icon: '🏛️', from: 69, to: 96, inV1: false },
  { id: 'peak', icon: '🕌', from: 97, to: 108, inV1: false },
];

// ---------------- audio ----------------
// Recorded clips are optional. audio/manifest.json lists whatever has been published;
// with no manifest (v0) every play goes straight to speech synthesis — no failed requests.
let AUDIO = new Set(), audioNoteShown = false, noVoiceWarned = false;
fetch('audio/manifest.json')
  .then(r => r.ok ? r.json() : [])
  .then(list => { AUDIO = new Set(list); })
  .catch(() => {});

function arabicVoice() {
  const vs = speechSynthesis.getVoices() || [];
  return vs.find(v => /^ar/i.test(v.lang)) || null;
}
function tts(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = arabicVoice();
  if (v) u.voice = v;
  u.lang = 'ar-SA';
  u.rate = 0.7;
  speechSynthesis.speak(u);
  if (!v && !noVoiceWarned) { noVoiceWarned = true; toast(t('noArabicVoice')); return; }
  if (v && !audioNoteShown) { audioNoteShown = true; toast(t('audioNote')); }
}
function playFile(src, fallbackText) {
  if (!AUDIO.has(src)) return tts(fallbackText);       // nothing recorded yet — don't hit the network
  const a = new Audio(src);
  a.addEventListener('error', () => tts(fallbackText));
  a.play().catch(() => tts(fallbackText));
}
const letterKey = L => LETTERS[L].name.toLowerCase().replace(/[^a-z]/g, '');
function playLetter(L, vowel = 'fathah') {
  const b = baseLetter(L);
  if (!LETTERS[b]) return;
  playFile(`audio/letters/${vowel}/${letterKey(b)}.mp3`, b + (VOWEL_MARKS[vowel] || ''));
}
function playItem(page, idx, text) { playFile(`audio/pages/p${page}/${String(idx + 1).padStart(2, '0')}.mp3`, text); }

// ---------------- tiny ui helpers ----------------
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
function toast(msg) {
  const d = el('div', null, msg);
  Object.assign(d.style, { position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', background: '#1B302C', color: '#fff', padding: '10px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: '700', zIndex: 70, maxWidth: '86vw', textAlign: 'center' });
  document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
}
function bumpStars(n) {
  state.stars += n; save();
  const pill = $('#stars-pill'); pill.textContent = '⭐ ' + state.stars;
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
}
// Revision earns gems, one per WORD — a reward only at the end of a page gives a child
// nothing to pull them THROUGH the page, which is where they give up. Each gem is worth
// less than a star, so new pages stay the bigger prize.
function bumpGems(n) {
  state.gems = (state.gems || 0) + n; save();
  const pill = $('#gems-pill');
  if (!pill) return;
  pill.hidden = false;
  pill.textContent = '💎 ' + state.gems;
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
}
// One big star per correct reading, flying from the word up to the star counter.
function flyingStar(x, y, glyph = '⭐') {
  const target = glyph === '💎' && $('#gems-pill') ? $('#gems-pill') : $('#stars-pill');
  const pill = target.getBoundingClientRect();
  const s = el('div', 'fly-star', glyph);
  s.style.left = x + 'px'; s.style.top = y + 'px';
  s.style.setProperty('--tx', (pill.left + pill.width / 2 - x) + 'px');
  s.style.setProperty('--ty', (pill.top + pill.height / 2 - y) + 'px');
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1100);
  const plus = el('div', 'plus-one', '+1');
  plus.style.left = x + 'px'; plus.style.top = y + 'px';
  document.body.appendChild(plus);
  setTimeout(() => plus.remove(), 900);
}
function starBurst(x, y, count = 6, glyph = '⭐') {
  for (let i = 0; i < count; i++) {
    const s = el('span', 'burst', glyph);
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.round(Math.cos(i / count * 6.28) * 90) + 'px');
    s.style.setProperty('--dy', Math.round(Math.sin(i / count * 6.28) * 90 - 60) + 'px');
    document.body.appendChild(s); setTimeout(() => s.remove(), 1000);
  }
}
// ---------------- sticker rewards ----------------
// A guaranteed sticker for finishing a page, plus a surprise one every few chests.
// The unpredictable one is deliberate: a variable reward schedule sustains interest
// far better than a fixed "every N" payout, which children quickly learn to discount.
const chapterFor = page => CHAPTERS.find(c => page >= c.from && page <= c.to) || CHAPTERS[0];

// Certificates earned with gems — the revision payoff you can print and take to the
// teacher. Thresholds rise so each one takes a real stretch of revision to reach.
// Diamonds are pages finished, so these are page-count milestones, not word counts.
const CERTIFICATES = [
  { id: 'c1', gems: 10, key: 'certSteady' },
  { id: 'c2', gems: 30, key: 'certStrong' },
  { id: 'c3', gems: 60, key: 'certExpert' },
  { id: 'c4', gems: 120, key: 'certMaster' },
];
function checkCertificates() {
  const earned = CERTIFICATES.filter(c => (state.gems || 0) >= c.gems && !state.certificates.includes(c.id));
  if (!earned.length) return;
  const c = earned[0];
  state.certificates.push(c.id); save(); SFX.mission(); confetti();
  const ov = overlay(`<div class="big-emoji">📜✨</div>
    <h4>${t('certEarned')}</h4>
    <p class="muted">${t(c.key)} · ${c.gems} 💎</p>
    <button class="btn primary big" data-print>${t('printIt')}</button>
    <button class="btn ghost big" style="margin-top:8px" data-close>${t('later')}</button>`);
  ov.querySelector('[data-print]').addEventListener('click', () => { ov.remove(); printCertificate(c); });
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
}
function printCertificate(c) {
  const w = window.open('', '_blank');
  if (!w) return toast(t('allowPopups'));
  const today = new Date().toLocaleDateString();
  const pages = Object.keys(state.completions).length;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${t('certificate')}</title><style>
    @page{size:A4 landscape;margin:0}
    body{margin:0;font-family:Georgia,serif;display:grid;place-items:center;height:100vh;
      background:#FFFDF7;color:#1B302C}
    .cert{border:14px double #C9A227;border-radius:12px;padding:44px 60px;text-align:center;width:80%}
    h1{font-size:40px;margin:.1em;color:#0F6B63;letter-spacing:.02em}
    .ar{font-family:"Amiri",serif;font-size:34px;color:#23539E;margin:6px 0 18px}
    .name{font-size:30px;margin:16px 0 6px;border-bottom:2px dotted #C9A227;display:inline-block;
      padding:0 40px 6px}
    p{font-size:17px;color:#5C6F6B;margin:8px 0}
    .stats{margin-top:18px;font-size:15px;color:#8A5A00;font-weight:bold}
    .foot{margin-top:26px;font-size:13px;color:#8B9490}
    </style></head><body><div class="cert">
      <div style="font-size:52px">📜</div>
      <h1>${t(c.key)}</h1>
      <div class="ar">شهادة تقدير</div>
      <p>${t('certAwarded')}</p>
      <div class="name">&nbsp;</div>
      <p>${t('certFor')}</p>
      <div class="stats">💎 ${state.gems} &nbsp;·&nbsp; ⭐ ${state.stars} &nbsp;·&nbsp; ${t('certPages')(pages)}</div>
      <div class="foot">Iqra Quest — رحلة اقرأ &nbsp;·&nbsp; ${today}</div>
    </div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// A souvenir from the region the child just read in — the reward names the place,
// so collecting and travelling are the same act rather than two unrelated systems.
function awardSticker(page) {
  const ch = chapterFor(page);
  const owned = new Set(state.stickers);
  let pool = stickersOf(ch.id).filter(e => !owned.has(e));
  let from = ch;
  if (!pool.length) {                                  // this region fully collected
    const other = ALL_STICKERS.filter(s => !owned.has(s.e));
    if (!other.length) return null;
    const pick = other[Math.floor(Math.random() * other.length)];
    pool = [pick.e];
    from = CHAPTERS.find(c => c.id === pick.set) || ch;
  }
  const e = pool[Math.floor(Math.random() * pool.length)];
  state.stickers.push(e);
  save();
  const items = stickersOf(from.id);
  const have = items.filter(x => state.stickers.includes(x)).length;
  const done = have === items.length;
  SFX.sticker();
  const ov = overlay(`
    <div class="sticker-pop">${e}</div>
    <h4>${t('foundIn')(from.icon, t('chapters')[from.id])}</h4>
    <p class="muted">${t('regionCount')(have, items.length)}</p>
    ${done ? `<p style="font-weight:800;color:var(--green)">${t('regionComplete')(t('chapters')[from.id])}</p>` : ''}
    <button class="btn primary big" data-close>${t('addToAlbum')}</button>`);
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  return e;
}
function confetti() {
  const em = ['🎉', '⭐', '✨', '🎊', '🌟'];
  for (let i = 0; i < 26; i++) {
    const c = el('span', 'confetti', em[i % em.length]);
    c.style.left = Math.random() * 100 + 'vw';
    c.style.animationDelay = (Math.random() * .8) + 's';
    document.body.appendChild(c); setTimeout(() => c.remove(), 3400);
  }
}
function overlay(innerHTML, onMount) {
  const ov = el('div', 'overlay'); ov.innerHTML = `<div class="sheet">${innerHTML}</div>`;
  document.body.appendChild(ov);
  if (onMount) onMount(ov);
  return ov;
}

// ---- calligraphic styles ----
// Each entry names a real style plus the fonts that render it. A style is only offered
// when one of its fonts is genuinely installed, checked by measuring rendered width
// against a known-missing font.
const STYLES = [
  { key: 'naskh',  cls: 'st-naskh',  i18n: 'styleNaskh',  fonts: ['Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', 'Scheherazade New'] },
  { key: 'kufi',   cls: 'st-kufi',   i18n: 'styleKufi',   fonts: ['Reem Kufi', 'Noto Kufi Arabic'] },
  { key: 'ruqaa',  cls: 'st-ruqaa',  i18n: 'styleRuqaa',  fonts: ['Aref Ruqaa', 'Arabic Typesetting'] },
  { key: 'modern', cls: 'st-modern', i18n: 'stylePlain',  fonts: ['Segoe UI', 'Tahoma', 'Arial'] },
];
let _styleCache = null;
function fontAvailable(name) {
  const probe = 'ابجدهوز';
  const mk = family => {
    const s = document.createElement('span');
    s.textContent = probe;
    s.style.cssText = `position:absolute;visibility:hidden;font-size:64px;white-space:nowrap;font-family:${family}`;
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return w;
  };
  const base = mk('"__nope__", monospace');
  return Math.abs(mk(`"${name}", "__nope__", monospace`) - base) > 0.6;
}
function availableStyles() {
  if (_styleCache) return _styleCache;
  const seen = new Set();
  _styleCache = STYLES.filter(s => {
    const font = s.fonts.find(fontAvailable);
    if (!font || seen.has(font)) return false;
    seen.add(font);
    s.font = font;
    return true;
  });
  return _styleCache;
}

// Find real words from the book showing this letter at the start, middle and end.
// Prefers the pages the child has already reached, so examples feel familiar.
// Does this word actually form a ligature/stack? rlig on-vs-off changes its width when
// it does (ح tucking under س, the س-م join, the looped medial ه). Those are exactly the
// shapes worth showing, so they get picked first.
let _ligCache = {};
function hasLigature(word) {
  if (word in _ligCache) return _ligCache[word];
  const mk = rlig => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;visibility:hidden;font-size:70px;white-space:nowrap;' +
      `direction:rtl;font-family:"Amiri";font-feature-settings:"rlig" ${rlig}`;
    d.textContent = word;
    document.body.appendChild(d);
    const w = d.getBoundingClientRect().width;
    d.remove();
    return w;
  };
  const on = mk(1), off = mk(0);
  return (_ligCache[word] = Math.abs(on - off) / Math.max(on, off) > 0.03);
}
// Several real words per position, tricky joins first.
// Match the character's OWN card, not its base letter: ئ, ؤ and ة have their own cards
// now, so a word like سَئِمَ belongs to ئ and must not be offered as an example of ي.
const cardLettersOf = word =>
  [...word].filter(ch => !HARAKA_RE.test(ch) && ch !== 'ـ').map(cardFor);

function bookExamples(letter, perPos = 3) {
  const seen = new Set(), out = [];
  for (const pos of ['start', 'middle', 'end']) {
    const found = [];
    for (const [p, meta] of Object.entries(BOOK.pages)) {
      const items = meta.type === 'letters' ? (meta.strip || []) : (meta.words || []);
      for (const w of items) {
        if (w.length > 16 || seen.has(w) || found.some(f => f.word === w)) continue;
        const base = cardLettersOf(w);
        const i = base.indexOf(letter);
        if (i < 0 || base.length < 2) continue;
        const where = i === 0 ? 'start' : i === base.length - 1 ? 'end' : 'middle';
        if (where !== pos) continue;
        // Pages 20/25 drill letter PAIRS (بَبِ، يَيُ) and some cells are joined-up
        // fragments ending in tatweel. Neither is a word, so they make poor examples.
        const drillPair = base.length === 2 && base[0] === base[1];
        const fragment = w.includes('ـ');
        found.push({ word: w, page: +p, n: base.length, real: !drillPair && !fragment,
                     nb: neighbourOf(w, letter, pos) });
      }
    }
    // real words first, then ones showing a ligature, then shorter (easier to read)
    found.sort((a, b) => (b.real - a.real)
      || (hasLigature(b.word) - hasLigature(a.word)) || a.n - b.n);
    // Then pick across DIFFERENT neighbouring letters, so the examples span the range
    // of joined shapes rather than repeating one. Falls back to any word if needed.
    const picked = [], usedNb = new Set();
    for (const f of found) {
      if (picked.length >= perPos) break;
      if (usedNb.has(f.nb)) continue;
      usedNb.add(f.nb); picked.push(f);
    }
    for (const f of found) {
      if (picked.length >= perPos) break;
      if (!picked.includes(f)) picked.push(f);
    }
    for (const f of picked) {
      seen.add(f.word);
      out.push({ ...f, posKey: pos, lig: hasLigature(f.word) });
    }
  }
  return out;
}
// wrap just the target letter so the child can see it inside the joined word
function markLetter(word, letter) {
  let html = '', open = false;
  for (const ch of word) {
    if (/[ً-ْٰ]/.test(ch)) { html += ch; continue; }
    if (ch === 'ـ') { html += ch; continue; }
    if (open) { html += '</span>'; open = false; }
    if (baseLetter(ch) === letter) { html += `<span class="hit">${ch}`; open = true; }
    else html += ch;
  }
  return html + (open ? '</span>' : '');
}

// Which letter FOLLOWS ours decides the joined shape: ي before ه is drawn quite
// differently from ي before ن. Covering distinct neighbours therefore covers the
// spectrum of shapes the child will actually meet, rather than three lookalikes.
function neighbourOf(word, letter, pos) {
  const base = cardLettersOf(word);
  const i = base.indexOf(letter);
  if (i < 0) return '';
  return pos === 'end' ? (base[i - 1] || '^') : (base[i + 1] || '$');
}

// ---------------- hint card: how this word was built ----------------
// Split a word into letters, each keeping its own harakat.
function splitWord(word) {
  const out = [];
  for (const ch of word) {
    if (HARAKA_RE.test(ch)) { if (out.length) out[out.length - 1].marks += ch; continue; }
    if (ch === 'ـ' || ch === ' ') continue;
    out.push({ ch, marks: '' });
  }
  return out;
}
// Which of the four forms a letter takes here depends on BOTH neighbours: it joins
// backwards only if the letter before it connects forward, and joins forward only if
// it is itself a connector (ا د ذ ر ز و never connect to what follows).
function formInWord(parts, i) {
  const base = parts.map(p => cardFor(p.ch));
  const back = i > 0 && !NON_CONNECTORS.has(base[i - 1]);
  const fwd = i < parts.length - 1 && !NON_CONNECTORS.has(base[i]);
  const idx = back && fwd ? 2 : back ? 3 : fwd ? 1 : 0;
  const info = LETTERS[base[i]];
  return { form: info ? info.forms[idx] : parts[i].ch, idx, base: base[i] };
}
// "How was this word made?" — the full word, then the pieces exactly as they appear
// joined up, then each piece's plain letter underneath. Harakat are carried at every
// level, because the mark is half of what the child is decoding.
function showHint(word) {
  const parts = splitWord(word);
  const lbls = [t('alone'), t('start'), t('middle'), t('end')];
  // The haraka must sit on the LETTER, not on the tatweel that shows the join —
  // appending it to the end of "ظـ" parks the fathah on the connector stroke.
  const withMarks = (form, base, marks) => {
    if (!marks) return form;
    const i = form.indexOf(base);
    return i < 0 ? form + marks : form.slice(0, i + base.length) + marks + form.slice(i + base.length);
  };
  const cells = parts.map((p, i) => {
    const f = formInWord(parts, i);
    return `<div class="hcell">
      <span class="h-joined arabic" data-say="${f.base}${p.marks}">${withMarks(f.form, f.base, p.marks)}</span>
      <span class="h-base arabic">${f.base}${p.marks}</span>
      <span class="h-lbl">${lbls[f.idx]}</span>
    </div>`;
  }).join('');
  // Each letter of the whole word is wrapped so an arrow can be drawn from it down to
  // its own piece — showing where each piece CAME FROM, which is the point of the card.
  let wordHtml = '', li = -1;
  for (const ch of word) {
    if (HARAKA_RE.test(ch)) { wordHtml += `<span class="h">${ch}</span>`; continue; }
    if (ch === 'ـ') { wordHtml += ch; continue; }
    li++;
    wordHtml += `<span class="hw" data-i="${li}">${ch}</span>`;
  }
  const ov = overlay(`<div class="hint-box">
    <h4>${t('hintTitle')}</h4>
    <div class="hint-full arabic">${wordHtml}</div>
    <svg class="hint-links" aria-hidden="true"></svg>
    <div class="hint-split">${t('hintSplit')}</div>
    <div class="hcells">${cells}</div>
    <p class="muted">${t('hintFoot')}</p>
    <button class="btn primary big" data-close>${t('gotItHint')}</button>
  </div>`);
  ov.querySelectorAll('.h-joined[data-say]').forEach(s =>
    s.addEventListener('click', () => tts(s.dataset.say)));
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  const redraw = () => drawHintLinks(ov.querySelector('.hint-box'));
  requestAnimationFrame(redraw);
  addEventListener('resize', redraw);
  return ov;
}

// Curved arrows from each letter in the whole word down to the piece it became.
function drawHintLinks(box) {
  const svg = box.querySelector('.hint-links');
  const letters = [...box.querySelectorAll('.hint-full .hw')];
  const cells = [...box.querySelectorAll('.hcell')];
  if (!svg || !letters.length) return;
  const br = box.getBoundingClientRect();
  svg.setAttribute('width', br.width);
  svg.setAttribute('height', br.height);
  svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
  let d = '';
  for (let i = 0; i < Math.min(letters.length, cells.length); i++) {
    const l = letters[i].getBoundingClientRect(), c = cells[i].getBoundingClientRect();
    const x1 = l.left + l.width / 2 - br.left, y1 = l.bottom - br.top - 6;
    const x2 = c.left + c.width / 2 - br.left, y2 = c.top - br.top - 3;
    const dy = Math.max(18, (y2 - y1) * 0.45);
    d += `<path d="M${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}"
      fill="none" stroke="var(--coral)" stroke-width="2.5" stroke-linecap="round"
      marker-end="url(#hint-tip)"/>`;
  }
  svg.innerHTML = `<defs><marker id="hint-tip" viewBox="0 0 10 10" refX="7" refY="5"
      markerWidth="4.5" markerHeight="4.5" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="var(--coral)"/></marker></defs>${d}`;
}

// letter card popover
function showLetterCard(L, { log = false } = {}) {
  const b = cardFor(L); const info = LETTERS[b];
  if (!info) return;
  if (log) { const wk = weekKey(); state.lookups[wk] = state.lookups[wk] || {}; state.lookups[wk][b] = (state.lookups[wk][b] || 0) + 1; save(); }
  const lbls = [t('alone'), t('start'), t('middle'), t('end')];
  const vs = vowelsUnlocked();
  const sndBtn = v => vs.includes(v)
    ? `<button class="snd" data-v="${v}">${b}<span class="h">${VOWEL_MARKS[v]}</span></button>`
    : `<button class="snd off" disabled>${b}${VOWEL_MARKS[v]}</button>`;
  // LEVEL 1 — the basics: this letter's four positions, plus its sounds.
  const level1 = `
    <div class="muted">${t('shapes4')}</div>
    <div class="frm arabic">${info.forms.map((f, i) =>
      `<div class="fc"><span class="g">${f}</span><span class="l">${lbls[i]}</span></div>`).join('')}</div>
    <div class="muted" style="margin-top:8px">${t('letterSounds')}</div>
    <div class="snd-row arabic">${sndBtn('fathah')}${sndBtn('kasrah')}${sndBtn('dhammah')}</div>
    ${vs.length < 3 ? `<div class="muted" style="margin-top:6px">${t('greyLater')}</div>` : ''}`;
  // Real words from the book, on the SAME card — an abstract ـعـ never shows the
  // ligatures the child actually meets, and hiding them behind a tab meant they were
  // rarely seen. Grouped by position, tricky joins first.
  // Each example is shown TWICE — the classical Naskh (Amiri, with its stacked joins)
  // beside the simplified Naskh (Noto). Seeing them side by side is the point: it proves
  // the two are the same letter rather than two different symbols to learn.
  const ex = bookExamples(b, 3);
  const group = pos => {
    const rows = ex.filter(e => e.posKey === pos);
    if (!rows.length) return '';
    return `<div class="ex-group"><div class="ex-pos">${t(pos)}</div>
      ${rows.map(e => `<div class="ex-pair">
        <button class="ex-w st-classical" data-say="${e.word}" title="${t('pageWord')} ${e.page}">
          ${markLetter(e.word, b)}<small>${t('styleClassical')}</small></button>
        <span class="ex-eq">=</span>
        <button class="ex-w st-simple" data-say="${e.word}" title="${t('pageWord')} ${e.page}">
          ${markLetter(e.word, b)}<small>${t('styleSimple')}</small></button>
      </div>`).join('')}</div>`;
  };
  const examples = ex.length ? `
    <div class="muted" style="margin-top:12px">${t('inRealWords')}</div>
    ${group('start')}${group('middle')}${group('end')}
    <div class="muted" style="font-size:11px;margin-top:4px">${t('sameLetterHint')}</div>`
    : `<div class="muted" style="margin-top:10px">${t('noExamples')}</div>`;

  const ov = overlay(`<div class="lcard">
    <h4>${t('letterCard')} · <span class="arabic">${b}</span> (${info.name})</h4>
    ${level1}
    <button class="btn ghost big more-btn" id="ex-toggle" style="margin-top:12px">${t('showWords')}</button>
    <div id="ex-body" hidden>${examples}</div>
    <button class="btn primary big" style="margin-top:12px" data-close>${t('backToReading')}</button>
  </div>`);
  ov.querySelectorAll('.snd[data-v]').forEach(btn =>
    btn.addEventListener('click', () => playLetter(b, btn.dataset.v)));
  // Examples stay folded away by default so an early learner meets a calm card.
  const exBody = ov.querySelector('#ex-body'), exBtn = ov.querySelector('#ex-toggle');
  exBtn.addEventListener('click', () => {
    exBody.hidden = !exBody.hidden;
    exBtn.textContent = exBody.hidden ? t('showWords') : t('hideWords');
    if (!exBody.hidden) exBody.querySelectorAll('.ex-w[data-say]').forEach(btn =>
      btn.addEventListener('click', () => tts(btn.dataset.say)));
  });
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
}

// ---------------- router ----------------
let current = 'today';
const NAV = ['today', 'week', 'atlas', 'cards', 'parent'];
function go(screen, arg) {
  current = screen;
  speechSynthesis && speechSynthesis.cancel();
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.s === screen));
  const view = $('#view'); view.innerHTML = ''; view.scrollTop = 0;
  ({ today: renderToday, week: renderWeek, atlas: renderAtlas, cards: renderCards, parent: renderParentGate, learn: renderLearn, practice: renderPractice })[screen](view, arg);
  $('#screen-title').textContent =
    screen === 'learn' ? `📘 ${t('newPage')} ${arg.page} · ${t('learnTitle')}` :
    screen === 'practice' ? `🔁 ${t('practiceTitle')} · ${arg.page}` :
    t(screen + 'Title');
}

// ---------------- TODAY ----------------
function renderToday(view) {
  const wrap = el('div', 'pad');
  const di = dayIndexInWeek();
  wrap.appendChild(el('div', 'date-line', `${t('days')[new Date().getDay()]} · ${t('daysToEnd')(di === -1 ? 6 : 6 - di)}`));
  const tasks = tasksFor();
  if (!state.homework) {                       // first run — give a way in, not a dead end
    const card = el('div', 'card center');
    card.innerHTML = `<div style="font-size:44px">🚀</div>
      <b style="font-size:16px">${t('welcome')}</b>
      <p class="muted">${t('welcomeSub')}</p>`;
    const quick = el('button', 'btn primary big', t('quickStart'));
    quick.addEventListener('click', () => {
      const avail = Object.keys(BOOK.pages).map(Number).sort((a, b) => a - b);
      state.homework = { newPages: avail.slice(0, 2), revFrom: null, revTo: null };
      save(); go('today');
    });
    const setup = el('button', 'btn ghost big', t('openParents'));
    setup.style.marginTop = '8px';
    setup.addEventListener('click', () => go('parent'));
    card.append(quick, setup);
    wrap.appendChild(card);
    view.appendChild(wrap); return;
  }
  if (!tasks.length) {
    const card = el('div', 'card center');
    card.innerHTML = `<div style="font-size:40px">🌙</div><p class="muted">${t('nothingToday')}</p>`;
    const setup = el('button', 'btn ghost big', t('openParents'));
    setup.addEventListener('click', () => go('parent'));
    card.appendChild(setup);
    wrap.appendChild(card);
    view.appendChild(wrap); return;
  }
  const path = el('div', 'tpath');
  let firstPending = tasks.find(x => !x.done);
  for (const task of tasks) {
    const icon = task.kind === 'learn' ? '🎬' : task.kind === 'daily' ? '🔁' : '🎒';
    const label = task.kind === 'learn' ? `${t('newPage')} ${task.page} — ${t('firstTime')}` :
      task.kind === 'daily' ? `${t('dailyRead')} · ${task.page}` : `${t('review')} · ${task.page}`;
    // Say what this page actually holds, not a generic label
    const sub = pageSummary(task.page) ||
      (task.kind === 'learn' ? t('videoThenDaily') : task.kind === 'daily' ? t('dayOfDaily')() : t('fromBackpack'));
    // Show what this task actually pays: a star for every word, one diamond for the page.
    const words = pageItems(task.page).length;
    const node = el('button', 'tnode' + (task.done ? ' done' : task === firstPending ? ' current' : ''));
    node.innerHTML = `<span class="big-ico">${icon}</span>
      <div><div class="tt">${label}</div><div class="ts">${sub}</div></div>
      <span class="pts">${words}⭐<br><span class="pts-gem">+1💎</span></span>`;
    if (!task.done) node.addEventListener('click', () =>
      task.kind === 'learn' ? go('learn', { page: task.page, taskId: task.id }) : go('practice', { page: task.page, taskId: task.id, kind: task.kind }));
    path.appendChild(node);
  }
  const rec = dayRecord();
  const chest = el('div', 'tchest' + (rec.chest ? ' open' : ''), rec.chest ? '🧰✨ ' + t('chestOpen') : '🧰 ' + t('finishAll')(tasks.length));
  path.appendChild(chest);
  wrap.appendChild(path);
  if (tasks.every(x => x.done)) wrap.appendChild(el('div', 'all-done', t('allDone')));
  if (state.streak.count > 1) wrap.appendChild(el('div', 'streak-line', '🔥 ' + t('streak')(state.streak.count)));
  view.appendChild(wrap);
}

// ---------------- WEEK ----------------
function renderWeek(view) {
  const wrap = el('div', 'pad');
  const hw = state.homework, days = weekDates(), tk = todayKey();
  const startName = t('days')[state.weekStart];
  const endName = t('days')[state.weekEnd == null ? (state.weekStart + 6) % 7 : state.weekEnd];
  wrap.appendChild(el('div', 'exp-title', `${startName} → ${endName}`));
  if (!hw) { wrap.appendChild(el('div', 'card center', `<p class="muted">${t('noHomework')}</p>`)); view.appendChild(wrap); return; }
  wrap.appendChild(el('div', 'wk-legend',
    `<span><i class="dot n">7</i>${t('legendNew')}</span>` +
    `<span><i class="dot r">7</i>${t('legendRev')}</span>` +
    `<span><i class="dot n done">7</i>${t('legendDone')}</span>`));
  const grid = el('div', 'wgrid');
  days.forEach((dk_, i) => {
    const rec = state.daily[dk_] || {};
    const isToday = dk_ === tk, past = dk_ < tk;
    const d = el('div', 'wday' + (isToday ? ' today-d' : ''));
    const ts = tasksFor(dk_);
    const doneCount = ts.filter(x => x.done).length;
    const stat = ts.length && doneCount === ts.length ? '✓' : isToday ? `${doneCount}/${ts.length}` : '';
    d.innerHTML = `<div class="dn"><span>${t('daysShort')[new Date(dk_ + 'T12:00').getDay()]}${isToday ? ' · ' + t('today_') : ''}</span><span>${stat}</span></div>`;
    // Every dot names its actual page. Colour says WHAT it is (new vs revision),
    // shade says WHETHER it is done — pale when still to read, solid once finished.
    const dots = el('div', 'dots');
    for (const x of ts) {
      const kind = x.kind === 'rev' ? 'r' : 'n';
      dots.appendChild(el('span', `dot ${kind}${x.done ? ' done' : ''}`, String(x.page)));
    }
    d.appendChild(dots);
    grid.appendChild(d);
  });
  const allDone = days.every(dk_ => dayComplete(dk_));
  const gate = el('div', 'gate' + (allDone ? ' open' : ''),
    allDone ? '🏆 ' + t('gateOpen') : `🏁 ${t('endOfWeek')} — ${endName}<div class="sub">${t('gateSub')}</div>`);
  grid.appendChild(gate); wrap.appendChild(grid);
  if (hw.newPages?.length)
    wrap.appendChild(el('div', 'card', `<b style="font-size:13.5px">${t('newPagesCard')(hw.newPages.join(', '))}</b>
      <div class="bp-chips">${hw.newPages.map(p => {
        const marks = days.map(dk_ => (state.daily[dk_] || {})['new-' + p] ? '✓' : '').join('');
        return `<span class="bp-chip blue">p.${p} ${marks}</span>`; }).join('')}</div>`));
  const pool = revPool();
  if (pool.length)
    wrap.appendChild(el('div', 'card', `<b style="font-size:13.5px">🎒 ${t('backpackCard')}</b>
      <div class="bp-chips">${pool.map(p => {
        const on = [0, 1, 2, 3, 4, 5, 6].filter(i => revAssignedTo(i).includes(p))
          .map(i => t('daysShort')[new Date(days[i] + 'T12:00').getDay()]);
        return `<span class="bp-chip${revDoneThisWeek(p) ? ' done' : ''}">p.${p} · ${on.join(', ')}</span>`;
      }).join('')}</div>
      <div class="muted" style="margin-top:6px">${t('cycleNote')(state.homework?.revPerDay || 1)}</div>`));
  view.appendChild(wrap);
}

// ---------------- ATLAS ----------------
function renderAtlas(view) {
  const wrap = el('div', 'pad');
  const discovered = Object.keys(state.completions).length;
  wrap.appendChild(el('div', 'atlas-head', t('pagesDiscovered')(discovered, 108)));
  wrap.appendChild(el('div', 'muted center', t('atlasHint')));
  // Straight jump to any page — hunting through regions is slow when you know the number.
  const avail = Object.keys(BOOK.pages).map(Number).sort((a, b) => a - b);
  const jump = el('div', 'card jump-card');
  jump.innerHTML = `<b style="font-size:13px">${t('jumpTo')}</b>
    <div class="jump-row"><select id="jump-sel">${
      avail.map(p => `<option value="${p}">${t('pageWord')} ${p} — ${pageSummary(p)}</option>`).join('')
    }</select><button class="btn primary" id="jump-go">${t('jumpGo')}</button></div>`;
  wrap.appendChild(jump);
  jump.querySelector('#jump-go').addEventListener('click', () =>
    go('practice', { page: +jump.querySelector('#jump-sel').value, taskId: null, kind: 'free' }));
  for (const ch of CHAPTERS) {
    const pages = Object.keys(BOOK.pages).map(Number).filter(p => p >= ch.from && p <= ch.to);
    const total = ch.to - ch.from + 1;
    const done = Object.keys(state.completions).map(Number).filter(p => p >= ch.from && p <= ch.to).length;
    const pc = Math.round(done / total * 100);
    const ready = pages.length > 0;                       // we have the content for these pages
    const stateTxt = !ready ? t('comingSoon')
      : pc === 100 ? t('complete') : pc > 0 ? t('exploring') : t('tapToOpen')(pages.length);
    const items = stickersOf(ch.id);
    const found = items.filter(e => state.stickers.includes(e));
    const isl = el(ready ? 'button' : 'div', 'island' + (ready ? '' : ' locked'));
    isl.innerHTML = `<div class="isl-main">
        <span class="ie">${ch.icon}</span>
        <div class="in"><b>${t('chapters')[ch.id]}</b><span>${ch.from}–${ch.to} · ${stateTxt}</span></div>
        <div class="bar"><div class="track"><div class="fill" style="width:${pc}%"></div></div><div class="pc">${pc}%</div></div>
      </div>
      <div class="isl-souv" title="${t('souvenirs')}">
        ${items.map(e => state.stickers.includes(e)
          ? `<span class="sv">${e}</span>` : `<span class="sv off">·</span>`).join('')}
        <span class="sv-count">${found.length}/${items.length}</span>
      </div>`;
    if (ready) isl.addEventListener('click', () => pagePicker(ch, pages));
    wrap.appendChild(isl);
  }
  const total = ALL_STICKERS.length;
  wrap.appendChild(el('div', 'muted center', t('souvTotal')(state.stickers.length, total)));

  // How the rewards map onto the journey, stated plainly. Each has one job:
  // stars = effort, diamonds = pages finished, souvenirs = new ground, certificates
  // = milestones. Without this the four just look like four kinds of confetti.
  const nextCert = CERTIFICATES.find(c => !state.certificates.includes(c.id));
  const how = el('div', 'card how-card');
  how.innerHTML = `<b style="font-size:14px">${t('howRewards')}</b>
    <div class="how-row"><span class="how-i">⭐</span><span>${t('howStars')}</span></div>
    <div class="how-row"><span class="how-i">💎</span><span>${t('howGems')}</span></div>
    <div class="how-row"><span class="how-i">🎟️</span><span>${t('howSouv')}</span></div>
    <div class="how-row"><span class="how-i">📜</span><span>${
      nextCert ? t('howCertNext')(nextCert.gems - (state.gems || 0), nextCert.gems)
               : t('howCertAll')}</span></div>
    <div class="how-row"><span class="how-i">🏁</span><span>${t('howGate')}</span></div>`;
  wrap.appendChild(how);
  view.appendChild(wrap);
}

// Pick any page in a chapter and read it straight away — no homework needed.
function pagePicker(ch, pages) {
  const rows = pages.map(p => {
    const pg = BOOK.pages[p];
    const n = pageItems(p).length;
    const times = state.completions[p] || 0;
    const kind = pg.type === 'letters' ? t('lettersPage') : t('wordsPage');
    return `<button class="pick" data-p="${p}">
      <b>${t('pageWord')} ${p}</b>
      <span>${kind} · ${n} ${t('itemsWord')}${times ? ` · ✓×${times}` : ''}</span>
    </button>`;
  }).join('');
  const ov = overlay(`<h4>${ch.icon} ${t('chapters')[ch.id]}</h4>
    <div class="muted">${t('pickPage')}</div>
    <div class="picklist">${rows}</div>
    <button class="btn ghost big" data-close>${t('backToReading')}</button>`);
  ov.querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => {
    const p = parseInt(b.dataset.p, 10);
    ov.remove();
    go('practice', { page: p, taskId: null, kind: 'free' });
  }));
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
}

// ---------------- LETTER CARDS ----------------
function renderCards(view) {
  const wrap = el('div', 'pad');
  wrap.appendChild(el('div', 'atlas-head', t('collected')(state.cards.length, ALPHABET.length)));
  const grid = el('div', 'cards-grid');
  // Every card opens — it is a reference the child may need at any point. The badge
  // still shows which ones have been *earned*, so the collection remains a goal.
  for (const L of ALPHABET) {
    const got = state.cards.includes(L);
    const c = el('button', 'ccard arabic' + (got ? '' : ' notyet'),
      `<span class="g">${L}</span><span class="st">${got ? '🃏' : '👀'}</span>`);
    c.addEventListener('click', () => showLetterCard(L));
    grid.appendChild(c);
  }
  wrap.appendChild(grid);
  // Extra shapes the book teaches beyond the 28 letters (hamza seats, ة, ى, لا)
  wrap.appendChild(el('h3', 'sec', t('specialShapes')));
  wrap.appendChild(el('div', 'muted', t('specialHint')));
  const sgrid = el('div', 'cards-grid');
  for (const L of SPECIALS) {
    const c = el('button', 'ccard arabic special', `<span class="g">${L}</span><span class="st">✦</span>`);
    c.addEventListener('click', () => showLetterCard(L));
    sgrid.appendChild(c);
  }
  wrap.appendChild(sgrid);
  const vs = vowelsUnlocked();
  const labOpen = vs.length === 3;
  const lab = el('div', 'vowel-lab' + (labOpen ? ' unlocked' : ''));
  if (labOpen) {
    lab.innerHTML = `<b style="font-size:13.5px;color:var(--amber-dark)">${t('vowelLabOpen')}</b>
      <div class="vlab-row" id="vlab-row"></div>
      <div class="chips" style="justify-content:center;margin-top:10px;direction:rtl" id="vlab-letters"></div>`;
    wrap.appendChild(lab);
    let cur = state.cards[0] || 'ب';
    const drawLab = () => {
      const row = lab.querySelector('#vlab-row');
      row.innerHTML = ['fathah', 'kasrah', 'dhammah'].map(v =>
        `<button class="vlab-big arabic" data-v="${v}">${cur}<span class="h">${VOWEL_MARKS[v]}</span></button>`).join('');
      row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => playLetter(cur, b.dataset.v)));
    };
    const lrow = lab.querySelector('#vlab-letters');
    for (const L of state.cards) {
      const b = el('button', 'chip plain arabic', L);
      b.style.fontSize = '18px';
      b.addEventListener('click', () => { cur = L; drawLab(); });
      lrow.appendChild(b);
    }
    drawLab();
  } else {
    lab.innerHTML = `<b style="font-size:13.5px;color:var(--ink-faint)">${t('vowelLab')}</b>
      <span class="muted">${t('vowelLabSub')}</span>`;
    wrap.appendChild(lab);
  }

  view.appendChild(wrap);
}

// ---------------- LEARN ----------------
function renderLearn(view, { page, taskId }) {
  const wrap = el('div', 'pad');
  const vids = (window.VIDEOS && VIDEOS[page]) || [];
  if (vids.length) {
    const vw = el('div', 'video-wrap');
    const iframe = document.createElement('iframe');
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.src = `https://www.youtube-nocookie.com/embed/${vids[0]}`;
    vw.appendChild(iframe); wrap.appendChild(vw);
    if (vids.length > 1) {
      const tabs = el('div', 'video-tabs');
      vids.forEach((id, i) => {
        const b = el('button', 'video-tab' + (i === 0 ? ' on' : ''), t('videoPart')(i + 1));
        b.addEventListener('click', () => {
          iframe.src = `https://www.youtube-nocookie.com/embed/${id}`;
          tabs.querySelectorAll('.video-tab').forEach(x => x.classList.remove('on')); b.classList.add('on');
        });
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);
    }
  }
  wrap.appendChild(el('p', 'muted center', t('watchFirst')));
  // shape moments: up to 3 new connecting letters on this page
  const fresh = newCardLetters(page).filter(L => !NON_CONNECTORS.has(L)).slice(0, 3);
  for (const L of fresh) {
    const info = LETTERS[L];
    const sampleWord = (BOOK.pages[page].type === 'letters' ? (BOOK.pages[page].strip || []) : BOOK.pages[page].words)
      .find(w => baseLettersOf(w).includes(L)) || L;
    const sec = el('div', 'card');
    sec.innerHTML = `<h3 class="sec" style="margin-top:0">${t('shapeMoment')}</h3>
      <div class="shape-moment arabic">
        <div class="sm-card" data-l="${L}"><span class="g">${info.forms[0]}</span><span class="lbl">${t('alone')}</span></div>
        <span class="sm-arrow">←</span>
        <div class="sm-card" data-l="${L}"><span class="g">${info.forms[1]}</span><span class="lbl">${t('start')}</span></div>
        <span class="sm-arrow">←</span>
        <div class="sm-card hl"><span class="g">${sampleWord}</span><span class="lbl">${t('inWord')}</span></div>
      </div>
      <div class="sm-note">${t('shapeNote')(L)}</div>`;
    sec.querySelectorAll('[data-l]').forEach(c => c.addEventListener('click', () => playLetter(L)));
    wrap.appendChild(sec);
  }
  const startBtn = el('button', 'btn primary big', t('startReading'));
  startBtn.addEventListener('click', () => go('practice', { page, taskId, kind: 'learn' }));
  wrap.appendChild(startBtn);
  view.appendChild(wrap);
}

// ---------------- PRACTICE ----------------
function renderPractice(view, { page, taskId, kind }) {
  const items = pageItems(page);
  const isLetters = BOOK.pages[page].type === 'letters';
  const SPRINT = 6;
  const sprints = Math.ceil(items.length / SPRINT);
  let idx = 0;   // set below to the first word still due today
  const cont = el('div', null); cont.id = 'prac'; view.appendChild(cont);
  const sprintRow = el('div', 'sprint');
  const hint = el('div', 'prac-hint');
  const stage = el('div', 'word-stage');
  const word = el('div', 'big-word arabic');
  stage.appendChild(word);
  const lookup = el('div', 'lookup-hint', t('confused'));
  // Stuck mid-page? The teacher's lesson for THIS page is one tap away, without
  // losing your place — you come straight back to the same word.
  const vids = (window.VIDEOS && VIDEOS[page]) || [];
  // Word map: the whole page at a glance, showing what was read today, what was read
  // on an earlier day, and what is still due. Tapping a word JUMPS to it and pays
  // nothing — looking back at a word should never be worth stars.
  const mapBtn = el('button', 'btn map-btn', t('wordMapBtn'));
  mapBtn.addEventListener('click', () => {
    const done = doneMap();
    const cells = items.map((w, i) => {
      const d = done[i];
      const cls = d === tkNow ? 'today' : d ? 'earlier' : 'due';
      const when = d === tkNow ? t('mapToday') : d ? shortDay(d) : '';
      return `<button class="wm ${cls}${i === idx ? ' here' : ''}" data-i="${i}">
        <span class="wm-n">${i + 1}</span>
        <span class="wm-w arabic">${w.length > 12 ? w.slice(0, 12) + '…' : w}</span>
        <span class="wm-d">${when}</span></button>`;
    }).join('');
    const ov = overlay(`<div class="wmap">
      <h4>${t('wordMapTitle')(page)}</h4>
      <p class="muted">${t('wordMapSub')(Object.values(done).filter(d => d === tkNow).length, items.length)}</p>
      <div class="wm-grid">${cells}</div>
      <div class="wm-key">
        <span><i class="wm today"></i>${t('mapToday')}</span>
        <span><i class="wm earlier"></i>${t('mapEarlier')}</span>
        <span><i class="wm due"></i>${t('mapDue')}</span>
      </div>
      <button class="btn primary big" data-close>${t('backToWord')}</button>
    </div>`);
    ov.querySelectorAll('.wm[data-i]').forEach(b => b.addEventListener('click', () => {
      idx = +b.dataset.i; ov.remove(); drawWord();
    }));
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  });
  const hintBtn = el('button', 'btn hint-btn', t('hintBtn'));
  hintBtn.addEventListener('click', () => showHint(items[idx]));
  const helpBtn = vids.length ? el('button', 'btn ghost watch-btn', t('watchVideo')) : null;
  if (helpBtn) helpBtn.addEventListener('click', () => {
    const ov = overlay(`<div class="video-wrap" style="margin-bottom:10px">
        <iframe allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen src="https://www.youtube-nocookie.com/embed/${vids[0]}"></iframe></div>
      <p class="muted">${t('watchHint')(page)}</p>
      <button class="btn primary big" data-close>${t('backToWord')}</button>`);
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  });
  const speaker = el('button', 'speaker', '🔊'); speaker.setAttribute('aria-label', 'play');
  const plabel = el('div', 'parent-lbl', t('parentCheck'));
  const row = el('div', 'parent-row');
  const backBtn = el('button', 'btn back', t('backWord'));
  const againBtn = el('button', 'btn again', t('tryAgain'));
  const okBtn = el('button', 'btn ok', t('gotIt'));
  row.append(backBtn, againBtn, okBtn);
  cont.append(sprintRow, hint, stage, lookup, speaker);
  const helpRow = el('div', 'help-row');
  helpRow.append(mapBtn, hintBtn);
  if (helpBtn) helpRow.appendChild(helpBtn);
  cont.append(helpRow, plabel, row);
  // Stars are only ever awarded once per word, so stepping back and forth can never
  // double-count — and going back never takes a star away from the child.
  // Seeded from what was already read TODAY, so a page picked up later resumes where
  // it stopped instead of paying out again from the start.
  const tkNow = todayKey();
  const doneMap = () => (state.wordDone[page] = state.wordDone[page] || {});
  const awarded = new Set(
    Object.entries(doneMap()).filter(([, d]) => d === tkNow).map(([k]) => +k));
  // Resume at the first word still due today rather than restarting the page.
  idx = items.findIndex((_, i) => !awarded.has(i));
  if (idx < 0) idx = 0;
  let busy = false;

  function sprintNo() { return Math.floor(idx / SPRINT); }
  function drawSprint() {
    sprintRow.innerHTML = '';
    const startI = sprintNo() * SPRINT;
    const count = Math.min(SPRINT, items.length - startI);
    for (let i = 0; i < count; i++) {
      const s = el('span', 's-star', '⭐');
      if (awarded.has(startI + i)) s.classList.add('lit');
      sprintRow.appendChild(s);
    }
    sprintRow.appendChild(el('span', 'chest-ico', '🧰'));
    hint.textContent = (isLetters ? t('lettersSprint') : t('sprintOf'))(sprintNo() + 1, sprints);
  }
  // Arabic fallback fonts vary wildly in how much of the em box the glyphs actually
  // fill (a 116px font can render ~110px of text), so a fixed pixel size is useless.
  // Measure the rendered word and scale it to fill the stage instead.
  function fitWord() {
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const probe = 120;
    word.style.fontSize = probe + 'px';
    const r = word.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const scale = Math.min(box.width * 0.88 / r.width, box.height * 0.94 / r.height);
    word.style.fontSize = Math.max(32, Math.min(190, Math.floor(probe * scale))) + 'px';
  }
  function drawWord() {
    const text = items[idx];
    // The book alternates colour on neighbouring letters so a haraka is never
    // ambiguous about which letter it belongs to. Each letter carries its own
    // haraka in a matching darker tone.
    let html = '', open = false, li = -1;
    for (const ch of text) {
      if (HARAKA_RE.test(ch)) html += `<span class="h">${ch}</span>`;
      else if (ch === 'ـ') html += ch;
      else {
        if (open) html += '</span>';
        li++;
        html += `<span class="lt c${li % 2}" data-l="${ch}">${ch}`;
        open = true;
      }
    }
    if (open) html += '</span>';
    // A single letter has nothing to break down, so the hint would just repeat itself.
    hintBtn.hidden = baseLettersOf(text).length < 2;
    word.innerHTML = html;
    // per-word letterform: the book alternates between the stacked ligature and the
    // flat baseline form, so honour the recorded shape where we have one
    const shape = (window.SHAPES || {})[page + ':' + idx];
    word.classList.toggle('flat-shape', shape === 'flat');
    word.classList.toggle('stacked-shape', shape === 'stacked');
    fitWord();
    word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop');
    word.querySelectorAll('.lt').forEach(sp => sp.addEventListener('click', () => showLetterCard(sp.dataset.l, { log: true })));
    drawSprint();
  }
  addEventListener('resize', fitWord);
  function play() {
    speaker.classList.add('pulse'); setTimeout(() => speaker.classList.remove('pulse'), 1500);
    // A recording made FOR this page is the most faithful source, so prefer it — even
    // on a letters page, whose cells would otherwise route to the shared letter library
    // and fall back to speech synthesis when that library is empty.
    const pageFile = `audio/pages/p${page}/${String(idx + 1).padStart(2, '0')}.mp3`;
    if (AUDIO.has(pageFile)) return playItem(page, idx, items[idx]);
    const base = baseLettersOf(items[idx]);
    // grid cells are single letters (لَا and هَـ still resolve to ل / ه)
    if (isLetters && idx < BOOK.pages[page].grid.length && base.length && LETTERS[base[0]]) {
      playLetter(base[0], BOOK.pages[page].vowel || 'fathah');
    } else playItem(page, idx, items[idx]);
  }
  speaker.addEventListener('click', play);
  againBtn.addEventListener('click', () => {
    const wk = weekKey(); state.retries[wk] = state.retries[wk] || [];
    state.retries[wk].push({ page, word: items[idx] }); save();
    SFX.again();
    play();
  });
  backBtn.addEventListener('click', () => {
    if (busy || idx === 0) return;
    idx--;
    drawWord();
  });
  okBtn.addEventListener('click', () => {
    // Guard against a small child machine-gunning the button and skipping words
    // unseen: ignore repeat taps until the star has finished playing.
    if (busy) return;
    busy = true;
    okBtn.classList.add('cooling');
    setTimeout(() => { busy = false; okBtn.classList.remove('cooling'); }, 900);

    // Big, unmistakable star for THIS reading: it pops over the word, then flies
    // to the counter so the child sees exactly where their star went.
    const wr = word.getBoundingClientRect();
    if (!awarded.has(idx)) {
      awarded.add(idx);
      doneMap()[idx] = tkNow; save();      // remember it, so the page can be resumed
      SFX.star();
      // Every word pays a star, new page or revision alike — the effort is the same.
      flyingStar(wr.left + wr.width / 2, wr.top + wr.height / 2, '⭐');
      starBurst(wr.left + wr.width / 2, wr.top + wr.height / 2, 5, '⭐');
      bumpStars(1);
      const stars = sprintRow.querySelectorAll('.s-star');
      const inSprint = idx % SPRINT;
      if (stars[inSprint]) { stars[inSprint].classList.add('lit', 'just-won'); }
    }
    idx++;
    if (idx >= items.length) return setTimeout(finish, 700);   // let the star land first
    if (idx % SPRINT === 0) {
      bumpStars(6);                                   // sprint chest pays in stars too
      SFX.chest();
      state.chestCount = (state.chestCount || 0) + 1; save();
      // surprise sticker every 3rd chest — unpredictable enough to stay exciting
      const surprise = state.chestCount % 3 === 0;
      const ov = overlay(`<div class="big-emoji">🎉🧰✨</div><h4>${t('chestOpened')}</h4>
        <p class="muted">${t('plusStars')(6)}</p>
        <button class="btn primary big" data-next>${t('nextSprint')}</button>`);
      ov.querySelector('[data-next]').addEventListener('click', () => {
        ov.remove();
        if (surprise) awardSticker(page);
        drawWord();
      });
      return;
    }
    setTimeout(drawWord, 650);          // pause so the star is seen before the next word
  });

  function finish() {
    bumpStars(6);                                       // final sprint chest
    // A DIAMOND is the reward for finishing a whole page — rare, so it is the valuable
    // one. Stars measure effort word by word; diamonds measure pages carried to the end.
    bumpGems(1);
    const firstTime = !state.completions[page];         // never finished before
    state.completions[page] = (state.completions[page] || 0) + 1;
    if (kind === 'learn') state.firstDone[page] = true;
    for (const L of newCardLetters(page)) state.cards.push(L);
    const tk = todayKey();
    state.daily[tk] = state.daily[tk] || {};
    if (taskId) state.daily[tk][taskId] = true;
    let chestMsg = '';
    if (tasksFor(tk).every(x => x.done) && !state.daily[tk].chest) {
      state.daily[tk].chest = true; bumpStars(10); bumpGems(1);   // the whole day done
      chestMsg = `<p style="font-weight:800;color:var(--green)">${t('chestOpen')}</p>`;
      const last = state.streak.last;
      const y = new Date(); y.setDate(y.getDate() - 1);
      state.streak.count = (last === dkey(y)) ? state.streak.count + 1 : 1;
      state.streak.last = tk;
    }
    save(); confetti(); SFX.mission();
    setTimeout(checkCertificates, 1400);      // after the chest, so rewards don't collide
    // Mission complete = the treasure chest opens. It shakes, bursts, then shows the haul.
    const ov = overlay(`<div class="chest-stage">
        <div class="chest-big" id="chest-big">🧰</div>
        <div class="chest-rays"></div>
      </div>
      <h4>${t('pageDone')(page)}</h4>
      <p class="muted">${t('pageHaul')(items.length + 6)}</p>${chestMsg}
      <button class="btn primary big" data-home>${t('great')}</button>`);
    const chest = ov.querySelector('#chest-big');
    chest.classList.add('shaking');
    setTimeout(() => {
      chest.textContent = '🎉';
      chest.classList.remove('shaking');
      chest.classList.add('opened');
      ov.querySelector('.chest-rays').classList.add('on');
      const r = chest.getBoundingClientRect();
      starBurst(r.left + r.width / 2, r.top + r.height / 2, 12);
    }, 900);
    ov.querySelector('[data-home]').addEventListener('click', () => {
      ov.remove();
      // A souvenir marks NEW ground — the first time a page is finished. Diamonds keep
      // paying for every re-read, so revision still counts, but the collection tracks
      // how far through the book you have actually travelled.
      if (firstTime) awardSticker(page);
      go('today');
    });
  }
  drawWord();
}

// ---------------- PARENT ----------------
let parentUnlocked = false;
function renderParentGate(view) {
  if (parentUnlocked) return renderParent(view);
  // EASY_PARENT_GATE keeps this trivial while testing. The real lock is two-digit
  // multiplication: easy for an adult, out of reach for an early reader, and far too
  // wide a range to guess (single-digit addition was guessable by a 5-year-old).
  const a = EASY_PARENT_GATE ? 1 + Math.floor(Math.random() * 4) : 12 + Math.floor(Math.random() * 8);
  const b = EASY_PARENT_GATE ? 1 + Math.floor(Math.random() * 4) : 6 + Math.floor(Math.random() * 8);
  const answer = EASY_PARENT_GATE ? a + b : a * b;
  const sign = EASY_PARENT_GATE ? '+' : '×';
  const wrap = el('div', 'pad center');
  wrap.appendChild(el('div', 'card', `<div class="gate-q">🔒 ${t('gateQ')} ${a} ${sign} ${b}?</div>
    <input class="gate-in" id="gate-in" type="number" inputmode="numeric" autocomplete="off">
    <div style="margin-top:12px"><button class="btn primary" id="gate-go">${t('enter')}</button></div>
    ${EASY_PARENT_GATE ? `<div class="test-warn">${t('testGate')}</div>`
                       : `<div class="muted" style="margin-top:8px">${t('gateHint')}</div>`}`));
  view.appendChild(wrap);
  let tries = 0;
  const attempt = () => {
    if (parseInt($('#gate-in').value, 10) === answer) { parentUnlocked = true; go('parent'); return; }
    tries++;
    $('#gate-in').value = '';
    toast(tries >= 3 ? t('wrongAnswerAgain') : t('wrongAnswer'));
  };
  $('#gate-go').addEventListener('click', attempt);
  $('#gate-in').addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
}
function renderParent(view) {
  const wrap = el('div', 'pad');
  const hw = state.homework || { newPages: [], revFrom: null, revTo: null };
  // week completion
  const days = weekDates();
  let total = 0, done = 0;
  for (const dk_ of days) { const ts = tasksFor(dk_); total += ts.length; done += ts.filter(x => x.done).length; }
  const pc = total ? Math.round(done / total * 100) : 0;

  // schedule
  const sched = el('div', 'card setup');
  const curEnd = state.weekEnd == null ? (state.weekStart + 6) % 7 : state.weekEnd;
  sched.innerHTML = `<b>${t('weekSchedule')} · <span style="color:var(--teal)">${t('weekProgress')(pc)}</span></b>
    <div class="sel-row"><span>${t('weekStartsOn')}</span><select id="ws-sel">${
      t('days').map((d, i) => `<option value="${i}" ${i === state.weekStart ? 'selected' : ''}>${d}</option>`).join('')
    }</select>
    <span>${t('weekEndsOn')}</span><select id="we-sel">${
      t('days').map((d, i) => `<option value="${i}" ${i === curEnd ? 'selected' : ''}>${d}</option>`).join('')
    }</select>
    <span id="ws-len" class="muted">${t('weekDaysLong')(weekLength())}</span></div>`;
  wrap.appendChild(sched);
  const syncLen = () => {
    const s = +sched.querySelector('#ws-sel').value, e = +sched.querySelector('#we-sel').value;
    sched.querySelector('#ws-len').textContent = t('weekDaysLong')(((e - s + 7) % 7) + 1);
  };
  sched.querySelector('#ws-sel').addEventListener('change', syncLen);
  sched.querySelector('#we-sel').addEventListener('change', syncLen);

  // new pages
  const avail = Object.keys(BOOK.pages).map(Number).sort((x, y) => x - y);
  const np = el('div', 'card setup');
  np.innerHTML = `<b>${t('newPagesSetup')}</b><div class="chips" id="np-chips"></div>`;
  wrap.appendChild(np);
  const sel = new Set(hw.newPages);
  const chipsRow = np.querySelector('#np-chips');
  for (const p of avail) {
    const c = el('button', 'chip ' + (sel.has(p) ? 'sel' : 'n'), 'p.' + p);
    c.addEventListener('click', () => {
      sel.has(p) ? sel.delete(p) : sel.add(p);
      c.className = 'chip ' + (sel.has(p) ? 'sel' : 'n');
    });
    chipsRow.appendChild(c);
  }

  // revision range
  const rev = el('div', 'card setup');
  const opts = who => `<option value="">${t('none')}</option>` +
    avail.map(p => `<option value="${p}" ${hw[who] === p ? 'selected' : ''}>${p}</option>`).join('');
  const per = hw.revPerDay || 1;
  rev.innerHTML = `<b>${t('revSetup')}</b>
    <div class="sel-row"><span>${t('from')}</span><select id="rev-from">${opts('revFrom')}</select>
    <span>${t('to')}</span><select id="rev-to">${opts('revTo')}</select></div>
    <div class="sel-row" style="margin-top:8px"><span>${t('perDay')}</span>
      <select id="rev-per">${[1,2,3,4,5].map(n =>
        `<option value="${n}" ${n === per ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <span id="per-hint" class="muted">${t('perDayHint')(per)}</span></div>`;
  wrap.appendChild(rev);
  rev.querySelector('#rev-per').addEventListener('change', e => {
    rev.querySelector('#per-hint').textContent = t('perDayHint')(+e.target.value);
  });

  const saveBtn = el('button', 'btn primary big', t('save'));
  saveBtn.addEventListener('click', () => {
    state.weekStart = parseInt($('#ws-sel').value, 10);
    state.weekEnd = parseInt($('#we-sel').value, 10);
    const rf = $('#rev-from').value, rt = $('#rev-to').value;
    state.homework = {
      newPages: [...sel].sort((x, y) => x - y),
      revFrom: rf ? parseInt(rf, 10) : null,
      revTo: rt ? parseInt(rt, 10) : null,
      revPerDay: parseInt($('#rev-per').value, 10) || 1,
    };
    save(); toast(t('saved')); go('parent');
  });
  wrap.appendChild(saveBtn);

  // teacher report
  const wk = weekKey();
  const rep = el('div', 'card', `<b style="font-size:14px">📋 ${t('teacherReport')} · ${t('thisWeek')}</b><div id="rep-body"></div>`);
  const body = rep.querySelector('#rep-body');
  const retries = state.retries[wk] || [];
  const counts = {};
  for (const r of retries) { const k = r.word + '·' + r.page; counts[k] = (counts[k] || 0) + 1; }
  const entries = Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, 10);
  body.appendChild(el('div', 'muted', t('retriedWords') + ':'));
  if (!entries.length) body.appendChild(el('div', 'report-row', `<span>${t('noneYet')}</span>`));
  for (const [k, n] of entries) {
    const [w, p] = k.split('·');
    body.appendChild(el('div', 'report-row', `<span class="ar-w arabic">${w}</span><span>p.${p} · ×${n}</span>`));
  }
  body.appendChild(el('div', 'muted', t('lookedUp') + ':'));
  const lk = Object.entries(state.lookups[wk] || {}).sort((x, y) => y[1] - x[1]);
  if (!lk.length) body.appendChild(el('div', 'report-row', `<span>${t('noneYet')}</span>`));
  for (const [L, n] of lk) body.appendChild(el('div', 'report-row', `<span class="ar-w arabic">${L}</span><span>×${n}</span>`));
  wrap.appendChild(rep);

  // maintenance
  const maint = el('div', 'card');
  const rw = el('button', 'btn ghost big', t('resetWeek'));
  rw.addEventListener('click', () => {
    for (const dk_ of weekDates()) delete state.daily[dk_];
    delete state.retries[wk]; delete state.lookups[wk];
    save(); toast(t('saved')); go('parent');
  });
  const fr = el('button', 'btn ghost big danger', t('fullReset'));
  fr.style.marginTop = '8px';
  fr.addEventListener('click', () => {
    if (confirm(t('confirmReset'))) { localStorage.removeItem(STORE_KEY); state = load(); go('parent'); }
  });
  maint.append(rw, fr);
  wrap.appendChild(maint);
  view.appendChild(wrap);
}

// ---------------- boot ----------------
function boot() {
  applyDir();
  // Bundled @font-face families are not measurable until the browser has actually
  // fetched them, so ask for them up front, then let style detection re-run.
  if (document.fonts && document.fonts.load) {
    Promise.all(['Amiri', 'Reem Kufi', 'Aref Ruqaa', 'Noto Naskh Arabic']
      .map(f => document.fonts.load(`64px "${f}"`).catch(() => {})))
      .then(() => { _styleCache = null; })
      .catch(() => {});
  }
  $('#stars-pill').textContent = '⭐ ' + state.stars;
  const gp = $('#gems-pill');
  if (gp) { gp.textContent = '💎 ' + (state.gems || 0); gp.hidden = !(state.gems > 0); }
  $('#lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
  $('#lang-btn').addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar'; save(); applyDir();
    $('#lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
    drawNav(); go(NAV.includes(current) ? current : 'today');
  });
  drawNav();
  go('today');
  // Offline caching is OFF while the app is still changing: a service worker kept
  // serving stale files, so fixes were invisible until caches were cleared by hand.
  // This actively removes any worker already installed on the device.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => Promise.all(rs.map(r => r.unregister())))
      .then(ok => { if (ok && ok.length) return caches.keys()
        .then(ks => Promise.all(ks.map(k => caches.delete(k))))
        .then(() => location.reload()); })
      .catch(() => {});
  }
}
function drawNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  const icons = { today: '🎯', week: '🗺️', atlas: '🌍', cards: '🃏', parent: '👨‍👩‍👦' };
  for (const s of NAV) {
    const b = el('button', 'nav-btn' + (current === s ? ' on' : ''),
      `<span class="ico">${icons[s]}</span><span>${t(s)}</span>`);
    b.dataset.s = s;
    b.addEventListener('click', () => go(s));
    nav.appendChild(b);
  }
}
document.addEventListener('DOMContentLoaded', boot);
