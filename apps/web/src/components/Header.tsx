'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { apiFetch } from '../lib/http';
import { getTokens, clearTokens } from '../lib/token';

export default function Header() {
  const router = useRouter();
  const tokens = getTokens();
  const accessToken = tokens?.accessToken || null;
  const { data } = useSWR<{ user: { id: string; email: string; username: string } }>(
    accessToken ? '/auth/me' : null,
    () => apiFetch<{ user: { id: string; email: string; username: string } }>('/auth/me')
  );
  const username = data?.user?.username;

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
        <Link href="/circles" style={{ fontSize: '18px', fontWeight: 'bold', color: '#333', textDecoration: 'none' }}>
          高校博客平台
        </Link>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {username ? (
            <>
              <Link href="/circles" style={{ color: '#333', textDecoration: 'none' }}>圈子</Link>
              <Link href="/me" style={{ color: '#333', textDecoration: 'none' }}>{username}的主页</Link>
              <button onClick={handleLogout} style={{ 
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
