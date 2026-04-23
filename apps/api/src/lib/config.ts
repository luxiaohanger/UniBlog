import dotenv from 'dotenv';
import path from 'node:path';

// 任意 `import { config }` 时先加载 apps/api/.env（src/lib → 上两级为 api 根）
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

/**
 * 集中读取环境变量，避免散落魔法字符串；默认值与历史行为一致
 */
export const config = {
  /** 已加载 .env 后读取 */
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '24h',
  jwtRefreshExpiresDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS || '30'),
  /** 逗号分隔；未设置时 CORS 逻辑仍由 app.ts 处理 localhost */
  corsOriginRaw: process.env.CORS_ORIGIN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  /** 上传与 body 限制 */
  postMediaMaxBytes: 50 * 1024 * 1024,
  avatarMaxBytes: 5 * 1024 * 1024,
  jsonBodyLimit: '10mb',
} as const;
