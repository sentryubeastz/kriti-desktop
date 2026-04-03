'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_LANG_KEY = 'defaultLang';
const LANG_LABELS = {
  hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German',
  ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ta: 'Tamil',
  te: 'Telugu', kn: 'Kannada', bn: 'Bengali', pt: 'Portuguese',
};

const SPEAK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
const STOP_SVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const COPY_SVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const modeBadge    = document.getElementById('modeBadge');
const wordText     = document.getElementById('wordText');
const defBody      = document.getElementById('defBody');
const transCard    = document.getElementById('transCard');
const transLabel   = document.getElementById('transLabel');
const transBody    = document.getElementById('transBody');
const langSelect   = document.getElementById('langSelect');
const saveArea     = document.getElementById('saveArea');
const toastEl      = document.getElementById('toast');
const btnClose     = document.getElementById('btnClose');
const btnNotes     = document.getElementById('btnNotes');
const btnSpeakWord = document.getElementById('btnSpeakWord');
const btnSpeakDef  = document.getElementById('btnSpeakDef');
const btnSpeakTrans = document.getElementById('btnSpeakTrans');
const btnCopy      = document.getElementById('btnCopy');
const searchMode   = document.getElementById('searchMode');
const contentEl    = document.getElementById('content');
const manualInput  = document.getElementById('manualInput');
const manualSearchBtn = document.getElementById('manualSearchBtn');

// ─── State ────────────────────────────────────────────────────────────────────
let currentWord   = '';
let currentMode   = 'word';
let defText       = '';       // plain text of definition (for TTS / copy)
let transText     = '';       // plain text of translation
let confirmTimer  = null;
let _closeOnBlur  = false;
let _blurArmTimer = null;

// ─── Offline indicator ────────────────────────────────────────────────────────
const offlineBadge = document.getElementById('offlineBadge');
function _updateOnlineStatus() {
  if (offlineBadge) offlineBadge.style.display = navigator.onLine ? 'none' : 'inline-flex';
}
window.addEventListener('online',  _updateOnlineStatus);
window.addEventListener('offline', _updateOnlineStatus);
_updateOnlineStatus();

// When a native <select> dropdown is opened, it steals OS focus and fires
// window.blur. Guard against that by disabling close-on-blur briefly on mousedown.
document.addEventListener('mousedown', (e) => {
  if (e.target && e.target.tagName === 'SELECT') {
    _closeOnBlur = false;
    setTimeout(() => { _closeOnBlur = true; }, 1500);
  }
}, true);

// Renderer-side blur \u2192 close. screen-saver alwaysOnTop level ensures this fires.
window.addEventListener('blur', () => {
  if (_closeOnBlur) window.electronAPI?.closePopup();
});
// Arm close-on-blur as soon as the window actually gains focus.
window.addEventListener('focus', () => {
  _closeOnBlur = true;
});
// ─── Initialise ───────────────────────────────────────────────────────────────
(function init() {
  // Set saved language preference
  const saved = localStorage.getItem(DEFAULT_LANG_KEY);
  if (saved && langSelect.querySelector(`option[value="${saved}"]`)) {
    langSelect.value = saved;
  }

  // Button icons
  btnSpeakWord.innerHTML  = SPEAK_SVG;
  btnSpeakDef.innerHTML   = SPEAK_SVG;
  btnSpeakTrans.innerHTML = SPEAK_SVG;
  btnCopy.innerHTML       = COPY_SVG;

  // Wire up controls
  btnClose.addEventListener('click', closeSelf);
  btnNotes.addEventListener('click', () => window.electronAPI?.openNotes());

  langSelect.addEventListener('change', async () => {
    const lang = langSelect.value;
    localStorage.setItem(DEFAULT_LANG_KEY, lang);
    if (!currentWord) return;
    transBody.textContent = '';
    transCard.style.display = 'none';
    const trans = await fetchTranslation(currentWord, lang);
    if (trans) {
      transText = trans;
      transLabel.textContent = `${LANG_LABELS[lang] || lang} Translation`;
      transBody.textContent  = trans;
      transCard.style.display = 'block';
    } else {
      transText = '';
      transCard.style.display = 'none';
    }
  });

  btnSpeakWord.addEventListener('click',  () => toggleSpeak(btnSpeakWord,  () => currentWord));
  btnSpeakDef.addEventListener('click',   () => toggleSpeak(btnSpeakDef,   () => defText));
  btnSpeakTrans.addEventListener('click', () => toggleSpeak(btnSpeakTrans, () => transText));

  btnCopy.addEventListener('click', doCopy);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSelf();
  });

  // Listen for word from main process
  if (window.electronAPI) {
    window.electronAPI.onLookup((word) => {
      _closeOnBlur = false; // re-disarm until armed below
      // Arm via focus event (fast) OR timer fallback (if OS skips focus)
      clearTimeout(_blurArmTimer);
      _blurArmTimer = setTimeout(() => { _closeOnBlur = true; }, 300);

      if (word && word.trim()) {
        showLookupMode();
        doLookup(word.trim());
      } else {
        showSearchMode();
      }
    });
  }

  // Manual search box
  function runManualSearch() {
    const w = manualInput.value.trim();
    if (!w) return;
    showLookupMode();
    doLookup(w);
  }
  manualSearchBtn.addEventListener('click', runManualSearch);
  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runManualSearch();
  });
})();

