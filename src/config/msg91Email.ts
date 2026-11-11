// src/config/msg91Email.ts
// MSG91 Email API v5 client — template-based transactional email, replacing the
// previous nodemailer/Gmail SMTP transport (see git history on config/mailer.ts).
//
// VERIFY BEFORE GOING LIVE: this request shape follows MSG91's documented v5
// Email API pattern (POST /api/v5/email/send, `authkey` header, a `recipients`
// array with per-recipient `to`/`variables`, top-level `from`/`domain`/
// `template_id`). MSG91's technical reference (docs.msg91.com/email/send-email)
// is a JS-rendered page that couldn't be fetched/verified while writing this.
// Once a template exists in MSG91's dashboard, its "API Integration" tab shows a
// ready-made snippet with your real template_id/domain filled in — cross-check
// the field names below against that snippet before relying on this in production.

import { env } from "./env";
import logger from "../utils/logger";

const MSG91_EMAIL_SEND_URL = "https://api.msg91.com/api/v5/email/send";

export interface Msg91TemplateEmailData {
  to: string;
  /** Defaults to the email address itself if omitted. */
  toName?: string;
  templateId: string;
  /** Must match the {{variable}} placeholders defined in the MSG91 dashboard template. */
  variables: Record<string, string>;
  /**
   * Per-tenant sender display name (e.g. that client's own business name),
   * resolved by services/email.service.ts from the tenant's MSG91_EMAIL_FROM_NAME
   * AppSetting. Falls back to env.MSG91_EMAIL_FROM_NAME when unset — the shared
   * MSG91 account/domain/auth key stay the same for every tenant either way.
   */
  fromName?: string;
}

export const sendMsg91TemplateEmail = async (data: Msg91TemplateEmailData): Promise<void> => {
  if (!env.MSG91_AUTH_KEY || !data.templateId || !env.MSG91_EMAIL_DOMAIN || !env.MSG91_EMAIL_FROM) {
    logger.warn(`[msg91-email] not configured — skipped send to ${data.to}`, {
      hasAuthKey: Boolean(env.MSG91_AUTH_KEY),
      hasTemplateId: Boolean(data.templateId),
      hasDomain: Boolean(env.MSG91_EMAIL_DOMAIN),
      hasFrom: Boolean(env.MSG91_EMAIL_FROM),
    });
    return;
  }

  const res = await fetch(MSG91_EMAIL_SEND_URL, {
    method: "POST",
    headers: {
      authkey: env.MSG91_AUTH_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipients: [
        {
          to: [{ email: data.to, name: data.toName ?? data.to }],
          variables: data.variables,
        },
      ],
      from: {
        email: env.MSG91_EMAIL_FROM,
        name: data.fromName || env.MSG91_EMAIL_FROM_NAME,
      },
      domain: env.MSG91_EMAIL_DOMAIN,
      template_id: data.templateId,
    }),
  });

  const rawText = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawText); } catch { body = { raw: rawText }; }

  if (!res.ok) {
    throw new Error(`MSG91 email send failed (${res.status}): ${JSON.stringify(body)}`);
  }
};
