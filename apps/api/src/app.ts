import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authRouter } from './routes/auth';
import { postsRouter } from './routes/posts';
import { socialRouter } from './routes/social';

export function createApp() {
  const app = express();

  // 确保上传目录存在（避免 Multer 写入时 ENOENT）
  const uploadsDir = path.resolve(__dirname, '../uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.use(
    cors({
      // MVP：本地开发阶段为了避免端口不一致导致 CORS 失败，这里默认放行 localhost
      // 如果你想严格限制，再把这里改回白名单模式
      origin: (origin, callback) => {
        const raw = origin || '';
        if (!raw) return callback(null, true);

        const envOrigins = process.env.CORS_ORIGIN
          ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
          : [];
        if (envOrigins.includes('*') || envOrigins.includes(raw)) return callback(null, true);

        // 兜底：允许任何 localhost:端口（解决你当前前端 3000 与后端 3003 不一致的问题）
        if (raw.startsWith('http://localhost:')) return callback(null, true);

        return callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 媒体静态资源
  app.use('/uploads', express.static(uploadsDir, { fallthrough: false }));

  app.use('/auth', authRouter);
  app.use('/posts', postsRouter);
  app.use('/social', socialRouter);

  // 兜底错误处理（MVP）
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      const anyErr = err as any;

      if (anyErr?.name === 'MulterError') {
        return res
          .status(400)
          .json({ error: anyErr.message || anyErr.code || 'upload_error' });
      }

      return res
        .status(500)
        .json({ error: anyErr?.message ? String(anyErr.message) : 'internal_error' });
    }
  );

  return app;
}

