import { Request, Response } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { habits } from '../db/schema/habits.js';
import { alarms } from '../db/schema/alarms.js';
import { challenges } from '../db/schema/challenges.js';
import { challengeAttempts } from '../db/schema/challengeAttempts.js';
import { wakeUpVerifications } from '../db/schema/wakeUpVerifications.js';
import { snoozeLogs } from '../db/schema/snoozeLogs.js';
import { sleepLogs } from '../db/schema/sleepLogs.js';
import { recommendations } from '../db/schema/recommendations.js';
import { coachUserAssignments } from '../db/schema/coachUserAssignments.js';
import {
  getOverviewAnalytics,
  getWakeUpAnalytics,
  getChallengeAnalytics,
  getHabitAnalytics,
  getSnoozeAnalytics,
} from '../services/behavioralAnalytics.service.js';
import { eq, inArray, desc } from 'drizzle-orm';

export const getUserDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const overview = await getOverviewAnalytics(userId);
    const wakeUpStats = await getWakeUpAnalytics(userId);
    const challengePerformance = await getChallengeAnalytics(userId);
    const habitAnalyticsData = await getHabitAnalytics(userId);
    const snoozeStats = await getSnoozeAnalytics(userId);

    const userAlarmsList = await db
      .select()
      .from(alarms)
      .where(eq(alarms.userId, userId))
      .orderBy(desc(alarms.createdAt));

    const verificationsList = await db
      .select()
      .from(wakeUpVerifications)
      .where(eq(wakeUpVerifications.userId, userId))
      .orderBy(desc(wakeUpVerifications.createdAt))
      .limit(10);

    const alarmHistory = userAlarmsList.map((a) => {
      const matchVerif = verificationsList.find((v) => v.alarmId === a.id);
      return {
        id: a.id,
        alarmTitle: a.alarmTitle,
        alarmTime: a.alarmTime,
        repeatType: a.repeatType,
        activeStatus: a.activeStatus,
        status: matchVerif ? (matchVerif.wakeUpVerified ? 'Completed' : 'Missed') : a.activeStatus ? 'Active' : 'Disabled',
        date: matchVerif ? new Date(matchVerif.createdAt).toLocaleDateString() : 'Scheduled',
        snoozeInfo: snoozeStats.hasSufficientData ? `${snoozeStats.totalSnoozesLast7Days} snoozes` : '0 snoozes',
      };
    });

    const productivityInsights: string[] = [];
    if (overview.hasSufficientData) {
      if (overview.wakeUpConsistency >= 80) {
        productivityInsights.push('Your wake-up consistency has improved over recent days.');
      } else {
        productivityInsights.push('Your current wake-up pattern is affecting time available for your morning productivity goal.');
      }
      if (snoozeStats.totalSnoozesLast7Days > 2) {
        productivityInsights.push('Snooze activity noticed. Responding immediately to alarm increases morning alertness.');
      } else {
        productivityInsights.push('Your morning routine is becoming more consistent.');
      }
    } else {
      productivityInsights.push('Complete more activities to generate insights.');
    }

    res.status(200).json({
      success: true,
      message: 'User Dashboard Telemetry',
      data: {
        role: req.user?.role,
        userId,
        email: req.user?.email,
        todaysAlarm: userAlarmsList.find((a) => a.activeStatus) || null,
        overview,
        alarmHistory,
        wakeUpStats,
        habitScore: overview.habitScore,
        challengePerformance,
        productivityInsights,
        dashboardInfo: {
          title: 'Cognitive Readiness Overview',
          status: 'Active',
          cognitiveScore: overview.hasSufficientData ? `${overview.habitScore.overall_score}/100` : 'No data yet',
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching user dashboard',
    });
  }
};

