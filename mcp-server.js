const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const express = require('express');

let transport = null;

async function startMcpServer(petConfig) {
  const animNames = Object.keys(petConfig.animations);
  const server = new McpServer(
    { name: 'coding-pet', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Dynamic tool: set_pet_animation — enum from pet.json
  server.tool(
    'set_pet_animation',
    'Play a specific pet animation by name',
    {
      animation: z.enum(animNames)
    },
    async (args) => {
      if (global.petWindow && !global.petWindow.isDestroyed()) {
        global.petWindow.webContents.send('pet-action', { name: 'set_pet_animation', animation: args.animation });
      }
      return { content: [{ type: 'text', text: `动画已切换: ${args.animation}` }] };
    }
  );

  // Generic state mapping tool
  server.tool(
    'set_pet_state',
    'Set the pet state (maps AI workflow states to animations)',
    {
      state: z.enum(['idle', 'thinking', 'in-progress', 'executing', 'done', 'error'])
    },
    async (args) => {
      if (global.petWindow && !global.petWindow.isDestroyed()) {
        global.petWindow.webContents.send('pet-action', { name: 'set_pet_state', state: args.state });
      }
      return { content: [{ type: 'text', text: `状态已更新: ${args.state}` }] };
    }
  );

  // Speech bubble
  server.tool(
    'pet_say',
    'Make the pet display a speech bubble with the given text',
    { text: z.string() },
    async (args) => {
      if (global.petWindow && !global.petWindow.isDestroyed()) {
        global.petWindow.webContents.send('pet-action', { name: 'pet_say', text: args.text });
      }
      return { content: [{ type: 'text', text: '宠物已说话' }] };
    }
  );

  // Get pet info and available animations
  server.tool(
    'get_pet_info',
    'Get the current pet info including name, description, and available animations',
    {},
    async () => {
      const { id, displayName, description, kind, animations, stateMapping, frameSize } = petConfig;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id,
            displayName,
            description,
            kind,
            frameSize,
            animations: Object.keys(animations),
            stateMapping
          }, null, 2)
        }]
      };
    }
  );

  const app = express();

  app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport('/messages', res);
    await server.connect(transport);
  });

  app.post('/messages', (req, res) => {
    if (!transport) {
      return res.status(503).send('No active SSE connection');
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        transport.handlePostMessage(req, res, parsed);
      } catch (e) {
        res.status(400).send('Invalid JSON');
      }
    });
  });

  const PORT = 3099;
  app.listen(PORT, () => {
    console.log(`MCP pet server listening on http://localhost:${PORT}/sse`);
  });
}

module.exports = { startMcpServer };
