// src/schemas/staff.schema.ts
import { z } from "zod";

const phoneRegex = /^[6-9][0-9]{9}$/;
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;

export const staffCreateSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").trim(),
  email: z.string().regex(emailRegex, "Invalid email address format"),
  phone: z.string().regex(phoneRegex, "Phone must be a valid 10-digit Indian mobile number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  permissions: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
});

export const staffUpdateSchema = z.object({
  username: z.string().min(3).trim().optional(),
  email: z.string().regex(emailRegex, "Invalid email address format").optional(),
  phone: z.string().regex(phoneRegex, "Phone must be a valid 10-digit Indian mobile number").optional(),
  notes: z.string().max(1000).optional(),
  newPassword: z.union([z.string().min(6), z.literal("")]).optional(),
});

export const staffUpdatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

export const staffMyProfileUpdateSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").trim(),
});
