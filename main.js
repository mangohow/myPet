const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { startMcpServer } = require('./mcp-server');

let petWindow;
let ignoreMouseEvents = false;
let petConfig = null;

function getAssetPath() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, 'assets');
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
  const winW = cw + 18;
  const winH = ch + 22;

  petWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: 100,
    y: 100,
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

  petWindow.setIgnoreMouseEvents(false);

  petWindow.loadFile('renderer/index.html');

  global.petWindow = petWindow;

  // Serve pet config to renderer (with file:// URL for spritesheet)
  ipcMain.handle('get-pet-config', () => loadPetConfig());

  // Toggle passthrough
  ipcMain.on('toggle-passthrough', toggleMousePassthrough);
  globalShortcut.register('Ctrl+Shift+P', toggleMousePassthrough);

  // Drag via absolute screen coordinates
  ipcMain.handle('get-window-position', () => {
    const [x, y] = petWindow.getPosition();
    return { x, y };
  });
  ipcMain.on('set-window-position', (_event, { x, y }) => {
    petWindow.setPosition(Math.round(x), Math.round(y));
  });

  // Start MCP server with pet config
  startMcpServer(petConfig);

  console.log(`Pet "${petConfig.displayName}" started, MCP server on http://localhost:3099/sse  |  Ctrl+Shift+P to toggle passthrough`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
