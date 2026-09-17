import {
  ENDLESS_CLEAR_SCORE,
  LEVEL_COUNT,
  LEVELS,
  loadBestScore,
  mergeScore,
  randomSpawnLevel,
  saveBestScore,
} from './config.js';

const WORLD_WIDTH = 520;
const WORLD_HEIGHT = 780;
const FIXED_STEP = 1 / 120;
const MAX_FRAME_STEP = 1 / 20;
const GRAVITY = 1120;

export class SoftBambooGame {
  constructor(root, options = {}) {
    this.root = root;
    this.mode = options.mode === 'endless' ? 'endless' : 'classic';
    this.callbacks = options.callbacks || {};
    this.score = 0;
    this.bestScore = loadBestScore(this.mode);
    this.initialBestScore = this.bestScore;
    this.currentLevel = randomSpawnLevel();
    this.nextLevel = randomSpawnLevel();
    this.blobs = [];
    this.images = new Map();
    this.nextId = 1;
    this.aimX = WORLD_WIDTH / 2;
    this.canDrop = true;
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
    this.updatePreview();
    this.resizeCanvas();
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

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || this.isFinished || (event.pointerType === 'mouse' && event.button !== 0)) return;
      this.pointer = { id: event.pointerId, start: point(event), gesture: '' };
      this.aimX = clamp(this.pointer.start.x, 32, WORLD_WIDTH - 32);
      if (event.pointerType === 'mouse') this.canvas.setPointerCapture?.(event.pointerId);
    }, { signal });

    this.canvas.addEventListener('pointermove', (event) => {
      if (this.isFinished) return;
      const current = point(event);
      if (this.pointer?.id === event.pointerId && event.pointerType === 'touch') {
        const dx = current.x - this.pointer.start.x;
        const dy = current.y - this.pointer.start.y;
        if (!this.pointer.gesture && Math.hypot(dx, dy) > 8) {
          this.pointer.gesture = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
          if (this.pointer.gesture === 'horizontal') this.canvas.setPointerCapture?.(event.pointerId);
        }
        if (this.pointer.gesture === 'vertical') return;
        if (this.pointer.gesture === 'horizontal') event.preventDefault();
      }
      this.aimX = clamp(current.x, 32, WORLD_WIDTH - 32);
    }, { signal });

    this.canvas.addEventListener('pointerup', (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const gesture = this.pointer.gesture;
      this.pointer = null;
      if (gesture === 'vertical') return;
      event.preventDefault();
      this.aimX = clamp(point(event).x, 32, WORLD_WIDTH - 32);
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
      this.images.set(level.index, createFruitTexture(level));
    }
  }

  resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(WORLD_WIDTH * ratio);
    this.canvas.height = Math.round(WORLD_HEIGHT * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  drop() {
    if (!this.canDrop || this.isFinished) return;
    const level = this.currentLevel;
    const radius = LEVELS[level].radius;
    const x = clamp(this.aimX, radius + 5, WORLD_WIDTH - radius - 5);
    this.blobs.push(this.createBlob(x, Math.max(radius + 8, 135 - radius), level));
    this.currentLevel = this.nextLevel;
    this.nextLevel = randomSpawnLevel();
    this.updatePreview();
    this.canDrop = false;
    clearTimeout(this.dropTimer);
    this.dropTimer = setTimeout(() => { if (!this.isFinished) this.canDrop = true; }, 430);
  }

  createBlob(x, y, level) {
    const radius = LEVELS[level].radius;
    const points = Math.round(18 + level * 1.3);
    return {
      id: this.nextId++, level, x, y, radius, vx: 0, vy: 0,
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 0.5,
      deformXX: 1,
      deformXY: 0,
      deformYY: 1,
      deformVXX: 0,
      deformVXY: 0,
      deformVYY: 0,
      offsets: Array.from({ length: points }, () => 0),
      offsetVelocity: Array.from({ length: points }, () => 0),
      age: 0,
    };
  }

  frame(time) {
    if (!this.root.isConnected) return;
    const elapsed = Math.min(MAX_FRAME_STEP, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    if (!this.isFinished) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 7) {
        this.simulate(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
    }
    this.draw();
    this.animationFrame = requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  simulate(dt) {
    for (const blob of this.blobs) {
      blob.age += dt;
      blob.vy += GRAVITY * dt;
      blob.vx *= 0.9992;
      blob.vy *= 0.9995;
      blob.x += blob.vx * dt;
      blob.y += blob.vy * dt;
      blob.rotation += blob.angularVelocity * dt;
      blob.angularVelocity *= 0.997;
      this.resolveBounds(blob);
      this.relaxShape(blob, dt);
    }

    const merges = [];
    const claimed = new Set();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (let i = 0; i < this.blobs.length; i += 1) {
        for (let j = i + 1; j < this.blobs.length; j += 1) {
          const a = this.blobs[i];
          const b = this.blobs[j];
          const touched = this.resolveCollision(a, b);
          if (!touched || iteration !== 0 || a.level !== b.level || claimed.has(a.id) || claimed.has(b.id)) continue;
          if (a.age < 0.11 || b.age < 0.11) continue;
          if (a.level === LEVEL_COUNT - 1 && this.mode !== 'endless') continue;
          claimed.add(a.id);
          claimed.add(b.id);
          merges.push({ a, b });
        }
      }
    }
    for (const pair of merges) this.merge(pair.a, pair.b);
    this.checkDanger(dt);
  }

  resolveBounds(blob) {
    const horizontalRadius = this.supportRadius(blob, 1, 0);
    const verticalRadius = this.supportRadius(blob, 0, 1);
    if (blob.x < horizontalRadius) {
      blob.x = horizontalRadius;
      blob.vx = Math.abs(blob.vx) * 0.28;
      this.deform(blob, Math.PI, Math.abs(blob.vx) * 0.05 + 2);
      this.squash(blob, 1, 0, Math.abs(blob.vx) * 0.04 + 1.5);
    } else if (blob.x > WORLD_WIDTH - horizontalRadius) {
      blob.x = WORLD_WIDTH - horizontalRadius;
      blob.vx = -Math.abs(blob.vx) * 0.28;
      this.deform(blob, 0, Math.abs(blob.vx) * 0.05 + 2);
      this.squash(blob, 1, 0, Math.abs(blob.vx) * 0.04 + 1.5);
    }
    if (blob.y > WORLD_HEIGHT - verticalRadius) {
      const impact = Math.max(0, blob.vy);
      blob.y = WORLD_HEIGHT - verticalRadius;
      blob.vy = -impact * 0.16;
      blob.vx *= 0.965;
      blob.angularVelocity += blob.vx * 0.0006;
      if (impact > 16) {
        const strength = Math.min(blob.radius * 0.42, impact * 0.05);
        this.deform(blob, Math.PI / 2, strength);
        this.squash(blob, 0, 1, strength);
      }
    }
  }

  resolveCollision(a, b) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    const minimum = (this.supportRadius(a, nxOr(dx, distance), nyOr(dy, distance))
      + this.supportRadius(b, nxOr(dx, distance), nyOr(dy, distance))) * 0.92;
    if (distance >= minimum) return false;
    if (distance < 0.001) {
      dx = 0.01;
      dy = 0;
      distance = 0.01;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minimum - distance;
    const massA = a.radius * a.radius;
    const massB = b.radius * b.radius;
    const totalMass = massA + massB;
    a.x -= nx * overlap * massB / totalMass;
    a.y -= ny * overlap * massB / totalMass;
    b.x += nx * overlap * massA / totalMass;
    b.y += ny * overlap * massA / totalMass;

    const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relative < 0) {
      const impulse = -(1.18 * relative) / (1 / massA + 1 / massB);
      a.vx -= impulse * nx / massA;
      a.vy -= impulse * ny / massA;
      b.vx += impulse * nx / massB;
      b.vy += impulse * ny / massB;
    }
    const strength = Math.min(Math.min(a.radius, b.radius) * 0.22, overlap * 0.65 + Math.abs(relative) * 0.025);
    this.deform(a, Math.atan2(ny, nx), strength);
    this.deform(b, Math.atan2(-ny, -nx), strength);
    this.squash(a, nx, ny, strength);
    this.squash(b, nx, ny, strength);
    a.angularVelocity -= ny * relative * 0.0015;
    b.angularVelocity += ny * relative * 0.0015;
    return true;
  }

  deform(blob, angle, strength) {
    const count = blob.offsets.length;
    for (let i = 0; i < count; i += 1) {
      const pointAngle = i / count * Math.PI * 2 + blob.rotation;
      const closeness = Math.max(0, Math.cos(pointAngle - angle));
      blob.offsetVelocity[i] -= strength * closeness * 4.2;
      blob.offsetVelocity[(i + Math.floor(count / 2)) % count] += strength * closeness * 1.35;
    }
  }

  squash(blob, nx, ny, strength) {
    const amount = clamp(strength / blob.radius * 0.42, 0, 0.09);
    if (amount <= 0) return;
    const tx = -ny;
    const ty = nx;
    const expansion = amount * 0.78;
    const deltaXX = -amount * nx * nx + expansion * tx * tx;
    const deltaXY = -amount * nx * ny + expansion * tx * ty;
    const deltaYY = -amount * ny * ny + expansion * ty * ty;
    blob.deformXX += deltaXX * 0.55;
    blob.deformXY += deltaXY * 0.55;
    blob.deformYY += deltaYY * 0.55;
    blob.deformVXX += deltaXX * 12;
    blob.deformVXY += deltaXY * 12;
    blob.deformVYY += deltaYY * 12;
    this.limitDeformation(blob);
  }

  supportRadius(blob, nx, ny) {
    const x = blob.deformXX * nx + blob.deformXY * ny;
    const y = blob.deformXY * nx + blob.deformYY * ny;
    return blob.radius * Math.hypot(x, y);
  }

  limitDeformation(blob) {
    blob.deformXX = clamp(blob.deformXX, 0.7, 1.3);
    blob.deformYY = clamp(blob.deformYY, 0.7, 1.3);
    blob.deformXY = clamp(blob.deformXY, -0.2, 0.2);
    const determinant = blob.deformXX * blob.deformYY - blob.deformXY * blob.deformXY;
    if (determinant < 0.68) {
      const correction = (0.68 - determinant) * 0.45;
      blob.deformXX += correction;
      blob.deformYY += correction;
    }
  }

  relaxShape(blob, dt) {
    const count = blob.offsets.length;
    const nextVelocity = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const previous = blob.offsets[(i - 1 + count) % count];
      const next = blob.offsets[(i + 1) % count];
      const smoothing = (previous + next) * 0.5 - blob.offsets[i];
      const acceleration = -blob.offsets[i] * 70 + smoothing * 95;
      nextVelocity[i] = (blob.offsetVelocity[i] + acceleration * dt) * Math.pow(0.23, dt);
    }
    let average = 0;
    for (let i = 0; i < count; i += 1) {
      blob.offsetVelocity[i] = nextVelocity[i];
      blob.offsets[i] = clamp(blob.offsets[i] + nextVelocity[i] * dt, -blob.radius * 0.27, blob.radius * 0.2);
      average += blob.offsets[i];
    }
    average /= count;
    for (let i = 0; i < count; i += 1) blob.offsets[i] -= average * 0.45;

    blob.deformVXX = (blob.deformVXX + (1 - blob.deformXX) * 46 * dt) * Math.pow(0.12, dt);
    blob.deformVXY = (blob.deformVXY - blob.deformXY * 46 * dt) * Math.pow(0.12, dt);
    blob.deformVYY = (blob.deformVYY + (1 - blob.deformYY) * 46 * dt) * Math.pow(0.12, dt);
    blob.deformXX += blob.deformVXX * dt;
    blob.deformXY += blob.deformVXY * dt;
    blob.deformYY += blob.deformVYY * dt;
    this.limitDeformation(blob);
  }

  merge(a, b) {
    if (!this.blobs.includes(a) || !this.blobs.includes(b)) return;
    this.blobs = this.blobs.filter((blob) => blob !== a && blob !== b);
    if (a.level === LEVEL_COUNT - 1) {
      this.score += ENDLESS_CLEAR_SCORE;
      this.updateScore();
      return;
    }
    const level = a.level + 1;
    const merged = this.createBlob((a.x + b.x) / 2, (a.y + b.y) / 2, level);
    merged.vx = (a.vx + b.vx) * 0.5 + (Math.random() - 0.5) * 28;
    merged.vy = Math.min(-65, (a.vy + b.vy) * 0.35 - 45);
    merged.angularVelocity = (a.angularVelocity + b.angularVelocity) * 0.5;
    for (let i = 0; i < merged.offsets.length; i += 1) {
      merged.offsets[i] = Math.sin(i / merged.offsets.length * Math.PI * 2) * merged.radius * 0.08;
    }
    this.blobs.push(merged);
    this.score += mergeScore(level);
    this.updateScore();
    if (level === LEVEL_COUNT - 1 && this.mode === 'classic') this.finish(true);
  }

  checkDanger(dt) {
    const overflowing = this.blobs.some((blob) => (
      blob.age > 0.9 && blob.y - this.supportRadius(blob, 0, 1) < 164
    ));
    if (!overflowing) {
      this.dangerDuration = 0;
      return;
    }
    this.dangerDuration += dt;
    if (this.dangerDuration > 2.2) this.finish(false);
  }

  updateScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.mode, this.bestScore);
    }
    this.scoreElement.textContent = String(this.score);
    this.bestScoreElement.textContent = String(this.bestScore);
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
    context.beginPath();
    context.arc(48, 48, 45, 0, Math.PI * 2);
    context.clip();
    context.drawImage(this.images.get(levelIndex), 0, 0, 96, 96);
    container.append(canvas);
  }

  finish(won) {
    if (this.isFinished) return;
    this.isFinished = true;
    this.canDrop = false;
    clearTimeout(this.dropTimer);
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
    const ctx = this.context;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawAim(ctx);
    for (const blob of [...this.blobs].sort((a, b) => a.y - b.y)) this.drawBlob(ctx, blob);
    if (this.dangerDuration > 0 && !this.isFinished) {
      const pulse = 0.45 + Math.sin(performance.now() / 110) * 0.2;
      ctx.fillStyle = `rgba(189, 53, 92, ${pulse})`;
      ctx.fillRect(0, 161, WORLD_WIDTH, 3);
    }
  }

  drawAim(ctx) {
    if (!this.canDrop || this.isFinished) return;
    const radius = LEVELS[this.currentLevel].radius;
    const x = clamp(this.aimX, radius + 5, WORLD_WIDTH - radius - 5);
    const y = Math.max(radius + 8, 135 - radius);
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(91, 49, 119, 0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + radius + 5);
    ctx.lineTo(x, Math.min(WORLD_HEIGHT - 30, y + radius + 110));
    ctx.stroke();
    ctx.globalAlpha = 0.72;
    this.drawTextureCircle(ctx, x, y, radius, this.currentLevel);
    ctx.restore();
  }

  drawBlob(ctx, blob) {
    const matrix = deformationMatrix(blob);
    const points = blob.offsets.map((offset, index) => {
      const angle = index / blob.offsets.length * Math.PI * 2;
      const radius = blob.radius + offset;
      const localX = Math.cos(angle) * radius;
      const localY = Math.sin(angle) * radius;
      return {
        x: blob.x + matrix.a * localX + matrix.c * localY,
        y: blob.y + matrix.b * localX + matrix.d * localY,
      };
    });
    ctx.save();
    this.softPath(ctx, points);
    ctx.clip();
    ctx.translate(blob.x, blob.y);
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
    this.drawImageCover(ctx, this.images.get(blob.level), 0, 0, blob.radius * 1.18);
    const highlight = ctx.createRadialGradient(-blob.radius * 0.35, -blob.radius * 0.42, 0, 0, 0, blob.radius * 1.1);
    highlight.addColorStop(0, 'rgba(255,255,255,0.28)');
    highlight.addColorStop(0.48, 'rgba(255,255,255,0)');
    highlight.addColorStop(1, 'rgba(60,25,77,0.14)');
    ctx.fillStyle = highlight;
    ctx.fillRect(-blob.radius * 1.2, -blob.radius * 1.2, blob.radius * 2.4, blob.radius * 2.4);
    ctx.restore();
    ctx.save();
    this.softPath(ctx, points);
    ctx.strokeStyle = 'rgba(75, 38, 95, 0.34)';
    ctx.lineWidth = Math.max(1.5, blob.radius * 0.028);
    ctx.stroke();
    ctx.restore();
  }

  softPath(ctx, points) {
    const first = midpoint(points[points.length - 1], points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const middle = midpoint(current, next);
      ctx.quadraticCurveTo(current.x, current.y, middle.x, middle.y);
    }
    ctx.closePath();
  }

  drawTextureCircle(ctx, x, y, radius, level) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    this.drawImageCover(ctx, this.images.get(level), x, y, radius);
    ctx.restore();
  }

  drawImageCover(ctx, image, x, y, radius) {
    const width = image?.naturalWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.height || 0;
    if (!width || !height) {
      ctx.fillStyle = '#d8bce9';
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      return;
    }
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;
    ctx.drawImage(image, sx, sy, side, side, x - radius, y - radius, radius * 2, radius * 2);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    clearTimeout(this.dropTimer);
    this.resizeObserver?.disconnect();
    this.abortController.abort();
    this.blobs.length = 0;
  }
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function deformationMatrix(blob) {
  const cosine = Math.cos(blob.rotation);
  const sine = Math.sin(blob.rotation);
  return {
    a: blob.deformXX * cosine + blob.deformXY * sine,
    b: blob.deformXY * cosine + blob.deformYY * sine,
    c: -blob.deformXX * sine + blob.deformXY * cosine,
    d: -blob.deformXY * sine + blob.deformYY * cosine,
  };
}

