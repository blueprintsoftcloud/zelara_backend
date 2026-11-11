import { Request, Response } from "express";
import { User } from "../models/mongoose";
import logger from "../utils/logger";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary";

// GET /api/auth/adminProfile  (admin)
export const profileData = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const adminData = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, role: true, avatar: true, phone: true },
    });
    if (!adminData)
      return res.status(404).json({ message: "Admin profile not found" });
    res.status(200).json({ message: "Admin profile data fetched", adminData });
  } catch (err: any) {
    logger.error("profileData error", err);
    res.status(500).json({ message: "Error in fetching admin profile data" });
  }
};

// PATCH /api/admin/avatar  (admin / super-admin — same handler for both)
export const updateAvatar = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    if (!req.file) {
      res.status(400).json({ message: "No image file provided" });
      return;
    }

    // Fetch old avatar to delete from Cloudinary
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    const avatarUrl = await uploadToCloudinary(req.file.buffer, "avatars");

    // Delete old avatar if it's a Cloudinary URL
    if (user?.avatar && user.avatar.includes("cloudinary.com")) {
      try { await deleteFromCloudinary(user.avatar); } catch { /* ignore */ }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: { id: true, username: true, email: true, role: true, avatar: true, phone: true },
    });

    res.json({ message: "Avatar updated", avatar: updated.avatar, user: updated });
  } catch (err: any) {
    logger.error("updateAvatar error", err);
    res.status(500).json({ message: "Error updating avatar" });
  }
};

// DELETE /api/admin/avatar  (remove avatar)
export const deleteAvatar = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });
    if (user?.avatar && user.avatar.includes("cloudinary.com")) {
      try { await deleteFromCloudinary(user.avatar); } catch { /* ignore */ }
    }

    await prisma.user.update({ where: { id: userId }, data: { avatar: null } });
    res.json({ message: "Avatar removed" });
  } catch (err: any) {
    logger.error("deleteAvatar error", err);
    res.status(500).json({ message: "Error removing avatar" });
  }
};
