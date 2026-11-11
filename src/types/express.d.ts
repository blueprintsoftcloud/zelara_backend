// src/types/express.d.ts
// Augments Express's Request type so req.user is typed everywhere in the app.
// This file is picked up automatically by TypeScript via the tsconfig include.

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN" | "STAFF";
      };
      /** Set by requestId.middleware.ts — correlates one request across all its log lines. */
      requestId?: string;
    }
  }
}

export {};
