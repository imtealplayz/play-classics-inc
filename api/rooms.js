const crypto = require('node:crypto');
const { getSession } = require('../lib/security');
const { readRoom, createRoom, compareAndSet, joinRoom } = require('../lib/mongodb');
const { CATALOG, initialState, applyMove, applyRoundAction, publicRoom } = require('../lib/games');

function id() {
  return crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, '').slice(0, 6).toUpperCase();
}
function player(user) {
  return { id: user.id, username: user.username, avatar: user.avatar || null };
}
function safeError(error) {
  const message = error?.message || 'Something went wrong.';
  if (message.includes('MongoDB is not connected')) return message;
  if (error?.name?.startsWith('Mongo') || message.includes('MongoServerSelectionError') || message.includes('fetch failed')) return 'The room service is temporarily unavailable. Please try again.';
  return message;
}
async function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (!req.body && typeof req.on === 'function') {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw new Error('Request is too large.'); }
    try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON request.'); }
  }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Sign in with Discord to play.' });
    if (req.method === 'GET') {
      const roomId = String(req.query?.id || '').toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(roomId)) return res.status(400).json({ error: 'Enter a valid room code.' });
      const room = await readRoom(roomId);
      if (!room) return res.status(404).json({ error: 'Room not found. It may have expired.' });
      if (!room.players.some((p) => p.id === user.id)) return res.status(403).json({ error: 'Join this room before viewing it.' });
      return res.status(200).json({ room: publicRoom(room, user.id), viewerId: user.id });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const origin = req.headers.origin;
    const allowedOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
    if (origin && allowedOrigin && origin !== allowedOrigin && !origin.startsWith('http://localhost:')) return res.status(403).json({ error: 'Request origin is not allowed.' });

    const body = await jsonBody(req);
    if (body.action === 'create') {
      if (!Object.prototype.hasOwnProperty.call(CATALOG, body.game)) return res.status(400).json({ error: 'Choose a valid game.' });
      const code = id();
      const room = {
        id: code,
        game: body.game,
        status: 'waiting',
        players: [player(user)],
        state: initialState(body.game, [player(user)]),
        revision: 1,
        createdAt: Date.now(),
      };
      if (!await createRoom(room)) return res.status(503).json({ error: 'Could not create a room. Please try again.' });
      return res.status(201).json({ room: publicRoom(room, user.id), viewerId: user.id });
    }

    const roomId = String(body.roomId || '').toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(roomId)) return res.status(400).json({ error: 'Enter a valid room code.' });
    if (body.action === 'join') {
      const joined = await joinRoom(roomId, player(user));
      if (joined.error) return res.status(joined.error.includes('not found') ? 404 : 409).json({ error: joined.error });
      return res.status(200).json({ room: publicRoom(joined, user.id), viewerId: user.id });
    }

    const current = await readRoom(roomId);
    if (!current) return res.status(404).json({ error: 'Room not found. It may have expired.' });
    if (!current.players.some((p) => p.id === user.id)) return res.status(403).json({ error: 'You are not a player in this room.' });
    const updated = JSON.parse(JSON.stringify(current));

    if (body.action === 'move') {
      applyMove(updated, user.id, body.move);
    } else if (body.action === 'rps-next') {
      applyRoundAction(updated, user.id, 'next');
    } else if (body.action === 'rematch') {
      if (updated.status !== 'finished') return res.status(409).json({ error: 'This game has not finished yet.' });
      updated.status = 'active';
      updated.state = initialState(updated.game, updated.players);
    } else if (body.action === 'concede') {
      if (updated.status !== 'active') return res.status(409).json({ error: 'This game is not active.' });
      updated.status = 'finished';
      updated.state.winner = updated.players.find((p) => p.id !== user.id)?.id || null;
      updated.state.result = `${user.username} resigned.`;
    } else {
      return res.status(400).json({ error: 'Unknown room action.' });
    }

    updated.revision = current.revision + 1;
    updated.updatedAt = Date.now();
    const saved = await compareAndSet(roomId, current.revision, updated);
    if (saved === 'CONFLICT') return res.status(409).json({ error: 'The game changed a moment ago. Refreshing the board…' });
    if (saved === 'NOT_FOUND') return res.status(404).json({ error: 'Room not found.' });
    return res.status(200).json({ room: publicRoom(updated, user.id), viewerId: user.id });
  } catch (error) {
    console.error('Room API:', error.message);
    const message = safeError(error);
    const status = message.includes('not connected') || message.includes('temporarily unavailable') || message.includes('MongoDB') ? 503 : 400;
    return res.status(status).json({ error: message });
  }
};
