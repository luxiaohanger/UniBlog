'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/http';
import { getTokens } from '../../lib/token';
import Avatar from '../../components/Avatar';

type MeUser = {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
};

/**
 * 个人主页：侧栏 + 个人信息常驻（避免子页切换时整块被「加载中」替换导致闪烁）
 * 子路由切换时内容区使用 CSS 入场动画衔接
 */
export default function MeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const isPosts = pathname === '/me' || pathname === '/me/';
  const isFavorites =
    pathname === '/me/favorites' || pathname === '/me/favorites/';
  const isSettings =
    pathname === '/me/settings' || pathname === '/me/settings/';

  useEffect(() => {
    if (!getTokens()) {
      setUserLoading(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ user: MeUser }>('/auth/me')
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
  }, [pathname]);

  const navBtnStyle = (active: boolean): CSSProperties => ({
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    textDecoration: 'none',
    color: active ? 'var(--brand-500)' : 'var(--fg-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'left' as const,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'inherit',
    background: active ? 'var(--brand-soft)' : 'transparent',
    // 固定字重，避免切换时字形宽度变化导致“字符抖动”
    fontWeight: 500,
    transition:
      'background-color var(--dur-base) var(--ease-standard), color var(--dur-base) var(--ease-standard)',
  });

  return (
    <div className="me-shell" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <aside
        className="me-sidebar card"
        style={{
          width: 220,
          flexShrink: 0,
          padding: 16,
          borderRadius: 'var(--radius-lg)',
          position: 'sticky',
          top: 80,
          zIndex: 2,
        }}
      >
        <h2 style={{ fontSize: 13, marginBottom: 12, color: 'var(--fg-subtle)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          个人中心
        </h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            type="button"
            style={navBtnStyle(isPosts)}
            onClick={() => router.push('/me')}
          >
            <span aria-hidden style={{ fontSize: 16 }}>📝</span>
            <span>我的帖子</span>
          </button>
          <button
            type="button"
            style={navBtnStyle(isFavorites)}
            onClick={() => router.push('/me/favorites')}
          >
            <span aria-hidden style={{ fontSize: 16 }}>⭐</span>
            <span>我的收藏</span>
          </button>
          <button
            type="button"
            style={navBtnStyle(isSettings)}
            onClick={() => router.push('/me/settings')}
          >
            <span aria-hidden style={{ fontSize: 16 }}>⚙️</span>
            <span>资料设置</span>
          </button>
        </nav>
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 个人信息不因子页 loading 卸载，避免切换时文字闪没 */}
        {userLoading ? (
          <div
            className="card"
            style={{
              padding: 20,
              marginBottom: 24,
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div className="skeleton" style={{ width: 56, height: 56, borderRadius: '50%' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton" style={{ width: '30%', height: 16 }} />
              <div className="skeleton" style={{ width: '55%', height: 12 }} />
            </div>
          </div>
        ) : user ? (
          <div
            className="card card-hover"
            style={{
              padding: 20,
              marginBottom: 24,
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* 品牌色背景光晕 */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -80,
                right: -80,
                width: 220,
                height: 220,
                background: 'radial-gradient(closest-side, rgba(107,92,255,0.14), transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <Avatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              displayName={user.displayName}
              size={56}
              fontSize={22}
              style={{ boxShadow: 'var(--shadow-brand)', position: 'relative' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, position: 'relative', flex: 1 }}>
              <div className="text-line-fit" style={{ fontWeight: 600, fontSize: 17, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
                {user.displayName?.trim() || user.username}
              </div>
              <div className="text-line-fit" style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
                @{user.username} · {user.email}
              </div>
              {user.bio ? (
                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: 13,
                    marginTop: 4,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.5,
                  }}
                >
                  {user.bio}
                </div>
              ) : null}
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
