const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getPetConfig: () => ipcRenderer.invoke('get-pet-config'),
  onAction: (callback) => {
    ipcRenderer.on('pet-action', (_event, action) => callback(action));
  },
  onPassthroughChanged: (callback) => {
    ipcRenderer.on('passthrough-changed', (_event, enabled) => callback(enabled));
  },
  togglePassthrough: () => ipcRenderer.send('toggle-passthrough'),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (x, y) => ipcRenderer.send('set-window-position', { x, y }),
  getTodos: () => ipcRenderer.invoke('get-todos'),
  toggleTodo: (id) => ipcRenderer.invoke('toggle-todo', id),
  deleteTodo: (id) => ipcRenderer.invoke('delete-todo', id),
  onShowTodo: (callback) => {
    ipcRenderer.on('show-todo', () => callback());
  }
});
