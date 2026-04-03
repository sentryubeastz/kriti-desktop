'use strict';

const { app, ipcMain, screen, shell, nativeTheme } = require('electron');
const path = require('path');

// ─── Single-instance lock ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const { createTray } = require('./tray');
const { registerShortcuts, reRegisterShortcut, unregisterAll } = require('./selection');
const { createPopupWindow, createNotesWindow, createSettingsWindow, createOverlayWindow } = require('./windows');
const { initStore, getStore } = require('./store');

// Windows
let popupWin    = null;
let notesWin    = null;
let settingsWin = null;
let overlayWin  = null;

// Blur guard — prevents the popup from instantly hiding when it first gains focus
let _blurEnabled = false;

function showOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) {
    overlayWin = createOverlayWindow();
    overlayWin.once('ready-to-show', () => overlayWin.show());
    overlayWin.on('closed', () => { overlayWin = null; });
  } else {
    overlayWin.show();
  }
}

function hideOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
}

// ─── App ready ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.kriti.desktop');
  }

  initStore(app);
  // Apply saved theme (light / dark / system)
  const savedSettings = getStore().get('settings').settings || {};
  const savedTheme = savedSettings.theme;
  nativeTheme.themeSource = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'system';
  const savedShortcut = savedSettings.shortcut || 'CommandOrControl+Shift+K';
  setupIPC();
  createTray({ onOpenNotes: openNotes, onOpenSettings: openSettings });
  registerShortcuts({
    onLookup: showPopup,
    shortcut: savedShortcut,
    // Hide popup BEFORE the VBScript fires Ctrl+C so focus returns to the user's
    // app and the copy lands on the right window, not on our popup.
    beforeCopy: () => {
      if (popupWin && !popupWin.isDestroyed() && popupWin.isVisible()) {
        _blurEnabled = false;
        hideOverlay();
        popupWin.hide();
      }
    },
  });

  // Open notes window on startup (unless user turned it off in settings)
  const settings = getStore().get('settings').settings || {};
  if (settings.openNotesOnStart !== false) openNotes();
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.on('second-instance', () => {
  if (notesWin && !notesWin.isDestroyed()) {
    if (notesWin.isMinimized()) notesWin.restore();
    notesWin.focus();
  }
});

// Stay alive in tray even when all windows closed
app.on('window-all-closed', (e) => {
  if (process.platform !== 'darwin') e.preventDefault();
});

app.on('will-quit', () => {
  unregisterAll();
});

// ─── Window management ────────────────────────────────────────────────────────
function showPopup(word, cursorPos) {
  // Always open the popup; empty word = type-to-search mode
  const text = word ? word.trim() : '';

  if (popupWin && !popupWin.isDestroyed()) {
    _blurEnabled = false;
    positionNearCursor(popupWin, cursorPos);
    showOverlay();
    popupWin.show();
    popupWin.focus();
    popupWin.webContents.send('lookup', text);
    popupWin.once('focus', () => { _blurEnabled = true; });
    return;
  }

  popupWin = createPopupWindow();
  positionNearCursor(popupWin, cursorPos);

  popupWin.on('blur', () => {
    if (_blurEnabled && popupWin && !popupWin.isDestroyed()) {
      hideOverlay();
      popupWin.hide();
    }
  });

  popupWin.webContents.once('did-finish-load', () => {
    _blurEnabled = false;
    showOverlay();
    popupWin.show();
    popupWin.focus();
    popupWin.webContents.send('lookup', text);
    popupWin.once('focus', () => { _blurEnabled = true; });
  });

  popupWin.on('closed', () => { hideOverlay(); popupWin = null; });
}

function openNotes() {
  if (notesWin && !notesWin.isDestroyed()) {
    if (notesWin.isMinimized()) notesWin.restore();
    notesWin.focus();
    return;
  }
  notesWin = createNotesWindow();
  notesWin.on('closed', () => { notesWin = null; });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = createSettingsWindow();
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ─── Popup positioning ────────────────────────────────────────────────────────
function positionNearCursor(win, cursorPos) {
  const { width: winW, height: winH } = win.getBounds();
  const point = cursorPos || screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

  let x = point.x + 16;
  let y = point.y + 16;

  // Flip if would go off screen
  if (x + winW > dx + dw) x = point.x - winW - 8;
  if (y + winH > dy + dh) y = point.y - winH - 8;

  // Clamp within display
  x = Math.max(dx, Math.min(x, dx + dw - winW));
  y = Math.max(dy, Math.min(y, dy + dh - winH));

  win.setPosition(Math.round(x), Math.round(y));
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Window management
  ipcMain.on('open-notes', () => openNotes());
  ipcMain.on('open-settings', () => openSettings());
  ipcMain.on('close-popup', () => {
    _blurEnabled = false;
    hideOverlay();
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
  });
  ipcMain.on('overlay-dismiss', () => {
    hideOverlay();
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
  });
  ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url);
  });

  // Storage — synchronous JSON file store
  ipcMain.handle('storage-get', (_, keys) => {
    return getStore().get(keys);
  });

  ipcMain.handle('storage-set', (_, items) => {
    getStore().set(items);
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return getStore().get('settings').settings || {};
  });

  ipcMain.handle('set-settings', (_, settings) => {
    getStore().set({ settings });
  });

  ipcMain.handle('set-shortcut', (_, newShortcut) => {
    const ok = reRegisterShortcut(newShortcut);
    if (ok) {
      const s = getStore().get('settings').settings || {};
      getStore().set({ settings: { ...s, shortcut: newShortcut } });
    }
    return ok;
  });

  // Theme
  ipcMain.on('set-theme', (_, theme) => {
    nativeTheme.themeSource = (theme === 'light' || theme === 'dark') ? theme : 'system';
  });

  // Auto-launch with Windows
  ipcMain.handle('get-auto-launch', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-auto-launch', (_, enable) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enable) });
  });
}
