'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Load bundled wordlist once at startup (Node context; no network needed)
const _wordlist = (() => {
  try { return require('./src/data/wordlist.json'); } catch { return {}; }
})();

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Offline wordlist ──────────────────────────────────────────────────────
  getWordlistEntry: (word) => _wordlist[word.toLowerCase().trim()] || null,
  // ── Popup ────────────────────────────────────────────────────────────────
  onLookup: (cb) => ipcRenderer.on('lookup', (_, word) => cb(word)),
  closePopup: () => ipcRenderer.send('close-popup'),

  // ── Navigation ───────────────────────────────────────────────────────────
  openNotes: () => ipcRenderer.send('open-notes'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // ── Storage (async, resolves with data object) ───────────────────────────
  storageGet: (keys) => ipcRenderer.invoke('storage-get', keys),
  storageSet: (items) => ipcRenderer.invoke('storage-set', items),

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),
  setShortcut: (s) => ipcRenderer.invoke('set-shortcut', s),
  setTheme: (theme) => ipcRenderer.send('set-theme', theme),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),
});

