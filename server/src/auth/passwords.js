import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

/**
 * Password hashing with scrypt from the standard library (pr.md §28).
 *
 * scrypt is memory-hard, ships with Node, and needs no native build step —
 * which matters on Windows where bcrypt/argon2 both compile from source.
 * Parameters are stored alongside the hash so they can be raised later without
 * invalidating existing passwords.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 256 * 1024 * 1024,
  });

  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
};

export const verifyPassword = async (password, stored) => {
  if (typeof stored !== 'string') return false;

  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });

    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
};

/**
 * Password policy. Deliberately length-first rather than a character-class
 * gauntlet — long passphrases beat short complex ones, and the rules people
 * can actually follow are the ones that get followed.
 */
export const passwordProblems = (password) => {
  const problems = [];
  if (password.length < 10) problems.push('Use at least 10 characters');
  if (password.length > 200) problems.push('Use fewer than 200 characters');
  if (!/[a-zA-Z]/.test(password)) problems.push('Include at least one letter');
  if (!/[0-9\p{P}\p{S}]/u.test(password)) problems.push('Include at least one number or symbol');
  if (/^(password|12345|qwerty|letmein|welcome)/i.test(password)) problems.push('That password is too common');
  return problems;
};

/** Opaque, high-entropy token for sessions and password resets. */
export const generateToken = () => crypto.randomBytes(32).toString('base64url');

/** Tokens are stored hashed so a database leak does not hand over live sessions. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