function nxOr(dx, distance) {
  return distance < 0.001 ? 1 : dx / distance;
}

function nyOr(dy, distance) {
  return distance < 0.001 ? 0 : dy / distance;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createFruitTexture(level) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.translate(128, 128);
  context.scale(91.43, 91.43);
  const rgb = hexRgb(level.color);
  const gradient = context.createRadialGradient(-0.28, -0.38, 0.08, 0, 0, 1.3);
  gradient.addColorStop(0, rgba(mixColor(rgb, [255, 255, 255], 0.42), 1));
  gradient.addColorStop(0.54, level.color);
  gradient.addColorStop(1, level.shade);
  context.fillStyle = gradient;
  context.fillRect(-1.4, -1.4, 2.8, 2.8);

  let seed = level.index * 97 + 13;
  const random = () => {
    seed = seed * 16807 % 2147483647;
    return seed / 2147483647;
  };
  drawFruitPattern(context, level.pattern, random);

  const shade = context.createRadialGradient(-0.42, -0.5, 0.02, 0, 0, 1.12);
  shade.addColorStop(0, 'rgba(255,255,255,0.34)');
  shade.addColorStop(0.32, 'rgba(255,255,255,0)');
  shade.addColorStop(0.72, 'rgba(0,0,0,0)');
  shade.addColorStop(1, rgba(hexRgb(level.outline), 0.52));
  context.fillStyle = shade;
  context.fillRect(-1.25, -1.25, 2.5, 2.5);
  drawFruitFace(context);
  return canvas;
}

