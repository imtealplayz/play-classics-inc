const crypto = require('node:crypto');

const COOKIE = 'pc_session';
const OAUTH_COOKIE = 'pc_oauth';

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
  return value;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function signedValue(payload) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function verifyValue(value) {
  if (!value || typeof value !== 'string') return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cookieOptions(maxAge) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function setCookie(res, name, value, maxAge) {
  const next = res.getHeader('Set-Cookie');
  const list = next ? (Array.isArray(next) ? next : [next]) : [];
  list.push(`${name}=${encodeURIComponent(value)}; ${cookieOptions(maxAge)}`);
  res.setHeader('Set-Cookie', list);
}

function clearCookie(res, name) {
  setCookie(res, name, '', 0);
}

function createSession(res, user) {
  const value = signedValue({ user, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 });
  setCookie(res, COOKIE, value, 60 * 60 * 24 * 14);
}

function getSession(req) {
  try {
    const payload = verifyValue(parseCookies(req)[COOKIE]);
    return payload?.user || null;
  } catch { return null; }
}

function createOAuthState(res, state, verifier, next = '/') {
  setCookie(res, OAUTH_COOKIE, signedValue({ state, verifier, next, exp: Date.now() + 10 * 60 * 1000 }), 600);
}

function getOAuthState(req) {
  try { return verifyValue(parseCookies(req)[OAUTH_COOKIE]); } catch { return null; }
}

module.exports = { createSession, getSession, createOAuthState, getOAuthState, clearCookie, OAUTH_COOKIE };
