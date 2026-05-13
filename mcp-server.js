const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { CronExpressionParser } = require('cron-parser');

const sessions = new Map();

// ========== Cron Scheduler ==========

class CronScheduler {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.tasks = [];
    this.timers = new Map();
    this._loaded = false;
  }

  get filePath() {
    return path.join(this.dataPath, 'scheduled-tasks.json');
  }

  loadTasks() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.tasks = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')).tasks || [];
      }
    } catch (e) {
      console.error('Failed to load scheduled tasks:', e.message);
      this.tasks = [];
    }
    this._loaded = true;
  }

  saveTasks() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify({ tasks: this.tasks }, null, 2));
    } catch (e) {
      console.error('Failed to save scheduled tasks:', e.message);
    }
  }

  start() {
    this.loadTasks();
    for (const task of this.tasks) {
      this.scheduleTask(task);
    }
  }

  addTask(task) {
    this.tasks.push(task);
    this.saveTasks();
    this.scheduleTask(task);
    return task;
  }

  deleteTask(id) {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    this.tasks.splice(idx, 1);
    this.saveTasks();
    this.cancelTimer(id);
    return true;
  }

  scheduleTask(task) {
    if (!task.enabled) return;
    try {
      const interval = CronExpressionParser.parse(task.cron);
      const next = interval.next().getTime();
      const delay = Math.max(0, next - Date.now());

      const timer = setTimeout(() => {
        this.executeAction(task.action);
        this.cancelTimer(task.id);
        this.scheduleTask(task);
      }, delay);

      this.timers.set(task.id, timer);
    } catch (e) {
      console.error(`Invalid cron expression for task "${task.id || task.name}": ${e.message}`);
    }
  }

  cancelTimer(id) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
  }

  executeAction(action) {
    if (!action || !action.type) return;
    if (global.petWindow && !global.petWindow.isDestroyed()) {
      switch (action.type) {
        case 'set_pet_state':
          global.petWindow.webContents.send('pet-action', { name: 'set_pet_state', state: action.state });
          break;
        case 'set_pet_animation':
          global.petWindow.webContents.send('pet-action', { name: 'set_pet_animation', animation: action.animation });
          break;
        case 'pet_say':
          global.petWindow.webContents.send('pet-action', { name: 'pet_say', text: action.text });
          break;
      }
    }
  }
}

// ========== Tool Registration ==========

function registerTools(server, petConfig) {
  const animNames = Object.keys(petConfig.animations);
  const stateEnum = z.enum(['idle', 'thinking', 'in-progress', 'executing', 'done', 'error']);

  server.tool(
    'set_pet_animation',
    'Play a specific pet animation by name',
    { animation: z.enum(animNames) },
    async (args) => {
      if (global.petWindow && !global.petWindow.isDestroyed()) {
        global.petWindow.webContents.send('pet-action', { name: 'set_pet_animation', animation: args.animation });
      }
      return { content: [{ type: 'text', text: `动画已切换: ${args.animation}` }] };
    }
  );

  server.tool(
    'set_pet_state',
    'Set the pet state (maps AI workflow states to animations). Optionally set duration and nextState for timed auto-transition.',
    {
      state: stateEnum,
      duration: z.number().optional().describe('Duration in ms before auto-transitioning'),
      nextState: stateEnum.optional().describe('State to transition to after duration expires')
    },
    async (args) => {
      if (global.petWindow && !global.petWindow.isDestroyed()) {
        global.petWindow.webContents.send('pet-action', {
          name: 'set_pet_state',
          state: args.state,
          duration: args.duration,
          nextState: args.nextState
        });
      }
      return { content: [{ type: 'text', text: `状态已更新: ${args.state}` }] };
    }
  );

  server.tool(
    'pet_say',
    'Make the pet display a speech bubble with the given text',
    { text: z.string().max(100).describe('Text content, max 100 characters') },
    async (args) => {
      if (global.petWindow && !global.petWindow.isDestroyed()) {
        global.petWindow.webContents.send('pet-action', { name: 'pet_say', text: args.text });
      }
      return { content: [{ type: 'text', text: '宠物已说话' }] };
    }
  );

  server.tool(
    'get_pet_info',
    'Get the current pet info including name, description, and available animations',
    {},
    async () => {
      const { id, displayName, description, kind, animations, stateMapping, frameSize, stateTexts } = petConfig;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id, displayName, description, kind, frameSize,
            animations: Object.keys(animations),
            stateMapping,
            stateTexts: stateTexts ? Object.keys(stateTexts) : undefined
          }, null, 2)
        }]
      };
    }
  );
}

// ========== TODO Persistence ==========

function loadTodos(dataPath) {
  try {
    const file = path.join(dataPath, 'todo.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8')).todos || [];
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveTodos(dataPath, todos) {
  try {
    const file = path.join(dataPath, 'todo.json');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ todos }, null, 2));
  } catch (e) {
    console.error('Failed to save todos:', e.message);
  }
}

