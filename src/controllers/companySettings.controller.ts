import { Request, Response } from "express";
import { CompanySettings } from "../models/mongoose";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";
import { invalidateHtmlBrandingCache } from "../utils/htmlRenderer";

const KEYS = [
  "COMPANY_NAME", "COMPANY_TAGLINE", "COMPANY_LOGO", "COMPANY_FAVICON",
  "SHOW_COMPANY_NAME", "SHOW_COMPANY_TAGLINE", "ANNOUNCEMENT_BAR", "ANNOUNCEMENT_BAR_ENABLED",
  "INVOICE_FORMAT", "MSG91_EMAIL_FROM_NAME",
  // Payment QR settings
  "PAYMENT_QR_CODE", "PAYMENT_QR_ENABLED", "PAYMENT_QR_UPI_ID", "PAYMENT_QR_ACCOUNT_NAME", "PAYMENT_QR_INSTRUCTIONS",
  // SEO settings — see updateCompanySettings below. All optional; a fresh install with
  // none of these set falls back to sensible per-page defaults on the frontend.
  "SEO_TITLE_TEMPLATE", "SEO_DEFAULT_DESCRIPTION", "SEO_DEFAULT_OG_IMAGE", "SEO_KEYWORDS",
  "SEO_GOOGLE_SITE_VERIFICATION", "SEO_GA_MEASUREMENT_ID", "META_PIXEL_ID", "SEO_ROBOTS_EXTRA",
  "SEO_ORG_TYPE", "SEO_ORG_ADDRESS", "SEO_ORG_PHONE", "SEO_ORG_EMAIL", "SEO_SOCIAL_LINKS",
  "SEO_HOME_TITLE", "SEO_HOME_DESCRIPTION", "SEO_PRODUCTS_TITLE", "SEO_PRODUCTS_DESCRIPTION",
  // Contact Us page intro line — the rest of that page (address/phone/email) reuses the
  // SEO_ORG_* fields above instead of duplicating them (see staticPages.controller.ts).
  "PAGE_CONTACT_INTRO",
  "CATEGORY_SHAPE",
] as const;
type CompanyKey = (typeof KEYS)[number];

const DEFAULT_HERO_CONFIG = {
  activeTemplate: 1,
  templates: {
    "1": { title: "Summer styles are finally here", subtitle: "This year, our new summer collection will shelter you from the harsh elements of a world that doesn't care if you live or die.", ctaText: "Shop Collection", ctaLink: "/products" },
    "2": { title: "New Arrivals Just Dropped", subtitle: "Discover our latest curated pieces.", ctaText: "Explore Now", ctaLink: "/products", bgImage: "" },
    "3": { title: "Elegance Redefined", subtitle: "Timeless. Modern. Yours.", ctaText: "Shop Now", ctaLink: "/products", accentText: "New Season" },
    "4": { title: "Lets Create your Own Style", subtitle: "It is a long established fact that a reader will be distracted by the readable content of a page.", ctaText: "Shop Now", ctaLink: "/products", accentText: "Trendy Collections", highlightText: "Create", badgeText: "25%\nDiscount on Everything", bgImage: "" },
    "5": {
      title: "Elevate Your Style With Bold Fashion",
      subtitle: "Discover our latest curated pieces for the season.",
      ctaText: "Explore Collections",
      ctaLink: "/products",
      images: [
        "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600",
        "https://images.unsplash.com/photo-1519457431-44ccd64a579b?auto=format&fit=crop&q=80&w=400",
        "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=600",
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=600",
        "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=600",
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600",
        "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=400",
      ],
    },
    "6": {
      title: "Big Style. Bigger Savings.",
      subtitle: "Our biggest collection drop of the season, at prices you'll love.",
      ctaText: "Shop The Sale",
      ctaLink: "/products",
      accentText: "Limited Time",
      highlightText: "",
      badgeText: "50%\nOFF SELECTED",
      bgImage: "",
    },
    "7": {
      title: "Simplicity Is The Ultimate Sophistication",
      subtitle: "Considered pieces, made to last. No noise — just great design.",
      ctaText: "Shop Now",
      ctaLink: "/products",
      accentText: "The Collection",
    },
    "8": {
      title: "Everything Must Go",
      subtitle: "Our biggest markdowns of the year — while stock lasts.",
      ctaText: "Shop The Sale",
      ctaLink: "/products",
      accentText: "Sale Ends Soon",
      badgeText: "70%\nOFF",
    },
    "9": {
      title: "The New Season Edit",
      subtitle: "Fresh arrivals, curated for right now.",
      ctaText: "Shop Now",
      ctaLink: "/products",
      accentText: "New In",
      bgImage: "",
    },
  },
};

interface StorefrontThemeConfig {
  themeId: string;
  customButtonBg?: string | null;
  customButtonText?: string | null;
}

const DEFAULT_THEME_CONFIG: StorefrontThemeConfig = {
  themeId: "studio-minimal",
  customButtonBg: null,
  customButtonText: null,
};

