import {
  ENDLESS_CLEAR_SCORE,
  LEVEL_COUNT,
  LEVELS,
  loadBestScore,
  mergeScore,
  randomSpawnLevel,
  saveBestScore,
} from './config.js';
import { createFruitTexture } from './game.js';

const WORLD_WIDTH = 520;
const WORLD_HEIGHT = 780;
const DANGER_Y = 164;
const PIPETTE_TIP_Y = 88;
const GRAVITY = 1500;
const SUBSTEPS = 7;
const COLLISION_MARGIN = 1.25;
const FIXED_STEP = 1 / 60;
const MAX_FRAME_STEP = 1 / 20;

const MATERIALS = [
  { rho: 1.08, stiff: 0.16, ten: 0.30, plastic: 0.05, damp: 0.10, fr: 0.30 },
  { rho: 1.05, stiff: 0.13, ten: 0.30, plastic: 0.08, damp: 0.11, fr: 0.34 },
  { rho: 1.03, stiff: 0.10, ten: 0.32, plastic: 0.12, damp: 0.12, fr: 0.30 },
  { rho: 1.02, stiff: 0.085, ten: 0.30, plastic: 0.16, damp: 0.13, fr: 0.32 },
  { rho: 1.00, stiff: 0.075, ten: 0.28, plastic: 0.18, damp: 0.14, fr: 0.36 },
  { rho: 0.98, stiff: 0.07, ten: 0.26, plastic: 0.20, damp: 0.15, fr: 0.40 },
  { rho: 0.96, stiff: 0.06, ten: 0.24, plastic: 0.24, damp: 0.16, fr: 0.42 },
  { rho: 0.95, stiff: 0.055, ten: 0.22, plastic: 0.26, damp: 0.17, fr: 0.42 },
  { rho: 0.94, stiff: 0.05, ten: 0.20, plastic: 0.28, damp: 0.18, fr: 0.44 },
  { rho: 0.92, stiff: 0.045, ten: 0.18, plastic: 0.30, damp: 0.19, fr: 0.46 },
];

class Blob {
  constructor(level, cx, cy, id, options = {}) {
    this.id = id;
    this.level = level;
    this.info = LEVELS[level];
    this.material = MATERIALS[level];
    this.rest = this.info.radius;
    this.radius = this.rest * (options.scale ?? 1);
    this.N = Math.max(14, Math.min(40, Math.round(Math.PI * 2 * this.rest / 14)));
    this.x = new Float64Array(this.N);
    this.y = new Float64Array(this.N);
    this.px = new Float64Array(this.N);
    this.py = new Float64Array(this.N);
    this.vx = new Float64Array(this.N);
    this.vy = new Float64Array(this.N);
    this.qx = new Float64Array(this.N);
    this.qy = new Float64Array(this.N);
    this.ox = new Float64Array(this.N);
    this.oy = new Float64Array(this.N);
    this.tx = new Float64Array(this.N);
    this.ty = new Float64Array(this.N);
    for (let index = 0; index < this.N; index += 1) {
      const angle = index / this.N * Math.PI * 2 - Math.PI / 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      this.ox[index] = cosine * this.rest;
      this.oy[index] = sine * this.rest;
      this.qx[index] = this.ox[index];
      this.qy[index] = this.oy[index];
      this.x[index] = cx + cosine * this.radius;
      this.y[index] = cy + sine * this.radius;
    }
    const mass = this.material.rho * Math.PI * this.rest * this.rest / 100;
    this.w = this.N / mass;
    this.cx = cx;
    this.cy = cy;
    this.vcx = 0;
    this.vcy = 0;
    this.ang = 0;
    this.A = [1, 0, 0, 1];
    this.area = Math.PI * this.radius * this.radius;
    this.minX = cx - this.radius;
    this.maxX = cx + this.radius;
    this.minY = cy - this.radius;
    this.maxY = cy + this.radius;
    this.br = this.radius;
    this.held = Boolean(options.held);
    this.pin = options.pin || null;
    this.born = options.time ?? 0;
    this.dropT = -99;
    this.dangerT = 0;
    this.squash = 0;
    this.mood = 0;
    this.blink = randomRange(1, 4);
    this.lookX = 0;
    this.lookY = 0;
    this.hitT = 0;
    this.growFrom = options.scale ?? 1;
    this.growT = options.growT ?? (this.growFrom < 1 ? 0 : 1);
    this.growDur = options.growDur ?? 0.3;
    this.flash = options.flash ?? 0;
    this.updateBounds();
  }

  targetRadius() {
    if (this.growT >= 1) return this.rest;
    return this.rest * lerp(this.growFrom, 1, easeOutBack(this.growT));
  }

  updateBounds() {
    let sumX = 0;
    let sumY = 0;
    let area = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0, previous = this.N - 1; index < this.N; previous = index, index += 1) {
      const x = this.x[index];
      const y = this.y[index];
      sumX += x;
      sumY += y;
      area += this.x[previous] * y - x * this.y[previous];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    this.cx = sumX / this.N;
    this.cy = sumY / this.N;
    this.area = area * 0.5;
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
    let boundRadius = 0;
    for (let index = 0; index < this.N; index += 1) {
      const dx = this.x[index] - this.cx;
      const dy = this.y[index] - this.cy;
      boundRadius = Math.max(boundRadius, dx * dx + dy * dy);
    }
    this.br = Math.sqrt(boundRadius);
  }

  fit() {
    let sine = 0;
    let cosine = 0;
    let a00 = 0;
    let a01 = 0;
    let a10 = 0;
    let a11 = 0;
    let q00 = 0;
    let q01 = 0;
    let q11 = 0;
    for (let index = 0; index < this.N; index += 1) {
      const px = this.x[index] - this.cx;
      const py = this.y[index] - this.cy;
      const ox = this.ox[index];
      const oy = this.oy[index];
      sine += this.qx[index] * py - this.qy[index] * px;
      cosine += this.qx[index] * px + this.qy[index] * py;
      a00 += px * ox;
      a01 += px * oy;
      a10 += py * ox;
      a11 += py * oy;
      q00 += ox * ox;
      q01 += ox * oy;
      q11 += oy * oy;
    }
    this.ang = Math.atan2(sine, cosine);
    const determinant = q00 * q11 - q01 * q01 || 1;
    const inverse00 = q11 / determinant;
    const inverse01 = -q01 / determinant;
    const inverse11 = q00 / determinant;
    this.A = [
      a00 * inverse00 + a01 * inverse01,
      a00 * inverse01 + a01 * inverse11,
      a10 * inverse00 + a11 * inverse01,
      a10 * inverse01 + a11 * inverse11,
    ];
    const [m00, m01, m10, m11] = this.A;
    const trace = m00 * m00 + m01 * m01 + m10 * m10 + m11 * m11;
    const absoluteDeterminant = Math.abs(m00 * m11 - m01 * m10);
    const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * absoluteDeterminant * absoluteDeterminant));
    const largestStretch = Math.sqrt(Math.max(1e-6, (trace + discriminant) * 0.5));
    const smallestStretch = Math.sqrt(Math.max(1e-6, (trace - discriminant) * 0.5));
    this.squash = 1 - smallestStretch / largestStretch;
  }
}

export class SoftBambooGame {
  constructor(root, options = {}) {
    this.root = root;
    this.mode = options.mode === 'endless' ? 'endless' : 'classic';
    this.callbacks = options.callbacks || {};
    this.score = 0;
    this.mergeCount = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.juiceTotal = 0;
    this.bestScore = loadBestScore(this.mode);
    this.initialBestScore = this.bestScore;
    this.highestLevel = 0;
    this.currentLevel = randomSpawnLevel();
    this.nextLevel = randomSpawnLevel(this.highestLevel);
    this.blobs = [];
    this.contacts = [];
    this.bridges = [];
    this.images = new Map();
    this.previewImages = new Map();
    this.juiceParticles = [];
    this.sparkParticles = [];
    this.effectRings = [];
    this.floatingTexts = [];
    this.cameraShake = 0;
    this.nextId = 1;
    this.worldTime = 0;
    this.aimX = WORLD_WIDTH / 2;
    this.held = null;
    this.cooldown = 0;
    this.squeeze = 0;
    this.isFinished = false;
    this.dangerDuration = 0;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.abortController = new AbortController();
  }

  start() {
    this.renderShell();
    this.cacheElements();
    this.bindUi();
    this.preloadImages();
    this.updateScore();
    this.updateStats();
    this.updatePreview();
    this.resizeCanvas();
    this.spawnHeld();
    this.lastFrame = performance.now();
    this.animationFrame = requestAnimationFrame((time) => this.frame(time));
  }

