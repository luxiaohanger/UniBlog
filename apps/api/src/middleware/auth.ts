import type express from 'express';
import { verifyAccessToken } from '../lib/auth';

export type AuthedUser = { userId: string; email: string };

export function requireAuth() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const auth = req.header('authorization');
    if (!auth) return res.status(401).json({ error: 'missing_authorization' });

    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'invalid_authorization' });

    try {
      const payload = verifyAccessToken(token);
      (req as unknown as { user?: AuthedUser }).user = { userId: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid_or_expired_token' });
    }
  };
}

