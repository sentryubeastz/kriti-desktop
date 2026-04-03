'use strict';

/**
 * Simple JSON-file persistent store.
 * Stored in: app.getPath('userData')/kriti-data.json
 * i.e. C:\Users\<user>\AppData\Roaming\kriti-desktop\kriti-data.json
 */

const fs = require('fs');
const path = require('path');

class Store {
  constructor(filePath) {
    this._path = filePath;
    this._data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this._path, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  _write() {
    try {
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (e) {
      console.error('[Store] write error:', e.message);
    }
  }

  /**
   * Get one or more keys.
   * @param {string|string[]|null} keys
   * @returns {object}
   */
  get(keys) {
    if (!keys || (Array.isArray(keys) && keys.length === 0)) {
      return { ...this._data };
    }
    if (typeof keys === 'string') {
      return { [keys]: this._data[keys] };
    }
    if (Array.isArray(keys)) {
      const result = {};
      keys.forEach((k) => { result[k] = this._data[k]; });
      return result;
    }
    return {};
  }

  /**
   * Merge items into the store.
   * @param {object} items
   */
  set(items) {
    Object.assign(this._data, items);
    this._write();
  }

  /**
   * Delete a key.
   * @param {string} key
   */
  delete(key) {
    delete this._data[key];
    this._write();
  }
}

let _store = null;

function initStore(app) {
  const filePath = path.join(app.getPath('userData'), 'kriti-data.json');
  _store = new Store(filePath);
}

function getStore() {
  return _store;
}

module.exports = { initStore, getStore };
