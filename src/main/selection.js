'use strict';

const { globalShortcut, clipboard, screen } = require('electron');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

let _onLookup = null;
let _beforeCopy = null;
let _currentShortcut = 'CommandOrControl+Shift+K';

function registerShortcuts({ onLookup, beforeCopy, shortcut }) {
  _onLookup   = onLookup;
  _beforeCopy = beforeCopy || null;
  if (shortcut) _currentShortcut = shortcut;

  const ok = globalShortcut.register(_currentShortcut, () => {
    const cursorPos = screen.getCursorScreenPoint();
    grabAndLookup(cursorPos);
  });

  if (!ok) {
    console.warn(`[Selection] ${_currentShortcut} could not be registered — already in use.`);
  } else {
    console.log(`[Selection] ${_currentShortcut} registered OK`);
  }
}

/** Unregister current shortcut and re-register with a new one. Returns true on success. */
function reRegisterShortcut(newShortcut) {
  try { globalShortcut.unregister(_currentShortcut); } catch { /* ignore */ }
  _currentShortcut = newShortcut;
  const ok = globalShortcut.register(_currentShortcut, () => {
    const cursorPos = screen.getCursorScreenPoint();
    grabAndLookup(cursorPos);
  });
  if (ok) console.log(`[Selection] Re-registered as ${_currentShortcut}`);
  else    console.warn(`[Selection] Could not register ${_currentShortcut}`);
  return ok;
}

/**
 * Step 1: snapshot current clipboard
 * Step 2: try to auto-copy using a VBScript SendKeys (100% reliable on Windows,
 *          no assembly loading needed)
 * Step 3: after 250ms, if clipboard changed → use new text; otherwise use old text
 * Step 4: show popup regardless (user can also just type in it)
 */
function grabAndLookup(cursorPos) {
  const prevClip = clipboard.readText().trim();

  if (process.platform === 'win32') {
    const vbsContent = 'Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.SendKeys "^c"\r\n';
    const tmpFile = path.join(os.tmpdir(), 'kriti_copy.vbs');

    const runCopy = () => {
      try {
        fs.writeFileSync(tmpFile, vbsContent, 'utf8');
        exec(`cscript //nologo //b "${tmpFile}"`, { windowsHide: true, timeout: 2000 }, () => {
          // Wait 500ms for clipboard to settle
          setTimeout(() => resolveAndLookup(prevClip, cursorPos), 500);
        });
      } catch {
        resolveAndLookup(prevClip, cursorPos, true);
      }
    };

    if (_beforeCopy) {
      // Hide the popup FIRST so focus returns to the user's app (Chrome, VSCode, etc.).
      // Without this, VBScript sends Ctrl+C to the popup window itself, clipboard never
      // changes, and search mode shows every time after the first lookup.
      _beforeCopy();
      setTimeout(runCopy, 180); // 180 ms is enough for Windows to transfer focus
    } else {
      runCopy();
    }
  } else if (process.platform === 'linux') {
    exec('xdotool key ctrl+c', { timeout: 1000 }, () => {
      setTimeout(() => resolveAndLookup(prevClip, cursorPos), 500);
    });
  } else {
    // macOS — xattr-based selection clipboard
    const sel = clipboard.readText('selection') || clipboard.readText();
    _onLookup(sel.trim() || prevClip, cursorPos);
  }
}

function resolveAndLookup(prevClip, cursorPos, forcePrev = false) {
  const newClip = forcePrev ? '' : clipboard.readText().trim();

  // Only use text that was JUST copied by the auto-copy keystroke.
  // If the clipboard didn't change, do NOT fall back to prevClip — that would
  // show a stale word from minutes ago.  Instead open the popup empty so the
  // user can type the word manually.
  const text = (newClip && newClip !== prevClip) ? newClip : '';

  if (_onLookup) _onLookup(text, cursorPos);

  // Restore original clipboard after 6 seconds (only if we changed it)
  if (text && text !== prevClip && prevClip) {
    setTimeout(() => {
      try { clipboard.writeText(prevClip); } catch { /* ignore */ }
    }, 6000);
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, reRegisterShortcut, unregisterAll };


