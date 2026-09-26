import crypto from 'node:crypto';

/** Opaque, high-entropy token with a recognizable prefix (helps secret scanners). */
export function randomToken(prefix = '') {
  return prefix + crypto.randomBytes(32).toString('base64url');
}

/** Tokens and secrets are only ever stored as SHA-256 hashes. */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** RFC 7636 code_verifier: 43-128 chars from the unreserved set. */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** An S256 code_challenge is a base64url SHA-256 digest: exactly 43 chars. */
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge) {
  return typeof challenge === 'string' && CHALLENGE_RE.test(challenge);
}

export function verifyPkce(codeVerifier, codeChallenge) {
  if (typeof codeVerifier !== 'string' || !VERIFIER_RE.test(codeVerifier)) return false;
  const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return safeEqual(computed, codeChallenge);
}
