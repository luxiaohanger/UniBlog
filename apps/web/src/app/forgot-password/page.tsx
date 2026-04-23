'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/features/client/http';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapSendCodeError(msg: string): string {
  if (msg === 'invalid_email') return '邮箱格式不正确';
  if (msg === 'missing_fields') return '请填写邮箱';
  if (msg === 'code_cooldown') return '发送过于频繁，请稍后再试';
  if (msg === 'mailer_not_configured') return '服务器未配置邮件服务，请联系管理员';
  if (msg === 'mail_send_failed') return '验证码发送失败，请稍后重试';
  if (msg === 'Failed to fetch') return '请求后端失败，请确认服务已启动';
  return msg || '发送失败';
}

function mapResetError(msg: string): string {
  if (msg === 'invalid_email') return '邮箱格式不正确';
  if (msg === 'missing_fields') return '请填写完整信息';
  if (msg === 'missing_code') return '请先获取并填写验证码';
  if (msg === 'invalid_code') return '验证码错误或邮箱未注册';
  if (msg === 'code_expired') return '验证码已过期，请重新获取';
  if (msg === 'password_too_short') return '新密码至少 6 位';
  if (msg === 'Failed to fetch') return '请求后端失败，请确认服务已启动';
  return msg || '重置失败';
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    setError('');
    setInfo('');
    if (!email) return setError('请先填写邮箱');
    if (!EMAIL_REGEX.test(email)) return setError('邮箱格式不正确');
    setSending(true);
    try {
      await apiFetch('/auth/email/send-code', {
        method: 'POST',
        body: { email, purpose: 'reset_password' },
      });
      // 安全策略：即使邮箱未注册后端也会返回成功；统一提示
      setInfo('如果该邮箱已注册，验证码已发送，请查收（10 分钟内有效）');
      startCooldown(60);
    } catch (err) {
      if (err instanceof Error) setError(mapSendCodeError(err.message));
      else setError('验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (newPassword !== confirmPassword) {
      setError('两次密码输入不一致');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/auth/password/reset', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      // 重置成功后引导回登录
      alert('密码已重置，请使用新密码登录');
      router.replace('/login');
    } catch (err) {
      if (err instanceof Error) setError(mapResetError(err.message));
      else setError('重置失败');
    } finally {
      setSubmitting(false);
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

  const codeBtnDisabled = sending || cooldown > 0 || !email;

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
          找回密码
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', textAlign: 'center', marginBottom: 28 }}>
          输入注册邮箱，通过验证码重置密码
        </p>

        {error && (
          <div
            className="text-line-fit fade-in"
            style={{
              color: 'var(--danger-600)',
              marginBottom: 12,
              textAlign: 'center',
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
        {info && !error && (
          <div
            className="text-line-fit fade-in"
            style={{
              color: '#047857',
              marginBottom: 12,
              textAlign: 'center',
              background: 'rgba(16, 185, 129, 0.08)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit}>
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
            <label style={fieldLabelStyle}>邮箱验证码</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="text-line-fit"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                inputMode="numeric"
                placeholder="6 位数字验证码"
                style={{ ...fieldInputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={codeBtnDisabled}
                style={{
                  flexShrink: 0,
                  minWidth: 118,
                  padding: '0 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: codeBtnDisabled ? 'var(--surface-muted)' : 'var(--surface)',
                  color: codeBtnDisabled ? 'var(--fg-muted)' : 'var(--brand-500)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: codeBtnDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? '发送中…' : cooldown > 0 ? `${cooldown} 秒后重试` : '获取验证码'}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabelStyle}>新密码</label>
            <input
              className="text-line-fit"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="至少 6 位"
              style={fieldInputStyle}
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={fieldLabelStyle}>确认新密码</label>
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
            disabled={submitting}
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
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: 'var(--shadow-brand)',
            }}
          >
            {submitting ? '重置中…' : '重置密码'}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: 'var(--fg-muted)' }}>
          想起密码了？{' '}
          <Link href="/login" style={{ color: 'var(--brand-500)', fontWeight: 500, textDecoration: 'none' }}>
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
