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
let todoTitle = '只因任务清单';

// Sequence player state
let sequenceQueue = [];
let sequenceTimer = null;
let sequenceActive = false;
let explicitBubbleActive = false;

// Pomodoro state
let pomodoroPhase = 'idle';
let pomodoroRemindTimer = null;
let pomodoroOriginalPosition = null;

// Load pet config from main process (handles dev/packaged paths)
window.petAPI.getPetConfig().then(config => {
  petConfig = config;
  todoTitle = config.todoTitle || '只因任务清单';
  const scale = config.scale || 0.5;
  canvas.width = Math.round(config.frameSize.width * scale);
  canvas.height = Math.round(config.frameSize.height * scale);
  spritesheet.src = config._spritesheetUrl;
  spritesheet.onload = () => {
    startAnimation('idle');
  };
  // Start idle speech after first TODO reminder interval
  if (config.stateTexts && config.stateTexts.idle) {
    setTimeout(scheduleIdleSpeech, 15000);
  }

  // Start TODO reminder with configured interval
  if (window.petAPI.getTodos) {
    const reminderInterval = config.todoReminderIntervalMs || 60000;
    const displayDuration = config.todoDisplayDurationMs || 12000;
    startTodoReminder(reminderInterval);
  }
}).catch(err => console.error('Failed to load pet config:', err));

function hideBubble() {
  bubble.classList.remove('show');
  explicitBubbleActive = false;
}

function showBubble(text, duration) {
  bubble.textContent = text.length > 100 ? text.slice(0, 100) : text;
  bubble.classList.add('show');
  explicitBubbleActive = true;
  clearTimeout(bubble._timeout);
  bubble._timeout = setTimeout(hideBubble, duration || 4000);
}

