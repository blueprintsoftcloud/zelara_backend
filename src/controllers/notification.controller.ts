import { Request, Response } from "express";
import { Notification } from "../models/mongoose";
import logger from "../utils/logger";

// GET /api/notifications  — my notifications (any authenticated role)
export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const notifications = await prisma.notification.findMany({
      where: { recipientId: userId },
      include: {
        triggeredBy: { select: { id: true, username: true, email: true } },
        order: { select: { id: true, finalAmount: true, orderStatus: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.status(200).json(notifications);
  } catch (err: any) {
    logger.error("getMyNotifications error", err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

// PUT /api/notifications/mark-all-read
export const markAllRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (err: any) {
    logger.error("markAllRead error", err);
    res.status(500).json({ message: "Error marking all notifications as read" });
  }
};

// PUT /api/notifications/:id/read
export const markOneRead = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const existing = await prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });
    if (!existing) {
      res.status(404).json({ message: "Notification not found" });
      return;
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    res.status(200).json(updated);
  } catch (err: any) {
    logger.error("markOneRead error", err);
    res.status(500).json({ message: "Error marking notification as read" });
  }
};

// DELETE /api/notifications/clear-all
export const clearAllNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await prisma.notification.deleteMany({ where: { recipientId: userId } });
    res.status(200).json({ message: "All notifications cleared" });
  } catch (err: any) {
    logger.error("clearAllNotifications error", err);
    res.status(500).json({ message: "Error clearing notifications" });
  }
};

// DELETE /api/notifications/:id
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const existing = await prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });
    if (!existing) {
      res.status(404).json({ message: "Notification not found" });
      return;
    }
    await prisma.notification.delete({ where: { id } });
    res.status(200).json({ message: "Notification deleted" });
  } catch (err: any) {
    logger.error("deleteNotification error", err);
    res.status(500).json({ message: "Error deleting notification" });
  }
};

// GET /api/notifications/user  (legacy alias — customer compat)
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const notifications = await prisma.notification.findMany({
      where: { recipientId: userId },
      // Needed so the navbar dropdown (Navbar.tsx) can deep-link a click straight to
      // the order the notification is about, same as getMyNotifications above.
      include: {
        order: { select: { id: true, finalAmount: true, orderStatus: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.status(200).json(notifications);
  } catch (err: any) {
    logger.error("getUserNotifications error", err);
    res.status(500).json({ message: "Error fetching your notifications" });
  }
};
