import './style.css';
import { MergeMilkFrogGame } from './game.js';
import {
  LEVELS,
  loadAppearanceSelection,
  saveAppearanceSelection,
} from './config.js';
const app = document.querySelector('#app');
let game = null;
let activeModal = null;
let appearanceSelection = loadAppearanceSelection();

renderAppShell();
showModeSelect();

function renderAppShell() {
  app.innerHTML = `
    <div id="view-root"></div>
    <div id="modal-root"></div>
  `;
}

function showModeSelect() {
  game?.destroy();
  game = null;
  const viewRoot = document.querySelector('#view-root');
  viewRoot.innerHTML = `
    <main class="page-shell mode-page">
      ${socialLinks()}
      <section class="mode-card" aria-labelledby="mode-title">
        <h1 id="mode-title">合成大竹头</h1>
        <p class="mode-intro">选择玩法开始挑战。</p>
        <div class="mode-grid">
          <button class="mode-option" type="button" data-mode="classic">
            <span class="mode-badge">经典模式</span>
            <strong>合成第 10 级通关</strong>
            <small>保留原版节奏，冲击更高通关分数。</small>
          </button>
          <button class="mode-option endless" type="button" data-mode="endless">
            <span class="mode-badge">无尽模式</span>
            <strong>最大竹头合成后清场</strong>
            <small>两个第 10 级消失，奖励 1024 分并继续挑战。</small>
          </button>
        </div>
        <div class="mode-secondary-actions one-action">
          <button class="secondary-wide-button" id="open-appearance" type="button">搭配球体外观</button>
        </div>
        <p class="mode-note">每一级都能在原版和新角色之间选择；只改变外观，不影响分数。</p>
      </section>
    </main>
  `;

  viewRoot.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => startGame(button.dataset.mode));
  });
  viewRoot.querySelector('#open-appearance').addEventListener('click', openAppearanceDialog);
}

function startGame(mode) {
  const selectedMode = mode === 'endless' ? 'endless' : 'classic';
  game?.destroy();
  game = null;
  const viewRoot = document.querySelector('#view-root');

  game = new MergeMilkFrogGame(viewRoot, {
    mode: selectedMode,
    appearanceSelection,
    callbacks: {
      onRestartRequest: () => {
        if (window.confirm('重新开始会清空本局进度，确定要继续吗？')) {
          startGame(selectedMode);
        }
      },
      onPlayAgain: () => startGame(selectedMode),
      onBackToModes: () => {
        if (window.confirm('返回模式选择会清空本局进度，确定要继续吗？')) {
          showModeSelect();
        }
      },
    },
  });
  game.start();
}

