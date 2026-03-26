'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from './Header';
import { getTokens } from '../lib/token';

/** 未登录仅允许访问：首页、登录、注册 */
const PUBLIC_PATHS = new Set(['/', '/login', '/register']);

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
        <div style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>
      )}
    </>
  );
}
