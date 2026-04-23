import { z } from 'zod';

export const createCommentBodySchema = z.object({
  content: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'missing_content' }),
  layerMainId: z.union([z.string(), z.null()]).optional(),
});

export const friendRequestPatchSchema = z.object({
  status: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((s) => s === 'ACCEPTED' || s === 'DECLINED', { message: 'invalid_status' }),
});

export const sendMessageBodySchema = z.object({
  content: z.string().min(1).transform((s) => s.trim()),
});

export const notificationsQuerySchema = z.object({
  take: z.coerce.number().optional(),
});
