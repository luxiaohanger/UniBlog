import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { createRefreshToken, hashToken, signAccessToken } from '../lib/auth';
import { isMailerConfigured, sendVerificationEmail } from '../lib/mailer';
import { consumeCode, issueCode, type VerificationPurpose } from '../lib/verification';
import { serializePublicUser } from '../lib/serializeUser';
import { ServiceError } from '../lib/serviceError';
import { config } from '../lib/config';

const uploadsDir = path.resolve(__dirname, '../../uploads');

const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 200;

/** 清理 uploads 内的旧头像文件 */
export function unlinkAvatarFile(storedPath: string | null | undefined) {
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

function ensureDb() {
  if (!config.databaseUrl) throw new ServiceError(500, 'db_not_configured');
}

export async function sendEmailCode(email: string, purpose: VerificationPurpose) {
  ensureDb();
  if (!isMailerConfigured()) throw new ServiceError(500, 'mailer_not_configured');

  if (purpose === 'register') {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ServiceError(409, 'email_exists');
  } else {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) return { ok: true as const };
  }

  const issued = await issueCode(email, purpose);
  if (!issued.ok) {
    throw new ServiceError(429, 'code_cooldown', {
      retryAfterSeconds: Math.ceil(issued.retryAfterMs / 1000),
    });
  }

  try {
    await sendVerificationEmail(email, issued.code, purpose);
  } catch (mailErr) {
    console.error('send verification mail failed:', mailErr);
    throw new ServiceError(502, 'mail_send_failed');
  }

  return { ok: true as const };
}

export async function registerUser(input: {
  email: string;
  username: string;
  password: string;
  code: string;
}) {
  ensureDb();
  const { email, username, password, code } = input;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) throw new ServiceError(409, 'email_exists');

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) throw new ServiceError(409, 'username_exists');

  const consumed = await consumeCode(email, code, 'register');
  if (!consumed.ok) throw new ServiceError(400, consumed.error);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      displayName: true,
      avatarPath: true,
    },
  });

  return {
    user: {
      ...serializePublicUser(user),
      email: user.email,
      role: user.role,
    },
  };
}

export async function resetPassword(input: { email: string; code: string; newPassword: string }) {
  ensureDb();
  const { email, code, newPassword } = input;

  const consumed = await consumeCode(email, code, 'reset_password');
  if (!consumed.ok) throw new ServiceError(400, consumed.error);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ServiceError(400, 'invalid_code');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { ok: true as const };
}

export async function login(input: {
  identifier: string;
  password: string;
}) {
  ensureDb();
  const { identifier, password } = input;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });
  if (!user) throw new ServiceError(401, 'invalid_credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new ServiceError(401, 'invalid_credentials');

  const accessToken = signAccessToken({ sub: user.id, email: user.email });

  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresDays = config.jwtRefreshExpiresDays;
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshTokenHash, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      ...serializePublicUser(user),
      email: user.email,
      role: user.role,
    },
  };
}

export async function logout(refreshToken: string) {
  const refreshTokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { ok: true as const };
}

export async function refreshSession(refreshToken: string) {
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
  if (!stored) throw new ServiceError(401, 'invalid_refresh_token');

  const accessToken = signAccessToken({ sub: stored.userId, email: stored.user.email });
  return {
    accessToken,
    refreshToken,
    user: {
      ...serializePublicUser(stored.user),
      email: stored.user.email,
      role: stored.user.role,
    },
  };
}

export async function getMe(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
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
  if (!u) throw new ServiceError(401, 'unauthorized');

  return {
    user: {
      ...serializePublicUser(u),
      email: u.email,
      role: u.role,
    },
  };
}

export async function updateProfile(
  userId: string,
  body: { displayName?: unknown; bio?: unknown }
) {
  const data: { displayName?: string | null; bio?: string | null } = {};

  if (body.displayName !== undefined) {
    if (body.displayName === null) {
      data.displayName = null;
    } else if (typeof body.displayName === 'string') {
      const trimmed = body.displayName.trim();
      if (trimmed.length > DISPLAY_NAME_MAX) {
        throw new ServiceError(400, 'display_name_too_long');
      }
      data.displayName = trimmed || null;
    } else {
      throw new ServiceError(400, 'invalid_display_name');
    }
  }

  if (body.bio !== undefined) {
    if (body.bio === null) {
      data.bio = null;
    } else if (typeof body.bio === 'string') {
      const trimmed = body.bio.trim();
      if (trimmed.length > BIO_MAX) {
        throw new ServiceError(400, 'bio_too_long');
      }
      data.bio = trimmed || null;
    } else {
      throw new ServiceError(400, 'invalid_bio');
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
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

  return {
    user: {
      ...serializePublicUser(updated),
      email: updated.email,
      role: updated.role,
    },
  };
}

export async function setAvatarAfterUpload(userId: string, filename: string) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true },
  });
  const newPath = `uploads/${filename}`;
  const updated = await prisma.user.update({
    where: { id: userId },
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

  if (current?.avatarPath && current.avatarPath !== newPath) {
    unlinkAvatarFile(current.avatarPath);
  }

  return {
    user: {
      ...serializePublicUser(updated),
      email: updated.email,
      role: updated.role,
    },
  };
}
