// src/monitoring/healthMonitor.ts
// Polls system health on an interval and alerts Super Admins — in-app notification +
// email — only on a STATUS TRANSITION (healthy → unhealthy/degraded, or back to
// healthy), not on every poll. Edge-triggered so a prolonged outage sends one alert and
// one recovery notice, not a new alert every 5 minutes for as long as it's down.

import { computeSystemHealth, type HealthStatus } from "./health";
import { getSuperAdminRecipients } from "../utils/notificationRecipients";
import { sendNotification } from "../services/notification.service";
import { sendEmail } from "../services/email.service";
import { healthAlertEmailPayload } from "../config/mailer";
import { env } from "../config/env";
import logger from "../utils/logger";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastStatus: HealthStatus = "healthy";
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const alertSuperAdmins = async (subject: string, message: string) => {
  try {
    const recipients = await getSuperAdminRecipients();
    for (const recipientId of recipients) {
      await sendNotification({ message, type: "GENERAL", recipientId });
    }
    await sendEmail({
      to: env.EMAIL_USER,
      ...healthAlertEmailPayload(`[System Alert] ${subject}`, message),
    });
  } catch (err) {
    logger.error("healthMonitor: failed to send alert", err);
  }
};

const checkOnce = async () => {
  try {
    const health = await computeSystemHealth();

    if (health.status !== lastStatus) {
      if (health.status !== "healthy") {
        const summary = health.issues.join("; ") || "Unknown issue";
        logger.warn(`System health transitioned to ${health.status}: ${summary}`);
        await alertSuperAdmins(
          `System status is now ${health.status.toUpperCase()}`,
          `Issues detected: ${summary}`,
        );
      } else {
        logger.info(`System health recovered (was ${lastStatus}, now healthy)`);
        await alertSuperAdmins("System recovered", "All systems are healthy again.");
      }
      lastStatus = health.status;
    }
  } catch (err) {
    logger.error("healthMonitor: check failed", err);
  }
};

export const startHealthMonitor = (): void => {
  if (intervalHandle) return;
  intervalHandle = setInterval(checkOnce, CHECK_INTERVAL_MS);
  // Run one check shortly after boot too, so a bad deploy is caught quickly rather than
  // waiting a full interval — not immediately, to give Mongo a moment to settle.
  setTimeout(checkOnce, 15_000);
  logger.info(`✅ Health monitor started (checking every ${CHECK_INTERVAL_MS / 60000} min)`);
};

export const stopHealthMonitor = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
