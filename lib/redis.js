const PREFIX = 'play-classics:room:';

function getConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Multiplayer storage is not connected yet. Install Upstash Redis in Vercel and add its REST URL and token.');
  return { url: url.replace(/\/$/, ''), token };
}

async function command(...args) {
  const { url, token } = getConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error || `Redis request failed (${response.status}).`);
  return body.result;
}

async function readRoom(id) {
  const raw = await command('GET', PREFIX + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error('Stored room data is invalid.'); }
}

async function createRoom(room) {
  const result = await command('SET', PREFIX + room.id, JSON.stringify(room), 'EX', 86400, 'NX');
  return result === 'OK';
}

async function compareAndSet(id, revision, room) {
  const script = `local current = redis.call('GET', KEYS[1]); if not current then return 'NOT_FOUND' end; local parsed = cjson.decode(current); if tonumber(parsed.revision) ~= tonumber(ARGV[1]) then return 'CONFLICT' end; redis.call('SET', KEYS[1], ARGV[2], 'EX', 86400); return 'OK'`;
  return command('EVAL', script, 1, PREFIX + id, String(revision), JSON.stringify(room));
}

async function joinRoom(id, user) {
  const script = `local raw = redis.call('GET', KEYS[1]); if not raw then return 'NOT_FOUND' end; local room = cjson.decode(raw); if room.status == 'finished' then return 'FINISHED' end; if room.players[1].id == ARGV[1] then return cjson.encode(room) end; if room.players[2] and room.players[2].id ~= ARGV[1] then return 'FULL' end; if not room.players[2] then room.players[2] = cjson.decode(ARGV[2]); room.status = 'active'; room.revision = tonumber(room.revision) + 1; redis.call('SET', KEYS[1], cjson.encode(room), 'EX', 86400) end; return cjson.encode(room)`;
  const result = await command('EVAL', script, 1, PREFIX + id, user.id, JSON.stringify(user));
  if (result === 'NOT_FOUND') return { error: 'Room not found. It may have expired.' };
  if (result === 'FULL') return { error: 'This room already has two players.' };
  if (result === 'FINISHED') return { error: 'This room has already finished.' };
  try { return JSON.parse(result); } catch { throw new Error('Could not join this room.'); }
}

module.exports = { command, readRoom, createRoom, compareAndSet, joinRoom };
