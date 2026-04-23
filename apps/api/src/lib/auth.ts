import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from './config';

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export function signAccessToken(payload: AccessTokenPayload) {
  const jwtSecret = config.jwtAccessSecret as string;
  const expiresInEnv = config.jwtAccessExpiresIn;
  const expiresIn: SignOptions['expiresIn'] = expiresInEnv as SignOptions['expiresIn'];
  return jwt.sign(payload, jwtSecret, { expiresIn });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const jwtSecret = config.jwtAccessSecret as string;
  return jwt.verify(token, jwtSecret) as AccessTokenPayload;
}

export function createRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

