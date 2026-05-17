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
  addTodo: (text) => ipcRenderer.invoke('add-todo', text),
  onShowTodo: (callback) => {
    ipcRenderer.on('show-todo', () => callback());
  },
  onShowTodoInput: (callback) => {
    ipcRenderer.on('show-todo-input', () => callback());
  },
  setCapture: (capture) => ipcRenderer.send('set-capture', capture)
});
