// src/monitoring/health.ts
// Pure health-computation logic, shared by the HTTP health-check endpoint
// (systemHealth.controller.ts) and the periodic alert monitor (healthMonitor.ts) —
// one source of truth for what "healthy" means.

import mongoose from "mongoose";

export type HealthStatus = "healthy" | "unhealthy";

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  memory: { rssMB: number; heapUsedMB: number; heapTotalMB: number };
  database: { status: "connected" | "connecting" | "disconnected"; readyState: number };
  /** Reasons the status isn't "healthy" — empty when healthy. */
  issues: string[];
}

const dbStatus = (readyState: number): "connected" | "connecting" | "disconnected" => {
  if (readyState === 1) return "connected";
  if (readyState === 2) return "connecting";
  return "disconnected";
};

export const computeSystemHealth = async (): Promise<SystemHealth> => {
  const issues: string[] = [];

  const readyState = mongoose.connection.readyState;
  const dbState = dbStatus(readyState);
  if (dbState !== "connected") issues.push(`MongoDB is ${dbState}`);

  const mem = process.memoryUsage();

  const status: HealthStatus = dbState !== "connected" ? "unhealthy" : "healthy";

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    },
    database: { status: dbState, readyState },
    issues,
  };
};
