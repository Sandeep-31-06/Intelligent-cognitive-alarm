import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { getReportView, exportReport } from '../controllers/reports.controller.js';

const router = Router();

router.use(authenticateToken);

// Generic View and Export Endpoints
router.get('/view', getReportView);
router.get('/export', exportReport);

// Specific Report Category View Shortcuts
router.get('/habit', (req: Request, res: Response, next: NextFunction) => { req.query.type = 'habit'; getReportView(req, res, next); });
router.get('/wake-up', (req: Request, res: Response, next: NextFunction) => { req.query.type = 'wake_up'; getReportView(req, res, next); });
router.get('/challenges', (req: Request, res: Response, next: NextFunction) => { req.query.type = 'challenge'; getReportView(req, res, next); });
router.get('/productivity', (req: Request, res: Response, next: NextFunction) => { req.query.type = 'productivity'; getReportView(req, res, next); });
router.get('/sleep', (req: Request, res: Response, next: NextFunction) => { req.query.type = 'sleep'; getReportView(req, res, next); });

// Specific Export Shortcuts
router.get('/:type/pdf', (req: Request, res: Response, next: NextFunction) => {
  req.query.type = req.params.type;
  req.query.format = 'pdf';
  exportReport(req, res, next);
});

router.get('/:type/excel', (req: Request, res: Response, next: NextFunction) => {
  req.query.type = req.params.type;
  req.query.format = 'excel';
  exportReport(req, res, next);
});

export default router;
