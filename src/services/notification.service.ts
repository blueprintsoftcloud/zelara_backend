// src/services/notification.service.ts
// Creates the Notification document and pushes it over the recipient's private socket
// room, in-process and fire-and-forget (see email.service.ts for why `await` on the
// exported function must resolve near-instantly rather than blocking on the retry loop).
//
// Needs the live Socket.IO server instance to emit — call initNotificationService(io)
// once at boot (server.ts, right after initSocket(io)) before any notification is sent.

import { Server } from "socket.io";
import { Notification } from "../models/mongoose";
import type { NotificationType } from "../models/mongoose";
import { withRetry } from "../utils/retry";
import logger from "../utils/logger";

export interface NotificationJobData {
  message: string;
  orderId?: string;
  type: NotificationType;
  /** Omit for system-generated notifications (e.g. LOW_STOCK) with no human actor. */
  triggeredById?: string;
  recipientId: string;
}

let ioInstance: Server | null = null;

export const initNotificationService = (io: Server): void => {
  ioInstance = io;
};

export const sendNotification = async (data: NotificationJobData): Promise<void> => {
  void withRetry(
    async () => {
      const doc = await Notification.create({
        message: data.message,
        orderId: data.orderId,
        type: data.type,
        triggeredById: data.triggeredById,
        recipientId: data.recipientId,
      });

      if (ioInstance) {
        const payload = { ...doc.toObject(), id: doc._id.toString() };
        ioInstance.to(data.recipientId).emit("new-notification", payload);
      } else {
        logger.warn("notification.service: io not initialized yet, socket emit skipped");
      }
    },
    { attempts: 3, baseDelayMs: 2000, backoff: "fixed" },
  ).catch((err) => logger.error(`[notification] failed for recipient ${data.recipientId}`, err));
};
