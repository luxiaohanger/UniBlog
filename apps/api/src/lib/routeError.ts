import type { Response } from 'express';
import { ServiceError } from './serviceError';
import { logger } from './logger';

/**
 * 将 ServiceError 映射为 JSON；其它错误记日志并返回 500
 */
export function sendRouteError(res: Response, err: unknown, logLabel: string, fallbackCode = 'internal_error') {
  if (err instanceof ServiceError) {
    const body: Record<string, unknown> = { error: err.code };
    if (err.extras) Object.assign(body, err.extras);
    return res.status(err.status).json(body);
  }
  logger.error({ err, logLabel }, 'route_error');
  return res.status(500).json({ error: fallbackCode });
}
