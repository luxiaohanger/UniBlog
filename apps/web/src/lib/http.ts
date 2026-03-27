import { API_BASE_URL } from './config';
import { clearTokens, getAuthHeaders, getTokens, setTokens } from './token';

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
  
  const doFetch = async (overrideHeaders?: Record<string, string>) => {
    const res = await fetch(url, {
      method,
      headers: overrideHeaders ?? headers,
      body,
    });
    const data = await parseJsonSafe(res);
    return { res, data };
  };

  const tryRefresh = async () => {
    const tokens = getTokens();
    if (!tokens?.refreshToken) return false;
    try {
      const r = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      const d = await parseJsonSafe(r);
      if (!r.ok || !d?.accessToken) return false;
      setTokens({ accessToken: d.accessToken, refreshToken: tokens.refreshToken });
      return true;
    } catch {
      return false;
    }
  };

  try {
    let { res, data } = await doFetch();
    
    if (!res.ok) {
      // 带 token 的请求若 401：先尝试 refresh 并重试一次；仍失败才清 token
      if (res.status === 401 && !authPathNoBearer) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          const retryHeaders: Record<string, string> = {
            ...(options?.headers || {}),
            ...getAuthHeaders(),
          };
          ({ res, data } = await doFetch(retryHeaders));
        }
      }
      if (!res.ok) {
        if (res.status === 401 && !authPathNoBearer) clearTokens();
        const err = data?.error || `http_${res.status}`;
        throw new Error(err);
      }
    }
    
    return data as T;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
}
