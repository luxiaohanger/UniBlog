'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../lib/http';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (password !== confirmPassword) {
        setError('两次密码输入不一致');
        return;
      }
      await apiFetch('/auth/register', {
        method: 'POST',
        body: { username, email, password }
      });
      // 注册成功返回主页面
      router.replace('/');
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg === 'email_exists') setError('该邮箱已注册');
        else if (msg === 'username_exists') setError('该用户名已存在');
        else if (msg === 'password_too_short') setError('密码至少 6 位');
        else if (msg === 'missing_fields') setError('请填写完整的注册信息');
        else if (msg === 'db_not_configured') setError('服务器未配置数据库：请配置 apps/api/.env 并迁移');
        else if (msg === 'Failed to fetch') setError('请求后端失败（可能是 CORS/跨域）。请确保后端已启动');
        else setError(msg || '注册失败');
      } else {
        setError('注册失败，请检查输入信息');
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldLabelStyle = {
    display: 'block',
    marginBottom: 8,
    fontSize: 13,
    color: 'var(--fg-secondary)',
    fontWeight: 500,
  } as const;

  const fieldInputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface-muted)',
    fontSize: 15,
  } as const;

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
          加入 UniBlog
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', textAlign: 'center', marginBottom: 28 }}>
          创建你的校园账号，开始分享
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
            <label style={fieldLabelStyle}>用户名</label>
            <input
              className="text-line-fit"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={fieldInputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabelStyle}>邮箱</label>
            <input
              className="text-line-fit"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={fieldInputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabelStyle}>密码</label>
            <input
              className="text-line-fit"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={fieldInputStyle}
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={fieldLabelStyle}>确认密码</label>
            <input
              className="text-line-fit"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={fieldInputStyle}
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
            {loading ? '注册中…' : '注册'}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: 'var(--fg-muted)' }}>
          已有账号？{' '}
          <Link href="/login" style={{ color: 'var(--brand-500)', fontWeight: 500, textDecoration: 'none' }}>
            立即登录
          </Link>
        </div>
      </div>
    </div>
  );
}