function openAppearanceDialog() {
  if (activeModal) return;
  const modalRoot = document.querySelector('#modal-root');
  let draftSelection = [...appearanceSelection];
  modalRoot.innerHTML = `
    <div class="app-modal appearance-modal" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <section class="modal-panel appearance-panel">
        <div class="appearance-heading">
          <div>
            <p class="overlay-kicker">十级独立搭配 · 自动保存</p>
            <h2 id="appearance-title">选择球体外观</h2>
            <p>每一级可单独选择原版或新变体，动态角色会在游戏中持续播放动画。</p>
          </div>
          <button class="modal-close" id="close-appearance" type="button" aria-label="关闭外观选择">×</button>
        </div>
        <div class="appearance-grid" id="appearance-grid" tabindex="-1">
          ${LEVELS.map((level) => appearanceLevelCard(level, draftSelection[level.index])).join('')}
        </div>
        <div class="appearance-footer">
          <button class="soft-button" id="all-original" type="button">全部原版</button>
          <button class="soft-button" id="all-variant" type="button">全部新变体</button>
          <button class="primary-button" id="save-appearance" type="button">保存搭配</button>
        </div>
      </section>
    </div>
  `;
  activeModal = modalRoot.querySelector('.app-modal');
  const grid = modalRoot.querySelector('#appearance-grid');

  const close = () => {
    modalRoot.replaceChildren();
    activeModal = null;
  };

  const renderGrid = () => {
    grid.innerHTML = LEVELS.map((level) => appearanceLevelCard(level, draftSelection[level.index])).join('');
  };

  grid.addEventListener('click', (event) => {
    const option = event.target.closest('[data-appearance-level][data-appearance-choice]');
    if (!option) return;
    const levelIndex = Number(option.dataset.appearanceLevel);
    draftSelection[levelIndex] = option.dataset.appearanceChoice === 'variant' ? 'variant' : 'original';
    grid.querySelectorAll(`[data-appearance-level="${levelIndex}"]`).forEach((button) => {
      const selected = button.dataset.appearanceChoice === draftSelection[levelIndex];
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  });

  modalRoot.querySelector('#all-original').addEventListener('click', () => {
    draftSelection = LEVELS.map(() => 'original');
    renderGrid();
    grid.focus({ preventScroll: true });
  });
  modalRoot.querySelector('#all-variant').addEventListener('click', () => {
    draftSelection = LEVELS.map(() => 'variant');
    renderGrid();
    grid.focus({ preventScroll: true });
  });
  modalRoot.querySelector('#save-appearance').addEventListener('click', () => {
    appearanceSelection = saveAppearanceSelection(draftSelection);
    close();
  });
  modalRoot.querySelector('#close-appearance').addEventListener('click', close);
  activeModal.addEventListener('click', (event) => {
    if (event.target === activeModal) close();
  });
}

function appearanceLevelCard(level, selectedChoice) {
  const original = level.appearances.original;
  const variant = level.appearances.variant;
  return `
    <article class="appearance-level-card">
      <div class="appearance-level-title">
        <strong>第 ${level.label} 级</strong>
        ${variant.animation ? '<span class="gif-badge">动态动画</span>' : ''}
      </div>
      <div class="appearance-options">
        ${appearanceOption(level.index, original, selectedChoice === 'original')}
        ${appearanceOption(level.index, variant, selectedChoice === 'variant')}
      </div>
    </article>
  `;
}

function appearanceOption(levelIndex, appearance, selected) {
  return `
    <button class="appearance-option ${selected ? 'selected' : ''}" type="button"
      data-appearance-level="${levelIndex}" data-appearance-choice="${appearance.id}"
      aria-pressed="${selected}">
      <span class="appearance-thumb"><img src="${appearance.preview}" alt="" /></span>
      <span>${escapeHtml(appearance.name)}</span>
    </button>
  `;
}

function socialLinks() {
  return `
    <nav class="social-links" aria-label="页面导航">
      <a class="social-link home-link" href="../" aria-label="返回主页" title="返回主页">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10.5 9-7.5 9 7.5" /><path d="M5 9v12h14V9" /><path d="M9 21v-6h6v6" /></svg>
      </a>
      <a class="social-link github-link" href="https://github.com/Arch-Tempered-mortis/merge-big-milk-frog" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看原版 GitHub 源码" title="原版 GitHub 源码">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z" /></svg>
      </a>
      <a class="social-link github-link" href="https://github.com/KrisCheeRay" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看修改版 GitHub 主页" title="修改版 GitHub 主页">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z" /></svg>
      </a>
      <a class="social-link bilibili-link" href="https://space.bilibili.com/596624087" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看我的哔哩哔哩主页" title="我的哔哩哔哩主页">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 2.6a1 1 0 0 1 1.4.1L12 5l2.4-2.3a1 1 0 1 1 1.4 1.4L14.9 5H18a3.5 3.5 0 0 1 3.5 3.5v8A3.5 3.5 0 0 1 18 20H6a3.5 3.5 0 0 1-3.5-3.5v-8A3.5 3.5 0 0 1 6 5h3.1l-.9-.9a1 1 0 0 1 0-1.5ZM6 7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6 18h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18 7H6Zm2.5 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm7 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm-6.7 4.2a1 1 0 0 1 1.4 0c1 1 2.6 1 3.6 0a1 1 0 1 1 1.4 1.4 4.6 4.6 0 0 1-6.4 0 1 1 0 0 1 0-1.4Z" /></svg>
      </a>
    </nav>
  `;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

window.addEventListener('beforeunload', () => game?.destroy(), { once: true });
