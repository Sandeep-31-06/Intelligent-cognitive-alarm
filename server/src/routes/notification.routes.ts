import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  getNotifications,
  markRead,
  markAllRead,
  createNotification,
  createAnnouncement,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getNotifications);
router.patch('/:id/read', markRead);
router.post('/mark-all-read', markAllRead);
router.patch('/read-all', markAllRead);
router.post('/send', createNotification);
router.post('/announce', createAnnouncement);

export default router;