  renderShell() {
    const endless = this.mode === 'endless';
    this.root.innerHTML = `
      <main class="page-shell game-page soft-game-page">
        <nav class="social-links" aria-label="页面导航">
          <a class="social-link home-link" href="../" aria-label="返回主页" title="返回主页">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10.5 9-7.5 9 7.5"/><path d="M5 9v12h14V9"/><path d="M9 21v-6h6v6"/></svg>
          </a>
          <a class="social-link github-link" href="https://github.com/sb6657-cn/sb6657/blob/master/public/games/%E6%B5%81%E5%BF%83%E8%A5%BF%E7%93%9C.html" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看流心西瓜原始源码" title="流心西瓜原始源码">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z"/></svg>
          </a>
          <a class="social-link github-link" href="https://github.com/KrisCheeRay" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看修改者 GitHub 主页" title="修改者 GitHub 主页">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z"/></svg>
          </a>
        </nav>
        <section class="game-card" aria-label="流心西瓜游戏">
          <header class="hero-bar">
            <div class="brand-block">
              <p class="eyebrow">${endless ? '无尽模式' : '经典模式'} · 软体合成挑战</p>
              <h1>流心西瓜</h1>
              <p class="tagline">${endless ? `两个西瓜会消失并奖励 ${ENDLESS_CLEAR_SCORE} 分。` : '让相同的流心水果碰在一起，合成最终的西瓜即可通关。'}</p>
            </div>
            <div class="score-board" aria-label="分数信息">
              <div class="score-item"><span>本局分数</span><strong id="score-value">0</strong></div>
              <div class="score-item best"><span>历史最高</span><strong id="best-score-value">0</strong></div>
            </div>
          </header>
          <div class="control-bar soft-control-bar">
            <div class="preview-group" aria-label="水果预览">
              <div class="preview-item"><span>当前</span><div class="mini-ball" id="current-preview"></div></div>
              <div class="preview-arrow" aria-hidden="true">→</div>
              <div class="preview-item"><span>下一个</span><div class="mini-ball" id="next-preview"></div></div>
            </div>
            <div class="game-actions">
              <button class="soft-button" id="back-to-modes" type="button">模式选择</button>
              <button class="soft-button restart-button" id="restart-game" type="button">重新开始</button>
            </div>
          </div>
          <div class="soft-stats" aria-label="本局统计">
            <div><span>融合</span><strong id="merge-count">0</strong></div>
            <div><span>最大连击</span><strong id="max-combo">0</strong></div>
            <div><span>果汁 mL</span><strong id="juice-total">0</strong></div>
          </div>
          <div class="game-stage soft-stage" id="canvas-host">
            <canvas id="game-canvas" aria-label="流心西瓜游戏区域"></canvas>
            <div class="danger-label">警戒线</div>
            <div class="game-tip">移动鼠标或手指选择位置，松开即可投放</div>
            <div class="game-overlay hidden" id="game-overlay">
              <div class="overlay-panel">
                <p class="overlay-kicker" id="overlay-kicker"></p>
                <h2 id="overlay-title"></h2>
                <p class="overlay-message" id="overlay-message"></p>
                <div class="result-score"><span>本局得分</span><strong id="final-score">0</strong></div>
                <p class="result-best" id="result-best"></p>
                <div class="result-actions">
                  <button class="primary-button" id="play-again" type="button">再玩一次</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>`;
  }

  cacheElements() {
    this.host = this.root.querySelector('#canvas-host');
    this.canvas = this.root.querySelector('#game-canvas');
    this.context = this.canvas.getContext('2d');
    this.scoreElement = this.root.querySelector('#score-value');
    this.bestScoreElement = this.root.querySelector('#best-score-value');
    this.mergeCountElement = this.root.querySelector('#merge-count');
    this.maxComboElement = this.root.querySelector('#max-combo');
    this.juiceTotalElement = this.root.querySelector('#juice-total');
    this.currentPreview = this.root.querySelector('#current-preview');
    this.nextPreview = this.root.querySelector('#next-preview');
    this.overlay = this.root.querySelector('#game-overlay');
  }

