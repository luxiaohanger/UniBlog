import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../middleware/auth';
import { parseZod } from '../lib/parseRequest';
import { sendRouteError } from '../lib/routeError';
import {
  loginSchema,
  passwordResetSchema,
  refreshTokenBodySchema,
  registerSchema,
  sendCodeSchema,
} from '../validators/auth';
import { config } from '../lib/config';
import * as authService from '../services/authService';

export const authRouter = Router();

const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

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
  limits: { fileSize: config.avatarMaxBytes },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('invalid_avatar_mime'));
    }
    cb(null, true);
  },
});

authRouter.post('/email/send-code', async (req, res) => {
  try {
    const { email, purpose } = parseZod(sendCodeSchema, req.body);
    const out = await authService.sendEmailCode(email, purpose);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'send-code', 'send_code_failed');
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    const body = parseZod(registerSchema, req.body);
    const out = await authService.registerUser(body);
    return res.status(201).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'register', 'register_failed');
  }
});

authRouter.post('/password/reset', async (req, res) => {
  try {
    const body = parseZod(passwordResetSchema, req.body);
    const out = await authService.resetPassword(body);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'password-reset', 'password_reset_failed');
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const body = parseZod(loginSchema, req.body);
    const identifier = body.account || body.email || body.username || '';
    const out = await authService.login({ identifier, password: body.password });
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'login', 'login_failed');
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = parseZod(refreshTokenBodySchema, req.body);
    const out = await authService.logout(refreshToken);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'logout', 'logout_failed');
  }
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = parseZod(refreshTokenBodySchema, req.body);
    const out = await authService.refreshSession(refreshToken);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'refresh', 'refresh_failed');
  }
});

authRouter.get('/me', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await authService.getMe(user.userId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'me', 'internal_error');
  }
});

authRouter.patch('/me', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await authService.updateProfile(user.userId, req.body as { displayName?: unknown; bio?: unknown });
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'patch-me', 'update_profile_failed');
  }
});

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
      const out = await authService.setAvatarAfterUpload(user.userId, file.filename);
      return res.json(out);
    } catch (e) {
      console.error(e);
      authService.unlinkAvatarFile(`uploads/${file.filename}`);
      return res.status(500).json({ error: 'avatar_upload_failed' });
    }
  });
});
