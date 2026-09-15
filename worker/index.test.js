import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from './index.js';

function createDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_leaderboard.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => sqlite.prepare(sql).get(...values) ?? null,
            run: async () => sqlite.prepare(sql).run(...values),
            all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
          };
        },
      };
    },
    close: () => sqlite.close(),
  };
}

async function call(db, method, path, body) {
  const response = await worker.fetch(new Request(`https://example.workers.dev${path}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }), { bamboo_leaderboard: db });
  return { status: response.status, data: await response.json(), response };
}

test('sessions are single-use; leaderboard keeps each mode and best score separate', async () => {
  const db = createDb();
  try {
    const session = await call(db, 'POST', '/api/sessions', { mode: 'classic', playerId: 'p1' });
    assert.equal(session.status, 201);
    const first = await call(db, 'POST', '/api/scores', {
      mode: 'classic', playerId: 'p1', nickname: '竹头一号', score: 100, sessionId: session.data.sessionId,
    });
    assert.deepEqual(first.data, { updated: true, bestScore: 100, rank: 1 });
    assert.equal((await call(db, 'POST', '/api/scores', {
      mode: 'classic', playerId: 'p1', nickname: '竹头一号', score: 200, sessionId: session.data.sessionId,
    })).status, 400);

    const secondSession = await call(db, 'POST', '/api/sessions', { mode: 'classic', playerId: 'p2' });
    const second = await call(db, 'POST', '/api/scores', {
      mode: 'classic', playerId: 'p2', nickname: '竹头二号', score: 200, sessionId: secondSession.data.sessionId,
    });
    assert.equal(second.data.rank, 1);

    const lowerSession = await call(db, 'POST', '/api/sessions', { mode: 'classic', playerId: 'p1' });
    const lower = await call(db, 'POST', '/api/scores', {
      mode: 'classic', playerId: 'p1', nickname: '新昵称', score: 50, sessionId: lowerSession.data.sessionId,
    });
    assert.deepEqual(lower.data, { updated: false, bestScore: 100, rank: 2 });
    const ranking = await call(db, 'GET', '/api/leaderboard?mode=classic&playerId=p1');
    assert.equal(ranking.status, 200);
    assert.deepEqual(ranking.data.entries.map(({ nickname, score }) => [nickname, score]),
      [['竹头二号', 200], ['新昵称', 100]]);
    assert.deepEqual(ranking.data.me, { bestScore: 100, rank: 2 });
    assert.equal(ranking.response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual((await call(db, 'GET', '/api/leaderboard?mode=endless')).data.entries, []);
    assert.equal((await call(db, 'POST', '/api/nicknames/validate', { nickname: '\u0001' })).status, 400);
  } finally {
    db.close();
  }
});

test('rejects invalid submissions and keeps endless scores out of classic rankings', async () => {
  const db = createDb();
  try {
    assert.equal((await call(db, 'POST', '/api/sessions', { mode: 'wrong', playerId: 'p1' })).status, 400);
    const session = await call(db, 'POST', '/api/sessions', { mode: 'endless', playerId: 'p1' });
    const payload = {
      mode: 'endless', playerId: 'p1', nickname: '竹头', score: 42, sessionId: session.data.sessionId,
    };
    assert.equal((await call(db, 'POST', '/api/scores', { ...payload, score: -1 })).status, 400);
    assert.equal((await call(db, 'POST', '/api/scores', { ...payload, mode: 'classic' })).status, 400);
    assert.equal((await call(db, 'POST', '/api/scores', payload)).status, 200);
    assert.deepEqual((await call(db, 'GET', '/api/leaderboard?mode=classic&playerId=p1')).data.me,
      { bestScore: 0, rank: null });
    assert.deepEqual((await call(db, 'GET', '/api/leaderboard?mode=endless&playerId=p1')).data.me,
      { bestScore: 42, rank: 1 });
  } finally {
    db.close();
  }
});
