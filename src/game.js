import Matter from 'matter-js';
import {
  LEVEL_COUNT,
  LEVELS,
  MERGE_SOUND_POOL,
  WIN_SOUND,
  getMergeScore,
  getRadius,
  loadAudioPreferences,
  loadBestScore,
  randomSpawnLevel,
  saveAudioPreferences,
  saveBestScore,
} from './config.js';

const {
  Engine,
  Render,
  Runner,
  Bodies,
  Body,
  Composite,
  Events,
} = Matter;

export class MergeMilkFrogGame {
  constructor(root, callbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.score = 0;
    this.bestScore = loadBestScore();
    this.isFinished = false;
    this.canDrop = true;
    this.currentLevel = randomSpawnLevel();
    this.nextLevel = randomSpawnLevel();
    this.aimX = 0;
    this.mergeQueue = [];
    this.mergingBodyIds = new Set();
    this.dangerSince = null;
    this.imageCache = new Map();
    this.failedSounds = new Set();
    this.activeAudio = new Set();
    this.audioPreferences = loadAudioPreferences();
    this.dropTimer = null;
  }

  start() {
    this.renderShell();
    this.cacheElements();
    this.bindUi();
    this.createPhysics();
    this.resize();
    this.aimX = this.width / 2;
    this.updateScore();
    this.updatePreview();
    this.renderAudioPreferences();
  }

  renderShell() {
    this.root.innerHTML = `
      <main class="page-shell">
        <section class="game-card" aria-label="合成大奶蛙游戏">
          <header class="hero-bar">
            <div class="brand-block">
              <p class="eyebrow">十级合成挑战</p>
              <h1>合成大奶蛙</h1>
              <p class="tagline">把相同的小奶蛙碰到一起，合成第 10 级即可通关。</p>
            </div>
            <div class="score-board" aria-label="分数信息">
              <div class="score-item">
                <span>本局分数</span>
                <strong id="score-value">0</strong>
              </div>
              <div class="score-item best">
                <span>历史最高</span>
                <strong id="best-score-value">0</strong>
              </div>
            </div>
          </header>

          <div class="control-bar">
            <div class="preview-group" aria-label="球体预览">
              <div class="preview-item">
                <span>当前</span>
                <div class="mini-ball" id="current-preview"></div>
              </div>
              <div class="preview-arrow" aria-hidden="true">→</div>
              <div class="preview-item">
                <span>下一个</span>
                <div class="mini-ball" id="next-preview"></div>
              </div>
            </div>

            <div class="audio-controls">
              <button class="soft-button sound-toggle" id="sound-toggle" type="button"></button>
              <label class="volume-control">
                <span>音量 <b id="volume-value"></b></span>
                <input id="master-volume" type="range" min="0" max="100" step="1" aria-label="总音量" />
              </label>
            </div>

            <button class="soft-button restart-button" id="restart-game" type="button">重新开始</button>
          </div>

          <div class="game-stage" id="canvas-host">
            <div class="danger-label">警戒线</div>
            <div class="game-tip">移动鼠标或手指选择位置，松开即可投放</div>
            <div class="game-overlay hidden" id="game-overlay">
              <div class="overlay-panel">
                <p class="overlay-kicker" id="overlay-kicker"></p>
                <h2 id="overlay-title"></h2>
                <p class="overlay-message" id="overlay-message"></p>
                <div class="result-score">
                  <span>本局得分</span>
                  <strong id="final-score">0</strong>
                </div>
                <p class="result-best" id="result-best"></p>
                <button class="primary-button" id="play-again" type="button">再玩一次</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    `;
  }

  cacheElements() {
    this.canvasHost = this.root.querySelector('#canvas-host');
    this.scoreElement = this.root.querySelector('#score-value');
    this.bestScoreElement = this.root.querySelector('#best-score-value');
    this.currentPreview = this.root.querySelector('#current-preview');
    this.nextPreview = this.root.querySelector('#next-preview');
    this.overlay = this.root.querySelector('#game-overlay');
    this.soundToggle = this.root.querySelector('#sound-toggle');
    this.volumeInput = this.root.querySelector('#master-volume');
    this.volumeValue = this.root.querySelector('#volume-value');
  }

  bindUi() {
    this.onPointerMove = (event) => {
      if (this.isFinished || !this.width) return;
      const rect = this.canvasHost.getBoundingClientRect();
      const radius = getRadius(this.currentLevel);
      this.aimX = clamp(event.clientX - rect.left, radius + 8, this.width - radius - 8);
    };

    this.onPointerDown = (event) => {
      if (this.isFinished) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      this.onPointerMove(event);
      this.canvasHost.setPointerCapture?.(event.pointerId);
    };

    this.onPointerUp = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      this.onPointerMove(event);
      this.canvasHost.releasePointerCapture?.(event.pointerId);
      this.dropBall();
    };

    this.onPointerCancel = (event) => {
      this.canvasHost.releasePointerCapture?.(event.pointerId);
    };

    this.canvasHost.addEventListener('pointermove', this.onPointerMove);
    this.canvasHost.addEventListener('pointerdown', this.onPointerDown);
    this.canvasHost.addEventListener('pointerup', this.onPointerUp);
    this.canvasHost.addEventListener('pointercancel', this.onPointerCancel);

    this.root.querySelector('#restart-game').addEventListener('click', this.callbacks.onRestartRequest);
    this.root.querySelector('#play-again').addEventListener('click', this.callbacks.onPlayAgain);

    this.soundToggle.addEventListener('click', () => {
      this.audioPreferences.enabled = !this.audioPreferences.enabled;
      if (!this.audioPreferences.enabled) this.stopAllAudio();
      this.saveAndRenderAudioPreferences();
    });

    this.volumeInput.value = Math.round(this.audioPreferences.volume * 100);
    this.volumeInput.addEventListener('input', () => {
      this.audioPreferences.volume = Number(this.volumeInput.value) / 100;
      for (const audio of this.activeAudio) {
        audio.volume = this.audioPreferences.volume;
      }
      this.saveAndRenderAudioPreferences();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvasHost);
  }

  createPhysics() {
    this.engine = Engine.create({ enableSleeping: false });
    this.engine.gravity.y = 1.18;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    this.engine.constraintIterations = 3;
    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);

    this.render = Render.create({
      element: this.canvasHost,
      engine: this.engine,
      options: {
        width: 400,
        height: 650,
        wireframes: false,
        background: 'transparent',
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      },
    });
    Render.run(this.render);

