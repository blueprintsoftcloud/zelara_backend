import { Request, Response } from "express";
import { User, TempUpdate } from "../models/mongoose";
import {
  generateOtpCode,
  otpEmailPayload,
  OTP_EXPIRY_MINUTES,
} from "../config/mailer";
import logger from "../utils/logger";
import { sendEmail } from "../services/email.service";

// POST /api/user/profile/request-update  (authenticated)
export const requestProfileUpdate = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { newUsername, newPhone } = req.body;
    // Normalize once — emails are matched/stored case-insensitively everywhere.
    const newEmail: string | undefined = req.body.newEmail
      ? String(req.body.newEmail).trim().toLowerCase()
      : req.body.newEmail;

    if (!newEmail || !newUsername) {
      return res
        .status(400)
        .json({ message: "New email and username are required." });
    }

    // Check if new email taken by another user
    const existing = await prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: userId } },
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "This email is already taken by another account." });
    }

    if (newPhone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone: String(newPhone), NOT: { id: userId } },
      });
      if (existingPhone) {
        return res
          .status(400)
          .json({ message: "This phone number is already taken by another account." });
      }
    }

    const otpCode = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Upsert TempUpdate record (pendingData is a Json field)
    await prisma.tempUpdate.upsert({
      where: { userId },
      create: {
        userId,
        otp: otpCode,
        pendingData: { newEmail, newUsername, newPhone: newPhone ? String(newPhone) : undefined },
        expiresAt,
      },
      update: {
        otp: otpCode,
        pendingData: { newEmail, newUsername, newPhone: newPhone ? String(newPhone) : undefined },
        expiresAt,
      },
    });

    await sendEmail({
      to: newEmail,
      ...otpEmailPayload(otpCode, "verify your new email address"),
    });

    res
      .status(200)
      .json({
        message: `OTP sent to your new email (${newEmail}). Please verify to complete the update.`,
      });
  } catch (err: any) {
    logger.error("requestProfileUpdate error", err);
    res.status(500).json({ message: "Error initiating profile update" });
  }
};

// POST /api/user/profile/verify-update  (authenticated)
export const verifyAndUpdateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { otp } = req.body;

    const tempRecord = await prisma.tempUpdate.findUnique({
      where: { userId },
    });

    if (!tempRecord || tempRecord.otp !== otp) {
      return res.status(401).json({ message: "Invalid or expired OTP." });
    }

    if (tempRecord.expiresAt && tempRecord.expiresAt < new Date()) {
      await prisma.tempUpdate.delete({ where: { userId } });
      return res.status(401).json({ message: "OTP has expired." });
    }

    const pending = tempRecord.pendingData as {
      newEmail?: string;
      newUsername?: string;
      newPhone?: string;
    };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(pending.newEmail ? { email: pending.newEmail } : {}),
        ...(pending.newUsername ? { username: pending.newUsername } : {}),
        ...(pending.newPhone ? { phone: pending.newPhone } : {}),
      },
      select: { id: true, username: true, email: true, phone: true, role: true },
    });

    await prisma.tempUpdate.delete({ where: { userId } });

    res
      .status(200)
      .json({ message: "Profile updated successfully.", user: updatedUser });
  } catch (err: any) {
    // Prisma unique constraint violation (P2002)
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ message: "The new email address is already in use." });
    }
    logger.error("verifyAndUpdateProfile error", err);
    res.status(500).json({ message: "Error updating profile." });
  }
};
