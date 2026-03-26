'use client';
import { useEffect, useState } from 'react';
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
              <button type="button" onClick={() => setShowLogoutConfirm(true)} style={{ 
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
      {showLogoutConfirm && (
        <div
          role="presentation"
          onClick={() => setShowLogoutConfirm(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            zIndex: 300,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '360px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>确认退出登录？</div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>退出后将返回主界面。</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#e74c3c', color: '#fff' }}
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
