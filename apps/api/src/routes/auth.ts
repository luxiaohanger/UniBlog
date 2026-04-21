import bcrypt from 'bcryptjs';
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { createRefreshToken, hashToken, signAccessToken } from '../lib/auth';
import { requireAuth } from '../middleware/auth';
import { isMailerConfigured, sendVerificationEmail } from '../lib/mailer';
import { consumeCode, issueCode, type VerificationPurpose } from '../lib/verification';
import { serializePublicUser } from '../lib/serializeUser';

export const authRouter = Router();

// 头像上传：复用与 posts 相同的 uploads 目录；文件名避免冲突
const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const safeExt = /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : '';
      cb(null, `avatar-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
    },
  }),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('invalid_avatar_mime'));
    }
    cb(null, true);
  },
});

/** 清理 uploads 内的旧头像文件；越界或绝对路径直接跳过，防止误删 */
function unlinkAvatarFile(storedPath: string | null | undefined) {
  if (!storedPath) return;
  const rel = storedPath.replace(/^uploads\/?/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return;
  const abs = path.resolve(uploadsDir, rel);
  const relFromRoot = path.relative(uploadsDir, abs);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return;
  fs.unlink(abs, (err) => {
    const code = err && (err as NodeJS.ErrnoException).code;
    if (err && code !== 'ENOENT') console.error('unlink avatar failed', err);
  });
}

const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 200;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePurpose(raw: unknown): VerificationPurpose | null {
  if (raw === 'register' || raw === 'reset_password') return raw;
  return null;
}

// 发送邮箱验证码：注册 / 重置密码共用一个入口
authRouter.post('/email/send-code', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'db_not_configured' });
    if (!isMailerConfigured()) return res.status(500).json({ error: 'mailer_not_configured' });

    const { email, purpose } = req.body as { email?: string; purpose?: string };
    const parsedPurpose = parsePurpose(purpose);
    if (!email || !parsedPurpose) return res.status(400).json({ error: 'missing_fields' });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'invalid_email' });

    const normalizedEmail = email.trim().toLowerCase();

    // 注册场景需要提前拦截已占用邮箱；重置密码场景为防用户枚举，不透露邮箱是否存在
    if (parsedPurpose === 'register') {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) return res.status(409).json({ error: 'email_exists' });
    } else {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!existing) {
        // 统一返回成功：即便邮箱不存在也不发送邮件，防止探测账户
        return res.json({ ok: true });
      }
    }

    const issued = await issueCode(normalizedEmail, parsedPurpose);
    if (!issued.ok) {
      return res.status(429).json({
        error: 'code_cooldown',
        retryAfterSeconds: Math.ceil(issued.retryAfterMs / 1000),
      });
    }

    try {
      await sendVerificationEmail(normalizedEmail, issued.code, parsedPurpose);
    } catch (mailErr) {
      console.error('send verification mail failed:', mailErr);
      return res.status(502).json({ error: 'mail_send_failed' });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'send_code_failed' });
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'db_not_configured' });

    const { email, username, password, code } = req.body as {
      email?: string;
      username?: string;
      password?: string;
      code?: string;
    };

    if (!email || !username || !password) return res.status(400).json({ error: 'missing_fields' });
    if (!code) return res.status(400).json({ error: 'missing_code' });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'invalid_email' });
    if (password.length < 6) return res.status(400).json({ error: 'password_too_short' });

    const normalizedEmail = email.trim().toLowerCase();

    const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail) return res.status(409).json({ error: 'email_exists' });

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) return res.status(409).json({ error: 'username_exists' });

    const consumed = await consumeCode(normalizedEmail, code, 'register');
    if (!consumed.ok) return res.status(400).json({ error: consumed.error });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, username, passwordHash },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        displayName: true,
        avatarPath: true,
      },
    });

    return res.status(201).json({
      user: {
        ...serializePublicUser(user),
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'register_failed' });
  }
});

// 基于邮箱验证码重置密码：验证码一次性；重置成功后吊销所有 RefreshToken
authRouter.post('/password/reset', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'db_not_configured' });

    const { email, code, newPassword } = req.body as {
      email?: string;
      code?: string;
      newPassword?: string;
    };

    if (!email || !newPassword) return res.status(400).json({ error: 'missing_fields' });
    if (!code) return res.status(400).json({ error: 'missing_code' });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'invalid_email' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'password_too_short' });

    const normalizedEmail = email.trim().toLowerCase();

    const consumed = await consumeCode(normalizedEmail, code, 'reset_password');
    if (!consumed.ok) return res.status(400).json({ error: consumed.error });

    // 仅此处（验证码校验通过后）再查询用户：即便上一步「不存在但返回成功」，
    // 这里验证码也不会命中任何记录，天然不会把不存在的邮箱走到这个分支。
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return res.status(400).json({ error: 'invalid_code' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'password_reset_failed' });
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
      user: {
        ...serializePublicUser(user),
        email: user.email,
        role: user.role,
      },
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

authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });

    const refreshTokenHash = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findFirst({
      where: {
        tokenHash: refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            displayName: true,
            avatarPath: true,
          },
        },
      },
    });
    if (!stored) return res.status(401).json({ error: 'invalid_refresh_token' });

    const accessToken = signAccessToken({ sub: stored.userId, email: stored.user.email });
    return res.json({
      accessToken,
      refreshToken,
      user: {
        ...serializePublicUser(stored.user),
        email: stored.user.email,
        role: stored.user.role,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'refresh_failed' });
  }
});

authRouter.get('/me', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const u = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      displayName: true,
      avatarPath: true,
      bio: true,
    },
  });
  if (!u) return res.status(401).json({ error: 'unauthorized' });

  return res.json({
    user: {
      ...serializePublicUser(u),
      email: u.email,
      role: u.role,
    },
  });
});

/**
 * 更新当前用户资料（displayName / bio）。
 * - 字段可选：未传或显式传 null 表示清空；空字符串会被 trim 后按"清空"处理
 * - 长度限制：displayName ≤ 40，bio ≤ 200
 */
authRouter.patch('/me', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body as { displayName?: unknown; bio?: unknown };
    const data: { displayName?: string | null; bio?: string | null } = {};

    if (body.displayName !== undefined) {
      if (body.displayName === null) {
        data.displayName = null;
      } else if (typeof body.displayName === 'string') {
        const trimmed = body.displayName.trim();
        if (trimmed.length > DISPLAY_NAME_MAX) {
          return res.status(400).json({ error: 'display_name_too_long' });
        }
        data.displayName = trimmed || null;
      } else {
        return res.status(400).json({ error: 'invalid_display_name' });
      }
    }

    if (body.bio !== undefined) {
      if (body.bio === null) {
        data.bio = null;
      } else if (typeof body.bio === 'string') {
        const trimmed = body.bio.trim();
        if (trimmed.length > BIO_MAX) {
          return res.status(400).json({ error: 'bio_too_long' });
        }
        data.bio = trimmed || null;
      } else {
        return res.status(400).json({ error: 'invalid_bio' });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        displayName: true,
        avatarPath: true,
        bio: true,
      },
    });

    return res.json({
      user: {
        ...serializePublicUser(updated),
        email: updated.email,
        role: updated.role,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'update_profile_failed' });
  }
});

/**
 * 上传/替换头像：multipart/form-data，字段名 `file`，≤5MB，仅 jpeg/png/webp/gif。
 * 成功后删除旧头像文件，避免磁盘堆积（越界路径会被 unlinkAvatarFile 忽略）。
 */
authRouter.post('/me/avatar', requireAuth(), (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  avatarUpload.single('file')(req, res, async (err: unknown) => {
    if (err) {
      const anyErr = err as { message?: string; code?: string } & Error;
      if (anyErr?.message === 'invalid_avatar_mime') {
        return res.status(400).json({ error: 'invalid_avatar_mime' });
      }
      if (anyErr?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'avatar_too_large' });
      }
      console.error(err);
      return res.status(500).json({ error: 'avatar_upload_failed' });
    }

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'missing_file' });

    try {
      const current = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { avatarPath: true },
      });
      const newPath = `uploads/${file.filename}`;
      const updated = await prisma.user.update({
        where: { id: user.userId },
        data: { avatarPath: newPath },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          displayName: true,
          avatarPath: true,
          bio: true,
        },
      });

      // 先回库成功再清旧文件，避免 DB 失败时把旧头像也弄丢
      if (current?.avatarPath && current.avatarPath !== newPath) {
        unlinkAvatarFile(current.avatarPath);
      }

      return res.json({
        user: {
          ...serializePublicUser(updated),
          email: updated.email,
          role: updated.role,
        },
      });
    } catch (e) {
      console.error(e);
      // DB 失败：尝试清理刚上传的文件
      unlinkAvatarFile(`uploads/${file.filename}`);
      return res.status(500).json({ error: 'avatar_upload_failed' });
    }
  });
});
