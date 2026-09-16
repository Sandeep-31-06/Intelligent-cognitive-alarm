import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { getReportView, exportReport } from '../controllers/reports.controller.js';

const router = Router();

router.use(authenticateToken);

// Generic View and Export Endpoints
router.get('/view', getReportView);
router.get('/export', exportReport);

// Specific Report Category View Shortcuts
router.get('/habit', (req, res, next) => { req.query.type = 'habit'; getReportView(req, res, next); });
router.get('/wake-up', (req, res, next) => { req.query.type = 'wake_up'; getReportView(req, res, next); });
router.get('/challenges', (req, res, next) => { req.query.type = 'challenge'; getReportView(req, res, next); });
router.get('/productivity', (req, res, next) => { req.query.type = 'productivity'; getReportView(req, res, next); });
router.get('/sleep', (req, res, next) => { req.query.type = 'sleep'; getReportView(req, res, next); });

// Specific Export Shortcuts
router.get('/:type/pdf', (req, res, next) => {
  req.query.type = req.params.type;
  req.query.format = 'pdf';
  exportReport(req, res, next);
});

router.get('/:type/excel', (req, res, next) => {
  req.query.type = req.params.type;
  req.query.format = 'excel';
  exportReport(req, res, next);
});

export default router;
