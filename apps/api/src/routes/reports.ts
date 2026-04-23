import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { parseZod } from '../lib/parseRequest';
import { sendRouteError } from '../lib/routeError';
import {
  adminReportsQuerySchema,
  createReportSchema,
  reviewReportBodySchema,
} from '../validators/reports';
import * as reportsService from '../services/reportsService';

export const reportsRouter = Router();

type ReqUser = { user?: { userId: string } };

reportsRouter.post('/reports', requireAuth(), async (req, res) => {
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const body = parseZod(createReportSchema, req.body);
    const out = await reportsService.createReport(user.userId, body);
    return res.status(201).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'create-report', 'create_report_failed');
  }
});

reportsRouter.get('/admin/reports', requireAuth(), async (req, res) => {
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const q = parseZod(adminReportsQuerySchema, req.query);
    const out = await reportsService.listAdminReports(user.userId, q);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'list-reports', 'list_reports_failed');
  }
});

reportsRouter.patch('/admin/reports/:reportId', requireAuth(), async (req, res) => {
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const body = parseZod(reviewReportBodySchema, req.body);
    const out = await reportsService.reviewReport(user.userId, req.params.reportId, {
      action: body.action,
      note: body.note ?? null,
    });
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'review-report', 'review_report_failed');
  }
});
