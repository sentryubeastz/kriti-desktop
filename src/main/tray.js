'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const zlib = require('zlib');

let tray = null;

// ─── Minimal PNG generator (no external deps) ────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crcBuf]);
}

/**
 * Generate a minimal solid-color RGB PNG (16x16).
 */
function createSolidPng(r, g, b, size = 16) {
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0; // filter type: None
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const rawData = Buffer.concat(Array(size).fill(row));
  const compressed = zlib.deflateSync(rawData);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Tray creation ────────────────────────────────────────────────────────────
function createTray({ onOpenNotes, onOpenSettings }) {
  let icon;

  try {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty icon file');
  } catch {
    // Generate a 16x16 purple (#667eea) square as fallback
    const buf = createSolidPng(102, 126, 234, 16);
    icon = nativeImage.createFromBuffer(buf);
  }

  if (process.platform === 'win32') {
    icon = icon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(icon);
  tray.setToolTip('Kriti — Word Lookup (Ctrl+Shift+K)');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Notes',
      click: onOpenNotes,
    },
    {
      label: 'Settings',
      click: onOpenSettings,
    },
    { type: 'separator' },
    {
      label: 'Quit Kriti',
      role: 'quit',
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', onOpenNotes);
  tray.on('double-click', onOpenNotes);

  return tray;
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray };
