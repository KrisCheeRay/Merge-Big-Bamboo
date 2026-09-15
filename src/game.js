import Matter from 'matter-js';
import {
  LEVEL_COUNT,
  ENDLESS_CLEAR_SCORE,
  LEVELS,
  MERGE_SOUND_POOL,
  WIN_SOUND,
  getLevelAppearance,
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

const REFERENCE_STAGE_WIDTH = 520;
const MOBILE_RADIUS_BOOST = 1.1;

export class MergeMilkFrogGame {
  constructor(root, options = {}) {
    this.root = root;
    this.callbacks = options.callbacks || {};
    this.mode = options.mode === 'endless' ? 'endless' : 'classic';
    this.sessionId = options.sessionId || '';
    this.appearanceSelection = options.appearanceSelection;
    this.score = 0;
    this.bestScore = loadBestScore(this.mode);
    this.initialBestScore = this.bestScore;
    this.startedAt = Date.now();
    this.isFinished = false;
    this.canDrop = true;
    this.currentLevel = randomSpawnLevel();
    this.nextLevel = randomSpawnLevel();
    this.aimX = 0;
    this.mergeQueue = [];
    this.mergingBodyIds = new Set();
    this.dangerSince = null;
    this.imageCache = new Map();
    this.animationSheetCache = new Map();
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
    const isEndless = this.mode === 'endless';
    const modeLabel = isEndless ? '无尽模式' : '经典模式';
    const tagline = isEndless
      ? `两个第 10 级会消失并奖励 ${ENDLESS_CLEAR_SCORE} 分，坚持到最后。`
      : '把相同的小竹头碰到一起，合成第 10 级即可通关。';

    this.root.innerHTML = `
      <main class="page-shell">
        <nav class="social-links" aria-label="站外链接">
          <a
            class="social-link github-link"
            href="https://github.com/Arch-Tempered-mortis/merge-big-milk-frog"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在新标签页查看原版 GitHub 源码"
            title="原版 GitHub 源码"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z" />
            </svg>
          </a>
          <a
            class="social-link github-link"
            href="https://github.com/KrisCheeRay"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在新标签页查看修改版 GitHub 主页"
            title="修改版 GitHub 主页"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z" />
            </svg>
          </a>
          <a
            class="social-link bilibili-link"
            href="https://space.bilibili.com/9840636"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在新标签页查看我的哔哩哔哩主页"
            title="我的哔哩哔哩主页"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.2 2.6a1 1 0 0 1 1.4.1L12 5l2.4-2.3a1 1 0 1 1 1.4 1.4L14.9 5H18a3.5 3.5 0 0 1 3.5 3.5v8A3.5 3.5 0 0 1 18 20H6a3.5 3.5 0 0 1-3.5-3.5v-8A3.5 3.5 0 0 1 6 5h3.1l-.9-.9a1 1 0 0 1 0-1.5ZM6 7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6 18h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18 7H6Zm2.5 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm7 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm-6.7 4.2a1 1 0 0 1 1.4 0c1 1 2.6 1 3.6 0a1 1 0 1 1 1.4 1.4 4.6 4.6 0 0 1-6.4 0 1 1 0 0 1 0-1.4Z" />
            </svg>
          </a>
        </nav>
        <section class="game-card" aria-label="合成大竹头游戏">
          <header class="hero-bar">
            <div class="brand-block">
              <p class="eyebrow">${modeLabel} · 十级合成挑战</p>
              <h1>合成大竹头</h1>
              <p class="tagline">${tagline}</p>
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

            <div class="game-actions">
              <button class="soft-button" id="leaderboard-game" type="button">排行榜</button>
              <button class="soft-button" id="back-to-modes" type="button">模式选择</button>
              <button class="soft-button restart-button" id="restart-game" type="button">重新开始</button>
            </div>
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
                <p class="submit-status" id="submit-status" aria-live="polite"></p>
                <div class="result-actions">
                  <button class="soft-button" id="result-leaderboard" type="button">查看排行榜</button>
                  <button class="primary-button" id="play-again" type="button">再玩一次</button>
                </div>
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
    this.submitStatus = this.root.querySelector('#submit-status');
  }

  bindUi() {
    this.onPointerMove = (event) => {
      if (this.isFinished || !this.width) return;

      // Let a vertical touch gesture belong to the page instead of moving the aim.
      if (event.pointerType === 'touch' && this.pointerState) {
        const dx = event.clientX - this.pointerState.startX;
        const dy = event.clientY - this.pointerState.startY;
        if (!this.pointerState.gesture && Math.hypot(dx, dy) > 8) {
          this.pointerState.gesture = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
          if (this.pointerState.gesture === 'horizontal') {
            this.canvasHost.setPointerCapture?.(event.pointerId);
          }
        }
        if (this.pointerState.gesture === 'vertical') return;
        if (this.pointerState.gesture === 'horizontal') event.preventDefault();
      }

      const rect = this.canvasHost.getBoundingClientRect();
      const radius = this.getScaledRadius(this.currentLevel);
      this.aimX = clamp(event.clientX - rect.left, radius + 8, this.width - radius - 8);
    };

    this.onPointerDown = (event) => {
      if (this.isFinished) return;
      if (!event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.pointerState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        gesture: null,
      };
      if (event.pointerType === 'mouse') {
        event.preventDefault();
        this.canvasHost.setPointerCapture?.(event.pointerId);
      }
      this.onPointerMove(event);
    };

    this.onPointerUp = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const state = this.pointerState;
      if (!state || state.pointerId !== event.pointerId) return;
      this.pointerState = null;
      if (this.canvasHost.hasPointerCapture?.(event.pointerId)) {
        this.canvasHost.releasePointerCapture(event.pointerId);
      }
      if (event.pointerType === 'touch' && state.gesture === 'vertical') return;
      event.preventDefault();
      this.onPointerMove(event);
      this.dropBall();
    };

    this.onPointerCancel = (event) => {
      if (this.pointerState?.pointerId !== event.pointerId) return;
      this.pointerState = null;
      if (this.canvasHost.hasPointerCapture?.(event.pointerId)) {
        this.canvasHost.releasePointerCapture(event.pointerId);
      }
    };

    this.canvasHost.addEventListener('pointermove', this.onPointerMove);
    this.canvasHost.addEventListener('pointerdown', this.onPointerDown);
    this.canvasHost.addEventListener('pointerup', this.onPointerUp);
    this.canvasHost.addEventListener('pointercancel', this.onPointerCancel);

    this.root.querySelector('#restart-game').addEventListener('click', this.callbacks.onRestartRequest);
    this.root.querySelector('#play-again').addEventListener('click', this.callbacks.onPlayAgain);
    this.root.querySelector('#back-to-modes').addEventListener('click', this.callbacks.onBackToModes);
    this.root.querySelector('#leaderboard-game').addEventListener('click', () => {
      this.callbacks.onLeaderboardRequest?.(this.mode);
    });
    this.root.querySelector('#result-leaderboard').addEventListener('click', () => {
      this.callbacks.onLeaderboardRequest?.(this.mode);
    });

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
      const radiusScale = this.getRadiusScale(this.width) / this.getRadiusScale(previousWidth);
      for (const body of Composite.allBodies(this.engine.world)) {
        if (!body.isGameBall) continue;
        if (Math.abs(radiusScale - 1) > 0.001) {
          Body.scale(body, radiusScale, radiusScale);
        }
        Body.setPosition(body, {
          x: clamp(body.position.x * scaleX, body.circleRadius, this.width - body.circleRadius),
          y: Math.min(body.position.y * scaleY, this.height - body.circleRadius),
        });
      }
    }

    this.createWalls();
    this.aimX = clamp(this.aimX || this.width / 2, 30, this.width - 30);
  }

  getRadiusScale(width = this.width) {
    const responsiveScale = ((width || REFERENCE_STAGE_WIDTH) / REFERENCE_STAGE_WIDTH) * MOBILE_RADIUS_BOOST;
    return Math.min(1, Math.max(0.6, responsiveScale));
  }

  getScaledRadius(level) {
    return Math.round(getRadius(level) * this.getRadiusScale());
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
    const radius = this.getScaledRadius(level);
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
    const radius = this.getScaledRadius(level);
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
      if (this.mergingBodyIds.has(a.id) || this.mergingBodyIds.has(b.id)) continue;

      const isEndlessClear = this.mode === 'endless' && a.gameLevel === LEVEL_COUNT - 1;
      if (a.gameLevel >= LEVEL_COUNT - 1 && !isEndlessClear) continue;

      this.mergingBodyIds.add(a.id);
      this.mergingBodyIds.add(b.id);
      this.mergeQueue.push({
        a,
        b,
        level: isEndlessClear ? LEVEL_COUNT - 1 : a.gameLevel + 1,
        isEndlessClear,
      });
    }
  }

  processMergeQueue() {
    if (this.isFinished) {
      this.mergeQueue.length = 0;
      this.mergingBodyIds.clear();
      return;
    }

    while (this.mergeQueue.length) {
      const { a, b, level, isEndlessClear } = this.mergeQueue.shift();
      const bodies = Composite.allBodies(this.engine.world);
      if (!bodies.includes(a) || !bodies.includes(b)) continue;

      Composite.remove(this.engine.world, [a, b]);

      if (isEndlessClear) {
        this.score += ENDLESS_CLEAR_SCORE;
        this.updateScore();
        this.playMergeSound(LEVEL_COUNT - 1);
        this.wakeAllBalls();
        continue;
      }

      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      const velocity = {
        x: (a.velocity.x + b.velocity.x) / 2,
        y: (a.velocity.y + b.velocity.y) / 2,
      };
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

      if (level === LEVEL_COUNT - 1 && this.mode === 'classic') {
        this.finishGame('win');
        break;
      }
    }

    this.mergingBodyIds.clear();
  }

  updateScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.mode, this.bestScore);
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
      const radius = this.getScaledRadius(this.currentLevel);
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
    const appearance = getLevelAppearance(body.gameLevel, this.appearanceSelection);
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

    let drewAppearance = false;
    if (appearance.animation) {
      const animationState = this.getImage(appearance.animation.sheet, this.animationSheetCache);
      if (animationState.loaded) {
        drawAnimationFrame(context, animationState.image, appearance.animation, radius, performance.now());
        drewAppearance = true;
      }
    } else {
      const imageState = this.getImage(appearance.image);
      if (imageState.loaded) {
        drawCoverImage(context, imageState.image, radius);
        drewAppearance = true;
      }
    }

    if (!drewAppearance && appearance.id === 'variant') {
      const originalState = this.getImage(level.appearances.original.image);
      if (originalState.loaded) {
        drawCoverImage(context, originalState.image, radius);
        drewAppearance = true;
      }
    }

    if (!drewAppearance) {
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

  getImage(source, cache = this.imageCache) {
    if (cache.has(source)) return cache.get(source);

    const state = { image: new Image(), loaded: false, failed: false };
    state.image.addEventListener('load', () => {
      state.loaded = true;
    }, { once: true });
    state.image.addEventListener('error', () => {
      state.failed = true;
    }, { once: true });
    state.image.src = source;
    cache.set(source, state);
    return state;
  }

  updatePreview() {
    this.paintMiniBall(this.currentPreview, this.currentLevel);
    this.paintMiniBall(this.nextPreview, this.nextLevel);
  }

  paintMiniBall(element, levelIndex) {
    const level = LEVELS[levelIndex];
    const appearance = getLevelAppearance(levelIndex, this.appearanceSelection);
    element.replaceChildren();
    element.style.setProperty('--ball-color', level.color);

    const label = document.createElement('span');
    label.textContent = level.label;
    element.append(label);

    const image = new Image();
    let fallbackAttempted = false;
    image.alt = `第 ${level.label} 级 · ${appearance.name}`;
    image.addEventListener('load', () => element.append(image), { once: true });
    image.addEventListener('error', () => {
      if (appearance.id === 'variant' && !fallbackAttempted) {
        fallbackAttempted = true;
        image.src = level.appearances.original.image;
      }
    });
    image.src = appearance.preview;
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
    const isNewBest = this.score > this.initialBestScore;
    this.root.querySelector('#overlay-kicker').textContent = isWin
      ? '第 10 级达成'
      : this.mode === 'endless' ? '无尽挑战结束' : '竹头堆得太高啦';
    this.root.querySelector('#overlay-title').textContent = isWin ? '恭喜通关！' : '游戏结束';
    this.root.querySelector('#overlay-message').textContent = isWin
      ? '你成功合成了标准大竹头。'
      : '球体稳定超过警戒线 1.7 秒，本局结束。';
    this.root.querySelector('#final-score').textContent = String(this.score);
    this.root.querySelector('#result-best').textContent = isNewBest
      ? `新纪录！本模式历史最高分：${this.bestScore}`
      : `本模式历史最高分：${this.bestScore}`;
    this.submitStatus.textContent = '正在提交排行榜成绩…';
    this.overlay.dataset.result = result;
    this.overlay.classList.remove('hidden');

    this.callbacks.onFinish?.({
      mode: this.mode,
      score: this.score,
      result,
      sessionId: this.sessionId,
      durationMs: Math.max(0, Date.now() - this.startedAt),
    });
  }

  setSubmitStatus(message, state = '') {
    if (!this.submitStatus) return;
    this.submitStatus.textContent = message;
    this.submitStatus.dataset.state = state;
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
      Events.off(this.render);
      Render.stop(this.render);
      this.render.canvas.remove();
      this.render.textures = {};
    }
    this.imageCache.clear();
    this.animationSheetCache.clear();
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
  drawCoverImageRegion(
    context,
    image,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
    radius
  );
}

function drawAnimationFrame(context, sheet, animation, radius, now) {
  const duration = Math.max(1, animation.durationMs);
  const progress = (now % duration) / duration;
  const frameIndex = Math.min(
    animation.frameCount - 1,
    Math.floor(progress * animation.frameCount)
  );
  const sourceX = (frameIndex % animation.columns) * animation.frameWidth;
  const sourceY = Math.floor(frameIndex / animation.columns) * animation.frameHeight;
  drawCoverImageRegion(
    context,
    sheet,
    sourceX,
    sourceY,
    animation.frameWidth,
    animation.frameHeight,
    radius
  );
}

function drawCoverImageRegion(context, image, sourceX, sourceY, sourceWidth, sourceHeight, radius) {
  const size = radius * 2;
  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -width / 2,
    -height / 2,
    width,
    height
  );
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