  bindUi() {
    const signal = this.abortController.signal;
    const point = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * WORLD_WIDTH / rect.width,
        y: (event.clientY - rect.top) * WORLD_HEIGHT / rect.height,
      };
    };
    const updateAim = (x) => {
      const radius = this.held?.rest ?? LEVELS[this.currentLevel].radius;
      this.aimX = clamp(x, radius + 4, WORLD_WIDTH - radius - 4);
    };

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || this.isFinished || (event.pointerType === 'mouse' && event.button !== 0)) return;
      this.pointer = { id: event.pointerId, start: point(event), gesture: '' };
      updateAim(this.pointer.start.x);
      this.canvas.setPointerCapture?.(event.pointerId);
    }, { signal });

    this.canvas.addEventListener('pointermove', (event) => {
      if (this.isFinished) return;
      const current = point(event);
      if (this.pointer?.id === event.pointerId && event.pointerType === 'touch') {
        const dx = current.x - this.pointer.start.x;
        const dy = current.y - this.pointer.start.y;
        if (!this.pointer.gesture && Math.hypot(dx, dy) > 8) this.pointer.gesture = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
        if (this.pointer.gesture === 'vertical') return;
        event.preventDefault();
      }
      if (event.pointerType === 'mouse' || this.pointer?.id === event.pointerId) updateAim(current.x);
    }, { signal });

    this.canvas.addEventListener('pointerup', (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const gesture = this.pointer.gesture;
      this.pointer = null;
      if (gesture === 'vertical') return;
      event.preventDefault();
      updateAim(point(event).x);
      this.drop();
    }, { signal });

    this.canvas.addEventListener('pointercancel', () => { this.pointer = null; }, { signal });
    this.root.querySelector('#restart-game').addEventListener('click', this.callbacks.onRestartRequest, { signal });
    this.root.querySelector('#play-again').addEventListener('click', this.callbacks.onPlayAgain, { signal });
    this.root.querySelector('#back-to-modes').addEventListener('click', this.callbacks.onBackToModes, { signal });
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.host);
  }

  preloadImages() {
    for (const level of LEVELS) {
      this.images.set(level.index, createFruitTexture(level, { includeFace: false, includeShade: false }));
      this.previewImages.set(level.index, createFruitTexture(level));
    }
  }

  resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(WORLD_WIDTH * ratio);
    this.canvas.height = Math.round(WORLD_HEIGHT * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  createBlob(x, y, level, options = {}) {
    return new Blob(level, x, y, this.nextId++, { ...options, time: this.worldTime });
  }

  spawnHeld() {
    if (this.isFinished || this.held) return;
    const radius = LEVELS[this.currentLevel].radius;
    this.aimX = clamp(this.aimX, radius + 4, WORLD_WIDTH - radius - 4);
    const blob = this.createBlob(this.aimX, PIPETTE_TIP_Y + radius * 0.42, this.currentLevel, {
      scale: 0.3,
      growDur: 0.32,
      held: true,
      pin: { idx: 0, x: this.aimX, y: PIPETTE_TIP_Y },
    });
    this.blobs.push(blob);
    this.held = blob;
  }

  drop() {
    if (!this.held || this.cooldown > 0 || this.isFinished || this.held.growT < 0.55) return;
    const blob = this.held;
    blob.held = false;
    blob.pin = null;
    blob.dropT = this.worldTime;
    for (let index = 0; index < blob.N; index += 1) blob.vy[index] += 80;
    this.held = null;
    this.currentLevel = this.nextLevel;
    this.nextLevel = randomSpawnLevel(this.highestLevel);
    this.updatePreview();
    this.cooldown = 0.44;
    this.squeeze = 1;
  }

  frame(time) {
    if (!this.root.isConnected) return;
    const elapsed = Math.min(MAX_FRAME_STEP, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    if (!this.isFinished) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 4) {
        this.simulate(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
    }
    this.updateEffects(elapsed);
    this.squeeze = Math.max(0, this.squeeze - elapsed * 3.5);
    this.draw();
    this.animationFrame = requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  simulate(dt) {
    this.worldTime += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.spawnHeld();
    } else if (!this.held) {
      this.spawnHeld();
    }
    if (this.held?.pin) {
      this.held.pin.x = this.aimX;
      this.held.pin.y = PIPETTE_TIP_Y;
    }

    for (const blob of this.blobs) {
      if (blob.growT < 1) blob.growT = Math.min(1, blob.growT + dt / blob.growDur);
      blob.radius = blob.targetRadius();
      blob.updateBounds();
    }

    const pairs = [];
    const sorted = [...this.blobs].sort((a, b) => a.minX - b.minX);
    for (let first = 0; first < sorted.length; first += 1) {
      const a = sorted[first];
      for (let second = first + 1; second < sorted.length; second += 1) {
        const b = sorted[second];
        if (b.minX > a.maxX + 14) break;
        if (a.minY > b.maxY + 14 || b.minY > a.maxY + 14) continue;
        pairs.push({ a, b, hits: 0, impact: 0 });
      }
    }

    this.applyCohesion(dt);
    const substep = dt / SUBSTEPS;
    for (let step = 0; step < SUBSTEPS; step += 1) {
      for (const blob of this.blobs) integrate(blob, substep);
      for (const blob of this.blobs) {
        if (blob.pin) applyPin(blob);
        solveInternal(blob);
      }
      if (pairs.length) for (const blob of this.blobs) blob.updateBounds();
      for (const pair of pairs) {
        pair.hits += collidePolygon(pair.a, pair.b, pair);
        pair.hits += collidePolygon(pair.b, pair.a, pair);
      }
      for (const blob of this.blobs) {
        solveWalls(blob);
        if (blob.pin) applyPin(blob);
      }
      const inverseStep = 1 / substep;
      for (const blob of this.blobs) {
        for (let index = 0; index < blob.N; index += 1) {
          blob.vx[index] = (blob.x[index] - blob.px[index]) * inverseStep;
          blob.vy[index] = (blob.y[index] - blob.py[index]) * inverseStep;
        }
      }
    }

    for (const blob of this.blobs) {
      blob.updateBounds();
      viscousDamp(blob, dt);
      blob.fit();
      plasticFlow(blob, dt);
    }
    this.contacts = pairs.filter((pair) => pair.hits > 0);
    const impactStep = dt / SUBSTEPS;
    for (const contact of this.contacts) {
      if (contact.impact / impactStep > 620) {
        contact.a.hitT = 0.3;
        contact.b.hitT = 0.3;
      }
    }
    this.handleMerges();
    this.bridges = this.bridges.filter(({ a, b }) => this.blobs.includes(a) && this.blobs.includes(b));
    this.checkDanger(dt);
    this.updateExpressions(dt);
  }

  updateExpressions(dt) {
    const lookTargetX = this.held ? this.aimX : WORLD_WIDTH * 0.5;
    for (const blob of this.blobs) {
      blob.blink -= dt;
      if (blob.blink < -0.12) blob.blink = randomRange(2, 5.5);
      blob.mood = Math.max(0, blob.mood - dt);
      blob.hitT = Math.max(0, blob.hitT - dt);
      blob.lookX = lerp(blob.lookX, (lookTargetX - blob.cx) / 120, dt * 4);
      blob.lookY = lerp(blob.lookY, (PIPETTE_TIP_Y - blob.cy) / 300, dt * 4);
    }
  }

  applyCohesion(dt) {
    this.bridges = [];
    for (let first = 0; first < this.blobs.length; first += 1) {
      const a = this.blobs[first];
      if (a.held) continue;
      for (let second = first + 1; second < this.blobs.length; second += 1) {
        const b = this.blobs[second];
        if (b.held || b.level !== a.level) continue;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const distance = Math.hypot(dx, dy) || 1;
        const radiusA = Math.sqrt(Math.abs(a.area) / Math.PI);
        const radiusB = Math.sqrt(Math.abs(b.area) / Math.PI);
        const gap = distance - radiusA - radiusB;
        const range = a.rest * 0.55;
        if (gap > range || isBridgeBlocked(a, b, this.blobs)) continue;
        const close = clamp(1 - gap / range, 0, 1);
        const strength = 900 * close * close * dt;
        pullParticles(a, dx / distance, dy / distance, strength);
        pullParticles(b, -dx / distance, -dy / distance, strength);
        this.bridges.push({ a, b, close });
      }
    }
  }

  handleMerges() {
    const claimed = new Set();
    const merges = [];
    for (const contact of this.contacts) {
      const { a, b } = contact;
      if (a.held || b.held || a.level !== b.level || claimed.has(a.id) || claimed.has(b.id)) continue;
      if (this.worldTime - Math.max(a.born, a.dropT) < 0.12 || this.worldTime - Math.max(b.born, b.dropT) < 0.12) continue;
      if (a.level === LEVEL_COUNT - 1 && this.mode !== 'endless') continue;
      claimed.add(a.id);
      claimed.add(b.id);
      merges.push([a, b]);
    }
    for (const [a, b] of merges) this.merge(a, b);
  }

  merge(a, b) {
    if (!this.blobs.includes(a) || !this.blobs.includes(b)) return;
    this.blobs = this.blobs.filter((blob) => blob !== a && blob !== b);
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 1.5;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.mergeCount += 1;
    const massA = a.material.rho * Math.abs(a.area);
    const massB = b.material.rho * Math.abs(b.area);
    const totalMass = massA + massB || 1;
    const x = (a.cx * massA + b.cx * massB) / totalMass;
    const y = (a.cy * massA + b.cy * massB) / totalMass;
    if (a.level === LEVEL_COUNT - 1) {
      this.spawnJuiceBurst(x, y, a.level, 140, 900);
      this.spawnSparks(x, y, a.level, 60, 700);
      this.spawnRing(x, y, a.rest * 1.5, a.level);
      this.spawnRing(x, y, a.rest, a.level, [255, 240, 200]);
      this.spawnText(x, y - a.rest * 0.5, `+${ENDLESS_CLEAR_SCORE}`, true);
      if (this.combo > 1) this.spawnText(x, y - a.rest - 18, `连击 ×${this.combo}`, false, [255, 181, 71]);
      this.cameraShake = Math.max(this.cameraShake, 22);
      this.score += ENDLESS_CLEAR_SCORE;
      this.updateScore();
      this.updateStats();
      return;
    }
    const level = a.level + 1;
    this.highestLevel = Math.max(this.highestLevel, level);
    const currentRadius = Math.sqrt((Math.abs(a.area) + Math.abs(b.area)) / Math.PI);
    const merged = this.createBlob(x, y, level, { scale: currentRadius / LEVELS[level].radius, growT: 0, growDur: 0.38, flash: 1 });
    merged.mood = 1.4;
    const velocityX = (a.vcx * massA + b.vcx * massB) / totalMass;
    const velocityY = (a.vcy * massA + b.vcy * massB) / totalMass;
    for (let index = 0; index < merged.N; index += 1) {
      const angle = index / merged.N * Math.PI * 2 - Math.PI / 2;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      let distance = Math.max(rayPolygon(a, x, y, directionX, directionY), rayPolygon(b, x, y, directionX, directionY));
      if (distance < 0) distance = currentRadius * 0.6;
      distance = Math.max(distance, currentRadius * 0.45);
      merged.x[index] = x + directionX * distance;
      merged.y[index] = y + directionY * distance;
      merged.vx[index] = velocityX + directionX * 40;
      merged.vy[index] = velocityY + directionY * 40;
    }
    merged.updateBounds();
    merged.fit();
    merged.dropT = this.worldTime;
    this.blobs.push(merged);
    const multiplier = 1 + (this.combo - 1) * 0.5;
    const points = Math.round(mergeScore(level) * multiplier);
    this.spawnJuiceBurst(x, y, a.level, 10 + a.level * 3, 260 + a.level * 35);
    this.spawnSparks(x, y, level, 10 + a.level * 2, 300 + a.level * 25);
    this.spawnRing(x, y, merged.rest * 0.9, level);
    this.spawnText(x, y - merged.rest * 0.6, `+${points}`, this.combo > 1);
    if (this.combo > 1) this.spawnText(x, y - merged.rest - 18, `连击 ×${this.combo}`, false, [255, 181, 71]);
    this.cameraShake = Math.max(this.cameraShake, 2 + level * 1.2);
    this.score += points;
    this.updateScore();
    this.updateStats();
    if (level === LEVEL_COUNT - 1 && this.mode === 'classic') this.finish(true);
  }

  spawnJuiceBurst(x, y, level, count, speed) {
    const color = hexRgb(LEVELS[level].color);
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + randomRange(-1.3, 1.3);
      const velocity = speed * randomRange(0.35, 1);
      if (this.juiceParticles.length >= 520) this.juiceParticles.shift();
      this.juiceParticles.push({
        x: x + randomRange(-9, 9),
        y: y + randomRange(-9, 9),
        px: x,
        py: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color,
        size: randomRange(2.2, 4.6),
        age: 0,
        life: randomRange(5, 9),
      });
    }
    this.juiceTotal += count * 0.8;
  }

  spawnSparks(x, y, level, count, speed) {
    const source = hexRgb(LEVELS[level].color);
    const target = hexRgb(LEVELS[Math.min(level + 1, LEVEL_COUNT - 1)].color);
    const color = mixRgb(source, target, 0.5);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * randomRange(0.3, 1);
      this.sparkParticles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - speed * 0.3,
        color,
        size: randomRange(1.5, 4),
        star: Math.random() < 0.35,
        age: 0,
        life: randomRange(0.4, 0.9),
      });
    }
  }

  spawnRing(x, y, radius, level, color = null) {
    this.effectRings.push({ x, y, radius, color: color || hexRgb(LEVELS[level].color), age: 0, life: 0.55 });
  }

  spawnText(x, y, text, big = false, color = null) {
    this.floatingTexts.push({ x, y, text, big, color, age: 0, life: 1.1 });
  }

  updateEffects(dt) {
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;
    this.cameraShake *= Math.pow(0.02, dt);
    this.stepJuice(dt);
    for (const particle of this.sparkParticles) {
      particle.age += dt;
      particle.vy += 900 * dt;
      particle.vx *= Math.pow(0.985, dt * 60);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    this.sparkParticles = this.sparkParticles.filter((particle) => particle.age < particle.life);
    for (const ring of this.effectRings) ring.age += dt;
    this.effectRings = this.effectRings.filter((ring) => ring.age < ring.life);
    for (const text of this.floatingTexts) {
      text.age += dt;
      text.y -= 38 * dt * (1 - text.age / text.life);
    }
    this.floatingTexts = this.floatingTexts.filter((text) => text.age < text.life);
  }

  stepJuice(dt) {
    const particles = this.juiceParticles;
    if (!particles.length) return;
    const substeps = 2;
    const step = dt / substeps;
    const interactionRadius = 11;
    const interactionRadiusSquared = interactionRadius * interactionRadius;
    for (let substep = 0; substep < substeps; substep += 1) {
      for (const particle of particles) {
        particle.vy += GRAVITY * 0.8 * step;
        particle.px = particle.x;
        particle.py = particle.y;
        particle.x += particle.vx * step;
        particle.y += particle.vy * step;
        particle.ax = 0;
        particle.ay = 0;
      }
      const grid = new Map();
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const key = Math.trunc(particle.x / interactionRadius) * 1000 + Math.trunc((particle.y + 400) / interactionRadius);
        const cell = grid.get(key) || [];
        cell.push(index);
        grid.set(key, cell);
      }
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const gridX = Math.trunc(particle.x / interactionRadius);
        const gridY = Math.trunc((particle.y + 400) / interactionRadius);
        let density = 0;
        let nearDensity = 0;
        const neighbors = [];
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            const cell = grid.get((gridX + offsetX) * 1000 + gridY + offsetY);
            if (!cell) continue;
            for (const otherIndex of cell) {
              if (otherIndex === index) continue;
              const other = particles[otherIndex];
              const dx = other.x - particle.x;
              const dy = other.y - particle.y;
              const distanceSquared = dx * dx + dy * dy;
              if (distanceSquared >= interactionRadiusSquared) continue;
              const distance = Math.sqrt(distanceSquared) || 1e-3;
              const amount = 1 - distance / interactionRadius;
              density += amount * amount;
              nearDensity += amount * amount * amount;
              neighbors.push(otherIndex, distance, dx, dy);
            }
          }
        }
        const pressure = 0.05 * (density - 2.4);
        const nearPressure = 0.12 * nearDensity;
        for (let neighbor = 0; neighbor < neighbors.length; neighbor += 4) {
          const other = particles[neighbors[neighbor]];
          const distance = neighbors[neighbor + 1];
          const amount = 1 - distance / interactionRadius;
          const displacement = (pressure * amount + nearPressure * amount * amount) * 0.5 * interactionRadius;
          const normalX = neighbors[neighbor + 2] / distance;
          const normalY = neighbors[neighbor + 3] / distance;
          other.ax += normalX * displacement;
          other.ay += normalY * displacement;
          particle.ax -= normalX * displacement;
          particle.ay -= normalY * displacement;
        }
      }
      for (const particle of particles) {
        const displacement = Math.hypot(particle.ax, particle.ay);
        const limit = displacement > 0.9 ? 0.9 / displacement : 1;
        particle.x += particle.ax * limit;
        particle.y += particle.ay * limit;
        for (const blob of this.blobs) {
          if (particle.x < blob.minX - 3 || particle.x > blob.maxX + 3 || particle.y < blob.minY - 3 || particle.y > blob.maxY + 3) continue;
          pushJuiceOut(particle, blob);
        }
        particle.x = clamp(particle.x, 2, WORLD_WIDTH - 2);
        if (particle.y > WORLD_HEIGHT - 2) {
          particle.y = WORLD_HEIGHT - 2;
          particle.x -= (particle.x - particle.px) * 0.3;
        }
        particle.vx = (particle.x - particle.px) / step;
        particle.vy = (particle.y - particle.py) / step;
        const speedSquared = particle.vx * particle.vx + particle.vy * particle.vy;
        if (speedSquared > 490000) {
          const speedLimit = 700 / Math.sqrt(speedSquared);
          particle.vx *= speedLimit;
          particle.vy *= speedLimit;
        }
      }
    }
    for (const particle of particles) {
      particle.age += dt;
      particle.vx *= Math.pow(0.995, dt * 60);
    }
    this.juiceParticles = particles.filter((particle) => particle.age < particle.life);
  }

  checkDanger(dt) {
    let maximum = 0;
    for (const blob of this.blobs) {
      if (blob.held) continue;
      const settled = this.worldTime - Math.max(blob.born, blob.dropT) > 1.15;
      if (settled && blob.minY < DANGER_Y && Math.abs(blob.vcy) < 180) blob.dangerT += dt;
      else blob.dangerT = Math.max(0, blob.dangerT - dt * 2);
      maximum = Math.max(maximum, blob.dangerT);
    }
    this.dangerDuration = maximum;
    if (maximum > 3) this.finish(false);
  }

  updateScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.mode, this.bestScore);
    }
    this.scoreElement.textContent = String(this.score);
    this.bestScoreElement.textContent = String(this.bestScore);
    this.scoreElement.classList.remove('bump');
    void this.scoreElement.offsetWidth;
    this.scoreElement.classList.add('bump');
  }

  updateStats() {
    this.mergeCountElement.textContent = String(this.mergeCount);
    this.maxComboElement.textContent = String(this.maxCombo);
    this.juiceTotalElement.textContent = String(Math.round(this.juiceTotal));
  }

  updatePreview() {
    this.renderPreview(this.currentPreview, this.currentLevel);
    this.renderPreview(this.nextPreview, this.nextLevel);
  }

  renderPreview(container, levelIndex) {
    const level = LEVELS[levelIndex];
    container.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `第 ${levelIndex + 1} 级 ${level.name}`);
    const context = canvas.getContext('2d');
    const previewRadius = 30;
    const centerX = 48;
    const centerY = 55;
    context.save();
    context.beginPath();
    context.arc(centerX, centerY, previewRadius, 0, Math.PI * 2);
    context.clip();
    context.drawImage(this.previewImages.get(levelIndex), centerX - previewRadius, centerY - previewRadius, previewRadius * 2, previewRadius * 2);
    context.restore();
    context.save();
    context.translate(centerX, centerY);
    drawFruitStem(context, levelIndex, previewRadius);
    context.restore();
    container.append(canvas);
  }

  finish(won) {
    if (this.isFinished) return;
    this.isFinished = true;
    if (this.held) {
      this.held.held = false;
      this.held.pin = null;
      this.held = null;
    }
    saveBestScore(this.mode, this.bestScore);
    this.root.querySelector('#overlay-kicker').textContent = won ? '十级合成完成' : '本局结束';
    this.root.querySelector('#overlay-title').textContent = won ? '大西瓜合成成功！' : '水果堆到警戒线啦';
    this.root.querySelector('#overlay-message').textContent = won ? '最终的流心西瓜已经诞生，恭喜完成经典挑战。' : '再调整一下落点，让水果之间留出更多空间。';
    this.root.querySelector('#final-score').textContent = String(this.score);
    this.root.querySelector('#result-best').textContent = this.score > this.initialBestScore ? '刷新了历史最高分' : `历史最高 ${this.bestScore} 分`;
    this.overlay.classList.remove('hidden');
  }

  draw() {
    if (!this.context) return;
    const context = this.context;
    context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.save();
    if (this.cameraShake > 0.1) {
      context.translate((Math.random() - 0.5) * this.cameraShake, (Math.random() - 0.5) * this.cameraShake);
    }
    if (this.held && !this.isFinished) {
      this.drawGuide(context, this.held.maxY + 4, this.landingY(this.aimX, this.held.maxY, this.held), this.held.level);
    }
    this.drawJuiceParticles(context, false);
    context.save();
    context.fillStyle = 'rgba(45, 20, 57, 0.14)';
    for (const blob of this.blobs) {
      context.save();
      context.translate(2.5, 5);
      tracePath(context, blob);
      context.fill();
      context.restore();
    }
    context.restore();
    for (const blob of [...this.blobs].sort((a, b) => a.cy - b.cy)) this.drawBlob(context, blob);
    for (const bridge of this.bridges) drawLiquidBridge(context, bridge);
    this.drawEffects(context);
    if (this.dangerDuration > 0 && !this.isFinished) {
      const pulse = 0.45 + Math.sin(performance.now() / 110) * 0.2;
      context.fillStyle = `rgba(189, 53, 92, ${pulse})`;
      context.fillRect(0, DANGER_Y - 2, WORLD_WIDTH, 3);
    }
    if (!this.isFinished) this.drawPipette(context, this.aimX, this.squeeze, this.held?.level ?? this.currentLevel);
    context.restore();
  }

  drawBlob(context, blob) {
    const matrix = fruitMatrix(blob);
    const radius = blob.rest;
    context.save();
    tracePath(context, blob);
    context.save();
    context.clip();
    context.save();
    context.transform(matrix[0], matrix[1], matrix[2], matrix[3], blob.cx, blob.cy);
    context.drawImage(this.images.get(blob.level), -radius * 1.2, -radius * 1.2, radius * 2.4, radius * 2.4);
    context.restore();
    const halfWidth = Math.max(4, (blob.maxX - blob.minX) * 0.5);
    const halfHeight = Math.max(4, (blob.maxY - blob.minY) * 0.5);
    const centerX = (blob.minX + blob.maxX) * 0.5;
    const centerY = (blob.minY + blob.maxY) * 0.5;
    context.save();
    context.translate(centerX, centerY);
    context.scale(halfWidth, halfHeight);
    const causticColor = mixRgb(hexRgb(blob.info.color), [255, 250, 220], 0.6);
    const caustic = context.createRadialGradient(0.1, 0.62, 0.02, 0.1, 0.62, 0.62);
    caustic.addColorStop(0, rgba(causticColor, 0.5));
    caustic.addColorStop(1, rgba(hexRgb(blob.info.color), 0));
    context.fillStyle = caustic;
    context.fillRect(-1.2, -1.2, 2.4, 2.4);
    const shade = context.createRadialGradient(-0.42, -0.5, 0.02, 0, 0, 1.08);
    shade.addColorStop(0, 'rgba(255,255,255,0.34)');
    shade.addColorStop(0.32, 'rgba(255,255,255,0)');
    shade.addColorStop(0.72, 'rgba(0,0,0,0)');
    shade.addColorStop(1, hexToRgba(blob.info.outline, 0.55));
    context.fillStyle = shade;
    context.fillRect(-1.2, -1.2, 2.4, 2.4);
    context.restore();
    context.lineWidth = Math.max(3, radius * 0.22);
    context.strokeStyle = 'rgba(255,255,255,0.07)';
    context.stroke();
    if (blob.flash > 0) {
      context.fillStyle = `rgba(255,255,245,${blob.flash * 0.72})`;
      context.fill();
      blob.flash = Math.max(0, blob.flash - 0.045);
    }
    context.restore();
    context.lineWidth = Math.max(1.6, radius * 0.027);
    context.strokeStyle = hexToRgba(blob.info.outline, 0.78);
    context.stroke();
    context.save();
    context.transform(matrix[0], matrix[1], matrix[2], matrix[3], blob.cx, blob.cy);
    context.save();
    context.rotate(-0.55);
    context.fillStyle = 'rgba(255,255,255,0.62)';
    context.beginPath();
    context.ellipse(-radius * 0.08, -radius * 0.62, radius * 0.3, radius * 0.12, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(-radius * 0.52, -radius * 0.36, Math.max(1.2, radius * 0.05), 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawFruitStem(context, blob.level, radius);
    drawBlobFace(context, blob, radius);
    context.restore();
    context.restore();
  }

  drawJuiceParticles(context, foreground) {
    for (const particle of this.juiceParticles) {
      const airborne = particle.age < 0.7;
      if (foreground !== airborne) continue;
      const fade = Math.min(1, (particle.life - particle.age) / 1.4);
      const color = mixRgb(particle.color, [255, 255, 255], 0.15);
      context.fillStyle = rgba(color, (foreground ? 0.9 : 0.42) * fade);
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * (0.55 + fade * 0.45), 0, Math.PI * 2);
      context.fill();
    }
  }

  drawEffects(context) {
    for (const ring of this.effectRings) {
      const progress = ring.age / ring.life;
      context.strokeStyle = rgba(ring.color, (1 - progress) * 0.7);
      context.lineWidth = 6 * (1 - progress) + 1;
      context.beginPath();
      context.arc(ring.x, ring.y, ring.radius * (1 + progress * 0.9), 0, Math.PI * 2);
      context.stroke();
    }
    for (const particle of this.sparkParticles) {
      const fade = 1 - particle.age / particle.life;
      context.fillStyle = rgba(mixRgb(particle.color, [255, 255, 255], 0.4), fade);
      if (particle.star) {
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.age * 6);
        const size = particle.size * 1.6 * fade + 0.5;
        context.fillRect(-size, -0.6, size * 2, 1.2);
        context.fillRect(-0.6, -size, 1.2, size * 2);
        context.restore();
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * fade + 0.4, 0, Math.PI * 2);
        context.fill();
      }
    }
    this.drawJuiceParticles(context, true);
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const text of this.floatingTexts) {
      const progress = text.age / text.life;
      const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
      const scale = progress < 0.15 ? easeOutBack(progress / 0.15) : 1;
      context.save();
      context.translate(text.x, text.y);
      context.scale(scale, scale);
      context.font = `800 ${text.big ? 30 : 20}px system-ui, sans-serif`;
      context.lineWidth = 5;
      context.strokeStyle = `rgba(21,13,31,${alpha * 0.8})`;
      context.strokeText(text.text, 0, 0);
      context.fillStyle = text.color ? rgba(text.color, alpha) : `rgba(255,236,200,${alpha})`;
      context.fillText(text.text, 0, 0);
      context.restore();
    }
    context.restore();
  }

  drawPipette(context, x, squeeze, levelIndex) {
    const color = hexRgb(LEVELS[levelIndex].color);
    context.save();
    context.translate(x, PIPETTE_TIP_Y);
    context.fillStyle = 'rgba(218,239,255,0.18)';
    context.strokeStyle = 'rgba(231,244,255,0.82)';
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(-3, 0);
    context.lineTo(-9, -26);
    context.lineTo(-9, -78);
    context.lineTo(9, -78);
    context.lineTo(9, -26);
    context.lineTo(3, 0);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = rgba(color, 0.88);
    context.beginPath();
    context.moveTo(-2, -2);
    context.lineTo(-7, -26);
    context.lineTo(-7, -60 + squeeze * 20);
    context.lineTo(7, -60 + squeeze * 20);
    context.lineTo(7, -26);
    context.lineTo(2, -2);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.36)';
    context.fillRect(-5, -72, 2.5, 42);
    context.save();
    context.translate(0, -78);
    context.scale(1 + squeeze * 0.35, 1 - squeeze * 0.3);
    const bulb = context.createRadialGradient(-6, -26, 2, 0, -18, 26);
    bulb.addColorStop(0, '#e7c8ff');
    bulb.addColorStop(0.6, '#9b62c8');
    bulb.addColorStop(1, '#54267f');
    context.fillStyle = bulb;
    context.beginPath();
    context.moveTo(-11, 2);
    context.bezierCurveTo(-24, -14, -20, -44, 0, -44);
    context.bezierCurveTo(20, -44, 24, -14, 11, 2);
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(55,24,75,0.62)';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.beginPath();
    context.ellipse(-7, -30, 3, 7, -0.3, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.restore();
  }

  drawGuide(context, fromY, toY, levelIndex) {
    const color = hexRgb(LEVELS[levelIndex].color);
    context.save();
    const gradient = context.createLinearGradient(0, fromY, 0, toY);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.2, rgba(color, 0.5));
    gradient.addColorStop(1, rgba(color, 0.15));
    context.strokeStyle = gradient;
    context.lineWidth = 2;
    context.setLineDash([3, 7]);
    context.lineDashOffset = -this.worldTime * 30;
    context.beginPath();
    context.moveTo(this.aimX, fromY);
    context.lineTo(this.aimX, toY);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = rgba(color, 0.28);
    context.beginPath();
    context.ellipse(this.aimX, toY, LEVELS[levelIndex].radius * 0.7, 3.5, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  landingY(x, fromY, skip) {
    let best = WORLD_HEIGHT;
    for (const blob of this.blobs) {
      if (blob === skip || x < blob.minX || x > blob.maxX) continue;
      for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
        const x0 = blob.x[previous];
        const x1 = blob.x[index];
        if ((x0 > x) === (x1 > x)) continue;
        const y = blob.y[previous] + (blob.y[index] - blob.y[previous]) * (x - x0) / (x1 - x0);
        if (y > fromY && y < best) best = y;
      }
    }
    return best;
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.abortController.abort();
    this.blobs.length = 0;
  }
}

