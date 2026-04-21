import crypto from 'node:crypto';
import { prisma } from './prisma';

/**
 * 邮箱验证码管理：
 * - 生成 6 位数字验证码，sha256 哈希后写入 EmailVerification
 * - 同 (email, purpose) 存在未消费码时，60s 内不允许重发（冷却期）
 * - 新生成时将旧的未消费码整体置为已消费，保证同一业务只有一个活码
 * - 校验时匹配最新的未消费 / 未过期码；错误累计 >= MAX_ATTEMPTS 即作废
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export type VerificationPurpose = 'register' | 'reset_password';

export function generateCode(): string {
  // 100000 ~ 999999，保证 6 位
  return String(crypto.randomInt(100000, 1000000));
}

export function hashCode(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export type IssueCodeResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; error: 'code_cooldown'; retryAfterMs: number };

/**
 * 颁发新验证码：先根据冷却期判断，再作废旧活码并写入新码。
 * 返回原始验证码以便发送邮件；调用方负责寄送。
 */
export async function issueCode(
  email: string,
  purpose: VerificationPurpose,
): Promise<IssueCodeResult> {
  const now = new Date();
  const normalizedEmail = email.trim().toLowerCase();

  const latest = await prisma.emailVerification.findFirst({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (latest) {
    const elapsed = now.getTime() - latest.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { ok: false, error: 'code_cooldown', retryAfterMs: RESEND_COOLDOWN_MS - elapsed };
    }
  }

  await prisma.emailVerification.updateMany({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await prisma.emailVerification.create({
    data: { email: normalizedEmail, purpose, codeHash, expiresAt },
  });

  return { ok: true, code, expiresAt };
}

export type ConsumeCodeError =
  | 'missing_code'
  | 'invalid_code'
  | 'code_expired';

export type ConsumeCodeResult =
  | { ok: true }
  | { ok: false; error: ConsumeCodeError };

/**
 * 校验并消费验证码：成功后写入 consumedAt 防重放；失败累加 attempts，
 * 达到阈值即视为过期（整条作废），要求用户重新获取。
 */
export async function consumeCode(
  email: string,
  code: string | undefined,
  purpose: VerificationPurpose,
): Promise<ConsumeCodeResult> {
  if (!code || typeof code !== 'string') return { ok: false, error: 'missing_code' };
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'invalid_code' };

  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const record = await prisma.emailVerification.findFirst({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return { ok: false, error: 'invalid_code' };
  if (record.expiresAt <= now) return { ok: false, error: 'code_expired' };
  if (record.attempts >= MAX_ATTEMPTS) {
    // 达到阈值的记录仍标记为已消费，避免重复扫描
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });
    return { ok: false, error: 'code_expired' };
  }

  if (hashCode(trimmed) !== record.codeHash) {
    const nextAttempts = record.attempts + 1;
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: {
        attempts: nextAttempts,
        consumedAt: nextAttempts >= MAX_ATTEMPTS ? now : null,
      },
    });
    return { ok: false, error: 'invalid_code' };
  }

  await prisma.emailVerification.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });
  return { ok: true };
}
