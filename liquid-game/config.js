export const LEVEL_COUNT = 10;
export const ENDLESS_CLEAR_SCORE = 1024;
const BEST_SCORE_PREFIX = 'merge-soft-bamboo-best-v1';

const RADII = [25, 31, 38, 45, 53, 61, 70, 79, 89, 100];
const FRUITS = [
  { name: '樱桃', color: '#e0223f', shade: '#8c0a24', outline: '#5a0616', pattern: 'cherry' },
  { name: '草莓', color: '#ff4f6d', shade: '#c21c43', outline: '#6e0d24', pattern: 'strawberry' },
  { name: '葡萄', color: '#9b6cff', shade: '#5a2fc2', outline: '#2d1370', pattern: 'grape' },
  { name: '金桔', color: '#ffbe2e', shade: '#e5820c', outline: '#7a3f00', pattern: 'citrus' },
  { name: '橙子', color: '#ff8a1f', shade: '#d65400', outline: '#6f2800', pattern: 'orange' },
  { name: '青苹果', color: '#9be05a', shade: '#4fa826', outline: '#23520c', pattern: 'apple' },
  { name: '蜜桃', color: '#ffa7bd', shade: '#f0607e', outline: '#7c2438', pattern: 'peach' },
  { name: '香梨', color: '#f2e27a', shade: '#c9ac2c', outline: '#5f4c05', pattern: 'pear' },
  { name: '火龙果', color: '#ff3fa4', shade: '#b8106a', outline: '#5c0433', pattern: 'pitaya' },
  { name: '西瓜', color: '#3fcf5a', shade: '#16863a', outline: '#073d18', pattern: 'watermelon' },
];

export const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, index) => ({
  index,
  label: String(index + 1),
  radius: RADII[index],
  ...FRUITS[index],
}));

export function randomSpawnLevel(highestLevel = 0) {
  const cap = Math.min(4, Math.max(2, highestLevel - 1));
  const weights = [30, 26, 20, 14, 10].slice(0, cap + 1);
  let choice = weights.reduce((total, weight) => total + weight, 0) * Math.random();
  for (let level = 0; level < weights.length; level += 1) {
    choice -= weights[level];
    if (choice <= 0) return level;
  }
  return 0;
}

export function mergeScore(level) {
  return level * (level + 1) / 2 + 1;
}

export function loadBestScore(mode) {
  try {
    const value = Number(localStorage.getItem(`${BEST_SCORE_PREFIX}-${mode}`));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(mode, score) {
  try {
    localStorage.setItem(`${BEST_SCORE_PREFIX}-${mode}`, String(Math.max(0, Math.floor(score))));
  } catch {}
}
