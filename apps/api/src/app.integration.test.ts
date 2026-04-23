import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('HTTP 契约 smoke', () => {
  it('GET /health 返回 ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
