import './style.css';
import { MergeMilkFrogGame } from './game.js';

const app = document.querySelector('#app');
let game = null;

function startGame() {
  game?.destroy();
  game = new MergeMilkFrogGame(app, {
    onRestartRequest: () => {
      if (window.confirm('重新开始会清空本局进度，确定要继续吗？')) {
        startGame();
      }
    },
    onPlayAgain: () => startGame(),
  });
  game.start();
}

startGame();

window.addEventListener('beforeunload', () => game?.destroy(), { once: true });
