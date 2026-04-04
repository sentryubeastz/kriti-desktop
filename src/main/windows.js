'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

const PRELOAD_PATH = path.join(__dirname, '..', '..', 'preload.js');
const ICON_PATH = path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'kriti.ico' : 'kriti.png');

// ─── Popup window (frameless, always-on-top) ────────────────────────────────
function createPopupWindow() {
  const win = new BrowserWindow({
    width: 340,
    height: 500,
    minWidth: 300,
    minHeight: 380,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    // 'screen-saver' level ensures the popup stays on top AND still loses focus
    // (fires blur) when the user clicks on any underlying window on Windows.
    // The default alwaysOnTop level can suppress blur events in some builds.
    skipTaskbar: true,
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile(path.join(__dirname, '..', 'popup', 'popup.html'));
  return win;
}

// ─── Notes window ────────────────────────────────────────────────────────────
function createNotesWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 430,
    minHeight: 500,
    title: 'Kriti – Notes',
    icon: ICON_PATH,
    resizable: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'notes', 'notes.html'));
  return win;
}

// ─── Settings window ─────────────────────────────────────────────────────────
function createSettingsWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    title: 'Kriti – Settings',
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'settings', 'settings.html'));
  return win;
}

module.exports = { createPopupWindow, createNotesWindow, createSettingsWindow, createOverlayWindow };

// ─── Overlay window (full-screen transparent click-catcher) ─────────────────
// Sits behind the popup. A click anywhere on it closes both windows.
// Uses a separate minimal preload so it can send IPC without exposing full API.
function createOverlayWindow() {
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().bounds;
  const OVERLAY_PRELOAD = path.join(__dirname, '..', '..', 'overlay-preload.js');

  const win = new BrowserWindow({
    x: 0, y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,        // does NOT steal focus — that's the whole point
    show: false,
    webPreferences: {
      preload: OVERLAY_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setIgnoreMouseEvents(false); // must receive clicks
  win.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'));
  return win;
}
