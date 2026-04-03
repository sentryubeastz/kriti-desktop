/**
 * chrome-storage-shim.js
 *
 * When running inside Electron (window.electronAPI available), routes
 * chrome.storage.local calls through IPC to the main-process JSON store.
 *
 * Falls back to localStorage if electronAPI is not present
 * (e.g. during development in a plain browser).
 */
(function () {
  'use strict';

  // ── Electron / IPC path ──────────────────────────────────────────────────
  if (typeof window !== 'undefined' &&
      typeof window.electronAPI !== 'undefined' &&
      typeof window.electronAPI.storageGet === 'function') {

    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || { lastError: null };
    window.chrome.storage = window.chrome.storage || {};

    window.chrome.storage.local = {
      get(keys, callback) {
        window.electronAPI.storageGet(keys)
          .then((result) => callback(result || {}))
          .catch((err) => {
            console.error('[shim] storage-get error:', err);
            callback({});
          });
      },

      set(items, callback) {
        window.electronAPI.storageSet(items)
          .then(() => { if (callback) callback(); })
          .catch((err) => {
            console.error('[shim] storage-set error:', err);
            if (callback) callback();
          });
      },
    };

    return; // Done – IPC shim is installed
  }

  // ── localStorage fallback ────────────────────────────────────────────────
  const STORAGE_KEY = 'kriti_chrome_storage';

  function readAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeAll(obj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || { lastError: null };
  window.chrome.storage = window.chrome.storage || {};

  window.chrome.storage.local = {
    get(keys, callback) {
      const all = readAll();
      let result = {};
      if (!keys) {
        result = all;
      } else if (typeof keys === 'string') {
        result[keys] = all[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => { result[k] = all[k]; });
      } else if (typeof keys === 'object') {
        Object.keys(keys).forEach((k) => {
          result[k] = k in all ? all[k] : keys[k];
        });
      }
      setTimeout(() => callback(result), 0);
    },

    set(items, callback) {
      const all = readAll();
      Object.assign(all, items);
      writeAll(all);
      if (callback) setTimeout(callback, 0);
    },
  };
})();

