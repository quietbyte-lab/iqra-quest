/* Iqra Quest — رحلة اقرأ · v1 (pages 7–30) */
'use strict';

// ---------------- state ----------------
const STORE_KEY = 'iqra-quest-v1';
const DEFAULT_STATE = {
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
const todayKey = () => dkey(new Date());
function weekStartDate(ref = new Date()) {
  const d = new Date(ref); d.setHours(12, 0, 0, 0);
  while (d.getDay() !== state.weekStart) d.setDate(d.getDate() - 1);
  return d;
}
function weekDates() {
  const s = weekStartDate(), out = [];
  for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); out.push(dkey(d)); }
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
function revAssignedTo(dayIdx) {                   // days 0..5 round-robin; day 6 = catch-up
  const pool = revPool();
  if (dayIdx <= 5) return pool.filter((_, i) => i % 6 === dayIdx);
  return pool.filter(p => !revDoneThisWeek(p));
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
  for (const p of revAssignedTo(di === -1 ? 0 : di)) {
    if (di === 6 && revDoneThisWeek(p)) continue;
    tasks.push({ id: 'rev-' + p, page: p, kind: 'rev', done: !!rec['rev-' + p] || revDoneThisWeek(p) });
  }
  // learn tasks first? keep book order: dailies (known) first, then first-time, then revision
  tasks.sort((a, b) => (a.kind === 'rev') - (b.kind === 'rev') || (a.kind === 'learn') - (b.kind === 'learn') || a.page - b.page);
  return tasks;
}
function dayComplete(dateKey) { const ts = tasksFor(dateKey); return ts.length > 0 && ts.every(x => x.done); }

// ---------------- content helpers ----------------
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
function starBurst(x, y, count = 6) {
  for (let i = 0; i < count; i++) {
    const s = el('span', 'burst', '⭐');
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.round(Math.cos(i / count * 6.28) * 90) + 'px');
    s.style.setProperty('--dy', Math.round(Math.sin(i / count * 6.28) * 90 - 60) + 'px');
    document.body.appendChild(s); setTimeout(() => s.remove(), 1000);
  }
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

