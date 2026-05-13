// ========== Sprite Animation Engine ==========
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
const bubble = document.getElementById('speech-area');

let petConfig = null;
let spritesheet = new Image();
let currentAnimation = null;
let currentAnimName = 'idle';
let currentFrameIndex = 0;
let frameTimer = 0;
let lastTime = 0;
let animFrameId = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let mousePassthrough = false;
let lastStateChangeTime = 0;
let stateTransitionTimeout = null;

// Load pet config from main process (handles dev/packaged paths)
window.petAPI.getPetConfig().then(config => {
  petConfig = config;
  const scale = config.scale || 0.5;
  canvas.width = Math.round(config.frameSize.width * scale);
  canvas.height = Math.round(config.frameSize.height * scale);
  spritesheet.src = config._spritesheetUrl;
  spritesheet.onload = () => {
    startAnimation('idle');
  };
}).catch(err => console.error('Failed to load pet config:', err));

function showBubble(text, duration) {
  bubble.textContent = text.length > 100 ? text.slice(0, 100) : text;
  bubble.classList.add('show');
  clearTimeout(bubble._timeout);
  bubble._timeout = setTimeout(() => {
    bubble.classList.remove('show');
  }, duration || 4000);
}

function showRandomStateText(state) {
  const texts = petConfig.stateTexts && petConfig.stateTexts[state];
  if (texts && texts.length > 0) {
    const raw = texts[Math.floor(Math.random() * texts.length)];
    clearTimeout(bubble._timeout);
    bubble.textContent = raw.length > 100 ? raw.slice(0, 100) : raw;
    bubble.classList.add('show');
    bubble._timeout = setTimeout(() => {
      bubble.classList.remove('show');
    }, 4000);
  }
}

function startAnimation(name) {
  if (!petConfig || !petConfig.animations[name]) {
    console.warn('Animation "' + name + '" not found');
    return;
  }
  currentAnimation = petConfig.animations[name];
  currentAnimName = name;
  currentFrameIndex = 0;
  frameTimer = 0;
  lastTime = performance.now();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  tick(lastTime);
}

// Animation loop
function tick(now) {
  if (!currentAnimation) return;

  // Auto-idle: return to idle if no state change within timeout
  if (petConfig.autoIdleTimeoutMs && currentAnimName !== 'idle') {
    if (Date.now() - lastStateChangeTime > petConfig.autoIdleTimeoutMs) {
      const idleAnim = petConfig.stateMapping ? (petConfig.stateMapping.idle || 'idle') : 'idle';
      startAnimation(idleAnim);
      showRandomStateText('idle');
      lastStateChangeTime = Date.now();
    }
  }

  const frameDuration = currentAnimation.frameDuration || 200;
  const elapsed = Math.min(now - lastTime, frameDuration * 2);
  lastTime = now;
  frameTimer += elapsed;
  if (frameTimer >= frameDuration) {
    frameTimer -= frameDuration;
    currentFrameIndex = (currentFrameIndex + 1) % currentAnimation.frames.length;
  }

  const frame = currentAnimation.frames[currentFrameIndex];
  const fw = petConfig.frameSize.width;
  const fh = petConfig.frameSize.height;
  const cols = Math.floor(spritesheet.naturalWidth / fw);

  let sx, sy;
  if (typeof frame === 'number') {
    sx = (frame % cols) * fw;
    sy = Math.floor(frame / cols) * fh;
  } else {
    sx = frame.x;
    sy = frame.y;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(spritesheet, sx, sy, fw, fh, 0, 0, canvas.width, canvas.height);

  animFrameId = requestAnimationFrame(tick);
}

// ========== MCP Action Handling ==========

window.petAPI.onAction((action) => {
  if (action.name === 'set_pet_state') {
    const mapping = petConfig.stateMapping || {
      idle: 'idle',
      thinking: 'waiting',
      'in-progress': 'running',
      executing: 'running',
      done: 'jumping',
      error: 'failed'
    };
    const animName = mapping[action.state] || 'idle';
    startAnimation(animName);
    showRandomStateText(action.state);
    lastStateChangeTime = Date.now();

    // Duration-based auto-transition
    if (stateTransitionTimeout) {
      clearTimeout(stateTransitionTimeout);
      stateTransitionTimeout = null;
    }
    if (action.duration && action.duration > 0) {
      stateTransitionTimeout = setTimeout(() => {
        const targetState = action.nextState || 'idle';
        const targetAnim = (petConfig.stateMapping && petConfig.stateMapping[targetState]) || targetState;
        if (petConfig.animations[targetAnim]) {
          startAnimation(targetAnim);
          showRandomStateText(targetState);
          lastStateChangeTime = Date.now();
        }
        stateTransitionTimeout = null;
      }, action.duration);
    }
  } else if (action.name === 'set_pet_animation') {
    startAnimation(action.animation);
  } else if (action.name === 'pet_say') {
    bubble.textContent = action.text.length > 100 ? action.text.slice(0, 100) : action.text;
    bubble.classList.add('show');
    clearTimeout(bubble._timeout);
    bubble._timeout = setTimeout(() => {
      bubble.classList.remove('show');
    }, 4000);
  }
});

window.petAPI.onPassthroughChanged((enabled) => {
  mousePassthrough = enabled;
});

// ========== Mouse Interaction ==========
let dragOffsetX = 0;
let dragOffsetY = 0;

canvas.addEventListener('mousedown', async (e) => {
  if (mousePassthrough) return;

  // Middle-click to toggle passthrough
  if (e.button === 1) {
    e.preventDefault();
    window.petAPI.togglePassthrough();
    return;
  }

  // Left-click drag using absolute screen coordinates
  if (e.button === 0) {
    isDragging = true;
    const pos = await window.petAPI.getWindowPosition();
    dragOffsetX = e.screenX - pos.x;
    dragOffsetY = e.screenY - pos.y;
  }
});

let pendingMoveX = null;
let pendingMoveY = null;
let moveFrameId = null;

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging || mousePassthrough) return;
  pendingMoveX = e.screenX - dragOffsetX;
  pendingMoveY = e.screenY - dragOffsetY;
  if (!moveFrameId) {
    moveFrameId = requestAnimationFrame(() => {
      if (pendingMoveX !== null) {
        window.petAPI.setWindowPosition(pendingMoveX, pendingMoveY);
        pendingMoveX = null;
        pendingMoveY = null;
      }
      moveFrameId = null;
    });
  }
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
  if (moveFrameId) {
    cancelAnimationFrame(moveFrameId);
    moveFrameId = null;
  }
  pendingMoveX = null;
  pendingMoveY = null;
});

