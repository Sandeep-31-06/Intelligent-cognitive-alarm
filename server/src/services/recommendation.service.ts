import { db, isDbConnected } from '../db/index.js';
import { challengeAttempts } from '../db/schema/challengeAttempts.js';
import { wakeUpVerifications } from '../db/schema/wakeUpVerifications.js';
import { snoozeLogs } from '../db/schema/snoozeLogs.js';
import { sleepLogs } from '../db/schema/sleepLogs.js';
import { habits } from '../db/schema/habits.js';
import { profiles } from '../db/schema/profiles.js';
import { eq } from 'drizzle-orm';

export interface UserTelemetryData {
  hasSufficientData: boolean;
  snoozeCountLast7Days: number;
  challengeAccuracy: number; // 0-100
  wakeUpConsistency: number; // 0-100
  sleepAdherence: number; // 0-100
  averageChallengeTime: number; // seconds
  productivityGoal?: string;
  currentDifficulty?: string;
  habitStreak?: number;
  typePerformance?: Record<string, { total: number; correct: number; accuracy: number }>;
}

export interface RecommendationItem {
  id: string;
  category: string;
  title: string;
  description: string;
  reason: string; // Rationale for explainability
  priority: 'high' | 'medium' | 'low';
  actionableStep?: string;
  created_at: string;
}

/**
 * Modular Rule-Based Recommendation Engine.
 * Analyzes telemetry and generates personalized recommendations strictly based on real conditions.
 */
