// src/utils/sanitizeHtml.ts
//
// Strips dangerous HTML (script tags, event handler attributes, javascript: URLs) from
// user-supplied rich text before it's persisted. Currently used for Product.description,
// which the frontend renders via dangerouslySetInnerHTML (cart/ProductDetailPage.tsx) —
// previously stored and rendered completely unsanitized, a live stored-XSS path any
// admin/staff account (or anyone who compromises one) could use against every visitor
// viewing that product page.
//
// Sanitizing on write (here) AND on render (frontend/src/utils/sanitizeHtml.ts) is
// deliberate defense in depth: this stops it from ever reaching the database, the
// frontend stops it from ever reaching the DOM even if some other write path
// (a script, a future admin import feature, direct DB access) reintroduces raw HTML.

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "span", "div", "a",
];

export const sanitizeRichText = (input: string | null | undefined): string | null | undefined => {
  if (input == null) return input;
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
};