function integrate(blob, dt) {
  const gravity = GRAVITY * dt;
  for (let index = 0; index < blob.N; index += 1) {
    blob.px[index] = blob.x[index];
    blob.py[index] = blob.y[index];
    blob.vy[index] += gravity;
    blob.x[index] += blob.vx[index] * dt;
    blob.y[index] += blob.vy[index] * dt;
  }
}

function drawLeaf(context, x, y, length, angle, color = '#5fcf4a') {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.strokeStyle = '#1f5a17';
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(0, 0);
  context.quadraticCurveTo(length * 0.5, -length * 0.38, length, 0);
  context.quadraticCurveTo(length * 0.5, length * 0.38, 0, 0);
  context.fill();
  context.stroke();
  context.restore();
}

function drawFruitStem(context, level, radius) {
  context.lineCap = 'round';
  const stem = (height, bend, width = 2.4) => {
    context.strokeStyle = '#6b3a1a';
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(0, -radius * 0.9);
    context.quadraticCurveTo(bend * 0.3, -radius * 0.9 - height * 0.6, bend, -radius * 0.9 - height);
    context.stroke();
  };
  switch (level) {
    case 0:
      stem(radius * 0.8, radius * 0.45, 2);
      drawLeaf(context, radius * 0.38, -radius * 1.6, radius * 0.7, -0.4);
      break;
    case 1:
      for (let leaf = 0; leaf < 5; leaf += 1) drawLeaf(context, 0, -radius * 0.86, radius * 0.55, -Math.PI / 2 + (leaf - 2) * 0.62, '#4fc24a');
      break;
    case 2:
      stem(radius * 0.4, radius * 0.12, 2.2);
      break;
    case 3:
    case 4:
      context.fillStyle = '#4b8a2a';
      context.beginPath();
      context.arc(0, -radius * 0.93, radius * 0.08 + 1, 0, Math.PI * 2);
      context.fill();
      drawLeaf(context, 0, -radius * 0.95, radius * 0.6, -0.5);
      break;
    case 5:
      stem(radius * 0.38, -radius * 0.1, 3);
      drawLeaf(context, -radius * 0.06, -radius * 1.12, radius * 0.55, -0.35);
      break;
    case 6:
      drawLeaf(context, 0, -radius * 0.92, radius * 0.5, -2.6);
      drawLeaf(context, 0, -radius * 0.92, radius * 0.56, -0.45);
      break;
    case 7:
      stem(radius * 0.32, radius * 0.1, 3.2);
      break;
    case 9:
      context.strokeStyle = '#3c6a1a';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(0, -radius * 0.97);
      context.bezierCurveTo(radius * 0.05, -radius * 1.12, radius * 0.16, -radius * 1.12, radius * 0.12, -radius * 1.04);
      context.stroke();
      break;
    default:
      break;
  }
}

