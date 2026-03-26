'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../lib/http';
import { setTokens, setStoredDisplayUsername } from '../../lib/token';

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
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px', textAlign: 'center' }}>登录</h1>
      {error && (
        <div style={{ color: 'red', marginBottom: '16px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>邮箱/用户名</label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #eaeaea',
              fontSize: '16px'
            }}
            placeholder="请输入邮箱或用户名"
          />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #eaeaea',
              fontSize: '16px'
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: '#0070f3',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            fontSize: '16px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        还没有账号？ <Link href="/register" style={{ color: '#0070f3' }}>立即注册</Link>
      </div>
    </div>
  );
}
