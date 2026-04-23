/**
 * 与 API 响应 `{ error: string }` 对齐的常量，前后端共用减少拼写漂移
 */
export const ApiErrors = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not_found',
  internal_error: 'internal_error',
  validation_error: 'validation_error',
} as const;

export type ApiErrorCode = (typeof ApiErrors)[keyof typeof ApiErrors];