// Templates 1/2/3/5/6's "Shop / Company / Support" link grid — Template 4 is a
// deliberately link-grid-free single centered column, so it's the one key without this.
const DEFAULT_LINK_COLUMNS = [
  { heading: "Shop", links: [{ label: "New Arrivals", url: "/products" }, { label: "Best Sellers", url: "/products" }] },
  { heading: "Company", links: [{ label: "Our Story", url: "/about" }, { label: "Terms & Conditions", url: "/terms" }] },
  { heading: "Support", links: [{ label: "Help Center", url: "/help" }, { label: "Contact Us", url: "/contact" }] },
];

const DEFAULT_NAVBAR_CONFIG = {
  activeTemplate: 1,
};

const DEFAULT_FOOTER_CONFIG = {
  activeTemplate: 1,
  templates: {
    "1": {
      tagline: "We are a design house dedicated to the art of Indian textile. Our mission is to keep the loom alive while dressing the future.",
      instagramLink: "https://instagram.com",
      facebookLink: "https://facebook.com",
      twitterLink: "https://twitter.com",
      mailLink: "info@yourbrand.com",
      linkColumns: DEFAULT_LINK_COLUMNS,
    },
    "2": {
      tagline: "Crafting timeless Indian fashion for the modern world.",
      instagramLink: "https://instagram.com",
      facebookLink: "https://facebook.com",
      twitterLink: "https://twitter.com",
      mailLink: "info@yourbrand.com",
      linkColumns: DEFAULT_LINK_COLUMNS,
    },
    "3": {
      tagline: "From our looms to your wardrobe — authentically Indian.",
      newsletterTitle: "Stay in the loop",
      instagramLink: "https://instagram.com",
      facebookLink: "https://facebook.com",
      twitterLink: "https://twitter.com",
      mailLink: "info@yourbrand.com",
      linkColumns: DEFAULT_LINK_COLUMNS,
    },
    "4": {
      tagline: "Thank you for being part of our story.",
      instagramLink: "https://instagram.com",
      facebookLink: "https://facebook.com",
      twitterLink: "https://twitter.com",
      mailLink: "info@yourbrand.com",
    },
    "5": {
      tagline: "Celebrate the season with us.",
      instagramLink: "https://instagram.com",
      facebookLink: "https://facebook.com",
      twitterLink: "https://twitter.com",
      mailLink: "info@yourbrand.com",
      linkColumns: DEFAULT_LINK_COLUMNS,
    },
    "6": {
      tagline: "Designed with care, worn with pride.",
      instagramLink: "https://instagram.com",
      facebookLink: "https://facebook.com",
      twitterLink: "https://twitter.com",
      mailLink: "info@yourbrand.com",
      linkColumns: DEFAULT_LINK_COLUMNS,
    },
  },
};

export interface PreFooterBannerItem {
  id: string;
  image: string;
  link?: string;
  title?: string;
  isActive?: boolean;
}

export interface PreFooterConfig {
  enabled: boolean;
  autoplaySpeed?: number;
  banners: PreFooterBannerItem[];
}

export const DEFAULT_PRE_FOOTER_CONFIG: PreFooterConfig = {
  enabled: true,
  autoplaySpeed: 5000,
  banners: [],
};

export interface FeaturedCategorySlot {
  id: string;
  categoryId: string;
  customTitle?: string;
  customSubtitle?: string;
  limit?: number;
  isActive?: boolean;
  template?: number;
}

export interface FeaturedCategoriesConfig {
  slots: FeaturedCategorySlot[];
}

export const DEFAULT_FEATURED_CATEGORIES_CONFIG: FeaturedCategoriesConfig = {
  slots: [
    { id: "slot-1", categoryId: "", customTitle: "", customSubtitle: "", limit: 8, isActive: true, template: 1 },
    { id: "slot-2", categoryId: "", customTitle: "", customSubtitle: "", limit: 8, isActive: true, template: 1 },
  ],
};

// GET /api/admin/company-settings  — public (invoice pages need it)
export const getCompanySettings = async (_req: Request, res: Response) => {
  try {
    const rows = (await prisma.appSetting.findMany({
      where: { key: { in: [...KEYS] } },
    })) || [];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.status(200).json({ settings });
  } catch (err: any) {
    logger.error("getCompanySettings error", err);
    res.status(500).json({ message: "Error fetching company settings" });
  }
};

