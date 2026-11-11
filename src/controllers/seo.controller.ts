// src/controllers/seo.controller.ts
//
// Dynamic /sitemap.xml and /robots.txt — mounted at the Express app root in server.ts
// (not under /api) since search engines require robots.txt at the domain root and
// conventionally look for sitemap.xml there too. Both are generated fresh from live
// product/category data on every request rather than written to disk, so they never
// go stale as a store's catalog changes. Building the site origin from the incoming
// request (not an env var) means this works unmodified on every per-client deployment
// — this backend already serves the built frontend from the same process/origin
// (see server.ts's express.static + catch-all), so there's no separate domain to
// configure.

import { Request, Response } from "express";
import logger from "../utils/logger";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const siteOrigin = (req: Request) => `${req.protocol}://${req.get("host")}`;

// Paths with no indexable content of their own (auth-gated, per-user, or a dead end
// for a crawler) — kept in sync with AppRoutes.tsx's customer-facing route list.
const DISALLOWED_PATHS = [
  "/cart", "/checkout", "/WishlistPage", "/myorders", "/transactions", "/profile",
  "/order-success", "/invoice", "/login", "/signup",
  "/admin-dashboard", "/staff-dashboard", "/super-admin-dashboard",
];

export const getRobotsTxt = async (req: Request, res: Response) => {
  try {
    const origin = siteOrigin(req);
    const rows = await prisma.appSetting.findMany({ where: { key: "SEO_ROBOTS_EXTRA" } });
    const extra = rows[0]?.value?.trim();

    const lines = [
      "User-agent: *",
      "Allow: /",
      ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
      "",
      `Sitemap: ${origin}/sitemap.xml`,
    ];
    if (extra) lines.push("", extra);

    res.type("text/plain").send(lines.join("\n"));
  } catch (err: any) {
    logger.error("getRobotsTxt error", err);
    // A broken robots.txt (500, or worse, no response) can make crawlers back off
    // the whole site — fail open with the static default instead of erroring.
    res.type("text/plain").send(["User-agent: *", "Allow: /"].join("\n"));
  }
};

export const getSitemap = async (req: Request, res: Response) => {
  try {
    const origin = siteOrigin(req);
    const now = new Date().toISOString();

    const [categories, products] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, select: { code: true, updatedAt: true } }),
      prisma.product.findMany({ where: { isActive: true }, select: { id: true, updatedAt: true } }),
    ]);

    const urls: { loc: string; lastmod: string; priority: string }[] = [
      { loc: `${origin}/`, lastmod: now, priority: "1.0" },
      { loc: `${origin}/products`, lastmod: now, priority: "0.9" },
      { loc: `${origin}/discounts`, lastmod: now, priority: "0.7" },
      // /terms is deliberately excluded — TermsPage.tsx sets noindex, so it shouldn't
      // be advertised for crawling either.
      { loc: `${origin}/about`, lastmod: now, priority: "0.5" },
      { loc: `${origin}/help`, lastmod: now, priority: "0.5" },
      { loc: `${origin}/contact`, lastmod: now, priority: "0.5" },
      ...categories.map((c: any) => ({
        loc: `${origin}/categories/${encodeURIComponent(c.code)}`,
        lastmod: new Date(c.updatedAt).toISOString(),
        priority: "0.8",
      })),
      ...products.map((p: any) => ({
        loc: `${origin}/products/${p.id}`,
        lastmod: new Date(p.updatedAt).toISOString(),
        priority: "0.6",
      })),
    ];

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`,
        )
        .join("\n") +
      `\n</urlset>`;

    res.type("application/xml").send(body);
  } catch (err: any) {
    logger.error("getSitemap error", err);
    res.status(500).type("text/plain").send("Error generating sitemap");
  }
};
