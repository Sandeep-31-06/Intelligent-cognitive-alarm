import {
  getOverviewAnalytics,
  getWakeUpAnalytics,
  getChallengeAnalytics,
  getHabitAnalytics,
  getSnoozeAnalytics,
  getProductivityAnalytics,
  getSleepAnalytics,
  DateRangeFilter,
} from './behavioralAnalytics.service.js';
import { db, isDbConnected } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export type ReportType =
  | 'habit_performance'
  | 'habit'
  | 'wake_up_performance'
  | 'wake_up'
  | 'challenge_performance'
  | 'challenge'
  | 'productivity'
  | 'sleep_analytics'
  | 'sleep'
  | 'full_comprehensive';

export type ExportFormat = 'json' | 'csv' | 'pdf' | 'excel' | 'xlsx' | 'html';

export interface ReportOptions {
  period?: 'today' | '7d' | '30d' | 'custom' | string;
  startDate?: string;
  endDate?: string;
}

export interface ReportData {
  reportId: string;
  reportType: string;
  generatedAt: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  periodLabel: string;
  title: string;
  summary: string;
  hasSufficientData: boolean;
  metrics: Record<string, any>;
  tableData: any[];
  secondaryTableData?: { title: string; data: any[] }[];
  trendData?: { label: string; value: number }[];
}

/**
 * Parses user requested period into DateRangeFilter
 */
export const parseDateRange = (options?: ReportOptions): { filter: DateRangeFilter; label: string } => {
  const period = options?.period || '7d';
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return {
      filter: { startDate: start, endDate: end },
      label: `Today (${start.toISOString().split('T')[0]})`,
    };
  }

  if (period === '30d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return {
      filter: { startDate: start, endDate: now },
      label: `Last 30 Days (${start.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]})`,
    };
  }

  if (period === 'custom' && options?.startDate && options?.endDate) {
    const start = new Date(options.startDate);
    const end = new Date(options.endDate);
    end.setHours(23, 59, 59, 999);
    return {
      filter: { startDate: start, endDate: end },
      label: `Custom Period (${options.startDate} to ${options.endDate})`,
    };
  }

  // Default: Last 7 Days
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return {
    filter: { startDate: start, endDate: now },
    label: `Last 7 Days (${start.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]})`,
  };
};

/**
 * Generates structured report data from PostgreSQL database
 */