const parseJsonOrDefault = <T>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// GET /api/admin/homepage-config  — public (HeroSection/FooterSection load it on every
// page view; also doubles as admin-only when read from Homepage Manager)
export const getHomepageConfig = async (req: Request, res: Response) => {
  try {
    const rows = (await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            "HERO_CONFIG",
            "FOOTER_CONFIG",
            "NAVBAR_CONFIG",
            "STOREFRONT_THEME",
            "ACTIVE_OCCASION",
            "PRE_FOOTER_CONFIG",
            "FEATURED_CATEGORIES_CONFIG",
            "CATEGORY_SHAPE",
            ...Object.values(SECTION_TEMPLATE_KEYS),
          ],
        },
      },
    })) || [];
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    const heroConfig = parseJsonOrDefault(map["HERO_CONFIG"], DEFAULT_HERO_CONFIG);
    const footerConfig = parseJsonOrDefault(map["FOOTER_CONFIG"], DEFAULT_FOOTER_CONFIG);
    const navbarConfig = parseJsonOrDefault(map["NAVBAR_CONFIG"], DEFAULT_NAVBAR_CONFIG);
    const themeConfig = parseJsonOrDefault(map["STOREFRONT_THEME"], DEFAULT_THEME_CONFIG);
    const activeOccasionId = map["ACTIVE_OCCASION"] || null;
    const preFooterConfig = parseJsonOrDefault(map["PRE_FOOTER_CONFIG"], DEFAULT_PRE_FOOTER_CONFIG);
    const featuredCategoriesConfig = parseJsonOrDefault(map["FEATURED_CATEGORIES_CONFIG"], DEFAULT_FEATURED_CATEGORIES_CONFIG);
    // Plain integers, not JSON — parseInt with a fallback is enough (no parseJsonOrDefault).
    const toTemplateNum = (raw: string | undefined) => {
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isInteger(n) && n >= 1 ? n : 1;
    };
    const announcementTemplate = toTemplateNum(map[SECTION_TEMPLATE_KEYS.announcement]);
    const carouselTemplate = toTemplateNum(map[SECTION_TEMPLATE_KEYS.carousel]);
    const discountTemplate = toTemplateNum(map[SECTION_TEMPLATE_KEYS.discount]);
    const featuredTemplate = toTemplateNum(map[SECTION_TEMPLATE_KEYS.featured]);
    const categoryShape = map["CATEGORY_SHAPE"] === "circle" ? "circle" : "square";

    res.status(200).json({
      heroConfig,
      footerConfig,
      navbarConfig,
      themeConfig,
      activeOccasionId,
      preFooterConfig,
      featuredCategoriesConfig,
      announcementTemplate,
      carouselTemplate,
      discountTemplate,
      featuredTemplate,
      categoryShape,
    });
  } catch (err: any) {
    logger.error("getHomepageConfig error", err);
    res.status(500).json({ message: "Error fetching homepage config" });
  }
};

/**
 * Recursively scans an arbitrary config object/array and collects all Cloudinary URLs.
 */
const extractCloudinaryUrls = (val: unknown): Set<string> => {
  const urls = new Set<string>();
  const scan = (item: unknown) => {
    if (!item) return;
    if (typeof item === "string") {
      if (item.includes("cloudinary.com")) {
        urls.add(item);
      }
    } else if (Array.isArray(item)) {
      item.forEach(scan);
    } else if (typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach(scan);
    }
  };
  scan(val);
  return urls;
};

// PUT /api/admin/homepage-config/hero  — admin only
export const updateHeroConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body as object;
    const value = JSON.stringify(config);

    // Clean up replaced or removed hero images from Cloudinary — prevents orphaning
    const previousSetting = await prisma.appSetting.findUnique({
      where: { key: "HERO_CONFIG" },
    });
    if (previousSetting?.value) {
      const prevConfig = parseJsonOrDefault<unknown>(previousSetting.value, null);
      const prevUrls = extractCloudinaryUrls(prevConfig);
      const newUrls = extractCloudinaryUrls(config);
      const orphanedUrls = [...prevUrls].filter((url) => !newUrls.has(url));

      if (orphanedUrls.length > 0) {
        await Promise.allSettled(
          orphanedUrls.map((url) =>
            deleteFromCloudinary(url).catch((e: unknown) =>
              logger.warn("Failed to delete replaced hero image from Cloudinary", { url, error: e }),
            ),
          ),
        );
      }
    }

    await prisma.appSetting.upsert({
      where: { key: "HERO_CONFIG" },
      update: { value },
      create: { key: "HERO_CONFIG", value },
    });
    await createAuditLog({ req, action: "UPDATE_HERO_CONFIG", entity: "AppSetting", entityId: "HERO_CONFIG" });
    res.status(200).json({ message: "Hero config updated", heroConfig: config });
  } catch (err: any) {
    logger.error("updateHeroConfig error", err);
    res.status(500).json({ message: "Error updating hero config" });
  }
};

// PUT /api/admin/homepage-config/footer  — admin only
export const updateFooterConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body as object;
    const value = JSON.stringify(config);

    // Clean up any replaced or removed images from Cloudinary in footer config if present
    const previousSetting = await prisma.appSetting.findUnique({
      where: { key: "FOOTER_CONFIG" },
    });
    if (previousSetting?.value) {
      const prevConfig = parseJsonOrDefault<unknown>(previousSetting.value, null);
      const prevUrls = extractCloudinaryUrls(prevConfig);
      const newUrls = extractCloudinaryUrls(config);
      const orphanedUrls = [...prevUrls].filter((url) => !newUrls.has(url));

      if (orphanedUrls.length > 0) {
        await Promise.allSettled(
          orphanedUrls.map((url) =>
            deleteFromCloudinary(url).catch((e: unknown) =>
              logger.warn("Failed to delete replaced footer image from Cloudinary", { url, error: e }),
            ),
          ),
        );
      }
    }

    await prisma.appSetting.upsert({
      where: { key: "FOOTER_CONFIG" },
      update: { value },
      create: { key: "FOOTER_CONFIG", value },
    });
    await createAuditLog({ req, action: "UPDATE_FOOTER_CONFIG", entity: "AppSetting", entityId: "FOOTER_CONFIG" });
    res.status(200).json({ message: "Footer config updated", footerConfig: config });
  } catch (err: any) {
    logger.error("updateFooterConfig error", err);
    res.status(500).json({ message: "Error updating footer config" });
  }
};

