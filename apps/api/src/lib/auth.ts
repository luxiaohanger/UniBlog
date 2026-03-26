import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export function signAccessToken(payload: AccessTokenPayload) {
  const jwtSecret = (process.env.JWT_ACCESS_SECRET || 'dev_access_secret') as string;
  const expiresInEnv = process.env.JWT_ACCESS_EXPIRES_IN || '900s';
  const expiresIn: SignOptions['expiresIn'] = expiresInEnv as SignOptions['expiresIn'];
  return jwt.sign(payload, jwtSecret, { expiresIn });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const jwtSecret = (process.env.JWT_ACCESS_SECRET || 'dev_access_secret') as string;
  return jwt.verify(token, jwtSecret) as AccessTokenPayload;
}

export function createRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