function showSearchMode() {
  searchMode.classList.add('visible');
  contentEl.style.display = 'none';
  manualInput.value = '';
  setTimeout(() => manualInput.focus(), 50);
}

function showLookupMode() {
  searchMode.classList.remove('visible');
  contentEl.style.display = '';
}

// ─── Lookup ───────────────────────────────────────────────────────────────────
async function doLookup(word) {
  currentWord  = word;
  currentMode  = getMode(word);
  defText      = '';
  transText    = '';
  clearConfirm();

  // Update word + badge
  wordText.textContent  = word;
  modeBadge.textContent = { word: 'Word', phrase: 'Phrase', sentence: 'Sentence' }[currentMode];

  // Reset definition
  defBody.innerHTML = '<span class="loading-text">Loading…</span>';
  transCard.style.display = 'none';
  transBody.textContent = '';

  // Populate save area
  renderSaveArea(word);

  // Speak buttons back to normal
  resetSpeakBtns();

  // Detect language of selected text (instant, uses Unicode ranges)
  const detectedLang = detectLanguage(word);
  const isEnglish = detectedLang === 'en';

  const userLang = langSelect.value;

  // If non-English: translate to English instead, skip dictionary definition
  const transPair = isEnglish ? `en|${userLang}` : `${detectedLang}|en`;

  const [defData, trans] = await Promise.all([
    (currentMode === 'word' && isEnglish) ? fetchDefinition(word) : Promise.resolve(null),
    fetchTranslation(word, userLang, transPair),
  ]);

  // Render definition
  if (currentMode === 'word' && isEnglish) {
    if (defData && defData.length) {
      renderDefinition(defData[0]);
    } else {
      defBody.innerHTML = '<span class="error-text">No definition found.</span>';
    }
  } else if (!isEnglish) {
    // Show detected language badge near the word
    defBody.innerHTML = `<span class="pos-badge">${LANG_LABELS[detectedLang] || detectedLang.toUpperCase()}</span><div>Translating to English…</div>`;
    defText = '';
  } else {
    defBody.innerHTML = `<strong>${escHtml(word)}</strong>`;
    defText = word;
  }

  // Render translation
  if (trans) {
    transText = trans;
    if (isEnglish) {
      transLabel.textContent = `${LANG_LABELS[userLang] || userLang} Translation`;
    } else {
      transLabel.textContent = `English Translation`;
      // Show the English translation as the main definition too
      defBody.innerHTML = `<span class="pos-badge">${LANG_LABELS[detectedLang] || detectedLang.toUpperCase()}</span><div style="margin-top:4px">${escHtml(trans)}</div>`;
      defText = trans;
    }
    transBody.textContent  = trans;
    transCard.style.display = 'block';
  }

  // Record lookup in history (fire-and-forget, don't slow down the UI)
  recordLookup(word, userLang);
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function recordLookup(word, lang) {
  if (!window.electronAPI) return;
  try {
    const data = await window.electronAPI.storageGet(['history']);
    const prev = Array.isArray(data?.history) ? data.history : [];
    const entry = { word, language: lang, timestamp: new Date().toISOString() };
    // Keep at most 2000 entries to avoid unbounded growth
    await window.electronAPI.storageSet({ history: [...prev.slice(-1999), entry] });
  } catch { /* non-critical */ }
}

async function fetchDefinition(word) {
  // ── Offline cache check ──────────────────────────────────────────────────
  if (window.electronAPI) {
    try {
      const cached = await window.electronAPI.storageGet(['defCache']);
      const cache  = cached?.defCache || {};
      const key    = word.toLowerCase().trim();
      if (cache[key]) return cache[key]; // return cached data
    } catch { /* ignore */ }
  }

  // ── Online fetch ─────────────────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!r.ok) return null;
    const data = await r.json();

    // Cache the result locally (store up to 1000 words)
    if (window.electronAPI && Array.isArray(data)) {
      try {
        const cached = await window.electronAPI.storageGet(['defCache']);
        const cache  = cached?.defCache || {};
        const key    = word.toLowerCase().trim();
        cache[key]   = data;
        // Prune if over 1000 entries
        const keys = Object.keys(cache);
        if (keys.length > 1000) delete cache[keys[0]];
        await window.electronAPI.storageSet({ defCache: cache });
      } catch { /* non-critical */ }
    }
    return data;
  } catch {
    // ── Bundled wordlist fallback (works offline) ──────────────────────────
    if (window.electronAPI?.getWordlistEntry) {
      const local = window.electronAPI.getWordlistEntry(word);
      if (local) return local;
    }
    return null;
  }
}