export const generateReport = async (
  userId: string,
  reportTypeInput: string,
  options?: ReportOptions
): Promise<ReportData> => {
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const reportId = `REP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { filter, label: periodLabel } = parseDateRange(options);

  let userName = 'User';
  let userEmail = '';

  if (await isDbConnected()) {
    try {
      const uRes = await db.select().from(users).where(eq(users.id, userId));
      if (uRes.length > 0) {
        userName = uRes[0].name;
        userEmail = uRes[0].email;
      }
    } catch (_err) {}
  }

  const normalizedType = reportTypeInput.toLowerCase();

  // HABIT REPORT
  if (normalizedType.includes('habit')) {
    const overview = await getOverviewAnalytics(userId, filter);
    const habitAnalytics = await getHabitAnalytics(userId, filter);

    if (!overview.hasSufficientData && !habitAnalytics.hasSufficientData) {
      return {
        reportId,
        reportType: 'habit_performance',
        generatedAt,
        userId,
        userName,
        userEmail,
        periodLabel,
        title: 'Habit Adherence & Streak Performance Report',
        summary: 'No data available for the selected period. Complete more activities to generate this report.',
        hasSufficientData: false,
        metrics: {},
        tableData: [],
      };
    }

    const hs = overview.habitScore;
    return {
      reportId,
      reportType: 'habit_performance',
      generatedAt,
      userId,
      userName,
      userEmail,
      periodLabel,
      title: 'Habit Adherence & Streak Performance Report',
      summary: `Overall Habit Score is ${hs.overall_score}/100 (${hs.score_category}). User maintains an average habit streak of ${habitAnalytics.averageStreak} days.`,
      hasSufficientData: true,
      metrics: {
        'Overall Habit Score': `${hs.overall_score} / 100`,
        'Habit Grade': hs.score_category,
        'Wake-Up Consistency (35%)': `${hs.components.wake_up_consistency}%`,
        'Challenge Completion (25%)': `${hs.components.challenge_completion}%`,
        'Snooze Reduction (20%)': `${hs.components.snooze_reduction}%`,
        'Sleep Schedule Adherence (20%)': `${hs.components.sleep_schedule_adherence}%`,
        'Active Habits': habitAnalytics.activeHabits,
        'Average Streak': `${habitAnalytics.averageStreak} Days`,
      },
      tableData: habitAnalytics.habitsBreakdown,
      trendData: overview.weeklyTrend.map((t) => ({ label: t.day, value: t.habitScore })),
    };
  }

  // WAKE-UP REPORT
  if (normalizedType.includes('wake')) {
    const wakeupAnalytics = await getWakeUpAnalytics(userId, filter);

    if (!wakeupAnalytics.hasSufficientData) {
      return {
        reportId,
        reportType: 'wake_up_performance',
        generatedAt,
        userId,
        userName,
        userEmail,
        periodLabel,
        title: 'Wake-Up Consistency & Alarm Verification Report',
        summary: 'No data available for the selected period. Complete more activities to generate this report.',
        hasSufficientData: false,
        metrics: {},
        tableData: [],
      };
    }

    return {
      reportId,
      reportType: 'wake_up_performance',
      generatedAt,
      userId,
      userName,
      userEmail,
      periodLabel,
      title: 'Wake-Up Consistency & Alarm Verification Report',
      summary: `Wake-Up consistency stands at ${wakeupAnalytics.overallConsistency}% with an average delay of ${wakeupAnalytics.averageWakeUpDelayMinutes} minutes.`,
      hasSufficientData: true,
      metrics: {
        'Wake-Up Consistency': `${wakeupAnalytics.overallConsistency}%`,
        'Total Scheduled Alarms': wakeupAnalytics.totalAlarmsScheduled,
        'On-Time Wake-Ups': wakeupAnalytics.onTimeWakeUps,
        'Delayed Wake-Ups': wakeupAnalytics.delayedWakeUps,
        'Missed Wake-Ups': wakeupAnalytics.missedWakeUps,
        'Average Wake-Up Delay': `${wakeupAnalytics.averageWakeUpDelayMinutes} mins`,
        'Total Snoozes': wakeupAnalytics.totalSnoozes,
      },
      tableData: wakeupAnalytics.wakeUpHistory,
      trendData: wakeupAnalytics.wakeUpHistory.map((w) => ({ label: w.date.slice(5), value: w.delayMinutes })),
    };
  }

  // CHALLENGE PERFORMANCE REPORT
  if (normalizedType.includes('challenge')) {
    const challengeAnalytics = await getChallengeAnalytics(userId, filter);

    if (!challengeAnalytics.hasSufficientData) {
      return {
        reportId,
        reportType: 'challenge_performance',
        generatedAt,
        userId,
        userName,
        userEmail,
        periodLabel,
        title: 'Cognitive Challenge Engine Performance Report',
        summary: 'No data available for the selected period. Complete more activities to generate this report.',
        hasSufficientData: false,
        metrics: {},
        tableData: [],
      };
    }

    return {
      reportId,
      reportType: 'challenge_performance',
      generatedAt,
      userId,
      userName,
      userEmail,
      periodLabel,
      title: 'Cognitive Challenge Engine Performance Report',
      summary: `Challenge accuracy is ${challengeAnalytics.accuracyRate}% across ${challengeAnalytics.totalAttempts} total attempts with an average solve time of ${challengeAnalytics.averageTimeSeconds}s.`,
      hasSufficientData: true,
      metrics: {
        'Total Attempts': challengeAnalytics.totalAttempts,
        'Completed Challenges': challengeAnalytics.completedChallenges,
        'Failed Challenges': challengeAnalytics.failedChallenges,
        'Correct Answers': challengeAnalytics.correctAnswers,
        'Incorrect Answers': challengeAnalytics.incorrectAnswers,
        'Accuracy Percentage': `${challengeAnalytics.accuracyRate}%`,
        'Average Attempts/Challenge': challengeAnalytics.averageAttemptsPerChallenge,
        'Average Completion Time': `${challengeAnalytics.averageTimeSeconds}s`,
      },
      tableData: challengeAnalytics.byCategory,
      secondaryTableData: [
        { title: 'Performance by Challenge Type', data: challengeAnalytics.byCategory },
        { title: 'Performance by Difficulty Level', data: challengeAnalytics.byDifficulty },
      ],
      trendData: challengeAnalytics.byCategory.map((c) => ({ label: c.type.toUpperCase(), value: c.accuracy })),
    };
  }

  // PRODUCTIVITY REPORT
  if (normalizedType.includes('productiv')) {
    const prodAnalytics = await getProductivityAnalytics(userId, filter);

    if (!prodAnalytics.hasSufficientData) {
      return {
        reportId,
        reportType: 'productivity',
        generatedAt,
        userId,
        userName,
        userEmail,
        periodLabel,
        title: 'Productivity & Routine Adherence Report',
        summary: 'No data available for the selected period. Complete more activities to generate this report.',
        hasSufficientData: false,
        metrics: {},
        tableData: [],
      };
    }

    return {
      reportId,
      reportType: 'productivity',
      generatedAt,
      userId,
      userName,
      userEmail,
      periodLabel,
      title: 'Productivity & Routine Adherence Report',
      summary: `Target Productivity Goal: "${prodAnalytics.productivityGoal}". Morning routine adherence stands at ${prodAnalytics.morningRoutineAdherence}%.`,
      hasSufficientData: true,
      metrics: {
        'Productivity Goal': prodAnalytics.productivityGoal,
        'Wake-Up Consistency': `${prodAnalytics.wakeUpConsistency}%`,
        'Morning Routine Adherence': `${prodAnalytics.morningRoutineAdherence}%`,
        'Habit Consistency Score': `${prodAnalytics.habitConsistency}%`,
      },
      tableData: prodAnalytics.relevantActivity,
      trendData: prodAnalytics.relevantActivity.map((r) => ({ label: r.habitName, value: r.adherenceRate })),
    };
  }

  // SLEEP ANALYTICS REPORT
  if (normalizedType.includes('sleep')) {
    const sleepAnalytics = await getSleepAnalytics(userId, filter);

    if (!sleepAnalytics.hasSufficientData) {
      return {
        reportId,
        reportType: 'sleep_analytics',
        generatedAt,
        userId,
        userName,
        userEmail,
        periodLabel,
        title: 'Sleep Analytics & Schedule Adherence Report',
        summary: 'No data available for the selected period. Complete more activities to generate this report.',
        hasSufficientData: false,
        metrics: {},
        tableData: [],
      };
    }

    const metricsObj: Record<string, any> = {
      'Target Bedtime': sleepAnalytics.targetBedtime,
      'Target Wake-Up': sleepAnalytics.targetWakeTime,
      'Sleep Schedule Adherence': `${sleepAnalytics.sleepScheduleAdherence}%`,
      'Bedtime Consistency': `${sleepAnalytics.bedtimeConsistency}%`,
      'Wake-Up Consistency': `${sleepAnalytics.wakeUpConsistency}%`,
    };

    if (sleepAnalytics.hasSleepDurationRecorded && sleepAnalytics.averageSleepDurationHours) {
      metricsObj['Recorded Avg Sleep Duration'] = `${sleepAnalytics.averageSleepDurationHours} Hours`;
    }

    return {
      reportId,
      reportType: 'sleep_analytics',
      generatedAt,
      userId,
      userName,
      userEmail,
      periodLabel,
      title: 'Sleep Analytics & Schedule Adherence Report',
      summary: `Sleep Schedule Adherence is ${sleepAnalytics.sleepScheduleAdherence}% with target bedtime ${sleepAnalytics.targetBedtime} and wake-up ${sleepAnalytics.targetWakeTime}.`,
      hasSufficientData: true,
      metrics: metricsObj,
      tableData: sleepAnalytics.sleepTrend,
      trendData: sleepAnalytics.sleepTrend.map((s) => ({ label: s.date.slice(5), value: s.adherenceRate })),
    };
  }

  // DEFAULT / FULL COMPREHENSIVE REPORT
  const overview = await getOverviewAnalytics(userId, filter);
  const hs = overview.habitScore;

  return {
    reportId,
    reportType: 'full_comprehensive',
    generatedAt,
    userId,
    userName,
    userEmail,
    periodLabel,
    title: 'Executive Behavioral Telemetry Report',
    summary: overview.hasSufficientData
      ? `Overall Habit Score is ${hs.overall_score}/100 (${hs.score_category}). Morning wake-up consistency at ${overview.wakeUpConsistency}%.`
      : 'No data available for the selected period. Complete more activities to generate this report.',
    hasSufficientData: overview.hasSufficientData,
    metrics: overview.hasSufficientData
      ? {
          'Overall Habit Score': `${hs.overall_score} / 100`,
          Grade: hs.score_category,
          'Wake-Up Consistency': `${overview.wakeUpConsistency}%`,
          'Challenge Accuracy': `${overview.challengeAccuracy}%`,
          'Snooze Reduction': `${overview.snoozeReductionRate}%`,
          'Sleep Adherence': `${overview.sleepAdherenceRate}%`,
        }
      : {},
    tableData: overview.weeklyTrend,
    trendData: overview.weeklyTrend.map((t) => ({ label: t.day, value: t.habitScore })),
  };
};

/**
 * Generates a professionally formatted binary PDF Buffer using PDFKit
 */
export const exportReportToPdf = async (report: ReportData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Primary Brand Header Banner
      doc.rect(40, 40, 515, 60).fill('#0f172a');
      doc.fillColor('#38bdf8').fontSize(18).font('Helvetica-Bold').text('INTELLIGENT COGNITIVE ALARM PLATFORM', 55, 55);
      doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text('Behavioral Telemetry & Performance Report', 55, 78);

      // Metadata Block
      doc.moveDown(2);
      doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(report.title, 40, 115);
      
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      doc.text(`User: ${report.userName || 'User'} (${report.userEmail || report.userId})`, 40, 140);
      doc.text(`Report Period: ${report.periodLabel}`, 40, 154);
      doc.text(`Generated At: ${report.generatedAt} | Report ID: ${report.reportId}`, 40, 168);

      doc.moveTo(40, 185).lineTo(555, 185).strokeColor('#cbd5e1').stroke();

      // Summary Box
      doc.rect(40, 195, 515, 45).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Oblique').text(report.summary, 52, 207, { width: 490 });

      let currentY = 255;

      if (!report.hasSufficientData) {
        doc.rect(40, currentY, 515, 60).fill('#fffbe6').stroke('#ffe58f');
        doc.fillColor('#d48806').fontSize(12).font('Helvetica-Bold').text('NO DATA AVAILABLE', 55, currentY + 15);
        doc.fillColor('#595959').fontSize(10).font('Helvetica').text('Insufficient behavioral data recorded for the selected date range.', 55, currentY + 35);
        doc.end();
        return;
      }

      // Performance Metrics Grid
      if (report.metrics && Object.keys(report.metrics).length > 0) {
        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('KEY METRICS SUMMARY', 40, currentY);
        currentY += 20;

        const entries = Object.entries(report.metrics);
        const colWidth = 248;
        const rowHeight = 35;

        entries.forEach(([key, val], index) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = 40 + col * (colWidth + 19);
          const y = currentY + row * (rowHeight + 8);

          doc.rect(x, y, colWidth, rowHeight).fill('#f1f5f9').stroke('#cbd5e1');
          doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(key.toUpperCase(), x + 10, y + 6);
          doc.fillColor('#0284c7').fontSize(12).font('Helvetica-Bold').text(String(val), x + 10, y + 18);
        });

        currentY += Math.ceil(entries.length / 2) * (rowHeight + 8) + 15;
      }

      // Visual Data Representation Box
      if (report.trendData && report.trendData.length > 0) {
        if (currentY > 650) {
          doc.addPage();
          currentY = 40;
        }

        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('VISUAL PERFORMANCE TRAJECTORY', 40, currentY);
        currentY += 20;

        doc.rect(40, currentY, 515, 80).fill('#0f172a');
        
        const chartWidth = 475;
        const chartHeight = 45;
        const maxVal = Math.max(...report.trendData.map((d) => d.value), 100);
        const barWidth = Math.min(40, Math.floor(chartWidth / report.trendData.length) - 10);

        report.trendData.forEach((item, idx) => {
          const x = 60 + idx * (barWidth + 12);
          const barH = Math.round((item.value / maxVal) * chartHeight);
          const y = currentY + 15 + (chartHeight - barH);

          doc.rect(x, y, barWidth, barH).fill('#38bdf8');
          doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text(`${item.value}`, x, y - 9, { width: barWidth, align: 'center' });
          doc.fillColor('#94a3b8').fontSize(7).font('Helvetica').text(item.label, x, currentY + 65, { width: barWidth, align: 'center' });
        });

        currentY += 95;
      }

      // Detailed Breakdown Table
      if (report.tableData && report.tableData.length > 0) {
        if (currentY > 620) {
          doc.addPage();
          currentY = 40;
        }

        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('HISTORICAL TELEMETRY BREAKDOWN', 40, currentY);
        currentY += 20;

        const headers = Object.keys(report.tableData[0]);
        const colW = Math.floor(515 / headers.length);

        // Header row
        doc.rect(40, currentY, 515, 20).fill('#334155');
        headers.forEach((h, i) => {
          doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(h.toUpperCase(), 45 + i * colW, currentY + 5, { width: colW - 5, lineBreak: false, ellipsis: true });
        });
        currentY += 20;

        // Data rows
        report.tableData.slice(0, 15).forEach((row, rIdx) => {
          if (currentY > 750) {
            doc.addPage();
            currentY = 40;
          }

          const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(40, currentY, 515, 18).fill(bg).stroke('#e2e8f0');

          Object.values(row).forEach((v, cIdx) => {
            doc.fillColor('#334155').fontSize(8).font('Helvetica').text(String(v ?? ''), 45 + cIdx * colW, currentY + 4, { width: colW - 5, lineBreak: false, ellipsis: true });
          });
          currentY += 18;
        });
      }

      // Footer
      doc.fontSize(8).fillColor('#94a3b8').text('Intelligent Cognitive Alarm Platform — End of Official Report', 40, 780, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Generates structured multi-sheet Excel (.xlsx) Buffer using ExcelJS
 */
export const exportReportToExcel = async (report: ReportData): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Intelligent Cognitive Alarm Platform';
  workbook.created = new Date();

  // SHEET 1: Executive Summary & Metrics
  const summarySheet = workbook.addWorksheet('Summary & Metrics');

  summarySheet.columns = [
    { header: 'Property', key: 'prop', width: 32 },
    { header: 'Value', key: 'val', width: 45 },
  ];

  // Header styling
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };

  summarySheet.addRow({ prop: 'Platform', val: 'Intelligent Cognitive Alarm Platform' });
  summarySheet.addRow({ prop: 'Report Title', val: report.title });
  summarySheet.addRow({ prop: 'Report ID', val: report.reportId });
  summarySheet.addRow({ prop: 'Generated At', val: report.generatedAt });
  summarySheet.addRow({ prop: 'User Name', val: report.userName || report.userId });
  summarySheet.addRow({ prop: 'User Email', val: report.userEmail || '' });
  summarySheet.addRow({ prop: 'Selected Period', val: report.periodLabel });
  summarySheet.addRow({ prop: 'Summary', val: report.summary });
  summarySheet.addRow({ prop: '', val: '' });

  if (!report.hasSufficientData) {
    summarySheet.addRow({ prop: 'Status', val: 'No data available for the selected period.' });
  } else {
    summarySheet.addRow({ prop: '--- TELEMETRY METRICS ---', val: '' });
    for (const [k, v] of Object.entries(report.metrics)) {
      summarySheet.addRow({ prop: k, val: String(v) });
    }
  }

  // SHEET 2: Historical Telemetry Breakdown
  const dataSheet = workbook.addWorksheet('Telemetry Breakdown');

  if (report.hasSufficientData && report.tableData && report.tableData.length > 0) {
    const headers = Object.keys(report.tableData[0]);
    dataSheet.columns = headers.map((h) => ({
      header: h.toUpperCase(),
      key: h,
      width: Math.max(h.length + 5, 20),
    }));

    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0284C7' } };

    report.tableData.forEach((row) => {
      dataSheet.addRow(row);
    });
  } else {
    dataSheet.addRow(['No data available for the selected period.']);
  }

  // SHEET 3: Secondary Breakdown (e.g. Difficulty / Category if available)
  if (report.secondaryTableData && report.secondaryTableData.length > 0) {
    report.secondaryTableData.forEach((sec) => {
      const secSheet = workbook.addWorksheet(sec.title.slice(0, 30));
      if (sec.data && sec.data.length > 0) {
        const hList = Object.keys(sec.data[0]);
        secSheet.columns = hList.map((h) => ({ header: h.toUpperCase(), key: h, width: 22 }));
        secSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        secSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '475569' } };
        sec.data.forEach((r) => secSheet.addRow(r));
      }
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
};

export const exportReportToCsv = (report: ReportData): string => {
  let csv = `Platform,Intelligent Cognitive Alarm Platform\n`;
  csv += `Report Title,${report.title}\n`;
  csv += `Report ID,${report.reportId}\n`;
  csv += `Generated At,${report.generatedAt}\n`;
  csv += `Period,${report.periodLabel}\n`;
  csv += `Summary,"${report.summary.replace(/"/g, '""')}"\n\n`;

  if (!report.hasSufficientData) {
    csv += `STATUS,No data available for the selected period.\n`;
    return csv;
  }

  csv += `METRICS\nKey,Value\n`;
  for (const [key, value] of Object.entries(report.metrics)) {
    csv += `"${key}","${String(value).replace(/"/g, '""')}"\n`;
  }
  csv += `\nTABLE DATA\n`;
  if (report.tableData && report.tableData.length > 0) {
    const headers = Object.keys(report.tableData[0]);
    csv += headers.join(',') + '\n';
    for (const row of report.tableData) {
      csv += headers.map((h) => JSON.stringify(row[h] ?? '')).join(',') + '\n';
    }
  }
  return csv;
};

