// src/schemas/auth.schema.ts
import { z } from "zod";

export const signupSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .min(2, "Username must be at least 2 characters")
    .max(50, "Username must be at most 50 characters")
    .trim(),
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .toLowerCase()
    .trim(),
  phone: z
    .string({ required_error: "Phone is required" })
    .min(7, "Phone number too short")
    .max(15, "Phone number too long")
    .regex(/^[0-9+\-\s()]+$/, "Invalid phone number format"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long"),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .toLowerCase()
    .trim(),
  password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
});

export const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  otp: z
    .string({ required_error: "OTP is required" })
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must be numeric"),
});

export const resendOtpSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .toLowerCase()
    .trim(),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .toLowerCase()
    .trim(),
});

export const resetPasswordSchema = z.object({
  newPassword: z
    .string({ required_error: "New password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long"),
});

const phoneField = z
  .string({ required_error: "Phone number is required" })
  .regex(/^[6-9][0-9]{9}$/, "Enter a valid 10-digit Indian mobile number");
const accessTokenField = z.string({ required_error: "Access token is required" }).min(1);

// ── Check phone exists (before sending OTP on login screen) ─────────────────
export const checkPhoneSchema = z.object({
  phone: phoneField,
});

// ── Mobile login via MSG91 Widget access token ────────────────────────────────
export const mobileLoginSchema = z.object({
  phone: phoneField,
  accessToken: accessTokenField,
});

// ── Mobile registration via MSG91 Widget OTP ──────────────────────────────────
export const mobileRegisterSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .min(2, "Name must be at least 2 characters")
    .max(80)
    .trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim().optional().or(z.literal("")),
  phone: phoneField,
  accessToken: accessTokenField,
});
