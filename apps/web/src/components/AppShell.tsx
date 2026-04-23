'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from './Header';
import { getTokens } from '@/features/client/token';

/** 未登录仅允许访问：首页、登录、注册、找回密码 */
const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password']);

function isPublicPath(path: string) {
  return PUBLIC_PATHS.has(path);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // 服务端预渲染时无 window，getTokens 恒为 null；水合后需在客户端重新读取
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 受保护路由在水合完成前不渲染子页面，避免未登录闪一下内容
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const logged = !!getTokens();
    setIsLoggedIn(logged);
    if (logged && (pathname === '/login' || pathname === '/register')) {
      router.replace('/circles');
    } else if (!logged && !isPublicPath(pathname)) {
      router.replace('/login');
    }
    setBootstrapped(true);
  }, [pathname, router]);

  const showHeader = isLoggedIn;
  // 未登录且非公开路由：水合前不渲染；水合后若仍无 token（等待 replace 到 /login）也不渲染，避免闪一下受保护页
  const showChildren =
    (!bootstrapped && isPublicPath(pathname)) ||
    (bootstrapped && (isPublicPath(pathname) || isLoggedIn));

  return (
    <>
      {showHeader ? <Header /> : null}
      {showChildren ? (
        children
      ) : (
        <div
          className="fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '96px 16px',
            color: 'var(--fg-subtle)',
            fontSize: 13,
            letterSpacing: '0.02em',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2.5px solid var(--brand-ring)',
              borderTopColor: 'var(--brand-500)',
              animation: 'app-loader-spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              marginBottom: 14,
            }}
          />
          <span>加载中…</span>
          <style>{`@keyframes app-loader-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
}
