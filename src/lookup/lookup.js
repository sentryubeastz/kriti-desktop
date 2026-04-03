'use strict';

// ─── State ─────────────────────────────────────────────────────────────────────
const DEFAULT_LANG_KEY = 'kriti_default_lang';
const LANGUAGE_LABELS = {
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', hi: 'Hindi', zh: 'Chinese', ja: 'Japanese',
  ko: 'Korean', ar: 'Arabic', ru: 'Russian', tr: 'Turkish',
};

let currentWord = '';
let currentDefinitions = null;

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const searchInput  = document.getElementById('searchInput');
const searchBtn    = document.getElementById('searchBtn');
const langSelect   = document.getElementById('langSelect');
const results      = document.getElementById('results');
const placeholder  = document.getElementById('placeholder');
const spinner      = document.getElementById('spinner');
const toastEl      = document.getElementById('toast');
const btnNotes     = document.getElementById('btnNotes');

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  const saved = localStorage.getItem(DEFAULT_LANG_KEY);
  if (saved && langSelect.querySelector(`option[value="${saved}"]`)) {
    langSelect.value = saved;
  }

  searchBtn.addEventListener('click', () => doLookup(searchInput.value.trim()));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLookup(searchInput.value.trim());
  });
  langSelect.addEventListener('change', () => {
    localStorage.setItem(DEFAULT_LANG_KEY, langSelect.value);
    if (currentWord) retranslate();
  });

  btnNotes.addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.openNotes();
  });

  // Listen for word sent from main process (via global shortcut)
  if (window.electronAPI) {
    window.electronAPI.onLookup((word) => {
      if (word) {
        searchInput.value = word;
        doLookup(word);
      }
    });
  }
})();

// ─── Lookup orchestration ──────────────────────────────────────────────────────
async function doLookup(word) {
  if (!word) return;
  currentWord    = word;
  currentDefinitions = null;

  placeholder.style.display = 'none';
  spinner.style.display     = 'block';
  clearCards();

  const [defData, translation] = await Promise.all([
    fetchDefinition(word),
    fetchTranslation(word, langSelect.value),
  ]);

  spinner.style.display = 'none';

  if (defData && defData.length) {
    currentDefinitions = defData;
    renderDefinition(defData[0], word);
  } else {
    renderError(`No definition found for "${word}".`);
  }

  if (translation) {
    renderTranslation(translation, langSelect.value);
  }
}

async function retranslate() {
  if (!currentWord) return;
  const translation = await fetchTranslation(currentWord, langSelect.value);
  // Remove old translation card, re-add
  const old = results.querySelector('.translation-card');
  if (old) old.remove();
  if (translation) renderTranslation(translation, langSelect.value);
}

// ─── API calls ─────────────────────────────────────────────────────────────────
async function fetchDefinition(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTranslation(word, langCode) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|${langCode}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.responseData?.translatedText;
    return text && text.toLowerCase() !== word.toLowerCase() ? text : null;
  } catch {
    return null;
  }
}

// ─── Render helpers ────────────────────────────────────────────────────────────
function clearCards() {
  Array.from(results.querySelectorAll('.word-card, .translation-card, .error-msg')).forEach(el => el.remove());
}

function renderDefinition(entry, word) {
  const card = document.createElement('div');
  card.className = 'word-card';

  const phonetic = entry.phonetics?.find(p => p.text)?.text || '';

  card.innerHTML = `
    <div class="word-title">${escHtml(entry.word || word)}</div>
    ${phonetic ? `<div class="word-phonetic">${escHtml(phonetic)}</div>` : ''}
  `;

  (entry.meanings || []).slice(0, 3).forEach(meaning => {
    const posBlock = document.createElement('div');
    posBlock.className = 'pos-block';

    const posLabel = document.createElement('span');
    posLabel.className = 'pos-label';
    posLabel.textContent = meaning.partOfSpeech;
    posBlock.appendChild(posLabel);

    (meaning.definitions || []).slice(0, 3).forEach(d => {
      const item = document.createElement('div');
      item.className = 'definition-item';
      item.textContent = d.definition;
      if (d.example) {
        const ex = document.createElement('div');
        ex.className = 'definition-example';
        ex.textContent = `"${d.example}"`;
        item.appendChild(ex);
      }
      posBlock.appendChild(item);
    });

    card.appendChild(posBlock);
  });

  // Save to notes row
  const saveRow = buildSaveRow(word);
  card.appendChild(saveRow);

  results.appendChild(card);
}

function renderTranslation(text, langCode) {
  const card = document.createElement('div');
  card.className = 'translation-card';
  card.innerHTML = `
    <h3>${LANGUAGE_LABELS[langCode] || langCode}</h3>
    <div class="translation-text">${escHtml(text)}</div>
  `;
  results.appendChild(card);
}

function renderError(msg) {
  const el = document.createElement('div');
  el.className = 'error-msg';
  el.textContent = msg;
  results.appendChild(el);
}

// ─── Save to Notes ─────────────────────────────────────────────────────────────
function buildSaveRow(word) {
  const row = document.createElement('div');
  row.className = 'save-row';

  const select = document.createElement('select');
  populateFolderSelect(select);

  const btn = document.createElement('button');
  btn.className = 'btn-save';
  btn.textContent = 'Save to Notes';

  btn.addEventListener('click', () => {
    const folder = select.value;
    saveWordToNotes(word, folder, btn);
  });

  row.appendChild(select);
  row.appendChild(btn);
  return row;
}

function populateFolderSelect(select) {
  select.innerHTML = '';
  const raw = localStorage.getItem('kriti_notes');
  const notes = raw ? JSON.parse(raw) : {};
  const folders = Object.keys(notes).length ? Object.keys(notes) : ['Uncategorized'];
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });
}

function saveWordToNotes(word, folder, btn) {
  const raw = localStorage.getItem('kriti_notes');
  const notes = raw ? JSON.parse(raw) : {};

  if (!notes[folder]) notes[folder] = [];

  const exists = notes[folder].some(w => (w.word || w).toLowerCase() === word.toLowerCase());
  if (exists) {
    showToast(`"${word}" already saved in ${folder}`);
    return;
  }

  notes[folder].push({ word, savedAt: Date.now() });
  localStorage.setItem('kriti_notes', JSON.stringify(notes));

  btn.textContent = 'Saved!';
  btn.disabled = true;
  showToast(`Saved to ${folder}`);
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ─── Util ──────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
