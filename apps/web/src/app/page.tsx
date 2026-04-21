'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTokens } from '../lib/token';

const FEATURES = [
  { icon: '💬', title: '即时互动', desc: '发帖评论、好友私信，实时收到通知' },
  { icon: '👥', title: '校园圈子', desc: '聚合动态，看见同学最新分享' },
  { icon: '⭐', title: '点赞收藏', desc: '一键收藏你喜欢的内容' },
];

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const authed = !!(getTokens()?.accessToken);
    if (authed) router.replace('/circles');
  }, []);
  return (
    <div
      style={{
        maxWidth: 760,
        margin: '0 auto',
        textAlign: 'center',
        padding: '80px 16px 64px',
      }}
    >
      {/* 品牌徽标 */}
      <div
        aria-hidden
        style={{
          width: 76,
          height: 76,
          margin: '0 auto 24px',
          borderRadius: 22,
          background: 'var(--brand-gradient)',
          boxShadow: '0 20px 40px rgba(0, 112, 243, 0.28), 0 6px 12px rgba(107, 92, 255, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          color: '#fff',
          fontWeight: 800,
          letterSpacing: '-0.04em',
        }}
      >
        U
      </div>

      <h1
        className="responsive-h1"
        style={{
          fontSize: 44,
          marginBottom: 16,
          background: 'var(--brand-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          fontWeight: 800,
        }}
      >
        UniBlog
      </h1>
      <p
        style={{
          fontSize: 17,
          marginBottom: 40,
          color: 'var(--fg-muted)',
          lineHeight: 1.7,
          maxWidth: 480,
          marginInline: 'auto',
        }}
      >
        发帖、评论、点赞 / 收藏 / 转发 —— 连接校园内外，让你的分享被看见。
      </p>

      <div
        className="flex-wrap-sm"
        style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 64 }}
      >
        <Link
          href="/login"
          className="btn-primary"
          style={{
            padding: '13px 32px',
            background: 'var(--brand-500)',
            color: 'white',
            borderRadius: 'var(--radius-pill)',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: 15,
            boxShadow: 'var(--shadow-brand)',
          }}
        >
          登录
        </Link>
        <Link
          href="/register"
          className="btn-secondary"
          style={{
            padding: '13px 32px',
            background: 'white',
            color: 'var(--fg)',
            borderRadius: 'var(--radius-pill)',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: 15,
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          注册
        </Link>
      </div>

      <div
        className="flex-wrap-sm stagger-list"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          textAlign: 'left',
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="card card-hover"
            style={
              {
                padding: '20px 18px',
                borderRadius: 'var(--radius-lg)',
                '--stagger-index': i + 1,
              } as React.CSSProperties
            }
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--brand-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                fontSize: 22,
              }}
            >
              {f.icon}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--fg)', fontSize: 15 }}>
              {f.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {f.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
