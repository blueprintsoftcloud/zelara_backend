// src/schemas/user.schema.ts
import { z } from "zod";

export const createUserSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .min(2, "Username must be at least 2 characters")
    .max(50)
    .trim(),
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .toLowerCase()
    .trim(),
  phone: z
    .string({ required_error: "Phone is required" })
    .min(7, "Phone number too short")
    .max(15, "Phone number too long"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(100),
  role: z
    .enum(["CUSTOMER", "ADMIN", "SUPER_ADMIN"], {
      required_error: "Role is required",
    })
    .default("CUSTOMER"),
});

export const updateProfileSchema = z.object({
  username: z.string().min(2).max(50).trim().optional(),
  phone: z
    .string()
    .min(7)
    .max(15)
    .regex(/^[0-9+\-\s()]+$/, "Invalid phone number")
    .optional(),
});

export const reviewSchema = z.object({
  rating: z
    .number({ required_error: "Rating is required" })
    .int()
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  comment: z.string().max(1000, "Review too long").trim().optional(),
});
