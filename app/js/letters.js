// Arabic letters: forms [alone, start, middle, end], English name, connectivity.
// Non-connectors (to the following letter): ا د ذ ر ز و
window.LETTERS = {
  'ا': { forms: ['ا', 'ا', 'ـا', 'ـا'], name: 'Alif', tts: 'أَ' },
  'ب': { forms: ['ب', 'بـ', 'ـبـ', 'ـب'], name: 'Baa', tts: 'بَ' },
  'ت': { forms: ['ت', 'تـ', 'ـتـ', 'ـت'], name: 'Taa', tts: 'تَ' },
  'ث': { forms: ['ث', 'ثـ', 'ـثـ', 'ـث'], name: 'Thaa', tts: 'ثَ' },
  'ج': { forms: ['ج', 'جـ', 'ـجـ', 'ـج'], name: 'Jeem', tts: 'جَ' },
  'ح': { forms: ['ح', 'حـ', 'ـحـ', 'ـح'], name: 'Haa', tts: 'حَ' },
  'خ': { forms: ['خ', 'خـ', 'ـخـ', 'ـخ'], name: 'Khaa', tts: 'خَ' },
  'د': { forms: ['د', 'د', 'ـد', 'ـد'], name: 'Dal', tts: 'دَ' },
  'ذ': { forms: ['ذ', 'ذ', 'ـذ', 'ـذ'], name: 'Thal', tts: 'ذَ' },
  'ر': { forms: ['ر', 'ر', 'ـر', 'ـر'], name: 'Raa', tts: 'رَ' },
  'ز': { forms: ['ز', 'ز', 'ـز', 'ـز'], name: 'Zay', tts: 'زَ' },
  'س': { forms: ['س', 'سـ', 'ـسـ', 'ـس'], name: 'Seen', tts: 'سَ' },
  'ش': { forms: ['ش', 'شـ', 'ـشـ', 'ـش'], name: 'Sheen', tts: 'شَ' },
  'ص': { forms: ['ص', 'صـ', 'ـصـ', 'ـص'], name: 'Saad', tts: 'صَ' },
  'ض': { forms: ['ض', 'ضـ', 'ـضـ', 'ـض'], name: 'Daad', tts: 'ضَ' },
  'ط': { forms: ['ط', 'طـ', 'ـطـ', 'ـط'], name: 'Taa (heavy)', tts: 'طَ' },
  'ظ': { forms: ['ظ', 'ظـ', 'ـظـ', 'ـظ'], name: 'Dhaa', tts: 'ظَ' },
  'ع': { forms: ['ع', 'عـ', 'ـعـ', 'ـع'], name: 'Ayn', tts: 'عَ' },
  'غ': { forms: ['غ', 'غـ', 'ـغـ', 'ـغ'], name: 'Ghayn', tts: 'غَ' },
  'ف': { forms: ['ف', 'فـ', 'ـفـ', 'ـف'], name: 'Faa', tts: 'فَ' },
  'ق': { forms: ['ق', 'قـ', 'ـقـ', 'ـق'], name: 'Qaf', tts: 'قَ' },
  'ك': { forms: ['ك', 'كـ', 'ـكـ', 'ـك'], name: 'Kaf', tts: 'كَ' },
  'ل': { forms: ['ل', 'لـ', 'ـلـ', 'ـل'], name: 'Lam', tts: 'لَ' },
  'م': { forms: ['م', 'مـ', 'ـمـ', 'ـم'], name: 'Meem', tts: 'مَ' },
  'ن': { forms: ['ن', 'نـ', 'ـنـ', 'ـن'], name: 'Noon', tts: 'نَ' },
  'ه': { forms: ['ه', 'هـ', 'ـهـ', 'ـه'], name: 'Ha', tts: 'هَ' },
  'و': { forms: ['و', 'و', 'ـو', 'ـو'], name: 'Waw', tts: 'وَ' },
  'ي': { forms: ['ي', 'يـ', 'ـيـ', 'ـي'], name: 'Yaa', tts: 'يَ' },
  'ء': { forms: ['ء', 'ء', 'ء', 'ء'], name: 'Hamza', tts: 'أَ' },
  'أ': { forms: ['أ', 'أ', 'ـأ', 'ـأ'], name: 'Hamza on Alif', tts: 'أَ', special: true },
  'إ': { forms: ['إ', 'إ', 'ـإ', 'ـإ'], name: 'Hamza under Alif', tts: 'إِ', special: true },
  // Shapes the book teaches that are NOT one of the 28 base letters. They were being
  // folded into their base letter, so a child meeting سُئِلَ or قُرِئَ on page 28 was
  // shown the plain ي card and never the seat the hamza actually sits on.
  'ؤ': { forms: ['ؤ', 'ؤ', 'ـؤ', 'ـؤ'], name: 'Hamza on Waw', tts: 'ؤُ', special: true },
  'ئ': { forms: ['ئ', 'ئـ', 'ـئـ', 'ـئ'], name: 'Hamza on Yaa', tts: 'ئِ', special: true },
  'ة': { forms: ['ة', '—', '—', 'ـة'], name: 'Taa Marbuta', tts: 'ةَ', special: true },
  'ى': { forms: ['ى', '—', '—', 'ـى'], name: 'Alif Maqsura', tts: 'ى', special: true },
  'لا': { forms: ['لا', '—', '—', 'ـلا'], name: 'Lam-Alif', tts: 'لَا', special: true },
};
// The book introduces these alongside the alphabet (page 7's grid even gives ء and لا
// their own cells), so they get their own cards rather than being normalised away.
window.SPECIALS = ['أ', 'إ', 'ء', 'ؤ', 'ئ', 'ة', 'ى', 'لا'];
// use a character's OWN card when it has one; otherwise fall back to its base letter
window.cardFor = ch => (window.LETTERS[ch] ? ch : window.baseLetter(ch));
window.ALPHABET = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