async function fetchTranslation(word, lang, langpair) {
  const pair = langpair || `en|${lang}`;
  const cacheKey = `${word.toLowerCase().trim()}|||${pair}`;

  // ── Translation cache check ──────────────────────────────────────────────
  if (window.electronAPI) {
    try {
      const cached = await window.electronAPI.storageGet(['transCache']);
      const cache  = cached?.transCache || {};
      if (cache[cacheKey]) return cache[cacheKey];
    } catch { /* ignore */ }
  }

  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${pair}`
    );
    const d = await r.json();
    const t = d?.responseData?.translatedText?.trim() || '';
    if (!t || t.toLowerCase() === word.toLowerCase()) return null;

    // ── Write to translation cache (max 2000 entries) ──────────────────────
    if (window.electronAPI) {
      try {
        const cached = await window.electronAPI.storageGet(['transCache']);
        const cache  = cached?.transCache || {};
        cache[cacheKey] = t;
        const keys = Object.keys(cache);
        if (keys.length > 2000) delete cache[keys[0]];
        await window.electronAPI.storageSet({ transCache: cache });
      } catch { /* non-critical */ }
    }
    return t;
  } catch { return null; }
}

/**
 * Detect language using Unicode character ranges — instant, no API needed.
 * Covers all major non-Latin scripts. Latin-script text defaults to 'en'.
 */
function detectLanguage(text) {
  const s = text.trim();
  if (!s) return null;
  const ranges = [
    { lang: 'hi', re: /[\u0900-\u097F]/ },   // Devanagari (Hindi, Marathi)
    { lang: 'ar', re: /[\u0600-\u06FF]/ },   // Arabic
    { lang: 'zh', re: /[\u4E00-\u9FFF]/ },   // CJK (Chinese)
    { lang: 'ja', re: /[\u3040-\u30FF]/ },   // Japanese Hiragana/Katakana
    { lang: 'ko', re: /[\uAC00-\uD7AF]/ },   // Korean
    { lang: 'ru', re: /[\u0400-\u04FF]/ },   // Cyrillic (Russian etc.)
    { lang: 'ta', re: /[\u0B80-\u0BFF]/ },   // Tamil
    { lang: 'te', re: /[\u0C00-\u0C7F]/ },   // Telugu
    { lang: 'kn', re: /[\u0C80-\u0CFF]/ },   // Kannada
    { lang: 'bn', re: /[\u0980-\u09FF]/ },   // Bengali
    { lang: 'gu', re: /[\u0A80-\u0AFF]/ },   // Gujarati
    { lang: 'pa', re: /[\u0A00-\u0A7F]/ },   // Gurmukhi (Punjabi)
    { lang: 'th', re: /[\u0E00-\u0E7F]/ },   // Thai
  ];
  for (const { lang, re } of ranges) {
    if (re.test(s)) return lang;
  }
  return 'en'; // Latin-script → assume English
}

// ─── Render definition ────────────────────────────────────────────────────────
function renderDefinition(entry) {
  const phonetic = entry.phonetics?.find((p) => p.text)?.text || '';
  let html = '';
  if (phonetic) html += `<div style="color:var(--muted);font-size:12px;margin-bottom:6px">${escHtml(phonetic)}</div>`;

  const meanings = (entry.meanings || []).slice(0, 3);
  meanings.forEach((m) => {
    html += `<span class="pos-badge">${escHtml(m.partOfSpeech)}</span>`;
    (m.definitions || []).slice(0, 2).forEach((d) => {
      html += `<div style="margin-bottom:5px">${escHtml(d.definition)}`;
      if (d.example) html += `<div class="example-text">"${escHtml(d.example)}"</div>`;
      html += '</div>';
    });

    // Collect synonyms
    const syns = (m.synonyms || []).slice(0, 4);
    if (syns.length) {
      html += `<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Synonyms: ${syns.map(escHtml).join(', ')}</div>`;
    }
  });

  // Plain text for TTS
  defText = entry.meanings?.[0]?.definitions?.[0]?.definition || '';

  defBody.innerHTML = html || '<span class="error-text">No definition found.</span>';
}

// ─── Save to Notes ────────────────────────────────────────────────────────────
function renderSaveArea(word) {
  saveArea.innerHTML = '';

  if (currentMode !== 'word') {
    // Phrase/sentence: offer Google search
    const btn = document.createElement('button');
    btn.className = 'btn-search';
    btn.textContent = `Search "${word.length > 40 ? word.substring(0, 40) + '…' : word}" online ↗`;
    btn.addEventListener('click', () => {
      const query = currentMode === 'sentence'
        ? `${word} sentence meaning`
        : `${word} phrase meaning`;
      window.electronAPI?.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    });
    saveArea.appendChild(btn);
  }

  // Save row
  const row = document.createElement('div');
  row.className = 'save-row';

  const folderSel = document.createElement('select');
  folderSel.className = 'folder-select';
  folderSel.innerHTML = '<option value="__loading__">Loading folders…</option>';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => saveWord(word, folderSel, saveBtn));

  row.appendChild(folderSel);
  row.appendChild(saveBtn);
  saveArea.appendChild(row);

  // Inline new-folder row (hidden until button clicked)
  const nfRow = document.createElement('div');
  nfRow.className = 'new-folder-row';

  const nfInput = document.createElement('input');
  nfInput.className = 'new-folder-input';
  nfInput.type = 'text';
  nfInput.placeholder = 'New folder name…';
  nfInput.maxLength = 60;

  const nfOk = document.createElement('button');
  nfOk.className = 'btn-nf-ok';
  nfOk.type = 'button';
  nfOk.textContent = '✓';
  nfOk.title = 'Create folder';

  const nfCancel = document.createElement('button');
  nfCancel.className = 'btn-nf-cancel';
  nfCancel.type = 'button';
  nfCancel.textContent = '✕';
  nfCancel.title = 'Cancel';

  nfRow.append(nfInput, nfOk, nfCancel);
  saveArea.appendChild(nfRow);

  let _prevFolderVal = '';
  // Show inline row when special dropdown option is chosen
  folderSel.addEventListener('change', () => {
    if (folderSel.value === '__new_folder__') {
      nfRow.classList.add('visible');
      nfInput.value = '';
      nfInput.focus();
    } else {
      _prevFolderVal = folderSel.value;
    }
  });
  nfCancel.addEventListener('click', () => {
    nfRow.classList.remove('visible');
    folderSel.value = _prevFolderVal || folderSel.options[0]?.value || '';
  });

  const createFolder = async () => {
    const name = nfInput.value.trim();
    if (!name) { folderSel.value = _prevFolderVal || folderSel.options[0]?.value || ''; return; }
    nfRow.classList.remove('visible');
    await addFolderToStore(name, folderSel);
  };
  nfOk.addEventListener('click', createFolder);
  nfInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createFolder();
    if (e.key === 'Escape') nfRow.classList.remove('visible');
  });

  // Async load folders
  loadFolders(folderSel);
}

async function loadFolders(select) {
  try {
    const data = await window.electronAPI.storageGet(['notes', 'customFolders']);
    const notes   = data?.notes || {};
    const custom  = Array.isArray(data?.customFolders) ? data.customFolders : [];
    const folders = Array.from(new Set([...Object.keys(notes), ...custom, 'Quick Save']));
    select.innerHTML = '';
    folders.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      select.appendChild(opt);
    });
    if (!folders.includes('Quick Save')) {
      const opt = document.createElement('option');
      opt.value = 'Quick Save';
      opt.textContent = 'Quick Save';
      select.appendChild(opt);
    }
    // Special option at the bottom of the list
    const newOpt = document.createElement('option');
    newOpt.value = '__new_folder__';
    newOpt.textContent = '＋ New folder…';
    select.appendChild(newOpt);
  } catch {
    select.innerHTML = '<option value="Quick Save">Quick Save</option><option value="__new_folder__">＋ New folder…</option>';
  }
}

async function addFolderToStore(name, select) {
  try {
    const data = await window.electronAPI.storageGet(['customFolders']);
    const custom = Array.isArray(data?.customFolders) ? data.customFolders : [];
    if (!custom.includes(name)) {
      custom.push(name);
      await window.electronAPI.storageSet({ customFolders: custom });
    }
    // Rebuild select and pick the new folder
    await loadFolders(select);
    select.value = name;
  } catch { /* ignore */ }
}

async function saveWord(word, folderSel, saveBtn) {
  const folder = folderSel.value;
  if (!folder || folder === '__loading__' || folder === '__new_folder__') return;

  try {
    const data  = await window.electronAPI.storageGet(['notes', 'customFolders']);
    const notes = data?.notes || {};
    const wordLower = word.toLowerCase().trim();

    // Duplicate check: same folder
    const folderWords = notes[folder] || [];
    if (folderWords.some((n) => (n?.word || '').toLowerCase().trim() === wordLower)) {
      saveBtn.textContent = '⚠ Already saved here';
      saveBtn.classList.add('warn');
      setTimeout(() => resetSaveBtn(saveBtn), 2500);
      return;
    }

    // Duplicate check: other folder
    const otherFolder = Object.keys(notes).find(
      (f) => f !== folder &&
        (notes[f] || []).some((n) => (n?.word || '').toLowerCase().trim() === wordLower)
    );
    if (otherFolder && !saveBtn.dataset.confirm) {
      const short = otherFolder.length > 18 ? otherFolder.substring(0, 18) + '…' : otherFolder;
      saveBtn.textContent = `⚠ In "${short}" — save anyway?`;
      saveBtn.classList.add('warn');
      saveBtn.style.fontSize = '11px';
      saveBtn.dataset.confirm = '1';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => resetSaveBtn(saveBtn), 3500);
      return;
    }

    clearConfirm();

    // Build the note entry
    if (!notes[folder]) notes[folder] = [];
    const wordCount = word.trim().split(/\s+/).length;
    notes[folder].push({
      word,
      definition: defText || word,
      translation: transText || '',
      translationLang: langSelect.value || '',
      type: wordCount <= 1 ? 'word' : wordCount <= 8 ? 'phrase' : 'sentence',
      personalNotes: '',
      pinned: false,
      pinnedAt: null,
      timestamp: new Date().toISOString(),
    });

    // Ensure folder is in customFolders
    const customFolders = data?.customFolders || [];
    if (!customFolders.includes(folder)) customFolders.push(folder);

    await window.electronAPI.storageSet({ notes, customFolders });

    saveBtn.textContent = '✓ Saved!';
    saveBtn.disabled = true;
    showToast(`Saved to "${folder}"`);
    setTimeout(() => resetSaveBtn(saveBtn), 2000);

  } catch (e) {
    saveBtn.textContent = 'Save failed';
    setTimeout(() => resetSaveBtn(saveBtn), 2000);
    console.error('[popup] save error:', e);
  }
}

function resetSaveBtn(btn) {
  btn.textContent = 'Save to Notes';
  btn.disabled  = false;
  btn.style.fontSize = '';
  btn.classList.remove('warn');
  delete btn.dataset.confirm;
}

function clearConfirm() {
  clearTimeout(confirmTimer);
  confirmTimer = null;
}

// ─── TTS ──────────────────────────────────────────────────────────────────────
function toggleSpeak(btn, getTextFn) {
  const isSpeaking = btn.classList.contains('speaking');
  window.speechSynthesis?.cancel();
  resetSpeakBtns();

  if (isSpeaking) return;

  const text = getTextFn();
  if (!text || !('speechSynthesis' in window)) return;

  const utt = new SpeechSynthesisUtterance(text);
  utt.onend = utt.onerror = () => resetSpeakBtns();

  btn.innerHTML = STOP_SVG;
  btn.classList.add('speaking');
  window.speechSynthesis.speak(utt);
}

function resetSpeakBtns() {
  [btnSpeakWord, btnSpeakDef, btnSpeakTrans].forEach((b) => {
    b.innerHTML = SPEAK_SVG;
    b.classList.remove('speaking');
  });
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
async function doCopy() {
  const lang  = LANG_LABELS[langSelect.value] || langSelect.value;
  const lines = [`Word: ${currentWord}`];
  if (defText)   lines.push(`Definition: ${defText}`);
  if (transText) lines.push(`${lang} Translation: ${transText}`);

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btnCopy.innerHTML = '✓';
    btnCopy.classList.add('active');
    setTimeout(() => { btnCopy.innerHTML = COPY_SVG; btnCopy.classList.remove('active'); }, 1500);
  } catch { /* silently fail */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMode(text) {
  const n = text.trim().split(/\s+/).length;
  return n <= 1 ? 'word' : n <= 8 ? 'phrase' : 'sentence';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function closeSelf() {
  window.speechSynthesis?.cancel();
  window.electronAPI?.closePopup();
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
