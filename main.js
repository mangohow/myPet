const { app, BrowserWindow, globalShortcut, ipcMain, powerMonitor, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { startMcpServer } = require('./mcp-server');

let petWindow;
let tray = null;
let ignoreMouseEvents = true;
let petConfig = null;
let alwaysOnTopInterval = null;

// Set early to prevent Windows from creating a default notification icon
app.setAppUserModelId('coding.pet.ikun');

function getAssetPath() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, 'assets');
}

function getDataPath() {
  return app.isPackaged ? app.getPath('userData') : path.join(__dirname, 'assets');
}

function loadPetConfig() {
  const base = getAssetPath();
  const cfg = JSON.parse(fs.readFileSync(path.join(base, 'pet.json'), 'utf-8'));
  cfg._spritesheetUrl = url.pathToFileURL(path.join(base, cfg.spritesheetPath)).href;
  return cfg;
}

function toggleMousePassthrough() {
  ignoreMouseEvents = !ignoreMouseEvents;
  petWindow.setIgnoreMouseEvents(ignoreMouseEvents, { forward: true });
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('passthrough-changed', ignoreMouseEvents);
  }
}

app.whenReady().then(() => {
  // Read pet config
  try {
    petConfig = loadPetConfig();
  } catch (e) {
    console.error('Failed to read pet.json from', getAssetPath(), e.message);
    process.exit(1);
  }

  const scale = petConfig.scale || 0.5;
  const fw = petConfig.frameSize.width || 192;
  const fh = petConfig.frameSize.height || 208;
  const cw = Math.round(fw * scale);
  const ch = Math.round(fh * scale);
  const winW = Math.max(cw + 18, 240) + 210; // Extra 210px at right for TODO panel
  const baseH = ch + 22;
  const speechH = 200;

  petWindow = new BrowserWindow({
    width: winW,
    height: baseH + speechH, // Always tall enough for speech bubble
    x: 100,
    y: 100 - speechH,        // Start higher so pet bottom edge is at same screen position
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Default: passthrough ON with forward — only elements with pointer-events:auto receive clicks
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  ignoreMouseEvents = true;

  petWindow.loadFile('renderer/index.html');

  // Re-assert always-on-top after lock/unlock or focus loss
  petWindow.on('focus', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(true);
    }
  });
  powerMonitor.on('resume', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(true);
    }
  });

  global.petWindow = petWindow;

  // Periodically re-assert always-on-top to prevent other apps from burying the pet
  alwaysOnTopInterval = setInterval(() => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(true);
      petWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 4000);

  // System tray icon with right-click menu
  try {
    const iconPath = path.join(getAssetPath(), petConfig.trayIconPath || 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
    tray = new Tray(icon);
    tray.setToolTip(petConfig.displayName || 'Coding Pet');
    const ctxMenu = Menu.buildFromTemplate([
      {
        label: '添加TODO',
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send('show-todo-input');
          }
        }
      },
      {
        label: '显示 TODO List',
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send('show-todo');
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => { app.quit(); }
      }
    ]);
    tray.setContextMenu(ctxMenu);
  } catch (e) {
    console.warn('Failed to create tray icon:', e.message);
  }

  // Serve pet config to renderer (with file:// URL for spritesheet)
  ipcMain.handle('get-pet-config', () => loadPetConfig());

  // Toggle passthrough
  ipcMain.on('toggle-passthrough', toggleMousePassthrough);
  globalShortcut.register('Ctrl+Shift+P', toggleMousePassthrough);

  // Smart auto-capture: renderer tells main to enable/disable mouse capture
  ipcMain.on('set-capture', (_event, capture) => {
    if (capture) {
      petWindow.setIgnoreMouseEvents(false);
    } else {
      petWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    ignoreMouseEvents = capture;
  });

  // Serve todos to renderer
  ipcMain.handle('get-todos', () => {
    const file = path.join(getDataPath(), 'todo.json');
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8')).todos || [];
      }
    } catch (e) { /* ignore */ }
    return [];
  });

  // Todo toggle / delete / add
  ipcMain.handle('add-todo', (_event, text) => {
    const file = path.join(getDataPath(), 'todo.json');
    try {
      let data = { todos: [] };
      if (fs.existsSync(file)) {
        data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
      const todo = { id: 'todo-' + Date.now(), text, done: false, createdAt: new Date().toISOString() };
      data.todos.push(todo);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return todo;
    } catch (e) { return null; }
  });
  ipcMain.handle('toggle-todo', (_event, id) => {
    const file = path.join(getDataPath(), 'todo.json');
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const todo = data.todos.find(t => t.id === id);
        if (todo) {
          todo.done = !todo.done;
          fs.writeFileSync(file, JSON.stringify(data, null, 2));
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  });
  ipcMain.handle('delete-todo', (_event, id) => {
    const file = path.join(getDataPath(), 'todo.json');
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        data.todos = data.todos.filter(t => t.id !== id);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  });

  // Drag via absolute screen coordinates
  ipcMain.handle('get-window-position', () => {
    const [x, y] = petWindow.getPosition();
    return { x, y };
  });
  ipcMain.on('set-window-position', (_event, { x, y }) => {
    petWindow.setPosition(Math.round(x), Math.round(y));
  });

  // Start MCP server with pet config, asset path, and writable data path
  startMcpServer(petConfig, getAssetPath(), getDataPath());

  console.log(`Pet "${petConfig.displayName}" started, MCP server on http://localhost:${petConfig.port || 3099}/sse  |  Ctrl+Shift+P to toggle passthrough`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (alwaysOnTopInterval) clearInterval(alwaysOnTopInterval);
  globalShortcut.unregisterAll();
});
