import { z } from 'zod';
import { ServiceError } from './serviceError';

/** 将 zod issue 的 message 视为 snake_case 错误码（若符合模式），否则为 missing_fields */
export function parseZod<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const msg = r.error.issues[0]?.message;
  if (msg && /^[a-z][a-z0-9_]*$/.test(msg)) {
    throw new ServiceError(400, msg);
  }
  throw new ServiceError(400, 'missing_fields');
}

/** zod 校验失败时统一为 400 + 约定错误码 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, errorCode = 'missing_fields'): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new ServiceError(400, errorCode);
  }
  return r.data;
}
