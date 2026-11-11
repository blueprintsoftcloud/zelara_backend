import { Router } from "express";
import {
  signup,
  login,
  logout,
  resendOtp,
  refreshTokens,
  verifyLoginOtp,
  mobileLogin,
  registerCustomer,
  checkPhoneExists,
  getMsg91WidgetConfig,
} from "../controllers/auth.controller";
import {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../controllers/passwordReset.controller";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { optionalAuthMiddleware } from "../middleware/optionalAuth.middleware";
import {
  loginLimiter,
  otpLimiter,
  signupLimiter,
  passwordResetLimiter,
} from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mobileLoginSchema,
  mobileRegisterSchema,
  checkPhoneSchema,
} from "../schemas/auth.schema";

const router = Router();

router.post("/signup", signupLimiter, validate(signupSchema), signup);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh", refreshTokens);
router.post("/logout", logout);
router.post("/login/verify", loginLimiter, validate(verifyOtpSchema), verifyLoginOtp);
router.post("/resend-otp", otpLimiter, validate(resendOtpSchema), resendOtp);
router.post("/forgot-password", passwordResetLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/verify-reset-otp", passwordResetLimiter, validate(verifyOtpSchema), verifyResetOtp);
router.post("/reset-password", passwordResetLimiter, validate(resetPasswordSchema), resetPassword);
router.get("/status", (req, res) => {
  const token = req.cookies?.jwt as string | undefined;
  const hasRefreshToken = !!req.cookies?.refreshToken;

  if (!token) {
    // No JWT — if a refresh token exists the session can be silently renewed.
    // Return 401 so the frontend interceptor calls /auth/refresh automatically.
    // If there is no refresh token either, the user is a genuine guest.
    if (hasRefreshToken) {
      return res.status(401).json({ message: "Access token expired." });
    }
    return res.status(200).json({ isLoggedIn: false, role: null });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; email: string; role: string };
    return res.status(200).json({ isLoggedIn: true, role: decoded.role });
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "TokenExpiredError") {
      // Access token has expired — signal the frontend interceptor to refresh
      return res.status(401).json({ message: "Access token expired." });
    }
    // Tampered or otherwise invalid token — treat as guest
    return res.status(200).json({ isLoggedIn: false, role: null });
  }
});

// ── Mobile OTP auth via MSG91 Widget ─────────────────────────────────────────
// All OTP send/verify calls happen browser-side. Backend only validates the
// resulting access token with MSG91's verifyAccessToken server endpoint.
router.post("/mobile/check-phone", otpLimiter, validate(checkPhoneSchema), checkPhoneExists);
router.post("/mobile/login", otpLimiter, validate(mobileLoginSchema), mobileLogin);
router.post("/mobile/register", otpLimiter, validate(mobileRegisterSchema), registerCustomer);
router.get("/mobile/widget-config", getMsg91WidgetConfig);

export default router;