export const generateRecommendations = (data: UserTelemetryData): RecommendationItem[] => {
  if (!data.hasSufficientData) {
    return [];
  }

  const recommendations: RecommendationItem[] = [];
  const nowStr = new Date().toISOString();

  const {
    snoozeCountLast7Days = 0,
    challengeAccuracy = 0,
    wakeUpConsistency = 0,
    sleepAdherence = 0,
    averageChallengeTime = 0,
    productivityGoal = 'Maintain peak morning focus',
    currentDifficulty = 'Medium',
    habitStreak = 0,
    typePerformance = {},
  } = data;

  // A. SLEEP IMPROVEMENT RECOMMENDATIONS
  if (sleepAdherence > 0 && sleepAdherence < 75) {
    recommendations.push({
      id: `rec-sleep-${Date.now()}-1`,
      category: 'Sleep Improvement',
      title: 'Improve Sleep Consistency',
      description: 'Your recent sleep schedule has been inconsistent. Try maintaining a consistent bedtime.',
      reason: `Sleep schedule adherence is currently at ${sleepAdherence}%. Irregular bedtimes cause circadian disruption.`,
      priority: 'high',
      actionableStep: 'Set a fixed bedtime reminder 30 minutes before your target sleep time.',
      created_at: nowStr,
    });
  } else if (sleepAdherence >= 75) {
    recommendations.push({
      id: `rec-sleep-${Date.now()}-2`,
      category: 'Sleep Improvement',
      title: 'Maintain Optimal Sleep Rhythm',
      description: 'Your recent sleep schedule has been consistent. Keep protecting your bedtime routine.',
      reason: `Sleep schedule adherence is strong at ${sleepAdherence}%.`,
      priority: 'low',
      actionableStep: 'Continue avoiding blue light exposure 30 minutes before bedtime.',
      created_at: nowStr,
    });
  }

  // B. WAKE-UP OPTIMIZATION SUGGESTIONS
  if (snoozeCountLast7Days > 0) {
    recommendations.push({
      id: `rec-wakeup-${Date.now()}-1`,
      category: 'Wake-Up Optimization',
      title: 'Reduce Morning Snoozing',
      description: 'You have been snoozing your alarms frequently. Try responding to the first alarm.',
      reason: `Recorded ${snoozeCountLast7Days} snooze event(s) recently, which fragment REM sleep and elevate morning inertia.`,
      priority: 'high',
      actionableStep: 'Enable cognitive puzzle verification on your first alarm.',
      created_at: nowStr,
    });
  } else if (wakeUpConsistency > 0 && wakeUpConsistency < 75) {
    recommendations.push({
      id: `rec-wakeup-${Date.now()}-2`,
      category: 'Wake-Up Optimization',
      title: 'Improve Wake-Up Consistency',
      description: 'Your recent wake-up times are later than your scheduled alarm.',
      reason: `Wake-up consistency is currently at ${wakeUpConsistency}%.`,
      priority: 'high',
      actionableStep: 'Place your wake-up device further from your bed.',
      created_at: nowStr,
    });
  } else {
    recommendations.push({
      id: `rec-wakeup-${Date.now()}-3`,
      category: 'Wake-Up Optimization',
      title: 'Optimal Wake-Up Response',
      description: 'You are responding to alarms promptly without excessive snoozing.',
      reason: `Wake-up consistency is high (${wakeUpConsistency}%).`,
      priority: 'low',
      actionableStep: 'Keep maintaining your prompt wake-up routine.',
      created_at: nowStr,
    });
  }

  // C. HABIT IMPROVEMENT GUIDANCE (identifies weakest component from Module 8)
  const snoozeReduction = Math.max(0, 100 - snoozeCountLast7Days * 15);
  const compScores = [
    { name: 'Snooze Reduction', score: snoozeReduction, recommendationTitle: 'Focus on Reducing Snoozes', description: 'Snooze reduction is currently your weakest habit area. Reducing repeated snoozes can improve your overall Habit Score.' },
    { name: 'Wake-Up Consistency', score: wakeUpConsistency, recommendationTitle: 'Improve Wake-Up Consistency', description: 'Focus on waking closer to your scheduled alarm time.' },
    { name: 'Challenge Completion', score: challengeAccuracy, recommendationTitle: 'Focus on Challenge Completion', description: 'Completing cognitive challenges on your first attempt will boost your overall Habit Score.' },
    { name: 'Sleep Schedule Adherence', score: sleepAdherence, recommendationTitle: 'Improve Sleep Schedule Adherence', description: 'Maintaining a consistent bedtime schedule will improve your overall Habit Score.' },
  ];
  compScores.sort((a, b) => a.score - b.score);
  const weakest = compScores[0];

  recommendations.push({
    id: `rec-habit-${Date.now()}-1`,
    category: 'Habit Improvement',
    title: weakest.recommendationTitle,
    description: weakest.description,
    reason: `${weakest.name} (${Math.round(weakest.score)}%) is currently detected as your weakest habit component.`,
    priority: 'high',
    actionableStep: `Focus on improving your ${weakest.name.toLowerCase()} targets over the next 7 days.`,
    created_at: nowStr,
  });

  // D. PRODUCTIVITY RECOMMENDATIONS
  if (productivityGoal) {
    if (wakeUpConsistency < 75 || snoozeCountLast7Days > 0) {
      recommendations.push({
        id: `rec-prod-${Date.now()}-1`,
        category: 'Productivity',
        title: 'Protect Your Morning Productivity',
        description: `Your recent wake-up pattern is reducing the time available for your morning productivity goal.`,
        reason: `Morning delay directly impacts your target goal: "${productivityGoal}".`,
        priority: 'medium',
        actionableStep: `Schedule dedicated time for "${productivityGoal}" immediately after morning awakening.`,
        created_at: nowStr,
      });
    } else {
      recommendations.push({
        id: `rec-prod-${Date.now()}-2`,
        category: 'Productivity',
        title: 'Maximize Morning Productivity Window',
        description: `Your consistent wake-up routine protects your primary morning goal: "${productivityGoal}".`,
        reason: `High wake-up discipline aligns with your goal: "${productivityGoal}".`,
        priority: 'medium',
        actionableStep: 'Leverage your peak morning alertness for deep focus tasks.',
        created_at: nowStr,
      });
    }
  }

  // E. PERSONALIZED CHALLENGE RECOMMENDATIONS
  // Check if specific challenge types are weaker
  let weakestType = '';
  let lowestAccuracy = 100;
  Object.entries(typePerformance).forEach(([type, perf]) => {
    if (perf.total >= 1 && perf.accuracy < lowestAccuracy) {
      lowestAccuracy = perf.accuracy;
      weakestType = type;
    }
  });

  if (challengeAccuracy >= 80 && currentDifficulty.toLowerCase() === 'easy') {
    recommendations.push({
      id: `rec-challenge-${Date.now()}-1`,
      category: 'Personalized Challenges',
      title: 'Try a Higher Difficulty',
      description: 'You are consistently performing well on Easy challenges. Consider trying Medium difficulty.',
      reason: `Recent challenge accuracy is high (${challengeAccuracy}%). Step up difficulty to maintain cognitive stimulation.`,
      priority: 'medium',
      actionableStep: 'Switch challenge settings to Medium or Moderate difficulty.',
      created_at: nowStr,
    });
  } else if (weakestType && lowestAccuracy < 65) {
    const formattedType = weakestType.charAt(0).toUpperCase() + weakestType.slice(1);
    recommendations.push({
      id: `rec-challenge-${Date.now()}-2`,
      category: 'Personalized Challenges',
      title: `Practice ${formattedType} Challenges`,
      description: `Your recent ${formattedType} challenge performance is lower than your other challenge types.`,
      reason: `${formattedType} accuracy is ${lowestAccuracy}%, which is your lowest challenge category.`,
      priority: 'medium',
      actionableStep: `Select ${formattedType} puzzles for your next practice sessions.`,
      created_at: nowStr,
    });
  } else if (challengeAccuracy > 0 && challengeAccuracy < 60) {
    recommendations.push({
      id: `rec-challenge-${Date.now()}-3`,
      category: 'Personalized Challenges',
      title: 'Use an Appropriate Difficulty',
      description: 'Your recent challenge accuracy has decreased. Consider using a lower difficulty level temporarily.',
      reason: `Overall challenge accuracy is at ${challengeAccuracy}%. Lowering difficulty helps build confidence.`,
      priority: 'medium',
      actionableStep: 'Temporarily switch to Easy puzzles to build morning speed.',
      created_at: nowStr,
    });
  } else {
    recommendations.push({
      id: `rec-challenge-${Date.now()}-4`,
      category: 'Personalized Challenges',
      title: 'Maintain Challenge Variety',
      description: 'Your challenge performance is steady. Continue rotating across math, logic, and memory puzzles.',
      reason: `Challenge accuracy is currently ${challengeAccuracy}%.`,
      priority: 'low',
      actionableStep: 'Try new puzzle categories to challenge different cognitive functions.',
      created_at: nowStr,
    });
  }

  return recommendations;
};

