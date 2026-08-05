/* Iqra Quest — reward sounds.
 *
 * Synthesised with the Web Audio API rather than shipped as files: no downloads,
 * works offline, and stays clear of the teacher's recordings. Kept short and bright
 * (bell-like sine tones) so they read as "well done" without startling a small child.
 * Everything is muted automatically if the child's device asks for reduced motion.
 */
'use strict';

const SFX = (() => {
  let ctx = null;
  const quiet = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // one bell-ish note
  function note(freq, startAt, dur = 0.22, gain = 0.16, type = 'sine') {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime + startAt;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);   // fast attack
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);   // gentle tail
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const play = seq => { if (quiet()) return; seq.forEach(([f, t, d, g]) => note(f, t, d, g)); };

  // Notes chosen from a pentatonic scale so any two sounds overlapping still agree.
  return {
    // one correct reading — a small rising "ting"
    star() { play([[880, 0, .16, .13], [1318.5, .07, .22, .11]]); },
    // sprint chest — a quick sparkle up the scale
    chest() { play([[659.3, 0, .14, .12], [880, .09, .14, .12], [1174.7, .18, .3, .12]]); },
    // page/mission finished — a short fanfare that resolves
    mission() {
      play([[523.3, 0, .18, .13], [659.3, .12, .18, .13], [784, .24, .2, .13],
            [1046.5, .38, .5, .15], [1318.5, .42, .5, .10]]);
    },
    // a new sticker — playful, bouncy
    sticker() { play([[784, 0, .12, .12], [1046.5, .1, .12, .12], [1568, .2, .28, .11]]); },
    // gentle "let's try that again" — never sounds like failure
    again() { play([[440, 0, .14, .09], [392, .1, .2, .08]]); },
  };
})();
