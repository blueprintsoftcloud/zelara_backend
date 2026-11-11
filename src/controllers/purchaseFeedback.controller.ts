import { Request, Response } from "express";
import { PurchaseSurveyConfig, CancellationFeedback, User } from "../models/mongoose";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";

const DEFAULT_CONFIG = {
  isEnabled: true,
  headerTitle: "Sorry To See You Go..",
  urgencyBanner: " Products In huge demand might run Out of Stock",
  question: "What stopped you from completing your purchase?",
  options: [
    "Found a better deal elsewhere",
    "Technical issues with the website",
    "I changed my mind",
    "Have issues with coupons",
    "Shipping charge too high",
    "Delivery takes too long",
  ],
  allowCustomNote: true,
  customNotePlaceholder: "Others (please specify)",
  skipButtonText: "Skip and exit",
  submitButtonText: "Submit Feedback",
};

// ── GET /api/purchase-feedback/config (Public) ──────────────────────────────
export const getSurveyConfig = async (_req: Request, res: Response) => {
  try {
    let config = await PurchaseSurveyConfig.findOne();
    if (!config) {
      config = await PurchaseSurveyConfig.create(DEFAULT_CONFIG);
    }
    res.status(200).json(config);
  } catch (err: any) {
    logger.error("getSurveyConfig error", err);
    res.status(500).json({ message: "Failed to fetch survey configuration", ...DEFAULT_CONFIG });
  }
};

// ── POST /api/purchase-feedback (Public / Customer) ─────────────────────────
export const submitFeedback = async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      paymentMethod,
      triggerSource,
      orderId,
      items,
      totalAmount,
      selectedReasons,
      customNote,
    } = req.body;

    const user = (req as any).user;
    let userId = user?.id || user?._id || req.body.userId || undefined;

    let finalName = (customerName || "").trim();
    let finalEmail = (customerEmail || "").trim();
    let finalPhone = (customerPhone || "").trim();

    // 1. If we have userId from JWT or body, fetch user profile
    if (userId) {
      try {
        const dbUser = await User.findById(userId).select("username email phone").lean();
        if (dbUser) {
          if (!finalName || finalName === "Guest Customer") {
            finalName = dbUser.username || "Customer";
          }
          if (!finalEmail && dbUser.email) {
            finalEmail = dbUser.email;
          }
          if (!finalPhone && dbUser.phone) {
            finalPhone = dbUser.phone;
          }
        }
      } catch (err) {
        logger.warn("Could not lookup user by userId in submitFeedback", err);
      }
    }

    // 2. If userId was not found, but email or phone provided, check if a registered user matches
    if (!userId && (finalEmail || finalPhone)) {
      try {
        const queryConds: any[] = [];
        if (finalEmail) queryConds.push({ email: finalEmail });
        if (finalPhone) queryConds.push({ phone: finalPhone });

        const dbUser = await User.findOne({ $or: queryConds }).select("username email phone").lean();
        if (dbUser) {
          userId = dbUser._id;
          if (!finalName || finalName === "Guest Customer") {
            finalName = dbUser.username || "Customer";
          }
          if (!finalEmail && dbUser.email) {
            finalEmail = dbUser.email;
          }
          if (!finalPhone && dbUser.phone) {
            finalPhone = dbUser.phone;
          }
        }
      } catch (err) {
        logger.warn("Could not lookup user by email/phone in submitFeedback", err);
      }
    }

    if (!finalName) {
      finalName = "Guest Customer";
    }

    const cleanReasons = Array.isArray(selectedReasons)
      ? selectedReasons.map((r: any) => String(r).trim()).filter(Boolean)
      : [];

    const cleanItems = Array.isArray(items)
      ? items.map((item: any) => ({
          productId: item.productId || item.id,
          name: item.name || "Product",
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          image: item.image || "",
          variant: item.variant || "",
        }))
      : [];

    const feedback = await CancellationFeedback.create({
      userId,
      customerName: finalName,
      customerEmail: finalEmail,
      customerPhone: finalPhone,
      paymentMethod: paymentMethod || "ONLINE",
      triggerSource: triggerSource || "CHECKOUT_CANCELLED",
      orderId: orderId || undefined,
      items: cleanItems,
      totalAmount: Number(totalAmount) || 0,
      selectedReasons: cleanReasons,
      customNote: (customNote || "").trim(),
    });

    // Real-time broadcast to admin if socket is available
    const io = req.app.get("socketio");
    if (io) {
      io.emit("NEW_CANCELLATION_FEEDBACK", feedback);
    }

    res.status(201).json({
      message: "Feedback submitted successfully",
      feedback,
    });
  } catch (err: any) {
    logger.error("submitFeedback error", err);
    res.status(500).json({ message: "Failed to submit cancellation feedback" });
  }
};