// Souvenirs — one set per REGION of the Atlas, not a bag of unrelated emoji.
// The whole game is one journey: the child crosses a land, each chapter of the book is
// a region, and finishing its pages brings back things found in THAT place. So the
// reward always says where you have been, and the album doubles as a travel journal.
window.STICKERS = [
  { set: 'fathah',  items: ['🌾','🌻','🦋','🐝','🐞','🌷','🍎','🐣'] },
  { set: 'kasrah',  items: ['🐟','🦆','🪷','🐸','🛶','🦢','🪨','🌊'] },
  { set: 'dhammah', items: ['🐪','🌵','🏜️','🫖','🐍','🪬','🧭','🌅'] },
  { set: 'madd',    items: ['🏔️','🦅','🐐','⛺','🌲','❄️','🧗','🔦'] },
  { set: 'tanween', items: ['🦌','🦉','🍄','🐿️','🌰','🦊','🪵','🕯️'] },
  { set: 'sukoon',  items: ['🐬','🐙','🐚','⛵','🦀','🐳','🏝️','🪸'] },
  { set: 'rules',   items: ['🏛️','📜','🗝️','🏺','⚖️','🪔','🕰️','🎐'] },
  { set: 'peak',    items: ['🕌','🌙','⭐','📖','🤲','🕋','✨','🏆'] },
];
window.ALL_STICKERS = STICKERS.flatMap(g => g.items.map(e => ({ e, set: g.set })));
window.stickersOf = set => (STICKERS.find(g => g.set === set) || { items: [] }).items;
// letters that never connect to the letter AFTER them (their start/middle forms look isolated)
window.NON_CONNECTORS = new Set(['ا','أ','إ','د','ذ','ر','ز','و','ء']);
window.VOWEL_MARKS = { fathah: 'َ', kasrah: 'ِ', dhammah: 'ُ' };
// normalize a possibly-hamza'd char to its card letter
window.baseLetter = ch => ({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ة':'ه','ى':'ي','ئ':'ي','ؤ':'و'}[ch] || ch);
