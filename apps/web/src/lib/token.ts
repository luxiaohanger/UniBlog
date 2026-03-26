const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const USERNAME_KEY = 'me_display_username';

export function getTokens() {
  if (typeof window === 'undefined') return null;
  const accessToken = window.localStorage.getItem(ACCESS_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken
  };
}

export function setTokens(tokens: { accessToken: string; refreshToken: string }) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
}

/** 登录后写入，供顶栏在 /auth/me 返回前显示「用户名」 */
export function setStoredDisplayUsername(username: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USERNAME_KEY, username);
}

export function getStoredDisplayUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USERNAME_KEY);
}

export function getAccessToken() {
  return getTokens()?.accessToken || null;
}

export function getAuthHeaders() {
  const token = getAccessToken();
  return token ? {
    Authorization: `Bearer ${token}`
  } : {};
}