function registerTodoTools(server, dataPath) {
  server.tool(
    'add_todo',
    'Add a new TODO item',
    { text: z.string().max(100).describe('TODO content, max 100 characters') },
    async (args) => {
      const todos = loadTodos(dataPath);
      const todo = { id: 'todo-' + Date.now(), text: args.text, done: false, createdAt: new Date().toISOString() };
      todos.push(todo);
      saveTodos(dataPath, todos);
      return { content: [{ type: 'text', text: `TODO已添加: ${todo.id}` }] };
    }
  );

  server.tool(
    'list_todos',
    'List TODO items, optionally filtered by status',
    { filter: z.enum(['all', 'pending', 'done']).optional().default('all') },
    async (args) => {
      const todos = loadTodos(dataPath);
      let filtered = todos;
      if (args.filter === 'pending') filtered = todos.filter(t => !t.done);
      else if (args.filter === 'done') filtered = todos.filter(t => t.done);
      return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
    }
  );

  server.tool(
    'mark_todo_done',
    'Mark a TODO item as completed',
    { id: z.string() },
    async (args) => {
      const todos = loadTodos(dataPath);
      const todo = todos.find(t => t.id === args.id);
      if (!todo) return { content: [{ type: 'text', text: 'TODO未找到' }] };
      todo.done = true;
      saveTodos(dataPath, todos);
      return { content: [{ type: 'text', text: 'TODO已标记完成' }] };
    }
  );

  server.tool(
    'delete_todo',
    'Delete a TODO item permanently',
    { id: z.string() },
    async (args) => {
      const todos = loadTodos(dataPath);
      const idx = todos.findIndex(t => t.id === args.id);
      if (idx === -1) return { content: [{ type: 'text', text: 'TODO未找到' }] };
      todos.splice(idx, 1);
      saveTodos(dataPath, todos);
      return { content: [{ type: 'text', text: 'TODO已删除' }] };
    }
  );
}

function registerSchedulerTools(server, scheduler) {
  const actionTypeEnum = z.enum(['set_pet_state', 'set_pet_animation', 'pet_say']);
  const stateEnum = z.enum(['idle', 'thinking', 'in-progress', 'executing', 'done', 'error']);

  server.tool(
    'list_scheduled_tasks',
    'List all scheduled cron tasks',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(scheduler.tasks, null, 2) }]
    })
  );

  server.tool(
    'add_scheduled_task',
    'Add a new scheduled cron task',
    {
      cron: z.string().describe('Cron expression, e.g. "0 12 * * *" for daily at noon'),
      action: z.object({
        type: actionTypeEnum,
        state: stateEnum.optional(),
        animation: z.string().optional(),
        text: z.string().max(100).optional()
      }),
      name: z.string().optional().describe('Optional display name for the task'),
      enabled: z.boolean().optional().default(true)
    },
    async (args) => {
      const id = 'cron-' + Date.now();
      const task = { id, name: args.name || '', cron: args.cron, action: args.action, enabled: args.enabled !== false };
      scheduler.addTask(task);
      return { content: [{ type: 'text', text: `定时任务已添加: ${id}` }] };
    }
  );

  server.tool(
    'delete_scheduled_task',
    'Delete a scheduled cron task by ID',
    { id: z.string() },
    async (args) => {
      const ok = scheduler.deleteTask(args.id);
      return { content: [{ type: 'text', text: ok ? '定时任务已删除' : '任务未找到' }] };
    }
  );
}

// ========== Midnight Cleanup ==========

function scheduleMidnightCleanup(dataPath) {
  const now = Date.now();
  const next = new Date();
  next.setHours(24, 0, 0, 0); // next midnight
  const delay = Math.max(0, next.getTime() - now);

  setTimeout(() => {
    try {
      const file = path.join(dataPath, 'todo.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const before = data.todos.length;
        data.todos = data.todos.filter(t => !t.done);
        if (data.todos.length !== before) {
          fs.writeFileSync(file, JSON.stringify(data, null, 2));
        }
      }
    } catch (e) { /* ignore */ }
    scheduleMidnightCleanup(dataPath);
  }, delay);
}

// ========== MCP Server ==========

async function startMcpServer(petConfig, assetPath, dataPath) {
  dataPath = dataPath || assetPath;
  const scheduler = new CronScheduler(dataPath);
  scheduler.start();
  scheduleMidnightCleanup(dataPath);

  const app = express();
  const PORT = petConfig.port || 3099;

  // SSE endpoint — creates a new session per connection
  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const server = new McpServer(
      { name: 'coding-pet', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    registerTools(server, petConfig);
    registerSchedulerTools(server, scheduler);
    registerTodoTools(server, dataPath);

    const sessionId = transport.sessionId;
    sessions.set(sessionId, { transport, server });

    req.on('close', () => {
      sessions.delete(sessionId);
    });

    try {
      await server.connect(transport);
    } catch (err) {
      console.error('SSE connection error:', err.message);
      sessions.delete(sessionId);
    }
  });

  // POST endpoint — routes messages by sessionId (passed as query param by SDK)
  app.post('/messages', (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(400).send('Missing sessionId');
    }
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).send('Session not found');
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        session.transport.handlePostMessage(req, res, parsed);
      } catch (e) {
        res.status(400).send('Invalid JSON');
      }
    });
  });

  app.listen(PORT, () => {
    console.log(`MCP pet server listening on http://localhost:${PORT}/sse`);
  });
}

module.exports = { startMcpServer };
