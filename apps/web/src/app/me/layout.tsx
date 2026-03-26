'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/http';
import { getTokens } from '../../lib/token';

/**
 * 个人主页：侧栏 + 个人信息常驻（避免子页切换时整块被「加载中」替换导致闪烁）
 * 子路由切换时内容区使用 CSS 入场动画衔接
 */
export default function MeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const isPosts = pathname === '/me' || pathname === '/me/';
  const isFavorites =
    pathname === '/me/favorites' || pathname === '/me/favorites/';

  useEffect(() => {
    if (!getTokens()) {
      setUserLoading(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ user: { username: string; email: string } }>('/auth/me')
      .then((d) => {
        if (!cancelled) setUser(d.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUserLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navBtnStyle = (active: boolean): CSSProperties => ({
    padding: '8px 12px',
    borderRadius: '8px',
    textDecoration: 'none',
    color: '#333',
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    border: 'none',
    cursor: 'pointer',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    background: active ? '#f0f0f0' : 'transparent',
    fontWeight: active ? 600 : 400,
    transition: 'background 0.2s ease, font-weight 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      <aside
        style={{
          width: 200,
          flexShrink: 0,
          background: 'white',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 72,
          zIndex: 2,
        }}
      >
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>个人中心</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            style={navBtnStyle(isPosts)}
            onClick={() => router.push('/me')}
          >
            我的帖子
          </button>
          <button
            type="button"
            style={navBtnStyle(isFavorites)}
            onClick={() => router.push('/me/favorites')}
          >
            我的收藏
          </button>
        </nav>
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 个人信息不因子页 loading 卸载，避免切换时文字闪没 */}
        {userLoading ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              color: '#999',
              fontSize: '14px',
            }}
          >
            加载个人信息…
          </div>
        ) : user ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>个人信息</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <strong>用户名:</strong> {user.username}
              </div>
              <div>
                <strong>邮箱:</strong> {user.email}
              </div>
            </div>
          </div>
        ) : null}

        <div key={pathname} className="me-route-content">
          {children}
        </div>
      </div>
    </div>
  );
}