// letter card popover
function showLetterCard(L, { log = false } = {}) {
  const b = baseLetter(L); const info = LETTERS[b];
  if (!info) return;
  if (log) { const wk = weekKey(); state.lookups[wk] = state.lookups[wk] || {}; state.lookups[wk][b] = (state.lookups[wk][b] || 0) + 1; save(); }
  const lbls = [t('alone'), t('start'), t('middle'), t('end')];
  const vs = vowelsUnlocked();
  const sndBtn = v => vs.includes(v)
    ? `<button class="snd" data-v="${v}">${b}<span class="h">${VOWEL_MARKS[v]}</span></button>`
    : `<button class="snd off" disabled>${b}${VOWEL_MARKS[v]}</button>`;
  const ov = overlay(`<div class="lcard">
    <h4>${t('letterCard')} · <span class="arabic">${b}</span> (${info.name})</h4>
    <div class="muted">${t('shapes4')}</div>
    <div class="frm arabic">${info.forms.map((f, i) => `<div class="fc"><span class="g">${f}</span><span class="l">${lbls[i]}</span></div>`).join('')}</div>
    <div class="muted" style="margin-top:8px">${t('letterSounds')}</div>
    <div class="snd-row arabic">${sndBtn('fathah')}${sndBtn('kasrah')}${sndBtn('dhammah')}</div>
    <div class="muted" style="margin-top:6px">${t('greyLater')}</div>
    <button class="btn primary big" style="margin-top:12px" data-close>${t('backToReading')}</button>
  </div>`);
  ov.querySelectorAll('.snd[data-v]').forEach(btn => btn.addEventListener('click', () => playLetter(b, btn.dataset.v)));
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
    const sub = task.kind === 'learn' ? t('videoThenDaily') : task.kind === 'daily' ? t('dayOfDaily')() : t('fromBackpack');
    const pts = task.kind === 'learn' ? 12 : 6;
    const node = el('button', 'tnode' + (task.done ? ' done' : task === firstPending ? ' current' : ''));
    node.innerHTML = `<span class="big-ico">${icon}</span><div><div class="tt">${label}</div><div class="ts">${sub}</div></div><span class="pts">+${pts} ⭐</span>`;
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
  const startName = t('days')[state.weekStart], endName = t('days')[(state.weekStart + 6) % 7];
  wrap.appendChild(el('div', 'exp-title', `${startName} → ${endName}`));
  if (!hw) { wrap.appendChild(el('div', 'card center', `<p class="muted">${t('noHomework')}</p>`)); view.appendChild(wrap); return; }
  const grid = el('div', 'wgrid');
  days.forEach((dk_, i) => {
    const rec = state.daily[dk_] || {};
    const isToday = dk_ === tk, past = dk_ < tk;
    const d = el('div', 'wday' + (isToday ? ' today-d' : ''));
    const ts = tasksFor(dk_);
    const doneCount = ts.filter(x => x.done).length;
    const stat = ts.length && doneCount === ts.length ? '✓' : isToday ? `${doneCount}/${ts.length}` : '';
    d.innerHTML = `<div class="dn"><span>${t('daysShort')[new Date(dk_ + 'T12:00').getDay()]}${isToday ? ' · ' + t('today_') : ''}</span><span>${stat}</span></div>`;
    const dots = el('div', 'dots');
    for (const x of ts) {
      const cls = x.done ? 'done' : (isToday ? (x.kind === 'rev' ? 'r' : 'n') : 'off');
      dots.appendChild(el('span', 'dot ' + cls, x.kind === 'rev' ? 'R' : String(x.page)));
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
        const di = [0, 1, 2, 3, 4, 5].find(i => revAssignedTo(i).includes(p));
        const dayN = di != null ? t('daysShort')[new Date(days[di] + 'T12:00').getDay()] : '';
        return `<span class="bp-chip${revDoneThisWeek(p) ? ' done' : ''}">p.${p} · ${dayN}</span>`; }).join('')}</div>
      <div class="muted" style="margin-top:6px">${t('autoDist')}</div>`));
  view.appendChild(wrap);
}

// ---------------- ATLAS ----------------
function renderAtlas(view) {
  const wrap = el('div', 'pad');
  const discovered = Object.keys(state.completions).length;
  wrap.appendChild(el('div', 'atlas-head', t('pagesDiscovered')(discovered, 108)));
  for (const ch of CHAPTERS) {
    const total = ch.to - ch.from + 1;
    const done = Object.keys(state.completions).map(Number).filter(p => p >= ch.from && p <= ch.to).length;
    const pc = Math.round(done / total * 100);
    const locked = done === 0 && !(state.homework?.newPages || []).some(p => p >= ch.from && p <= ch.to);
    const stateTxt = !ch.inV1 ? t('comingSoon') : pc === 100 ? t('complete') : pc > 0 ? t('exploring') : t('locked');
    const isl = el('div', 'island' + (locked || !ch.inV1 ? ' locked' : ''));
    isl.innerHTML = `<span class="ie">${ch.icon}</span>
      <div class="in"><b>${t('chapters')[ch.id]}</b><span>${ch.from}–${ch.to} · ${stateTxt}</span></div>
      <div class="bar"><div class="track"><div class="fill" style="width:${pc}%"></div></div><div class="pc">${pc}%</div></div>`;
    wrap.appendChild(isl);
  }
  view.appendChild(wrap);
}

// ---------------- LETTER CARDS ----------------
function renderCards(view) {
  const wrap = el('div', 'pad');
  wrap.appendChild(el('div', 'atlas-head', t('collected')(state.cards.length, ALPHABET.length)));
  const grid = el('div', 'cards-grid');
  for (const L of ALPHABET) {
    const got = state.cards.includes(L);
    const c = el('button', 'ccard arabic' + (got ? '' : ' lockd'),
      `<span class="g">${L}</span><span class="st">${got ? '🃏' : '🔒'}</span>`);
    if (got) c.addEventListener('click', () => showLetterCard(L));
    grid.appendChild(c);
  }
  wrap.appendChild(grid);
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
  let idx = 0;
  const cont = el('div', null); cont.id = 'prac'; view.appendChild(cont);
  const sprintRow = el('div', 'sprint');
  const hint = el('div', 'prac-hint');
  const stage = el('div', 'word-stage');
  const word = el('div', 'big-word arabic');
  stage.appendChild(word);
  const lookup = el('div', 'lookup-hint', t('confused'));
  const speaker = el('button', 'speaker', '🔊'); speaker.setAttribute('aria-label', 'play');
  const plabel = el('div', 'parent-lbl', t('parentCheck'));
  const row = el('div', 'parent-row');
  const againBtn = el('button', 'btn again', t('tryAgain'));
  const okBtn = el('button', 'btn ok', t('gotIt'));
  row.append(againBtn, okBtn);
  cont.append(sprintRow, hint, stage, lookup, speaker, plabel, row);

  function sprintNo() { return Math.floor(idx / SPRINT); }
  function drawSprint() {
    sprintRow.innerHTML = '';
    const startI = sprintNo() * SPRINT;
    const count = Math.min(SPRINT, items.length - startI);
    for (let i = 0; i < count; i++) {
      const s = el('span', 's-star', '⭐');
      if (startI + i < idx) s.classList.add('lit');
      sprintRow.appendChild(s);
    }
    sprintRow.appendChild(el('span', 'chest-ico', '🧰'));
    hint.textContent = (isLetters ? t('lettersSprint') : t('sprintOf'))(sprintNo() + 1, sprints);
  }
  function drawWord() {
    const text = items[idx];
    const n = baseLettersOf(text).length || 1;
    word.style.fontSize = (n <= 1 ? 110 : n === 2 ? 96 : n === 3 ? 84 : n <= 5 ? 66 : n <= 9 ? 52 : 34) + 'px';
    let html = '', open = false;
    for (const ch of text) {
      if (HARAKA_RE.test(ch)) html += `<span class="h">${ch}</span>`;
      else if (ch === 'ـ') html += ch;
      else { if (open) html += '</span>'; html += `<span class="lt" data-l="${ch}">${ch}`; open = true; }
    }
    if (open) html += '</span>';
    word.innerHTML = html;
    word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop');
    word.querySelectorAll('.lt').forEach(sp => sp.addEventListener('click', () => showLetterCard(sp.dataset.l, { log: true })));
    drawSprint();
  }
  function play() {
    speaker.classList.add('pulse'); setTimeout(() => speaker.classList.remove('pulse'), 1500);
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
    play();
  });
  okBtn.addEventListener('click', () => {
    const r = okBtn.getBoundingClientRect();
    starBurst(r.left + r.width / 2, r.top);
    bumpStars(1);
    const stars = sprintRow.querySelectorAll('.s-star');
    const inSprint = idx % SPRINT;
    if (stars[inSprint]) stars[inSprint].classList.add('lit');
    idx++;
    if (idx >= items.length) return finish();
    if (idx % SPRINT === 0) {
      bumpStars(6);
      const ov = overlay(`<div class="big-emoji">🎉🧰✨</div><h4>${t('chestOpened')}</h4>
        <p class="muted">${t('plusStars')(6)}</p>
        <button class="btn primary big" data-next>${t('nextSprint')}</button>`);
      ov.querySelector('[data-next]').addEventListener('click', () => { ov.remove(); drawWord(); });
      return;
    }
    setTimeout(drawWord, 220);
  });

  function finish() {
    bumpStars(6);                                        // final sprint chest
    const bonus = kind === 'learn' ? 12 : 6;
    bumpStars(bonus);
    state.completions[page] = (state.completions[page] || 0) + 1;
    if (kind === 'learn') state.firstDone[page] = true;
    for (const L of newCardLetters(page)) state.cards.push(L);
    const tk = todayKey();
    state.daily[tk] = state.daily[tk] || {};
    if (taskId) state.daily[tk][taskId] = true;
    let chestMsg = '';
    if (tasksFor(tk).every(x => x.done) && !state.daily[tk].chest) {
      state.daily[tk].chest = true; bumpStars(10); chestMsg = `<p style="font-weight:800;color:var(--green)">${t('chestOpen')}</p>`;
      const last = state.streak.last;
      const y = new Date(); y.setDate(y.getDate() - 1);
      state.streak.count = (last === dkey(y)) ? state.streak.count + 1 : 1;
      state.streak.last = tk;
    }
    save(); confetti();
    const ov = overlay(`<div class="big-emoji">🎉⭐🎉</div><h4>${t('pageDone')(page)}</h4>
      <p class="muted">${t('plusStars')(bonus + 6)}</p>${chestMsg}
      <button class="btn primary big" data-home>OK!</button>`);
    ov.querySelector('[data-home]').addEventListener('click', () => { ov.remove(); go('today'); });
  }
  drawWord();
}

// ---------------- PARENT ----------------
let parentUnlocked = false;
function renderParentGate(view) {
  if (parentUnlocked) return renderParent(view);
  const a = 3 + Math.floor(Math.random() * 6), b = 4 + Math.floor(Math.random() * 5);
  const wrap = el('div', 'pad center');
  wrap.appendChild(el('div', 'card', `<div class="gate-q">🔒 ${t('gateQ')} ${a} + ${b}?</div>
    <input class="gate-in" id="gate-in" type="number" inputmode="numeric">
    <div style="margin-top:12px"><button class="btn primary" id="gate-go">${t('enter')}</button></div>`));
  view.appendChild(wrap);
  $('#gate-go').addEventListener('click', () => {
    if (parseInt($('#gate-in').value, 10) === a + b) { parentUnlocked = true; go('parent'); }
    else toast(t('wrongAnswer'));
  });
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
  sched.innerHTML = `<b>${t('weekSchedule')} · <span style="color:var(--teal)">${t('weekProgress')(pc)}</span></b>
    <div class="sel-row"><span>${t('weekStartsOn')}</span><select id="ws-sel">${
      t('days').map((d, i) => `<option value="${i}" ${i === state.weekStart ? 'selected' : ''}>${d}</option>`).join('')
    }</select><span id="ws-end">${t('endsNote')(t('days')[(state.weekStart + 6) % 7])}</span></div>`;
  wrap.appendChild(sched);

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
  rev.innerHTML = `<b>${t('revSetup')}</b>
    <div class="sel-row"><span>${t('from')}</span><select id="rev-from">${opts('revFrom')}</select>
    <span>${t('to')}</span><select id="rev-to">${opts('revTo')}</select></div>`;
  wrap.appendChild(rev);

  const saveBtn = el('button', 'btn primary big', t('save'));
  saveBtn.addEventListener('click', () => {
    state.weekStart = parseInt($('#ws-sel').value, 10);
    const rf = $('#rev-from').value, rt = $('#rev-to').value;
    state.homework = {
      newPages: [...sel].sort((x, y) => x - y),
      revFrom: rf ? parseInt(rf, 10) : null,
      revTo: rt ? parseInt(rt, 10) : null,
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
  $('#stars-pill').textContent = '⭐ ' + state.stars;
  $('#lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
  $('#lang-btn').addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar'; save(); applyDir();
    $('#lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
    drawNav(); go(NAV.includes(current) ? current : 'today');
  });
  drawNav();
  go('today');
  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
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