export const getCoachDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const coachId = req.user?.userId;

    const assignments = await db
      .select()
      .from(coachUserAssignments)
      .where(eq(coachUserAssignments.coachId, coachId || ''));

    const assignedUserIds = assignments.map((a) => a.userId);
    let userList = await db.select().from(users).where(eq(users.role, 'user'));
    if (assignedUserIds.length > 0) {
      userList = await db.select().from(users).where(inArray(users.id, assignedUserIds));
    }

    const totalUsersCount = userList.length;

    const clientPerformance = await Promise.all(
      userList.map(async (u) => {
        const uOverview = await getOverviewAnalytics(u.id);
        const uWakeup = await getWakeUpAnalytics(u.id);
        const uChallenges = await getChallengeAnalytics(u.id);
        const uHabits = await getHabitAnalytics(u.id);
        const uSnoozes = await getSnoozeAnalytics(u.id);
        const uSleeps = await db.select().from(sleepLogs).where(eq(sleepLogs.userId, u.id));

        let status = 'No data yet';
        let progressTrend = 'Stable';
        if (uOverview.hasSufficientData) {
          if (uSnoozes.totalSnoozesLast7Days > 3 || uOverview.challengeAccuracy < 60) {
            status = 'Attention Needed';
            progressTrend = 'Needs Attention';
          } else if (uOverview.habitScore.overall_score >= 85) {
            status = 'Optimal';
            progressTrend = 'Improving';
          } else {
            status = 'Good';
            progressTrend = 'Stable';
          }
        }

        const sleepTrendReport = uSleeps.length > 0
          ? {
              dataAvailable: true,
              totalLogs: uSleeps.length,
              avgDurationHours: (uSleeps.reduce((acc, curr) => acc + Number(curr.sleepDurationHours || 7), 0) / uSleeps.length).toFixed(1),
              sleepAdherence: `${uOverview.sleepAdherenceRate}%`,
            }
          : {
              dataAvailable: false,
              message: 'Insufficient sleep data for this user.',
            };

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          hasActivity: uOverview.hasSufficientData,
          habitScore: uOverview.hasSufficientData ? `${uOverview.habitScore.overall_score}/100` : 'No data yet',
          streak: uHabits.hasSufficientData ? `${uHabits.longestStreak} Days` : 'No data yet',
          wakeUpConsistency: uWakeup.hasSufficientData ? `${uWakeup.overallConsistency}%` : 'No data yet',
          challengeAccuracy: uChallenges.hasSufficientData ? `${uChallenges.accuracyRate}%` : 'No data yet',
          snoozeTrend: uSnoozes.hasSufficientData ? `${uSnoozes.totalSnoozesLast7Days} snoozes` : 'No data yet',
          status,
          progressTrend,
          sleepTrendReport,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Coach Dashboard Telemetry',
      data: {
        role: req.user?.role,
        userId: req.user?.userId,
        email: req.user?.email,
        clientPerformance,
        summaryMetrics: {
          assignedClientsCount: totalUsersCount,
          activeClientsCount: clientPerformance.filter((c) => c.hasActivity).length,
          attentionNeededCount: clientPerformance.filter((c) => c.status === 'Attention Needed').length,
        },
        dashboardInfo: {
          title: 'Coach Supervision Panel',
          assignedTraineesCount: totalUsersCount,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching coach dashboard',
    });
  }
};

export const getAdminDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const dbUsers = await db.select().from(users);
    const totalUsersCount = dbUsers.length;
    const totalCoachesCount = dbUsers.filter((u) => u.role === 'coach').length;
    const activeUsersCount = dbUsers.filter((u) => u.status === 'active').length;

    const dbAlarms = await db.select().from(alarms);
    const activeAlarmsCount = dbAlarms.filter((a) => a.activeStatus).length;

    const dbHabits = await db.select().from(habits);
    const habitCount = dbHabits.length;

    const dbChallenges = await db.select().from(challenges);
    const totalChallengesCount = dbChallenges.length;

    const dbAttempts = await db.select().from(challengeAttempts);
    const totalAttemptsCount = dbAttempts.length;
    const correctAttemptsCount = dbAttempts.filter((a) => a.isCorrect).length;
    const avgChallengeAccuracy = totalAttemptsCount > 0
      ? Math.round((correctAttemptsCount / totalAttemptsCount) * 100)
      : null;

    const dbVerifications = await db.select().from(wakeUpVerifications);
    const totalVerificationsCount = dbVerifications.length;
    const verifiedWakeUpsCount = dbVerifications.filter((v) => v.wakeUpVerified).length;
    const avgWakeUpConsistency = totalVerificationsCount > 0
      ? Math.round((verifiedWakeUpsCount / totalVerificationsCount) * 100)
      : null;

    const dbSnoozes = await db.select().from(snoozeLogs);
    const totalSnoozesCount = dbSnoozes.reduce((acc, curr) => acc + (curr.snoozeCount || 1), 0);
    const avgSnoozeRate = totalUsersCount > 0
      ? Math.min(100, Math.round((totalSnoozesCount / totalUsersCount) * 10))
      : 0;

    let avgHabitScore: number | null = null;
    if (avgWakeUpConsistency !== null || avgChallengeAccuracy !== null) {
      avgHabitScore = Math.round(
        (avgWakeUpConsistency || 50) * 0.35 +
        (avgChallengeAccuracy || 50) * 0.25 +
        Math.max(0, 100 - avgSnoozeRate) * 0.20 +
        80 * 0.20
      );
    }

    // Recommendation Monitoring Aggregation
    const dbRecs = await db.select().from(recommendations);
    const totalRecsCount = dbRecs.length;
    const categoryCounts: Record<string, number> = { sleep: 0, wakeup: 0, habits: 0, productivity: 0, challenges: 0 };
    for (const r of dbRecs) {
      const cat = r.category || 'general';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const topCategoryEntry = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

    const recommendationMonitoring = {
      totalRecommendations: totalRecsCount,
      categoryBreakdown: categoryCounts,
      mostCommonCategory: topCategoryEntry ? topCategoryEntry[0] : 'None yet',
    };

    const systemReports = {
      userRegistrationReport: {
        totalRegistered: totalUsersCount,
        users: dbUsers.filter((u) => u.role === 'user').length,
        coaches: totalCoachesCount,
        admins: dbUsers.filter((u) => u.role === 'admin').length,
      },
      alarmActivityReport: {
        totalAlarms: dbAlarms.length,
        activeAlarms: activeAlarmsCount,
      },
      challengeActivityReport: {
        totalAttempts: totalAttemptsCount,
        correctAttempts: correctAttemptsCount,
        accuracyRate: avgChallengeAccuracy !== null ? `${avgChallengeAccuracy}%` : 'No data yet',
      },
      habitScoreReport: {
        platformAvgScore: avgHabitScore !== null ? avgHabitScore : 'No data yet',
        totalHabitsTracked: habitCount,
      },
    };

    res.status(200).json({
      success: true,
      message: 'Admin Dashboard Telemetry',
      data: {
        role: req.user?.role,
        userId: req.user?.userId,
        email: req.user?.email,
        platformMetrics: {
          totalUsers: totalUsersCount,
          activeUsers: activeUsersCount,
          avgHabitScore,
          avgWakeUpConsistency: avgWakeUpConsistency !== null ? `${avgWakeUpConsistency}%` : 'No data yet',
          avgChallengeAccuracy: avgChallengeAccuracy !== null ? `${avgChallengeAccuracy}%` : 'No data yet',
          avgSnoozeRate: `${avgSnoozeRate}%`,
        },
        challengeStats: {
          totalChallenges: totalChallengesCount,
          totalChallengeAttempts: totalAttemptsCount,
          platformAccuracy: avgChallengeAccuracy !== null ? `${avgChallengeAccuracy}%` : 'No data yet',
        },
        recommendationMonitoring,
        systemReports,
        dashboardInfo: {
          title: 'System Management & Platform Overview',
          totalUsers: totalUsersCount,
          activeUsers: activeUsersCount,
          avgHabitScore: avgHabitScore !== null ? avgHabitScore : 'No data yet',
          avgWakeUpConsistency: avgWakeUpConsistency !== null ? `${avgWakeUpConsistency}%` : 'No data yet',
          avgChallengeAccuracy: avgChallengeAccuracy !== null ? `${avgChallengeAccuracy}%` : 'No data yet',
          avgSnoozeRate: `${avgSnoozeRate}%`,
          totalCoaches: totalCoachesCount,
          totalActiveAlarms: activeAlarmsCount,
          totalHabits: habitCount,
          totalChallenges: totalChallengesCount,
          totalAttempts: totalAttemptsCount,
          systemHealth: '100% Operational',
          rolesDistribution: {
            users: dbUsers.filter((u) => u.role === 'user').length,
            coaches: totalCoachesCount,
            admins: dbUsers.filter((u) => u.role === 'admin').length,
          },
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching admin dashboard',
    });
  }
};

export const getCoachUserDetail = async (req: Request<{ targetUserId: string }>, res: Response): Promise<void> => {
  try {
    const { targetUserId } = req.params;

    const overview = await getOverviewAnalytics(targetUserId);
    const wakeup = await getWakeUpAnalytics(targetUserId);
    const challenges = await getChallengeAnalytics(targetUserId);
    const habitsAnalyticsData = await getHabitAnalytics(targetUserId);
    const snoozeStats = await getSnoozeAnalytics(targetUserId);
    const sleeps = await db.select().from(sleepLogs).where(eq(sleepLogs.userId, targetUserId));

    const sleepTrendReport = sleeps.length > 0
      ? {
          dataAvailable: true,
          totalLogs: sleeps.length,
          avgDurationHours: (sleeps.reduce((acc, curr) => acc + Number(curr.sleepDurationHours || 7), 0) / sleeps.length).toFixed(1),
          sleepAdherence: `${overview.sleepAdherenceRate}%`,
        }
      : {
          dataAvailable: false,
          message: 'Insufficient sleep data for this user.',
        };

    res.status(200).json({
      success: true,
      message: 'User Detailed Supervision Telemetry',
      data: {
        targetUserId,
        overview,
        wakeup,
        challenges,
        habits: habitsAnalyticsData,
        snoozeStats,
        sleepTrendReport,
      },
    });
  } catch (_err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user telemetry detail',
    });
  }
};

