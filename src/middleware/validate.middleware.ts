// src/middleware/validate.middleware.ts
// Reusable Zod validation middleware.
// Usage:  router.post('/signup', validate(signupSchema), signupController)
// On failure: returns 400 with field-level error messages.
// On success: req.body is replaced with the parsed (and typed) data.

import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";

// ZodTypeAny (not AnyZodObject) so schemas wrapped in .superRefine()/.refine() — which
// return a ZodEffects, not a plain ZodObject — can be passed here too. Only .safeParse()
// is ever called, which every Zod schema type supports identically.
export const validate =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      res.status(400).json({
        message: "Validation failed",
        errors,
      });
      return;
    }

    req.body = result.data; // Replace with sanitised/coerced data
    next();
  };
