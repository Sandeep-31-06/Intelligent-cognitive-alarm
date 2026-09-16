import { Request, Response, NextFunction } from 'express';
import {
  generateReport,
  exportReportToCsv,
  exportReportToPdf,
  exportReportToExcel,
  exportReportToHtmlDoc,
  ReportOptions,
} from '../services/reports.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { db, isDbConnected } from '../db/index.js';
import { coachUserAssignments } from '../db/schema/coachUserAssignments.js';
import { eq, and } from 'drizzle-orm';

/**
 * Resolves target User ID enforcing Role-Based Access Control (RBAC)
 */
const resolveTargetUserId = async (req: Request): Promise<string> => {
  const currentUserId = req.user?.userId;
  const currentRole = req.user?.role;
  if (!currentUserId) throw new AppError('Unauthorized', 401);

  const targetUserId = (req.query.targetUserId as string) || (req.query.userId as string) || currentUserId;
  if (targetUserId === currentUserId) return currentUserId;

  if (currentRole === 'admin') return targetUserId;

  if (currentRole === 'coach') {
    if (await isDbConnected()) {
      const assignment = await db
        .select()
        .from(coachUserAssignments)
        .where(
          and(
            eq(coachUserAssignments.coachId, currentUserId),
            eq(coachUserAssignments.userId, targetUserId)
          )
        );
      if (assignment.length === 0) {
        throw new AppError('Access denied: Requested user is not assigned to coach', 403);
      }
    }
    return targetUserId;
  }

  throw new AppError('Access denied: Standard users can only view their own reports', 403);
};

export const getReportView = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetUserId = await resolveTargetUserId(req);

    const reportType = (req.query.type as string) || 'habit';
    const period = (req.query.period as string) || '7d';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const options: ReportOptions = { period, startDate, endDate };
    const reportData = await generateReport(targetUserId, reportType, options);

    res.status(200).json({
      success: true,
      message: 'Report generated successfully',
      data: reportData,
    });
  } catch (error) {
    next(error);
  }
};

export const exportReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetUserId = await resolveTargetUserId(req);

    const reportType = (req.query.type as string) || 'habit';
    const format = ((req.query.format as string) || 'pdf').toLowerCase();
    const period = (req.query.period as string) || '7d';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const options: ReportOptions = { period, startDate, endDate };
    const reportData = await generateReport(targetUserId, reportType, options);

    const filenameBase = `${reportType}_report_${Date.now()}`;

    if (format === 'pdf') {
      const pdfBuffer = await exportReportToPdf(reportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
      res.status(200).send(pdfBuffer);
      return;
    }

    if (format === 'excel' || format === 'xlsx') {
      const excelBuffer = await exportReportToExcel(reportData);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
      res.status(200).send(excelBuffer);
      return;
    }

    if (format === 'csv') {
      const csvContent = exportReportToCsv(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
      res.status(200).send(csvContent);
      return;
    }

    if (format === 'html') {
      const htmlContent = exportReportToHtmlDoc(reportData);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="${filenameBase}.html"`);
      res.status(200).send(htmlContent);
      return;
    }

    res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    next(error);
  }
};
