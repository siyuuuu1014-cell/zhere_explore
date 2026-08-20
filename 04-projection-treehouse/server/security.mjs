import { argon2Sync, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ARGON = { memory: 65536, passes: 3, parallelism: 1, tagLength: 32 };

export function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

export function hashPassword(password) {
  const nonce = randomBytes(16);
  const digest = argon2Sync('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce,
    parallelism: ARGON.parallelism,
    tagLength: ARGON.tagLength,
    memory: ARGON.memory,
    passes: ARGON.passes,
  });
  return `argon2id$v=19$m=${ARGON.memory},t=${ARGON.passes},p=${ARGON.parallelism}$${nonce.toString('base64url')}$${digest.toString('base64url')}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [, , params, nonceText, digestText] = String(encoded).split('$');
    const parsed = Object.fromEntries(params.split(',').map((part) => part.split('=')));
    const expected = Buffer.from(digestText, 'base64url');
    const actual = argon2Sync('argon2id', {
      message: Buffer.from(password, 'utf8'),
      nonce: Buffer.from(nonceText, 'base64url'),
      parallelism: Number(parsed.p),
      tagLength: expected.length,
      memory: Number(parsed.m),
      passes: Number(parsed.t),
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionCookie(token, { secure = false, maxAge = 0 } = {}) {
  const parts = [
    `zhere_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    identity: user.guest ? null : user.identity,
    username: user.username,
    nickname: user.nickname,
    spaceName: user.spaceName,
    bio: user.bio || '',
    avatar: Math.max(0, Math.min(12, Number(user.avatar) || 0)),
    avatarImage: user.avatarImage || '',
    research: true,
    guest: Boolean(user.guest),
    createdAt: user.createdAt,
  };
}
