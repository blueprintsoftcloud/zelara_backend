// src/middleware/errorHandler.middleware.ts
// Central error handler — mounted LAST in server.ts.
// All controllers call next(err) instead of res.status(500) directly.
// AppError = expected/operational errors. Unknown errors get a generic 500 in production.

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import logger from "../utils/logger";
import { AppError } from "../utils/AppError";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  // Multer errors (e.g. file size exceeded)
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const isScreenshot = req.originalUrl?.includes("placeOrderQR");
      const limitMsg = isScreenshot
        ? "Payment screenshot must be less than 5 MB."
        : "Please add image below 1 MB.";
      res.status(400).json({ message: limitMsg });
      return;
    }
    res.status(400).json({ message: err.message });
    return;
  }

  // Known operational errors (e.g. throw new AppError(404, 'Product not found'))
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  // Zod validation errors from validate() middleware
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation Error",
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // MongoDB duplicate key error
  if ((err as any).code === 11000) {
    const fields = (err as any).keyValue ? Object.keys((err as any).keyValue) : undefined;
    res.status(409).json({
      message: `A record with this ${fields?.join(", ") ?? "value"} already exists.`,
    });
    return;
  }

  // Unknown / unexpected errors
  res.status(500).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Something went wrong. Please try again."
        : err.message,
  });
};