function showRandomStateText(state) {
  const texts = petConfig.stateTexts && petConfig.stateTexts[state];
  if (texts && texts.length > 0) {
    const raw = texts[Math.floor(Math.random() * texts.length)];
    clearTimeout(bubble._timeout);
    bubble.textContent = raw.length > 100 ? raw.slice(0, 100) : raw;
    bubble.classList.add('show');
    bubble._timeout = setTimeout(hideBubble, 4000);
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

function stopSequence() {
  sequenceActive = false;
  sequenceQueue = [];
  if (sequenceTimer) {
    clearTimeout(sequenceTimer);
    sequenceTimer = null;
  }
}

function advanceSequence() {
  if (!sequenceActive || sequenceQueue.length === 0) {
    if (sequenceActive) {
      if (currentAnimName !== 'idle') {
        const idleAnim = petConfig.stateMapping ? (petConfig.stateMapping.idle || 'idle') : 'idle';
        startAnimation(idleAnim);
        lastStateChangeTime = Date.now();
      }
    }
    sequenceActive = false;
    sequenceQueue = [];
    return;
  }

  const item = sequenceQueue.shift();
  const duration = item.duration || 3000;

  if (item.animation) {
    startAnimation(item.animation);
    lastStateChangeTime = Date.now();
  }
  if (item.text) {
    showBubble(item.text, duration);
  }

  sequenceTimer = setTimeout(advanceSequence, duration);
}

function playSequence(actions) {
  stopSequence();
  sequenceQueue = actions.map(a => Object.assign({}, a));
  sequenceActive = true;
  advanceSequence();
}

// ========== Pomodoro Helpers ==========

async function movePetToCenter() {
  pomodoroOriginalPosition = await window.petAPI.getWindowPosition();
  const screenW = window.screen.width;
  const winW = document.body.clientWidth;
  const targetX = Math.round((screenW - winW) / 2);
  const startX = pomodoroOriginalPosition.x;
  const distance = Math.abs(targetX - startX);
  const speed = (petConfig.pomodoro && petConfig.pomodoro.runSpeed) || 100;
  const duration = Math.min(4000, Math.max(1000, Math.round(distance / speed * 1000)));
  const goingRight = targetX >= startX;
  const anim = goingRight ? 'running-right' : 'running-left';

  startAnimation(anim);
  const startTime = performance.now();

  return new Promise(resolve => {
    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - (1 - t) * (1 - t);
      const x = Math.round(startX + (targetX - startX) * ease);
      window.petAPI.setWindowPosition(x, pomodoroOriginalPosition.y);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function restorePetPosition() {
  if (!pomodoroOriginalPosition) return Promise.resolve();
  const targetX = pomodoroOriginalPosition.x;
  const targetY = pomodoroOriginalPosition.y;
  const currentX = Math.round((window.screen.width - document.body.clientWidth) / 2);
  const distance = Math.abs(targetX - currentX);
  const speed = (petConfig.pomodoro && petConfig.pomodoro.runSpeed) || 100;
  const duration = Math.min(4000, Math.max(1000, Math.round(distance / speed * 1000)));
  const goingRight = targetX >= currentX;
  const anim = goingRight ? 'running-right' : 'running-left';

  pomodoroOriginalPosition = null;
  startAnimation(anim);
  const startTime = performance.now();

  return new Promise(resolve => {
    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - (1 - t) * (1 - t);
      const x = Math.round(currentX + (targetX - currentX) * ease);
      window.petAPI.setWindowPosition(x, targetY);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        window.petAPI.setWindowPosition(targetX, targetY);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function clearPomodoroRemind() {
  if (pomodoroRemindTimer) {
    clearInterval(pomodoroRemindTimer);
    pomodoroRemindTimer = null;
  }
}

function pickPomodoroText(texts, vars) {
  if (!texts || texts.length === 0) return '';
  let t = texts[Math.floor(Math.random() * texts.length)];
  if (vars) {
    for (const k in vars) t = t.replace('{' + k + '}', vars[k]);
  }
  return t;
}

async function handlePomodoroPhase(action) {
  const pomo = petConfig.pomodoro || {};
  const phase = action.phase;

  switch (phase) {
    case 'work-start': {
      pomodoroPhase = 'work';
      clearPomodoroRemind();
      startAnimation(petConfig.stateMapping ? (petConfig.stateMapping.thinking || 'waiting') : 'waiting');
      const t = pickPomodoroText(pomo.workTexts, { minutes: action.minutes, elapsed: '0' });
      showBubble(t, 5000);
      lastStateChangeTime = Date.now();

      // Periodic encouragement
      const remindInterval = (pomo.remindIntervalMinutes || 5) * 60 * 1000;
      let elapsedMinutes = 0;
      pomodoroRemindTimer = setInterval(() => {
        elapsedMinutes += (pomo.remindIntervalMinutes || 5);
        if (pomodoroPhase === 'work') {
          const remind = pickPomodoroText(pomo.workTexts, { minutes: action.minutes, elapsed: elapsedMinutes });
          showBubble(remind, 5000);
        }
      }, remindInterval);
      break;
    }

    case 'work-end': {
      pomodoroPhase = 'break';
      clearPomodoroRemind();
      stopSequence();

      // Move to screen center for alert
      await movePetToCenter();
      startAnimation('jumping');

      const endText = pickPomodoroText(pomo.breakTexts, { minutes: action.minutes });
      showBubble(endText, pomo.alertDurationMs || 8000);

      // After alert duration, run back to original position, then idle
      setTimeout(async () => {
        await restorePetPosition();
        startAnimation('idle');
        lastStateChangeTime = Date.now();
      }, pomo.alertDurationMs || 8000);
      break;
    }

    case 'break-end': {
      pomodoroPhase = 'idle';
      const doneText = pickPomodoroText(pomo.doneTexts) || '休息结束，继续加油！';
      showBubble(doneText, 4000);
      break;
    }

    case 'all-done': {
      pomodoroPhase = 'idle';
      clearPomodoroRemind();
      await restorePetPosition();
      startAnimation('jumping');
      const allDoneText = action.text || pickPomodoroText(pomo.doneTexts) || '全部番茄钟完成！';
      showBubble(allDoneText, 5000);
      setTimeout(() => {
        if (pomodoroPhase === 'idle') {
          startAnimation('idle');
          lastStateChangeTime = Date.now();
        }
      }, 5000);
      break;
    }
  }
}

window.petAPI.onAction((action) => {
  if (!petConfig) return;
  if (action.name === 'set_pet_state') {
    stopSequence();
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
    if (action.text) {
      showBubble(action.text);
    } else if (!petConfig.disableRandomText) {
      showRandomStateText(action.state);
    }
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
          if (!petConfig.disableRandomText) {
            showRandomStateText(targetState);
          }
          lastStateChangeTime = Date.now();
        }
        stateTransitionTimeout = null;
      }, action.duration);
    }
  } else if (action.name === 'set_pet_animation') {
    stopSequence();
    if (stateTransitionTimeout) {
      clearTimeout(stateTransitionTimeout);
      stateTransitionTimeout = null;
    }
    startAnimation(action.animation);
    lastStateChangeTime = Date.now();
  } else if (action.name === 'pet_say') {
    bubble.textContent = action.text.length > 100 ? action.text.slice(0, 100) : action.text;
    bubble.classList.add('show');
    clearTimeout(bubble._timeout);
    bubble._timeout = setTimeout(hideBubble, 4000);
  } else if (action.name === 'play_action_sequence') {
    stopSequence();
    if (stateTransitionTimeout) {
      clearTimeout(stateTransitionTimeout);
      stateTransitionTimeout = null;
    }
    playSequence(action.actions);
  } else if (action.name === 'pomodoro-phase') {
    handlePomodoroPhase(action);
  }
});

window.petAPI.onPassthroughChanged((enabled) => {
  mousePassthrough = enabled;
});

// ========== Smart Capture: auto-enable on hover, disable on leave ==========
let canvasHovered = false;
let todoPanelHovered = false;

function updateCapture() {
  if (mousePassthrough) return;
  if (canvasHovered || todoPanelHovered) {
    window.petAPI.setCapture(true);
  } else if (!isDragging) {
    window.petAPI.setCapture(false);
  }
}

canvas.addEventListener('mouseenter', () => {
  canvasHovered = true;
  updateCapture();
});
canvas.addEventListener('mouseleave', () => {
  canvasHovered = false;
  updateCapture();
});

const todoPanelEl = document.getElementById('todo-panel');
todoPanelEl.addEventListener('mouseenter', () => {
  todoPanelHovered = true;
  updateCapture();
});
todoPanelEl.addEventListener('mouseleave', () => {
  todoPanelHovered = false;
  updateCapture();
});
// Safety: clear drag flag on any mouseup (handles release outside canvas)
document.addEventListener('mouseup', () => {
  isDragging = false;
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

function showTodoReminder() {
  if (!window.petAPI.getTodos) return;
  window.petAPI.getTodos().then(todos => {
    if (!todos || todos.length === 0) return;
    const panel = document.getElementById('todo-panel');
    if (!panel) return;

    let html = '<div class="todo-title">' + todoTitle + '</div>';
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
      todoPanelHovered = false;
      updateCapture();
    }, petConfig.todoDisplayDurationMs || 12000);
  });
}

// Start TODO reminder with configured interval
function startTodoReminder(interval) {
  setTimeout(showTodoReminder, 15000);
  setInterval(showTodoReminder, interval);
}

// Schedule idle speech at random intervals (started after config loads)
function scheduleIdleSpeech() {
  const range = petConfig.idleSpeechInterval;
  const min = (range && range.length >= 2 ? range[0] : 30) * 1000;
  const max = (range && range.length >= 2 ? range[1] : 60) * 1000;
  const delay = Math.random() * (max - min) + min;
  setTimeout(() => {
    if (currentAnimName === 'idle' && !explicitBubbleActive) showRandomStateText('idle');
    scheduleIdleSpeech();
  }, delay);
}

// Tray "Show TODO List" handler
if (window.petAPI.onShowTodo) {
  window.petAPI.onShowTodo(() => showTodoReminder());
}

// Tray "Add TODO" handler
function showTodoInput() {
  window.petAPI.getTodos().then(todos => {
    const panel = document.getElementById('todo-panel');
    if (!panel) return;

    let html = '<div class="todo-title">' + todoTitle + '</div>';
    html += '<div class="todo-input-area"><input type="text" id="todo-input" placeholder="输入TODO，回车添加..." maxlength="100"></div>';
    if (todos && todos.length > 0) {
      todos.forEach(todo => {
        const statusClass = todo.done ? 'checked' : '';
        const itemClass = todo.done ? 'todo-item done' : 'todo-item';
        const text = todo.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `<div class="${itemClass}" data-id="${todo.id}">
          <span class="todo-checkbox ${statusClass}"></span>
          ${text}
        </div>`;
      });
    }
    panel.innerHTML = html;
    panel.classList.add('show');

    // Bind input events for adding TODOs
    const input = document.getElementById('todo-input');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          window.petAPI.addTodo(input.value.trim()).then(() => showTodoInput());
        }
      });
    }
    // Re-bind todo item events
    bindTodoEvents(panel);

    clearTimeout(panel._hideTimeout);
    panel._hideTimeout = setTimeout(() => {
      panel.classList.remove('show');
      todoPanelHovered = false;
      updateCapture();
    }, petConfig.todoDisplayDurationMs || 12000);
  });
}

function bindTodoEvents(panel) {
  panel.querySelectorAll('.todo-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.todo-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      window.petAPI.toggleTodo(id).then(() => showTodoInput());
    });
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.todo-checkbox')) return;
      window.petAPI.deleteTodo(id).then(() => showTodoInput());
    });
  });
}

if (window.petAPI.onShowTodoInput) {
  window.petAPI.onShowTodoInput(() => showTodoInput());
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