function drawBlobFace(context, blob, radius) {
  const scale = Math.min(radius * 0.34, 9 + radius * 0.16) / 10;
  const eyeY = radius * 0.08;
  const eyeX = 5.2 * scale + radius * 0.1;
  const ink = '#2a0f1c';
  const worried = blob.dangerT > 0.3;
  const squished = blob.squash > 0.3 || blob.hitT > 0;
  const happy = blob.mood > 0;

  context.save();
  context.translate(0, eyeY);
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 1.7 * scale;

  context.fillStyle = 'rgba(255,90,120,0.35)';
  context.beginPath();
  context.ellipse(-eyeX - 3.2 * scale, 4.2 * scale, 3 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
  context.ellipse(eyeX + 3.2 * scale, 4.2 * scale, 3 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = ink;

  if (happy) {
    for (const x of [-eyeX, eyeX]) {
      context.beginPath();
      context.moveTo(x - 2.6 * scale, 0.8 * scale);
      context.quadraticCurveTo(x, -3 * scale, x + 2.6 * scale, 0.8 * scale);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(-3 * scale, 4 * scale);
    context.quadraticCurveTo(0, 9 * scale, 3 * scale, 4 * scale);
    context.closePath();
    context.fill();
  } else if (squished) {
    for (const x of [-eyeX, eyeX]) {
      const direction = x < 0 ? 1 : -1;
      context.beginPath();
      context.moveTo(x - 2.4 * scale * direction, -2.2 * scale);
      context.lineTo(x + 1.8 * scale * direction, 0);
      context.lineTo(x - 2.4 * scale * direction, 2.2 * scale);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(-3 * scale, 5.5 * scale);
    for (let point = 0; point <= 4; point += 1) {
      context.lineTo(-3 * scale + point * 1.5 * scale, (point % 2 ? 4.3 : 5.8) * scale);
    }
    context.stroke();
  } else {
    const blinking = blob.blink < 0;
    const lookX = clamp(blob.lookX, -1, 1) * 1.1 * scale;
    const lookY = clamp(blob.lookY, -1, 1) * 0.9 * scale;
    for (const x of [-eyeX, eyeX]) {
      if (blinking) {
        context.beginPath();
        context.moveTo(x - 2.3 * scale, 0.5 * scale);
        context.quadraticCurveTo(x, 2 * scale, x + 2.3 * scale, 0.5 * scale);
        context.stroke();
        continue;
      }
      const eyeHeight = worried ? 3.4 : 2.9;
      context.beginPath();
      context.ellipse(x + lookX * 0.4, lookY * 0.4, 2.2 * scale, eyeHeight * scale, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(x + lookX - 0.6 * scale, lookY - 1.1 * scale, 0.85 * scale, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ink;
    }
    if (worried) {
      context.beginPath();
      context.ellipse(0, 5.4 * scale, 1.5 * scale, 1.9 * scale, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(150,220,255,0.9)';
      context.beginPath();
      context.moveTo(eyeX + 5 * scale, -5 * scale);
      context.quadraticCurveTo(eyeX + 7.5 * scale, -scale, eyeX + 5 * scale, -0.2 * scale);
      context.quadraticCurveTo(eyeX + 2.8 * scale, -scale, eyeX + 5 * scale, -5 * scale);
      context.fill();
    } else if (Math.abs(blob.vcy) > 500) {
      context.beginPath();
      context.ellipse(0, 5 * scale, 1.4 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(-2.2 * scale, 4.2 * scale);
      context.quadraticCurveTo(0, 6.4 * scale, 2.2 * scale, 4.2 * scale);
      context.stroke();
    }
  }
  context.restore();
}

function solveInternal(blob) {
  const tension = blob.material.ten * 0.5;
  for (let index = 0; index < blob.N; index += 1) {
    const previous = index === 0 ? blob.N - 1 : index - 1;
    const next = index === blob.N - 1 ? 0 : index + 1;
    blob.tx[index] = ((blob.x[previous] + blob.x[next]) * 0.5 - blob.x[index]) * tension;
    blob.ty[index] = ((blob.y[previous] + blob.y[next]) * 0.5 - blob.y[index]) * tension;
  }
  for (let index = 0; index < blob.N; index += 1) {
    blob.x[index] += blob.tx[index];
    blob.y[index] += blob.ty[index];
  }

  let centerX = 0;
  let centerY = 0;
  for (let index = 0; index < blob.N; index += 1) {
    centerX += blob.x[index];
    centerY += blob.y[index];
  }
  centerX /= blob.N;
  centerY /= blob.N;
  let sine = 0;
  let cosine = 0;
  const scale = blob.radius / blob.rest;
  for (let index = 0; index < blob.N; index += 1) {
    const x = blob.x[index] - centerX;
    const y = blob.y[index] - centerY;
    sine += blob.qx[index] * y - blob.qy[index] * x;
    cosine += blob.qx[index] * x + blob.qy[index] * y;
  }
  const length = Math.hypot(sine, cosine) || 1;
  const rotationSin = sine / length;
  const rotationCos = cosine / length;
  for (let index = 0; index < blob.N; index += 1) {
    const goalX = centerX + (rotationCos * blob.qx[index] - rotationSin * blob.qy[index]) * scale;
    const goalY = centerY + (rotationSin * blob.qx[index] + rotationCos * blob.qy[index]) * scale;
    blob.x[index] += (goalX - blob.x[index]) * blob.material.stiff;
    blob.y[index] += (goalY - blob.y[index]) * blob.material.stiff;
  }

  let perimeter = 0;
  for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
    perimeter += Math.hypot(blob.x[index] - blob.x[previous], blob.y[index] - blob.y[previous]);
  }
  const targetLength = Math.min(perimeter / blob.N, Math.PI * 2 * blob.radius * 1.7 / blob.N);
  for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
    const dx = blob.x[index] - blob.x[previous];
    const dy = blob.y[index] - blob.y[previous];
    const distance = Math.hypot(dx, dy) || 1e-6;
    const error = (distance - targetLength) / distance * 0.175;
    blob.x[index] -= dx * error;
    blob.y[index] -= dy * error;
    blob.x[previous] += dx * error;
    blob.y[previous] += dy * error;
  }

  const targetArea = Math.PI * blob.radius * blob.radius;
  let area = 0;
  for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
    area += blob.x[previous] * blob.y[index] - blob.x[index] * blob.y[previous];
  }
  area *= 0.5;
  let denominator = 0;
  for (let index = 0; index < blob.N; index += 1) {
    const previous = index === 0 ? blob.N - 1 : index - 1;
    const next = index === blob.N - 1 ? 0 : index + 1;
    blob.tx[index] = 0.5 * (blob.y[next] - blob.y[previous]);
    blob.ty[index] = 0.5 * (blob.x[previous] - blob.x[next]);
    denominator += blob.tx[index] ** 2 + blob.ty[index] ** 2;
  }
  if (denominator > 1e-9) {
    const lambda = -(area - targetArea) / denominator;
    for (let index = 0; index < blob.N; index += 1) {
      blob.x[index] += blob.tx[index] * lambda;
      blob.y[index] += blob.ty[index] * lambda;
    }
  }
}

function solveWalls(blob) {
  const floor = WORLD_HEIGHT - COLLISION_MARGIN;
  const left = COLLISION_MARGIN;
  const right = WORLD_WIDTH - COLLISION_MARGIN;
  const friction = blob.material.fr + 0.15;
  for (let index = 0; index < blob.N; index += 1) {
    if (blob.y[index] > floor) {
      const penetration = blob.y[index] - floor;
      blob.y[index] = floor;
      blob.x[index] -= (blob.x[index] - blob.px[index]) * Math.min(1, friction * 1.6);
      if (penetration > 3 && Math.hypot(blob.vcx, blob.vcy) > 520) blob.hitT = 0.35;
    }
    if (blob.x[index] < left) {
      blob.x[index] = left;
      blob.y[index] -= (blob.y[index] - blob.py[index]) * friction;
    } else if (blob.x[index] > right) {
      blob.x[index] = right;
      blob.y[index] -= (blob.y[index] - blob.py[index]) * friction;
    }
  }
}

function collidePolygon(a, b, pair) {
  const reach = b.br + COLLISION_MARGIN * 2;
  const reachSquared = reach * reach;
  const friction = (a.material.fr + b.material.fr) * 0.5;
  let hits = 0;
  for (let particle = 0; particle < a.N; particle += 1) {
    const pointX = a.x[particle];
    const pointY = a.y[particle];
    if (pointX < b.minX - COLLISION_MARGIN || pointX > b.maxX + COLLISION_MARGIN || pointY < b.minY - COLLISION_MARGIN || pointY > b.maxY + COLLISION_MARGIN) continue;
    const centerDx = pointX - b.cx;
    const centerDy = pointY - b.cy;
    if (centerDx * centerDx + centerDy * centerDy > reachSquared) continue;
    let inside = false;
    let nearestSquared = Infinity;
    let nearestEdge = 0;
    let nearestT = 0;
    for (let index = 0, previous = b.N - 1; index < b.N; previous = index, index += 1) {
      const x0 = b.x[previous];
      const y0 = b.y[previous];
      const x1 = b.x[index];
      const y1 = b.y[index];
      if ((y0 > pointY) !== (y1 > pointY) && pointX < (x1 - x0) * (pointY - y0) / (y1 - y0) + x0) inside = !inside;
      const edgeX = x1 - x0;
      const edgeY = y1 - y0;
      const lengthSquared = edgeX * edgeX + edgeY * edgeY;
      const t = clamp(lengthSquared > 0 ? ((pointX - x0) * edgeX + (pointY - y0) * edgeY) / lengthSquared : 0, 0, 1);
      const dx = x0 + edgeX * t - pointX;
      const dy = y0 + edgeY * t - pointY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared;
        nearestEdge = previous;
        nearestT = t;
      }
    }
    const distance = Math.sqrt(nearestSquared);
    if (!inside && distance >= COLLISION_MARGIN) continue;
    const edgeStart = nearestEdge;
    const edgeEnd = (nearestEdge + 1) % b.N;
    const closestX = b.x[edgeStart] + (b.x[edgeEnd] - b.x[edgeStart]) * nearestT;
    const closestY = b.y[edgeStart] + (b.y[edgeEnd] - b.y[edgeStart]) * nearestT;
    let normalX;
    let normalY;
    if (distance > 1e-6) {
      normalX = (pointX - closestX) / distance;
      normalY = (pointY - closestY) / distance;
    } else {
      normalX = b.y[edgeEnd] - b.y[edgeStart];
      normalY = b.x[edgeStart] - b.x[edgeEnd];
      const normalLength = Math.hypot(normalX, normalY) || 1;
      normalX /= normalLength;
      normalY /= normalLength;
    }
    const penetration = inside ? distance + COLLISION_MARGIN : COLLISION_MARGIN - distance;
    if (inside) {
      normalX = -normalX;
      normalY = -normalY;
    }
    const weightStart = b.w * (1 - nearestT);
    const weightEnd = b.w * nearestT;
    const sum = a.w + (1 - nearestT) * weightStart + nearestT * weightEnd;
    const lambda = penetration / sum;
    a.x[particle] += normalX * lambda * a.w;
    a.y[particle] += normalY * lambda * a.w;
    b.x[edgeStart] -= normalX * lambda * weightStart;
    b.y[edgeStart] -= normalY * lambda * weightStart;
    b.x[edgeEnd] -= normalX * lambda * weightEnd;
    b.y[edgeEnd] -= normalY * lambda * weightEnd;
    const relativeX = (a.x[particle] - a.px[particle]) - ((b.x[edgeStart] - b.px[edgeStart]) * (1 - nearestT) + (b.x[edgeEnd] - b.px[edgeEnd]) * nearestT);
    const relativeY = (a.y[particle] - a.py[particle]) - ((b.y[edgeStart] - b.py[edgeStart]) * (1 - nearestT) + (b.y[edgeEnd] - b.py[edgeEnd]) * nearestT);
    const normalMotion = relativeX * normalX + relativeY * normalY;
    const tangentX = (relativeX - normalMotion * normalX) * friction;
    const tangentY = (relativeY - normalMotion * normalY) * friction;
    const inverseSum = 1 / sum;
    a.x[particle] -= tangentX * a.w * inverseSum;
    a.y[particle] -= tangentY * a.w * inverseSum;
    b.x[edgeStart] += tangentX * weightStart * inverseSum;
    b.y[edgeStart] += tangentY * weightStart * inverseSum;
    b.x[edgeEnd] += tangentX * weightEnd * inverseSum;
    b.y[edgeEnd] += tangentY * weightEnd * inverseSum;
    pair.impact = Math.max(pair.impact, -normalMotion);
    hits += 1;
  }
  return hits;
}

function applyPin(blob) {
  const index = blob.pin.idx;
  const left = (index + blob.N - 1) % blob.N;
  const right = (index + 1) % blob.N;
  const offset = blob.radius * 0.38;
  blob.x[index] = blob.pin.x;
  blob.y[index] = blob.pin.y;
  blob.x[left] += (blob.pin.x - offset - blob.x[left]) * 0.5;
  blob.y[left] += (blob.pin.y + 2 - blob.y[left]) * 0.5;
  blob.x[right] += (blob.pin.x + offset - blob.x[right]) * 0.5;
  blob.y[right] += (blob.pin.y + 2 - blob.y[right]) * 0.5;
}

function viscousDamp(blob, dt) {
  let meanX = 0;
  let meanY = 0;
  for (let index = 0; index < blob.N; index += 1) {
    meanX += blob.vx[index];
    meanY += blob.vy[index];
  }
  meanX /= blob.N;
  meanY /= blob.N;
  let angularMomentum = 0;
  let inertia = 0;
  for (let index = 0; index < blob.N; index += 1) {
    const x = blob.x[index] - blob.cx;
    const y = blob.y[index] - blob.cy;
    angularMomentum += x * (blob.vy[index] - meanY) - y * (blob.vx[index] - meanX);
    inertia += x * x + y * y;
  }
  const angularVelocity = inertia > 0 ? angularMomentum / inertia : 0;
  const blend = 1 - Math.pow(1 - blob.material.damp, dt * 60);
  const air = Math.pow(0.9985, dt * 60);
  for (let index = 0; index < blob.N; index += 1) {
    const x = blob.x[index] - blob.cx;
    const y = blob.y[index] - blob.cy;
    const targetX = meanX - angularVelocity * y;
    const targetY = meanY + angularVelocity * x;
    blob.vx[index] = (blob.vx[index] + (targetX - blob.vx[index]) * blend) * air;
    blob.vy[index] = (blob.vy[index] + (targetY - blob.vy[index]) * blend) * air;
  }
  blob.vcx = meanX;
  blob.vcy = meanY;
}

function plasticFlow(blob, dt) {
  const scale = blob.rest / (blob.radius || 1);
  const cosine = Math.cos(-blob.ang);
  const sine = Math.sin(-blob.ang);
  const plasticity = Math.min(1, blob.material.plastic * dt);
  const recovery = Math.min(1, 0.55 * dt);
  let area = 0;
  for (let index = 0; index < blob.N; index += 1) {
    const x = (blob.x[index] - blob.cx) * scale;
    const y = (blob.y[index] - blob.cy) * scale;
    const localX = cosine * x - sine * y;
    const localY = sine * x + cosine * y;
    blob.qx[index] += (localX - blob.qx[index]) * plasticity + (blob.ox[index] - blob.qx[index]) * recovery;
    blob.qy[index] += (localY - blob.qy[index]) * plasticity + (blob.oy[index] - blob.qy[index]) * recovery;
  }
  for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
    area += blob.qx[previous] * blob.qy[index] - blob.qx[index] * blob.qy[previous];
  }
  area *= 0.5;
  const correction = area > 1 ? Math.sqrt(Math.PI * blob.rest * blob.rest / area) : 1;
  for (let index = 0; index < blob.N; index += 1) {
    blob.qx[index] *= correction;
    blob.qy[index] *= correction;
  }
}

function pullParticles(blob, directionX, directionY, strength) {
  for (let index = 0; index < blob.N; index += 1) {
    const x = blob.x[index] - blob.cx;
    const y = blob.y[index] - blob.cy;
    const length = Math.hypot(x, y) || 1;
    const facing = Math.max(0, (x * directionX + y * directionY) / length);
    const force = strength * (0.35 + 1.3 * facing ** 3);
    blob.vx[index] += directionX * force;
    blob.vy[index] += directionY * force;
  }
}

function tracePath(context, blob) {
  const last = blob.N - 1;
  context.beginPath();
  context.moveTo((blob.x[last] + blob.x[0]) * 0.5, (blob.y[last] + blob.y[0]) * 0.5);
  for (let index = 0; index < blob.N; index += 1) {
    const next = (index + 1) % blob.N;
    context.quadraticCurveTo(blob.x[index], blob.y[index], (blob.x[index] + blob.x[next]) * 0.5, (blob.y[index] + blob.y[next]) * 0.5);
  }
  context.closePath();
}

function fruitMatrix(blob) {
  let [a, c, b, d] = blob.A;
  const determinant = a * d - c * b;
  if (determinant < 0.15 || !Number.isFinite(determinant)) {
    const scale = blob.radius / blob.rest;
    const cosine = Math.cos(blob.ang);
    const sine = Math.sin(blob.ang);
    a = cosine * scale;
    c = -sine * scale;
    b = sine * scale;
    d = cosine * scale;
  }
  return [a, b, c, d];
}

function easeOutBack(value) {
  const overshoot = 1.9;
  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isBridgeBlocked(a, b, blobs) {
  const axisX = b.cx - a.cx;
  const axisY = b.cy - a.cy;
  const axisLengthSquared = axisX * axisX + axisY * axisY || 1;
  for (const other of blobs) {
    if (other === a || other === b) continue;
    const amount = ((other.cx - a.cx) * axisX + (other.cy - a.cy) * axisY) / axisLengthSquared;
    if (amount <= 0 || amount >= 1) continue;
    const distance = Math.hypot(a.cx + axisX * amount - other.cx, a.cy + axisY * amount - other.cy);
    if (distance < other.rest * 0.75) return true;
  }
  return false;
}

function rayPolygon(blob, originX, originY, directionX, directionY) {
  let farthest = -1;
  for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
    const x0 = blob.x[previous] - originX;
    const y0 = blob.y[previous] - originY;
    const edgeX = blob.x[index] - blob.x[previous];
    const edgeY = blob.y[index] - blob.y[previous];
    const denominator = directionX * edgeY - directionY * edgeX;
    if (Math.abs(denominator) < 1e-9) continue;
    const distance = (x0 * edgeY - y0 * edgeX) / denominator;
    const edgeAmount = (x0 * directionY - y0 * directionX) / denominator;
    if (distance >= 0 && edgeAmount >= 0 && edgeAmount <= 1 && distance > farthest) farthest = distance;
  }
  return farthest;
}

function drawLiquidBridge(context, bridge) {
  const { a, b, close } = bridge;
  const axisX = b.cx - a.cx;
  const axisY = b.cy - a.cy;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const normalX = axisX / axisLength;
  const normalY = axisY / axisLength;
  const farthestParticle = (blob, x, y) => {
    let result = 0;
    let value = -Infinity;
    for (let index = 0; index < blob.N; index += 1) {
      const projection = (blob.x[index] - blob.cx) * x + (blob.y[index] - blob.cy) * y;
      if (projection > value) { value = projection; result = index; }
    }
    return result;
  };
  const indexA = farthestParticle(a, normalX, normalY);
  const indexB = farthestParticle(b, -normalX, -normalY);
  const spreadA = Math.max(1, Math.round(a.N * (0.05 + 0.08 * close)));
  const spreadB = Math.max(1, Math.round(b.N * (0.05 + 0.08 * close)));
  const point = (blob, index, inset = 0) => {
    const wrapped = (index + blob.N) % blob.N;
    const dx = blob.x[wrapped] - blob.cx;
    const dy = blob.y[wrapped] - blob.cy;
    const length = Math.hypot(dx, dy) || 1;
    return [blob.x[wrapped] - dx / length * inset, blob.y[wrapped] - dy / length * inset];
  };
  const side = ([x, y]) => (x - a.cx) * -normalY + (y - a.cy) * normalX;
  let a1 = point(a, indexA - spreadA);
  let a2 = point(a, indexA + spreadA);
  if (side(a1) < side(a2)) [a1, a2] = [a2, a1];
  let b1 = point(b, indexB - spreadB);
  let b2 = point(b, indexB + spreadB);
  if (side(b1) < side(b2)) [b1, b2] = [b2, b1];
  const centerX = (a1[0] + a2[0] + b1[0] + b2[0]) * 0.25;
  const centerY = (a1[1] + a2[1] + b1[1] + b2[1]) * 0.25;
  const pinch = 0.15 + 0.75 * (1 - close);
  const control = (first, second) => [
    lerp((first[0] + second[0]) * 0.5, centerX, pinch),
    lerp((first[1] + second[1]) * 0.5, centerY, pinch),
  ];
  const control1 = control(a1, b1);
  const control2 = control(b2, a2);
  const insideB = point(b, indexB, 3.2);
  const insideA = point(a, indexA, 3.2);

  context.save();
  context.beginPath();
  context.moveTo(a1[0], a1[1]);
  context.quadraticCurveTo(control1[0], control1[1], b1[0], b1[1]);
  context.quadraticCurveTo(insideB[0], insideB[1], b2[0], b2[1]);
  context.quadraticCurveTo(control2[0], control2[1], a2[0], a2[1]);
  context.quadraticCurveTo(insideA[0], insideA[1], a1[0], a1[1]);
  context.closePath();
  const gradient = context.createLinearGradient(a.cx, a.cy, b.cx, b.cy);
  const color = hexRgb(a.info.color);
  gradient.addColorStop(0, a.info.color);
  gradient.addColorStop(0.5, rgba(mixRgb(color, [255, 255, 255], 0.25), 1));
  gradient.addColorStop(1, a.info.color);
  context.globalAlpha = clamp(close * 1.6, 0, 1);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = hexToRgba(a.info.outline, 0.85);
  context.lineWidth = 2.3;
  context.beginPath();
  context.moveTo(a1[0], a1[1]);
  context.quadraticCurveTo(control1[0], control1[1], b1[0], b1[1]);
  context.moveTo(b2[0], b2[1]);
  context.quadraticCurveTo(control2[0], control2[1], a2[0], a2[1]);
  context.stroke();
  context.restore();
}

function pushJuiceOut(particle, blob) {
  let inside = false;
  let nearestSquared = Infinity;
  let closestX = particle.x;
  let closestY = particle.y;
  for (let index = 0, previous = blob.N - 1; index < blob.N; previous = index, index += 1) {
    const x0 = blob.x[previous];
    const y0 = blob.y[previous];
    const x1 = blob.x[index];
    const y1 = blob.y[index];
    if ((y0 > particle.y) !== (y1 > particle.y) && particle.x < (x1 - x0) * (particle.y - y0) / (y1 - y0) + x0) inside = !inside;
    const edgeX = x1 - x0;
    const edgeY = y1 - y0;
    const lengthSquared = edgeX * edgeX + edgeY * edgeY;
    const amount = clamp(lengthSquared > 0 ? ((particle.x - x0) * edgeX + (particle.y - y0) * edgeY) / lengthSquared : 0, 0, 1);
    const edgePointX = x0 + edgeX * amount;
    const edgePointY = y0 + edgeY * amount;
    const dx = edgePointX - particle.x;
    const dy = edgePointY - particle.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearestSquared) {
      nearestSquared = distanceSquared;
      closestX = edgePointX;
      closestY = edgePointY;
    }
  }
  const distance = Math.sqrt(nearestSquared);
  if (!inside && distance >= particle.size) return;
  let normalX = closestX - blob.cx;
  let normalY = closestY - blob.cy;
  const normalLength = Math.hypot(normalX, normalY) || 1;
  normalX /= normalLength;
  normalY /= normalLength;
  particle.x = closestX + normalX * particle.size;
  particle.y = closestY + normalY * particle.size;
  const outwardVelocity = particle.vx * normalX + particle.vy * normalY;
  if (outwardVelocity < 0) {
    particle.vx -= outwardVelocity * normalX * 1.2;
    particle.vy -= outwardVelocity * normalY * 1.2;
  }
}

function randomRange(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function mixRgb(first, second, amount) {
  return first.map((value, index) => Math.round(value + (second[index] - value) * amount));
}

function hexRgb(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba(color, alpha) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

function hexToRgba(color, alpha) {
  return rgba(hexRgb(color), alpha);
}
