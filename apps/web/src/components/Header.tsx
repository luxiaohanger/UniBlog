'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { apiFetch } from '../lib/http';
import {
  getTokens,
  clearTokens,
  getStoredDisplayUsername,
  setStoredDisplayUsername,
} from '../lib/token';

export default function Header() {
  const router = useRouter();
  const tokens = getTokens();
  const accessToken = tokens?.accessToken || null;
  const { data } = useSWR<{ user: { id: string; email: string; username: string } }>(
    accessToken ? '/auth/me' : null,
    () => apiFetch<{ user: { id: string; email: string; username: string } }>('/auth/me')
  );

  useEffect(() => {
    const u = data?.user?.username;
    if (u) setStoredDisplayUsername(u);
  }, [data?.user?.username]);

  const username = data?.user?.username ?? getStoredDisplayUsername() ?? undefined;
  // 以 token 为准：已登录在 /auth/me 返回前不再误显示「登录/注册」
  const isAuthed = !!accessToken;

  const handleLogout = () => {
    clearTokens();
    router.replace('/');
  };

  return (
    <header style={{ 
      background: 'white', 
      borderBottom: '1px solid #eaeaea', 
      padding: '12px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 平台名称仅展示，不可点击跳转 */}
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
          高校博客平台
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {isAuthed ? (
            <>
              <Link href="/circles" prefetch={false} style={{ color: '#333', textDecoration: 'none' }}>
                圈子
              </Link>
              <Link href="/me" prefetch={false} style={{ color: '#333', textDecoration: 'none' }}>
                {username ? `「${username}」的主页` : '「我」的主页'}
              </Link>
              <Link href="/write" prefetch={false} style={{ color: '#333', textDecoration: 'none' }}>
                发帖
              </Link>
              <button type="button" onClick={handleLogout} style={{ 
                background: 'none', 
                border: '1px solid #ddd', 
                padding: '4px 12px', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}>退出登录</button>
            </>
          ) : (
            <>
              <Link href="/login" style={{ color: '#333', textDecoration: 'none' }}>登录</Link>
              <Link href="/register" style={{ color: '#333', textDecoration: 'none' }}>注册</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
