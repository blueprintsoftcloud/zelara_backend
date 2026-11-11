// src/controllers/staticPages.controller.ts
//
// About Us / Terms & Conditions / Help Center — the three standalone content pages
// that don't fit companySettings.controller.ts's flat-string-field model (each is a
// small structured blob, not a single value). Same AppSetting key-value pattern as
// HERO_CONFIG/FOOTER_CONFIG: one JSON-stringified blob per page, upserted as a whole on
// save. Contact Us deliberately has no key here — it reuses SEO_ORG_ADDRESS/PHONE/EMAIL
// (companySettings.controller.ts) plus PAGE_CONTACT_INTRO, so an admin never fills in
// the same business info twice.

import { Request, Response } from "express";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";

const PAGE_KEYS = {
  about: "PAGE_ABOUT",
  terms: "PAGE_TERMS",
  privacy: "PAGE_PRIVACY",
  help: "PAGE_HELP",
} as const;
type PageName = keyof typeof PAGE_KEYS;

const DEFAULT_ABOUT = {
  title: "About Us",
  body: "Tell your customers who you are, what you stand for, and why they should shop with you. Edit this from Content Pages in the admin dashboard.",
};

const DEFAULT_TERMS = {
  title: "Terms & Conditions",
  body: "Add your store's terms and conditions here — shipping, returns, and usage policies. Edit this from Content Pages in the admin dashboard.",
};

const DEFAULT_PRIVACY = {
  title: "Privacy Policy",
  body: "We value your privacy and are committed to safeguarding your personal information. This Privacy Policy outlines the information we collect, how it is used, and the measures we take to protect your data.\n\nWe collect personal details such as your name, contact information, shipping address, and payment confirmation solely to process your orders and enhance your shopping experience. We never sell or share your sensitive information with third parties without your consent.\n\nIf you have any questions about our privacy practices, please contact our support team.",
};

const DEFAULT_HELP = {
  title: "Help Center",
  faqs: [
    { question: "How do I track my order?", answer: "You can track your order from the My Orders page once it has shipped." },
    { question: "What is your return policy?", answer: "Add your store's return policy here from Content Pages in the admin dashboard." },
  ],
};

const DEFAULTS: Record<PageName, unknown> = {
  about: DEFAULT_ABOUT,
  terms: DEFAULT_TERMS,
  privacy: DEFAULT_PRIVACY,
  help: DEFAULT_HELP,
};

const parseJsonOrDefault = <T>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// GET /api/pages — public (customer-facing static pages + the admin editor both read this)
export const getStaticPages = async (_req: Request, res: Response) => {
  try {
    const rows = (await prisma.appSetting.findMany({
      where: { key: { in: Object.values(PAGE_KEYS) } },
    })) || [];
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    res.status(200).json({
      about: parseJsonOrDefault(map[PAGE_KEYS.about], DEFAULT_ABOUT),
      terms: parseJsonOrDefault(map[PAGE_KEYS.terms], DEFAULT_TERMS),
      privacy: parseJsonOrDefault(map[PAGE_KEYS.privacy], DEFAULT_PRIVACY),
      help: parseJsonOrDefault(map[PAGE_KEYS.help], DEFAULT_HELP),
    });
  } catch (err: any) {
    logger.error("getStaticPages error", err);
    res.status(500).json({ message: "Error fetching pages" });
  }
};

// PUT /api/admin/pages/:page — admin/staff (BANNER_EDIT)
export const updateStaticPage = async (req: Request, res: Response) => {
  try {
    const page = req.params.page as PageName;
    if (!(page in PAGE_KEYS)) {
      res.status(400).json({ message: "Unknown page" });
      return;
    }
    const content = req.body as object;
    const key = PAGE_KEYS[page];
    const value = JSON.stringify(content);
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await createAuditLog({ req, action: `UPDATE_PAGE_${page.toUpperCase()}`, entity: "AppSetting", entityId: key });
    res.status(200).json({ message: "Page updated", [page]: content ?? DEFAULTS[page] });
  } catch (err: any) {
    logger.error("updateStaticPage error", err);
    res.status(500).json({ message: "Error updating page" });
  }
};
