// src/middleware/rateLimit.middleware.ts
// Granular rate limiters for sensitive endpoints.
// express-rate-limit v7 usage — windowMs + limit (replaces deprecated `max`).

import rateLimit from "express-rate-limit";

/**
 * Strict limiter for login & OTP verification:
 * 30 attempts per 15 minutes per IP.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
});

/**
 * OTP send/resend limiter:
 * 5 OTP requests per 10 minutes per IP.
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many OTP requests. Please wait 10 minutes before trying again.",
  },
});

/**
 * Signup limiter:
 * 10 registrations per hour per IP (prevents mass account creation).
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many accounts created from this IP. Try again after 1 hour.",
  },
});

/**
 * Password reset limiter:
 * 5 reset requests per 30 minutes per IP.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many password reset attempts. Try again after 30 minutes.",
  },
});

/**
 * Coupon-code validation limiter:
 * 20 attempts per 10 minutes per IP — coupon codes are short, guessable strings, and
 * without a limiter this endpoint is a straightforward brute-force target for finding
 * valid promo codes.
 */
export const couponValidateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many coupon attempts. Please wait a few minutes before trying again.",
  },
});

/**
 * General API limiter — applied at the app level in server.ts.
 * 500 requests per minute per IP.
 * (The homepage alone fires ~10 concurrent requests on each load;
 *  500/min allows ~50 full page loads per minute before throttling.)
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please slow down.",
  },
});
