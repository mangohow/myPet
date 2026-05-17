# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm start            # Launch the desktop pet (Electron + MCP server)
npm run pack         # Package to release/win-unpacked/ (electron-builder --dir)
npm run dist         # Full distribution build
```

There is no test suite, linter, or type-checker in this project.

## Architecture

An Electron desktop app that renders a transparent, always-on-top sprite-animated pet, controlled remotely by AI assistants via MCP SSE protocol.

**Process model — three layers:**

1. **Main process** (`main.js`) — Electron main. Creates the transparent frameless window, system tray, global shortcuts. Owns all IPC handlers and starts the MCP server. Routes MCP tool calls to the renderer via `webContents.send('pet-action', ...)`.

2. **Preload bridge** (`preload.js`) — Exposes `window.petAPI` to the renderer via `contextBridge`. All main↔renderer communication goes through typed IPC channels (invoke/handle for request-response, send/on for push). No `nodeIntegration`.

3. **Renderer** (`renderer/index.html` + `pet.css` + `pet.js`) — Canvas sprite animation loop (`requestAnimationFrame`), smart mouse capture, drag-to-move, speech bubble, TODO panel UI. Loads pet config and spritesheet via IPC on startup.

**Data flow for MCP tool calls:**
```
AI client → SSE /sse → mcp-server.js → webContents.send('pet-action') → renderer/pet.js → animation/text update
```

**Smart capture** — The window defaults to mouse-passthrough (`setIgnoreMouseEvents(true, {forward: true})`). The renderer tells main to enable capture (`set-capture` IPC) only when the user hovers over the pet canvas or TODO panel. The `pointer-events: auto` CSS on canvas and `.todo-item` allows those elements to receive events even in forward mode.

**Data paths** — Dev mode reads/writes `assets/`. Packaged reads spritesheet/config from `process.resourcesPath` and writes data (todo.json, scheduled-tasks.json) to `app.getPath('userData')`. The `getAssetPath()` and `getDataPath()` helpers in main.js encode this split.

**Animation engine** (`renderer/pet.js`):
- `tick()` runs on `requestAnimationFrame`, advances frame index based on elapsed time
- Auto-idle timer: if `autoIdleTimeoutMs` elapses since last `set_pet_state`, reverts to idle animation
- State transitions support an optional `duration` + `nextState` for timed auto-advance
- Frame data can be numeric indices (computed from spritesheet row/col) or `{x, y}` objects

## Key dependencies

- `electron` 28 — desktop shell
- `@modelcontextprotocol/sdk` ^1.9 — MCP server framework (SSE transport)
- `express` ^4.18 — HTTP server for SSE endpoint
- `cron-parser` ^5.5 — cron expression evaluation for scheduled tasks
- `zod` — parameter validation in MCP tool handlers (transitive through MCP SDK)

## Known brittle areas

- **SSE "Already connected" error** — If the pet process is killed (not cleanly quit), the port may linger. Restarting too quickly can hit a stale state. A full port release or waiting for TIME_WAIT is needed.
- **Window z-order after lock/unlock** — The `powerMonitor.on('resume')` and `focus` event handlers re-apply `setAlwaysOnTop(true)`, but Windows may still reorder the window. This is a known OS-level limitation.
- **Drag uses screen coordinates** — The renderer computes new window positions from `e.screenX/Y` minus an offset. If the window position IPC is slow or the drag moves fast enough to leave the canvas, the drag breaks.
- **`extraResources` in electron-builder config** — The pet.json, spritesheet.webp, and tray-icon.png are copied to `resources/` unpacked so users can replace them. The packaged app reads from `process.resourcesPath`, not from inside the asar.