// PUT /api/admin/homepage-config/navbar  — admin only
export const updateNavbarConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body as object;
    const value = JSON.stringify(config);
    await prisma.appSetting.upsert({
      where: { key: "NAVBAR_CONFIG" },
      update: { value },
      create: { key: "NAVBAR_CONFIG", value },
    });
    await createAuditLog({ req, action: "UPDATE_NAVBAR_CONFIG", entity: "AppSetting", entityId: "NAVBAR_CONFIG" });
    res.status(200).json({ message: "Navbar config updated", navbarConfig: config });
  } catch (err: any) {
    logger.error("updateNavbarConfig error", err);
    res.status(500).json({ message: "Error updating navbar config" });
  }
};

// PUT /api/admin/homepage-config/pre-footer — admin only
export const updatePreFooterConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body as object;
    const value = JSON.stringify(config);

    // Clean up any replaced or removed images from Cloudinary in pre-footer config
    const previousSetting = await prisma.appSetting.findUnique({
      where: { key: "PRE_FOOTER_CONFIG" },
    });
    if (previousSetting?.value) {
      const prevConfig = parseJsonOrDefault<unknown>(previousSetting.value, null);
      const prevUrls = extractCloudinaryUrls(prevConfig);
      const newUrls = extractCloudinaryUrls(config);
      const orphanedUrls = [...prevUrls].filter((url) => !newUrls.has(url));

      if (orphanedUrls.length > 0) {
        await Promise.allSettled(
          orphanedUrls.map((url) =>
            deleteFromCloudinary(url).catch((e: unknown) =>
              logger.warn("Failed to delete replaced pre-footer image from Cloudinary", { url, error: e }),
            ),
          ),
        );
      }
    }

    await prisma.appSetting.upsert({
      where: { key: "PRE_FOOTER_CONFIG" },
      update: { value },
      create: { key: "PRE_FOOTER_CONFIG", value },
    });
    await createAuditLog({ req, action: "UPDATE_PRE_FOOTER_CONFIG", entity: "AppSetting", entityId: "PRE_FOOTER_CONFIG" });
    res.status(200).json({ message: "Pre-footer config updated", preFooterConfig: config });
  } catch (err: any) {
    logger.error("updatePreFooterConfig error", err);
    res.status(500).json({ message: "Error updating pre-footer config" });
  }
};

// PUT /api/admin/homepage-config/featured-categories — admin only
export const updateFeaturedCategoriesConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body as object;
    const value = JSON.stringify(config);

    await prisma.appSetting.upsert({
      where: { key: "FEATURED_CATEGORIES_CONFIG" },
      update: { value },
      create: { key: "FEATURED_CATEGORIES_CONFIG", value },
    });
    await createAuditLog({ req, action: "UPDATE_FEATURED_CATEGORIES_CONFIG", entity: "AppSetting", entityId: "FEATURED_CATEGORIES_CONFIG" });
    res.status(200).json({ message: "Featured categories config updated", featuredCategoriesConfig: config });
  } catch (err: any) {
    logger.error("updateFeaturedCategoriesConfig error", err);
    res.status(500).json({ message: "Error updating featured categories config" });
  }
};

// PUT /api/admin/homepage-config/theme  — admin only
// Stores only the chosen theme's id — the actual token values (colors/fonts) live in
// frontend/src/utils/themes.ts, so re-tuning a theme's palette later needs no data migration.
export const updateStorefrontTheme = async (req: Request, res: Response) => {
  try {
    const { themeId, customButtonBg, customButtonText } = req.body as {
      themeId: string;
      customButtonBg?: string | null;
      customButtonText?: string | null;
    };
    const sanitizeSolidHex = (hex: string | null | undefined): string | null => {
      if (!hex || typeof hex !== "string") return null;
      const trimmed = hex.trim();
      if (!trimmed || trimmed === "transparent") return null;
      if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        return trimmed;
      }
      return null;
    };
    const config: StorefrontThemeConfig = {
      themeId: themeId || "studio-minimal",
      customButtonBg: sanitizeSolidHex(customButtonBg),
      customButtonText: sanitizeSolidHex(customButtonText),
    };
    const value = JSON.stringify(config);
    await prisma.appSetting.upsert({
      where: { key: "STOREFRONT_THEME" },
      update: { value },
      create: { key: "STOREFRONT_THEME", value },
    });
    await createAuditLog({
      req,
      action: "UPDATE_STOREFRONT_THEME",
      entity: "AppSetting",
      entityId: "STOREFRONT_THEME",
      details: {
        themeId: config.themeId,
        customButtonBg: config.customButtonBg,
        customButtonText: config.customButtonText,
      },
    });
    res.status(200).json({ message: "Storefront theme updated", themeConfig: config });
  } catch (err: any) {
    logger.error("updateStorefrontTheme error", err);
    res.status(500).json({ message: "Error updating storefront theme" });
  }
};

