import { db, isDbConnected } from '../db/index.js';
import { profiles } from '../db/schema/profiles.js';
import { alarms } from '../db/schema/alarms.js';
import { snoozeLogs } from '../db/schema/snoozeLogs.js';
import { wakeUpVerifications } from '../db/schema/wakeUpVerifications.js';
import { habitScores } from '../db/schema/habitScores.js';
import { challengeAttempts } from '../db/schema/challengeAttempts.js';
import { sendNotification } from './notification.service.js';
import { eq, desc } from 'drizzle-orm';

let schedulerTimer: NodeJS.Timeout | null = null;

function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const str = timeStr.trim().toUpperCase();
  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  const cleanStr = str.replace(/(AM|PM)/g, '').trim();
  const parts = cleanStr.split(':');
  if (parts.length < 2) return null;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export const checkScheduledNotifications = async () => {
  if (!(await isDbConnected())) return;

  try {
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    // 1. Bedtime Reminders: Check user profiles for configured sleepTime
    const userProfiles = await db.select().from(profiles);
    for (const p of userProfiles) {
      if (p.sleepTime) {
        const sleepMin = parseTimeToMinutes(p.sleepTime);
        if (sleepMin !== null && Math.abs(sleepMin - currentMin) <= 1) {
          await sendNotification(
            p.userId,
            'bedtime',
            'Bedtime Reminder',
            "It's almost time to start your bedtime routine.",
            12
          );
        }
      }
    }

    // 2. Wake-Up Reminders: Check active alarms
    const activeAlarmsList = await db.select().from(alarms).where(eq(alarms.activeStatus, true));
    for (const alarm of activeAlarmsList) {
      if (alarm.alarmTime) {
        const alarmMin = parseTimeToMinutes(alarm.alarmTime);
        if (alarmMin !== null && Math.abs(alarmMin - currentMin) <= 1) {
          await sendNotification(
            alarm.userId,
            'wakeup',
            'Wake-Up Reminder',
            `Your ${alarm.alarmTime} alarm is ready.`,
            12
          );
        }
      }
    }

    // 3. Habit Alerts: Based on real snooze logs & habit score drops
    const snoozes = await db.select().from(snoozeLogs);
    const snoozeUserCounts: Record<string, number> = {};
    for (const s of snoozes) {
      snoozeUserCounts[s.userId] = (snoozeUserCounts[s.userId] || 0) + (s.snoozeCount || 1);
    }
    for (const [userId, count] of Object.entries(snoozeUserCounts)) {
      if (count >= 3) {
        await sendNotification(
          userId,
          'habit',
          'Habit Alert',
          'Your snooze activity has increased recently. Try responding to your alarm without repeated snoozes.',
          24
        );
      }
    }

    // Check Habit Score degradation per user
    const userHabitScores = await db
      .select()
      .from(habitScores)
      .orderBy(desc(habitScores.created_at));

    const scoresByUser: Record<string, typeof userHabitScores> = {};
    for (const hs of userHabitScores) {
      if (!scoresByUser[hs.userId]) {
        scoresByUser[hs.userId] = [];
      }
      scoresByUser[hs.userId].push(hs);
    }

    for (const [userId, userScores] of Object.entries(scoresByUser)) {
      if (userScores.length >= 2) {
        const latest = userScores[0].overallScore;
        const previous = userScores[1].overallScore;
        if (latest < previous - 5) {
          await sendNotification(
            userId,
            'habit',
            'Habit Alert',
            'Your Habit Score has decreased recently. Focus on maintaining your wake-up and sleep routine.',
            24
          );
        }
      }
    }

    // 4. Challenge Reminders for Pending Verifications
    const pendingVerifications = await db
      .select()
      .from(wakeUpVerifications)
      .where(eq(wakeUpVerifications.wakeUpVerified, false));
    for (const v of pendingVerifications) {
      await sendNotification(
        v.userId,
        'challenge',
        'Challenge Reminder',
        'Your cognitive challenge is waiting. Complete it to finish your wake-up verification.',
        12
      );
    }

    // 5. Progress Notifications: Real score improvements & challenge milestones
    for (const [userId, userScores] of Object.entries(scoresByUser)) {
      if (userScores.length >= 2) {
        const latest = userScores[0].overallScore;
        const previous = userScores[1].overallScore;
        if (latest > previous) {
          await sendNotification(
            userId,
            'progress',
            'Great Progress!',
            'Your Habit Score has improved compared with your previous period.',
            24
          );
        }
      }
    }

    // Check challenge milestones (e.g., 10 completed challenges)
    const attempts = await db.select().from(challengeAttempts);
    const attemptsByUser: Record<string, number> = {};
    for (const a of attempts) {
      if (a.isCorrect) {
        attemptsByUser[a.userId] = (attemptsByUser[a.userId] || 0) + 1;
      }
    }

    for (const [userId, count] of Object.entries(attemptsByUser)) {
      if (count >= 10) {
        await sendNotification(
          userId,
          'progress',
          'Milestone Reached',
          'You have completed 10 cognitive challenges.',
          72
        );
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [Scheduler] Error during background check:', err?.message || err);
  }
};

export const startBackgroundScheduler = (intervalMs: number = 30000) => {
  if (schedulerTimer) return;

  console.log('⏰ [Scheduler] Background Alarm & Notification Scheduler initialized. Interval:', intervalMs, 'ms');

  schedulerTimer = setInterval(() => {
    checkScheduledNotifications();
  }, intervalMs);
};

export const stopBackgroundScheduler = () => {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('🛑 [Scheduler] Background Alarm Scheduler stopped.');
  }
};

