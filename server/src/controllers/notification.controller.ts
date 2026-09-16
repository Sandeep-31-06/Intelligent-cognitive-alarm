import { Request, Response, NextFunction } from 'express';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sendNotification,
  sendPlatformAnnouncement,
} from '../services/notification.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { isDbConnected, db } from '../db/index.js';
import { notifications } from '../db/schema/notifications.js';
import { eq, desc } from 'drizzle-orm';

export const getNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    const list = await getUserNotifications(userId);
    const unreadCount = list.filter((n) => !n.isRead).length;

    res.status(200).json({
      success: true,
      data: { notifications: list, unreadCount },
    });
  } catch (error) {
    next(error);
  }
};

export const markRead = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    if (!userId) throw new AppError('Unauthorized', 401);

    await markNotificationAsRead(userId, id);

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    next(error);
  }
};

export const markAllRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    await markAllNotificationsAsRead(userId);

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    const { type, title, message } = req.body;
    if (!title || !message) throw new AppError('Title and message are required', 400);

    const newNotif = await sendNotification(userId, type || 'system', title, message);

    res.status(201).json({
      success: true,
      message: 'Notification sent successfully',
      data: { notification: newNotif },
    });
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.role !== 'admin') {
      throw new AppError('Only administrators can broadcast platform announcements', 403);
    }

    const { title, message } = req.body;
    if (!title || !message) throw new AppError('Title and message are required', 400);

    const recipientCount = await sendPlatformAnnouncement(title, message);

    res.status(201).json({
      success: true,
      message: `Platform announcement broadcasted to ${recipientCount} registered users`,
    });
  } catch (error) {
    next(error);
  }
};

export const getAnnouncements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.role !== 'admin') {
      throw new AppError('Only administrators can access announcement records', 403);
    }

    if (await isDbConnected()) {
      const announcementsList = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'announcement' as any))
        .orderBy(desc(notifications.createdAt));

      res.status(200).json({
        success: true,
        data: { announcements: announcementsList },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { announcements: [] },
    });
  } catch (error) {
    next(error);
  }
};