// PUT /api/admin/homepage-config/category-shape — admin only
export const updateCategoryShape = async (req: Request, res: Response) => {
  try {
    const { categoryShape } = req.body as { categoryShape?: "square" | "circle" };
    const shape = categoryShape === "circle" ? "circle" : "square";
    await prisma.appSetting.upsert({
      where: { key: "CATEGORY_SHAPE" },
      update: { value: shape },
      create: { key: "CATEGORY_SHAPE", value: shape },
    });
    await createAuditLog({
      req,
      action: "UPDATE_CATEGORY_SHAPE",
      entity: "AppSetting",
      entityId: "CATEGORY_SHAPE",
      details: { categoryShape: shape },
    });
    res.status(200).json({ message: "Category shape updated", categoryShape: shape });
  } catch (err: any) {
    logger.error("updateCategoryShape error", err);
    res.status(500).json({ message: "Error updating category shape" });
  }
};

// PUT /api/admin/homepage-config/occasion — admin only
// Controls which festive occasion is currently active across the storefront.
// Activates festive ambient animations without overriding customer custom hero templates.
export const updateActiveOccasion = async (req: Request, res: Response) => {
  try {
    const { occasionId } = req.body as { occasionId?: string | null };
    const value = occasionId || "";
    await prisma.appSetting.upsert({
      where: { key: "ACTIVE_OCCASION" },
      update: { value },
      create: { key: "ACTIVE_OCCASION", value },
    });

    // Ensure announcement bar contains the matching festive copy for the selected occasion
    const OCCASION_ANNOUNCEMENT_MAP: Record<string, string> = {
      diwali:
        "Happy Diwali! May divine light illuminate your life with joy, peace & prosperity | Special Diwali Festive Offers & Discounts Live Now | Celebrate the Festival of Lights with Handpicked Festive Collections",
      holi:
        "Happy Holi! May your life be filled with vibrant colors, joy & laughter | Splash Into The Holi Sale — Special Festive Discounts Inside | Celebrate the Festival of Colors with Radiant Festive Styles",
      eid:
        "Eid Mubarak! May divine blessings bring peace, joy & prosperity to your home | Exclusive Eid Festive Wear & Royal Heritage Collections Live Now | Celebrate in Timeless Elegance with Special Eid Offers",
      onam:
        "Happy Onam! Celebrating the season of harvest, abundance & togetherness | Special Onam Festive Hampers & Traditional Attire Live Now | Celebrate Kerala's Grand Heritage with Handcrafted Festive Picks",
      "christmas-new-year":
        "Merry Christmas & Happy New Year! Wishing you warmth, peace & cheerful holiday spirit | Ring in the New Year in Style — Exclusive Holiday Season Markdowns | Curated Winter Collections & Thoughtful Festive Gifting Live Now",
      "wedding-season":
        "Happy Wedding Season! Curated for every celebration, ceremony & reception | The Grand Wedding Edit — Exquisite Ethnic & Bridal Collections Live Now | Celebrate Sacred Unions in Royal Splendor & Handcrafted Luxury",
      "republic-day":
        "Happy Republic Day! Proudly celebrating the vibrant spirit & sovereignty of India | Republic Day Grand Sale — Celebrate with Special Storewide Savings | Honoring Indian Heritage & Craftsmanship with Limited-Time Offers",
      valentines:
        "Happy Valentine's Day! Curated gifts & romantic styles for the ones you love | Love is in the Details — Special Valentine Gifts & Couple Edits Live Now | Celebrate Your Special Moments with Exclusive Season Markdowns",
      "sale-event":
        "Mega Sale Event is Live! Biggest markdowns & seasonal price drops | Up to 70% OFF Everything — Grab Your Favorites While Stocks Last | Limited Time Celebration Deals Across All Product Categories",
      "summer-coastal":
        "Happy Summer! Breezy seasonal styles & sun-kissed essentials | Beat the heat in pure comfort with our Coastal Collection | Refresh Your Wardrobe with Light & Airy Seasonal Picks",
    };

    if (occasionId && OCCASION_ANNOUNCEMENT_MAP[occasionId]) {
      const announcementVal = OCCASION_ANNOUNCEMENT_MAP[occasionId];
      await prisma.appSetting.upsert({
        where: { key: "ANNOUNCEMENT_BAR" },
        update: { value: announcementVal },
        create: { key: "ANNOUNCEMENT_BAR", value: announcementVal },
      });
    }

    await createAuditLog({
      req,
      action: "UPDATE_ACTIVE_OCCASION",
      entity: "AppSetting",
      entityId: "ACTIVE_OCCASION",
      details: { occasionId: occasionId || null },
    });
    res.status(200).json({ message: "Active occasion updated", activeOccasionId: occasionId || null });
  } catch (err: any) {
    logger.error("updateActiveOccasion error", err);
    res.status(500).json({ message: "Error updating active occasion" });
  }
};

// Announcement Bar / Banner Carousel / Discount Panels / Featured Collections don't have
// per-template CONTENT the way Hero/Footer do (see HERO_CONFIG/FOOTER_CONFIG above) — their
// actual content already lives elsewhere (HomeBanner rows, Product.isFeatured, the flat
// ANNOUNCEMENT_BAR text key), so a template choice here is purely which layout renders that
// same data. Each is a single AppSetting key holding just a number, defaulting to 1 (today's
// only existing layout) so nothing changes for a store that never touches this.
const SECTION_TEMPLATE_KEYS = {
  announcement: "ANNOUNCEMENT_TEMPLATE",
  carousel: "HOME_CAROUSEL_TEMPLATE",
  discount: "HOME_DISCOUNT_TEMPLATE",
  featured: "HOME_FEATURED_TEMPLATE",
} as const;
type SectionTemplateName = keyof typeof SECTION_TEMPLATE_KEYS;

