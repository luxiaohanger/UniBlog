/** 须含协议与端口、无尾部斜杠。Docker 开发由 compose 注入；本机 next dev 见 apps/web/.env.local */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || ''
).replace(/\/$/, '');
