// src/config/mailer.ts
// OTP generation + MSG91 template-payload builders for every transactional email
// this app sends. These no longer render HTML directly (that now lives as
// templates inside MSG91's dashboard) — each function below just returns the
// { templateId, variables } shape that services/email.service.ts's sendEmail()
// expects, ready to spread straight into a sendEmail({ to, ...xEmailPayload(...) })
// call. Keep each function's `variables` keys in sync with the {{placeholders}}
// used in the matching MSG91_TEMPLATE_* dashboard template (see config/env.ts).
// Every template also has {{COMPANY_NAME}} available for free — email.service.ts's
// sendEmail() injects it on every send (see the resolvedFromName merge there), so
// don't redeclare it in any of the payloads below.

import crypto from "crypto";
import { env } from "./env";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;

export const generateOtpCode = (): string => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return crypto.randomInt(min, max).toString();
};

// ── OTP — shared by signup verification, login, password reset, and email-change ──
// Template needs: {{OTP}}, {{EXPIRY_MINUTES}}, {{PURPOSE}} (a short phrase like
// "verify your account" / "log in" / "reset your password" describing what the
// code is for, since one template covers all four flows).
export const otpEmailPayload = (otp: string, purpose: string) => ({
  templateId: env.MSG91_TEMPLATE_OTP,
  variables: {
    OTP: otp,
    EXPIRY_MINUTES: String(OTP_EXPIRY_MINUTES),
    PURPOSE: purpose,
  },
});

// ── Order confirmation — shared by online, POD, and admin-placed orders ──
// Template needs: {{ORDER_ID}}, {{CUSTOMER_NAME}}, {{TOTAL_AMOUNT}},
// {{PAYMENT_METHOD_LABEL}}, {{PAYMENT_STATUS_MESSAGE}}.
export const orderConfirmationEmailPayload = (
  orderShortId: string,
  customerName: string,
  totalAmount: string,
  paymentMethod: "ONLINE" | "POD",
) => ({
  templateId: env.MSG91_TEMPLATE_ORDER_CONFIRMATION,
  variables: {
    ORDER_ID: orderShortId,
    CUSTOMER_NAME: customerName,
    TOTAL_AMOUNT: totalAmount,
    PAYMENT_METHOD_LABEL: paymentMethod === "POD" ? "Pay on Delivery" : "Online Payment",
    PAYMENT_STATUS_MESSAGE: paymentMethod === "POD" ? "You will pay on delivery." : "Your payment has been received.",
  },
});

/** Minimal HTML-escaping for values interpolated into SHIPPING_BLOCK_HTML below —
 * courier name/tracking id/note are admin-entered free text, not fixed enum labels
 * like the other variables in this file, so they need escaping before going into
 * a raw HTML string we build ourselves. */
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Order status update ──
// Template needs: {{ORDER_ID}}, {{CUSTOMER_NAME}}, {{STATUS_LABEL}},
// {{STATUS_COLOR}}, {{STATUS_MESSAGE}}, {{SHIPPING_BLOCK_HTML}}.
//
// MSG91's basic template editor doesn't support conditional blocks ({{#if}} showed
// up as literal text, not evaluated) — so instead of asking the template to decide
// whether to show shipping details, the decision and the whole rendered HTML block
// are built HERE, in code we can actually verify, and handed over as one variable.
// The template just drops {{SHIPPING_BLOCK_HTML}} in place with no wrapper of its
// own; it's an empty string when there's nothing to show, so nothing renders.
export const orderStatusEmailPayload = (
  orderShortId: string,
  status: string,
  customerName: string,
  shippingInfo?: { partnerName?: string; trackingId?: string; trackingLink?: string; note?: string },
) => {
  const statusConfig: Record<string, { label: string; color: string; message: string }> = {
    PROCESSING: { label: "Processing", color: "#6366f1", message: "Your order is being processed. We'll update you soon." },
    CONFIRMED:  { label: "Confirmed",  color: "#10b981", message: "Great news! Your order has been confirmed and will be prepared shortly." },
    SHIPPED:    { label: "Shipped",    color: "#3b82f6", message: "Your order is on its way! Expect delivery soon." },
    DELIVERED:  { label: "Delivered",  color: "#22c55e", message: "Your order has been delivered. We hope you love it!" },
    CANCELLED:  { label: "Cancelled",  color: "#ef4444", message: "Your order has been cancelled. If you have any questions, please contact support." },
    RETURNED:   { label: "Returned to Origin", color: "#9333ea", message: "Your order could not be delivered by the courier and has been returned to origin. If you need assistance or a refund, please contact support." },
  };

  const cfg = statusConfig[status] ?? {
    label: status,
    color: "#6b7280",
    message: "Your order status has been updated.",
  };

  // Manual/self-delivery orders may have neither a courier nor a tracking ID —
  // render nothing rather than an empty/broken-looking box.
  const hasShippingContent = Boolean(shippingInfo?.partnerName || shippingInfo?.trackingId || shippingInfo?.note);
  const showShipping = status === "SHIPPED" && Boolean(shippingInfo) && hasShippingContent;

  const shippingBlockHtml = showShipping
    ? `<div style="margin:24px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:13px;color:#1e40af;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Shipment Details</p>
        ${shippingInfo?.partnerName ? `<p style="margin:4px 0;font-size:14px;color:#1f2937;"><strong>Courier:</strong> ${escapeHtml(shippingInfo.partnerName)}</p>` : ""}
        ${shippingInfo?.trackingId ? `<p style="margin:4px 0;font-size:14px;color:#1f2937;"><strong>Tracking ID:</strong> ${escapeHtml(shippingInfo.trackingId)}</p>` : ""}
        ${shippingInfo?.note ? `<p style="margin:4px 0;font-size:14px;color:#1f2937;"><strong>Note:</strong> ${escapeHtml(shippingInfo.note)}</p>` : ""}
        ${shippingInfo?.trackingLink ? `<a href="${escapeHtml(shippingInfo.trackingLink)}" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Track Your Package</a>` : ""}
      </div>`
    : "";

  return {
    templateId: env.MSG91_TEMPLATE_ORDER_STATUS,
    variables: {
      ORDER_ID: orderShortId,
      CUSTOMER_NAME: customerName,
      STATUS_LABEL: cfg.label,
      STATUS_COLOR: cfg.color,
      STATUS_MESSAGE: cfg.message,
      SHIPPING_BLOCK_HTML: shippingBlockHtml,
    },
  };
};

// ── System health alert (ops-only, sent to env.EMAIL_USER) ──
// Template needs: {{ALERT_SUBJECT}}, {{ALERT_MESSAGE}}.
export const healthAlertEmailPayload = (subject: string, message: string) => ({
  templateId: env.MSG91_TEMPLATE_HEALTH_ALERT,
  variables: {
    ALERT_SUBJECT: subject,
    ALERT_MESSAGE: message,
  },
});