// ========== TODO Reminder ==========

const TODO_REMINDER_INTERVAL = 60000;
const TODO_DISPLAY_DURATION = 12000;

function showTodoReminder() {
  if (!window.petAPI.getTodos) return;
  window.petAPI.getTodos().then(todos => {
    if (!todos || todos.length === 0) return;
    const panel = document.getElementById('todo-panel');
    if (!panel) return;

    let html = '<div class="todo-title">只因任务清单</div>';
    todos.forEach(todo => {
      const statusClass = todo.done ? 'checked' : '';
      const itemClass = todo.done ? 'todo-item done' : 'todo-item';
      const text = todo.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<div class="${itemClass}" data-id="${todo.id}">
        <span class="todo-checkbox ${statusClass}"></span>
        ${text}
      </div>`;
    });
    panel.innerHTML = html;
    panel.classList.add('show');

    // Event delegation: click checkbox → toggle; dblclick item → delete
    panel.querySelectorAll('.todo-item').forEach(el => {
      const id = el.dataset.id;
      el.querySelector('.todo-checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        window.petAPI.toggleTodo(id).then(() => showTodoReminder());
      });
      el.addEventListener('dblclick', (e) => {
        if (e.target.closest('.todo-checkbox')) return;
        window.petAPI.deleteTodo(id).then(() => showTodoReminder());
      });
    });

    clearTimeout(panel._hideTimeout);
    panel._hideTimeout = setTimeout(() => {
      panel.classList.remove('show');
    }, TODO_DISPLAY_DURATION);
  });
}

// Start TODO reminder after initial load
if (window.petAPI.getTodos) {
  setTimeout(showTodoReminder, 15000);
  setInterval(showTodoReminder, TODO_REMINDER_INTERVAL);
}

// Double-click to cycle animations
canvas.addEventListener('dblclick', () => {
  if (mousePassthrough || !petConfig) return;
  const animList = Object.keys(petConfig.animations);
  if (animList.length === 0) return;
  const idx = animList.indexOf(currentAnimName);
  const next = animList[(idx + 1) % animList.length];
  startAnimation(next);
  showBubble('→ ' + next, 1500);
});
