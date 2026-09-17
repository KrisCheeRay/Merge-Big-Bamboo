import './style.css';
import { SoftBambooGame } from './game-pbd.js';

const app = document.querySelector('#app');
let game = null;

app.innerHTML = '<div id="view-root"></div>';
showModeSelect();

function showModeSelect() {
  game?.destroy();
  game = null;
  document.querySelector('#view-root').innerHTML = `
    <main class="page-shell mode-page soft-mode-page">
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
      <section class="mode-card" aria-labelledby="mode-title">
        <p class="eyebrow">软萌果冻物理 · 十级挑战</p>
        <h1 id="mode-title">流心西瓜</h1>
        <p class="mode-intro">水果会随着碰撞挤压、回弹和摇晃，最高分会保存在当前浏览器中。</p>
        <div class="mode-grid">
          <button class="mode-option" type="button" data-mode="classic">
            <span class="mode-badge">经典模式</span>
            <strong>合成第 10 级通关</strong>
            <small>规划落点，在堆满警戒线前合成最终的西瓜。</small>
          </button>
          <button class="mode-option endless" type="button" data-mode="endless">
            <span class="mode-badge">无尽模式</span>
            <strong>两个西瓜合成后清场</strong>
            <small>两个第 10 级消失，奖励 1024 分并继续挑战。</small>
          </button>
        </div>
        <p class="mode-note">十级水果使用适合软体形变的程序化纹理。</p>
      </section>
    </main>`;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => startGame(button.dataset.mode));
  });
}

function startGame(mode) {
  const selectedMode = mode === 'endless' ? 'endless' : 'classic';
  game?.destroy();
  const viewRoot = document.querySelector('#view-root');
  game = new SoftBambooGame(viewRoot, {
    mode: selectedMode,
    callbacks: {
      onRestartRequest: () => {
        if (window.confirm('重新开始会清空本局进度，确定要继续吗？')) startGame(selectedMode);
      },
      onPlayAgain: () => startGame(selectedMode),
      onBackToModes: () => {
        if (window.confirm('返回模式选择会清空本局进度，确定要继续吗？')) showModeSelect();
      },
    },
  });
  game.start();
}

window.addEventListener('beforeunload', () => game?.destroy(), { once: true });
