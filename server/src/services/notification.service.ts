import { randomUUID } from 'crypto';
import { db, isDbConnected } from '../db/index.js';
import { notifications } from '../db/schema/notifications.js';
import { users } from '../db/schema/users.js';
import { eq, desc, and, gte } from 'drizzle-orm';

export interface AppNotification {
  id: string;
  userId: string;
  type: 'bedtime' | 'wakeup' | 'habit' | 'challenge' | 'coaching' | 'system' | 'progress' | 'announcement';
  title: string;
  message: string;
  isRead: boolean;
  scheduledFor: string;
  createdAt: string;
}

const mockNotificationsStore: Record<string, AppNotification[]> = {};

const getOrInitNotifications = (userId: string): AppNotification[] => {
  if (!mockNotificationsStore[userId]) {
    mockNotificationsStore[userId] = [
      {
        id: `notif-${Date.now()}-1`,
        userId,
        type: 'system',
        title: 'Welcome to Cognitive Alarm Platform',
        message: 'Your personal adaptive intelligence and habit engines are active.',
        isRead: false,
        scheduledFor: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];
  }
  return mockNotificationsStore[userId];
};

export const getUserNotifications = async (userId: string): Promise<AppNotification[]> => {
  if (await isDbConnected()) {
    try {
      const dbNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));

      if (dbNotifs.length > 0) {
        return dbNotifs.map((n) => ({
          id: n.id,
          userId: n.userId,
          type: n.type as any,
          title: n.title,
          message: n.message,
          isRead: n.isRead,
          scheduledFor: n.scheduledFor ? new Date(n.scheduledFor).toISOString() : new Date().toISOString(),
          createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
        }));
      }
    } catch (_err) {
      console.warn('DB notification fetch fallback');
    }
  }
  return getOrInitNotifications(userId);
};

export const markNotificationAsRead = async (userId: string, notificationId: string): Promise<boolean> => {
  const notifs = getOrInitNotifications(userId);
  const target = notifs.find((n) => n.id === notificationId);
  if (target) {
    target.isRead = true;
  }

  if (await isDbConnected()) {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    } catch (_err) {}
  }
  return true;
};

export const markAllNotificationsAsRead = async (userId: string): Promise<boolean> => {
  const notifs = getOrInitNotifications(userId);
  for (const n of notifs) {
    n.isRead = true;
  }

  if (await isDbConnected()) {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, userId));
    } catch (_err) {}
  }
  return true;
};

export const sendNotification = async (
  userId: string,
  type: AppNotification['type'],
  title: string,
  message: string,
  dedupHours: number = 12
): Promise<AppNotification> => {
  // Deduplication check: Avoid duplicate notifications with the same title created for the same user within dedupHours
  if (await isDbConnected()) {
    try {
      const windowStart = new Date(Date.now() - dedupHours * 60 * 60 * 1000);
      const existing = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.title, title),
            gte(notifications.createdAt, windowStart)
          )
        );

      if (existing.length > 0) {
        const n = existing[0];
        return {
          id: n.id,
          userId: n.userId,
          type: n.type as any,
          title: n.title,
          message: n.message,
          isRead: n.isRead,
          scheduledFor: new Date(n.scheduledFor).toISOString(),
          createdAt: new Date(n.createdAt).toISOString(),
        };
      }
    } catch (_err) {}
  }

  // Fallback memory check
  const notifs = getOrInitNotifications(userId);
  const memoryExisting = notifs.find((n) => n.title === title && Date.now() - new Date(n.createdAt).getTime() < dedupHours * 3600 * 1000);
  if (memoryExisting) {
    return memoryExisting;
  }

  const newNotif: AppNotification = {
    id: randomUUID(),
    userId,
    type,
    title,
    message,
    isRead: false,
    scheduledFor: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  notifs.unshift(newNotif);

  if (await isDbConnected()) {
    try {
      await db.insert(notifications).values({
        id: newNotif.id,
        userId,
        type: type as any,
        title,
        message,
        isRead: false,
      });
    } catch (_err) {}
  }

  return newNotif;
};

export const sendPlatformAnnouncement = async (title: string, message: string): Promise<number> => {
  if (await isDbConnected()) {
    try {
      const allUsers = await db.select({ id: users.id }).from(users);
      for (const u of allUsers) {
        await sendNotification(u.id, 'announcement', title, message, 24);
      }
      return allUsers.length;
    } catch (_err) {}
  }
  return 0;
};