    Events.on(this.engine, 'collisionStart', (event) => this.handleCollisions(event.pairs));
    Events.on(this.engine, 'afterUpdate', () => {
      this.processMergeQueue();
      this.checkDangerLine();
    });
    Events.on(this.render, 'afterRender', () => this.drawGame());
  }

  resize() {
    const rect = this.canvasHost.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === this.width && nextHeight === this.height) return;

    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = nextWidth;
    this.height = nextHeight;
    this.dangerY = Math.max(110, Math.round(this.height * 0.21));

    if (!this.render) return;

    this.render.options.width = this.width;
    this.render.options.height = this.height;
    this.render.canvas.style.width = `${this.width}px`;
    this.render.canvas.style.height = `${this.height}px`;
    Render.setPixelRatio(this.render, this.render.options.pixelRatio);

    if (previousWidth && previousHeight) {
      const scaleX = this.width / previousWidth;
      const scaleY = this.height / previousHeight;
      for (const body of Composite.allBodies(this.engine.world)) {
        if (!body.isGameBall) continue;
        Body.setPosition(body, {
          x: clamp(body.position.x * scaleX, body.circleRadius, this.width - body.circleRadius),
          y: Math.min(body.position.y * scaleY, this.height - body.circleRadius),
        });
      }
    }

    this.createWalls();
    this.aimX = clamp(this.aimX || this.width / 2, 30, this.width - 30);
  }

  createWalls() {
    if (this.walls) {
      for (const wall of this.walls) Composite.remove(this.engine.world, wall);
    }

    const thickness = 72;
    this.walls = [
      Bodies.rectangle(-thickness / 2, this.height / 2, thickness, this.height * 2, wallOptions()),
      Bodies.rectangle(this.width + thickness / 2, this.height / 2, thickness, this.height * 2, wallOptions()),
      Bodies.rectangle(this.width / 2, this.height + thickness / 2, this.width + thickness * 2, thickness, wallOptions()),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  dropBall() {
    if (!this.canDrop || this.isFinished) return;

    const level = this.currentLevel;
    const radius = getRadius(level);
    const x = clamp(this.aimX, radius + 4, this.width - radius - 4);
    const y = Math.max(radius + 12, this.dangerY - radius - 18);
    Composite.add(this.engine.world, this.createBall(x, y, level));

    this.canDrop = false;
    this.currentLevel = this.nextLevel;
    this.nextLevel = randomSpawnLevel();
    this.updatePreview();

    window.clearTimeout(this.dropTimer);
    this.dropTimer = window.setTimeout(() => {
      if (!this.isFinished) this.canDrop = true;
    }, 420);
  }

  createBall(x, y, level) {
    const radius = getRadius(level);
    const ball = Bodies.circle(x, y, radius, {
      restitution: 0.24,
      friction: 0.045,
      frictionStatic: 0.12,
      frictionAir: 0.006,
      density: 0.0016 + level * 0.00016,
      slop: 0.02,
      render: { visible: false },
    });
    ball.gameLevel = level;
    ball.isGameBall = true;
    ball.spawnedAt = performance.now();
    return ball;
  }

  handleCollisions(pairs) {
    if (this.isFinished) return;

    for (const pair of pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (!a.isGameBall || !b.isGameBall) continue;
      if (a.gameLevel !== b.gameLevel) continue;
      if (a.gameLevel >= LEVEL_COUNT - 1) continue;
      if (this.mergingBodyIds.has(a.id) || this.mergingBodyIds.has(b.id)) continue;

      this.mergingBodyIds.add(a.id);
      this.mergingBodyIds.add(b.id);
      this.mergeQueue.push({ a, b, level: a.gameLevel + 1 });
    }
  }

  processMergeQueue() {
    if (this.isFinished) {
      this.mergeQueue.length = 0;
      this.mergingBodyIds.clear();
      return;
    }

    while (this.mergeQueue.length) {
      const { a, b, level } = this.mergeQueue.shift();
      const bodies = Composite.allBodies(this.engine.world);
      if (!bodies.includes(a) || !bodies.includes(b)) continue;

      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      const velocity = {
        x: (a.velocity.x + b.velocity.x) / 2,
        y: (a.velocity.y + b.velocity.y) / 2,
      };

      Composite.remove(this.engine.world, [a, b]);
      const merged = this.createBall(x, y, level);
      Body.setVelocity(merged, {
        x: velocity.x + (Math.random() - 0.5) * 1.5,
        y: Math.min(velocity.y, -1.35),
      });
      Body.setAngularVelocity(merged, (Math.random() - 0.5) * 0.09);
      Composite.add(this.engine.world, merged);
      this.wakeAllBalls();

      this.score += getMergeScore(level);
      this.updateScore();
      this.playMergeSound(level);

      if (level === LEVEL_COUNT - 1) {
        this.finishGame('win');
        break;
      }
    }

    this.mergingBodyIds.clear();
  }

  updateScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.bestScore);
    }
    this.scoreElement.textContent = String(this.score);
    this.bestScoreElement.textContent = String(this.bestScore);
  }

  checkDangerLine() {
    if (this.isFinished) return;

    const now = performance.now();
    const dangerous = Composite.allBodies(this.engine.world).some((body) => {
      if (!body.isGameBall) return false;
      if (now - body.spawnedAt < 1200) return false;
      const top = body.position.y - (body.circleRadius || 0);
      return top < this.dangerY && body.speed < 0.8;
    });

    if (dangerous) {
      if (!this.dangerSince) this.dangerSince = now;
      if (now - this.dangerSince >= 1700) this.finishGame('lose');
    } else {
      this.dangerSince = null;
    }
  }

  drawGame() {
    const context = this.render.context;
    const pixelRatio = this.render.options.pixelRatio;
    context.save();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    context.strokeStyle = this.dangerSince ? '#e85d75' : 'rgba(232, 93, 117, 0.62)';
    context.lineWidth = this.dangerSince ? 3 : 2;
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(0, this.dangerY);
    context.lineTo(this.width, this.dangerY);
    context.stroke();
    context.setLineDash([]);

    if (!this.isFinished) {
      const radius = getRadius(this.currentLevel);
      const y = Math.max(radius + 12, this.dangerY - radius - 18);
      context.strokeStyle = 'rgba(45, 106, 79, 0.26)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(this.aimX, 0);
      context.lineTo(this.aimX, y - radius - 5);
      context.stroke();
      this.drawBall(context, {
        position: { x: this.aimX, y },
        circleRadius: radius,
        gameLevel: this.currentLevel,
        angle: 0,
      }, 0.76);
    }

    for (const body of Composite.allBodies(this.engine.world)) {
      if (body.isGameBall) this.drawBall(context, body, 1);
    }

    context.restore();
  }

  drawBall(context, body, alpha) {
    const level = LEVELS[body.gameLevel];
    const radius = body.circleRadius;
    const { x, y } = body.position;

    context.save();
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.rotate(body.angle || 0);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.clip();

    const gradient = context.createRadialGradient(-radius * 0.28, -radius * 0.35, radius * 0.08, 0, 0, radius);
    gradient.addColorStop(0, lighten(level.color, 0.23));
    gradient.addColorStop(1, level.color);
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);

    const imageState = this.getImage(level.image);
    if (imageState.loaded) {
      drawCoverImage(context, imageState.image, radius);
    } else {
      context.fillStyle = body.gameLevel >= 7 ? '#fff9db' : '#24452f';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `900 ${Math.max(15, Math.round(radius * 0.72))}px system-ui, sans-serif`;
      context.fillText(level.label, 0, 1, radius * 1.4);
    }

    context.beginPath();
    context.arc(0, 0, radius - 1.5, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255,255,255,0.68)';
    context.lineWidth = Math.max(2, radius * 0.055);
    context.stroke();
    context.restore();
  }

  getImage(source) {
    if (this.imageCache.has(source)) return this.imageCache.get(source);

    const state = { image: new Image(), loaded: false, failed: false };
    state.image.addEventListener('load', () => {
      state.loaded = true;
    }, { once: true });
    state.image.addEventListener('error', () => {
      state.failed = true;
    }, { once: true });
    state.image.src = source;
    this.imageCache.set(source, state);
    return state;
  }

  updatePreview() {
    this.paintMiniBall(this.currentPreview, this.currentLevel);
    this.paintMiniBall(this.nextPreview, this.nextLevel);
  }

  paintMiniBall(element, levelIndex) {
    const level = LEVELS[levelIndex];
    element.replaceChildren();
    element.style.setProperty('--ball-color', level.color);

    const label = document.createElement('span');
    label.textContent = level.label;
    element.append(label);

    const image = new Image();
    image.alt = `第 ${level.label} 级`;
    image.addEventListener('load', () => element.append(image), { once: true });
    image.src = level.image;
  }

  playMergeSound(levelIndex) {
    const source = levelIndex === LEVEL_COUNT - 1
      ? WIN_SOUND
      : MERGE_SOUND_POOL[Math.floor(Math.random() * MERGE_SOUND_POOL.length)];
    if (!source || this.failedSounds.has(source)) return;
    if (!this.audioPreferences.enabled || this.audioPreferences.volume <= 0) return;

    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.volume = this.audioPreferences.volume;
    this.activeAudio.add(audio);

    const release = (failed = false) => {
      if (failed) this.failedSounds.add(source);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      this.activeAudio.delete(audio);
    };

    audio.addEventListener('ended', () => release(false), { once: true });
    audio.addEventListener('error', () => release(true), { once: true });
    audio.play().catch(() => release(false));
  }

  wakeAllBalls() {
    for (const body of Composite.allBodies(this.engine.world)) {
      if (!body.isGameBall || !body.isSleeping) continue;
      Body.set(body, 'isSleeping', false);
    }
  }

  stopAllAudio() {
    for (const audio of [...this.activeAudio]) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.activeAudio.clear();
  }

  saveAndRenderAudioPreferences() {
    saveAudioPreferences(this.audioPreferences);
    this.renderAudioPreferences();
  }

  renderAudioPreferences() {
    this.soundToggle.textContent = this.audioPreferences.enabled ? '音效开' : '音效关';
    this.soundToggle.setAttribute('aria-pressed', String(this.audioPreferences.enabled));
    this.volumeInput.disabled = !this.audioPreferences.enabled;
    this.volumeValue.textContent = `${Math.round(this.audioPreferences.volume * 100)}%`;
  }

  finishGame(result) {
    if (this.isFinished) return;
    this.isFinished = true;
    this.canDrop = false;
    window.clearTimeout(this.dropTimer);
    Runner.stop(this.runner);

    const isWin = result === 'win';
    this.root.querySelector('#overlay-kicker').textContent = isWin ? '第 10 级达成' : '奶蛙堆得太高啦';
    this.root.querySelector('#overlay-title').textContent = isWin ? '恭喜通关！' : '游戏结束';
    this.root.querySelector('#overlay-message').textContent = isWin
      ? '你成功合成了标准大笑奶龙。'
      : '球体稳定超过警戒线 1.7 秒，本局结束。';
    this.root.querySelector('#final-score').textContent = String(this.score);
    this.root.querySelector('#result-best').textContent = this.score >= this.bestScore
      ? `历史最高分：${this.bestScore}`
      : `历史最高分：${this.bestScore}`;
    this.overlay.dataset.result = result;
    this.overlay.classList.remove('hidden');
  }

  destroy() {
    window.clearTimeout(this.dropTimer);
    this.resizeObserver?.disconnect();
    this.stopAllAudio();

    if (this.canvasHost) {
      this.canvasHost.removeEventListener('pointermove', this.onPointerMove);
      this.canvasHost.removeEventListener('pointerdown', this.onPointerDown);
      this.canvasHost.removeEventListener('pointerup', this.onPointerUp);
      this.canvasHost.removeEventListener('pointercancel', this.onPointerCancel);
    }

    if (this.render) {
      Render.stop(this.render);
      this.render.canvas.remove();
      this.render.textures = {};
    }
    if (this.runner) Runner.stop(this.runner);
    if (this.engine) {
      Events.off(this.engine);
      Composite.clear(this.engine.world, false);
      Engine.clear(this.engine);
    }
  }
}

function wallOptions() {
  return {
    isStatic: true,
    friction: 0.18,
    render: { visible: false },
  };
}

function drawCoverImage(context, image, radius) {
  const size = radius * 2;
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, -width / 2, -height / 2, width, height);
}

function lighten(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = Math.min(255, (value >> 16) + Math.round(255 * amount));
  const green = Math.min(255, ((value >> 8) & 255) + Math.round(255 * amount));
  const blue = Math.min(255, (value & 255) + Math.round(255 * amount));
  return `rgb(${red}, ${green}, ${blue})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