const updateSectionTemplate = (section: SectionTemplateName, auditAction: string) =>
  async (req: Request, res: Response) => {
    try {
      const { activeTemplate } = req.body as { activeTemplate: number };
      if (typeof activeTemplate !== "number" || !Number.isInteger(activeTemplate) || activeTemplate < 1) {
        res.status(400).json({ message: "activeTemplate must be a positive integer" });
        return;
      }
      const key = SECTION_TEMPLATE_KEYS[section];
      const value = String(activeTemplate);
      await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
      await createAuditLog({ req, action: auditAction, entity: "AppSetting", entityId: key, details: { activeTemplate } });
      res.status(200).json({ message: "Template updated", activeTemplate });
    } catch (err: any) {
      logger.error(`update${section}Template error`, err);
      res.status(500).json({ message: "Error updating template" });
    }
  };

// PUT /api/admin/homepage-config/announcement-template — admin only
export const updateAnnouncementTemplate = updateSectionTemplate("announcement", "UPDATE_ANNOUNCEMENT_TEMPLATE");
// PUT /api/admin/homepage-config/carousel-template — admin only
export const updateCarouselTemplate = updateSectionTemplate("carousel", "UPDATE_CAROUSEL_TEMPLATE");
// PUT /api/admin/homepage-config/discount-template — admin only
export const updateDiscountTemplate = updateSectionTemplate("discount", "UPDATE_DISCOUNT_TEMPLATE");
// PUT /api/admin/homepage-config/featured-template — admin only
export const updateFeaturedTemplate = updateSectionTemplate("featured", "UPDATE_FEATURED_TEMPLATE");

// POST /api/admin/upload-image  — admin only (returns Cloudinary URL)
export const uploadAdminImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ message: "No file provided" }); return; }
    const folder = (req.body?.folder as string) || "hero";
    const previousUrl = (req.body?.previousUrl as string) || undefined;
    const url = await uploadToCloudinary(req.file.buffer, folder);

    // If an existing image was being replaced, clean it up immediately from Cloudinary
    if (previousUrl && previousUrl.includes("cloudinary.com")) {
      deleteFromCloudinary(previousUrl).catch((e: unknown) =>
        logger.warn("Failed to delete replaced admin image from Cloudinary", { url: previousUrl, error: e }),
      );
    }

    res.status(200).json({ url });
  } catch (err: any) {
    logger.error("uploadAdminImage error", err);
    res.status(500).json({ message: "Upload failed" });
  }
};

// POST /api/admin/delete-image — admin only
export const deleteAdminImage = async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") {
      res.status(400).json({ message: "No image URL provided" });
      return;
    }
    if (url.includes("cloudinary.com")) {
      await deleteFromCloudinary(url).catch((e: unknown) =>
        logger.warn("Failed to delete image from Cloudinary", { url, error: e }),
      );
    }
    res.status(200).json({ message: "Image deleted successfully" });
  } catch (err: any) {
    logger.error("deleteAdminImage error", err);
    res.status(500).json({ message: "Failed to delete image" });
  }
};

