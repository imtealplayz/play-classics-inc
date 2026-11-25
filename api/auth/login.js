const crypto = require('node:crypto');
const { createOAuthState } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const { DISCORD_CLIENT_ID, APP_URL } = process.env;
  if (!DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !APP_URL || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return res.status(503).send('Discord login is not configured yet. Add the Discord OAuth credentials, APP_URL, and SESSION_SECRET in Vercel.');
  }
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const requestedNext = typeof req.query?.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//') ? req.query.next : '/';
  createOAuthState(res, state, verifier, requestedNext);
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: `${APP_URL.replace(/\/$/, '')}/api/auth/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });
  res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${params.toString()}` });
  return res.end();
};
