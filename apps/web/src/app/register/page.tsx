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

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px', textAlign: 'center' }}>注册</h1>
      {error && (
        <div style={{ color: 'red', marginBottom: '16px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>确认密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? '注册中...' : '注册'}
        </button>
      </form>
      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        已有账号？ <Link href="/login" style={{ color: '#0070f3' }}>立即登录</Link>
      </div>
    </div>
  );
}
