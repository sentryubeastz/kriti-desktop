'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, clipboard, shell } = require('electron');
const path = require('path');

let tray = null;
let notesWindow = null;
let lookupWindow = null;

// ─── Notes window ──────────────────────────────────────────────────────────────
function createNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.focus();
    return;
  }

  notesWindow = new BrowserWindow({
    width: 460,
    height: 650,
    minWidth: 420,
    minHeight: 500,
    title: 'Kriti – Saved Notes',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  notesWindow.loadFile(path.join(__dirname, 'src', 'notes', 'notes.html'));
  notesWindow.on('closed', () => { notesWindow = null; });
}

// ─── Lookup window ─────────────────────────────────────────────────────────────
function createLookupWindow(word) {
  if (lookupWindow && !lookupWindow.isDestroyed()) {
    lookupWindow.webContents.send('lookup', word);
    lookupWindow.focus();
    return;
  }

  lookupWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: true,
    frame: true,
    title: 'Kriti – Lookup',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  lookupWindow.loadFile(path.join(__dirname, 'src', 'lookup', 'lookup.html'));
  lookupWindow.on('closed', () => { lookupWindow = null; });

  // Send word once the window's renderer is ready
  lookupWindow.webContents.once('did-finish-load', () => {
    if (word) lookupWindow.webContents.send('lookup', word);
  });
}

// ─── Tray ───────────────────────────────────────────────────────────────────────
function createTray() {
  // Use a blank 16x16 image as placeholder if no icon exists yet
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Kriti');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Notes',
      click: () => createNotesWindow(),
    },
    {
      label: 'Lookup selected text  (Ctrl+Shift+K)',
      click: () => {
        const text = clipboard.readText().trim();
        if (text) createLookupWindow(text);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Kriti',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => createNotesWindow());
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createTray();
  createNotesWindow();

  // Global shortcut: select text → Ctrl+Shift+K → lookup
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    const selected = clipboard.readText().trim();
    if (selected) {
      createLookupWindow(selected);
    } else {
      // Open notes if nothing in clipboard
      createNotesWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep app running when all windows closed (tray app)
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// ─── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.on('open-notes', () => createNotesWindow());
ipcMain.on('close-lookup', () => {
  if (lookupWindow && !lookupWindow.isDestroyed()) lookupWindow.close();
});
ipcMain.on('open-external', (_, url) => {
  shell.openExternal(url);
});
