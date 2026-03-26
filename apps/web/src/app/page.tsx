'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTokens } from '../lib/token';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const authed = !!(getTokens()?.accessToken);
    if (authed) router.replace('/circles');
  }, []);
  return (
    <div style={{ 
      maxWidth: 600, 
      margin: '0 auto', 
      textAlign: 'center', 
      padding: '48px 16px'
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '24px' }}>高校博客平台</h1>
      <p style={{ fontSize: '16px', marginBottom: '32px', color: '#666' }}>
        发帖、评论、点赞/收藏/转发，连接校园内外
      </p>
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
        <Link 
          href="/login" 
          style={{
            padding: '12px 24px',
            background: '#0070f3',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '500'
          }}
        >
          登录
        </Link>
        <Link 
          href="/register" 
          style={{
            padding: '12px 24px',
            background: 'white',
            color: '#333',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '500',
            border: '1px solid #eaeaea'
          }}
        >
          注册
        </Link>
      </div>
    </div>
  );
}
