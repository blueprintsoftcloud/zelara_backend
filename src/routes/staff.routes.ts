import { Router } from "express";
import {
  getMyProfile,
  updateMyProfile,
  getStaffDashboard,
  listStaff,
  createStaff,
  getStaffById,
  updateStaff,
  updatePermissions,
  toggleStaffActive,
  deleteStaff,
} from "../controllers/staff.controller";
import { updateAvatar, deleteAvatar } from "../controllers/profileAdmin.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import upload from "../middleware/upload";
import { validate } from "../middleware/validate.middleware";
import {
  staffCreateSchema,
  staffUpdateSchema,
  staffUpdatePermissionsSchema,
  staffMyProfileUpdateSchema,
} from "../schemas/staff.schema";

const router = Router();

// ── Staff own profile (no adminMiddleware — staff user calls this) ─────────
router.get("/profile", authMiddleware, getMyProfile);
router.get("/dashboard", authMiddleware, getStaffDashboard);
router.patch("/me", authMiddleware, validate(staffMyProfileUpdateSchema), updateMyProfile);
router.patch("/me/avatar", authMiddleware, upload.single("avatar"), updateAvatar);
router.delete("/me/avatar", authMiddleware, deleteAvatar);

// ── Admin-only management endpoints — gated by STAFF_MANAGEMENT feature ──
router.get("/", authMiddleware, adminMiddleware, listStaff);
router.post("/", authMiddleware, adminMiddleware, validate(staffCreateSchema), createStaff);
router.get("/:id", authMiddleware, adminMiddleware, getStaffById);
router.patch("/:id", authMiddleware, adminMiddleware, validate(staffUpdateSchema), updateStaff);
router.patch("/:id/permissions", authMiddleware, adminMiddleware, validate(staffUpdatePermissionsSchema), updatePermissions);
router.patch("/:id/toggle", authMiddleware, adminMiddleware, toggleStaffActive);
router.delete("/:id", authMiddleware, adminMiddleware, deleteStaff);

export default router;
