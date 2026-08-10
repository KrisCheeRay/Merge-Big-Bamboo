import './style.css';
import { MergeMilkFrogGame } from './game.js';
import {
  LEVELS,
  loadAppearanceSelection,
  saveAppearanceSelection,
} from './config.js';
import {
  createGameSession,
  fetchLeaderboard,
  getPlayerProfile,
  submitScore,
  updateNickname,
  validateNickname,
} from './leaderboard.js';

const app = document.querySelector('#app');
let game = null;
let currentMode = 'classic';
let activeModal = null;
let launchSequence = 0;
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
        <p class="eyebrow">全新双模式挑战</p>
        <h1 id="mode-title">合成大奶蛙</h1>
        <p class="mode-intro">选择玩法开始挑战，两种模式拥有独立的在线排行榜。</p>
        <div class="mode-grid">
          <button class="mode-option" type="button" data-mode="classic">
            <span class="mode-badge">经典模式</span>
            <strong>合成第 10 级通关</strong>
            <small>保留原版节奏，冲击更高通关分数。</small>
          </button>
          <button class="mode-option endless" type="button" data-mode="endless">
            <span class="mode-badge">无尽模式</span>
            <strong>最大球合成后清场</strong>
            <small>两个第 10 级消失，奖励 1024 分并继续挑战。</small>
          </button>
        </div>
        <div class="mode-secondary-actions">
          <button class="secondary-wide-button" id="open-appearance" type="button">搭配球体外观</button>
          <button class="secondary-wide-button" id="open-leaderboard" type="button">查看在线排行榜</button>
        </div>
        <p class="mode-note">每一级都能在原版和新角色之间选择；只改变外观，不影响分数和排行榜。</p>
      </section>
    </main>
  `;

  viewRoot.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => startGame(button.dataset.mode));
  });
  viewRoot.querySelector('#open-appearance').addEventListener('click', openAppearanceDialog);
  viewRoot.querySelector('#open-leaderboard').addEventListener('click', () => openLeaderboard(currentMode));
}

async function startGame(mode) {
  const selectedMode = mode === 'endless' ? 'endless' : 'classic';
  const sequence = ++launchSequence;
  currentMode = selectedMode;
  game?.destroy();
  game = null;
  const viewRoot = document.querySelector('#view-root');
  viewRoot.innerHTML = '<div class="launch-status">正在准备游戏…</div>';

  let sessionId = '';
  try {
    const session = await createGameSession(selectedMode);
    sessionId = session.sessionId;
  } catch {
    // 排行榜服务离线时仍允许正常游戏，本局结束后提示未能上榜。
  }

  if (sequence !== launchSequence) return;

  game = new MergeMilkFrogGame(viewRoot, {
    mode: selectedMode,
    sessionId,
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
      onLeaderboardRequest: (requestedMode) => openLeaderboard(requestedMode),
      onFinish: handleGameFinish,
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
            <p>每一级可单独选择原版或新变体，GIF 角色会在游戏中持续播放动画。</p>
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
        ${variant.animation ? '<span class="gif-badge">GIF 动画</span>' : ''}
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

async function handleGameFinish(result) {
  try {
    const profile = await ensureNickname();
    if (!profile) {
      game?.setSubmitStatus('未填写昵称，本局成绩没有提交。', 'warning');
      return;
    }
    if (!result.sessionId) {
      game?.setSubmitStatus('排行榜服务未连接，本局成绩仅保存在本机。', 'warning');
      return;
    }
    const response = await submitScore(result);
    const rankText = response.rank ? `，当前第 ${response.rank} 名` : '';
    game?.setSubmitStatus(response.updated
      ? `个人最高分已更新${rankText}`
      : `成绩已提交，个人最高分仍为 ${response.bestScore}${rankText}`, 'success');
  } catch (error) {
    game?.setSubmitStatus(error.message || '成绩提交失败，请稍后再试。', 'error');
  }
}

async function ensureNickname() {
  const profile = getPlayerProfile();
  if (profile.nickname) return profile;
  return openNicknameDialog();
}

function openNicknameDialog({ allowCancel = true } = {}) {
  return new Promise((resolve) => {
    const modalRoot = document.querySelector('#modal-root');
    const current = getPlayerProfile();
    modalRoot.innerHTML = `
      <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="nickname-title">
        <form class="modal-panel nickname-panel" id="nickname-form">
          <p class="overlay-kicker">排行榜身份</p>
          <h2 id="nickname-title">设置你的昵称</h2>
          <p>昵称允许重复，只用于排行榜展示。支持 1～16 个字符。</p>
          <input id="nickname-input" maxlength="16" autocomplete="nickname" value="${escapeAttribute(current.nickname)}" placeholder="请输入昵称" />
          <p class="form-error" id="nickname-error" aria-live="polite"></p>
          <div class="modal-actions">
            ${allowCancel ? '<button class="soft-button" type="button" id="cancel-nickname">取消</button>' : ''}
            <button class="primary-button" type="submit">保存昵称</button>
          </div>
        </form>
      </div>
    `;
    activeModal = modalRoot.querySelector('.app-modal');
    const input = modalRoot.querySelector('#nickname-input');
    const error = modalRoot.querySelector('#nickname-error');
    input.focus();

    const close = (value) => {
      modalRoot.replaceChildren();
      activeModal = null;
      resolve(value);
    };

    modalRoot.querySelector('#cancel-nickname')?.addEventListener('click', () => close(null));
    modalRoot.querySelector('#nickname-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const nickname = input.value.trim();
      error.textContent = '';
      if (!nickname || [...nickname].length > 16) {
        error.textContent = '请输入 1～16 个字符的昵称。';
        return;
      }
      try {
        await validateNickname(nickname);
        close(updateNickname(nickname));
      } catch (validationError) {
        error.textContent = validationError.message;
      }
    });
  });
}

async function openLeaderboard(initialMode = 'classic') {
  if (activeModal) return;
  const profile = await ensureNickname();
  if (!profile) return;
  const modalRoot = document.querySelector('#modal-root');
  let mode = initialMode === 'endless' ? 'endless' : 'classic';

  modalRoot.innerHTML = `
    <div class="app-modal leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
      <section class="modal-panel leaderboard-panel">
        <div class="leaderboard-heading">
          <div>
            <p class="overlay-kicker">所有玩家共同排名 · 展示前 100 名</p>
            <h2 id="leaderboard-title">在线排行榜</h2>
          </div>
          <button class="modal-close" id="close-leaderboard" type="button" aria-label="关闭排行榜">×</button>
        </div>
        <div class="leaderboard-tabs" role="tablist">
          <button type="button" data-rank-mode="classic">经典模式</button>
          <button type="button" data-rank-mode="endless">无尽模式</button>
        </div>
        <div class="leaderboard-body" id="leaderboard-body"><p class="loading-text">正在加载排行榜…</p></div>
        <div class="leaderboard-footer">
          <span>当前昵称：<strong id="current-nickname"></strong></span>
          <button class="soft-button" id="edit-nickname" type="button">修改昵称</button>
        </div>
      </section>
    </div>
  `;
  activeModal = modalRoot.querySelector('.app-modal');
  const body = modalRoot.querySelector('#leaderboard-body');
  const nicknameElement = modalRoot.querySelector('#current-nickname');
  nicknameElement.textContent = getPlayerProfile().nickname;

  const close = () => {
    modalRoot.replaceChildren();
    activeModal = null;
  };
  modalRoot.querySelector('#close-leaderboard').addEventListener('click', close);
  activeModal.addEventListener('click', (event) => {
    if (event.target === activeModal) close();
  });

  async function load() {
    modalRoot.querySelectorAll('[data-rank-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.rankMode === mode);
    });
    body.innerHTML = '<p class="loading-text">正在加载排行榜…</p>';
    try {
      const data = await fetchLeaderboard(mode);
      renderLeaderboard(body, data);
    } catch (error) {
      body.innerHTML = `<p class="leaderboard-error">${escapeHtml(error.message || '排行榜加载失败')}</p>`;
    }
  }

  modalRoot.querySelectorAll('[data-rank-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      mode = button.dataset.rankMode;
      load();
    });
  });
  modalRoot.querySelector('#edit-nickname').addEventListener('click', async () => {
    close();
    const changed = await openNicknameDialog();
    if (changed) openLeaderboard(mode);
  });
  load();
}

function renderLeaderboard(container, data) {
  const rows = data.entries.length
    ? data.entries.map((entry) => `
      <li class="rank-row ${entry.isCurrentPlayer ? 'current-player' : ''}">
        <span class="rank-number">${entry.rank}</span>
        <span class="rank-name">${escapeHtml(entry.nickname)}</span>
        <strong>${entry.score}</strong>
      </li>
    `).join('')
    : '<li class="empty-ranking">还没有成绩，来成为第一名吧。</li>';

  container.innerHTML = `
    <div class="rank-scroll" tabindex="0" aria-label="排行榜前 100 名，可上下滚动">
      <ol class="rank-list">${rows}</ol>
    </div>
    <div class="my-ranking">
      <span>我的最高分</span>
      <strong>${data.me?.bestScore ?? 0}</strong>
      <span>${data.me?.rank ? `第 ${data.me.rank} 名` : '尚未上榜'}</span>
    </div>
  `;
}

function socialLinks() {
  return `
    <nav class="social-links" aria-label="站外链接">
      <a class="social-link github-link" href="https://github.com/Arch-Tempered-mortis/merge-big-milk-frog" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看 GitHub 源码" title="查看 GitHub 源码">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7C5.7.7.7 5.8.7 12.2c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a10.8 10.8 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.1c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.8-10.9C23.3 5.8 18.3.7 12 .7Z" /></svg>
      </a>
      <a class="social-link bilibili-link" href="https://space.bilibili.com/305672036" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看 GeForceRTX8080ti 的哔哩哔哩主页" title="查看我的哔哩哔哩主页">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 2.6a1 1 0 0 1 1.4.1L12 5l2.4-2.3a1 1 0 1 1 1.4 1.4L14.9 5H18a3.5 3.5 0 0 1 3.5 3.5v8A3.5 3.5 0 0 1 18 20H6a3.5 3.5 0 0 1-3.5-3.5v-8A3.5 3.5 0 0 1 6 5h3.1l-.9-.9a1 1 0 0 1 0-1.5ZM6 7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6 18h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18 7H6Zm2.5 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm7 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm-6.7 4.2a1 1 0 0 1 1.4 0c1 1 2.6 1 3.6 0a1 1 0 1 1 1.4 1.4 4.6 4.6 0 0 1-6.4 0 1 1 0 0 1 0-1.4Z" /></svg>
      </a>
    </nav>
  `;
}

function escapeAttribute(value) {
  return String(value || '').replace(/[&"<>]/g, (character) => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;',
  }[character]));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

window.addEventListener('beforeunload', () => game?.destroy(), { once: true });
