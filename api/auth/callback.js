const { createSession, getOAuthState, clearCookie, OAUTH_COOKIE } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  const cookies = getOAuthState(req);
  const { code, state, error } = req.query || {};
  clearCookie(res, OAUTH_COOKIE);
  if (error) { res.writeHead(302, { Location: '/?auth=cancelled' }); return res.end(); }
  if (!code || !state || !cookies || cookies.state !== state || !cookies.verifier) { res.writeHead(302, { Location: '/?auth=invalid' }); return res.end(); }

  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, APP_URL } = process.env;
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !APP_URL) { res.writeHead(302, { Location: '/?auth=unconfigured' }); return res.end(); }

  try {
    const form = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: `${APP_URL.replace(/\/$/, '')}/api/auth/callback`,
      code_verifier: cookies.verifier,
    });
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) throw new Error('Discord token exchange failed.');

    const profileResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error('Could not read your Discord profile.');

    createSession(res, {
      id: String(profile.id),
      username: profile.global_name || profile.username || 'Player',
      tag: profile.discriminator && profile.discriminator !== '0' ? profile.discriminator : null,
      avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : null,
    });
    const next = typeof cookies.next === 'string' && cookies.next.startsWith('/') && !cookies.next.startsWith('//') ? cookies.next : '/';
    const separator = next.includes('?') ? '&' : '?';
    res.writeHead(302, { Location: `${next}${separator}auth=success` });
    return res.end();
  } catch (err) {
    console.error('Discord OAuth callback:', err.message);
    res.writeHead(302, { Location: '/?auth=failed' });
    return res.end();
  }
};
