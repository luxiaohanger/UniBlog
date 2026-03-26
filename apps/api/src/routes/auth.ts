import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { createRefreshToken, hashToken, signAccessToken } from '../lib/auth';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'db_not_configured' });

    const { email, username, password } = req.body as {
      email?: string;
      username?: string;
      password?: string;
    };

    if (!email || !username || !password) return res.status(400).json({ error: 'missing_fields' });
    if (password.length < 6) return res.status(400).json({ error: 'password_too_short' });

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return res.status(409).json({ error: 'email_exists' });

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) return res.status(409).json({ error: 'username_exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username, passwordHash },
      select: { id: true, email: true, username: true },
    });

    return res.status(201).json({ user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'register_failed' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'db_not_configured' });

    const { account, email, username, password } = req.body as {
      account?: string;
      email?: string;
      username?: string;
      password?: string;
    };

    const identifier = account || email || username;
    if (!identifier || !password) return res.status(400).json({ error: 'missing_fields' });

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const accessToken = signAccessToken({ sub: user.id, email: user.email });

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresDays = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || '30');
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refreshTokenHash, expiresAt },
    });

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'login_failed' });
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });

    const refreshTokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'logout_failed' });
  }
});

authRouter.get('/me', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const u = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { id: true, email: true, username: true },
  });

  return res.json({ user: u });
});

