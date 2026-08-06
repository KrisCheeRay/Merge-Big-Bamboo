import { loadPlayerProfile, savePlayerProfile } from './config.js';

const API_BASE = `${import.meta.env.BASE_URL}api`;
let memoryProfile = loadPlayerProfile();

export function getPlayerProfile() {
  if (!memoryProfile.playerId) {
    memoryProfile.playerId = createPlayerId();
    savePlayerProfile(memoryProfile);
  }
  return { ...memoryProfile };
}

export function updateNickname(nickname) {
  memoryProfile = { ...getPlayerProfile(), nickname: nickname.trim() };
  savePlayerProfile(memoryProfile);
  return { ...memoryProfile };
}

export async function createGameSession(mode) {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ mode, playerId: getPlayerProfile().playerId }),
  });
}

export async function fetchLeaderboard(mode, playerId = getPlayerProfile().playerId) {
  const query = new URLSearchParams({ mode, playerId });
  return request(`/leaderboard?${query.toString()}`);
}

export async function submitScore(payload) {
  const profile = getPlayerProfile();
  return request('/scores', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      playerId: profile.playerId,
      nickname: profile.nickname,
    }),
  });
}

export async function validateNickname(nickname) {
  return request('/nicknames/validate', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '排行榜服务暂时不可用');
  }
  return data;
}

function createPlayerId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
