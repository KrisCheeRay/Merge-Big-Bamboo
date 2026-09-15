import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8787;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SCORE = 1_000_000_000;
const dataPath = resolve(dirname(fileURLToPath(import.meta.url)), 'data.json');

function emptyData() {
  return { players: {}, sessions: {}, scores: [] };
}

function loadData() {
  if (!existsSync(dataPath)) return emptyData();
  try {
    const parsed = JSON.parse(readFileSync(dataPath, 'utf8'));
    return {
      players: parsed.players && typeof parsed.players === 'object' ? parsed.players : {},
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
    };
  } catch {
    return emptyData();
  }
}

let data = loadData();

function saveData() {
  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function normalizeMode(value) {
  return value === 'endless' ? 'endless' : value === 'classic' ? 'classic' : '';
}

function validateNicknameValue(value) {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (!nickname || [...nickname].length > 16 || /[\u0000-\u001f\u007f]/u.test(nickname)) return null;
  return nickname;
}

function parseJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) rejectBody(new Error('请求内容过大'));
    });
    request.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        rejectBody(new Error('请求格式错误'));
      }
    });
    request.on('error', rejectBody);
  });
}

function getPlayerScore(mode, playerId) {
  return data.scores.find((entry) => entry.mode === mode && entry.playerId === playerId) || null;
}

function getRankedScores(mode) {
  return data.scores
    .filter((entry) => entry.mode === mode)
    .sort((a, b) => b.score - a.score || a.submittedAt - b.submittedAt);
}

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url || '/', 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && path === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && path === '/api/sessions') {
    const body = await parseJson(request);
    const mode = normalizeMode(body.mode);
    const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
    if (!mode || !playerId || playerId.length > 100) {
      sendJson(response, 400, { message: '游戏模式或玩家身份无效' });
      return;
    }
    data.players[playerId] ||= { nickname: '' };
    const sessionId = randomUUID();
    data.sessions[sessionId] = { mode, playerId, createdAt: Date.now() };
    saveData();
    sendJson(response, 201, { sessionId });
    return;
  }

  if (request.method === 'POST' && path === '/api/nicknames/validate') {
    const body = await parseJson(request);
    const nickname = validateNicknameValue(body.nickname);
    if (!nickname) {
      sendJson(response, 400, { message: '请输入 1～16 个字符的有效昵称' });
      return;
    }
    sendJson(response, 200, { valid: true, nickname });
    return;
  }

  if (request.method === 'POST' && path === '/api/scores') {
    const body = await parseJson(request);
    const mode = normalizeMode(body.mode);
    const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
    const session = data.sessions[body.sessionId];
    const score = Number(body.score);
    const nickname = validateNicknameValue(body.nickname);
    if (!mode || !playerId || !session || session.mode !== mode || session.playerId !== playerId || Date.now() - session.createdAt > SESSION_TTL_MS) {
      sendJson(response, 400, { message: '本局游戏凭证无效或已过期' });
      return;
    }
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE || !nickname) {
      sendJson(response, 400, { message: '成绩或昵称无效' });
      return;
    }
    data.players[playerId] = { nickname };
    const now = Date.now();
    const existing = getPlayerScore(mode, playerId);
    let updated = false;
    if (!existing) {
      data.scores.push({ mode, playerId, nickname, score, submittedAt: now });
      updated = true;
    } else if (score > existing.score) {
      existing.nickname = nickname;
      existing.score = score;
      existing.submittedAt = now;
      updated = true;
    } else {
      existing.nickname = nickname;
    }
    delete data.sessions[body.sessionId];
    saveData();
    const rank = getRankedScores(mode).findIndex((entry) => entry.playerId === playerId) + 1;
    sendJson(response, 200, { updated, bestScore: getPlayerScore(mode, playerId).score, rank });
    return;
  }

  if (request.method === 'GET' && path === '/api/leaderboard') {
    const mode = normalizeMode(url.searchParams.get('mode'));
    const playerId = url.searchParams.get('playerId') || '';
    if (!mode) {
      sendJson(response, 400, { message: '游戏模式无效' });
      return;
    }
    const ranked = getRankedScores(mode);
    const currentIndex = ranked.findIndex((entry) => entry.playerId === playerId);
    sendJson(response, 200, {
      entries: ranked.slice(0, 100).map((entry, index) => ({
        rank: index + 1,
        nickname: entry.nickname,
        score: entry.score,
        isCurrentPlayer: entry.playerId === playerId,
      })),
      me: currentIndex >= 0
        ? { bestScore: ranked[currentIndex].score, rank: currentIndex + 1 }
        : { bestScore: 0, rank: null },
    });
    return;
  }

  sendJson(response, 404, { message: '接口不存在' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(response, 400, { message: error.message || '请求失败' });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Leaderboard API listening on http://127.0.0.1:${PORT}`);
});
