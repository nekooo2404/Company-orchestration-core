/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aicompany', {
  terminals: {
    list: () => ipcRenderer.invoke('terminal:list'),
    start: (input) => ipcRenderer.invoke('terminal:start', input),
    write: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    close: (id) => ipcRenderer.invoke('terminal:close', id),
    onEvent: (listener) => {
      const handler = (_event, value) => listener(value);
      ipcRenderer.on('terminal:event', handler);
      return () => ipcRenderer.removeListener('terminal:event', handler);
    }
  }
});
