// src/utils/logger.ts
// Centralized structured logger using Winston.
// Replaces all console.log() calls throughout the app.
// In dev: colorized readable output. In prod: JSON output + log files.
//
// warn/error entries are additionally mirrored into the `SystemLog` capped collection
// (see the MongoLogTransport below) so every existing logger.warn()/logger.error() call
// site across the app — hundreds of them, unchanged — feeds a single, queryable,
// centralized log store the Super Admin can view in-app, without a separate log-shipping
// service. Uses the native driver directly (not the app's models/mongoose.ts) to avoid a
// circular import, since this module is one of the first things loaded, before any DB
// connection exists.

import winston from "winston";
import Transport from "winston-transport";
import mongoose from "mongoose";
import { getLogContext } from "./logContext";

// Merges the current request's correlation context (see utils/logContext.ts) into
// every log entry, so no individual logger.info/warn/error() call site needs to pass
// requestId manually.
const withRequestContext = winston.format((info) => {
  const ctx = getLogContext();
  if (ctx) {
    if (ctx.requestId) info.requestId = ctx.requestId;
    if (ctx.userId) info.userId = ctx.userId;
  }
  return info;
});

class MongoLogTransport extends Transport {
  log(info: Record<string, any>, callback: () => void) {
    setImmediate(() => this.emit("logged", info));

    // Fire-and-forget — logging must never throw, block, or depend on Mongo being up.
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      mongoose.connection.db
        .collection("systemlogs")
        .insertOne({
          level: info.level,
          message: typeof info.message === "string" ? info.message : JSON.stringify(info.message),
          stack: info.stack,
          requestId: info.requestId,
          userId: info.userId,
          createdAt: new Date(),
        })
        .catch(() => {
          // Deliberately swallowed — see comment above.
        });
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    withRequestContext(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack, requestId }) => {
            const reqIdStr = typeof requestId === "string" ? requestId : undefined;
            const prefix = reqIdStr ? ` [req:${reqIdStr.slice(0, 8)}]` : "";
            return stack
              ? `${timestamp}${prefix} [${level}]: ${message}\n${stack}`
              : `${timestamp}${prefix} [${level}]: ${message}`;
          }),
        ),
  ),
  transports: [
    new winston.transports.Console(),
    new MongoLogTransport({ level: "warn" }),
    ...(process.env.NODE_ENV === "production"
      ? [
          new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
          }),
          new winston.transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
});

export default logger;