// ── GET /api/purchase-feedback/admin (Admin / Staff) ────────────────────────
export const getAdminFeedbackList = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const { search, reason, paymentMethod, triggerSource, startDate, endDate } = req.query;

    const filter: Record<string, any> = {};

    if (reason && typeof reason === "string" && reason.trim()) {
      filter.selectedReasons = { $in: [reason.trim()] };
    }

    if (paymentMethod && typeof paymentMethod === "string" && paymentMethod.trim()) {
      filter.paymentMethod = paymentMethod.trim().toUpperCase();
    }

    if (triggerSource && typeof triggerSource === "string" && triggerSource.trim()) {
      filter.triggerSource = triggerSource.trim().toUpperCase();
    }

    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { customerName: searchRegex },
        { customerEmail: searchRegex },
        { customerPhone: searchRegex },
        { customNote: searchRegex },
        { "items.name": searchRegex },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(String(startDate));
      if (endDate) {
        const end = new Date(String(endDate));
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [feedbacks, total, allForAnalytics] = await Promise.all([
      CancellationFeedback.find(filter)
        .populate("userId", "username email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CancellationFeedback.countDocuments(filter),
      // Aggregation summary for analytics across all matching records
      CancellationFeedback.find(filter).select("selectedReasons totalAmount triggerSource").lean(),
    ]);

    // Enrich any records where customer details were incomplete (e.g. historical submissions)
    const enrichedFeedbacks = await Promise.all(
      feedbacks.map(async (fb: any) => {
        let name = fb.customerName;
        let email = fb.customerEmail;
        let phone = fb.customerPhone;
        const u = fb.userId;

        if (u && typeof u === "object") {
          if (!name || name === "Guest Customer") {
            name = u.username || name;
          }
          if (!email && u.email) {
            email = u.email;
          }
          if (!phone && u.phone) {
            phone = u.phone;
          }
        } else if (email && (!name || name === "Guest Customer" || !phone)) {
          const dbUser = await User.findOne({ email }).select("username email phone").lean();
          if (dbUser) {
            if (!name || name === "Guest Customer") name = dbUser.username || name;
            if (!phone && dbUser.phone) phone = dbUser.phone;
            if (!email && dbUser.email) email = dbUser.email;
          }
        }

        return {
          ...fb,
          userId: typeof u === "object" && u?._id ? u._id : u,
          customerName: name || "Guest Customer",
          customerEmail: email || "",
          customerPhone: phone || "",
        };
      })
    );

    // Analytics Breakdown
    const totalAbandonedAmount = allForAnalytics.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const reasonCounts: Record<string, number> = {};
    let totalReasonPicks = 0;

    allForAnalytics.forEach((fb) => {
      if (Array.isArray(fb.selectedReasons)) {
        fb.selectedReasons.forEach((r) => {
          reasonCounts[r] = (reasonCounts[r] || 0) + 1;
          totalReasonPicks++;
        });
      }
    });

    const reasonDistribution = Object.entries(reasonCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalReasonPicks > 0 ? Math.round((count / totalReasonPicks) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json({
      feedbacks: enrichedFeedbacks,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      analytics: {
        totalFeedbacks: total,
        totalAbandonedAmount,
        reasonDistribution,
      },
    });
  } catch (err: any) {
    logger.error("getAdminFeedbackList error", err);
    res.status(500).json({ message: "Failed to fetch cancellation feedback list" });
  }
};

// ── PUT /api/purchase-feedback/config (Admin / Staff) ───────────────────────
export const updateSurveyConfig = async (req: Request, res: Response) => {
  try {
    const {
      isEnabled,
      headerTitle,
      urgencyBanner,
      question,
      options,
      allowCustomNote,
      customNotePlaceholder,
      skipButtonText,
      submitButtonText,
    } = req.body;

    const cleanOptions = Array.isArray(options)
      ? options.map((opt: any) => String(opt).trim()).filter(Boolean)
      : DEFAULT_CONFIG.options;

    let config = await PurchaseSurveyConfig.findOne();
    if (!config) {
      config = new PurchaseSurveyConfig();
    }

    if (typeof isEnabled === "boolean") config.isEnabled = isEnabled;
    if (typeof headerTitle === "string") config.headerTitle = headerTitle.trim();
    if (typeof urgencyBanner === "string") config.urgencyBanner = urgencyBanner.trim();
    if (typeof question === "string") config.question = question.trim();
    if (cleanOptions.length > 0) config.options = cleanOptions;
    if (typeof allowCustomNote === "boolean") config.allowCustomNote = allowCustomNote;
    if (typeof customNotePlaceholder === "string") config.customNotePlaceholder = customNotePlaceholder.trim();
    if (typeof skipButtonText === "string") config.skipButtonText = skipButtonText.trim();
    if (typeof submitButtonText === "string") config.submitButtonText = submitButtonText.trim();

    await config.save();

    await createAuditLog({
      req,
      action: "UPDATE_PURCHASE_SURVEY_CONFIG",
      entity: "PurchaseSurveyConfig",
      details: { isEnabled, question, optionsCount: cleanOptions.length },
    });

    res.status(200).json({
      message: "Survey configuration updated successfully",
      config,
    });
  } catch (err: any) {
    logger.error("updateSurveyConfig error", err);
    res.status(500).json({ message: "Failed to update survey configuration" });
  }
};

// ── DELETE /api/purchase-feedback/:id (Admin / Staff) ───────────────────────
export const deleteFeedbackEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await CancellationFeedback.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Feedback entry not found" });
    }

    await createAuditLog({
      req,
      action: "DELETE_CANCELLATION_FEEDBACK",
      entity: "CancellationFeedback",
      details: { id },
    });

    res.status(200).json({ message: "Feedback entry deleted successfully" });
  } catch (err: any) {
    logger.error("deleteFeedbackEntry error", err);
    res.status(500).json({ message: "Failed to delete feedback entry" });
  }
};
