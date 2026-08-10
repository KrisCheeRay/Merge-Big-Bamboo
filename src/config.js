export const LEVEL_COUNT = 10;
export const ENDLESS_CLEAR_SCORE = 1024;
export const AUDIO_PREFERENCES_KEY = 'merge-big-milk-frog-audio-v1';
export const PLAYER_PROFILE_KEY = 'merge-big-milk-frog-player-v1';
export const APPEARANCE_SELECTION_KEY = 'merge-big-milk-frog-appearance-v1';
const BEST_SCORE_KEY_PREFIX = 'merge-big-milk-frog-best-score-v2';

const COLORS = [
  '#fff1a8',
  '#f9df7b',
  '#d9ed92',
  '#b5e48c',
  '#99d98c',
  '#76c893',
  '#52b788',
  '#40916c',
  '#2d6a4f',
  '#1b4332',
];

const VARIANT_DEFINITIONS = [
  {
    name: '舞蹈奶龙',
    image: 'level-1-dance.gif',
    animation: {
      sheet: 'level-1-dance-sheet.webp',
      frameWidth: 155,
      frameHeight: 208,
      columns: 7,
      frameCount: 27,
      durationMs: 1790,
    },
  },
  { name: '委屈奶龙', image: 'level-2-sad.png' },
  { name: '生气奶龙', image: 'level-3-angry.png' },
  { name: '奶狗', image: 'level-4-dog.png' },
  { name: '奶鱼', image: 'level-5-fish.jpeg' },
  { name: '奶猴', image: 'level-6-monkey.png' },
  {
    name: '持剑奶龙',
    image: 'level-7-sword.gif',
    animation: {
      sheet: 'level-7-sword-sheet.webp',
      frameWidth: 240,
      frameHeight: 240,
      columns: 7,
      frameCount: 42,
      durationMs: 2790,
    },
  },
  { name: '功德奶龙', image: 'level-8-monk.jpeg' },
  { name: '天使奶龙', image: 'level-9-angel.png' },
  {
    name: '大笑奶龙',
    image: 'level-10-laugh.gif',
    animation: {
      sheet: 'level-10-laugh-sheet.webp',
      frameWidth: 160,
      frameHeight: 160,
      columns: 9,
      frameCount: 68,
      durationMs: 4470,
    },
  },
];

export const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, index) => {
  const originalImage = `${import.meta.env.BASE_URL}assets/balls/level-${index + 1}.png`;
  const variant = VARIANT_DEFINITIONS[index];
  return {
    index,
    label: String(index + 1),
    color: COLORS[index],
    image: originalImage,
    appearances: {
      original: {
        id: 'original',
        name: '原版',
        preview: originalImage,
        image: originalImage,
      },
      variant: {
        id: 'variant',
        name: variant.name,
        preview: `${import.meta.env.BASE_URL}assets/variants/${variant.image}`,
        image: `${import.meta.env.BASE_URL}assets/variants/${variant.image}`,
        animation: variant.animation
          ? {
              ...variant.animation,
              sheet: `${import.meta.env.BASE_URL}assets/animations/${variant.animation.sheet}`,
            }
          : null,
      },
    },
  };
});

export const MERGE_SOUND_POOL = [5, 6, 7, 8, 9, 10].map(
  (level) => `${import.meta.env.BASE_URL}assets/sounds/level-${level}.mp3`
);

export const WIN_SOUND = `${import.meta.env.BASE_URL}assets/sounds/level-10.mp3`;

const SPAWN_TABLE = [
  { level: 0, cumulative: 0.4 },
  { level: 1, cumulative: 0.7 },
  { level: 2, cumulative: 0.9 },
  { level: 3, cumulative: 1 },
];

export function randomSpawnLevel() {
  const value = Math.random();
  return SPAWN_TABLE.find((item) => value < item.cumulative)?.level ?? 0;
}

export function createDefaultAppearanceSelection() {
  return Array.from({ length: LEVEL_COUNT }, () => 'original');
}

export function normalizeAppearanceSelection(selection) {
  const saved = Array.isArray(selection) ? selection : [];
  return Array.from({ length: LEVEL_COUNT }, (_, index) => (
    saved[index] === 'variant' ? 'variant' : 'original'
  ));
}

export function loadAppearanceSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_SELECTION_KEY) || '[]');
    return normalizeAppearanceSelection(saved);
  } catch {
    return createDefaultAppearanceSelection();
  }
}

export function saveAppearanceSelection(selection) {
  const normalized = normalizeAppearanceSelection(selection);
  try {
    localStorage.setItem(APPEARANCE_SELECTION_KEY, JSON.stringify(normalized));
  } catch {
    // 浏览器禁用本地存储时，外观选择仅在当前页面内有效。
  }
  return normalized;
}

export function getLevelAppearance(levelIndex, selection) {
  const level = LEVELS[levelIndex] || LEVELS[0];
  const normalized = normalizeAppearanceSelection(selection);
  return level.appearances[normalized[level.index]] || level.appearances.original;
}

export function getRadius(level) {
  const minRadius = 25;
  const maxRadius = 90;
  const ratio = level / (LEVEL_COUNT - 1);
  return Math.round(minRadius + (maxRadius - minRadius) * ratio);
}

export function getMergeScore(level) {
  return 2 ** level;
}

export function loadBestScore(mode = 'classic') {
  try {
    const value = Number(localStorage.getItem(`${BEST_SCORE_KEY_PREFIX}-${mode}`));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(mode, score) {
  try {
    localStorage.setItem(
      `${BEST_SCORE_KEY_PREFIX}-${mode}`,
      String(Math.max(0, Math.floor(score)))
    );
  } catch {
    // 浏览器禁用本地存储时，最高分仅在当前页面内有效。
  }
}

export function loadPlayerProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_PROFILE_KEY) || '{}');
    return {
      playerId: typeof saved.playerId === 'string' ? saved.playerId : '',
      nickname: typeof saved.nickname === 'string' ? saved.nickname : '',
    };
  } catch {
    return { playerId: '', nickname: '' };
  }
}

export function savePlayerProfile(profile) {
  try {
    localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify({
      playerId: profile.playerId || '',
      nickname: profile.nickname || '',
    }));
  } catch {
    // 浏览器禁用本地存储时，身份仅在当前页面内有效。
  }
}

export function loadAudioPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_KEY) || '{}');
    const volume = Number(saved.volume);
    return {
      enabled: saved.enabled !== false,
      volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : 0.7,
    };
  } catch {
    return { enabled: true, volume: 0.7 };
  }
}

export function saveAudioPreferences(preferences) {
  try {
    localStorage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify({
      enabled: preferences.enabled !== false,
      volume: clamp(Number(preferences.volume), 0, 1),
    }));
  } catch {
    // 浏览器禁用本地存储时，偏好仍在当前页面内生效。
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
