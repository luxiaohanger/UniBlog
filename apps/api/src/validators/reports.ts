import { z } from 'zod';

const REASON_MAX = 200;
const REVIEWER_NOTE_MAX = 500;

export const createReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user']),
  targetId: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'missing_target_id' }),
  reason: z
    .string()
    .max(REASON_MAX, { message: 'reason_too_long' })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'missing_reason' }),
});

export const adminReportsQuerySchema = z.object({
  status: z.string().optional(),
  take: z.coerce.number().optional(),
});

export const reviewReportBodySchema = z
  .object({
    action: z.enum(['resolve', 'reject']),
    note: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v == null ? null : String(v).trim() || null)),
  })
  .refine(
    (d) => !d.note || d.note.length <= REVIEWER_NOTE_MAX,
    { message: 'reviewer_note_too_long' }
  );
