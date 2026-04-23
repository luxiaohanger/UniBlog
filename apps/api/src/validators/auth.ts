import { z } from 'zod';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailSchema = z
  .string()
  .min(1)
  .refine((s) => EMAIL_REGEX.test(s.trim()), { message: 'invalid_email' })
  .transform((s) => s.trim().toLowerCase());

export const sendCodeSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['register', 'reset_password']),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    username: z.string().min(1),
    password: z.string(),
    code: z.string().min(1, { message: 'missing_code' }),
  })
  .refine((d) => d.password.length >= 6, { message: 'password_too_short', path: ['password'] });

export const passwordResetSchema = z
  .object({
    email: emailSchema,
    code: z.string().min(1, { message: 'missing_code' }),
    newPassword: z.string(),
  })
  .refine((d) => d.newPassword.length >= 6, { message: 'password_too_short', path: ['newPassword'] });

export const loginSchema = z
  .object({
    account: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    password: z.string().min(1),
  })
  .refine((d) => !!(d.account || d.email || d.username), { message: 'missing_fields' });

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1, { message: 'missing_refresh_token' }),
});