// PUT /api/admin/company-settings  — admin + super admin
export const updateCompanySettings = async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      companyTagline,
      logoUrl,
      faviconUrl,
      ogImageUrl,
      announcementBar,
      showCompanyName,
      showCompanyTagline,
      invoiceFormat,
      emailSenderName,
      seoTitleTemplate,
      seoDefaultDescription,
      seoKeywords,
      seoGoogleSiteVerification,
      seoGaMeasurementId,
      metaPixelId,
      seoRobotsExtra,
      seoOrgType,
      seoOrgAddress,
      seoOrgPhone,
      seoOrgEmail,
      seoSocialLinks,
      seoHomeTitle,
      seoHomeDescription,
      seoProductsTitle,
      seoProductsDescription,
      pageContactIntro,
      paymentQrCodeUrl,
      paymentQrEnabled,
      paymentQrUpiId,
      paymentQrAccountName,
      paymentQrInstructions,
    } = req.body as {
      companyName?: string;
      companyTagline?: string;
      logoUrl?: string;
      faviconUrl?: string;
      ogImageUrl?: string;
      paymentQrCodeUrl?: string;
      paymentQrEnabled?: boolean | string;
      paymentQrUpiId?: string;
      paymentQrAccountName?: string;
      paymentQrInstructions?: string;
      announcementBar?: string;
      showCompanyName?: boolean | string;
      showCompanyTagline?: boolean | string;
      invoiceFormat?: string;
      /** Sender display name for transactional emails (MSG91 "from" name) — falls back to env.MSG91_EMAIL_FROM_NAME when unset. */
      emailSenderName?: string;
      /** e.g. "%s | Acme Store" — the frontend substitutes %s with each page's own title. */
      seoTitleTemplate?: string;
      seoDefaultDescription?: string;
      seoKeywords?: string;
      seoGoogleSiteVerification?: string;
      seoGaMeasurementId?: string;
      metaPixelId?: string;
      /** Extra raw lines appended verbatim to the generated /robots.txt. */
      seoRobotsExtra?: string;
      /** schema.org Organization subtype, e.g. "Organization" or "ClothingStore". */
      seoOrgType?: string;
      seoOrgAddress?: string;
      seoOrgPhone?: string;
      seoOrgEmail?: string;
      /** Newline-separated profile URLs (Instagram, Facebook, etc.) for JSON-LD sameAs. */
      seoSocialLinks?: string;
      seoHomeTitle?: string;
      seoHomeDescription?: string;
      seoProductsTitle?: string;
      seoProductsDescription?: string;
      /** Short intro line shown above the address/phone/email block on the Contact Us page. */
      pageContactIntro?: string;
    };

    if (invoiceFormat !== undefined && invoiceFormat !== "A4" && invoiceFormat !== "THERMAL") {
      res.status(400).json({ message: "'invoiceFormat' must be 'A4' or 'THERMAL'" });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    let finalLogoUrl: string | undefined = logoUrl;
    let finalFaviconUrl: string | undefined = faviconUrl;

    // If a logo file was uploaded, push to Cloudinary and clean up the old one —
    // previously the old logo/favicon was silently orphaned on every replacement.
    const logoFileObj = files?.["logo"]?.[0];
    if (logoFileObj) {
      const previous = await prisma.appSetting.findUnique({ where: { key: "COMPANY_LOGO" } });
      finalLogoUrl = await uploadToCloudinary(logoFileObj.buffer, "company");
      if (previous?.value) {
        await deleteFromCloudinary(previous.value).catch((e: unknown) =>
          logger.warn("Failed to delete replaced company logo from Cloudinary", e),
        );
      }
    }

    // If a favicon file was uploaded, push to Cloudinary and clean up the old one
    const faviconFileObj = files?.["favicon"]?.[0];
    if (faviconFileObj) {
      const previous = await prisma.appSetting.findUnique({ where: { key: "COMPANY_FAVICON" } });
      finalFaviconUrl = await uploadToCloudinary(faviconFileObj.buffer, "company/favicon");
      if (previous?.value) {
        await deleteFromCloudinary(previous.value).catch((e: unknown) =>
          logger.warn("Failed to delete replaced company favicon from Cloudinary", e),
        );
      }
    }

    // If a default social-share image was uploaded, push to Cloudinary and clean up the old one
    let finalOgImageUrl: string | undefined = ogImageUrl;
    const ogImageFileObj = files?.["ogImage"]?.[0];
    if (ogImageFileObj) {
      const previous = await prisma.appSetting.findUnique({ where: { key: "SEO_DEFAULT_OG_IMAGE" } });
      finalOgImageUrl = await uploadToCloudinary(ogImageFileObj.buffer, "company/og");
      if (previous?.value) {
        await deleteFromCloudinary(previous.value).catch((e: unknown) =>
          logger.warn("Failed to delete replaced OG image from Cloudinary", e),
        );
      }
    }

    // If a payment QR code image was uploaded, push to Cloudinary and clean up the old one
    let finalQrCodeUrl: string | undefined = paymentQrCodeUrl;
    const qrCodeFileObj = files?.["qrCode"]?.[0];
    if (qrCodeFileObj) {
      const previous = await prisma.appSetting.findUnique({ where: { key: "PAYMENT_QR_CODE" } });
      finalQrCodeUrl = await uploadToCloudinary(qrCodeFileObj.buffer, "company/qr");
      if (previous?.value) {
        await deleteFromCloudinary(previous.value).catch((e: unknown) =>
          logger.warn("Failed to delete replaced payment QR code from Cloudinary", e),
        );
      }
    }

    const updates: { key: CompanyKey; value: string }[] = [];

    if (companyName !== undefined && companyName.trim() !== "") {
      updates.push({ key: "COMPANY_NAME", value: companyName.trim() });
    }
    if (companyTagline !== undefined) {
      updates.push({ key: "COMPANY_TAGLINE", value: companyTagline.trim() });
    }
    if (finalLogoUrl !== undefined) {
      updates.push({ key: "COMPANY_LOGO", value: finalLogoUrl });
    }
    if (finalFaviconUrl !== undefined) {
      updates.push({ key: "COMPANY_FAVICON", value: finalFaviconUrl });
    }
    if (showCompanyName !== undefined) {
      updates.push({ key: "SHOW_COMPANY_NAME", value: String(showCompanyName) });
    }
    if (showCompanyTagline !== undefined) {
      updates.push({ key: "SHOW_COMPANY_TAGLINE", value: String(showCompanyTagline) });
    }
    if (announcementBar !== undefined) {
      updates.push({ key: "ANNOUNCEMENT_BAR", value: announcementBar.trim() });
    }
    if (invoiceFormat !== undefined) {
      updates.push({ key: "INVOICE_FORMAT", value: invoiceFormat });
    }
    if (emailSenderName !== undefined) {
      updates.push({ key: "MSG91_EMAIL_FROM_NAME", value: emailSenderName.trim() });
    }
    if (finalQrCodeUrl !== undefined) {
      updates.push({ key: "PAYMENT_QR_CODE", value: finalQrCodeUrl });
    }
    if (paymentQrEnabled !== undefined) {
      updates.push({ key: "PAYMENT_QR_ENABLED", value: String(paymentQrEnabled) });
    }
    if (paymentQrUpiId !== undefined) {
      updates.push({ key: "PAYMENT_QR_UPI_ID", value: paymentQrUpiId.trim() });
    }
    if (paymentQrAccountName !== undefined) {
      updates.push({ key: "PAYMENT_QR_ACCOUNT_NAME", value: paymentQrAccountName.trim() });
    }
    if (paymentQrInstructions !== undefined) {
      updates.push({ key: "PAYMENT_QR_INSTRUCTIONS", value: paymentQrInstructions.trim() });
    }
    const seoTextFields: [CompanyKey, string | undefined][] = [
      ["SEO_TITLE_TEMPLATE", seoTitleTemplate],
      ["SEO_DEFAULT_DESCRIPTION", seoDefaultDescription],
      ["SEO_DEFAULT_OG_IMAGE", finalOgImageUrl],
      ["SEO_KEYWORDS", seoKeywords],
      ["SEO_GOOGLE_SITE_VERIFICATION", seoGoogleSiteVerification],
      ["SEO_GA_MEASUREMENT_ID", seoGaMeasurementId],
      ["META_PIXEL_ID", metaPixelId],
      ["SEO_ROBOTS_EXTRA", seoRobotsExtra],
      ["SEO_ORG_TYPE", seoOrgType],
      ["SEO_ORG_ADDRESS", seoOrgAddress],
      ["SEO_ORG_PHONE", seoOrgPhone],
      ["SEO_ORG_EMAIL", seoOrgEmail],
      ["SEO_SOCIAL_LINKS", seoSocialLinks],
      ["SEO_HOME_TITLE", seoHomeTitle],
      ["SEO_HOME_DESCRIPTION", seoHomeDescription],
      ["SEO_PRODUCTS_TITLE", seoProductsTitle],
      ["SEO_PRODUCTS_DESCRIPTION", seoProductsDescription],
      ["PAGE_CONTACT_INTRO", pageContactIntro],
    ];
    for (const [key, raw] of seoTextFields) {
      if (raw !== undefined) updates.push({ key, value: raw.trim() });
    }

    await Promise.all(
      updates.map((u) =>
        prisma.appSetting.upsert({
          where: { key: u.key },
          update: { value: u.value },
          create: { key: u.key, value: u.value },
        }),
      ),
    );

    // Return the freshest state
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...KEYS] } },
    });
    const settings: Record<string, string | null> = {
      COMPANY_NAME: null,
      COMPANY_TAGLINE: null,
      COMPANY_LOGO: null,
      COMPANY_FAVICON: null,
      SHOW_COMPANY_NAME: null,
      SHOW_COMPANY_TAGLINE: null,
      ANNOUNCEMENT_BAR: null,
      ANNOUNCEMENT_BAR_ENABLED: null,
      INVOICE_FORMAT: null,
      MSG91_EMAIL_FROM_NAME: null,
      SEO_TITLE_TEMPLATE: null,
      SEO_DEFAULT_DESCRIPTION: null,
      SEO_DEFAULT_OG_IMAGE: null,
      SEO_KEYWORDS: null,
      SEO_GOOGLE_SITE_VERIFICATION: null,
      SEO_GA_MEASUREMENT_ID: null,
      META_PIXEL_ID: null,
      SEO_ROBOTS_EXTRA: null,
      SEO_ORG_TYPE: null,
      SEO_ORG_ADDRESS: null,
      SEO_ORG_PHONE: null,
      SEO_ORG_EMAIL: null,
      SEO_SOCIAL_LINKS: null,
      SEO_HOME_TITLE: null,
      SEO_HOME_DESCRIPTION: null,
      SEO_PRODUCTS_TITLE: null,
      SEO_PRODUCTS_DESCRIPTION: null,
      PAGE_CONTACT_INTRO: null,
    };
    for (const row of rows) settings[row.key] = row.value;

    await createAuditLog({
      req,
      action: "UPDATE_COMPANY_SETTINGS",
      entity: "AppSetting",
      details: { changedKeys: updates.map((u) => u.key) },
    });

    invalidateHtmlBrandingCache();

    res.status(200).json({ message: "Company settings updated", settings });
  } catch (err: any) {
    logger.error("updateCompanySettings error", err);
    res.status(500).json({ message: "Error updating company settings" });
  }
};

// PATCH /api/admin/announcement-toggle  — admin + super admin
// Body: { enabled: boolean }
export const toggleAnnouncementBar = async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ message: "'enabled' must be a boolean" });
      return;
    }
    const value = enabled ? "true" : "false";
    await prisma.appSetting.upsert({
      where: { key: "ANNOUNCEMENT_BAR_ENABLED" },
      update: { value },
      create: { key: "ANNOUNCEMENT_BAR_ENABLED", value },
    });
    await createAuditLog({
      req,
      action: "TOGGLE_ANNOUNCEMENT_BAR",
      entity: "AppSetting",
      entityId: "ANNOUNCEMENT_BAR_ENABLED",
      details: { enabled },
    });
    res.status(200).json({ message: `Announcement bar ${enabled ? "enabled" : "disabled"}`, enabled });
  } catch (err: any) {
    logger.error("toggleAnnouncementBar error", err);
    res.status(500).json({ message: "Error toggling announcement bar" });
  }
};
