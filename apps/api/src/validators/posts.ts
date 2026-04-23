import { z } from 'zod';

export const createPostBodySchema = z.object({
  content: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'missing_content' }),
});

export const patchPostBodySchema = z.object({
  content: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'missing_content' }),
});

export const pinPostBodySchema = z.object({
  scope: z
    .string()
    .refine((s) => s === 'profile' || s === 'feed', { message: 'invalid_scope' })
    .transform((s) => s as 'profile' | 'feed'),
  /** 与历史行为一致：任意 truthy 视为 true */
  pinned: z.any().transform((v) => Boolean(v)),
});