function drawFruitPattern(context, pattern, random) {
  if (pattern === 'strawberry') {
    for (let y = -0.82; y < 1.05; y += 0.28) {
      for (let x = -1; x < 1.1; x += 0.28) {
        const offsetX = x + (Math.round(y / 0.28) % 2 ? 0.14 : 0);
        if (offsetX * offsetX + y * y > 1) continue;
        context.fillStyle = 'rgba(255,236,150,0.9)';
        context.beginPath();
        context.ellipse(offsetX, y, 0.035, 0.055, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    return;
  }
  if (pattern === 'grape') {
    for (let index = 0; index < 16; index += 1) {
      context.fillStyle = `rgba(230,210,255,${0.08 + random() * 0.1})`;
      context.beginPath();
      context.arc(random() * 2 - 1, random() * 2 - 1, 0.1 + random() * 0.2, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  if (pattern === 'citrus' || pattern === 'orange') {
    for (let index = 0; index < 260; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 1.1;
      context.fillStyle = `rgba(${pattern === 'citrus' ? '170,90,0' : '160,60,0'},${0.12 + random() * 0.12})`;
      context.beginPath();
      context.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.018 + random() * 0.02, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  if (pattern === 'apple') {
    context.fillStyle = 'rgba(255,90,60,0.24)';
    context.beginPath();
    context.ellipse(0.36, 0.2, 0.62, 0.52, 0.3, 0, Math.PI * 2);
    context.fill();
    for (let index = 0; index < 90; index += 1) {
      context.fillStyle = 'rgba(250,255,210,0.35)';
      context.beginPath();
      context.arc(random() * 2.2 - 1.1, random() * 2.2 - 1.1, 0.015, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  if (pattern === 'peach') {
    context.fillStyle = 'rgba(255,70,110,0.25)';
    context.beginPath();
    context.ellipse(0.3, 0.1, 0.7, 0.8, 0.2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(190,40,80,0.38)';
    context.lineWidth = 0.06;
    context.beginPath();
    context.moveTo(-0.05, -1.1);
    context.bezierCurveTo(-0.35, -0.4, -0.2, 0.4, 0.1, 1.1);
    context.stroke();
    return;
  }
  if (pattern === 'pear') {
    for (let index = 0; index < 160; index += 1) {
      context.fillStyle = `rgba(140,100,20,${0.15 + random() * 0.2})`;
      context.beginPath();
      context.arc(random() * 2.4 - 1.2, random() * 2.4 - 1.2, 0.012 + random() * 0.015, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = 'rgba(160,210,60,0.2)';
    context.beginPath();
    context.ellipse(-0.4, 0.4, 0.7, 0.5, 0, 0, Math.PI * 2);
    context.fill();
    return;
  }
  if (pattern === 'pitaya') {
    for (let y = -1.1; y < 1.3; y += 0.42) {
      for (let x = -1.2; x < 1.3; x += 0.46) {
        const offsetX = x + (Math.round(y / 0.42) % 2 ? 0.23 : 0);
        context.strokeStyle = 'rgba(120,220,90,0.95)';
        context.lineWidth = 0.07;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(offsetX - 0.14, y + 0.1);
        context.quadraticCurveTo(offsetX, y - 0.02, offsetX + 0.1, y - 0.16);
        context.stroke();
      }
    }
    return;
  }
  if (pattern === 'watermelon') {
    context.fillStyle = '#0d5a26';
    for (let stripe = -5; stripe <= 5; stripe += 1) {
      const origin = stripe * 0.27;
      context.beginPath();
      context.moveTo(origin - 0.05, -1.5);
      for (let y = -1.5; y <= 1.5; y += 0.12) {
        context.lineTo(origin + Math.sin(y * 9 + stripe) * 0.05 + 0.06 * Math.cos(y * 3), y);
      }
      for (let y = 1.5; y >= -1.5; y -= 0.12) {
        context.lineTo(origin + Math.sin(y * 9 + stripe + 1) * 0.05 - 0.06 + 0.06 * Math.cos(y * 3), y);
      }
      context.fill();
    }
    return;
  }
  context.fillStyle = 'rgba(255,255,255,0.14)';
  context.beginPath();
  context.ellipse(-0.3, -0.3, 0.5, 0.35, -0.6, 0, Math.PI * 2);
  context.fill();
}

function drawFruitFace(context) {
  context.fillStyle = 'rgba(255,90,120,0.3)';
  context.beginPath();
  context.ellipse(-0.43, 0.19, 0.12, 0.065, 0, 0, Math.PI * 2);
  context.ellipse(0.43, 0.19, 0.12, 0.065, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#2a0f1c';
  for (const x of [-0.25, 0.25]) {
    context.beginPath();
    context.ellipse(x, -0.03, 0.075, 0.105, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(x - 0.022, -0.065, 0.024, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2a0f1c';
  }
  context.strokeStyle = '#2a0f1c';
  context.lineWidth = 0.04;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-0.11, 0.2);
  context.quadraticCurveTo(0, 0.34, 0.11, 0.2);
  context.stroke();
}

function hexRgb(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(first, second, amount) {
  return first.map((value, index) => Math.round(value + (second[index] - value) * amount));
}

function rgba(color, alpha) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}
