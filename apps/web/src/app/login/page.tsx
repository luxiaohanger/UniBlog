'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/features/client/http';
import { setTokens, setStoredDisplayUsername } from '@/features/client/token';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        user?: { username: string };
      }>('/auth/login', {
        method: 'POST',
        body: { account: identifier, password }
      });
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      if (data.user?.username) setStoredDisplayUsername(data.user.username);
      router.replace('/circles');
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg === 'invalid_credentials') setError('账号或密码错误');
        else if (msg === 'login_failed') setError('登录失败：请确认数据库已迁移（执行 prisma:migrate）');
        else if (msg === 'db_not_configured') setError('服务器未配置数据库：请配置 apps/api/.env 并迁移');
        else if (msg === 'missing_fields') setError('请输入完整的账号和密码');
        else if (msg === 'Failed to fetch')
          setError('请求后端失败（可能是 CORS/跨域问题）。请确保后端已启动，并尝试重启后端');
        else setError(`登录失败：${msg}`);
      } else {
        setError('登录失败，请检查账号和密码');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '48px 16px' }}>
      <div
        className="card slide-up-enter"
        style={{
          padding: '36px 32px',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <h1
          className="responsive-h1"
          style={{
            fontSize: 28,
            marginBottom: 8,
            textAlign: 'center',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          欢迎回来
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', textAlign: 'center', marginBottom: 28 }}>
          登录你的 UniBlog 账号
        </p>

        {error && (
          <div
            className="text-line-fit fade-in"
            style={{
              color: 'var(--danger-600)',
              marginBottom: 16,
              textAlign: 'center',
              marginLeft: 'auto',
              marginRight: 'auto',
              background: 'rgba(239, 68, 68, 0.08)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              border: '1px solid rgba(239, 68, 68, 0.18)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--fg-secondary)', fontWeight: 500 }}>
              邮箱 / 用户名
            </label>
            <input
              className="text-line-fit"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                fontSize: 15,
              }}
              placeholder="请输入邮箱或用户名"
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--fg-secondary)', fontWeight: 500 }}>
              密码
            </label>
            <input
              className="text-line-fit"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                fontSize: 15,
              }}
              placeholder="请输入密码"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '13px',
              background: 'var(--brand-500)',
              color: 'white',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: 15,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: 'var(--shadow-brand)',
            }}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: 'var(--fg-muted)' }}>
          还没有账号？{' '}
          <Link href="/register" style={{ color: 'var(--brand-500)', fontWeight: 500, textDecoration: 'none' }}>
            立即注册
          </Link>
        </div>
        <div style={{ marginTop: 8, textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
          <Link href="/forgot-password" style={{ color: 'var(--fg-muted)', textDecoration: 'none' }}>
            忘记密码？
          </Link>
        </div>
      </div>
    </div>
  );
}
