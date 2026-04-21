import nodemailer, { type Transporter } from 'nodemailer';

/**
 * SMTP 发件封装：
 * - transporter 懒加载单例，避免每次发邮件都重建连接
 * - 仅读取 process.env，保持与项目既有配置风格一致（参考 lib/auth.ts）
 */

type CachedTransporter = {
  transporter: Transporter;
  key: string;
};

let cached: CachedTransporter | null = null;

function readSmtpEnv() {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || (user ? `UniBlog <${user}>` : '');
  // SMTP_SECURE 显式控制：true 使用 TLS（QQ/163 的 465 端口）；false 使用 STARTTLS（587）
  const secure = (process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const port = Number(portRaw || (secure ? 465 : 587));
  return { host, port, secure, user, pass, from };
}

export function isMailerConfigured() {
  const { host, user, pass } = readSmtpEnv();
  return Boolean(host && user && pass);
}

function getTransporter(): Transporter {
  const { host, port, secure, user, pass } = readSmtpEnv();
  if (!host || !user || !pass) {
    throw new Error('smtp_not_configured');
  }
  const key = `${host}:${port}:${secure}:${user}`;
  if (cached && cached.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  cached = { transporter, key };
  return transporter;
}

export type VerificationPurpose = 'register' | 'reset_password';

function renderSubjectAndBody(code: string, purpose: VerificationPurpose) {
  if (purpose === 'register') {
    return {
      subject: 'UniBlog 注册验证码',
      text: `您的 UniBlog 注册验证码是 ${code}，10 分钟内有效。\n如果不是您本人操作，请忽略此邮件。`,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;color:#111;line-height:1.7">
  <p>您好，</p>
  <p>您的 UniBlog <b>注册</b>验证码是：</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#2563eb;margin:16px 0">${code}</p>
  <p>验证码 10 分钟内有效，请勿泄露给他人。</p>
  <p style="color:#888;font-size:12px;margin-top:24px">如果不是您本人操作，请忽略此邮件。</p>
</div>`,
    };
  }
  return {
    subject: 'UniBlog 找回密码验证码',
    text: `您的 UniBlog 重置密码验证码是 ${code}，10 分钟内有效。\n如果不是您本人操作，请忽略此邮件。`,
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;color:#111;line-height:1.7">
  <p>您好，</p>
  <p>您的 UniBlog <b>重置密码</b>验证码是：</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#dc2626;margin:16px 0">${code}</p>
  <p>验证码 10 分钟内有效，请勿泄露给他人。</p>
  <p style="color:#888;font-size:12px;margin-top:24px">如果不是您本人操作，请尽快修改密码。</p>
</div>`,
  };
}

export async function sendVerificationEmail(
  to: string,
  code: string,
  purpose: VerificationPurpose,
) {
  const { from } = readSmtpEnv();
  const transporter = getTransporter();
  const { subject, text, html } = renderSubjectAndBody(code, purpose);
  await transporter.sendMail({ from, to, subject, text, html });
}