/**
 * Fetches user telemetry from database and generates personalized recommendations based strictly on real DB records.
 */
export const getRecommendationsForUser = async (userId: string): Promise<RecommendationItem[]> => {
  let snoozeCountLast7Days = 0;
  let challengeAccuracy = 0;
  let wakeUpConsistency = 0;
  let sleepAdherence = 0;
  let averageChallengeTime = 0;
  let currentDifficulty = 'Medium';
  let habitStreak = 0;
  let productivityGoal = 'Maintain peak morning focus';
  let hasSufficientData = false;
  const typePerformance: Record<string, { total: number; correct: number; accuracy: number }> = {};

  if (await isDbConnected()) {
    try {
      // User Profile details
      const userProfiles = await db.select().from(profiles).where(eq(profiles.userId, userId));
      if (userProfiles.length > 0) {
        if (userProfiles[0].productivityGoal) productivityGoal = userProfiles[0].productivityGoal;
        if (userProfiles[0].difficultyPreference) currentDifficulty = userProfiles[0].difficultyPreference;
      }

      // Challenge attempts
      const attempts = await db.select().from(challengeAttempts).where(eq(challengeAttempts.userId, userId));
      if (attempts.length > 0) {
        hasSufficientData = true;
        const correct = attempts.filter((a) => a.isCorrect).length;
        challengeAccuracy = Math.round((correct / attempts.length) * 100);
        const totalTime = attempts.reduce((acc, curr) => acc + (curr.timeTaken || 0), 0);
        averageChallengeTime = Math.round((totalTime / attempts.length) * 10) / 10 || 0;

        attempts.forEach((a) => {
          const t = a.challengeType || 'math';
          if (!typePerformance[t]) typePerformance[t] = { total: 0, correct: 0, accuracy: 0 };
          typePerformance[t].total += 1;
          if (a.isCorrect) typePerformance[t].correct += 1;
          typePerformance[t].accuracy = Math.round((typePerformance[t].correct / typePerformance[t].total) * 100);
        });
      }

      // Wake-up verifications
      const verifications = await db.select().from(wakeUpVerifications).where(eq(wakeUpVerifications.userId, userId));
      if (verifications.length > 0) {
        hasSufficientData = true;
        const verified = verifications.filter((v) => v.wakeUpVerified).length;
        wakeUpConsistency = Math.round((verified / verifications.length) * 100);
      }

      // Snooze logs
      const snoozes = await db.select().from(snoozeLogs).where(eq(snoozeLogs.userId, userId));
      if (snoozes.length > 0) {
        hasSufficientData = true;
        snoozeCountLast7Days = snoozes.reduce((acc, curr) => acc + (curr.snoozeCount || 1), 0);
      }

      // Habits
      const userHabits = await db.select().from(habits).where(eq(habits.userId, userId));
      if (userHabits.length > 0) {
        hasSufficientData = true;
        habitStreak = Math.max(...userHabits.map((h) => h.currentStreak || 0), 0);
      }

      // Sleep logs
      const sleeps = await db.select().from(sleepLogs).where(eq(sleepLogs.userId, userId));
      if (sleeps.length > 0) {
        hasSufficientData = true;
        const optimal = sleeps.filter((s) => Number(s.sleepDurationHours) >= 7).length;
        sleepAdherence = Math.round((optimal / sleeps.length) * 100);
      }
    } catch (_err) {
      console.warn('DB error reading user telemetry for recommendations');
    }
  }

  return generateRecommendations({
    hasSufficientData,
    snoozeCountLast7Days,
    challengeAccuracy,
    wakeUpConsistency,
    sleepAdherence,
    averageChallengeTime,
    currentDifficulty,
    productivityGoal,
    habitStreak,
    typePerformance,
  });
};

export const getRecommendationsByCategory = async (
  userId: string,
  categoryParam: string
): Promise<RecommendationItem[]> => {
  const allRecs = await getRecommendationsForUser(userId);
  const normalizedCategory = categoryParam.toLowerCase().replace(/[-_]/g, '');

  return allRecs.filter((rec) => {
    const recCat = rec.category.toLowerCase().replace(/[-_]/g, '');
    if (normalizedCategory === 'sleep') return recCat.includes('sleep');
    if (normalizedCategory === 'wakeup') return recCat.includes('wakeup') || recCat.includes('wake');
    if (normalizedCategory === 'habit' || normalizedCategory === 'habits') return recCat.includes('habit');
    if (normalizedCategory === 'productivity') return recCat.includes('productiv');
    if (normalizedCategory === 'challenge' || normalizedCategory === 'challenges') return recCat.includes('challenge');
    return recCat === normalizedCategory;
  });
};


