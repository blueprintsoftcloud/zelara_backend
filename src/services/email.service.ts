// src/services/email.service.ts
// Sends transactional email via MSG91's template-based Email API (see
// config/msg91Email.ts), in-process, fire-and-forget. Call sites `await` this
// function, but the await resolves near-instantly — the retry loop below runs
// in the background via `void withRetry(...)`, NOT inside the awaited call.
// This matters: several call sites (e.g. auth.controller.ts's OTP login) have
// no inner try/catch, so if this function actually blocked on retries, a
// slow/flaky MSG91 send would surface as a request timeout instead of a
// background retry.

import { AppSetting } from "../models/mongoose";
import { sendMsg91TemplateEmail, Msg91TemplateEmailData } from "../config/msg91Email";
import { withRetry } from "../utils/retry";
import { env } from "../config/env";
import logger from "../utils/logger";

export type EmailJobData = Msg91TemplateEmailData;

export const sendEmail = async (data: EmailJobData): Promise<void> => {
  // One shared MSG91 account/domain/auth key sends every email, but the business
  // should still control what name they read as coming from (see the
  // MSG91_EMAIL_FROM_NAME AppSetting managed on the Company Settings page) —
  // falls back to the env default if it's never been set.
  let fromName: string | undefined;
  try {
    const setting = await AppSetting.findOne({ key: "MSG91_EMAIL_FROM_NAME" });
    fromName = setting?.value || undefined;
  } catch (err) {
    logger.warn("[email] failed to resolve sender name, using default", err);
  }

  // Also exposed to every template as {{COMPANY_NAME}} — MSG91's template review
  // rejects bodies with no sender/brand identification, and this is the same
  // business name already used for the envelope "from" display name.
  const resolvedFromName = data.fromName ?? fromName ?? env.MSG91_EMAIL_FROM_NAME;

  void withRetry(
    () =>
      sendMsg91TemplateEmail({
        ...data,
        fromName: resolvedFromName,
        variables: { COMPANY_NAME: resolvedFromName, ...data.variables },
      }),
    { attempts: 3, baseDelayMs: 5000, backoff: "exponential" },
  )
    .then(() => logger.info(`[email] sent → ${data.to}`))
    .catch((err) => logger.error(`[email] all attempts failed for ${data.to}`, err));
};
