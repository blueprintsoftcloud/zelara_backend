import { Router } from "express";
import {
  getMyNotifications,
  getUserNotifications,
  markOneRead,
  markAllRead,
  deleteNotification,
  clearAllNotifications,
} from "../controllers/notification.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Per-user endpoints — any authenticated role (ADMIN, SUPER_ADMIN, STAFF, CUSTOMER)
router.get("/", authMiddleware, getMyNotifications);
router.put("/mark-all-read", authMiddleware, markAllRead);
router.put("/:id/read", authMiddleware, markOneRead);
// clear-all must be before /:id to avoid Express matching "clear-all" as an id
router.delete("/clear-all", authMiddleware, clearAllNotifications);
router.delete("/:id", authMiddleware, deleteNotification);

// Legacy alias kept for backward compat
router.get("/user", authMiddleware, getUserNotifications);

export default router;
