import { API_BASE_URL } from './config';
import { clearTokens, getAuthHeaders } from './token';

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}

export async function apiFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> }
) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = options?.method || 'GET';

  // 仅登录、注册不带 Bearer；/auth/me 等需携带 token
  const pathWithoutQuery = path.split('?')[0];
  const authPathNoBearer =
    pathWithoutQuery === '/auth/login' || pathWithoutQuery === '/auth/register';

  const headers: Record<string, string> = {
    ...(options?.headers || {}),
    ...(authPathNoBearer ? {} : getAuthHeaders()),
  };
  
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    // 如果是 FormData，则由调用方传入 headers/body 自己处理
    if (options?.body instanceof FormData) {
      body = options.body as unknown as BodyInit;
    } else if (options?.body !== undefined) {
      headers['content-type'] = headers['content-type'] || 'application/json';
      body = JSON.stringify(options.body);
    }
  }
  
  try {
    const res = await fetch(url, {
      method,
      headers,
      body
    });
    
    console.log('API Response:', res.status, res.statusText);
    
    const data = await parseJsonSafe(res);
    
    if (!res.ok) {
      // 带 token 的请求若 401，清会话，避免子页面 replace('/login') 后又被 AppShell 送回圈子
      if (res.status === 401 && !authPathNoBearer) {
        clearTokens();
      }
      const err = data?.error || `http_${res.status}`;
      throw new Error(err);
    }
    
    return data as T;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
}
