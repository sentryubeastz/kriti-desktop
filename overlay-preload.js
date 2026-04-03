'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlayAPI', {
  dismiss: () => ipcRenderer.send('overlay-dismiss'),
});
