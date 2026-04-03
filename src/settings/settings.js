'use strict';

const langSelect       = document.getElementById('langSelect');
const themeSelect      = document.getElementById('themeSelect');
const autoLaunchToggle = document.getElementById('autoLaunch');
const openNotesToggle  = document.getElementById('openNotesOnStart');
const btnSave          = document.getElementById('btnSave');
const toastEl          = document.getElementById('toast');
const hotkeyBadge      = document.getElementById('hotkeyBadge');
const btnShortcutSave  = document.getElementById('btnShortcutSave');

const DEFAULT_LANG_KEY = 'defaultLang';

// ─── Shortcut recorder ────────────────────────────────────────────────────────
let _recording = false;
let _pendingShortcut = null; // electron-format string e.g. "CommandOrControl+Shift+K"
let _pendingDisplay  = null; // human-readable e.g. "Ctrl+Shift+K"

/** Convert a KeyboardEvent into Electron accelerator format */
function eventToAccelerator(e) {
  const parts = [];
  if (e.ctrlKey  || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey)                 parts.push('Alt');
  if (e.shiftKey)               parts.push('Shift');
  const key = e.key;
  // Ignore bare modifiers
  if (['Control','Meta','Alt','Shift'].includes(key)) return null;
  // Map special keys
  const keyMap = {
    ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down',
    'ArrowLeft': 'Left', 'ArrowRight': 'Right',
  };
  parts.push(keyMap[key] || (key.length === 1 ? key.toUpperCase() : key));
  if (parts.length < 2) return null; // must have at least one modifier
  return parts.join('+');
}

function displayAccelerator(acc) {
  return acc.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ');
}

hotkeyBadge.addEventListener('click', () => {
  _recording = true;
  _pendingShortcut = null;
  hotkeyBadge.classList.add('recording');
  hotkeyBadge.textContent = 'Press keys…';
  btnShortcutSave.style.display = 'none';
});

document.addEventListener('keydown', (e) => {
  if (!_recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    _recording = false;
    hotkeyBadge.classList.remove('recording');
    hotkeyBadge.textContent = _pendingDisplay || hotkeyBadge.dataset.current || 'Ctrl + Shift + K';
    btnShortcutSave.style.display = _pendingShortcut ? 'inline-block' : 'none';
    return;
  }
  const acc = eventToAccelerator(e);
  if (!acc) return;
  _recording = false;
  _pendingShortcut = acc;
  _pendingDisplay  = displayAccelerator(acc);
  hotkeyBadge.classList.remove('recording');
  hotkeyBadge.textContent = _pendingDisplay;
  btnShortcutSave.style.display = 'inline-block';
}, true);

btnShortcutSave.addEventListener('click', async () => {
  if (!_pendingShortcut || !window.electronAPI) return;
  const ok = await window.electronAPI.setShortcut(_pendingShortcut);
  if (ok) {
    hotkeyBadge.dataset.current = _pendingDisplay;
    btnShortcutSave.style.display = 'none';
    showToast(`Shortcut set to ${_pendingDisplay}`);
  } else {
    showToast('Could not register — key combo already in use');
    hotkeyBadge.textContent = hotkeyBadge.dataset.current || 'Ctrl + Shift + K';
    _pendingShortcut = null;
  }
});

// ─── Load current settings ────────────────────────────────────────────────────
(async function load() {
  const savedLang = localStorage.getItem(DEFAULT_LANG_KEY);
  if (savedLang && langSelect.querySelector(`option[value="${savedLang}"]`)) {
    langSelect.value = savedLang;
  }

  if (!window.electronAPI) return;

  try {
    const isAutoLaunch = await window.electronAPI.getAutoLaunch();
    autoLaunchToggle.checked = Boolean(isAutoLaunch);
  } catch { /* ignore */ }

  try {
    const settings = await window.electronAPI.getSettings();
    if (settings && typeof settings.openNotesOnStart === 'boolean') {
      openNotesToggle.checked = settings.openNotesOnStart;
    }
    if (settings && settings.theme && themeSelect.querySelector(`option[value="${settings.theme}"]`)) {
      themeSelect.value = settings.theme;
    }
    if (settings && settings.shortcut) {
      const disp = displayAccelerator(settings.shortcut);
      hotkeyBadge.textContent = disp;
      hotkeyBadge.dataset.current = disp;
    }
  } catch { /* ignore */ }
})();

// ─── Theme change (live preview) ──────────────────────────────────────────────
themeSelect.addEventListener('change', () => {
  if (window.electronAPI) window.electronAPI.setTheme(themeSelect.value);
});

// ─── Save ─────────────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  const lang  = langSelect.value;
  const theme = themeSelect.value;
  localStorage.setItem(DEFAULT_LANG_KEY, lang);
  if (window.electronAPI) {
    try {
      await window.electronAPI.setAutoLaunch(autoLaunchToggle.checked);
      await window.electronAPI.setSettings({
        defaultLang:      lang,
        openNotesOnStart: openNotesToggle.checked,
        theme,
      });
      window.electronAPI.setTheme(theme);
    } catch (e) { console.error('[settings] save error:', e); }
  }
  showToast('Settings saved');
});

langSelect.addEventListener('change', () => {
  localStorage.setItem(DEFAULT_LANG_KEY, langSelect.value);
});

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