export const exportReportToHtmlDoc = (report: ReportData): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${report.title}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; margin: 0; }
    .card { background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; margin-bottom: 24px; }
    h1 { color: #38bdf8; margin-top: 0; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; }
    .metric-box { background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid #334155; }
    .metric-val { font-size: 24px; font-weight: bold; color: #38bdf8; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #0f172a; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${report.title}</h1>
    <p><strong>Period:</strong> ${report.periodLabel} | <strong>Date:</strong> ${report.generatedAt}</p>
    <p style="font-size: 16px; color: #cbd5e1;">${report.summary}</p>
  </div>
  ${
    report.hasSufficientData
      ? `
  <div class="card">
    <h2>Performance Metrics</h2>
    <div class="metric-grid">
      ${Object.entries(report.metrics)
        .map(([k, v]) => `<div class="metric-box"><div style="color: #94a3b8; text-transform: capitalize;">${k}</div><div class="metric-val">${v}</div></div>`)
        .join('')}
    </div>
  </div>
  <div class="card">
    <h2>Breakdown Data</h2>
    <table>
      <thead>
        <tr>
          ${report.tableData.length > 0 ? Object.keys(report.tableData[0]).map((h) => `<th>${h}</th>`).join('') : ''}
        </tr>
      </thead>
      <tbody>
        ${report.tableData
          .map((row) => `<tr>${Object.values(row).map((val) => `<td>${val}</td>`).join('')}</tr>`)
          .join('')}
      </tbody>
    </table>
  </div>`
      : `<div class="card" style="border-color: #eab308; color: #fef08a;">
    <h3>No Data Available</h3>
    <p>No data recorded for the selected period.</p>
  </div>`
  }
</body>
</html>`;
};
