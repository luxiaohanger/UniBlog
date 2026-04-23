/**
 * 领域 / 校验层抛出的可映射 HTTP 响应的业务错误
 */
export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extras?: Record<string, unknown>
  ) {
    super(code);
    this.name = 'ServiceError';
  }
}
