// ========== Sprite Animation Engine ==========
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
const bubble = document.getElementById('speech-bubble');

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

// Load pet config
fetch('../assets/pet.json')
  .then(res => res.json())
  .then(config => {
    petConfig = config;
    const scale = config.scale || 0.5;
    canvas.width = Math.round(config.frameSize.width * scale);
    canvas.height = Math.round(config.frameSize.height * scale);
    spritesheet.src = '../assets/' + config.spritesheetPath;
    spritesheet.onload = () => {
      startAnimation('idle');
    };
  })
  .catch(err => console.error('Failed to load pet config:', err));

function showBubble(text, duration) {
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubble._timeout);
  bubble._timeout = setTimeout(() => {
    bubble.classList.remove('show');
  }, duration || 4000);
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
  const elapsed = now - lastTime;
  lastTime = now;
  frameTimer += elapsed;

  const frameDuration = currentAnimation.frameDuration || 200;
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
  } else if (action.name === 'set_pet_animation') {
    startAnimation(action.animation);
  } else if (action.name === 'pet_say') {
    bubble.textContent = action.text;
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

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging || mousePassthrough) return;
  const newX = e.screenX - dragOffsetX;
  const newY = e.screenY - dragOffsetY;
  window.petAPI.setWindowPosition(newX, newY);
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

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
