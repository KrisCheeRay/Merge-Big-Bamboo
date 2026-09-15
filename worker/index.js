const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SCORE = 1_000_000_000;
const MAX_BODY_LENGTH = 64 * 1024;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeMode(value) {
  return value === 'classic' || value === 'endless' ? value : '';
}

function validPlayerId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= 100 ? id : '';
}

function validNickname(value) {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (!nickname || [...nickname].length > 16 || /[\u0000-\u001f\u007f]/u.test(nickname)) return '';
  return nickname;
}

async function parseBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_LENGTH) {
    throw new ApiError(413, '请求内容过大');
  }
  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) throw new ApiError(413, '请求内容过大');
  try {
    const data = body ? JSON.parse(body) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new ApiError(400, '请求格式错误');
  }
}

async function createSession(request, db) {
  const body = await parseBody(request);
  const mode = normalizeMode(body.mode);
  const playerId = validPlayerId(body.playerId);
  if (!mode || !playerId) throw new ApiError(400, '游戏模式或玩家身份无效');

  const now = Date.now();
  const sessionId = crypto.randomUUID();
  await db.prepare('DELETE FROM sessions WHERE created_at < ?').bind(now - SESSION_TTL_MS).run();
  await db.prepare('INSERT INTO sessions (id, mode, player_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, mode, playerId, now).run();
  return sendJson(201, { sessionId });
}

async function submitScore(request, db) {
  const body = await parseBody(request);
  const mode = normalizeMode(body.mode);
  const playerId = validPlayerId(body.playerId);
  const nickname = validNickname(body.nickname);
  const score = body.score;
  if (!mode || !playerId || !nickname || !Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new ApiError(400, '成绩、昵称或玩家身份无效');
  }
  if (typeof body.sessionId !== 'string' || body.sessionId.length > 100) {
    throw new ApiError(400, '本局游戏凭证无效或已过期');
  }

  const now = Date.now();
  const previous = await db.prepare('SELECT score FROM scores WHERE mode = ? AND player_id = ?')
    .bind(mode, playerId).first();
  // Deleting with RETURNING makes a session single-use even if two requests arrive together.
  const session = await db.prepare(`DELETE FROM sessions
    WHERE id = ? AND mode = ? AND player_id = ? AND created_at >= ? RETURNING id`)
    .bind(body.sessionId, mode, playerId, now - SESSION_TTL_MS).first();
  if (!session) throw new ApiError(400, '本局游戏凭证无效或已过期');

  await db.prepare(`INSERT INTO scores (mode, player_id, nickname, score, submitted_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (mode, player_id) DO UPDATE SET
      nickname = excluded.nickname,
      score = MAX(scores.score, excluded.score),
      submitted_at = CASE WHEN excluded.score > scores.score
        THEN excluded.submitted_at ELSE scores.submitted_at END`)
    .bind(mode, playerId, nickname, score, now).run();
  const me = await getMyRank(db, mode, playerId);
  return sendJson(200, {
    updated: !previous || score > previous.score,
    bestScore: me.bestScore,
    rank: me.rank,
  });
}

async function getMyRank(db, mode, playerId) {
  if (!playerId) return { bestScore: 0, rank: null };
  const mine = await db.prepare(`SELECT score, submitted_at FROM scores
    WHERE mode = ? AND player_id = ?`).bind(mode, playerId).first();
  if (!mine) return { bestScore: 0, rank: null };
  const preceding = await db.prepare(`SELECT COUNT(*) AS count FROM scores
    WHERE mode = ? AND (score > ? OR
      (score = ? AND (submitted_at < ? OR
        (submitted_at = ? AND player_id < ?))))`)
    .bind(mode, mine.score, mine.score, mine.submitted_at, mine.submitted_at, playerId).first();
  return { bestScore: mine.score, rank: Number(preceding.count) + 1 };
}

async function getLeaderboard(url, db) {
  const mode = normalizeMode(url.searchParams.get('mode'));
  if (!mode) throw new ApiError(400, '游戏模式无效');
  const playerId = validPlayerId(url.searchParams.get('playerId'));
  const { results } = await db.prepare(`SELECT player_id, nickname, score FROM scores
    WHERE mode = ? ORDER BY score DESC, submitted_at ASC, player_id ASC LIMIT 100`)
    .bind(mode).all();
  return sendJson(200, {
    entries: results.map((entry, index) => ({
      rank: index + 1,
      nickname: entry.nickname,
      score: entry.score,
      isCurrentPlayer: entry.player_id === playerId,
    })),
    me: await getMyRank(db, mode, playerId),
  });
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return sendJson(200, {});
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && path === '/api/health') {
    return sendJson(200, { ok: Boolean(env.bamboo_leaderboard) });
  }
  if (!env.bamboo_leaderboard) throw new ApiError(503, '排行榜数据库未连接');
  const db = env.bamboo_leaderboard;
  if (request.method === 'POST' && path === '/api/sessions') return createSession(request, db);
  if (request.method === 'POST' && path === '/api/scores') return submitScore(request, db);
  if (request.method === 'GET' && path === '/api/leaderboard') return getLeaderboard(url, db);
  if (request.method === 'POST' && path === '/api/nicknames/validate') {
    const nickname = validNickname((await parseBody(request)).nickname);
    if (!nickname) throw new ApiError(400, '请输入 1～16 个字符的有效昵称');
    return sendJson(200, { valid: true, nickname });
  }
  throw new ApiError(404, '接口不存在');
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Leaderboard request failed', error);
      return sendJson(error instanceof ApiError ? error.status : 500, {
        message: error instanceof ApiError ? error.message : '排行榜服务暂时不可用',
      });
    }
  },
};
