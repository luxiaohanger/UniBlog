const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

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
