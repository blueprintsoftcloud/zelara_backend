// src/config/storage.ts
//
// Unified storage layer supporting:
// 1. Cloudflare R2 (recommended: 10GB free, $0 egress, pay-as-you-go ~₹1.25/GB)
// 2. Cloudinary (legacy support for existing deployments)
//
// Automatic WebP compression via sharp is applied before pushing to R2,
// giving 60-80% smaller file sizes and instant storefront loading.

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";
import logger from "../utils/logger";

// ── Cloudinary Initialization (if configured) ──────────────────────────────
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

// ── Cloudflare R2 Initialization ───────────────────────────────────────────
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "Cloudflare R2 is selected as STORAGE_PROVIDER, but R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY is missing in .env"
    );
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return r2Client;
}

/**
 * Normalizes public domain by stripping trailing slashes.
 */
function getPublicDomain(): string {
  const domain = env.R2_PUBLIC_DOMAIN.trim();
  if (!domain) {
    throw new Error(
      "R2_PUBLIC_DOMAIN is not set in .env (e.g. https://media.yourdomain.com or https://pub-xxx.r2.dev)"
    );
  }
  return domain.replace(/\/+$/, "");
}

/**
 * Checks if buffer is an SVG file to avoid rasterizing vector graphics.
 */
function isSvgBuffer(buffer: Buffer): boolean {
  const head = buffer.slice(0, 100).toString("utf8").trim().toLowerCase();
  return head.includes("<svg") || head.includes("<?xml");
}

/**
 * Optimizes an image buffer using sharp:
 * - Automatically auto-rotates based on EXIF (fixes sideways phone photos)
 * - Converts to modern WebP with quality 85
 * - Keeps raw buffer for SVG vectors
 */
export async function optimizeImageBuffer(
  buffer: Buffer
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  if (isSvgBuffer(buffer)) {
    return { buffer, contentType: "image/svg+xml", extension: "svg" };
  }

  try {
    const webpBuffer = await sharp(buffer)
      .rotate() // auto-orient photos taken with phone cameras
      .webp({ quality: 85, effort: 4 })
      .toBuffer();

    return {
      buffer: webpBuffer,
      contentType: "image/webp",
      extension: "webp",
    };
  } catch (err) {
    // If sharp fails (corrupted or unrecognized format), return original buffer
    logger.warn(`sharp optimization skipped for image: ${(err as Error).message}`);
    return {
      buffer,
      contentType: "application/octet-stream",
      extension: "bin",
    };
  }
}

/**
 * Inserts Cloudinary's automatic-format + quality delivery optimization
 */
export const withAutoOptimization = (secureUrl: string): string =>
  secureUrl.includes("/upload/f_auto,q_auto/")
    ? secureUrl
    : secureUrl.replace("/upload/", "/upload/f_auto,q_auto/");

/**
 * Upload an image buffer to Cloudflare R2
 */
async function uploadToR2(buffer: Buffer, folder: string): Promise<string> {
  const s3 = getR2Client();
  const bucket = env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME is not set in .env");
  }

  const { buffer: processedBuffer, contentType, extension } = await optimizeImageBuffer(buffer);

  // Clean folder path (remove leading/trailing slashes)
  const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now();
  const key = `${cleanFolder}/${timestamp}_${randomSuffix}.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: processedBuffer,
      ContentType: contentType,
      // Aggressive caching on Cloudflare CDN (URL is uniquely hashed)
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${getPublicDomain()}/${key}`;
}

/**
 * Upload an image buffer to Cloudinary (legacy fallback)
 */
async function uploadToCloudinaryLegacy(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "auto" }, (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error("Cloudinary upload failed"));
        }
        resolve(withAutoOptimization(result.secure_url));
      })
      .end(buffer);
  });
}

/**
 * Universal Image Upload
 * Automatically routes to Cloudflare R2 or Cloudinary based on STORAGE_PROVIDER.
 */
export async function uploadImage(buffer: Buffer, folder: string): Promise<string> {
  if (env.STORAGE_PROVIDER === "r2") {
    return uploadToR2(buffer, folder);
  }
  return uploadToCloudinaryLegacy(buffer, folder);
}

/**
 * Universal Image Deletion
 * Automatically detects whether the asset is on Cloudinary or Cloudflare R2
 * and safely deletes it from the respective storage.
 */
export async function deleteImage(urlOrPublicId: string): Promise<void> {
  if (!urlOrPublicId || typeof urlOrPublicId !== "string") return;

  try {
    // 1. Cloudinary asset detection
    if (urlOrPublicId.includes("cloudinary.com") || (!urlOrPublicId.startsWith("http") && !urlOrPublicId.includes("/"))) {
      let publicId = urlOrPublicId;
      if (urlOrPublicId.includes("cloudinary.com")) {
        const match = urlOrPublicId.match(/\/upload\/(?:[^/]+\/)?v\d+\/(.+)$/);
        publicId = match
          ? match[1].replace(/\.[^/.]+$/, "")
          : urlOrPublicId.split("/").slice(-2).join("/").replace(/\.[^/.]+$/, "");
      }
      await cloudinary.uploader.destroy(publicId);
      return;
    }

    // 2. Cloudflare R2 asset detection
    if (env.R2_BUCKET_NAME) {
      let key = urlOrPublicId;
      if (urlOrPublicId.startsWith("http://") || urlOrPublicId.startsWith("https://")) {
        try {
          const parsed = new URL(urlOrPublicId);
          key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
        } catch {
          // If URL parsing fails, extract path after domain
          key = urlOrPublicId.replace(/^https?:\/\/[^/]+\//, "");
        }
      } else {
        key = urlOrPublicId.replace(/^\/+/, "");
      }

      if (key) {
        const s3 = getR2Client();
        await s3.send(
          new DeleteObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
          })
        );
      }
    }
  } catch (err) {
    // Log deletion error but don't crash caller (e.g. when asset was already deleted)
    logger.warn(`Failed to delete image (${urlOrPublicId}): ${(err as Error).message}`);
  }
}

// ── Backward-Compatible Drop-in Aliases ─────────────────────────────────────
// All existing controllers import `uploadToCloudinary` and `deleteFromCloudinary`.
// By aliasing them to the unified engine, 100% of existing controllers continue
// working without having to modify a single line of controller code!
export const uploadToCloudinary = uploadImage;
export const deleteFromCloudinary = deleteImage;
export default {
  uploadImage,
  deleteImage,
  uploadToCloudinary,
  deleteFromCloudinary,
  optimizeImageBuffer,
  withAutoOptimization,
};

