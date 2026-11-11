import { Router } from "express";
import { getStaticPages, updateStaticPage } from "../controllers/staticPages.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";

const router = Router();

// Public — no auth required (the About/Terms/Help pages, and the admin editor, both read this)
router.get("/", getStaticPages);

// Admin — same BANNER_EDIT gate as the rest of Homepage Manager's content writes,
// since this is the same "storefront content" bucket, not worth a new permission key.
router.put("/:page", authMiddleware, adminOrStaff("BANNER_EDIT"), updateStaticPage);

export default router;
